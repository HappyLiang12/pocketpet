import { platform } from "../../src/platform/index.js";
import type { HostIdentity, PrivatePaths } from "../../src/platform/types.js";

/**
 * Inert adapters for unit tests on Windows. They keep a test from spawning
 * PowerShell (ACL), netsh (firewall probe) or schtasks (service status) while
 * exercising logic that is unrelated to those APIs. The real Windows adapters
 * are covered by windows*.test.ts with fake runners and by
 * scripts/windows-integration.mjs on the Windows CI job.
 */
const noopHost: HostIdentity = {
  localHostname: () => null,
  startAdvertisement: async () => false,
  stopAdvertisement: async () => {},
};

const noopSecurity: PrivatePaths = {
  protectHome: () => {},
  protectLogs: () => {},
  protectFile: () => {},
};

/**
 * Production adapters on macOS, so existing macOS assertions stay exactly as
 * they were; inert adapters on Windows, where the same calls would otherwise
 * need real elevation-adjacent system state.
 */
export const testHost: HostIdentity = process.platform === "win32" ? noopHost : platform.host;
export const testSecurity: PrivatePaths = process.platform === "win32" ? noopSecurity : platform.security;
