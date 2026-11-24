import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runService, runStartup } from "../src/cli.js";
import type { Platform, ServiceManager, ServiceState } from "../src/platform/types.js";
import { portableStartupPaths } from "../src/platform/windows/startup.js";
import { testHost, testSecurity } from "./helpers/test-platform.js";

let home = "";
let startupDir = "";
let cliPath = "";
let savedHome: string | undefined;
let lines: string[] = [];
let spies: Array<{ mockRestore(): void }> = [];

function fakeService(state: ServiceState): Pick<ServiceManager, "status"> {
  return { status: async () => state };
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "pocketpet-portable-cli-"));
  startupDir = join(home, "Startup");
  mkdirSync(join(home, "dist"), { recursive: true });
  cliPath = join(home, "dist", "cli.js");
  writeFileSync(cliPath, "// compiled cli\n");
  savedHome = process.env.POCKETPET_HOME;
  process.env.POCKETPET_HOME = home;
  lines = [];
  const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
  const error = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
  spies = [log, error];
});

afterEach(() => {
  for (const spy of spies) spy.mockRestore();
  spies = [];
  if (savedHome === undefined) delete process.env.POCKETPET_HOME;
  else process.env.POCKETPET_HOME = savedHome;
  rmSync(home, { recursive: true, force: true });
});

function windowsDeps(state: ServiceState = { installed: false, running: false }) {
  return {
    platformName: "win32" as const,
    startupDir,
    nodePath: process.execPath,
    cliPath,
    security: testSecurity,
    service: fakeService(state),
  };
}

describe("portable startup CLI", () => {
  it("rejects startup on non-Windows hosts", async () => {
    const code = await runStartup("install", { platformName: "darwin" });
    expect(code).toBe(2);
    expect(lines.join("\n")).toMatch(/Windows-only/i);
    expect(existsSync(portableStartupPaths(home, startupDir).entry)).toBe(false);
  });

  it("installs, reports, and removes Portable Mode without elevation", async () => {
    const installed = await runStartup("install", windowsDeps());
    expect(installed).toBe(0);
    expect(lines.join("\n")).toMatch(/Portable startup installed/i);
    expect(lines.join("\n")).toMatch(/IP|USB/i);

    const paths = portableStartupPaths(home, startupDir);
    expect(existsSync(paths.entry)).toBe(true);
    expect(existsSync(paths.launcher)).toBe(true);

    lines = [];
    const status = await runStartup("status", windowsDeps());
    expect(status).toBe(0);
    expect(lines.join("\n")).toMatch(/installed/i);

    lines = [];
    const removed = await runStartup("uninstall", windowsDeps());
    expect(removed).toBe(0);
    expect(existsSync(paths.entry)).toBe(false);
    expect(existsSync(paths.launcher)).toBe(false);
  });

  it("refuses Portable Mode while the Task Scheduler service is installed", async () => {
    const code = await runStartup("install", windowsDeps({ installed: true, running: false }));
    expect(code).toBe(1);
    expect(lines.join("\n")).toMatch(/service is installed|service uninstall/i);
    expect(existsSync(portableStartupPaths(home, startupDir).entry)).toBe(false);
  });

  it("points a timed-out service install at Portable Mode", async () => {
    const service: ServiceManager = {
      label: "PocketPet Bridge",
      install: async () => {
        throw new Error("install timed out waiting for the elevation prompt");
      },
      uninstall: async () => {},
      status: async () => ({ installed: false, running: false }),
    };
    const target: Platform = { service, host: testHost, security: testSecurity };

    const code = await runService("install", { platform: target, platformName: "win32", security: testSecurity });

    expect(code).toBe(1);
    expect(lines.join("\n")).toMatch(/timed out/i);
    expect(lines.join("\n")).toMatch(/startup install/i);
  });
});
