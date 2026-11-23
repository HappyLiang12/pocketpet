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

/**
 * Host adapter with a per-process cache: `/health` runs on every probe and must
 * not spawn scutil each time. A successful name is cached; a failure is retried
 * on the next call so a transient scutil error is not sticky.
 */
export function createDarwinHost(run: HostnameRunner = runCommand): HostIdentity {
  let cached: string | null = null;
  return {
    localHostname: () => {
      if (cached) return cached;
      const current = localHostname(run);
      if (current) cached = current;
      return current;
    },
    startAdvertisement: async () => true,
    stopAdvertisement: async () => {},
  };
}

/** macOS relies on the system Bonjour responder, so advertisement is always active. */
export const darwinHost: HostIdentity = createDarwinHost();
