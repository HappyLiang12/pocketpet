import { execFileSync } from "node:child_process";
import type { CommandRunner } from "../types.js";

export const FIREWALL_TCP = "PocketPet Bridge TCP";
export const FIREWALL_MDNS = "PocketPet Bridge mDNS";
export const TASK_NAME = "PocketPet Bridge";

export type FirewallRule = { name: string; protocol: "TCP" | "UDP"; port: number; program: string };

const defaultRunner: CommandRunner = (command, args) => {
  try {
    return { status: 0, stdout: execFileSync(command, args, { encoding: "utf8", stdio: "pipe" }), stderr: "" };
  } catch (error) {
    const failed = error as { status?: number | null; stdout?: string | Buffer; stderr?: string | Buffer };
    return {
      status: typeof failed.status === "number" ? failed.status : 1,
      stdout: failed.stdout?.toString() ?? "",
      stderr: failed.stderr?.toString() ?? "",
    };
  }
};

function assertPort(port: number): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new RangeError(`invalid bridge port: expected an integer in 1-65535, got ${String(port)}`);
  }
}

const addRule = (name: string, protocol: "TCP" | "UDP", port: number, program: string): string =>
  `netsh advfirewall firewall add rule name="${name}" dir=in action=allow program="${program}" protocol=${protocol} localport=${port} profile=private`;

/** Inbound allow rules for the bridge port and mDNS, scoped to the Node executable. */
export function firewallRules(port: number, program: string = process.execPath): FirewallRule[] {
  assertPort(port);
  return [
    { name: FIREWALL_TCP, protocol: "TCP", port, program },
    { name: FIREWALL_MDNS, protocol: "UDP", port: 5353, program },
  ];
}

/** Raw netsh arguments for one add; PowerShell callers pass each element as one quoted argument. */
export function firewallAddArgs(rule: FirewallRule): string[] {
  return [
    "advfirewall",
    "firewall",
    "add",
    "rule",
    `name=${rule.name}`,
    "dir=in",
    "action=allow",
    `program=${rule.program}`,
    `protocol=${rule.protocol}`,
    `localport=${rule.port}`,
    "profile=private",
  ];
}

/** Raw netsh arguments for one idempotent delete. */
export function firewallRemoveArgs(name: string): string[] {
  return ["advfirewall", "firewall", "delete", "rule", `name=${name}`];
}

/**
 * Rules are inbound allow, Private profile only, and scoped to the installed
 * Node executable. Stale PocketPet rules are deleted first so a port or Node
 * path change is idempotent.
 */
export function firewallAddCommands(port: number, program: string = process.execPath): string[] {
  return [
    ...firewallRemoveCommands(),
    ...firewallRules(port, program).map((rule) => addRule(rule.name, rule.protocol, rule.port, rule.program)),
  ];
}

export function firewallRemoveCommands(): string[] {
  return [FIREWALL_TCP, FIREWALL_MDNS].map((name) => `netsh advfirewall firewall delete rule name="${name}"`);
}

/** Read-only check used before advertising mDNS; never adds or removes rules. */
export function firewallRulesPresent(run: CommandRunner = defaultRunner): boolean {
  return [FIREWALL_TCP, FIREWALL_MDNS].every(
    (name) => run("netsh", ["advfirewall", "firewall", "show", "rule", `name=${name}`]).status === 0,
  );
}

const POWERSHELL = "powershell.exe";

/** PowerShell single-quoted literal: only `'` needs doubling. */
const psLiteral = (value: string): string => `'${value.replace(/'/g, "''")}'`;

/**
 * Content-verification result for the doctor. `verified` is only ever returned
 * from the PowerShell property query; a netsh name lookup alone can only reach
 * `names-only`, which the doctor reports as WARN.
 */
export type FirewallAudit = {
  level: "verified" | "mismatch" | "names-only" | "missing";
  detail: string;
};

