import { describe, expect, it } from "vitest";
import { askYesNo, localHostname, pairingLinks, setupDeniedHtml, setupHtml } from "../src/onboarding.js";

const fakeIfaces = {
  en0: [{ address: "192.168.1.5", family: "IPv4", internal: false, netmask: "255.255.255.0", mac: "aa", cidr: null }],
  utun3: [{ address: "100.64.0.2", family: "IPv4", internal: false, netmask: "255.255.255.0", mac: "bb", cidr: null }],
} as never;

describe("localHostname", () => {
  it("trims the scutil output and appends .local when missing", () => {
    const calls: string[][] = [];
    const run = (command: string, args: string[]): string => {
      calls.push([command, ...args]);
      return "  Happy-MacBook  \n";
    };
    expect(localHostname(run)).toBe("Happy-MacBook.local");
    expect(calls).toEqual([["scutil", "--get", "LocalHostName"]]);
  });

  it("keeps an existing .local suffix", () => {
    expect(localHostname(() => "happy-mac.local\n")).toBe("happy-mac.local");
  });

  it("returns null when scutil fails", () => {
    expect(
      localHostname(() => {
        throw new Error("boom");
      }),
    ).toBeNull();
  });

  it("returns null when scutil prints nothing", () => {
    expect(localHostname(() => "  \n")).toBeNull();
  });
});

describe("pairingLinks", () => {
  it("lists IP URLs in urlsForPort order and picks the first IP for the QR by default", () => {
    const links = pairingLinks(7788, "tok", { interfaces: fakeIfaces, hostname: "happy-mac.local" });
    expect(links.ipUrls).toEqual([
      "http://192.168.1.5:7788/?token=tok",
      "http://100.64.0.2:7788/?token=tok",
    ]);
    expect(links.localUrl).toBe("http://happy-mac.local:7788/?token=tok");
    expect(links.qrUrl).toBe("http://192.168.1.5:7788/?token=tok");
    expect(links.usbUrl).toBe("http://127.0.0.1:7788/?token=tok");
  });

  it("uses the .local URL for the QR when qrHost is local", () => {
    const links = pairingLinks(7788, "tok", {
      interfaces: fakeIfaces,
      hostname: "happy-mac.local",
      qrHost: "local",
    });
    expect(links.qrUrl).toBe("http://happy-mac.local:7788/?token=tok");
  });

  it("falls back to the first IP when qrHost is local but no hostname is known", () => {
    const links = pairingLinks(7788, "tok", { interfaces: fakeIfaces, hostname: null, qrHost: "local" });
    expect(links.localUrl).toBeNull();
    expect(links.qrUrl).toBe("http://192.168.1.5:7788/?token=tok");
  });

  it("encodes the token in the IP, .local and USB URLs", () => {
    const links = pairingLinks(7788, "a b&c", { interfaces: fakeIfaces, hostname: "happy-mac.local" });
    expect(links.ipUrls[0]).toBe("http://192.168.1.5:7788/?token=a%20b%26c");
    expect(links.localUrl).toBe("http://happy-mac.local:7788/?token=a%20b%26c");
    expect(links.usbUrl).toBe("http://127.0.0.1:7788/?token=a%20b%26c");
  });

  it("returns null QR and local URLs but keeps the tokenized USB URL when no LAN address exists", () => {
    const links = pairingLinks(7788, "tok", { interfaces: {} as never, hostname: null });
    expect(links).toEqual({ ipUrls: [], localUrl: null, qrUrl: null, usbUrl: "http://127.0.0.1:7788/?token=tok" });
  });

  it("keeps the QR null with no IP even when a .local name exists and qrHost is ip", () => {
    const links = pairingLinks(7788, "tok", { interfaces: {} as never, hostname: "happy-mac.local" });
    expect(links.localUrl).toBe("http://happy-mac.local:7788/?token=tok");
    expect(links.qrUrl).toBeNull();
    expect(links.usbUrl).toBe("http://127.0.0.1:7788/?token=tok");
  });
});

