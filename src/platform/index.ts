import type { Platform } from "./types.js";
import { darwinPlatform } from "./darwin/index.js";
import { unsupportedPlatform } from "./unsupported/index.js";

export function platformFor(name: NodeJS.Platform): Platform {
  // Windows ACL protection and a hostname adapter exist in ./windows, but the
  // mDNS advertisement and service adapters do not; until they do, the
  // unsupported adapter keeps the bridge best-effort with no service or .local.
  return name === "darwin" ? darwinPlatform : unsupportedPlatform;
}

export const platform = platformFor(process.platform);
