import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { configPath, ensureConfig, loadConfig, saveConfig } from "../src/config.js";

let home = "";
afterEach(() => { if (home) rmSync(home, { recursive: true, force: true }); });

describe("config store", () => {
  it("creates a config with a long random token and dirs", () => {
    home = mkdtempSync(join(tmpdir(), "foldpet-"));
    const config = ensureConfig(home);
    expect(config.token.length).toBeGreaterThanOrEqual(32);
    expect(config.port).toBe(7788);
    expect(config.activePet).toBeNull();
    expect(JSON.parse(readFileSync(configPath(home), "utf8")).token).toBe(config.token);
    if (process.platform !== "win32") {
      for (const dir of [home, join(home, "pets"), join(home, "cache", "petdex"), join(home, "logs")]) {
        expect(statSync(dir).mode & 0o777).toBe(0o700);
      }
    }
  });

  it("writes config.json with owner-only permissions and no temp file", () => {
    home = mkdtempSync(join(tmpdir(), "foldpet-"));
    ensureConfig(home);
    if (process.platform !== "win32") expect(statSync(configPath(home)).mode & 0o777).toBe(0o600);
    expect(existsSync(`${configPath(home)}.tmp`)).toBe(false);
    saveConfig(home, { ...loadConfig(home), activePet: "local:boba" });
    if (process.platform !== "win32") expect(statSync(configPath(home)).mode & 0o777).toBe(0o600);
    expect(readdirSync(home).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("preserves the token across repeated ensureConfig calls", () => {
    home = mkdtempSync(join(tmpdir(), "foldpet-"));
    const first = ensureConfig(home);
    const second = ensureConfig(home);
    expect(second.token).toBe(first.token);
    expect(loadConfig(home).token).toBe(first.token);
  });

  it("round-trips saved fields", () => {
    home = mkdtempSync(join(tmpdir(), "foldpet-"));
    const config = ensureConfig(home);
    saveConfig(home, { ...config, activePet: "local:boba", quietHours: { start: "23:00", end: "07:00" } });
    expect(loadConfig(home)).toMatchObject({ activePet: "local:boba", quietHours: { start: "23:00", end: "07:00" } });
  });

  it("rejects malformed config", () => {
    home = mkdtempSync(join(tmpdir(), "foldpet-"));
    writeFileSync(configPath(home), "{not json");
    expect(() => loadConfig(home)).toThrow();
  });
});
