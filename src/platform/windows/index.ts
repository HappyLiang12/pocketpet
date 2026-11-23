/**
 * Windows adapters. The ACL/private-path and hostname adapters are in place;
 * the mDNS advertisement, firewall, and Task Scheduler service arrive in later
 * tasks, so `platformFor("win32")` still returns the unsupported adapter.
 */
export { sanitizeHostname, windowsHost } from "./hostname.js";
export { currentUserSid, windowsSecurity, WindowsSecurityError } from "./security.js";
export type { WindowsSecurityOperation } from "./security.js";
