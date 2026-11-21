import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const QODER_HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "Notification",
  "SubagentStart",
  "SubagentStop",
  "Stop",
  "StopFailure",
  "SessionEnd",
] as const;

/** Substring every PocketPet Qoder hook command contains; used by doctor. */
export const qoderHookMarker = "hook qoder";

type Hook = { type?: string; command?: string; timeout?: number };
type Entry = { hooks?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidSettings(settingsPath: string): Error {
  return new Error(`invalid Qoder settings JSON: ${settingsPath}`);
}

/**
 * Candidate user-level Qoder settings files. Both roots are returned even when
 * they do not exist yet; callers decide whether a root exists by checking
 * `dirname(path)`, and must not create a root that was never there.
 */
export function qoderSettingsPaths(home = homedir()): string[] {
  return [join(home, ".qoder", "settings.json"), join(home, ".qoder-cn", "settings.json")];
}

/**
 * Idempotently adds the PocketPet command hook to every supported event in a
 * Qoder settings file. Unrelated settings, `hooksConfig`, and foreign hooks are
 * preserved verbatim; anything that does not look like a settings object is
 * rejected instead of being overwritten.
 */
export function installQoderHooks(settingsPath: string, command: string): { added: string[]; already: string[] } {
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
  for (const event of QODER_HOOK_EVENTS) {
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
    entries.push({ hooks: [{ type: "command", command, timeout: 2 } satisfies Hook] });
    hooks[event] = entries;
    added.push(event);
  }

  settings.hooks = hooks;
  if (added.length === 0) return { added, already };

  // Follow symlinks so the rename replaces the real settings file instead of
  // the link, and keep the existing owner/group/other bits. A fresh Qoder
  // settings file defaults to owner-only.
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

export type QoderHookStatus = { present: string[]; missing: string[] };

/**
 * Reports which required events already have a PocketPet command hook. A hook
 * matches when its command contains `hook qoder`, so both the compiled absolute
 * command and the source `pocketpet hook qoder` fallback count. Returns null
 * when the file is not valid settings JSON.
 */
export function qoderHookEventStatus(settingsPath: string): QoderHookStatus | null {
  if (!existsSync(settingsPath)) return { present: [], missing: [...QODER_HOOK_EVENTS] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(settingsPath, "utf8"));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const hooks = isRecord(parsed.hooks) ? parsed.hooks : {};
  const present: string[] = [];
  const missing: string[] = [];
  for (const event of QODER_HOOK_EVENTS) {
    const entries = hooks[event];
    const wired =
      Array.isArray(entries) &&
      entries.some(
        (entry) =>
          isRecord(entry) &&
          Array.isArray(entry.hooks) &&
          entry.hooks.some((hook) => isRecord(hook) && hook.type === "command" && typeof hook.command === "string" && hook.command.includes(qoderHookMarker)),
      );
    (wired ? present : missing).push(event);
  }
  return { present, missing };
}
