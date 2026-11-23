import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { windowsHookCommand } from "../platform/windows/hooks.js";

export const CLAUDE_HOOK_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Notification", "SubagentStop", "Stop", "SessionEnd"] as const;
export const HOOK_COMMAND = "pocketpet hook claude";

/** Quoted absolute form written on Windows: `"<node>" "<cli.js>" hook claude`. */
const WINDOWS_COMMAND = /^"[^"]+" "[^"]+" hook claude$/;
const ABSOLUTE_WINDOWS_PATH = /^(?:[A-Za-z]:[\\/]|\\\\)/;

/**
 * Claude hook command for the current host. macOS/Linux keep the existing
 * linked command; Windows uses the quoted absolute node + compiled CLI form
 * because an agent GUI may not inherit the shell PATH. A TypeScript entry
 * point keeps the linked-command fallback.
 */
export function claudeHookCommand(cliPath: string, nodePath: string, platformName: NodeJS.Platform = process.platform): string {
  if (platformName !== "win32" || !cliPath.endsWith(".js")) return HOOK_COMMAND;
  return windowsHookCommand(nodePath, cliPath, "claude");
}

/** Matches either PocketPet form, regardless of the current platform. */
function isPocketPetClaudeCommand(command: string): boolean {
  return command === HOOK_COMMAND || WINDOWS_COMMAND.test(command);
}

/**
 * True when a settings entry is PocketPet's Claude hook. On Windows only the
 * absolute quoted form is trustworthy: a bare `pocketpet hook claude` may rely
 * on a PATH the agent GUI does not inherit. macOS/Linux keep accepting both.
 */
export function isClaudeHookCommand(command: unknown, platformName: NodeJS.Platform = process.platform): command is string {
  if (typeof command !== "string") return false;
  if (platformName !== "win32") return isPocketPetClaudeCommand(command);
  const match = /^"([^"]+)" "([^"]+)" hook claude$/.exec(command);
  return Boolean(match && ABSOLUTE_WINDOWS_PATH.test(match[1]) && ABSOLUTE_WINDOWS_PATH.test(match[2]));
}

type Hook = { type?: string; command?: string };
type Entry = { hooks?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidSettings(settingsPath: string): Error {
  return new Error(`invalid Claude settings JSON: ${settingsPath}`);
}

/**
 * Idempotently adds the PocketPet command hook to every supported event in a
 * Claude Code settings file. Unrelated settings and existing hook entries are
 * preserved verbatim; anything that does not look like a settings object is
 * rejected instead of being overwritten. On Windows a stale PocketPet command
 * (for example the bare linked form written by an older install) is rewritten
 * in place, so re-running never adds a duplicate hook.
 */
export function installClaudeHooks(
  settingsPath: string,
  command = HOOK_COMMAND,
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
  for (const event of CLAUDE_HOOK_EVENTS) {
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
        if (platformName === "win32" && isPocketPetClaudeCommand(hook.command)) {
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
    entries.push({ hooks: [{ type: "command", command } satisfies Hook] });
    hooks[event] = entries;
    added.push(event);
  }

  settings.hooks = hooks;
  if (added.length === 0 && replaced.length === 0) return { added, already, replaced };

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
  return { added, already, replaced };
}
