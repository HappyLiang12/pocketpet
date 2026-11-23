import { isIPv4 } from "node:net";
import type { LanAddress } from "../../net.js";

export type MdnsQuestion = { name?: string; type?: string | number };
export type MdnsQuery = { questions?: MdnsQuestion[] };
export type MdnsAnswer = { name: string; type: "A"; ttl: number; data: string };
export type MdnsPacket = { answers: MdnsAnswer[] };

/**
 * The minimal `multicast-dns` surface the responder needs. Tests inject a fake
 * transport so no UDP socket is opened outside Windows.
 */
export type MdnsTransport = {
  on(event: "query", listener: (query: MdnsQuery) => void): void;
  removeListener?(event: "query", listener: (query: MdnsQuery) => void): void;
  respond(packet: MdnsPacket): void;
  destroy(): void;
};

/** RFC 6762 suggests short TTLs; 120s keeps phones from caching a stale adapter. */
const TTL_SECONDS = 120;

function isLoopbackAddress(address: string): boolean {
  return address.startsWith("127.");
}

/** Ranked non-loopback IPv4 addresses, first occurrence wins, order preserved. */
export function advertisedAddresses(addresses: LanAddress[]): string[] {
  const seen = new Set<string>();
  return addresses
    .map(({ address }) => address)
    .filter((address) => {
      if (!isIPv4(address) || isLoopbackAddress(address) || address === "0.0.0.0") return false;
      if (seen.has(address)) return false;
      seen.add(address);
      return true;
    });
}

/**
 * Answers A queries for exactly `<hostname>.local` with every ranked IPv4
 * address. Other names, AAAA questions and other record types stay silent, so
 * the responder never claims a name or address it was not given.
 */
export function startMdns(options: {
  hostname: string;
  addresses: LanAddress[];
  transport: MdnsTransport;
}): { stop(): void } {
  const target = `${options.hostname}.local`.toLowerCase();
  const data = advertisedAddresses(options.addresses);
  let stopped = false;
  const onQuery = (query: MdnsQuery): void => {
    const wantsA = (query.questions ?? []).some(
      (question) =>
        String(question.name ?? "").toLowerCase() === target &&
        (question.type === "A" || question.type === 1),
    );
    if (!wantsA || data.length === 0) return;
    options.transport.respond({
      answers: data.map((address) => ({ name: target, type: "A" as const, ttl: TTL_SECONDS, data: address })),
    });
  };
  options.transport.on("query", onQuery);
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      options.transport.removeListener?.("query", onQuery);
      options.transport.destroy();
    },
  };
}
