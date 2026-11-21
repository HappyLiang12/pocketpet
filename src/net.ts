import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";

type IfaceMap = NodeJS.Dict<NetworkInterfaceInfo[]>;

export function urlsForPort(port: number, token: string, ifaces: IfaceMap = networkInterfaces()): string[] {
  const ranked: Array<{ url: string; rank: number }> = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const addr of addrs ?? []) {
      if (addr.family !== "IPv4" || addr.internal || addr.address.startsWith("169.254.")) continue;
      const rank = name.startsWith("en") ? 0 : name.startsWith("utun") ? 2 : 1;
      ranked.push({ url: `http://${addr.address}:${port}/?token=${encodeURIComponent(token)}`, rank });
    }
  }
  ranked.sort((a, b) => a.rank - b.rank);
  return [...new Set(ranked.map((item) => item.url))];
}
