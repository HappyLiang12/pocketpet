import type { Platform } from "../types.js";
import { windowsHost } from "./hostname.js";
import { windowsSecurity } from "./security.js";
import { windowsService } from "./service.js";

export { sanitizeHostname, windowsHost } from "./hostname.js";
export { currentUserSid, windowsSecurity, WindowsSecurityError } from "./security.js";
export type { WindowsSecurityOperation } from "./security.js";
export { createWindowsService, installWindowsService, uninstallWindowsService, windowsService } from "./service.js";
export type { WindowsDeps } from "./service.js";

/**
 * Windows bundle: Task Scheduler service with current-user ACL protection.
 * The hostname/`mDNS` responder still arrives in Task 6, so `.local` is not
 * claimed here.
 */
export const windowsPlatform: Platform = {
  service: windowsService,
  host: windowsHost,
  security: windowsSecurity,
};
