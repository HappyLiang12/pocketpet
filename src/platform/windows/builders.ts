import { win32 } from "node:path";
import type { ServiceConfig, ServiceState } from "../types.js";
import { TASK_NAME } from "./firewall.js";

/** PowerShell single-quoted literal: only `'` needs doubling. */
export function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Name of the generated PowerShell launcher; the service writes it under the home. */
export const LAUNCHER_FILE = "bridge-service.ps1";

const TASK_LINE = new RegExp(`^\\s*TaskName:\\s+\\\\?${escapeRegExp(TASK_NAME)}\\s*$`, "im");
const TASK_MENTION = new RegExp(escapeRegExp(TASK_NAME), "i");
const QUERY_FAILURE = /\bERROR\b|cannot find|does not exist|no (?:scheduled )?tasks?|not found/i;
const TASK_RUNNING = /^\s*(?:Status|Scheduled Task State):\s*Running\s*$/im;

/**
 * Locale-independent task state probe. `schtasks` labels are localized, but the
 * `State` enum string (`Running`, `Ready`, ...) is stable on every UI language.
 * An absent task writes nothing because of `-ErrorAction SilentlyContinue`.
 */
export const TASK_STATE_SCRIPT =
  `Get-ScheduledTask -TaskName ${psQuote(TASK_NAME)} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty State`;

/**
 * PowerShell launcher at `<home>/bridge-service.ps1`. It carries no token, QR,
 * or pairing URL; the service reads the protected config itself.
 */
export function windowsLauncher(cfg: ServiceConfig): string {
  const logPath = win32.join(cfg.home, "logs", "bridge.log");
  return [
    "$ErrorActionPreference = 'Stop'",
    `$env:POCKETPET_HOME = ${psQuote(cfg.home)}`,
    `& ${psQuote(cfg.nodePath)} ${psQuote(cfg.cliPath)} run --service *>> ${psQuote(logPath)}`,
    "exit $LASTEXITCODE",
  ].join("\r\n");
}

/**
 * The launcher is written as UTF-8 with a BOM so Windows PowerShell 5.1 reads
 * Unicode and spaced paths without falling back to the ANSI code page.
 */
export function windowsLauncherBytes(cfg: ServiceConfig): Buffer {
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(windowsLauncher(cfg), "utf8")]);
}

/**
 * Hidden per-user logon task XML. The caller writes it as UTF-16LE with a BOM
 * and registers it with `schtasks /Create /TN "PocketPet Bridge" /XML`. It
 * carries no token, QR, or pairing URL.
 */
export function windowsTaskXml(cfg: ServiceConfig, sid: string): string {
  const launcherPath = win32.join(cfg.home, LAUNCHER_FILE);
  const actionArguments = `-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "${launcherPath}"`;
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>${xmlEscape(TASK_NAME)} service at logon</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>${xmlEscape(sid)}</UserId>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>${xmlEscape(sid)}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Hidden>true</Hidden>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>powershell.exe</Command>
      <Arguments>${xmlEscape(actionArguments)}</Arguments>
      <WorkingDirectory>${xmlEscape(cfg.home)}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>`;
}

/**
 * UTF-16LE bytes with a BOM (`FF FE`). `schtasks /XML` rejects or mis-reads a
 * BOM-less UTF-16 file, so the caller writes exactly these bytes.
 */
export function windowsTaskXmlBytes(xml: string): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, "utf16le")]);
}

/** Map a PowerShell `State` value to the service contract. */
export function serviceStatusFromState(stdout: string): ServiceState {
  const state = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!state) return { installed: false, running: false };
  return { installed: true, running: state.toLowerCase() === "running" };
}

/**
 * Fallback parser for the verbose LIST output of
 * `schtasks /Query /TN "PocketPet Bridge" /FO LIST /V`, used only when the
 * locale-independent PowerShell state query is unavailable. A stopped task is
 * installed but not running.
 */
export function serviceStatusFromQuery(stdout: string): ServiceState {
  const installed = TASK_LINE.test(stdout) || (TASK_MENTION.test(stdout) && !QUERY_FAILURE.test(stdout));
  const running = installed && TASK_RUNNING.test(stdout);
  return { installed, running };
}