/** Fixed reasons from the property query; no rule content or path is printed. */
const AUDIT_FAILURES: Record<number, string> = {
  4: "duplicate PocketPet firewall rules exist",
  5: "a rule is disabled",
  6: "a rule is not inbound",
  7: "a rule does not allow traffic",
  8: "a rule is not Private-profile only",
  9: "a rule has the wrong protocol",
  10: "a rule has the wrong local port",
  11: "a rule is scoped to a different program",
};

/**
 * Locale-independent property query: cmdlet property values and enum values
 * (`Inbound`, `Allow`, `True`, profile bit 2) are invariant, unlike localized
 * netsh output. Exits non-zero with a fixed code on the first mismatch.
 */
function auditScript(port: number, program: string): string {
  const expected = [
    `@{Name=${psLiteral(FIREWALL_TCP)};Protocol='TCP';Port=${psLiteral(String(port))}}`,
    `@{Name=${psLiteral(FIREWALL_MDNS)};Protocol='UDP';Port='5353'}`,
  ];
  return [
    "$ErrorActionPreference='Stop';",
    `$program=${psLiteral(program)};`,
    `$expected=@(${expected.join(",")});`,
    "foreach($e in $expected){",
    "$rules=@(Get-NetFirewallRule -DisplayName $e.Name -ErrorAction SilentlyContinue);",
    "if($rules.Count -eq 0){exit 3};",
    "if($rules.Count -gt 1){exit 4};",
    "$r=$rules[0];",
    "if($r.Enabled -ne 'True'){exit 5};",
    "if($r.Direction -ne 'Inbound'){exit 6};",
    "if($r.Action -ne 'Allow'){exit 7};",
    "if([int]$r.Profile -ne 2){exit 8};",
    "$pf=Get-NetFirewallPortFilter -AssociatedNetFirewallRule $r;",
    "if($pf.Protocol -ne $e.Protocol){exit 9};",
    "if(@($pf.LocalPort) -notcontains $e.Port){exit 10};",
    "$af=Get-NetFirewallApplicationFilter -AssociatedNetFirewallRule $r;",
    "if($af.Program -ne $program){exit 11};",
    "}",
    "exit 0",
  ].join("");
}

function auditNames(run: CommandRunner): FirewallAudit {
  try {
    return firewallRulesPresent(run)
      ? { level: "names-only", detail: "PocketPet firewall rule names exist; profile/port/content not verified" }
      : { level: "missing", detail: "PocketPet firewall rules are missing; .local and phone access may be blocked" };
  } catch {
    return { level: "names-only", detail: "PocketPet firewall rule content could not be read; profile/port/content not verified" };
  }
}

/**
 * Verify the actual firewall rule content (profile, direction, action, protocol,
 * local port, program) before the doctor may show PASS. Anything short of the
 * property query succeeding degrades to names-only WARN evidence; names are
 * never reported as verified content.
 */
export function auditFirewallRules(
  port: number | null,
  program: string = process.execPath,
  run: CommandRunner = defaultRunner,
): FirewallAudit {
  if (port === null || !Number.isInteger(port) || port < 1 || port > 65535) return auditNames(run);
  try {
    const encoded = Buffer.from(auditScript(port, program), "utf16le").toString("base64");
    const result = run(POWERSHELL, ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded]);
    if (result.status === 0) {
      return {
        level: "verified",
        detail: `Private-profile inbound TCP ${port} and mDNS (UDP 5353) allow rules are verified for the bridge program`,
      };
    }
    if (result.status === 3) return { level: "missing", detail: "PocketPet firewall rules are missing; .local and phone access may be blocked" };
    const reason = AUDIT_FAILURES[result.status];
    if (reason) return { level: "mismatch", detail: `PocketPet firewall rule names exist but the content does not match: ${reason}` };
  } catch {
    // PowerShell or the NetSecurity module is unavailable; fall through to names.
  }
  return auditNames(run);
}
