/**
 * Windows adapters. The ACL/private-path adapter is complete; the full Windows
 * platform (Task Scheduler service and host identity) is composed in a later
 * task, so `platformFor("win32")` still returns the unsupported adapter.
 */
export { currentUserSid, windowsSecurity, WindowsSecurityError } from "./security.js";
export type { WindowsSecurityOperation } from "./security.js";
