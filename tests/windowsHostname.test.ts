import { describe, expect, it } from "vitest";
import { pairingLinks } from "../src/onboarding.js";
import { sanitizeHostname, windowsHost } from "../src/platform/windows/hostname.js";

const fakeIfaces = {
  "Wi-Fi": [{ address: "192.168.1.2", family: "IPv4", internal: false, netmask: "255.255.255.0", mac: "aa", cidr: null }],
} as never;

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

describe("windowsHost", () => {
  it("does not claim a .local name before advertisement is active", async () => {
    expect(windowsHost.localHostname()).toBeNull();
    await expect(windowsHost.startAdvertisement()).resolves.toBe(false);
    expect(windowsHost.localHostname()).toBeNull();
    await windowsHost.stopAdvertisement();
    expect(windowsHost.localHostname()).toBeNull();
  });

  it("leaves pairing without a .local URL until advertisement succeeds", () => {
    const links = pairingLinks(7788, "tok", {
      interfaces: fakeIfaces,
      hostname: windowsHost.localHostname(),
    });
    expect(links.localUrl).toBeNull();
    expect(links.qrUrl).toBe("http://192.168.1.2:7788/?token=tok");
  });
});
