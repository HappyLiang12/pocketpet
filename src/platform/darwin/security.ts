import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { PrivatePaths } from "../types.js";

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

function protectDir(path: string): void {
  mkdirSync(path, { recursive: true, mode: DIR_MODE });
  // Creation modes are ignored for paths that already exist, so tighten them explicitly.
  chmodSync(path, DIR_MODE);
}

/** POSIX mode protection used by the Darwin adapters. */
export const darwinSecurity: PrivatePaths = {
  protectHome: (home) => protectDir(home),
  protectLogs: (home) => protectDir(join(home, "logs")),
  protectFile: (path) => chmodSync(path, FILE_MODE),
};