describe("setupHtml", () => {
  const base = {
    qrSvg: '<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>',
    ipUrls: ["http://192.168.1.5:7788/?token=tok", "http://100.64.0.2:7788/?token=tok"],
    localUrl: "http://happy-mac.local:7788/?token=tok",
    port: 7788,
  };

  it("embeds the trusted QR SVG and every pairing URL", () => {
    const html = setupHtml(base);
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>');
    for (const url of base.ipUrls) expect(html).toContain(url);
    expect(html).toContain(base.localUrl);
  });

  it("includes the three pairing steps, the .local option and the USB fallback", () => {
    const html = setupHtml(base);
    expect(html).toContain("同一個 Wi-Fi");
    expect(html).toContain("相機");
    expect(html).toContain("加到主畫面");
    expect(html).toContain("可以重複使用");
    expect(html).toContain("只供 Mac");
    expect(html).toContain("Bonjour");
    expect(html).toContain("adb reverse tcp:7788 tcp:7788");
    expect(html).toContain("http://127.0.0.1:7788/?token=tok");
  });

  it("explains Mac-only access to the setup page without a token", () => {
    const html = setupDeniedHtml(7788);
    expect(html).toContain("只限 Mac");
    expect(html).toContain("127.0.0.1:7788");
    expect(html).toContain("重複使用");
    expect(html).not.toContain("?token=");
  });

  it("uses an explicit usbUrl, keeping the token even when no LAN URL exists", () => {
    const html = setupHtml({
      qrSvg: "",
      ipUrls: [],
      localUrl: null,
      port: 7788,
      usbUrl: "http://127.0.0.1:7788/?token=a%20b%26c",
    });
    expect(html).toContain("http://127.0.0.1:7788/?token=a%20b%26c");
    expect(html).toContain("adb reverse tcp:7788 tcp:7788");
  });

  it("omits the QR card and shows a QR-unavailable note when the SVG is empty", () => {
    const html = setupHtml({ ...base, qrSvg: "" });
    expect(html).not.toContain('class="qr"');
    expect(html).not.toContain("對準上面嘅 QR code");
    expect(html).toContain("QR code 暫時無法產生");
    expect(html).toContain("http://192.168.1.5:7788/?token=tok");
  });

  it("omits the .local section when no hostname is available", () => {
    const html = setupHtml({ ...base, localUrl: null });
    expect(html).not.toContain("Bonjour");
    expect(html).not.toContain(".local");
  });

  it("escapes injected URLs and has no external scripts or assets", () => {
    const evil = 'http://192.168.1.5:7788/?token="><script>alert(1)</script>';
    const html = setupHtml({ ...base, qrSvg: "<svg></svg>", ipUrls: [evil], localUrl: null });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<link");
    expect(html).not.toContain("<script");
  });

  it("escapes a hostile .local URL too", () => {
    const html = setupHtml({ ...base, localUrl: 'http://x"><img src=x onerror=alert(1)>.local:7788/' });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("askYesNo", () => {
  it("returns the default without prompting when not a TTY", async () => {
    let called = false;
    const result = await askYesNo("Install hooks?", true, false, async () => {
      called = true;
      return "n";
    });
    expect(result).toBe(true);
    expect(called).toBe(false);
  });

  it("returns a false default without prompting when not a TTY", async () => {
    let called = false;
    const result = await askYesNo("Start service?", false, false, async () => {
      called = true;
      return "y";
    });
    expect(result).toBe(false);
    expect(called).toBe(false);
  });

  it("prompts on a TTY and accepts y/yes/n/no", async () => {
    const prompts: string[] = [];
    const ask = async (question: string): Promise<string> => {
      prompts.push(question);
      return "y";
    };
    await expect(askYesNo("Install?", false, true, ask)).resolves.toBe(true);
    expect(prompts[0]).toContain("[y/N]");

    await expect(askYesNo("Install?", false, true, async () => "yes")).resolves.toBe(true);
    await expect(askYesNo("Install?", true, true, async () => "N")).resolves.toBe(false);
    await expect(askYesNo("Install?", true, true, async () => "no")).resolves.toBe(false);
  });

  it("uses the default for an empty answer and labels it in the prompt", async () => {
    const prompts: string[] = [];
    const ask = async (question: string): Promise<string> => {
      prompts.push(question);
      return "  ";
    };
    await expect(askYesNo("Install?", true, true, ask)).resolves.toBe(true);
    expect(prompts[0]).toContain("[Y/n]");
  });
});
