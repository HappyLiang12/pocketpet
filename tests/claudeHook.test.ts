import { describe, expect, it } from "vitest";
import { mapClaudeHook } from "../src/adapters/claudeHook.js";

const base = { session_id: "s1", cwd: "/Users/me/projects/demo", hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: "/secret/file.ts" }, transcript_path: "/secret/t.jsonl" };

describe("mapClaudeHook", () => {
  it("maps tools to working without leaking inputs", () => {
    const event = mapClaudeHook(base, 1000);
    expect(event).toEqual({ v: 1, agent: "claude", sessionId: "s1", project: "demo", phase: "working", tool: "Edit", ts: 1000 });
    expect(JSON.stringify(event)).not.toContain("/secret");
  });
  it("maps notification to waiting", () => expect(mapClaudeHook({ ...base, hook_event_name: "Notification" })?.phase).toBe("waiting"));
  it("maps stop to done", () => expect(mapClaudeHook({ ...base, hook_event_name: "Stop" })?.phase).toBe("done"));
  it("maps session start to started", () => expect(mapClaudeHook({ ...base, hook_event_name: "SessionStart" })?.phase).toBe("started"));
  it("maps session end to idle", () => expect(mapClaudeHook({ ...base, hook_event_name: "SessionEnd" })?.phase).toBe("idle"));
  it("returns null for unknown events", () => expect(mapClaudeHook({ ...base, hook_event_name: "PreCompact" })).toBeNull());
  it("returns null when required fields are missing", () => expect(mapClaudeHook({ hook_event_name: "Stop" })).toBeNull());
});
