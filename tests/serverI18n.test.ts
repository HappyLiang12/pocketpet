import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "../src/appearance.js";
import { languageNames, pairingCopy, pickLanguage, setupCopy, type Lang } from "../src/i18n.js";
import { setupDeniedHtml, setupPageHtml } from "../src/setupPage.js";

const langs: Lang[] = ["en", "zh-Hant", "zh-Hans"];

const base = {
  qrSvg: '<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>',
  ipUrls: ["http://192.168.1.5:7788/?token=tok"],
  localUrl: "http://happy-local:7788/?token=tok",
  port: 7788,
  hostname: "happy-local.local",
  assets: { js: "/assets/web/assets/setup-abc.js", css: ["/assets/web/assets/setup-abc.css"] },
  host: { os: "Windows", osVersion: "10.0.22631", bridgeVersion: "0.1.0" },
  serviceRunning: false,
  logPath: "~/.pocketpet/logs/bridge.log",
  appearance: DEFAULT_APPEARANCE,
};

describe("pickLanguage", () => {
  it("prefers the ?lang value and matches it case-insensitively", () => {
    expect(pickLanguage("en-US", "zh-Hant")).toBe("zh-Hant");
    expect(pickLanguage(null, "ZH-HANS")).toBe("zh-Hans");
    expect(pickLanguage("zh-TW", "en")).toBe("en");
  });

  it("ignores an unsupported ?lang value and falls back to the header", () => {
    expect(pickLanguage("zh-CN", "fr")).toBe("zh-Hans");
    expect(pickLanguage("zh-TW", "")).toBe("zh-Hant");
  });

  it("maps Simplified Chinese Accept-Language variants", () => {
    for (const header of ["zh-CN", "zh-SG", "zh-Hans", "zh-Hans-CN", "zh-cn,zh;q=0.9"]) {
      expect(pickLanguage(header), header).toBe("zh-Hans");
    }
  });

  it("maps other Chinese variants to Traditional", () => {
    for (const header of ["zh-TW", "zh-HK", "zh-Hant", "zh-Hant-TW", "zh-MO"]) {
      expect(pickLanguage(header), header).toBe("zh-Hant");
    }
  });

  it("maps English and defaults to English", () => {
    expect(pickLanguage("en")).toBe("en");
    expect(pickLanguage("en-US,en;q=0.9")).toBe("en");
    expect(pickLanguage("fr-FR,de;q=0.8")).toBe("en");
    expect(pickLanguage(null)).toBe("en");
    expect(pickLanguage(undefined)).toBe("en");
    expect(pickLanguage("")).toBe("en");
  });

  it("honours the order of Accept-Language tags", () => {
    expect(pickLanguage("en-US,zh-CN;q=0.9")).toBe("en");
    expect(pickLanguage("zh-TW,en-US;q=0.9")).toBe("zh-Hant");
  });

  it("normalizes POSIX LANG values", () => {
    expect(pickLanguage("zh_TW.UTF-8")).toBe("zh-Hant");
    expect(pickLanguage("zh_CN.UTF-8")).toBe("zh-Hans");
    expect(pickLanguage("en_GB.UTF-8")).toBe("en");
  });
});

describe("dictionaries", () => {
  it("has identical setup keys in every language", () => {
    const reference = Object.keys(setupCopy.en).sort();
    expect(Object.keys(setupCopy["zh-Hant"]).sort()).toEqual(reference);
    expect(Object.keys(setupCopy["zh-Hans"]).sort()).toEqual(reference);
  });

  it("has identical pairing keys in every language", () => {
    const reference = Object.keys(pairingCopy.en).sort();
    expect(Object.keys(pairingCopy["zh-Hant"]).sort()).toEqual(reference);
    expect(Object.keys(pairingCopy["zh-Hans"]).sort()).toEqual(reference);
  });

  it("never has empty copy", () => {
    for (const lang of langs) {
      for (const [key, value] of Object.entries(setupCopy[lang])) {
        expect(value.trim(), `${lang} setupCopy.${key}`).not.toBe("");
      }
      for (const [key, value] of Object.entries(pairingCopy[lang])) {
        expect(value.trim(), `${lang} pairingCopy.${key}`).not.toBe("");
      }
    }
  });

  it("has no generic Mac references in the setup copy", () => {
    for (const lang of langs) {
      for (const [key, value] of Object.entries(setupCopy[lang])) {
        expect(value, `${lang} setupCopy.${key}`).not.toMatch(/\bMac\b/);
      }
    }
  });

  it("uses native language labels and a distinct Simplified translation", () => {
    expect(languageNames).toEqual({ en: "English", "zh-Hant": "繁體中文", "zh-Hans": "简体中文" });
    expect(setupCopy["zh-Hans"].stepsHeading).not.toBe(setupCopy["zh-Hant"].stepsHeading);
    expect(pairingCopy["zh-Hans"].stepsHeading).not.toBe(pairingCopy["zh-Hant"].stepsHeading);
  });
});

