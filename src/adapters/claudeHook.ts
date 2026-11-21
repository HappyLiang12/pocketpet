import { basename } from "node:path";
import type { NormalizedEvent, Phase } from "../events.js";

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function mapClaudeHook(input: unknown, now = Date.now()): NormalizedEvent | null {
  if (typeof input !== "object" || input === null) return null;
  const data = input as Record<string, unknown>;
  const sessionId = str(data.session_id);
  const cwd = str(data.cwd);
  const hookEvent = str(data.hook_event_name);
  if (!sessionId || !cwd || !hookEvent) return null;

  let phase: Phase;
  switch (hookEvent) {
    case "SessionStart": phase = "started"; break;
    case "UserPromptSubmit": phase = "working"; break;
    case "PreToolUse":
    case "PostToolUse": phase = "working"; break;
    case "Notification": phase = "waiting"; break;
    case "SubagentStop": phase = "working"; break;
    case "Stop": phase = "done"; break;
    case "SessionEnd": phase = "idle"; break;
    default: return null;
  }

  const event: NormalizedEvent = {
    v: 1,
    agent: "claude",
    sessionId,
    project: basename(cwd).slice(0, 120) || "project",
    phase,
    ts: now,
  };
  const tool = str(data.tool_name);
  if (tool && tool.length <= 120) event.tool = tool;
  return event;
}
