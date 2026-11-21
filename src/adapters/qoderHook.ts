import { basename } from "node:path";
import type { NormalizedEvent, Phase } from "../events.js";

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

const WAITING_NOTIFICATIONS = new Set(["permission_prompt", "elicitation_dialog"]);

/**
 * Maps a Qoder hook payload to the shared event shape. Only the documented,
 * non-sensitive fields are read: session_id, cwd, hook_event_name, tool_name,
 * and notification_type. Tool inputs/outputs, messages, errors, prompts, and
 * transcript paths are never copied.
 */
export function mapQoderHook(input: unknown, now = Date.now()): NormalizedEvent | null {
  if (typeof input !== "object" || input === null) return null;
  const data = input as Record<string, unknown>;
  const sessionId = str(data.session_id);
  const cwd = str(data.cwd);
  const hookEvent = str(data.hook_event_name);
  if (!sessionId || !cwd || !hookEvent) return null;

  let phase: Phase;
  let detail: string | undefined;
  switch (hookEvent) {
    case "SessionStart":
      phase = "started";
      break;
    case "UserPromptSubmit":
    case "PreToolUse":
    case "PostToolUse":
    case "SubagentStart":
    case "SubagentStop":
      // Subagent hooks carry the parent session_id, so they fold into the
      // parent session instead of creating a separate visible chip.
      phase = "working";
      break;
    case "PermissionRequest":
      phase = "waiting";
      break;
    case "Notification": {
      const notificationType = str(data.notification_type);
      if (!notificationType || !WAITING_NOTIFICATIONS.has(notificationType)) return null;
      phase = "waiting";
      detail = notificationType;
      break;
    }
    case "PostToolUseFailure":
    case "StopFailure":
      phase = "failed";
      break;
    case "Stop":
      phase = "done";
      break;
    case "SessionEnd":
      phase = "idle";
      break;
    default:
      return null;
  }

  const event: NormalizedEvent = {
    v: 1,
    agent: "qoder",
    sessionId,
    project: basename(cwd).slice(0, 120) || "project",
    phase,
    ts: now,
  };
  const tool = str(data.tool_name);
  if (tool && tool.length <= 120) event.tool = tool;
  if (detail) event.detail = detail;
  return event;
}
