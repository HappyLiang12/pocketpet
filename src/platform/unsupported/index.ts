import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { HostIdentity, Platform, PrivatePaths, ServiceManager } from "../types.js";

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;
const UNSUPPORTED_SERVICE = "service is not supported on this platform";

const unsupportedService: ServiceManager = {
  label: "PocketPet bridge",
  install: async () => {
    throw new Error(UNSUPPORTED_SERVICE);
  },
  uninstall: async () => {
    throw new Error(UNSUPPORTED_SERVICE);
  },
  status: async () => {
    throw new Error(UNSUPPORTED_SERVICE);
  },
};

const unsupportedHost: HostIdentity = {
  localHostname: () => null,
  startAdvertisement: async () => false,
  stopAdvertisement: async () => {},
};

function protectDir(path: string): void {
  mkdirSync(path, { recursive: true, mode: DIR_MODE });
  // Creation modes are ignored for paths that already exist, so tighten them explicitly.
  chmodSync(path, DIR_MODE);
}

/**
 * Best-effort POSIX platforms: the bridge still runs, but there is no service,
 * no `.local` name, and only mode-bit protection.
 */
const unsupportedSecurity: PrivatePaths = {
  protectHome: (home) => protectDir(home),
  protectLogs: (home) => protectDir(join(home, "logs")),
  protectFile: (path) => chmodSync(path, FILE_MODE),
};

export const unsupportedPlatform: Platform = {
  service: unsupportedService,
  host: unsupportedHost,
  security: unsupportedSecurity,
};
