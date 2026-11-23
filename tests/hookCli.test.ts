import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_STDIN_BYTES, readStdin } from "../src/cli.js";
import { ensureConfig, saveConfig } from "../src/config.js";
import { startBridge, type Bridge } from "../src/server.js";
import { testHost, testSecurity } from "./helpers/test-platform.js";

let home = "";
let bridge: Bridge;
beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "pocketpet-"));
  const webDist = join(home, "web");
  mkdirSync(webDist, { recursive: true });
  writeFileSync(join(webDist, "index.html"), "ok");
  const config = ensureConfig(home, process.env, testSecurity);
  bridge = await startBridge({ home, config, webDist, port: 0, localPetDirs: [join(home, "pets")], host: testHost, fetchImpl: async () => { throw new Error("offline"); } });
  saveConfig(home, { ...config, port: bridge.port }, testSecurity);
});
afterEach(async () => { await bridge.close(); rmSync(home, { recursive: true, force: true }); });

function spawnHook(input: string, env: NodeJS.ProcessEnv = {}): void {
  execFileSync(process.execPath, ["--import", "tsx", "src/cli.ts", "hook", "claude"], {
    input, cwd: process.cwd(), timeout: 10_000, env: { ...process.env, POCKETPET_HOME: home, ...env },
  });
}

describe("readStdin", () => {
  it("reads the payload when stdin ends", async () => {
    const input = new PassThrough();
    input.end('{"session_id":"s1"}');
    await expect(readStdin(input)).resolves.toBe('{"session_id":"s1"}');
  });

  it("returns null when the payload exceeds the cap without ending", async () => {
    const input = new PassThrough();
    input.write(Buffer.alloc(MAX_STDIN_BYTES + 1, 0x61));
    const started = Date.now();
    await expect(readStdin(input, { timeoutMs: 5000 })).resolves.toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("returns null at the deadline when stdin never ends", async () => {
    const input = new PassThrough();
    const started = Date.now();
    await expect(readStdin(input, { timeoutMs: 20 })).resolves.toBeNull();
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("short-circuits on a TTY", async () => {
    const input = new PassThrough();
    Object.assign(input, { isTTY: true });
    await expect(readStdin(input, { timeoutMs: 20 })).resolves.toBe("");
  });
});

describe("pocketpet hook claude", () => {
  it("posts a mapped event to the loopback bridge", async () => {
    const input = JSON.stringify({ session_id: "s1", cwd: "/tmp/demo", hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: "/secret/a.ts" } });
    execFileSync(process.execPath, ["--import", "tsx", "src/cli.ts", "hook", "claude"], {
      input, cwd: process.cwd(), timeout: 10_000, env: { ...process.env, POCKETPET_HOME: home },
    });
    await vi.waitFor(() => expect(bridge.aggregator.snapshot(null, { sleepAfterMinutes: 0, quietHours: null }).sessions).toHaveLength(1));
    expect(bridge.aggregator.petState()).toBe("running");
  });

  it("exits 0 on invalid input and never throws", () => {
    expect(() => execFileSync(process.execPath, ["--import", "tsx", "src/cli.ts", "hook", "claude"], { input: "not json", cwd: process.cwd(), timeout: 10_000, env: { ...process.env, POCKETPET_HOME: home } })).not.toThrow();
  });

  it("logs a payload-free error for invalid input", () => {
    spawnHook("secret-payload-that-is-not-json");
    const log = readFileSync(join(home, "logs", "hook.log"), "utf8");
    expect(log).toMatch(/invalid hook input JSON/);
    expect(log).not.toContain("secret-payload-that-is-not-json");
  });

  it("exits 0 when no config exists", () => {
    const bare = mkdtempSync(join(tmpdir(), "pocketpet-bare-"));
    try {
      const input = JSON.stringify({ session_id: "s1", cwd: "/tmp/demo", hook_event_name: "Stop" });
      expect(() => spawnHook(input, { POCKETPET_HOME: bare })).not.toThrow();
      expect(existsSync(join(bare, "logs", "hook.log"))).toBe(true);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")("does not tighten the config file on the hook read path", () => {
    const target = join(home, "config.json");
    // Matching the owner-only mode is not required for a read; the hook must not chmod.
    chmodSync(target, 0o644);
    const input = JSON.stringify({ session_id: "s1", cwd: "/tmp/demo", hook_event_name: "Stop" });
    expect(() => spawnHook(input)).not.toThrow();
    expect(statSync(target).mode & 0o777).toBe(0o644);
  });

  it("logs a constant message instead of raw config contents", () => {
    writeFileSync(join(home, "config.json"), "SECRET_TOKEN_VALUE");
    const input = JSON.stringify({ session_id: "s1", cwd: "/tmp/demo", hook_event_name: "Stop" });
    expect(() => spawnHook(input)).not.toThrow();
    const log = readFileSync(join(home, "logs", "hook.log"), "utf8");
    expect(log).toContain("config unreadable");
    expect(log).not.toContain("SECRET_TOKEN_VALUE");
  });
});
