import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";

type IfaceMap = NodeJS.Dict<NetworkInterfaceInfo[]>;

export type LanAddress = { address: string; interfaceName: string; rank: number };

/**
 * Windows adapters that are tunnels or software switches; they never identify
 * the LAN. `utun` is included so macOS-shaped fixtures and tunnel adapters stay
 * demoted when the bridge runs on Windows.
 */
const WINDOWS_VIRTUAL_ADAPTER =
  /vethernet|vpn|tailscale|wireguard|zerotier|virtual|hyper-v|vmware|virtualbox|docker|utun|(^|[\s(])tap\d/i;

/** Windows Wi-Fi and wired adapters that a phone on the same LAN can reach. */
const WINDOWS_PRIMARY_ADAPTER = /^(wi-?fi|wireless|wlan|ethernet)([\s\d*()]|$)/i;

/** Pairing rank for an adapter name: 0 physical, 1 other, 2 tunnel/virtual. */
function rankFor(name: string, platform: NodeJS.Platform): number {
  if (platform === "win32") {
    if (WINDOWS_VIRTUAL_ADAPTER.test(name)) return 2;
    return WINDOWS_PRIMARY_ADAPTER.test(name) ? 0 : 1;
  }
  // macOS (and the best-effort fallback): en* physical, utun tunnels last.
  if (name.startsWith("en")) return 0;
  return name.startsWith("utun") ? 2 : 1;
}

/** Numeric macOS `en` index so en0 stays ahead of en6 regardless of address. */
function enIndex(name: string): number {
  const match = /^en(\d+)/.exec(name);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

/**
 * Non-loopback IPv4 addresses ordered for pairing: physical Wi-Fi/Ethernet
 * first, other adapters next, VPN/virtual adapters last. macOS keeps its
 * historical order within the primary rank (numeric `en` index, then address);
 * Windows stays deterministic by address. The same list feeds QR URLs and, on
 * Windows, the mDNS A records.
 */
export function rankLanAddresses(
  ifaces: IfaceMap = networkInterfaces(),
  platform: NodeJS.Platform = process.platform,
): LanAddress[] {
  const ranked: LanAddress[] = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const addr of addrs ?? []) {
      if (addr.family !== "IPv4" || addr.internal || addr.address.startsWith("169.254.")) continue;
      ranked.push({ address: addr.address, interfaceName: name, rank: rankFor(name, platform) });
    }
  }
  const darwin = platform === "darwin";
  return ranked
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (darwin && a.rank === 0) {
        const indexOrder = enIndex(a.interfaceName) - enIndex(b.interfaceName);
        if (indexOrder) return indexOrder;
      }
      return compareAddress(a.address, b.address);
    })
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
