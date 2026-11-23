import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";

type IfaceMap = NodeJS.Dict<NetworkInterfaceInfo[]>;

export type LanAddress = { address: string; interfaceName: string; rank: number };

/** Adapters that are tunnels or software switches; they never identify the LAN. */
const VIRTUAL_ADAPTER = /vethernet|vpn|tailscale|wireguard|zerotier|virtual|hyper-v|vmware|virtualbox|docker|utun|(^|[\s(])tap\d/i;

/** Windows Wi-Fi and wired adapters that a phone on the same LAN can reach. */
const WINDOWS_PRIMARY_ADAPTER = /^(wi-?fi|wireless|wlan|ethernet)([\s\d*()]|$)/i;

/**
 * Non-loopback IPv4 addresses ordered for pairing: physical Wi-Fi/Ethernet
 * first, other adapters next, VPN/virtual adapters last. The same list feeds
 * QR URLs and, on Windows, the mDNS A records.
 */
export function rankLanAddresses(
  ifaces: IfaceMap = networkInterfaces(),
  platform: NodeJS.Platform = process.platform,
): LanAddress[] {
  const ranked: LanAddress[] = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const addr of addrs ?? []) {
      if (addr.family !== "IPv4" || addr.internal || addr.address.startsWith("169.254.")) continue;
      const lower = name.toLowerCase();
      const virtual = VIRTUAL_ADAPTER.test(lower);
      const primary =
        !virtual &&
        (WINDOWS_PRIMARY_ADAPTER.test(lower) || (platform === "darwin" && lower.startsWith("en")));
      ranked.push({ address: addr.address, interfaceName: name, rank: virtual ? 2 : primary ? 0 : 1 });
    }
  }
  return ranked
    .sort((a, b) => a.rank - b.rank || compareAddress(a.address, b.address))
    .filter((item, index, items) => items.findIndex((candidate) => candidate.address === item.address) === index);
}

/** Locale-independent ordering keeps the QR/mDNS address order stable. */
function compareAddress(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function urlsForPort(port: number, token: string, ifaces: IfaceMap = networkInterfaces()): string[] {
  return rankLanAddresses(ifaces).map(
    ({ address }) => `http://${address}:${port}/?token=${encodeURIComponent(token)}`,
  );
}
