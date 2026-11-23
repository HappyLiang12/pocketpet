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

/** The linked command written on macOS/Linux and by the TypeScript entry fallback. */
const BARE_COMMAND = "pocketpet hook qoder";
/** Quoted absolute form written on Windows: `"<node>" "<cli.js>" hook qoder`. */
const WINDOWS_COMMAND = /^"[^"]+" "[^"]+" hook qoder$/;
const ABSOLUTE_WINDOWS_PATH = /^(?:[A-Za-z]:[\\/]|\\\\)/;

/** Matches either PocketPet form, regardless of the current platform. */
function isPocketPetQoderCommand(command: string): boolean {
  return command === BARE_COMMAND || WINDOWS_COMMAND.test(command);
}

/**
 * True when a settings entry is PocketPet's Qoder hook. On Windows only the
 * absolute quoted form is trustworthy: a bare `pocketpet hook qoder` may rely
 * on a PATH the Qoder app does not inherit. macOS/Linux keep the historical
 * marker match, which also accepts the shell-quoted macOS form.
 */
export function isQoderHookCommand(command: unknown, platformName: NodeJS.Platform = process.platform): command is string {
  if (typeof command !== "string") return false;
  if (platformName !== "win32") return command.includes(qoderHookMarker);
  const match = /^"([^"]+)" "([^"]+)" hook qoder$/.exec(command);
  return Boolean(match && ABSOLUTE_WINDOWS_PATH.test(match[1]) && ABSOLUTE_WINDOWS_PATH.test(match[2]));
}

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
 * rejected instead of being overwritten. On Windows a stale PocketPet command
 * (for example the bare linked form written by an older install) is rewritten
 * in place, so re-running never adds a duplicate hook.
 */
export function installQoderHooks(
  settingsPath: string,
  command: string,
  platformName: NodeJS.Platform = process.platform,
): { added: string[]; already: string[]; replaced: string[] } {
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
  const replaced: string[] = [];
  for (const event of QODER_HOOK_EVENTS) {
    const current = hooks[event];
    if (current !== undefined && current !== null && !Array.isArray(current)) throw invalidSettings(settingsPath);
    const entries: Entry[] = Array.isArray(current) ? (current as Entry[]) : [];
    let present = false;
    let upgraded = false;
    for (const entry of entries) {
      if (!isRecord(entry) || !Array.isArray(entry.hooks)) continue;
      for (const hook of entry.hooks as unknown[]) {
        if (!isRecord(hook) || hook.type !== "command" || typeof hook.command !== "string") continue;
        if (hook.command === command) {
          present = true;
          continue;
        }
        // Only Windows rewrites stale entries; macOS/Linux behavior is unchanged.
        if (platformName === "win32" && isPocketPetQoderCommand(hook.command)) {
          hook.command = command;
          upgraded = true;
        }
      }
    }
    if (present) {
      already.push(event);
      if (upgraded) replaced.push(event);
      continue;
    }
    if (upgraded) {
      hooks[event] = entries;
      replaced.push(event);
      continue;
    }
    entries.push({ hooks: [{ type: "command", command, timeout: 2 } satisfies Hook] });
    hooks[event] = entries;
    added.push(event);
  }

  settings.hooks = hooks;
  if (added.length === 0 && replaced.length === 0) return { added, already, replaced };

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
  return { added, already, replaced };
}

export type QoderHookStatus = { present: string[]; missing: string[] };

/**
 * Reports which required events already have a PocketPet command hook. macOS
 * and Linux match any command containing `hook qoder`, so both the compiled
 * absolute command and the source `pocketpet hook qoder` fallback count. Windows
 * requires the quoted absolute form, because the bare command relies on a PATH
 * the Qoder app may not inherit. Returns null when the file is not valid
 * settings JSON.
 */
export function qoderHookEventStatus(settingsPath: string, platformName: NodeJS.Platform = process.platform): QoderHookStatus | null {
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
          entry.hooks.some((hook) => isRecord(hook) && hook.type === "command" && isQoderHookCommand(hook.command, platformName)),
      );
    (wired ? present : missing).push(event);
  }
  return { present, missing };
}
