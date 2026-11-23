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