describe("setupPageHtml copy", () => {
  it("renders English by default with the language switcher and dashboard sections", () => {
    const html = setupPageHtml(base);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("PocketPet Setup");
    expect(html).toContain("This computer");
    expect(html).toContain("Pair in three steps");
    expect(html).toContain("Same Wi-Fi");
    expect(html).toContain("Scan with the camera");
    expect(html).toContain("Add to Home Screen");
    expect(html).toContain("LAN URLs");
    expect(html).toContain("Stable address (Bonjour)");
    expect(html).toContain("Different Wi-Fi? Use a USB cable");
    expect(html).toContain("Phone can't connect?");
    expect(html).toContain("ERR_TOO_MANY_RETRIES");
    expect(html).toContain("unauthorized");
    expect(html).toContain("reusable until token changes");
    expect(html).toContain("Open phone view");
    expect(html).toContain("Bridge version");
    for (const lang of langs) expect(html).toContain(`href="?lang=${lang}"`);
    expect(html).toContain("English");
    expect(html).toContain("繁體中文");
    expect(html).toContain("简体中文");
    expect(html).not.toMatch(/\bMac\b/);
  });

  it("renders Traditional Chinese", () => {
    const html = setupPageHtml({ ...base, lang: "zh-Hant" });
    expect(html).toContain('<html lang="zh-Hant">');
    expect(html).toContain("三步完成配對");
    expect(html).toContain("同一個 Wi-Fi");
    expect(html).toContain("用相機掃描");
    expect(html).toContain("加到主畫面");
    expect(html).toContain("區網網址");
    expect(html).toContain("偵錯資料");
    expect(html).toContain("更改 token 前可重複使用");
    expect(html).toContain("此電腦");
    expect(html).not.toContain("Pair in three steps");
  });

  it("renders Simplified Chinese without Traditional wording", () => {
    const html = setupPageHtml({ ...base, lang: "zh-Hans" });
    expect(html).toContain('<html lang="zh-Hans">');
    expect(html).toContain("三步完成配对");
    expect(html).toContain("同一个 Wi-Fi");
    expect(html).toContain("用相机扫描");
    expect(html).toContain("添加到主屏幕");
    expect(html).toContain("局域网网址");
    expect(html).toContain("调试信息");
    expect(html).toContain("更改 token 前可重复使用");
    expect(html).toContain("这台电脑");
    expect(html).not.toContain("配對");
    expect(html).not.toContain("區網");
  });

  it("translates the QR-unavailable note", () => {
    expect(setupPageHtml({ ...base, qrSvg: "" })).toContain("QR code could not be generated");
    expect(setupPageHtml({ ...base, qrSvg: "", lang: "zh-Hant" })).toContain("QR code 暫時無法產生");
    expect(setupPageHtml({ ...base, qrSvg: "", lang: "zh-Hans" })).toContain("二维码暂时无法生成");
  });

  it("fills the USB URL placeholder with the escaped tokenized URL", () => {
    const html = setupPageHtml(base);
    expect(html).toContain("http://127.0.0.1:7788/?token=tok");
    expect(html).not.toContain("{usbUrl}");
    expect(html).not.toContain("{setupUrl}");
  });

  it("has no off-origin scripts, styles or images in any language", () => {
    for (const lang of langs) {
      const html = setupPageHtml({ ...base, lang });
      expect(html, lang).not.toContain("<img");
      expect(html, lang).not.toMatch(/<script(?![^>]*src=)[^>]*>/);
      expect(html, lang).not.toMatch(/<script[^>]*src="(?!\/assets\/web\/)/);
      expect(html, lang).not.toMatch(/<link[^>]*href="(?!\/assets\/web\/)/);
    }
  });
});

describe("setupPageHtml debug section", () => {
  it("shows port, hostname, QR host, scope and validity", () => {
    const html = setupPageHtml(base);
    expect(html).toContain("<strong>Port</strong>: <code>7788</code>");
    expect(html).toContain("<strong>Hostname</strong>: <code>happy-local.local</code>");
    expect(html).toContain("<strong>QR host</strong>: <code>ip</code>");
    expect(html).toContain("Setup page scope");
    expect(html).toContain("loopback-only");
    expect(html).toContain("QR validity");
    expect(html).toContain("reusable until token changes");
    expect(html).not.toContain("loopback-only / Mac");
  });

  it("reports no QR and an unknown hostname when absent", () => {
    const html = setupPageHtml({ ...base, qrSvg: "", localUrl: null, hostname: null });
    expect(html).toContain("<strong>QR host</strong>: <code>none</code>");
    expect(html).toContain("<strong>Hostname</strong>: <code>unknown</code>");
  });

  it("reports the .local host when the QR has no IP URL", () => {
    const html = setupPageHtml({ ...base, ipUrls: [] });
    expect(html).toContain("<strong>QR host</strong>: <code>local</code>");
  });

  it("escapes a hostile hostname", () => {
    const html = setupPageHtml({ ...base, hostname: 'x"><script>alert(1)</script>.local' });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("does not print the token in the debug section", () => {
    const html = setupPageHtml({
      ...base,
      qrSvg: "",
      ipUrls: [],
      localUrl: null,
      hostname: null,
      usbUrl: "http://127.0.0.1:7788/?token=SECRET_TOKEN_VALUE",
    });
    const debug = html.slice(html.indexOf('class="debug"')).split("</details>")[0] ?? "";
    expect(debug).not.toContain("SECRET_TOKEN_VALUE");
    expect(debug).not.toContain("?token=");
  });
});

describe("setupDeniedHtml", () => {
  it("uses computer-only copy in all three languages without a token", () => {
    const phrases: Record<Lang, string> = { en: "computer", "zh-Hant": "電腦", "zh-Hans": "电脑" };
    for (const lang of langs) {
      const html = setupDeniedHtml(7788, lang);
      expect(html, lang).toContain(`<html lang="${lang}">`);
      expect(html, lang).toContain(phrases[lang]);
      expect(html, lang).toContain("127.0.0.1:7788");
      expect(html, lang).not.toContain("?token=");
      expect(html, lang).not.toContain("{setupUrl}");
      expect(html, lang).not.toContain("Mac-only");
      expect(html, lang).not.toContain("<script");
    }
  });

  it("defaults to English", () => {
    expect(setupDeniedHtml(7788)).toContain('<html lang="en">');
  });
});
