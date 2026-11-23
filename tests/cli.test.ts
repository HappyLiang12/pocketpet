import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main, hasPocketPetHooks, printPairing, qoderHookCommand, runService, runUp } from "../src/cli.js";
import { CLAUDE_HOOK_EVENTS, HOOK_COMMAND } from "../src/adapters/claudeInstall.js";
import { QODER_HOOK_EVENTS } from "../src/adapters/qoderInstall.js";
import { configPath, ensureConfig, saveConfig } from "../src/config.js";
import type { Platform, ServiceManager } from "../src/platform/types.js";
import type { Bridge } from "../src/server.js";

let home = "";
let claudeDir = "";
let userHome = "";
let savedHome: string | undefined;
let savedUserHome: string | undefined;
let savedClaudeConfigDir: string | undefined;
let savedLang: string | undefined;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "pocketpet-cli-"));
  claudeDir = mkdtempSync(join(tmpdir(), "pocketpet-claude-"));
  userHome = mkdtempSync(join(tmpdir(), "pocketpet-user-"));
  savedHome = process.env.POCKETPET_HOME;
  savedUserHome = process.env.HOME;
  savedClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
  savedLang = process.env.POCKETPET_LANG;
  process.env.POCKETPET_HOME = home;
  process.env.HOME = userHome;
  process.env.CLAUDE_CONFIG_DIR = claudeDir;
  process.env.POCKETPET_LANG = "en";
});

