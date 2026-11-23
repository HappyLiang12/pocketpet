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

/**
 * Fake mDNS transport with controllable readiness and a socket-failure channel.
 * Readiness defaults to the next microtask so callers that do not care about the
 * bind phase still see a resolved advertisement; pass `autoReady: false` to
 * hold the transport in its pending state.
 */
function fakeTransport(options: { autoReady?: boolean } = {}) {
  const queries: Array<(query: MdnsQuery) => void> = [];
  const failures: Array<(error: Error) => void> = [];
  let ready: (() => void) | null = null;
  let destroyed = 0;
  let markRegistered: () => void = () => {};
  const registered = new Promise<void>((resolve) => {
    markRegistered = resolve;
  });
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
    onReady: (listener) => {
      ready = listener;
      markRegistered();
      if (options.autoReady !== false) queueMicrotask(listener);
    },
    onFailure: (listener) => {
      failures.push(listener);
    },
  };
  return {
    handle,
    listenerCount: () => queries.length,
    destroyCount: () => destroyed,
    /** Resolves once the host has subscribed to the ready channel. */
    registered: () => registered,
    /** Simulates the transport completing its UDP bind. */
    ready: () => ready?.(),
    fail: (error: Error) => {
      for (const listener of [...failures]) listener(error);
    },
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

  it("does not advertise when every candidate address is loopback or non-IPv4", async () => {
    const fake = fakeTransport();
    const createTransport = vi.fn(() => fake.handle);
    const host = createWindowsHost({
      name: "Happy-PC",
      firewallReady: () => true,
      addresses: () => [
        { address: "127.0.0.1", interfaceName: "Loopback Pseudo-Interface 1", rank: 0 },
        { address: "::1", interfaceName: "Loopback Pseudo-Interface 1", rank: 1 },
      ],
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

  it("resolves true only after the transport is ready and hides the name while pending", async () => {
    const fake = fakeTransport({ autoReady: false });
    const host = createWindowsHost({
      name: "Happy-PC",
      firewallReady: () => true,
      addresses,
      createTransport: () => fake.handle,
    });

    let settled: boolean | null = null;
    const started = host.startAdvertisement().then((value) => {
      settled = value;
      return value;
    });

    await fake.registered();
    expect(settled).toBeNull();
    expect(host.localHostname()).toBeNull();
    expect(fake.listenerCount()).toBe(0);

    fake.ready();

    await expect(started).resolves.toBe(true);
    expect(host.localHostname()).toBe("happy-pc.local");
    expect(fake.listenerCount()).toBe(1);
  });

  it("resolves false on the first asynchronous bind error and destroys the transport", async () => {
    const fake = fakeTransport({ autoReady: false });
    const host = createWindowsHost({
      name: "happy-pc",
      firewallReady: () => true,
      addresses,
      createTransport: () => fake.handle,
    });

    const started = host.startAdvertisement();
    await fake.registered();
    expect(host.localHostname()).toBeNull();

    fake.fail(new Error("EADDRINUSE: bind EADDRINUSE 0.0.0.0:5353"));

    await expect(started).resolves.toBe(false);
    expect(host.localHostname()).toBeNull();
    expect(fake.listenerCount()).toBe(0);
    expect(fake.destroyCount()).toBe(1);
  });

  it("gives up on a transport that never confirms its bind", async () => {
    vi.useFakeTimers();
    try {
      const fake = fakeTransport({ autoReady: false });
      const host = createWindowsHost({
        name: "happy-pc",
        firewallReady: () => true,
        addresses,
        createTransport: () => fake.handle,
      });

      const started = host.startAdvertisement();
      await fake.registered();
      await vi.advanceTimersByTimeAsync(2500);

      await expect(started).resolves.toBe(false);
      expect(host.localHostname()).toBeNull();
      expect(fake.destroyCount()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("abandons the pending start when the advertisement is stopped", async () => {
    const fake = fakeTransport({ autoReady: false });
    const host = createWindowsHost({
      name: "happy-pc",
      firewallReady: () => true,
      addresses,
      createTransport: () => fake.handle,
    });

    const started = host.startAdvertisement();
    await fake.registered();
    await host.stopAdvertisement();

    await expect(started).resolves.toBe(false);
    expect(host.localHostname()).toBeNull();
    expect(fake.destroyCount()).toBe(1);
  });

  it("destroys a transport whose listener setup throws", async () => {
    const fake = fakeTransport();
    const failingTransport: MdnsTransport = {
      ...fake.handle.transport,
      on: () => {
        throw new Error("listener setup failed");
      },
    };
    const host = createWindowsHost({
      name: "happy-pc",
      firewallReady: () => true,
      addresses,
      createTransport: () => ({ ...fake.handle, transport: failingTransport }),
    });

    await expect(host.startAdvertisement()).resolves.toBe(false);
    expect(host.localHostname()).toBeNull();
    expect(fake.destroyCount()).toBe(1);
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
