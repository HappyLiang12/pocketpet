import { describe, expect, it } from "vitest";
import type { NetworkInterfaceInfo } from "node:os";
import { rankLanAddresses, urlsForPort } from "../src/net.js";

const addr = (address: string, extra: Partial<NetworkInterfaceInfo> = {}): NetworkInterfaceInfo =>
  ({
    address,
    family: "IPv4",
    internal: false,
    netmask: "255.255.255.0",
    mac: "aa",
    cidr: null,
    ...extra,
  }) as NetworkInterfaceInfo;

const fake = {
  en0: [addr("192.168.1.5")],
  utun3: [addr("100.64.0.2")],
  lo0: [addr("127.0.0.1", { internal: true })],
  en5: [addr("169.254.3.3")],
} as never;

describe("urlsForPort", () => {
  it("returns non-internal IPv4 URLs with en first and no link-local", () => {
    const urls = urlsForPort(7788, "tok", fake);
    expect(urls[0]).toBe("http://192.168.1.5:7788/?token=tok");
    expect(urls.some((u) => u.includes("169.254"))).toBe(false);
    expect(urls.some((u) => u.includes("127.0.0.1"))).toBe(false);
  });

  it("shares the ranked address order and deduplicates repeated addresses", () => {
    const ifaces = {
      "Ethernet 2": [addr("192.168.1.3")],
      "Wi-Fi": [addr("192.168.1.2"), addr("192.168.1.2")],
    };
    const ranked = rankLanAddresses(ifaces);
    expect(urlsForPort(7788, "tok", ifaces)).toEqual(
      ranked.map(({ address }) => `http://${address}:7788/?token=tok`),
    );
    expect(urlsForPort(7788, "tok", ifaces)).toEqual([
      "http://192.168.1.2:7788/?token=tok",
      "http://192.168.1.3:7788/?token=tok",
    ]);
  });
});

describe("rankLanAddresses", () => {
  it("puts Windows Wi-Fi and Ethernet before other and virtual adapters", () => {
    const ranked = rankLanAddresses(
      {
        "vEthernet (VPN)": [addr("10.0.0.2")],
        Tailscale: [addr("100.64.0.2")],
        "Wi-Fi": [addr("192.168.1.2")],
        "Ethernet 2": [addr("192.168.1.3")],
        "Local Area Connection* 9": [addr("192.168.1.9")],
      },
      "win32",
    );
    expect(ranked.map((item) => item.address)).toEqual([
      "192.168.1.2",
      "192.168.1.3",
      "192.168.1.9",
      "10.0.0.2",
      "100.64.0.2",
    ]);
    expect(ranked.map((item) => item.rank)).toEqual([0, 0, 1, 2, 2]);
    expect(ranked[0]).toEqual({ address: "192.168.1.2", interfaceName: "Wi-Fi", rank: 0 });
  });

  it("preserves macOS en priority and keeps utun last", () => {
    const ranked = rankLanAddresses(
      {
        utun3: [addr("100.64.0.2")],
        en1: [addr("192.168.1.6")],
        bridge0: [addr("192.168.1.7")],
      },
      "darwin",
    );
    expect(ranked.map((item) => item.address)).toEqual(["192.168.1.6", "192.168.1.7", "100.64.0.2"]);
    expect(ranked.map((item) => item.rank)).toEqual([0, 1, 2]);
  });

  it("orders macOS en adapters by numeric index before address", () => {
    const ranked = rankLanAddresses(
      {
        en6: [addr("192.168.1.3")],
        en0: [addr("192.168.1.9")],
      },
      "darwin",
    );
    expect(ranked.map((item) => item.interfaceName)).toEqual(["en0", "en6"]);
    expect(ranked.map((item) => item.rank)).toEqual([0, 0]);
  });

  it("applies virtual adapter demotion only on Windows", () => {
    const ranked = rankLanAddresses(
      {
        utun3: [addr("100.64.0.2")],
        "vEthernet (VPN)": [addr("10.0.0.2")],
        tailscale0: [addr("100.64.0.3")],
        en0: [addr("192.168.1.5")],
      },
      "darwin",
    );
    expect(ranked.map((item) => item.interfaceName)).toEqual([
      "en0",
      "vEthernet (VPN)",
      "tailscale0",
      "utun3",
    ]);
    expect(ranked.map((item) => item.rank)).toEqual([0, 1, 1, 2]);
  });

  it("treats Wi-Fi and Ethernet as primary on Windows but not en*", () => {
    const ranked = rankLanAddresses(
      {
        en0: [addr("192.168.1.5")],
        "Wi-Fi": [addr("192.168.1.4")],
      },
      "win32",
    );
    expect(ranked.map((item) => item.interfaceName)).toEqual(["Wi-Fi", "en0"]);
    expect(ranked.map((item) => item.rank)).toEqual([0, 1]);
  });

  it("deduplicates an address shared by a virtual and a physical adapter, keeping the better rank", () => {
    const ranked = rankLanAddresses(
      {
        "vEthernet (Default Switch)": [addr("192.168.1.2")],
        "Wi-Fi": [addr("192.168.1.2")],
      },
      "win32",
    );
    expect(ranked).toEqual([{ address: "192.168.1.2", interfaceName: "Wi-Fi", rank: 0 }]);
  });

  it("skips loopback, link-local, IPv6 and adapter entries without addresses", () => {
    const ranked = rankLanAddresses(
      {
        lo0: [addr("127.0.0.1", { internal: true })],
        en5: [addr("169.254.3.3")],
        "Wi-Fi": [addr("fe80::1", { family: "IPv6" }), addr("192.168.1.2")],
        "Ethernet": null,
      },
      "win32",
    );
    expect(ranked.map((item) => item.address)).toEqual(["192.168.1.2"]);
  });

  it("orders equal-ranked adapters deterministically by address", () => {
    const ranked = rankLanAddresses(
      {
        "Wi-Fi": [addr("192.168.1.20"), addr("192.168.1.9")],
        Ethernet: [addr("192.168.1.10")],
      },
      "win32",
    );
    expect(ranked.map((item) => item.address)).toEqual(["192.168.1.10", "192.168.1.20", "192.168.1.9"]);
  });
});
