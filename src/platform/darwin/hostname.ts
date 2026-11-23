import { execFileSync } from "node:child_process";
import type { HostIdentity } from "../types.js";

/** Injectable `scutil` runner for tests; returns stdout and throws on failure. */
export type HostnameRunner = (command: string, args: string[]) => string;

function runCommand(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

/** macOS Bonjour host name, normalized to end in `.local`; null when scutil fails. */
export function localHostname(run: HostnameRunner = runCommand): string | null {
  try {
    const name = run("scutil", ["--get", "LocalHostName"]).trim();
    if (!name) return null;
    return name.endsWith(".local") ? name : `${name}.local`;
  } catch {
    return null;
  }
}

/** macOS relies on the system Bonjour responder, so advertisement is always active. */
export const darwinHost: HostIdentity = {
  localHostname: () => localHostname(),
  startAdvertisement: async () => true,
  stopAdvertisement: async () => {},
};
