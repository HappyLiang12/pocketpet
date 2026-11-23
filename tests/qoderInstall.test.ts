import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  QODER_HOOK_EVENTS,
  installQoderHooks,
  qoderHookEventStatus,
  qoderHookMarker,
  qoderSettingsPaths,
} from "../src/adapters/qoderInstall.js";

let dir = "";
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

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

describe("qoderHookEventStatus", () => {
  const command = "'/usr/local/bin/node' '/app/dist/cli.js' hook qoder";

  it("reports all events missing when the settings file does not exist", () => {
    dir = mkdtempSync(join(tmpdir(), "pocketpet-"));
    expect(qoderHookEventStatus(join(dir, "missing.json"))).toEqual({ present: [], missing: [...QODER_HOOK_EVENTS] });
  });

  it("matches any command containing the doctor marker", () => {
    dir = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const file = join(dir, "settings.json");
    installQoderHooks(file, command);
    expect(qoderHookEventStatus(file)?.missing).toEqual([]);

    const fallback = join(dir, "fallback.json");
    installQoderHooks(fallback, "pocketpet hook qoder");
    expect(qoderHookEventStatus(fallback)?.missing).toEqual([]);
  });

  it("lists only the events that are not wired", () => {
    dir = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const file = join(dir, "settings.json");
    writeFileSync(file, JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "pocketpet hook qoder" }] }] } }));
    const status = qoderHookEventStatus(file);
    expect(status?.present).toEqual(["Stop"]);
    expect(status?.missing).toEqual([...QODER_HOOK_EVENTS].filter((event) => event !== "Stop"));
  });

  it("returns null for invalid settings JSON", () => {
    dir = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const file = join(dir, "settings.json");
    writeFileSync(file, "{oops");
    expect(qoderHookEventStatus(file)).toBeNull();
  });

  it("does not count a prompt hook or a foreign command", () => {
    dir = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const file = join(dir, "settings.json");
    writeFileSync(file, JSON.stringify({
      hooks: {
        Stop: [{ hooks: [{ type: "prompt", command: "pocketpet hook qoder" }] }],
        SessionStart: [{ hooks: [{ type: "command", command: "other-tool" }] }],
      },
    }));
    const status = qoderHookEventStatus(file);
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
