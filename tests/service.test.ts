import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SERVICE_LABEL,
  createDarwinService,
  installService,
  servicePath,
  servicePlist,
  serviceStatus,
  uninstallService,
  type LaunchctlRunner,
  type ServiceConfig,
} from "../src/platform/darwin/service.js";

type RunnerCall = string[];

function fakeRunner(statuses: number[] = []): { calls: RunnerCall[]; runner: LaunchctlRunner } {
  const calls: RunnerCall[] = [];
  const runner: LaunchctlRunner = (args) => {
    calls.push(args);
    const status = statuses.shift() ?? 0;
    return { status, stdout: status === 0 ? "ok" : "", stderr: status === 0 ? "" : "launchctl failed" };
  };
  return { calls, runner };
}

const uid = process.getuid?.() ?? 0;
const labelTarget = `gui/${uid}/${SERVICE_LABEL}`;

let home = "";
let plistDir = "";
afterEach(() => {
  if (home) rmSync(home, { recursive: true, force: true });
  if (plistDir) rmSync(plistDir, { recursive: true, force: true });
  home = "";
  plistDir = "";
});

/** A plist outside the PocketPet data dir, matching where installService really writes. */
function externalPlistPath(): string {
  plistDir = mkdtempSync(join(tmpdir(), "pocketpet-plist-"));
  return join(plistDir, `${SERVICE_LABEL}.plist`);
}

function setupConfig(overrides: Partial<ServiceConfig> = {}): ServiceConfig {
  home = mkdtempSync(join(tmpdir(), "pocketpet-service-"));
  const cliPath = join(home, "dist", "cli.js");
  mkdirSync(dirname(cliPath), { recursive: true });
  writeFileSync(cliPath, "// built cli\n");
  return {
    home,
    nodePath: "/usr/local/bin/node",
    cliPath,
    port: 7788,
    plistPath: join(home, "Library", "LaunchAgents", `${SERVICE_LABEL}.plist`),
    ...overrides,
  };
}

function assertMode(path: string, mode: number): void {
  if (process.platform === "win32") return;
  expect(statSync(path).mode & 0o777).toBe(mode);
}

describe.skipIf(process.platform === "win32")("servicePath", () => {
  it("points at the per-user LaunchAgents plist", () => {
    expect(servicePath()).toBe(join(homedir(), "Library", "LaunchAgents", `${SERVICE_LABEL}.plist`));
    expect(servicePath().endsWith("Library/LaunchAgents/dev.pocketpet.bridge.plist")).toBe(true);
  });
});

describe("servicePlist", () => {
  it("contains the label, program arguments, environment, and log settings", () => {
    const cfg: ServiceConfig = {
      home: "/Users/fold pet/home",
      nodePath: "/usr/local/bin/node",
      cliPath: "/Users/fold pet/app/dist/cli.js",
      port: 7788,
    };
    const plist = servicePlist(cfg);
    expect(plist).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(plist).toContain("<key>Label</key>");
    expect(plist).toContain(`<string>${SERVICE_LABEL}</string>`);
    expect(plist).toMatch(/<key>ProgramArguments<\/key>\s*<array>\s*<string>\/usr\/local\/bin\/node<\/string>\s*<string>\/Users\/fold pet\/app\/dist\/cli\.js<\/string>\s*<string>run<\/string>\s*<string>--service<\/string>\s*<\/array>/);
    expect(plist).toMatch(new RegExp(`<key>POCKETPET_HOME</key>\\s*<string>/Users/fold pet/home</string>`));
    expect(plist).toMatch(/<key>RunAtLoad<\/key>\s*<true\/>/);
    expect(plist).toMatch(/<key>KeepAlive<\/key>\s*<true\/>/);
    expect(plist).toMatch(/<key>ThrottleInterval<\/key>\s*<integer>5<\/integer>/);
    expect(plist).toMatch(/<key>StandardOutPath<\/key>\s*<string>\/Users\/fold pet\/home\/logs\/bridge\.log<\/string>/);
    expect(plist).toMatch(/<key>StandardErrorPath<\/key>\s*<string>\/Users\/fold pet\/home\/logs\/bridge\.log<\/string>/);
  });

  it("XML-escapes every interpolated value", () => {
    const cfg: ServiceConfig = {
      home: '/tmp/a&b/<home> "quoted"',
      nodePath: "/opt/node&co/node",
      cliPath: "/opt/cli's/<app>/dist/cli.js",
      port: 7788,
      plistPath: "/tmp/ignored.plist",
    };
    const plist = servicePlist(cfg);
    expect(plist).toContain("/opt/node&amp;co/node");
    expect(plist).toContain("/opt/cli&apos;s/&lt;app&gt;/dist/cli.js");
    expect(plist).toContain('/tmp/a&amp;b/&lt;home&gt; &quot;quoted&quot;');
    expect(plist).toContain('/tmp/a&amp;b/&lt;home&gt; &quot;quoted&quot;/logs/bridge.log');
    expect(plist).not.toContain("<home>");
    expect(plist).not.toContain("<app>");
    expect(plist).not.toContain("cli's");
  });
});

