import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CommandResult, CommandRunner, ServiceConfig, ServiceManager } from "../types.js";
import {
  FIREWALL_MDNS,
  FIREWALL_TCP,
  TASK_NAME,
  firewallAddArgs,
  firewallRemoveArgs,
  firewallRules,
} from "./firewall.js";
import {
  LAUNCHER_FILE,
  TASK_STATE_SCRIPT,
  psQuote,
  serviceStatusFromState,
  windowsLauncherBytes,
  windowsTaskXml,
  windowsTaskXmlBytes,
} from "./builders.js";
import { currentUserSid, windowsSecurity } from "./security.js";

const POWERSHELL = "powershell.exe";

/** `ERROR_CANCELLED` (1223) from a dismissed UAC prompt. */
export const ELEVATION_CANCELLED = 1223;

/**
 * Windows caps a process command line at 32767 characters. The wrapper carries
 * the base64 script plus PowerShell arguments, so fail closed well below it
 * instead of letting CreateProcess truncate the elevation.
 */
export const MAX_ELEVATED_COMMAND_LENGTH = 30_000;

/** Safe, typed service failure. Messages never include config content or a token. */
export class WindowsServiceError extends Error {
  readonly exitCode: number;
  readonly cancelled: boolean;

  constructor(message: string, options: { exitCode: number; cancelled?: boolean; cause?: unknown }) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "WindowsServiceError";
    this.exitCode = options.exitCode;
    this.cancelled = options.cancelled ?? false;
  }
}

export type WindowsDeps = {
  run: CommandRunner;
  elevated: (script: string) => Promise<CommandResult>;
  protectLogs: (home: string) => void;
  protectFile: (path: string) => void;
};

const defaultRun: CommandRunner = (command, args) => {
  try {
    const stdout = execFileSync(command, args, { encoding: "utf8", stdio: "pipe", windowsHide: true });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const failed = error as { status?: number | null; stdout?: string | Buffer; stderr?: string | Buffer };
    return {
      status: typeof failed.status === "number" ? failed.status : 1,
      stdout: failed.stdout?.toString() ?? "",
      stderr: failed.stderr?.toString() ?? "",
    };
  }
};

const netsh = (args: string[]): string => `& netsh.exe ${args.map(psQuote).join(" ")};`;

const removeRules = (): string[] => [FIREWALL_TCP, FIREWALL_MDNS].map((name) => netsh(firewallRemoveArgs(name)));

/**
 * Token-free elevated install spec: firewall rules, task XML, registration,
 * start. The XML travels as base64 inside the encoded command; it is written
 * to `$env:TEMP` only for `schtasks /XML` and removed before the script ends.
 */
export function windowsInstallScript(cfg: ServiceConfig, sid: string): string {
  const xml64 = windowsTaskXmlBytes(windowsTaskXml(cfg, sid)).toString("base64");
  const ruleSteps = firewallRules(cfg.port, cfg.nodePath).flatMap((rule) => [
    // A stale delete may legitimately fail when no rule exists; a current add may not.
    netsh(firewallRemoveArgs(rule.name)),
    netsh(firewallAddArgs(rule)),
    "if ($LASTEXITCODE -ne 0) { throw 'firewall rule update failed' }",
  ]);
  const cleanup = [
    ...removeRules(),
    `& schtasks.exe /Delete /TN ${psQuote(TASK_NAME)} /F 2>$null;`,
  ].join(" ");
  return [
    "$ErrorActionPreference = 'Stop';",
    "$xmlPath = Join-Path $env:TEMP ('pocketpet-task-' + [guid]::NewGuid().ToString('N') + '.xml');",
    `[IO.File]::WriteAllBytes($xmlPath, [Convert]::FromBase64String(${psQuote(xml64)}));`,
    "try {",
    ...ruleSteps,
    `& schtasks.exe /Create /TN ${psQuote(TASK_NAME)} /XML $xmlPath /F;`,
    "if ($LASTEXITCODE -ne 0) { throw 'task registration failed' }",
    "Remove-Item -LiteralPath $xmlPath -Force -ErrorAction SilentlyContinue;",
    `& schtasks.exe /Run /TN ${psQuote(TASK_NAME)};`,
    "if ($LASTEXITCODE -ne 0) { throw 'task start failed' }",
    `} catch { ${cleanup} Remove-Item -LiteralPath $xmlPath -Force -ErrorAction SilentlyContinue; throw }`,
  ].join(" ");
}

/** One elevation: end and delete the task, then remove both firewall rules. */
export function windowsUninstallScript(): string {
  return [
    "$ErrorActionPreference = 'Stop';",
    `& schtasks.exe /End /TN ${psQuote(TASK_NAME)} 2>$null;`,
    `& schtasks.exe /Delete /TN ${psQuote(TASK_NAME)} /F 2>$null;`,
    ...removeRules(),
  ].join(" ");
}

function assertCompiledCli(cfg: ServiceConfig): void {
  if (cfg.cliPath.endsWith(".ts") || !existsSync(cfg.cliPath)) {
    throw new Error(`refusing to install service from ${cfg.cliPath}: build and run the compiled CLI (dist/cli.js)`);
  }
  if (!existsSync(cfg.nodePath)) {
    throw new Error("refusing to install service: the Node executable was not found; reinstall Node and retry");
  }
  // Validate the port before writing any file or prompting for elevation.
  firewallRules(cfg.port, cfg.nodePath);
}

