import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "../src/appearance.js";
import { setupAssets, setupDeniedHtml, setupPageHtml } from "../src/setupPage.js";

const base = {
  qrSvg: '<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>',
  ipUrls: ["http://192.168.1.5:7788/?token=tok"],
  localUrl: "http://happy-local:7788/?token=tok",
  port: 7788,
  hostname: "happy-local.local",
  assets: { js: "/assets/web/assets/setup-abc.js", css: ["/assets/web/assets/setup-abc.css"] },
  host: { os: "Windows", osVersion: "10.0.22631", bridgeVersion: "0.1.0" },
  serviceRunning: null,
  logPath: "~/.pocketpet/logs/bridge.log",
  appearance: DEFAULT_APPEARANCE,
};

describe("setupPageHtml", () => {
  it("renders the OS-neutral dashboard with Pair, Look and System", () => {
    const html = setupPageHtml(base);
    expect(html).toContain("PocketPet Setup");
    expect(html).toContain("This computer");
    expect(html).toContain("Windows");
    expect(html).toContain("Pair");
    expect(html).toContain("Look");
    expect(html).toContain("System");
    expect(html).toContain("Open phone view");
    expect(html).toContain("Open Studio");
    expect(html).not.toContain("Mac-only");
    expect(html).not.toContain("Mac only");
    expect(html).not.toMatch(/\bMac\b/);
  });

  it("injects only same-origin hashed setup assets and no inline script", () => {
    const html = setupPageHtml(base);
    expect(html).toContain('<script type="module" src="/assets/web/assets/setup-abc.js"></script>');
    expect(html).toContain('<link rel="stylesheet" href="/assets/web/assets/setup-abc.css">');
    expect(html).not.toMatch(/<script(?![^>]*src=)[^>]*>/);
    expect(html).not.toContain("http://evil");
  });

  it("renders the no-JS fallback with QR, URLs, look values and system info", () => {
    const html = setupPageHtml(base);
    expect(html).toContain("<svg");
    expect(html).toContain("?token=tok");
    expect(html).toContain("loopback");
    expect(html).toContain("Clock");
    expect(html).toContain("Pet");
    expect(html).toContain("Bridge version");
  });

  it("embeds the trusted QR SVG and every pairing URL", () => {
    const html = setupPageHtml(base);
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>');
    expect(html).toContain(base.ipUrls[0]!);
    expect(html).toContain(base.localUrl);
    expect(html).toContain("http://127.0.0.1:7788/?token=tok");
  });

  it("opens the phone view on the first LAN URL, falling back to the USB URL", () => {
    expect(setupPageHtml(base)).toContain(`href="${base.ipUrls[0]}" target="_blank" rel="noreferrer">Open phone view</a>`);
    const usbOnly = setupPageHtml({ ...base, ipUrls: [], localUrl: null, qrSvg: "", usbUrl: "http://127.0.0.1:7788/?token=tok" });
    expect(usbOnly).toContain('href="http://127.0.0.1:7788/?token=tok" target="_blank" rel="noreferrer">Open phone view</a>');
    expect(usbOnly).toContain("http://127.0.0.1:7788/?token=tok");
    expect(usbOnly).toContain("adb reverse tcp:7788 tcp:7788");
  });

  it("renders disabled Open Studio and a JavaScript note while the Look editor is absent", () => {
    const html = setupPageHtml(base);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*disabled[^>]*>Open Studio<\/button>/);
    expect(html).toContain("JavaScript");
    expect(html).toContain("100%");
    expect(html).toContain("stack · gap 16");
  });

  it("renders copy targets for URLs, commands and diagnostics without a token in diagnostics", () => {
    const html = setupPageHtml(base);
    expect(html).toContain('id="pair-lan-0"');
    expect(html).toContain('data-copy-target="pair-lan-0"');
    expect(html).toContain('id="pair-usb-url"');
    expect(html).toContain('id="service-status-command"');
    expect(html).toContain('id="service-install-command"');
    expect(html).toContain('id="system-diagnostics"');
    const diagnostics = html.slice(html.indexOf('id="system-diagnostics"')).split("</p>")[0] ?? "";
    expect(diagnostics).toContain("7788");
    expect(diagnostics).toContain("Windows 10.0.22631");
    expect(diagnostics).toContain("0.1.0");
    expect(diagnostics).toContain("bridge.log");
    expect(diagnostics).not.toContain("?token=");
    expect(diagnostics).not.toContain("tok");
  });

  it("omits the QR panel and shows a QR-unavailable note when the SVG is empty", () => {
    const html = setupPageHtml({ ...base, qrSvg: "" });
    expect(html).not.toContain('class="qr"');
    expect(html).not.toContain("point it at the QR code above");
    expect(html).toContain("QR code could not be generated");
  });

  it("omits the .local section when no hostname is available", () => {
    const html = setupPageHtml({ ...base, localUrl: null, hostname: null });
    expect(html).not.toContain("Bonjour");
    expect(html).not.toContain(".local");
  });

  it("escapes injected URLs and hostile hostnames", () => {
    const evil = 'http://192.168.1.5:7788/?token="><script>alert(1)</script>';
    const html = setupPageHtml({ ...base, qrSvg: "<svg></svg>", ipUrls: [evil], localUrl: null, hostname: 'x"><script>alert(1)</script>.local' });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    const htmlWithImage = setupPageHtml({ ...base, localUrl: 'http://x"><img src=x onerror=alert(1)>.local:7788/' });
    expect(htmlWithImage).not.toContain("<img");
    expect(htmlWithImage).toContain("&lt;img");
  });

  it("renders localized dashboard copy in all three languages", () => {
    expect(setupPageHtml({ ...base, lang: "zh-Hant" })).toContain("三步完成配對");
    expect(setupPageHtml({ ...base, lang: "zh-Hant" })).toContain("此電腦");
    expect(setupPageHtml({ ...base, lang: "zh-Hans" })).toContain("三步完成配对");
    expect(setupPageHtml({ ...base, lang: "zh-Hans" })).toContain("这台电脑");
    expect(setupPageHtml({ ...base, lang: "zh-Hans" })).not.toContain("配對");
  });
});

describe("setupDeniedHtml", () => {
  it("uses computer-only denied copy in all languages", () => {
    for (const lang of ["en", "zh-Hant", "zh-Hans"] as const) {
      const html = setupDeniedHtml(7788, lang);
      expect(html).toContain(`<html lang="${lang}">`);
      expect(html).not.toContain("?token=");
      expect(html).not.toContain("Mac-only");
    }
    expect(setupDeniedHtml(7788, "en")).toContain("computer");
    expect(setupDeniedHtml(7788, "zh-Hant")).toContain("電腦");
    expect(setupDeniedHtml(7788, "zh-Hans")).toContain("电脑");
  });
});

describe("setupAssets", () => {
  it("reads the setup entry from a Vite manifest and falls back safely", () => {
    const dir = mkdtempSync(join(tmpdir(), "pocketpet-manifest-"));
    writeFileSync(join(dir, "manifest.json"), JSON.stringify({
      "src/setup/main.ts": { isEntry: true, file: "assets/setup-abc.js", css: ["assets/setup-abc.css"] },
    }));
    expect(setupAssets(dir)).toEqual({
      js: "/assets/web/assets/setup-abc.js",
      css: ["/assets/web/assets/setup-abc.css"],
    });
    rmSync(dir, { recursive: true, force: true });
    expect(setupAssets(dir)).toEqual({ js: "", css: [] });
  });
});