describe("installService", () => {
  it("writes the plist, pre-creates the log with tight modes, and reloads the service", async () => {
    const cfg = setupConfig();
    const { calls, runner } = fakeRunner([1, 0]);
    await installService(cfg, runner);

    expect(existsSync(cfg.plistPath as string)).toBe(true);
    expect(readFileSync(cfg.plistPath as string, "utf8")).toBe(servicePlist(cfg));
    const logPath = join(cfg.home, "logs", "bridge.log");
    expect(existsSync(logPath)).toBe(true);
    assertMode(logPath, 0o600);
    assertMode(join(cfg.home, "logs"), 0o700);
    expect(calls).toEqual([
      ["bootout", labelTarget],
      ["bootstrap", `gui/${uid}`, cfg.plistPath],
    ]);
  });

  it("does not truncate an existing log", async () => {
    const cfg = setupConfig();
    mkdirSync(join(cfg.home, "logs"), { recursive: true, mode: 0o700 });
    writeFileSync(join(cfg.home, "logs", "bridge.log"), "previous run\n");
    const { runner } = fakeRunner();
    await installService(cfg, runner);
    expect(readFileSync(join(cfg.home, "logs", "bridge.log"), "utf8")).toBe("previous run\n");
  });

  it.skipIf(process.platform === "win32")("tightens pre-existing lax log and directory modes", async () => {
    const cfg = setupConfig();
    const logPath = join(cfg.home, "logs", "bridge.log");
    mkdirSync(join(cfg.home, "logs"), { recursive: true });
    writeFileSync(logPath, "previous run\n");
    chmodSync(join(cfg.home, "logs"), 0o755);
    chmodSync(logPath, 0o644);

    const { runner } = fakeRunner();
    await installService(cfg, runner);

    assertMode(logPath, 0o600);
    assertMode(join(cfg.home, "logs"), 0o700);
    expect(readFileSync(logPath, "utf8")).toBe("previous run\n");
  });

  it("refuses a TypeScript CLI path", async () => {
    const cfg = setupConfig();
    const tsCli = join(cfg.home, "src", "cli.ts");
    mkdirSync(dirname(tsCli), { recursive: true });
    writeFileSync(tsCli, "// source\n");
    const { calls, runner } = fakeRunner();
    await expect(installService({ ...cfg, cliPath: tsCli }, runner)).rejects.toThrow(/build and run the compiled CLI \(dist\/cli\.js\)/);
    expect(calls).toEqual([]);
    expect(existsSync(cfg.plistPath as string)).toBe(false);
  });

  it("refuses a missing CLI path", async () => {
    const cfg = setupConfig();
    const { calls, runner } = fakeRunner();
    await expect(installService({ ...cfg, cliPath: join(cfg.home, "dist", "missing.js") }, runner)).rejects.toThrow(/dist\/cli\.js/);
    expect(calls).toEqual([]);
  });
});

describe("uninstallService", () => {
  it("boots out, ignoring failure, then removes the plist", async () => {
    const cfg = setupConfig();
    const installed = fakeRunner();
    await installService(cfg, installed.runner);
    expect(existsSync(cfg.plistPath as string)).toBe(true);

    const { calls, runner } = fakeRunner([3]);
    await uninstallService(cfg, runner);
    expect(calls).toEqual([["bootout", labelTarget]]);
    expect(existsSync(cfg.plistPath as string)).toBe(false);
  });

  it("is a no-op when the plist is absent", async () => {
    const cfg = setupConfig();
    const { calls, runner } = fakeRunner([1]);
    await expect(uninstallService(cfg, runner)).resolves.toBeUndefined();
    expect(calls).toEqual([["bootout", labelTarget]]);
  });
});

describe("serviceStatus", () => {
  it("returns true when launchctl print succeeds", async () => {
    const cfg = setupConfig();
    const { calls, runner } = fakeRunner([0]);
    expect(await serviceStatus(cfg, runner)).toBe(true);
    expect(calls).toEqual([["print", labelTarget]]);
  });

  it("returns false on non-zero status", async () => {
    const cfg = setupConfig();
    const { runner } = fakeRunner([113]);
    expect(await serviceStatus(cfg, runner)).toBe(false);
  });

  it("returns false when the runner throws", async () => {
    const cfg = setupConfig();
    const runner: LaunchctlRunner = () => {
      throw new Error("launchctl missing");
    };
    expect(await serviceStatus(cfg, runner)).toBe(false);
  });
});

describe("darwinService", () => {
  it("reports installed but stopped when the plist exists outside the data home", async () => {
    const plistPath = externalPlistPath();
    const cfg = setupConfig({ plistPath });
    expect(cfg.plistPath?.startsWith(cfg.home)).toBe(false);
    mkdirSync(dirname(plistPath), { recursive: true });
    writeFileSync(plistPath, servicePlist(cfg));
    // The data-home location is not where the LaunchAgent lives.
    expect(existsSync(servicePath(cfg.home))).toBe(false);
    const { calls, runner } = fakeRunner([1]);
    await expect(createDarwinService(runner).status(cfg)).resolves.toEqual({ installed: true, running: false });
    expect(calls).toEqual([["print", labelTarget]]);
  });

  it("reports running and installed when launchctl print succeeds", async () => {
    const cfg = setupConfig();
    const { runner } = fakeRunner([0]);
    await expect(createDarwinService(runner).status(cfg)).resolves.toEqual({ installed: true, running: true });
  });

  it("reports not installed when there is no job and no plist", async () => {
    const cfg = setupConfig();
    const { runner } = fakeRunner([113]);
    await expect(createDarwinService(runner).status(cfg)).resolves.toEqual({ installed: false, running: false });
  });

  it("routes install and uninstall through the injected runner", async () => {
    const cfg = setupConfig();
    const { calls, runner } = fakeRunner([1, 0, 0]);
    const service = createDarwinService(runner);
    await service.install(cfg);
    expect(existsSync(cfg.plistPath as string)).toBe(true);
    await service.uninstall(cfg);
    expect(existsSync(cfg.plistPath as string)).toBe(false);
    expect(calls).toEqual([
      ["bootout", labelTarget],
      ["bootstrap", `gui/${uid}`, cfg.plistPath],
      ["bootout", labelTarget],
    ]);
  });
});