function launcherPath(cfg: ServiceConfig): string {
  return join(cfg.home, LAUNCHER_FILE);
}

function assertElevated(result: CommandResult, action: "install" | "uninstall"): void {
  if (result.status === ELEVATION_CANCELLED) {
    throw new WindowsServiceError(`${action} was cancelled at the elevation prompt`, {
      exitCode: result.status,
      cancelled: true,
    });
  }
  if (result.status !== 0) {
    throw new WindowsServiceError(`elevated ${action} failed (exit ${result.status})`, { exitCode: result.status });
  }
}

/**
 * Install transaction: validate, protect logs, write the launcher, then run one
 * elevated helper that adds firewall rules, registers the task, and starts it.
 * The PowerShell `catch` rolls back rules/task inside the same elevation; the
 * un-elevated catch removes only the launcher.
 */
export async function installWindowsService(cfg: ServiceConfig, deps: WindowsDeps): Promise<void> {
  assertCompiledCli(cfg);
  const logs = join(cfg.home, "logs");
  mkdirSync(logs, { recursive: true, mode: 0o700 });
  deps.protectLogs(cfg.home);

  const launcher = launcherPath(cfg);
  try {
    writeFileSync(launcher, windowsLauncherBytes(cfg), { mode: 0o600 });
    deps.protectFile(launcher);
    const sid = currentUserSid(deps.run);
    const result = await deps.elevated(windowsInstallScript(cfg, sid));
    assertElevated(result, "install");
  } catch (error) {
    rmSync(launcher, { force: true });
    throw error;
  }
}

/** One elevation for task removal and both rules; the launcher is removed last. */
export async function uninstallWindowsService(cfg: ServiceConfig, deps: WindowsDeps): Promise<void> {
  const result = await deps.elevated(windowsUninstallScript());
  assertElevated(result, "uninstall");
  rmSync(launcherPath(cfg), { force: true });
}

export function createWindowsService(deps: WindowsDeps): ServiceManager {
  return {
    label: TASK_NAME,
    install: (cfg) => installWindowsService(cfg, deps),
    uninstall: (cfg) => uninstallWindowsService(cfg, deps),
    status: async () => {
      const result = deps.run(POWERSHELL, ["-NoProfile", "-NonInteractive", "-Command", TASK_STATE_SCRIPT]);
      if (result.status !== 0) return { installed: false, running: false };
      return serviceStatusFromState(result.stdout);
    },
  };
}

/**
 * Outer UAC boundary: run the token-free script in a second, elevated
 * PowerShell and wait for its exit code. A dismissed prompt is distinguished
 * with `ELEVATION_CANCELLED` so callers can report cancellation without
 * guessing from localized shell text.
 */
export function elevatedWrapperScript(script: string): string {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return [
    "$ErrorActionPreference = 'Stop';",
    "try {",
    `$p = Start-Process -FilePath '${POWERSHELL}' -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}' -Verb RunAs -Wait -PassThru;`,
    "exit $p.ExitCode;",
    "} catch {",
    "$native = 0;",
    "if ($_.Exception -is [System.ComponentModel.Win32Exception]) { $native = $_.Exception.NativeErrorCode }",
    "elseif ($_.Exception.InnerException -is [System.ComponentModel.Win32Exception]) { $native = $_.Exception.InnerException.NativeErrorCode }",
    "elseif ($_.Exception.HResult -eq -2147023673) { $native = 1223 }",
    "elseif ($_.Exception.InnerException.HResult -eq -2147023673) { $native = 1223 }",
    `if ($native -eq ${ELEVATION_CANCELLED}) { exit ${ELEVATION_CANCELLED} };`,
    "exit 1;",
    "}",
  ].join(" ");
}

export function defaultElevatedRunner(script: string): Promise<CommandResult> {
  const wrapper = elevatedWrapperScript(script);
  if (wrapper.length > MAX_ELEVATED_COMMAND_LENGTH) {
    return Promise.reject(
      new WindowsServiceError(
        "the elevated command exceeds the Windows command line limit; move PocketPet to a shorter path and retry",
        { exitCode: 1 },
      ),
    );
  }
  return new Promise((resolve) => {
    execFile(
      POWERSHELL,
      ["-NoProfile", "-NonInteractive", "-Command", wrapper],
      { encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ status: 0, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
          return;
        }
        const failed = error as { code?: number | string; stdout?: string | Buffer; stderr?: string | Buffer };
        resolve({
          status: typeof failed.code === "number" ? failed.code : 1,
          stdout: failed.stdout?.toString() ?? String(stdout ?? ""),
          stderr: failed.stderr?.toString() ?? String(stderr ?? ""),
        });
      },
    );
  });
}

/** Production adapter: current-user ACL, real PowerShell, one UAC per action. */
export const windowsService: ServiceManager = createWindowsService({
  run: defaultRun,
  elevated: defaultElevatedRunner,
  protectLogs: (home) => windowsSecurity.protectLogs(home),
  protectFile: (path) => windowsSecurity.protectFile(path),
});
