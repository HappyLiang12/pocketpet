import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const CLAUDE_HOOK_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Notification", "SubagentStop", "Stop", "SessionEnd"] as const;
export const HOOK_COMMAND = "fold-pet hook claude";

type Hook = { type?: string; command?: string };
type Entry = { hooks?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidSettings(settingsPath: string): Error {
  return new Error(`invalid Claude settings JSON: ${settingsPath}`);
}

/**
 * Idempotently adds the FoldPet command hook to every supported event in a
 * Claude Code settings file. Unrelated settings and existing hook entries are
 * preserved verbatim; anything that does not look like a settings object is
 * rejected instead of being overwritten.
 */
export function installClaudeHooks(settingsPath: string, command = HOOK_COMMAND): { added: string[]; already: string[] } {
  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(settingsPath, "utf8"));
    } catch {
      throw invalidSettings(settingsPath);
    }
    if (!isRecord(parsed)) throw invalidSettings(settingsPath);
    settings = parsed;
  }

  const rawHooks = settings.hooks;
  if (rawHooks !== undefined && rawHooks !== null && !isRecord(rawHooks)) throw invalidSettings(settingsPath);
  const hooks: Record<string, unknown> = isRecord(rawHooks) ? rawHooks : {};

  const added: string[] = [];
  const already: string[] = [];
  for (const event of CLAUDE_HOOK_EVENTS) {
    const current = hooks[event];
    if (current !== undefined && current !== null && !Array.isArray(current)) throw invalidSettings(settingsPath);
    const entries: Entry[] = Array.isArray(current) ? (current as Entry[]) : [];
    const present = entries.some((entry) =>
      isRecord(entry) && Array.isArray(entry.hooks) && entry.hooks.some((hook: unknown) => isRecord(hook) && hook.type === "command" && hook.command === command),
    );
    if (present) {
      already.push(event);
      continue;
    }
    entries.push({ hooks: [{ type: "command", command } satisfies Hook] });
    hooks[event] = entries;
    added.push(event);
  }

  settings.hooks = hooks;
  if (added.length === 0) return { added, already };

  // Follow symlinks so the rename replaces the real settings file instead of
  // the link, and keep the existing owner/group/other bits. Claude writes this
  // file itself, so a fresh one defaults to owner-only.
  const target = existsSync(settingsPath) ? realpathSync(settingsPath) : settingsPath;
  const mode = existsSync(target) ? statSync(target).mode & 0o777 : 0o600;
  mkdirSync(dirname(target), { recursive: true });
  const tmpPath = `${target}.tmp`;
  try {
    writeFileSync(tmpPath, JSON.stringify(settings, null, 2) + "\n", { mode });
    renameSync(tmpPath, target);
  } catch (error) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // The temp file may never have been created.
    }
    throw error;
  }
  return { added, already };
}
