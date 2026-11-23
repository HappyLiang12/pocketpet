import { describe, expect, it, vi } from "vitest";
import { pairingLinks } from "../src/onboarding.js";
import type { LanAddress } from "../src/net.js";
import type { MdnsQuery, MdnsTransport } from "../src/platform/windows/mdns.js";
import {
  createWindowsHost,
  sanitizeHostname,
  windowsHost,
  type MdnsTransportHandle,
} from "../src/platform/windows/hostname.js";

const fakeIfaces = {
  "Wi-Fi": [{ address: "192.168.1.2", family: "IPv4", internal: false, netmask: "255.255.255.0", mac: "aa", cidr: null }],
} as never;

const addresses = (): LanAddress[] => [{ address: "192.168.1.2", interfaceName: "Wi-Fi", rank: 0 }];

/** Fake mDNS transport plus its socket-failure channel. */
function fakeTransport() {
  const queries: Array<(query: MdnsQuery) => void> = [];
  let destroyed = 0;
  let failure: ((error: Error) => void) | null = null;
  const transport: MdnsTransport = {
    on: (_event, listener) => {
      queries.push(listener);
    },
    removeListener: (_event, listener) => {
      const index = queries.indexOf(listener);
      if (index >= 0) queries.splice(index, 1);
    },
    respond: () => {},
    destroy: () => {
      destroyed += 1;
    },
  };
  const handle: MdnsTransportHandle = {
    transport,
    onFailure: (listener) => {
      failure = listener;
    },
  };
  return {
    handle,
    listenerCount: () => queries.length,
    destroyCount: () => destroyed,
    fail: (error: Error) => failure?.(error),
  };
}

describe("sanitizeHostname", () => {
  it("sanitizes computer names into a DNS label", () => {
    expect(sanitizeHostname("Happy PC_!!")).toBe("happy-pc");
    expect(sanitizeHostname("")).toBe("pocketpet");
  });

  it("collapses runs of separators and trims the edges", () => {
    expect(sanitizeHostname("  --Happy___PC--  ")).toBe("happy-pc");
    expect(sanitizeHostname("---")).toBe("pocketpet");
    expect(sanitizeHostname("!!!")).toBe("pocketpet");
  });

  it("keeps existing hyphens, digits and dots as separators", () => {
    expect(sanitizeHostname("DESKTOP-4F2K1L")).toBe("desktop-4f2k1l");
    expect(sanitizeHostname("Happy.PC")).toBe("happy-pc");
  });

  it("replaces non-ASCII characters instead of emitting an invalid label", () => {
    expect(sanitizeHostname("Café-PC")).toBe("caf-pc");
    expect(sanitizeHostname("電腦")).toBe("pocketpet");
  });

  it("caps the label at 63 characters and never ends in a hyphen", () => {
    const label = sanitizeHostname(`${"a".repeat(62)}-tail`);
    expect(label).toBe("a".repeat(62));
    expect(label.length).toBeLessThanOrEqual(63);
    expect(label.endsWith("-")).toBe(false);
  });

  it("is idempotent", () => {
    expect(sanitizeHostname(sanitizeHostname("Happy PC"))).toBe("happy-pc");
  });
});

