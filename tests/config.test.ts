import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE, normalizeAppearance } from "../src/appearance.js";
import { configPath, ensureConfig, loadConfig, saveConfig } from "../src/config.js";

let home = "";
let savedPort: string | undefined;
beforeEach(() => {
  savedPort = process.env.POCKETPET_PORT;
  // An ambient POCKETPET_PORT from the developer shell must not change the default-port expectations.
  delete process.env.POCKETPET_PORT;
});
afterEach(() => {
  if (savedPort === undefined) delete process.env.POCKETPET_PORT;
  else process.env.POCKETPET_PORT = savedPort;
  if (home) rmSync(home, { recursive: true, force: true });
});

describe("config store", () => {
  it("creates a config with a long random token and dirs", () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const config = ensureConfig(home);
    expect(config.token.length).toBeGreaterThanOrEqual(32);
    expect(config.port).toBe(7788);
    expect(config.activePet).toBeNull();
    expect(config.appearance).toEqual(DEFAULT_APPEARANCE);
    expect(JSON.parse(readFileSync(configPath(home), "utf8")).token).toBe(config.token);
    if (process.platform !== "win32") {
      for (const dir of [home, join(home, "pets"), join(home, "cache", "petdex"), join(home, "logs")]) {
        expect(statSync(dir).mode & 0o777).toBe(0o700);
      }
    }
  });

  it("writes config.json with owner-only permissions and no temp file", () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    ensureConfig(home);
    if (process.platform !== "win32") expect(statSync(configPath(home)).mode & 0o777).toBe(0o600);
    expect(existsSync(`${configPath(home)}.tmp`)).toBe(false);
    saveConfig(home, { ...loadConfig(home), activePet: "local:boba" });
    if (process.platform !== "win32") expect(statSync(configPath(home)).mode & 0o777).toBe(0o600);
    expect(readdirSync(home).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("preserves the token across repeated ensureConfig calls", () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const first = ensureConfig(home);
    const second = ensureConfig(home);
    expect(second.token).toBe(first.token);
    expect(loadConfig(home).token).toBe(first.token);
  });

  it("round-trips saved fields", () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const config = ensureConfig(home);
    saveConfig(home, { ...config, activePet: "local:boba", quietHours: { start: "23:00", end: "07:00" } });
    expect(loadConfig(home)).toMatchObject({ activePet: "local:boba", quietHours: { start: "23:00", end: "07:00" } });
  });

  it("defaults appearance for old configs", () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    writeFileSync(configPath(home), JSON.stringify({
      token: "legacy-token-0123456789",
      port: 7788,
      activePet: null,
      sleepAfterMinutes: 10,
      quietHours: null,
    }));
    expect(loadConfig(home).appearance).toEqual(DEFAULT_APPEARANCE);
  });

  it("round-trips a normalized appearance", () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const config = ensureConfig(home);
    const appearance = normalizeAppearance({ ...DEFAULT_APPEARANCE, theme: "light", clock: { scale: 140 } });
    saveConfig(home, { ...config, appearance });
    expect(loadConfig(home).appearance).toEqual(appearance);
  });

  it("rejects malformed config", () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    writeFileSync(configPath(home), "{not json");
    expect(() => loadConfig(home)).toThrow();
  });
});

describe("POCKETPET_PORT override on first creation", () => {
  it("creates a new config on the requested port", () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    process.env.POCKETPET_PORT = "0";

    expect(ensureConfig(home).port).toBe(0);
    expect(loadConfig(home).port).toBe(0);
  });

  it("accepts another valid port", () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    process.env.POCKETPET_PORT = "9099";

    expect(ensureConfig(home).port).toBe(9099);
  });

  it("never overrides a config that already exists", () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const created = ensureConfig(home);
    expect(created.port).toBe(7788);
    process.env.POCKETPET_PORT = "0";

    expect(ensureConfig(home).port).toBe(7788);
    expect(loadConfig(home).port).toBe(7788);
  });

  it("falls back to 7788 for an invalid value", () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    for (const value of ["abc", "-1", "65536", "70000", "", "12.5"]) {
      rmSync(configPath(home), { force: true });
      process.env.POCKETPET_PORT = value;
      expect(ensureConfig(home).port, `value: ${JSON.stringify(value)}`).toBe(7788);
    }
  });
});
