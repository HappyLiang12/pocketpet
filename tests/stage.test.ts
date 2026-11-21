import { describe, expect, it } from "vitest";
import { formatClock, resolveMotion, resolveTheme } from "../web/src/look/stage.js";

describe("formatClock", () => {
  const date = new Date("2026-11-21T16:50:00");

  it("formats 24-hour time by default", () => {
    expect(formatClock("en", "24h", date).time).toBe("16:50");
  });

  it("formats 12-hour time with a day period", () => {
    expect(formatClock("en", "12h", date).time).toMatch(/4:50\s*PM/i);
  });

  it("uses the selected language for the date", () => {
    expect(formatClock("zh-Hans", "24h", date).date).toContain("11月");
    expect(formatClock("zh-Hant", "24h", date).date).toContain("11月");
  });
});

describe("theme and motion resolution", () => {
  it("resolves system values through the injected media preference", () => {
    expect(resolveTheme("system", () => true)).toBe("dark");
    expect(resolveTheme("system", () => false)).toBe("light");
    expect(resolveTheme("light", () => true)).toBe("light");
    expect(resolveTheme("dark", () => false)).toBe("dark");
    expect(resolveMotion("system", () => true)).toBe("reduced");
    expect(resolveMotion("system", () => false)).toBe("full");
    expect(resolveMotion("full", () => true)).toBe("full");
    expect(resolveMotion("reduced", () => false)).toBe("reduced");
  });
});
