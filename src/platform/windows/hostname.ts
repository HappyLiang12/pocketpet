import { hostname } from "node:os";
import type { HostIdentity } from "../types.js";

/** Turn a Windows computer name into a lowercase DNS label (RFC 1123). */
export function sanitizeHostname(raw: string): string {
  const label = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
  return label || "pocketpet";
}

let advertising = false;
const name = sanitizeHostname(hostname());

/**
 * Windows host identity. `.local` is available only while the mDNS responder
 * serves A records; Task 6 replaces this stub with the real advertisement.
 */
export const windowsHost: HostIdentity = {
  localHostname: () => (advertising ? `${name}.local` : null),
  startAdvertisement: async () => {
    advertising = false;
    return false;
  },
  stopAdvertisement: async () => {
    advertising = false;
  },
};