afterEach(() => {
  if (savedHome === undefined) delete process.env.POCKETPET_HOME;
  else process.env.POCKETPET_HOME = savedHome;
  if (savedUserHome === undefined) delete process.env.HOME;
  else process.env.HOME = savedUserHome;
  if (savedClaudeConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedClaudeConfigDir;
  if (savedLang === undefined) delete process.env.POCKETPET_LANG;
  else process.env.POCKETPET_LANG = savedLang;
  rmSync(home, { recursive: true, force: true });
  rmSync(claudeDir, { recursive: true, force: true });
  rmSync(userHome, { recursive: true, force: true });
});

async function runMain(argv: string[]): Promise<{ code: number; output: string }> {
  const lines: string[] = [];
  const record = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  const log = vi.spyOn(console, "log").mockImplementation(record);
  const error = vi.spyOn(console, "error").mockImplementation(record);
  try {
    const code = await main(argv);
    return { code, output: lines.join("\n") };
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
}

type SpawnedCli = { code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string };

/**
 * Spawns the real CLI and waits until `until` shows up on stdout (or the
 * child exits), then terminates it. The bridge runs until killed, so every
 * smoke ends with an explicit signal.
 */
async function spawnCli(
  args: string[],
  until: RegExp,
  env: Record<string, string> = {},
  timeoutMs = 20_000,
): Promise<SpawnedCli> {
  const child = spawn(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, POCKETPET_HOME: home, CLAUDE_CONFIG_DIR: claudeDir, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
  child.stderr?.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.on("close", (code, signal) => resolve({ code, signal }));
  });
  const deadline = Date.now() + timeoutMs;
  let matched = false;
  while (Date.now() < deadline) {
    if (until.test(stdout)) {
      matched = true;
      break;
    }
    if (child.exitCode !== null || child.signalCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  child.kill(matched ? "SIGTERM" : "SIGKILL");
  const { code, signal } = await closed;
  return { code, signal, stdout, stderr };
}

function writeConfig(port: number): string {
  const token = randomBytes(18).toString("base64url");
  writeFileSync(
    configPath(home),
    JSON.stringify({ token, port, activePet: null, sleepAfterMinutes: 10, quietHours: null }, null, 2),
  );
  return token;
}

describe("pocketpet up and forgiving run", () => {
  it("starts the foreground bridge and prints pairing URLs plus the three English steps", async () => {
    writeConfig(0);

    const result = await spawnCli(["up", "--no-hooks", "--no-service", "--no-open"], /Ctrl\+C to stop/, {
      POCKETPET_LANG: "en",
    });

    expect(result.stdout).toContain(`Config: ${configPath(home)}`);
    expect(result.stdout).toMatch(/http:\/\/[^\s]+\?token=/);
    expect(result.stdout).toContain("Same Wi-Fi");
    expect(result.stdout).toContain("Scan with the camera");
    expect(result.stdout).toContain("Add to Home Screen");
    expect(existsSync(configPath(home))).toBe(true);
  }, 30_000);

  it("run auto-creates a missing config on an ephemeral port and hints that hooks need init", async () => {
    const result = await spawnCli(["run"], /Ctrl\+C to stop/, { POCKETPET_PORT: "0", POCKETPET_LANG: "en" });

    expect(result.stdout).toContain(`Created config: ${configPath(home)}`);
    expect(result.stdout).toContain("pocketpet init");
    expect(result.stdout).toMatch(/http:\/\/[^\s]+\?token=/);
    expect(result.stdout).toContain("Ctrl+C to stop");
    expect(existsSync(configPath(home))).toBe(true);
    expect(JSON.parse(readFileSync(configPath(home), "utf8")).port).toBe(0);
    expect(result.signal ?? result.code).not.toBeNull();
  }, 30_000);

  it("skips hooks without a TTY and leaves unrelated Claude settings byte-identical", async () => {
    writeConfig(0);
    const settingsPath = join(claudeDir, "settings.json");
    const original = '{\n  "permissions": { "allow": ["Bash(ls)"] },\n  "env": { "FOO": "bar" }\n}\n';
    writeFileSync(settingsPath, original);

    const result = await spawnCli(["up", "--no-service", "--no-open"], /Ctrl\+C to stop/);

    expect(result.stdout).toContain("Claude Code hooks: skipped (not a TTY; pass --yes or run `pocketpet init`)");
    expect(readFileSync(settingsPath, "utf8")).toBe(original);
    expect(result.signal ?? result.code).not.toBeNull();
  }, 30_000);

  it("run --service prints only the listening line and no tokenized URLs", async () => {
    writeConfig(0);

    const result = await spawnCli(["run", "--service"], /PocketPet bridge listening on port \d+/);

    expect(result.stdout).toMatch(/PocketPet bridge listening on port \d+/);
    expect(result.stdout).not.toContain("token=");
    expect(result.stdout).not.toContain("http://");
  }, 30_000);
});

describe("hasPocketPetHooks", () => {
  function settingsWith(hook: unknown): string {
    const file = join(claudeDir, "settings.json");
    const hooks = Object.fromEntries(CLAUDE_HOOK_EVENTS.map((event) => [event, [{ hooks: [hook] }]]));
    writeFileSync(file, JSON.stringify({ hooks }));
    return file;
  }

  it("accepts a command hook for every event", () => {
    expect(hasPocketPetHooks(settingsWith({ type: "command", command: HOOK_COMMAND }))).toBe(true);
  });

  it("requires hook.type to be command", () => {
    expect(hasPocketPetHooks(settingsWith({ command: HOOK_COMMAND }))).toBe(false);
    expect(hasPocketPetHooks(settingsWith({ type: "prompt", command: HOOK_COMMAND }))).toBe(false);
  });

  it("rejects a missing settings file and a settings file missing one event", () => {
    expect(hasPocketPetHooks(join(claudeDir, "missing.json"))).toBe(false);

    const file = join(claudeDir, "settings.json");
    const hooks: Record<string, unknown> = Object.fromEntries(
      CLAUDE_HOOK_EVENTS.map((event) => [event, [{ hooks: [{ type: "command", command: HOOK_COMMAND }] }]]),
    );
    delete hooks[CLAUDE_HOOK_EVENTS.at(-1)!];
    writeFileSync(file, JSON.stringify({ hooks }));
    expect(hasPocketPetHooks(file)).toBe(false);
  });
});

describe("pairing output", () => {
  const fakeIfaces = {
    en0: [{ address: "192.168.1.5", family: "IPv4", internal: false, netmask: "255.255.255.0", mac: "aa", cidr: null }],
  } as never;

  function capturePrinting(options: Parameters<typeof printPairing>[0]): string {
    const lines: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    try {
      printPairing(options);
    } finally {
      log.mockRestore();
    }
    return lines.join("\n");
  }

  it("prints the USB steps and a USB closing line in English when no LAN URL exists", () => {
    const output = capturePrinting({ port: 7788, token: "tok", qrHost: "ip", open: false, keepRunning: false, interfaces: {} as never });
    expect(output).toContain("USB fallback (no LAN URL):");
    expect(output).toContain("adb reverse tcp:7788 tcp:7788");
    expect(output).toContain("http://127.0.0.1:7788/?token=tok");
    expect(output).toContain("USB URL on your phone");
    expect(output).not.toContain("Scan the QR");
  });

  it("prints the three pairing steps in Traditional Chinese when POCKETPET_LANG=zh-Hant", () => {
    process.env.POCKETPET_LANG = "zh-Hant";
    const output = capturePrinting({
      port: 7788, token: "tok", qrHost: "ip", open: false, keepRunning: false, interfaces: fakeIfaces,
    });
    expect(output).toContain("http://192.168.1.5:7788/?token=tok");
    expect(output).toContain("三步完成配對：");
    expect(output).toContain("同一個 Wi-Fi");
    expect(output).toContain("用相機掃描");
    expect(output).toContain("加到主畫面");
    expect(output).toContain("按 Ctrl+C 停止");
    expect(output).not.toContain("Pair in three steps");
  });

  it("prints the Simplified Chinese USB fallback", () => {
    process.env.POCKETPET_LANG = "zh-Hans";
    const output = capturePrinting({ port: 7788, token: "tok", qrHost: "ip", open: false, keepRunning: false, interfaces: {} as never });
    expect(output).toContain("USB 备用（没有局域网网址）：");
    expect(output).toContain("找不到局域网 IPv4 地址。");
    expect(output).toContain("http://127.0.0.1:7788/?token=tok");
    expect(output).toContain("按 Ctrl+C 停止");
    expect(output).not.toContain("配對");
  });
});

describe("pocketpet cli usage", () => {
  it("service with an unknown action prints usage and exits 2", async () => {
    const { code, output } = await runMain(["service", "bogus"]);

    expect(code).toBe(2);
    expect(output).toContain("usage: pocketpet service");
  });

  it("up rejects an unknown flag with usage and exit 2", async () => {
    const { code, output } = await runMain(["up", "--bogus"]);

    expect(code).toBe(2);
    expect(output).toContain("usage: pocketpet up");
  });
});

describe("pocketpet cli error handling", () => {
  it("service install surfaces the compiled-CLI refusal without touching launchd", async () => {
    const config = ensureConfig(home);

    const { code, output } = await runMain(["service", "install"]);

    expect(code).toBe(1);
    expect(output).toContain("build and run the compiled CLI (dist/cli.js)");
    expect(output).toContain("Could not install the bridge service");
    expect(output).not.toContain(config.token);
    expect(existsSync(join(home, "Library", "LaunchAgents", "dev.pocketpet.bridge.plist"))).toBe(false);
  });

  it("init fails without printing malformed config contents", async () => {
    writeFileSync(configPath(home), '{\n  "token": "SECRET_TOKEN_VALUE",\n  "port": 7788,\n');

    const { code, output } = await runMain(["init"]);

    expect(code).toBe(1);
    expect(output).toContain("config unreadable");
    expect(output).toContain(configPath(home));
    expect(output).toMatch(/fix or delete/i);
    expect(output).not.toContain("SECRET_TOKEN_VALUE");
    expect(output).not.toMatch(/SECRET|TOKEN_VALUE/);
    expect(output).not.toContain('"token"');
    expect(existsSync(join(claudeDir, "settings.json"))).toBe(false);
  });

  it("run never surfaces a raw thrown error", async () => {
    const config = ensureConfig(home);
    const blocked = createServer();
    await new Promise<void>((resolve) => blocked.listen(0, "0.0.0.0", resolve));
    try {
      const address = blocked.address();
      if (typeof address !== "object" || !address) throw new Error("failed to reserve a port");
      saveConfig(home, { ...config, port: address.port });

      const { code, output } = await runMain(["run"]);

      expect(code).toBe(1);
      expect(output).toContain("pocketpet: run failed");
      expect(output).not.toContain("EADDRINUSE");
      expect(output).not.toContain(config.token);
    } finally {
      await new Promise<void>((resolve) => blocked.close(() => resolve()));
    }
  });
});

describe("Windows service CLI fallback", () => {
  function fakePlatform(service: Partial<ServiceManager> = {}): Platform {
    return {
      service: {
        label: "PocketPet Bridge",
        install: vi.fn(async () => {}),
        uninstall: vi.fn(async () => {}),
        status: vi.fn(async () => ({ installed: false, running: false })),
        ...service,
      },
      host: { localHostname: () => null, startAdvertisement: async () => false, stopAdvertisement: async () => {} },
      security: { protectHome: () => {}, protectLogs: () => {}, protectFile: () => {} },
    };
  }

  function fakeForeground(port: number) {
    return vi.fn(async () =>
      ({
        port,
        config: ensureConfig(home),
        aggregator: {} as never,
        broadcast: () => {},
        close: async () => {},
      }) as Bridge,
    );
  }

  async function capture<T>(work: () => Promise<T>): Promise<{ result: T; output: string }> {
    const lines: string[] = [];
    const record = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    const log = vi.spyOn(console, "log").mockImplementation(record);
    const error = vi.spyOn(console, "error").mockImplementation(record);
    try {
      return { result: await work(), output: lines.join("\n") };
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  }

  it("continues in the foreground on Windows when the service install fails", async () => {
    writeConfig(0);
    const platform = fakePlatform({
      install: vi.fn(async () => {
        throw new Error("install was cancelled at the elevation prompt");
      }),
    });
    const startForeground = fakeForeground(7788);
    const waitForInterrupt = vi.fn(async () => {});

    const { result, output } = await capture(() =>
      runUp(["--yes", "--no-hooks", "--no-open"], {
        platform,
        platformName: "win32",
        startForeground,
        waitForInterrupt,
      }),
    );

    expect(result).toBe(0);
    expect(platform.service.install).toHaveBeenCalledWith(expect.objectContaining({ home, port: 0 }));
    expect(startForeground).toHaveBeenCalledTimes(1);
    expect(waitForInterrupt).toHaveBeenCalledTimes(1);
    expect(output).toContain("Could not install the bridge service.");
    expect(output).toContain("Continuing in the foreground; run `pocketpet service install` from an elevated shell later.");
    // The exact, token-free elevated command is printed, not just a hint.
    expect(output).toContain(`& '${process.execPath}'`);
    expect(output).toContain("service install");
    expect(output).toContain("Starting the bridge in the foreground.");
    expect(output).not.toContain("Bridge service is running");
  });

  it("keeps the macOS install failure fatal in up", async () => {
    writeConfig(0);
    const platform = fakePlatform({
      install: vi.fn(async () => {
        throw new Error("launchctl bootstrap failed");
      }),
    });
    const startForeground = fakeForeground(7788);

    const { result, output } = await capture(() =>
      runUp(["--yes", "--no-hooks", "--no-open"], {
        platform,
        platformName: "darwin",
        startForeground,
        waitForInterrupt: async () => {},
      }),
    );

    expect(result).toBe(1);
    expect(startForeground).not.toHaveBeenCalled();
    expect(output).toContain("Could not install the bridge service.");
    expect(output).not.toContain("Starting the bridge in the foreground.");
  });

  it("keeps standalone service install fatal on Windows cancellation", async () => {
    const config = ensureConfig(home);
    const platform = fakePlatform({
      install: vi.fn(async () => {
        throw new Error("install was cancelled at the elevation prompt");
      }),
    });

    const { result, output } = await capture(() => runService("install", { platform }));

    expect(result).toBe(1);
    expect(platform.service.install).toHaveBeenCalledTimes(1);
    expect(output).toContain("Could not install the bridge service (PocketPet Bridge).");
    expect(output).toContain("The elevation prompt was canceled.");
    expect(output).not.toContain(config.token);
  });

  it("prints the exact elevated install command when a Windows install fails", async () => {
    const config = ensureConfig(home);
    const platform = fakePlatform({
      install: vi.fn(async () => {
        throw new Error("elevated install failed (exit 1)");
      }),
    });

    const { result, output } = await capture(() => runService("install", { platform, platformName: "win32" }));

    expect(result).toBe(1);
    expect(platform.service.install).toHaveBeenCalledTimes(1);
    expect(output).toContain("Could not install the bridge service (PocketPet Bridge).");
    // Windows advice names the elevation, not an npm build.
    expect(output).toContain("elevated PowerShell");
    expect(output).toContain(`& '${process.execPath}'`);
    expect(output).toContain("service install");
    expect(output).not.toContain("npm run build");
    expect(output).not.toContain(config.token);
  });

  it("keeps the platform-appropriate build advice off Windows", async () => {
    ensureConfig(home);
    const platform = fakePlatform({
      install: vi.fn(async () => {
        throw new Error("launchctl bootstrap failed");
      }),
    });

    const { result, output } = await capture(() => runService("install", { platform, platformName: "darwin" }));

    expect(result).toBe(1);
    expect(output).toContain("Build the CLI with `npm run build`");
    expect(output).not.toContain("elevated PowerShell");
  });

  it("uses the platform service label for status messages", async () => {
    ensureConfig(home);
    const platform = fakePlatform({ status: vi.fn(async () => ({ installed: true, running: true })) });

    const { result, output } = await capture(() => runService("status", { platform }));

    expect(result).toBe(0);
    expect(output).toContain("Bridge service is running (PocketPet Bridge).");
  });
});

describe("qoderHookCommand", () => {
  it("uses the absolute node binary and compiled CLI path", () => {
    expect(qoderHookCommand("/app/dist/cli.js", "/usr/local/bin/node")).toBe(
      "'/usr/local/bin/node' '/app/dist/cli.js' hook qoder",
    );
  });

  it("falls back to the linked command for a TypeScript entry point", () => {
    expect(qoderHookCommand("/repo/src/cli.ts", "/usr/local/bin/node")).toBe("pocketpet hook qoder");
  });

  it("shell-quotes apostrophes", () => {
    expect(qoderHookCommand("/tmp/a'b/cli.js", "/tmp/node")).toBe("'/tmp/node' '/tmp/a'\\''b/cli.js' hook qoder");
  });
});

describe("pocketpet init Qoder hooks", () => {
  function qoderRoot(name = ".qoder"): string {
    return join(userHome, name);
  }

  it("installs hooks into an existing root and preserves unrelated settings", async () => {
    mkdirSync(qoderRoot(), { recursive: true });
    writeFileSync(join(qoderRoot(), "settings.json"), JSON.stringify({ enabledPlugins: { context: true } }));

    const { code, output } = await runMain(["init"]);

    expect(code).toBe(0);
    expect(output).toContain(`Qoder hooks (${qoderRoot()}) added: SessionStart`);
    const settings = JSON.parse(readFileSync(join(qoderRoot(), "settings.json"), "utf8"));
    expect(settings.enabledPlugins).toEqual({ context: true });
    expect(Object.keys(settings.hooks).sort()).toEqual([...QODER_HOOK_EVENTS].sort());
    expect(settings.hooks.Stop[0].hooks[0]).toMatchObject({ type: "command", timeout: 2 });
    expect(settings.hooks.Stop[0].hooks[0].command).toContain("hook qoder");
  });

  it("reports already-present events on a second init", async () => {
    mkdirSync(qoderRoot(), { recursive: true });
    await runMain(["init"]);

    const { output } = await runMain(["init"]);

    expect(output).toContain(`Qoder hooks (${qoderRoot()}) added: none`);
    expect(output).toContain(`Qoder hooks (${qoderRoot()}) already present: SessionStart`);
  });

  it("installs into both existing roots", async () => {
    mkdirSync(qoderRoot(".qoder"), { recursive: true });
    mkdirSync(qoderRoot(".qoder-cn"), { recursive: true });

    await runMain(["init"]);

    expect(existsSync(join(qoderRoot(".qoder"), "settings.json"))).toBe(true);
    expect(existsSync(join(qoderRoot(".qoder-cn"), "settings.json"))).toBe(true);
  });

  it("does not create a Qoder root when none exists", async () => {
    const { code, output } = await runMain(["init"]);

    expect(code).toBe(0);
    expect(output).toContain("Qoder not detected");
    expect(existsSync(qoderRoot())).toBe(false);
    expect(existsSync(qoderRoot(".qoder-cn"))).toBe(false);
  });
});

describe("pocketpet up Qoder consent", () => {
  function qoderSettings(): string {
    return join(userHome, ".qoder", "settings.json");
  }

  it("skips Qoder hooks without a TTY and leaves settings untouched", async () => {
    writeConfig(0);
    mkdirSync(join(userHome, ".qoder"), { recursive: true });
    const original = '{\n  "enabledPlugins": { "context": true }\n}\n';
    writeFileSync(qoderSettings(), original);

    const result = await spawnCli(["up", "--no-service", "--no-open"], /Ctrl\+C to stop/);

    expect(result.stdout).toContain("Qoder hooks: skipped (not a TTY; pass --yes or run `pocketpet init`)");
    expect(readFileSync(qoderSettings(), "utf8")).toBe(original);
  }, 30_000);

  it("installs Qoder hooks with --yes and --no-service", async () => {
    writeConfig(0);
    mkdirSync(join(userHome, ".qoder"), { recursive: true });

    const result = await spawnCli(["up", "--yes", "--no-service", "--no-open"], /Ctrl\+C to stop/);

    expect(result.stdout).toContain(`Qoder hooks added (${join(userHome, ".qoder")})`);
    const settings = JSON.parse(readFileSync(qoderSettings(), "utf8"));
    expect(Object.keys(settings.hooks).sort()).toEqual([...QODER_HOOK_EVENTS].sort());
  }, 30_000);

  it("skips Qoder hooks with --no-hooks and does not create the settings file", async () => {
    writeConfig(0);
    mkdirSync(join(userHome, ".qoder"), { recursive: true });

    const result = await spawnCli(["up", "--no-hooks", "--no-service", "--no-open"], /Ctrl\+C to stop/);

    expect(result.stdout).toContain("Qoder hooks: skipped (--no-hooks)");
    expect(existsSync(qoderSettings())).toBe(false);
  }, 30_000);

  it("does not mention or create Qoder when no root exists", async () => {
    writeConfig(0);

    const result = await spawnCli(["up", "--no-service", "--no-open"], /Ctrl\+C to stop/);

    expect(result.stdout).not.toContain("Qoder hooks");
    expect(existsSync(join(userHome, ".qoder"))).toBe(false);
  }, 30_000);
});
