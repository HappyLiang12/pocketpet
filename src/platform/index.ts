import type { Platform } from "./types.js";
import { darwinPlatform } from "./darwin/index.js";
import { unsupportedPlatform } from "./unsupported/index.js";
import { windowsPlatform } from "./windows/index.js";

export function platformFor(name: NodeJS.Platform): Platform {
  if (name === "darwin") return darwinPlatform;
  if (name === "win32") return windowsPlatform;
  // Linux stays best-effort: the bridge runs, but there is no service or .local.
  return unsupportedPlatform;
}

export const platform = platformFor(process.platform);
