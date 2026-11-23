import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  QODER_HOOK_EVENTS,
  installQoderHooks,
  isQoderHookCommand,
  qoderHookEventStatus,
  qoderHookMarker,
  qoderSettingsPaths,
} from "../src/adapters/qoderInstall.js";

let dir = "";
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

const POSIX_COMMAND = "'/usr/local/bin/node' '/app/dist/cli.js' hook qoder";
const BARE_COMMAND = "pocketpet hook qoder";
const WINDOWS_COMMAND = '"C:\\Program Files\\nodejs\\node.exe" "C:\\Program Files\\PocketPet\\dist\\cli.js" hook qoder';

describe("installQoderHooks", () => {
  const command = "'/usr/local/bin/node' '/app/dist/cli.js' hook qoder";

  it("adds all twelve events while preserving unrelated settings and foreign hooks", () => {
    dir = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const file = join(dir, "settings.json");
    writeFileSync(file, JSON.stringify({
      enabledPlugins: { context: true },
      hooksConfig: { enabled: false },
      env: { KEEP: "me" },
      hooks: {
        Stop: [{ matcher: "", hooks: [{ type: "command", command: "petdex hook qoder", timeout: 5 }] }],
        SessionStart: [{ hooks: [{ type: "command", command: "other-tool" }] }],
      },
    }));

    const first = installQoderHooks(file, command);

    expect(first.added).toEqual([...QODER_HOOK_EVENTS]);
    expect(first.already).toEqual([]);
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    expect(parsed.enabledPlugins).toEqual({ context: true });
    expect(parsed.hooksConfig).toEqual({ enabled: false });
    expect(parsed.env).toEqual({ KEEP: "me" });
    expect(parsed.hooks.Stop).toHaveLength(2);
    expect(parsed.hooks.Stop[0].hooks[0].command).toBe("petdex hook qoder");
    expect(parsed.hooks.SessionStart).toHaveLength(2);
    expect(Object.keys(parsed.hooks).sort()).toEqual([...QODER_HOOK_EVENTS].sort());
    for (const event of QODER_HOOK_EVENTS) {
      expect(parsed.hooks[event].some((entry: { hooks?: Array<{ command?: string }> }) =>
        entry.hooks?.some((hook) => hook.command === command))).toBe(true);
    }
    expect(parsed.hooks.Stop[1].hooks[0]).toEqual({ type: "command", command, timeout: 2 });

    const second = installQoderHooks(file, command);
    expect(second.added).toEqual([]);
    expect(second.already).toEqual([...QODER_HOOK_EVENTS]);
  });

  it("creates the file and parent directory when missing", () => {
    dir = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const file = join(dir, ".qoder", "settings.json");
    expect(installQoderHooks(file, command).added).toEqual([...QODER_HOOK_EVENTS]);
    if (process.platform !== "win32") expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });

  it.skipIf(process.platform === "win32")("preserves an existing settings file mode", () => {
    dir = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const file = join(dir, "settings.json");
    writeFileSync(file, JSON.stringify({ enabledPlugins: {} }));
    chmodSync(file, 0o640);
    expect(installQoderHooks(file, command).added).toEqual([...QODER_HOOK_EVENTS]);
    expect(statSync(file).mode & 0o777).toBe(0o640);
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });

  it.skipIf(process.platform === "win32")("writes through a symlinked settings path without replacing the link", () => {
    dir = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const real = join(dir, "real-settings.json");
    const link = join(dir, "settings.json");
    writeFileSync(real, JSON.stringify({ enabledPlugins: {} }));
    symlinkSync(real, link);
    const result = installQoderHooks(link, command);
    expect(result.added).toEqual([...QODER_HOOK_EVENTS]);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    const saved = JSON.parse(readFileSync(real, "utf8"));
    expect(saved.enabledPlugins).toEqual({});
    expect(readdirSync(dir).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("rejects invalid JSON and non-object settings", () => {
    dir = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const invalid = join(dir, "invalid.json");
    writeFileSync(invalid, "{oops");
    expect(() => installQoderHooks(invalid, command)).toThrow(/invalid Qoder settings/);

    const scalar = join(dir, "scalar.json");
    writeFileSync(scalar, "null");
    expect(() => installQoderHooks(scalar, command)).toThrow(/invalid Qoder settings/);
  });

  it("rejects a non-array event or a non-object hooks value", () => {
    dir = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const badEvent = join(dir, "event.json");
    writeFileSync(badEvent, JSON.stringify({ hooks: { Stop: {} } }));
    expect(() => installQoderHooks(badEvent, command)).toThrow(/invalid Qoder settings/);

    const badHooks = join(dir, "hooks.json");
    writeFileSync(badHooks, JSON.stringify({ hooks: [] }));
    expect(() => installQoderHooks(badHooks, command)).toThrow(/invalid Qoder settings/);
  });

  it("does not rewrite the file when every hook is already installed", async () => {
    dir = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const file = join(dir, "settings.json");
    installQoderHooks(file, command);
    const content = readFileSync(file, "utf8");
    const mtime = statSync(file).mtimeMs;
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(installQoderHooks(file, command).added).toEqual([]);
    expect(readFileSync(file, "utf8")).toBe(content);
    expect(statSync(file).mtimeMs).toBe(mtime);
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });
});

describe("isQoderHookCommand", () => {
  it("accepts the bare and quoted forms on macOS", () => {
    expect(isQoderHookCommand(BARE_COMMAND, "darwin")).toBe(true);
    expect(isQoderHookCommand(POSIX_COMMAND, "darwin")).toBe(true);
  });

  it("accepts only the quoted absolute <node> <cli> form on Windows", () => {
    expect(isQoderHookCommand(WINDOWS_COMMAND, "win32")).toBe(true);
    expect(isQoderHookCommand(BARE_COMMAND, "win32")).toBe(false);
    expect(isQoderHookCommand(POSIX_COMMAND, "win32")).toBe(false);
    expect(isQoderHookCommand('"node.exe" "cli.js" hook qoder', "win32")).toBe(false);
    expect(isQoderHookCommand('"C:\\node.exe" "C:\\dist\\cli.js" hook qoder --flag', "win32")).toBe(false);
  });

  it("rejects non-string commands", () => {
    expect(isQoderHookCommand(undefined, "win32")).toBe(false);
    expect(isQoderHookCommand(42, "darwin")).toBe(false);
  });
});

describe("installQoderHooks on Windows", () => {
  it("upgrades a stale bare command in place without duplicating", () => {
    dir = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const file = join(dir, "settings.json");
    const hooks = Object.fromEntries(
      QODER_HOOK_EVENTS.map((event) => [event, [{ hooks: [{ type: "command", command: BARE_COMMAND, timeout: 2 }] }]]),
    );
    writeFileSync(file, JSON.stringify({ hooks, env: { KEEP: "me" } }));

    const first = installQoderHooks(file, WINDOWS_COMMAND, "win32");
    expect(first.added).toEqual([]);
    expect(first.replaced).toEqual([...QODER_HOOK_EVENTS]);
    const saved = JSON.parse(readFileSync(file, "utf8"));
    expect(saved.env).toEqual({ KEEP: "me" });
    for (const event of QODER_HOOK_EVENTS) {
      expect(saved.hooks[event]).toHaveLength(1);
      expect(saved.hooks[event][0].hooks).toEqual([{ type: "command", command: WINDOWS_COMMAND, timeout: 2 }]);
    }

    const second = installQoderHooks(file, WINDOWS_COMMAND, "win32");
    expect(second.added).toEqual([]);
    expect(second.replaced).toEqual([]);
    expect(second.already).toEqual([...QODER_HOOK_EVENTS]);
  });

  it("preserves foreign hooks while upgrading PocketPet entries", () => {
    dir = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const file = join(dir, "settings.json");
    writeFileSync(file, JSON.stringify({
      hooks: { Stop: [{ hooks: [{ type: "command", command: "petdex hook qoder", timeout: 5 }] }] },
    }));

    const result = installQoderHooks(file, WINDOWS_COMMAND, "win32");
    expect(result.added).toEqual([...QODER_HOOK_EVENTS]);
    const saved = JSON.parse(readFileSync(file, "utf8"));
    expect(saved.hooks.Stop).toHaveLength(2);
    expect(saved.hooks.Stop[0].hooks[0].command).toBe("petdex hook qoder");
    expect(saved.hooks.Stop[0].hooks[0].timeout).toBe(5);
    expect(saved.hooks.Stop[1].hooks[0]).toEqual({ type: "command", command: WINDOWS_COMMAND, timeout: 2 });
  });

  it("keeps the macOS append behavior instead of upgrading", () => {
    dir = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const file = join(dir, "settings.json");
    writeFileSync(file, JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: BARE_COMMAND }] }] } }));

    const result = installQoderHooks(file, POSIX_COMMAND, "darwin");
    expect(result.replaced).toEqual([]);
    expect(result.added).toContain("Stop");
    const saved = JSON.parse(readFileSync(file, "utf8"));
    expect(saved.hooks.Stop).toHaveLength(2);
    expect(saved.hooks.Stop[0].hooks[0].command).toBe(BARE_COMMAND);
  });
});

