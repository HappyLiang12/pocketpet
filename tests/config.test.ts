import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_APPEARANCE, normalizeAppearance } from "../src/appearance.js";
import { configPath, ensureConfig, hardenConfig, loadConfig, saveConfig } from "../src/config.js";
import { platform } from "../src/platform/index.js";
import type { PrivatePaths } from "../src/platform/types.js";

type SecurityRecorder = PrivatePaths & { calls: string[] };

/**
 * Fake platform security for fail-closed tests. It never touches the real home
 * and records every protection request in order.
 */
function fakeSecurity(overrides: Partial<PrivatePaths> = {}): SecurityRecorder {
  const calls: string[] = [];
  return {
    calls,
    protectHome: overrides.protectHome ?? ((path) => { calls.push(`home:${path}`); }),
    protectLogs: overrides.protectLogs ?? ((path) => { calls.push(`logs:${path}`); }),
    protectFile: overrides.protectFile ?? ((path) => { calls.push(`file:${path}`); }),
  };
}

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

describe("config protection", () => {
  it("protects home and logs before writing, and the temp file before the rename", () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const security = fakeSecurity();
    const config = ensureConfig(home, process.env, security);

    expect(config.token.length).toBeGreaterThanOrEqual(32);
    expect(security.calls[0]).toBe(`home:${home}`);
    expect(security.calls).toContain(`logs:${home}`);
    const tmpCall = security.calls.indexOf(`file:${configPath(home)}.tmp`);
    const finalCall = security.calls.indexOf(`file:${configPath(home)}`);
    expect(tmpCall).toBeGreaterThan(-1);
    expect(finalCall).toBeGreaterThan(tmpCall);
    expect(existsSync(configPath(home))).toBe(true);
    expect(readdirSync(home).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("writes nothing when the home cannot be protected", () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const security = fakeSecurity({ protectHome: () => { throw new Error("ACL denied"); } });

    expect(() => ensureConfig(home, process.env, security)).toThrow(/ACL/);
    expect(existsSync(configPath(home))).toBe(false);
  });

  it("leaves no config behind when temp-file protection fails", () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const security = fakeSecurity({ protectFile: () => { throw new Error("ACL denied"); } });

    expect(() => ensureConfig(home, process.env, security)).toThrow(/ACL/);
    expect(existsSync(configPath(home))).toBe(false);
    expect(readdirSync(home).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("keeps a pre-existing config when post-rename verification fails", () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const created = ensureConfig(home);
    const target = configPath(home);
    // Temp-file protection passes; only the post-rename verification fails.
    const security = fakeSecurity({
      protectFile: (path) => {
        if (path === target) throw new Error("ACL verification failed");
      },
    });

    expect(() => saveConfig(home, { ...created, activePet: "local:boba" }, security)).toThrow(/verification/);
    // The token survives: a transient verification error must not destroy it.
    expect(existsSync(target)).toBe(true);
    expect(JSON.parse(readFileSync(target, "utf8")).token).toBe(created.token);
    expect(readdirSync(home).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("never invokes platform protection on a pure load (hook read path)", () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const created = ensureConfig(home);
    const protectHome = vi.spyOn(platform.security, "protectHome");
    const protectLogs = vi.spyOn(platform.security, "protectLogs");
    const protectFile = vi.spyOn(platform.security, "protectFile");
    try {
      // runHook calls exactly this entry point on every hook event.
      expect(loadConfig(home).token).toBe(created.token);
      expect(protectHome).not.toHaveBeenCalled();
      expect(protectLogs).not.toHaveBeenCalled();
      expect(protectFile).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("hardenConfig protects home, logs and the config without changing the token", () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const created = ensureConfig(home);
    const recorder = fakeSecurity();

    expect(hardenConfig(home, recorder).token).toBe(created.token);
    expect(recorder.calls).toEqual([`home:${home}`, `logs:${home}`, `file:${configPath(home)}`]);
  });

  it("hardenConfig refuses an existing config it cannot protect", () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const created = ensureConfig(home);

    const refusals = fakeSecurity({ protectFile: () => { throw new Error("ACL apply failed"); } });
    expect(() => hardenConfig(home, refusals)).toThrow(/ACL/);
    // The original token file is untouched; no new token is generated.
    expect(loadConfig(home).token).toBe(created.token);
  });

  it("hardens an existing config at startup and preserves its token", () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const created = ensureConfig(home);
    const recorder = fakeSecurity();

    expect(ensureConfig(home, process.env, recorder).token).toBe(created.token);
    expect(recorder.calls).toEqual([`home:${home}`, `logs:${home}`, `file:${configPath(home)}`]);
  });

  it("protects the home when saveConfig has to create it", () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    rmSync(home, { recursive: true, force: true });
    const security = fakeSecurity();

    saveConfig(home, {
      token: "t".repeat(32),
      port: 7788,
      activePet: null,
      sleepAfterMinutes: 10,
      quietHours: null,
      appearance: normalizeAppearance(DEFAULT_APPEARANCE),
    }, security);

    expect(security.calls[0]).toBe(`home:${home}`);
    expect(security.calls).toContain(`file:${configPath(home)}.tmp`);
    expect(existsSync(configPath(home))).toBe(true);
  });

  it("refuses to regenerate an existing config that cannot be protected", () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const created = ensureConfig(home);
    const refusals = fakeSecurity({ protectFile: () => { throw new Error("ACL apply failed"); } });

    expect(() => ensureConfig(home, process.env, refusals)).toThrow(/ACL/);
    expect(JSON.parse(readFileSync(configPath(home), "utf8")).token).toBe(created.token);
  });
});
