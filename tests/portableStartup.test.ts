import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServiceConfig } from "../src/platform/types.js";
import {
  defaultPortableStartupDir,
  installPortableStartup,
  portableStartupPaths,
  portableStartupStatus,
  uninstallPortableStartup,
} from "../src/platform/windows/startup.js";

let root = "";
let home = "";
let startupDir = "";
let cfg: ServiceConfig;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pocketpet-portable-test-"));
  home = join(root, "home");
  startupDir = join(root, "Startup");
  mkdirSync(join(home, "dist"), { recursive: true });
  mkdirSync(startupDir, { recursive: true });
  writeFileSync(join(home, "dist", "cli.js"), "// compiled cli\n");
  cfg = { home, nodePath: process.execPath, cliPath: join(home, "dist", "cli.js"), port: 7788 };
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function deps() {
  return {
    startupDir,
    protectLogs: vi.fn(),
    protectFile: vi.fn(),
  };
}

describe("defaultPortableStartupDir", () => {
  it("uses the per-user Startup folder from APPDATA", () => {
    expect(defaultPortableStartupDir({ APPDATA: "C:\\Users\\liangha\\AppData\\Roaming" })).toBe(
      "C:\\Users\\liangha\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup",
    );
  });

  it("fails when APPDATA is unavailable", () => {
    expect(() => defaultPortableStartupDir({})).toThrow(/APPDATA/i);
  });
});

describe("portable startup adapter", () => {
  it("writes a hidden token-free launcher and UTF-16LE Startup entry", () => {
    const injected = deps();
    installPortableStartup(cfg, injected);

    const paths = portableStartupPaths(home, startupDir);
    expect(existsSync(paths.launcher)).toBe(true);
    expect(existsSync(paths.entry)).toBe(true);

    const launcher = readFileSync(paths.launcher);
    expect([...launcher.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const launcherText = launcher.subarray(3).toString("utf8");
    expect(launcherText).toContain(cfg.nodePath);
    expect(launcherText).toContain(cfg.cliPath);
    expect(launcherText).toContain("run --service");
    expect(launcherText).not.toMatch(/token=|http:\/\//i);

    const entry = readFileSync(paths.entry);
    expect([...entry.subarray(0, 2)]).toEqual([0xff, 0xfe]);
    const entryText = entry.subarray(2).toString("utf16le");
    expect(entryText).toContain("powershell.exe");
    expect(entryText).toContain("-WindowStyle Hidden");
    expect(entryText).toContain(paths.launcher);
    expect(entryText).not.toMatch(/token=|http:\/\//i);

    expect(injected.protectLogs).toHaveBeenCalledWith(home);
    expect(injected.protectFile).toHaveBeenCalledWith(paths.launcher);
  });

  it("is idempotent and reports status before and after install", () => {
    const injected = deps();
    expect(portableStartupStatus(cfg, { startupDir }).installed).toBe(false);

    installPortableStartup(cfg, injected);
    installPortableStartup(cfg, injected);

    expect(portableStartupStatus(cfg, { startupDir })).toMatchObject({ installed: true });
    expect(readFileSync(portableStartupPaths(home, startupDir).entry).length).toBeGreaterThan(0);
  });

  it("uninstalls only the Startup entry and launcher", () => {
    const injected = deps();
    const configPath = join(home, "config.json");
    writeFileSync(configPath, "{\"token\":\"do-not-print\"}\n");
    installPortableStartup(cfg, injected);

    uninstallPortableStartup(cfg, { startupDir });

    const paths = portableStartupPaths(home, startupDir);
    expect(existsSync(paths.entry)).toBe(false);
    expect(existsSync(paths.launcher)).toBe(false);
    expect(readFileSync(configPath, "utf8")).toContain("do-not-print");
    expect(portableStartupStatus(cfg, { startupDir }).installed).toBe(false);
    expect(() => uninstallPortableStartup(cfg, { startupDir })).not.toThrow();
  });

  it("refuses a source CLI before writing any Startup file", () => {
    cfg = { ...cfg, cliPath: join(home, "src", "cli.ts") };
    const injected = deps();

    expect(() => installPortableStartup(cfg, injected)).toThrow(/compiled/i);
    expect(existsSync(portableStartupPaths(home, startupDir).entry)).toBe(false);
    expect(existsSync(portableStartupPaths(home, startupDir).launcher)).toBe(false);
  });
});
