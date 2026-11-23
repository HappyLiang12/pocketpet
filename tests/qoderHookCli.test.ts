import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "../src/aggregator.js";
import { ensureConfig, saveConfig } from "../src/config.js";
import { startBridge, type Bridge } from "../src/server.js";
import { testHost, testSecurity } from "./helpers/test-platform.js";

let home = "";
let bridge: Bridge;
beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "pocketpet-qoder-"));
  const webDist = join(home, "web");
  mkdirSync(webDist, { recursive: true });
  writeFileSync(join(webDist, "index.html"), "ok");
  const config = ensureConfig(home, process.env, testSecurity);
  bridge = await startBridge({ home, config, webDist, port: 0, localPetDirs: [join(home, "pets")], host: testHost, fetchImpl: async () => { throw new Error("offline"); } });
  saveConfig(home, { ...config, port: bridge.port }, testSecurity);
});
afterEach(async () => { await bridge.close(); rmSync(home, { recursive: true, force: true }); });

function spawnHook(input: string, env: NodeJS.ProcessEnv = {}): void {
  execFileSync(process.execPath, ["--import", "tsx", "src/cli.ts", "hook", "qoder"], {
    input, cwd: process.cwd(), timeout: 10_000, env: { ...process.env, POCKETPET_HOME: home, ...env },
  });
}

function snapshotSessions(): Snapshot["sessions"] {
  return bridge.aggregator.snapshot(null, { sleepAfterMinutes: 0, quietHours: null }).sessions;
}

describe("pocketpet hook qoder", () => {
  it("posts a mapped Qoder event to the loopback bridge", async () => {
    const input = JSON.stringify({
      session_id: "q1",
      cwd: "/tmp/qoder-demo",
      hook_event_name: "PreToolUse",
      tool_name: "Edit",
      tool_input: { file_path: "/secret/a.ts" },
      transcript_path: "/secret/t.jsonl",
    });
    spawnHook(input);
    await vi.waitFor(() => expect(snapshotSessions()).toHaveLength(1));
    const [session] = snapshotSessions();
    expect(session.agent).toBe("qoder");
    expect(session.sessionId).toBe("q1");
    expect(session.project).toBe("qoder-demo");
    expect(session.phase).toBe("working");
    expect(session.tool).toBe("Edit");
    expect(bridge.aggregator.petState()).toBe("running");
    expect(JSON.stringify(session)).not.toContain("/secret");
  });

  it("maps a permission notification to the waiting pet", async () => {
    spawnHook(JSON.stringify({
      session_id: "q2",
      cwd: "/tmp/qoder-demo",
      hook_event_name: "Notification",
      notification_type: "permission_prompt",
    }));
    await vi.waitFor(() => expect(snapshotSessions()).toHaveLength(1));
    expect(snapshotSessions()[0].phase).toBe("waiting");
    expect(bridge.aggregator.petState()).toBe("waiting");
  });

  it("maps Stop to done and the jumping flash", async () => {
    spawnHook(JSON.stringify({ session_id: "q3", cwd: "/tmp/qoder-demo", hook_event_name: "Stop" }));
    await vi.waitFor(() => expect(snapshotSessions()).toHaveLength(1));
    expect(snapshotSessions()[0].phase).toBe("done");
    expect(bridge.aggregator.petState()).toBe("jumping");
  });

  it("maps StopFailure to failed", async () => {
    spawnHook(JSON.stringify({ session_id: "q4", cwd: "/tmp/qoder-demo", hook_event_name: "StopFailure" }));
    await vi.waitFor(() => expect(snapshotSessions()).toHaveLength(1));
    expect(snapshotSessions()[0].phase).toBe("failed");
    expect(bridge.aggregator.petState()).toBe("failed");
  });

  it("removes the session on SessionEnd", async () => {
    spawnHook(JSON.stringify({ session_id: "q5", cwd: "/tmp/qoder-demo", hook_event_name: "SessionStart" }));
    await vi.waitFor(() => expect(snapshotSessions()).toHaveLength(1));
    spawnHook(JSON.stringify({ session_id: "q5", cwd: "/tmp/qoder-demo", hook_event_name: "SessionEnd" }));
    await vi.waitFor(() => expect(snapshotSessions()).toHaveLength(0));
  });

  it("exits 0 on invalid input and logs a payload-free error", () => {
    expect(() => spawnHook("secret-payload-that-is-not-json")).not.toThrow();
    const log = readFileSync(join(home, "logs", "hook.log"), "utf8");
    expect(log).toMatch(/invalid hook input JSON/);
    expect(log).not.toContain("secret-payload-that-is-not-json");
  });

  it("exits 0 for an unknown agent", () => {
    expect(() => execFileSync(process.execPath, ["--import", "tsx", "src/cli.ts", "hook", "unknown-agent"], {
      input: "{}", cwd: process.cwd(), timeout: 10_000, env: { ...process.env, POCKETPET_HOME: home },
    })).not.toThrow();
  });
});