describe("qoderHookEventStatus", () => {
  const command = POSIX_COMMAND;

  it("reports all events missing when the settings file does not exist", () => {
    dir = mkdtempSync(join(tmpdir(), "pocketpet-"));
    expect(qoderHookEventStatus(join(dir, "missing.json"), "darwin")).toEqual({ present: [], missing: [...QODER_HOOK_EVENTS] });
  });

  it("matches any command containing the doctor marker on macOS", () => {
    dir = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const file = join(dir, "settings.json");
    installQoderHooks(file, command, "darwin");
    expect(qoderHookEventStatus(file, "darwin")?.missing).toEqual([]);

    const fallback = join(dir, "fallback.json");
    installQoderHooks(fallback, BARE_COMMAND, "darwin");
    expect(qoderHookEventStatus(fallback, "darwin")?.missing).toEqual([]);
  });

  it("requires the quoted absolute form on Windows", () => {
    dir = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const windowsFile = join(dir, "windows.json");
    installQoderHooks(windowsFile, WINDOWS_COMMAND, "win32");
    expect(qoderHookEventStatus(windowsFile, "win32")).toEqual({ present: [...QODER_HOOK_EVENTS], missing: [] });

    const bareFile = join(dir, "bare.json");
    installQoderHooks(bareFile, BARE_COMMAND, "darwin");
    expect(qoderHookEventStatus(bareFile, "win32")).toEqual({ present: [], missing: [...QODER_HOOK_EVENTS] });
  });

  it("lists only the events that are not wired", () => {
    dir = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const file = join(dir, "settings.json");
    writeFileSync(file, JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: BARE_COMMAND }] }] } }));
    const status = qoderHookEventStatus(file, "darwin");
    expect(status?.present).toEqual(["Stop"]);
    expect(status?.missing).toEqual([...QODER_HOOK_EVENTS].filter((event) => event !== "Stop"));
  });

  it("returns null for invalid settings JSON", () => {
    dir = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const file = join(dir, "settings.json");
    writeFileSync(file, "{oops");
    expect(qoderHookEventStatus(file, "darwin")).toBeNull();
  });

  it("does not count a prompt hook or a foreign command", () => {
    dir = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const file = join(dir, "settings.json");
    writeFileSync(file, JSON.stringify({
      hooks: {
        Stop: [{ hooks: [{ type: "prompt", command: BARE_COMMAND }] }],
        SessionStart: [{ hooks: [{ type: "command", command: "other-tool" }] }],
      },
    }));
    const status = qoderHookEventStatus(file, "darwin");
    expect(status?.present).toEqual([]);
    expect(status?.missing).toHaveLength(QODER_HOOK_EVENTS.length);
  });
});

describe("qoderSettingsPaths", () => {
  it("returns both candidate roots for a temp home", () => {
    dir = mkdtempSync(join(tmpdir(), "pocketpet-"));
    expect(qoderSettingsPaths(dir)).toEqual([
      join(dir, ".qoder", "settings.json"),
      join(dir, ".qoder-cn", "settings.json"),
    ]);
  });

  it("returns candidates without requiring the roots to exist", () => {
    dir = mkdtempSync(join(tmpdir(), "pocketpet-"));
    expect(existsSync(join(dir, ".qoder"))).toBe(false);
    expect(qoderSettingsPaths(dir)).toHaveLength(2);
  });

  it("exposes the doctor marker", () => {
    expect(qoderHookMarker).toBe("hook qoder");
  });
});
