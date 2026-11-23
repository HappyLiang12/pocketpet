import { win32 } from "node:path";
import type { ServiceConfig, ServiceState } from "../types.js";
import { TASK_NAME } from "./firewall.js";

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

const TASK_LINE = new RegExp(`^\\s*TaskName:\\s+\\\\?${escapeRegExp(TASK_NAME)}\\s*$`, "im");
const TASK_MENTION = new RegExp(escapeRegExp(TASK_NAME), "i");
const QUERY_FAILURE = /\bERROR\b|cannot find|does not exist|no (?:scheduled )?tasks?|not found/i;
const TASK_RUNNING = /^\s*(?:Status|Scheduled Task State):\s*Running\s*$/im;

/**
 * Batch launcher at `<home>/bridge-service.cmd`. It carries no token, QR, or
 * pairing URL; the service reads the protected config itself.
 */
export function windowsLauncher(cfg: ServiceConfig): string {
  const logPath = win32.join(cfg.home, "logs", "bridge.log");
  return [
    "@echo off",
    `set "POCKETPET_HOME=${cfg.home}"`,
    `"${cfg.nodePath}" "${cfg.cliPath}" run --service >> "${logPath}" 2>&1`,
  ].join("\r\n");
}

/**
 * Hidden per-user logon task XML. The caller writes it as UTF-16 and registers
 * it with `schtasks /Create /TN "PocketPet Bridge" /XML`. It carries no token,
 * QR, or pairing URL.
 */
export function windowsTaskXml(cfg: ServiceConfig, sid: string): string {
  const launcherPath = win32.join(cfg.home, "bridge-service.cmd");
  // cmd.exe /d /s /c strips the outer quote pair; the inner pair keeps a
  // launcher path with spaces as a single argument.
  const actionArguments = `/d /s /c ""${launcherPath}""`;
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
      <Command>cmd.exe</Command>
      <Arguments>${xmlEscape(actionArguments)}</Arguments>
      <WorkingDirectory>${xmlEscape(cfg.home)}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>`;
}

/**
 * Parses the verbose LIST output of
 * `schtasks /Query /TN "PocketPet Bridge" /FO LIST /V`.
 * A stopped task is installed but not running.
 */
export function serviceStatusFromQuery(stdout: string): ServiceState {
  const installed = TASK_LINE.test(stdout) || (TASK_MENTION.test(stdout) && !QUERY_FAILURE.test(stdout));
  const running = installed && TASK_RUNNING.test(stdout);
  return { installed, running };
}
