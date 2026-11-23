import type { Platform } from "../types.js";
import { darwinHost } from "./hostname.js";
import { darwinSecurity } from "./security.js";
import { darwinService } from "./service.js";

export const darwinPlatform: Platform = {
  service: darwinService,
  host: darwinHost,
  security: darwinSecurity,
};
