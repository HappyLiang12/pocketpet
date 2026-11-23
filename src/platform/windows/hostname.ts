import { hostname } from "node:os";
import { rankLanAddresses, type LanAddress } from "../../net.js";
import type { HostIdentity } from "../types.js";
import { firewallRulesPresent } from "./firewall.js";
import { startMdns, type MdnsTransport } from "./mdns.js";

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

/** A transport plus the socket-failure channel that arrives after start. */
export type MdnsTransportHandle = {
  transport: MdnsTransport;
  /** Receives bind errors (EACCES/EADDRINUSE) that surface asynchronously. */
  onFailure?: (listener: (error: Error) => void) => void;
};

export type WindowsHostDeps = {
  /** Raw computer name, sanitized before use; defaults to `os.hostname()`. */
  name?: string;
  /** Read-only firewall probe; defaults to the PocketPet rule check. */
  firewallReady?: () => boolean;
  /** Ranked LAN addresses; defaults to `rankLanAddresses()`. */
  addresses?: () => LanAddress[];
  /** Lazy transport factory; defaults to `multicast-dns`. */
  createTransport?: () => MdnsTransportHandle | Promise<MdnsTransportHandle>;
};

/**
 * Loads `multicast-dns` only when advertisement actually starts, so macOS and
 * foreground Windows runs without firewall rules never import it.
 */
async function multicastTransport(): Promise<MdnsTransportHandle> {
  const createMdns = (await import("multicast-dns")).default;
  const mdns = createMdns();
  const failures: Array<(error: Error) => void> = [];
  mdns.on("error", (error) => {
    for (const listener of failures) listener(error);
  });
  return {
    transport: {
      on: (event, listener) => {
        mdns.on(event, listener);
      },
      removeListener: (event, listener) => {
        mdns.removeListener(event, listener);
      },
      respond: (packet) => {
        mdns.respond(packet);
      },
      destroy: () => {
        mdns.destroy();
      },
    },
    onFailure: (listener) => {
      failures.push(listener);
    },
  };
}

/**
 * Windows host identity. `.local` exists only while the mDNS responder serves
 * A records, and the responder starts only when the PocketPet firewall rules
 * are present and at least one ranked LAN address exists. Any import, socket
 * or bind failure degrades to no `.local`; the bridge keeps serving IP/USB.
 */
export function createWindowsHost(deps: WindowsHostDeps = {}): HostIdentity {
  let advertising = false;
  let activeName: string | null = null;
  let responder: { stop(): void } | null = null;
  let pending: Promise<boolean> | null = null;

  const stop = (): void => {
    const current = responder;
    responder = null;
    advertising = false;
    activeName = null;
    current?.stop();
  };

  const start = async (): Promise<boolean> => {
    const firewallReady = deps.firewallReady ?? (() => firewallRulesPresent());
    let permitted = false;
    try {
      permitted = firewallReady();
    } catch {
      permitted = false;
    }
    if (!permitted) return false;

    let addresses: LanAddress[] = [];
    try {
      addresses = (deps.addresses ?? (() => rankLanAddresses()))();
    } catch {
      return false;
    }
    if (addresses.length === 0) return false;

    try {
      const handle = await (deps.createTransport ?? multicastTransport)();
      const label = sanitizeHostname(deps.name ?? hostname());
      responder = startMdns({ hostname: label, addresses, transport: handle.transport });
      advertising = true;
      activeName = label;
      handle.onFailure?.(() => stop());
      return true;
    } catch {
      stop();
      return false;
    }
  };

  return {
    localHostname: () => (advertising && activeName ? `${activeName}.local` : null),
    startAdvertisement: () => {
      if (advertising) return Promise.resolve(true);
      pending ??= start().finally(() => {
        pending = null;
      });
      return pending;
    },
    stopAdvertisement: async () => {
      stop();
    },
  };
}

/** Windows host identity; `.local` is claimed only while the responder is active. */
export const windowsHost: HostIdentity = createWindowsHost();
