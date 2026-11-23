import type { Platform } from "./types.js";
import { darwinPlatform } from "./darwin/index.js";
import { unsupportedPlatform } from "./unsupported/index.js";

export function platformFor(name: NodeJS.Platform): Platform {
  return name === "darwin" ? darwinPlatform : unsupportedPlatform;
}

export const platform = platformFor(process.platform);
