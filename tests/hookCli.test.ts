import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureConfig, saveConfig } from "../src/config.js";
import { startBridge, type Bridge } from "../src/server.js";

let home = "";
let bridge: Bridge;
beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "foldpet-"));
  const webDist = join(home, "web");
  mkdirSync(webDist, { recursive: true });
  writeFileSync(join(webDist, "index.html"), "ok");
  const config = ensureConfig(home);
  bridge = await startBridge({ home, config, webDist, port: 0, localPetDirs: [join(home, "pets")], fetchImpl: async () => { throw new Error("offline"); } });
  saveConfig(home, { ...config, port: bridge.port });
});
afterEach(async () => { await bridge.close(); rmSync(home, { recursive: true, force: true }); });

function spawnHook(input: string, env: NodeJS.ProcessEnv = {}): void {
  execFileSync(process.execPath, ["--import", "tsx", "src/cli.ts", "hook", "claude"], {
    input, cwd: process.cwd(), timeout: 10_000, env: { ...process.env, FOLDPET_HOME: home, ...env },
  });
}

describe("fold-pet hook claude", () => {
  it("posts a mapped event to the loopback bridge", async () => {
    const input = JSON.stringify({ session_id: "s1", cwd: "/tmp/demo", hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: "/secret/a.ts" } });
    execFileSync(process.execPath, ["--import", "tsx", "src/cli.ts", "hook", "claude"], {
      input, cwd: process.cwd(), timeout: 10_000, env: { ...process.env, FOLDPET_HOME: home },
    });
    await vi.waitFor(() => expect(bridge.aggregator.snapshot(null, { sleepAfterMinutes: 0, quietHours: null }).sessions).toHaveLength(1));
    expect(bridge.aggregator.petState()).toBe("running");
  });

  it("exits 0 on invalid input and never throws", () => {
    expect(() => execFileSync(process.execPath, ["--import", "tsx", "src/cli.ts", "hook", "claude"], { input: "not json", cwd: process.cwd(), timeout: 10_000, env: { ...process.env, FOLDPET_HOME: home } })).not.toThrow();
  });

  it("logs a payload-free error for invalid input", () => {
    spawnHook("secret-payload-that-is-not-json");
    const log = readFileSync(join(home, "logs", "hook.log"), "utf8");
    expect(log).toMatch(/invalid hook input JSON/);
    expect(log).not.toContain("secret-payload-that-is-not-json");
  });

  it("exits 0 when no config exists", () => {
    const bare = mkdtempSync(join(tmpdir(), "foldpet-bare-"));
    try {
      const input = JSON.stringify({ session_id: "s1", cwd: "/tmp/demo", hook_event_name: "Stop" });
      expect(() => spawnHook(input, { FOLDPET_HOME: bare })).not.toThrow();
      expect(existsSync(join(bare, "logs", "hook.log"))).toBe(true);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});
