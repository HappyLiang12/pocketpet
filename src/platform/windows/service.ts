import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
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
 * Stop the task through the ScheduledTasks cmdlet and wait briefly until it is
 * no longer `Running`. `schtasks /End` writes native stderr when the task is
 * absent, and PowerShell 5.1 turns that into a terminating
 * `NativeCommandError` under `$ErrorActionPreference = 'Stop'` even with a
 * redirect, so a missing task must never be sent to the native tool.
 */
function stopTaskSteps(): string {
  const task = psQuote(TASK_NAME);
  return [
    `Stop-ScheduledTask -TaskName ${task} -ErrorAction SilentlyContinue;`,
    `for ($i = 0; $i -lt 50; $i++) { $state = (Get-ScheduledTask -TaskName ${task} -ErrorAction SilentlyContinue).State; if ($null -eq $state -or "$state" -ne 'Running') { break }; Start-Sleep -Milliseconds 100 };`,
  ].join(" ");
}

/**
 * Token-free elevated install spec: firewall rules, task XML, registration.
 * The XML travels as base64 inside the encoded command; it is written to
 * `$env:TEMP` only for `schtasks /XML` and removed before the script ends.
 *
 * Task existence, stop, and rollback use the ScheduledTasks cmdlets, never
 * `schtasks /Query`, `/End`, or `/Delete`: on Windows PowerShell 5.1 native
 * stderr from those commands is a terminating `NativeCommandError` under
 * `$ErrorActionPreference = 'Stop'` even when redirected, so a missing task
 * would abort a fresh install.
 *
 * The launcher is not installed by this script: the caller replaces it only
 * after this elevation succeeds, so a cancelled prompt or a failed install
 * keeps the previous launcher and task. A previous task is stopped before
 * `/Create /F` replaces it, and a failed upgrade restarts that previous task
 * instead of deleting it. The new task is started by the caller after the
 * launcher is in place.
 */
export function windowsInstallScript(cfg: ServiceConfig, sid: string): string {
  const xml64 = windowsTaskXmlBytes(windowsTaskXml(cfg, sid)).toString("base64");
  const task = psQuote(TASK_NAME);
  const ruleSteps = firewallRules(cfg.port, cfg.nodePath).flatMap((rule) => [
    // A stale delete may legitimately fail when no rule exists; a current add may not.
    netsh(firewallRemoveArgs(rule.name)),
    netsh(firewallAddArgs(rule)),
    "if ($LASTEXITCODE -ne 0) { throw 'firewall rule update failed' }",
  ]);
  const cleanup = [
    ...removeRules(),
    // `/Create /XML` may have registered the task before a later step failed.
    // Probe with the cmdlet so an absent task is a clean no-op, then remove it.
    `$created = Get-ScheduledTask -TaskName ${task} -ErrorAction SilentlyContinue;`,
    `if ($null -ne $created) { ${stopTaskSteps()} Unregister-ScheduledTask -TaskName ${task} -Confirm:$false -ErrorAction SilentlyContinue; }`,
  ].join(" ");
  return [
    "$ErrorActionPreference = 'Stop';",
    "$xmlPath = Join-Path $env:TEMP ('pocketpet-task-' + [guid]::NewGuid().ToString('N') + '.xml');",
    `[IO.File]::WriteAllBytes($xmlPath, [Convert]::FromBase64String(${psQuote(xml64)}));`,
    // Remember whether a previous install exists so a failed upgrade can be
    // restored rather than destroying it.
    `$existing = Get-ScheduledTask -TaskName ${task} -ErrorAction SilentlyContinue; $hadTask = ($null -ne $existing);`,
    "try {",
    // Stop the previous bridge before /Create /F swaps the task definition.
    `if ($hadTask) { ${stopTaskSteps()} }`,
    ...ruleSteps,
    `& schtasks.exe /Create /TN ${task} /XML $xmlPath /F;`,
    "if ($LASTEXITCODE -ne 0) { throw 'task registration failed' }",
    "Remove-Item -LiteralPath $xmlPath -Force -ErrorAction SilentlyContinue;",
    "} catch {",
    // A failed upgrade restores the previous task (its launcher is untouched);
    // a failed fresh install removes the rules and the task it just created.
    `if ($hadTask) { Start-ScheduledTask -TaskName ${task} -ErrorAction SilentlyContinue; } else { ${cleanup} }`,
    "Remove-Item -LiteralPath $xmlPath -Force -ErrorAction SilentlyContinue; throw }",
  ].join(" ");
}

