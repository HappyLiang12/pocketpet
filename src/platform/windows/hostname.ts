import { hostname } from "node:os";
import { rankLanAddresses, type LanAddress } from "../../net.js";
import type { HostIdentity } from "../types.js";
import { firewallRulesPresent } from "./firewall.js";
import { advertisedAddresses, startMdns, type MdnsTransport } from "./mdns.js";

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

/** A transport plus the bind-confirmation and socket-failure channels. */
export type MdnsTransportHandle = {
  transport: MdnsTransport;
  /** Registers for bind confirmation; `multicast-dns` emits `ready` after bind. */
  onReady: (listener: () => void) => void;
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
  const readies: Array<() => void> = [];
  let ready = false;
  mdns.on("error", (error) => {
    for (const listener of failures) listener(error);
  });
  mdns.on("ready", () => {
    ready = true;
    for (const listener of readies) listener();
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
    onReady: (listener) => {
      if (ready) queueMicrotask(listener);
      else readies.push(listener);
    },
    onFailure: (listener) => {
      failures.push(listener);
    },
  };
}

/** How long a transport may take to confirm its UDP bind before giving up. */
const READY_TIMEOUT_MS = 2000;

/**
 * Windows host identity. `.local` exists only while the mDNS responder serves
 * A records, and the responder starts only when the PocketPet firewall rules
 * are present and at least one ranked non-loopback IPv4 address exists. A bind
 * confirmation is awaited, so `.local` is never claimed before the socket is
 * actually listening; any import, socket or bind failure degrades to no
 * `.local` and the bridge keeps serving IP/USB.
 */
export function createWindowsHost(deps: WindowsHostDeps = {}): HostIdentity {
  let advertising = false;
  let activeName: string | null = null;
  let responder: { stop(): void } | null = null;
  let activeTransport: MdnsTransport | null = null;
  let pending: Promise<boolean> | null = null;
  let cancelWait: (() => void) | null = null;

  const stop = (): void => {
    const current = responder;
    const transport = activeTransport;
    responder = null;
    activeTransport = null;
    advertising = false;
    activeName = null;
    cancelWait?.();
    cancelWait = null;
    if (current) current.stop();
    else transport?.destroy();
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
    // Gate on what would actually be answered, not on the raw input length.
    if (advertisedAddresses(addresses).length === 0) return false;

    try {
      const created = await (deps.createTransport ?? multicastTransport)();
      const { transport } = created;
      activeTransport = transport;

      // `multicast-dns` binds asynchronously; claim the name only once the bind
      // is confirmed, and give up on the first bind error or a short timeout.
      const ready = await new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (value: boolean): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          cancelWait = null;
          resolve(value);
        };
        const timer = setTimeout(() => settle(false), READY_TIMEOUT_MS);
        timer.unref?.();
        cancelWait = () => settle(false);
        created.onReady(() => settle(true));
        created.onFailure?.(() => settle(false));
      });

      if (!ready || activeTransport !== transport) {
        stop();
        return false;
      }

      const label = sanitizeHostname(deps.name ?? hostname());
      responder = startMdns({ hostname: label, addresses, transport });
      advertising = true;
      activeName = label;
      // A bind error that arrives after `ready`, or a later socket failure,
      // withdraws the name. Compare identities so a stale transport cannot
      // stop a newer advertisement.
      created.onFailure?.(() => {
        if (activeTransport === transport) stop();
      });
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
