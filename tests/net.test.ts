import { describe, expect, it } from "vitest";
import { urlsForPort } from "../src/net.js";

const fake = {
  en0: [{ address: "192.168.1.5", family: "IPv4", internal: false, netmask: "255.255.255.0", mac: "aa", cidr: null }],
  utun3: [{ address: "100.64.0.2", family: "IPv4", internal: false, netmask: "255.255.255.0", mac: "bb", cidr: null }],
  lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true, netmask: "255.0.0.0", mac: "cc", cidr: null }],
  en5: [{ address: "169.254.3.3", family: "IPv4", internal: false, netmask: "255.255.0.0", mac: "dd", cidr: null }],
} as never;

describe("urlsForPort", () => {
  it("returns non-internal IPv4 URLs with en first and no link-local", () => {
    const urls = urlsForPort(7788, "tok", fake);
    expect(urls[0]).toBe("http://192.168.1.5:7788/?token=tok");
    expect(urls.some((u) => u.includes("169.254"))).toBe(false);
    expect(urls.some((u) => u.includes("127.0.0.1"))).toBe(false);
  });
});
