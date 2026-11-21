import { describe, expect, it } from "vitest";
import { mapQoderHook } from "../src/adapters/qoderHook.js";

const base = {
  session_id: "s1",
  cwd: "/Users/me/projects/demo",
  hook_event_name: "PreToolUse",
  tool_name: "Edit",
  tool_input: { file_path: "/secret/input.ts" },
  tool_response: { stdout: "/secret/output" },
  error: "/secret/error",
  last_assistant_message: "/secret/assistant",
  message: "/secret/message",
  prompt: "/secret/prompt",
  transcript_path: "/secret/transcript.jsonl",
  permission_mode: "default",
  agent_id: "sub-1",
  agent_type: "Explore",
};

describe("mapQoderHook", () => {
  it("maps tools to working without leaking inputs", () => {
    const event = mapQoderHook(base, 1000);
    expect(event).toEqual({ v: 1, agent: "qoder", sessionId: "s1", project: "demo", phase: "working", tool: "Edit", ts: 1000 });
    expect(JSON.stringify(event)).not.toContain("/secret");
  });

  it("maps every supported event to a phase", () => {
    const cases: Array<[string, string]> = [
      ["SessionStart", "started"],
      ["UserPromptSubmit", "working"],
      ["PreToolUse", "working"],
      ["PostToolUse", "working"],
      ["SubagentStart", "working"],
      ["SubagentStop", "working"],
      ["PermissionRequest", "waiting"],
      ["PostToolUseFailure", "failed"],
      ["StopFailure", "failed"],
      ["Stop", "done"],
      ["SessionEnd", "idle"],
    ];
    for (const [eventName, phase] of cases) {
      expect(mapQoderHook({ ...base, hook_event_name: eventName })?.phase).toBe(phase);
    }
  });

  it("maps permission_prompt and elicitation_dialog notifications to waiting with a detail", () => {
    const permission = mapQoderHook({ ...base, hook_event_name: "Notification", notification_type: "permission_prompt" });
    expect(permission?.phase).toBe("waiting");
    expect(permission?.detail).toBe("permission_prompt");

    const elicitation = mapQoderHook({ ...base, hook_event_name: "Notification", notification_type: "elicitation_dialog" });
    expect(elicitation?.phase).toBe("waiting");
    expect(elicitation?.detail).toBe("elicitation_dialog");
  });

  it("ignores non-waiting and unknown notification types", () => {
    for (const notification_type of ["auth_success", "elicitation_response", "elicitation_complete", "idle_prompt", "mystery"]) {
      expect(mapQoderHook({ ...base, hook_event_name: "Notification", notification_type })).toBeNull();
    }
    expect(mapQoderHook({ ...base, hook_event_name: "Notification" })).toBeNull();
  });

  it("returns null for unknown events", () => {
    expect(mapQoderHook({ ...base, hook_event_name: "PreCompact" })).toBeNull();
    expect(mapQoderHook({ ...base, hook_event_name: "PermissionDenied" })).toBeNull();
  });

  it("returns null for missing, empty, or non-string required fields", () => {
    expect(mapQoderHook(null)).toBeNull();
    expect(mapQoderHook("payload")).toBeNull();
    expect(mapQoderHook([])).toBeNull();
    expect(mapQoderHook({ hook_event_name: "Stop", cwd: "/tmp/demo" })).toBeNull();
    expect(mapQoderHook({ session_id: "s1", hook_event_name: "Stop" })).toBeNull();
    expect(mapQoderHook({ session_id: "s1", cwd: "/tmp/demo" })).toBeNull();
    expect(mapQoderHook({ session_id: 7, cwd: "/tmp/demo", hook_event_name: "Stop" })).toBeNull();
    expect(mapQoderHook({ session_id: "  ", cwd: "/tmp/demo", hook_event_name: "Stop" })).toBeNull();
  });

  it("folds SubagentStart and SubagentStop into the parent session", () => {
    const start = mapQoderHook({ ...base, hook_event_name: "SubagentStart" });
    const stop = mapQoderHook({ ...base, hook_event_name: "SubagentStop" });
    expect(start?.sessionId).toBe("s1");
    expect(stop?.sessionId).toBe("s1");
    expect(start?.agent).toBe("qoder");
    expect(stop?.agent).toBe("qoder");
  });

  it("caps the project name at 120 characters", () => {
    const event = mapQoderHook({ ...base, cwd: `/tmp/${"a".repeat(150)}` });
    expect(event?.project).toHaveLength(120);
  });

  it("includes a tool name up to 120 characters and drops longer ones", () => {
    expect(mapQoderHook({ ...base, tool_name: "t".repeat(120) })?.tool).toHaveLength(120);
    expect(mapQoderHook({ ...base, tool_name: "t".repeat(121) })?.tool).toBeUndefined();
    expect(mapQoderHook({ ...base, tool_name: "  Edit  " })?.tool).toBe("Edit");
  });

  it("never copies transcript, prompts, messages, errors, or tool payloads", () => {
    const event = mapQoderHook({
      ...base,
      hook_event_name: "Notification",
      notification_type: "permission_prompt",
    });
    const serialized = JSON.stringify(event);
    for (const marker of ["/secret", "tool_input", "tool_response", "transcript_path", "last_assistant_message"]) {
      expect(serialized).not.toContain(marker);
    }
  });
});
