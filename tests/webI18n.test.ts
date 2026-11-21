import { describe, expect, it } from "vitest";
import {
  LANGS,
  STRINGS,
  isLang,
  langName,
  localeFor,
  minutesLabel,
  normalizeLangTag,
  t,
  type Lang,
} from "../web/src/i18n.js";

describe("dictionary", () => {
  it("has identical keys in every language", () => {
    const reference = Object.keys(STRINGS.en).sort();
    expect(reference.length).toBeGreaterThan(0);
    for (const lang of LANGS) {
      expect(Object.keys(STRINGS[lang]).sort(), lang).toEqual(reference);
    }
  });

  it("has no empty or untranslated-placeholder values", () => {
    for (const lang of LANGS) {
      for (const [key, value] of Object.entries(STRINGS[lang])) {
        expect(value.trim(), `${lang} ${key}`).not.toBe("");
      }
    }
  });

  it("keeps the three language names in their native script", () => {
    expect(langName("en")).toBe("English");
    expect(langName("zh-Hant")).toBe("繁體中文");
    expect(langName("zh-Hans")).toBe("简体中文");
    // Native names never change with the UI language.
    for (const lang of LANGS) {
      expect(STRINGS[lang]["lang.en"]).toBe("English");
      expect(STRINGS[lang]["lang.zhHant"]).toBe("繁體中文");
      expect(STRINGS[lang]["lang.zhHans"]).toBe("简体中文");
    }
  });

  it("has the bottom-sheet and About keys in every language", () => {
    for (const key of ["sheet.live", "sheet.look", "sheet.about", "live.editLook", "about.language", "about.computer"] as const) {
      // `t` falls back to the key itself, so assert dictionary membership too.
      for (const lang of LANGS) {
        expect(Object.prototype.hasOwnProperty.call(STRINGS[lang], key), `${lang} ${key}`).toBe(true);
        expect(t(lang, key)).not.toBe(key);
      }
    }
  });

  it("does not mention a Mac-only setup page", () => {
    for (const lang of LANGS) {
      expect(t(lang, "trouble.setupTitle")).not.toContain("Mac");
      expect(t(lang, "trouble.setupTitle")).not.toContain("Mac-only");
      expect(t(lang, "trouble.setupTitle")).not.toContain("只限 Mac");
    }
  });

  it("localizes every wake status with the existing Traditional Chinese copy", () => {
    expect({
      active: t("zh-Hant", "wake.active"),
      idle: t("zh-Hant", "wake.idle"),
      denied: t("zh-Hant", "wake.denied"),
      unsupported: t("zh-Hant", "wake.unsupported"),
      insecure: t("zh-Hant", "wake.insecure"),
    }).toEqual({
      active: "已啟用",
      idle: "待命",
      denied: "已拒絕",
      unsupported: "不支援",
      insecure: "非安全連線，請設定螢幕逾時",
    });
  });
});

describe("normalizeLangTag", () => {
  const cases: Array<[string, Lang]> = [
    ["zh-Hans", "zh-Hans"],
    ["zh-Hans-CN", "zh-Hans"],
    ["zh-CN", "zh-Hans"],
    ["zh-SG", "zh-Hans"],
    ["zh", "zh-Hant"],
    ["zh-Hant", "zh-Hant"],
    ["zh-Hant-TW", "zh-Hant"],
    ["zh-TW", "zh-Hant"],
    ["zh-HK", "zh-Hant"],
    ["zh-MO", "zh-Hant"],
    ["en", "en"],
    ["en-US", "en"],
    ["en-GB", "en"],
    ["fr-FR", "en"],
    ["", "en"],
  ];

  it.each(cases)("maps %s to %s", (tag, expected) => {
    expect(normalizeLangTag(tag)).toBe(expected);
  });

  it("defaults to English for missing tags", () => {
    expect(normalizeLangTag(undefined)).toBe("en");
    expect(normalizeLangTag(null)).toBe("en");
  });

  it("is case-insensitive", () => {
    expect(normalizeLangTag("ZH-cn")).toBe("zh-Hans");
    expect(normalizeLangTag("zh-tw")).toBe("zh-Hant");
    expect(normalizeLangTag("EN-us")).toBe("en");
  });
});

describe("t", () => {
  it("returns the requested language", () => {
    expect(t("en", "conn.connected")).toBe("Connected");
    expect(t("zh-Hant", "conn.connected")).toBe("已連線");
    expect(t("zh-Hans", "conn.connected")).toBe("已连接");
    expect(t("en", "phase.working")).toBe("Working");
    expect(t("zh-Hant", "phase.working")).toBe("工作中");
    expect(t("zh-Hans", "phase.working")).toBe("工作中");
  });

  it("has distinct prefixes for every language", () => {
    expect(t("en", "wake.prefix")).toBe("Screen awake: ");
    expect(t("zh-Hant", "wake.prefix")).toBe("螢幕長亮：");
    expect(t("zh-Hans", "wake.prefix")).toBe("屏幕常亮：");
  });
});

describe("localeFor", () => {
  it("returns the language tag unchanged", () => {
    for (const lang of LANGS) expect(localeFor(lang)).toBe(lang);
  });
});

describe("minutesLabel", () => {
  it("uses the localized minutes unit", () => {
    expect(minutesLabel("en", 0)).toBe("0 min");
    expect(minutesLabel("en", 3)).toBe("3 min");
    expect(minutesLabel("zh-Hant", 12)).toBe("12 分鐘");
    expect(minutesLabel("zh-Hans", 7)).toBe("7 分钟");
  });

  it("rounds and clamps negative values", () => {
    expect(minutesLabel("en", 2.6)).toBe("3 min");
    expect(minutesLabel("en", -5)).toBe("0 min");
  });
});

describe("isLang", () => {
  it("accepts only the three UI languages", () => {
    expect(isLang("en")).toBe(true);
    expect(isLang("zh-Hant")).toBe(true);
    expect(isLang("zh-Hans")).toBe(true);
    expect(isLang("zh-TW")).toBe(false);
    expect(isLang("zh-hant")).toBe(false);
    expect(isLang(null)).toBe(false);
    expect(isLang(undefined)).toBe(false);
  });
});
