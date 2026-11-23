import type { Platform } from "../types.js";
import { windowsHost } from "./hostname.js";
import { windowsSecurity } from "./security.js";
import { windowsService } from "./service.js";

export { createWindowsHost, sanitizeHostname, windowsHost } from "./hostname.js";
export type { MdnsTransportHandle, WindowsHostDeps } from "./hostname.js";
export { FIREWALL_MDNS, FIREWALL_TCP, auditFirewallRules, firewallAddArgs, firewallRemoveArgs, firewallRules, firewallRulesPresent } from "./firewall.js";
export type { FirewallAudit, FirewallRule } from "./firewall.js";
export { advertisedAddresses, startMdns } from "./mdns.js";
export type { MdnsAnswer, MdnsPacket, MdnsQuery, MdnsTransport } from "./mdns.js";
export { currentUserSid, windowsSecurity, WindowsSecurityError } from "./security.js";
export type { WindowsSecurityOperation } from "./security.js";
export { windowsHookCommand } from "./hooks.js";
export type { WindowsHookAgent } from "./hooks.js";
export { createWindowsService, installWindowsService, uninstallWindowsService, windowsService } from "./service.js";
export type { WindowsDeps } from "./service.js";

/**
 * Windows bundle: Task Scheduler service with current-user ACL protection and
 * an mDNS host that advertises `.local` only after the firewall rules exist.
 */
export const windowsPlatform: Platform = {
  service: windowsService,
  host: windowsHost,
  security: windowsSecurity,
};