/**
 * One elevation: stop and unregister the task, verify it is gone, then remove
 * both firewall rules. Every task step is a cmdlet so a missing task is a clean
 * no-op (PowerShell 5.1 turns absent-task `schtasks` stderr into a terminating
 * error). A task that survives the unregister makes the script exit nonzero so
 * the caller never reports a failed uninstall as removed.
 */
export function windowsUninstallScript(): string {
  const task = psQuote(TASK_NAME);
  return [
    "$ErrorActionPreference = 'Stop';",
    `$task = Get-ScheduledTask -TaskName ${task} -ErrorAction SilentlyContinue;`,
    `if ($null -ne $task) { ${stopTaskSteps()} Unregister-ScheduledTask -TaskName ${task} -Confirm:$false -ErrorAction SilentlyContinue; }`,
    // A missing task is fine for idempotency; one that still exists is a failure.
    `$remaining = Get-ScheduledTask -TaskName ${task} -ErrorAction SilentlyContinue;`,
    "if ($null -ne $remaining) { throw 'task deletion failed' }",
    // Rule deletion stays best effort: netsh fails when no rule matches.
    ...removeRules(),
    "exit 0",
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

/**
 * Staging path for the new launcher. It lives in the same directory as the
 * final launcher so the post-success rename is atomic on one volume, and it is
 * never the path the task XML points at.
 */
function stagedLauncherPath(cfg: ServiceConfig): string {
  return join(cfg.home, `.${LAUNCHER_FILE}.${process.pid}.tmp`);
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
 * Install transaction: validate, protect logs, stage the launcher, then run one
 * elevated helper that stops any previous task, adds firewall rules, and
 * registers the task. The previous launcher stays on disk until that elevation
 * succeeds; only then is the staged launcher renamed over it and the new task
 * started. Cancel or failure removes the staged copy and leaves the previous
 * install intact. Complete firewall/task rollback for a failed upgrade after
 * the elevation has changed state remains a real-Windows gate (Task 8/10).
 */
export async function installWindowsService(cfg: ServiceConfig, deps: WindowsDeps): Promise<void> {
  assertCompiledCli(cfg);
  const logs = join(cfg.home, "logs");
  mkdirSync(logs, { recursive: true, mode: 0o700 });
  deps.protectLogs(cfg.home);

  const launcher = launcherPath(cfg);
  const staged = stagedLauncherPath(cfg);
  try {
    writeFileSync(staged, windowsLauncherBytes(cfg), { mode: 0o600 });
    deps.protectFile(staged);
    const sid = currentUserSid(deps.run);
    const result = await deps.elevated(windowsInstallScript(cfg, sid));
    assertElevated(result, "install");
    // Atomic replace: the prior launcher survives every cancel/failure above.
    renameSync(staged, launcher);
    deps.protectFile(launcher);
  } catch (error) {
    // Remove only the staged copy so a cancelled reinstall keeps the previous launcher.
    rmSync(staged, { force: true });
    throw error;
  }
  // The task is started only after its launcher exists; a start failure is
  // reported instead of claiming the service is running.
  const started = deps.run("schtasks.exe", ["/Run", "/TN", TASK_NAME]);
  if (started.status !== 0) {
    throw new WindowsServiceError(
      "the bridge task was installed but could not be started; start it from Task Scheduler or run `pocketpet service install` again",
      { exitCode: started.status },
    );
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
    `$p = Start-Process -FilePath '${POWERSHELL}' -WindowStyle Hidden -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}' -Verb RunAs -Wait -PassThru;`,
    // A null Process/ExitCode must never read as success.
    "if ($null -eq $p -or $null -eq $p.ExitCode) { exit 1 };",
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
