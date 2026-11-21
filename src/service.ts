import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const SERVICE_LABEL = "dev.foldpet.bridge";

export type ServiceConfig = {
  home: string;
  nodePath: string;
  cliPath: string;
  /** Test hook: overrides the real ~/Library/LaunchAgents location. */
  plistPath?: string;
};

export type LaunchctlRunner = (args: string[]) => { status: number; stdout: string; stderr: string };

function currentUid(): number {
  return typeof process.getuid === "function" ? process.getuid() : 0;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function servicePath(home: string = homedir()): string {
  return join(home, "Library", "LaunchAgents", `${SERVICE_LABEL}.plist`);
}

export function servicePlist(cfg: ServiceConfig): string {
  const logPath = join(cfg.home, "logs", "bridge.log");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(SERVICE_LABEL)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(cfg.nodePath)}</string>
    <string>${xmlEscape(cfg.cliPath)}</string>
    <string>run</string>
    <string>--service</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>FOLDPET_HOME</key>
    <string>${xmlEscape(cfg.home)}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>${xmlEscape(logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(logPath)}</string>
</dict>
</plist>
`;
}

export const defaultRunner: LaunchctlRunner = (args) => {
  try {
    const stdout = execFileSync("launchctl", args, { stdio: "pipe", encoding: "utf8" });
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

function resolvePlistPath(cfg: ServiceConfig): string {
  return cfg.plistPath ?? servicePath();
}

function assertCompiledCli(cliPath: string): void {
  if (cliPath.endsWith(".ts") || !existsSync(cliPath)) {
    throw new Error(`refusing to install service from ${cliPath}: build and run the compiled CLI (dist/cli.js)`);
  }
}

export async function installService(cfg: ServiceConfig, runner: LaunchctlRunner = defaultRunner): Promise<void> {
  assertCompiledCli(cfg.cliPath);

  const logsDir = join(cfg.home, "logs");
  mkdirSync(logsDir, { recursive: true, mode: 0o700 });
  writeFileSync(join(logsDir, "bridge.log"), "", { flag: "a", mode: 0o600 });

  const plistPath = resolvePlistPath(cfg);
  const plistDir = dirname(plistPath);
  mkdirSync(plistDir, { recursive: true });

  const tmpPath = join(plistDir, `.${SERVICE_LABEL}.${process.pid}.tmp`);
  writeFileSync(tmpPath, servicePlist(cfg), { mode: 0o644 });
  renameSync(tmpPath, plistPath);

  const uid = currentUid();
  runner(["bootout", `gui/${uid}/${SERVICE_LABEL}`]);
  const bootstrap = runner(["bootstrap", `gui/${uid}`, plistPath]);
  if (bootstrap.status !== 0) {
    const detail = bootstrap.stderr.trim() || bootstrap.stdout.trim() || `exit ${bootstrap.status}`;
    throw new Error(`launchctl bootstrap failed for ${SERVICE_LABEL}: ${detail}`);
  }
}

export async function uninstallService(cfg: ServiceConfig, runner: LaunchctlRunner = defaultRunner): Promise<void> {
  runner(["bootout", `gui/${currentUid()}/${SERVICE_LABEL}`]);
  const plistPath = resolvePlistPath(cfg);
  if (existsSync(plistPath)) rmSync(plistPath);
}

export async function serviceStatus(cfg: ServiceConfig, runner: LaunchctlRunner = defaultRunner): Promise<boolean> {
  try {
    return runner(["print", `gui/${currentUid()}/${SERVICE_LABEL}`]).status === 0;
  } catch {
    return false;
  }
}
