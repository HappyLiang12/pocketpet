import type { Platform } from "./types.js";
import { darwinPlatform } from "./darwin/index.js";
import { unsupportedPlatform } from "./unsupported/index.js";

export function platformFor(name: NodeJS.Platform): Platform {
  // Windows ACL protection exists in ./windows/security.ts, but Windows is not
  // selected until the service and host adapters exist; until then the
  // unsupported adapter keeps the bridge best-effort with no service or .local.
  return name === "darwin" ? darwinPlatform : unsupportedPlatform;
}

export const platform = platformFor(process.platform);