describe("windowsHost advertisement", () => {
  it("does not claim a .local name before advertisement starts", () => {
    expect(windowsHost.localHostname()).toBeNull();
  });

  it("does not advertise without the PocketPet firewall rules", async () => {
    const fake = fakeTransport();
    const createTransport = vi.fn(() => fake.handle);
    const host = createWindowsHost({
      name: "Happy-PC",
      firewallReady: () => false,
      addresses,
      createTransport,
    });

    await expect(host.startAdvertisement()).resolves.toBe(false);
    expect(host.localHostname()).toBeNull();
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("does not advertise without a non-loopback IPv4 address", async () => {
    const fake = fakeTransport();
    const createTransport = vi.fn(() => fake.handle);
    const host = createWindowsHost({
      name: "Happy-PC",
      firewallReady: () => true,
      addresses: () => [],
      createTransport,
    });

    await expect(host.startAdvertisement()).resolves.toBe(false);
    expect(host.localHostname()).toBeNull();
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("advertises the sanitized .local name only while the responder is active", async () => {
    const fake = fakeTransport();
    const host = createWindowsHost({
      name: "Happy PC_!!",
      firewallReady: () => true,
      addresses,
      createTransport: () => fake.handle,
    });

    await expect(host.startAdvertisement()).resolves.toBe(true);
    expect(host.localHostname()).toBe("happy-pc.local");
    expect(fake.listenerCount()).toBe(1);

    await host.stopAdvertisement();
    expect(host.localHostname()).toBeNull();
    expect(fake.listenerCount()).toBe(0);
    expect(fake.destroyCount()).toBe(1);
  });

  it("reuses one responder across repeated start calls", async () => {
    const fake = fakeTransport();
    const createTransport = vi.fn(() => fake.handle);
    const host = createWindowsHost({
      name: "happy-pc",
      firewallReady: () => true,
      addresses,
      createTransport,
    });

    await expect(host.startAdvertisement()).resolves.toBe(true);
    await expect(host.startAdvertisement()).resolves.toBe(true);

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(fake.listenerCount()).toBe(1);
  });

  it("degrades to no .local when the transport cannot be imported or bound", async () => {
    const host = createWindowsHost({
      name: "happy-pc",
      firewallReady: () => true,
      addresses,
      createTransport: () => {
        throw new Error("EACCES: bind EACCES 0.0.0.0:5353");
      },
    });

    await expect(host.startAdvertisement()).resolves.toBe(false);
    expect(host.localHostname()).toBeNull();

    await host.stopAdvertisement();
    expect(host.localHostname()).toBeNull();
  });

  it("stops advertising when the socket reports a failure after start", async () => {
    const fake = fakeTransport();
    const host = createWindowsHost({
      name: "happy-pc",
      firewallReady: () => true,
      addresses,
      createTransport: () => fake.handle,
    });

    await expect(host.startAdvertisement()).resolves.toBe(true);
    expect(host.localHostname()).toBe("happy-pc.local");

    fake.fail(new Error("EADDRINUSE: bind EADDRINUSE 0.0.0.0:5353"));

    expect(host.localHostname()).toBeNull();
    expect(fake.listenerCount()).toBe(0);
    expect(fake.destroyCount()).toBe(1);
  });

  it("allows a later start after the responder stopped", async () => {
    const fakes = [fakeTransport(), fakeTransport()];
    const createTransport = vi.fn(() => fakes.shift()!.handle);
    const host = createWindowsHost({
      name: "happy-pc",
      firewallReady: () => true,
      addresses,
      createTransport,
    });

    await expect(host.startAdvertisement()).resolves.toBe(true);
    await host.stopAdvertisement();
    expect(host.localHostname()).toBeNull();

    await expect(host.startAdvertisement()).resolves.toBe(true);
    expect(host.localHostname()).toBe("happy-pc.local");
    expect(createTransport).toHaveBeenCalledTimes(2);
  });
});

describe("pairing without an active advertisement", () => {
  it("leaves pairing without a .local URL", () => {
    const links = pairingLinks(7788, "tok", {
      interfaces: fakeIfaces,
      hostname: windowsHost.localHostname(),
    });
    expect(links.localUrl).toBeNull();
    expect(links.qrUrl).toBe("http://192.168.1.2:7788/?token=tok");
  });

  it("falls back to the IP QR when --qr-host local has no live .local name", () => {
    const links = pairingLinks(7788, "tok", {
      interfaces: fakeIfaces,
      hostname: null,
      qrHost: "local",
    });
    expect(links.localUrl).toBeNull();
    expect(links.qrUrl).toBe("http://192.168.1.2:7788/?token=tok");
  });
});
