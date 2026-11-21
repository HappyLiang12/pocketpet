import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
