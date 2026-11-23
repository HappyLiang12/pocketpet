import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_APPEARANCE, normalizeAppearance, type Appearance } from "./appearance.js";
import { platform } from "./platform/index.js";
import type { PrivatePaths } from "./platform/types.js";

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;
const DEFAULT_PORT = 7788;

/** Override for the very first config only; invalid values fall back to the default. */
function initialPort(env: NodeJS.ProcessEnv): number {
  const raw = env.POCKETPET_PORT?.trim();
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_PORT;
  const port = Number(raw);
  return Number.isInteger(port) && port <= 65535 ? port : DEFAULT_PORT;
}

export type QuietHours = { start: string; end: string };
export type Config = {
  token: string;
  port: number;
  activePet: string | null;
  sleepAfterMinutes: number;
  quietHours: QuietHours | null;
  appearance: Appearance;
};

export function pocketpetHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.POCKETPET_HOME ?? join(homedir(), ".pocketpet");
}

export function configPath(home: string): string {
  return join(home, "config.json");
}

/**
 * Create the home layout and tighten its protection before any token is
 * written. The home is protected first so Windows children created afterwards
 * inherit the current-user-only DACL.
 */
function ensurePrivateLayout(home: string, security: PrivatePaths): void {
  mkdirSync(home, { recursive: true, mode: DIR_MODE });
  security.protectHome(home);
  mkdirSync(join(home, "pets"), { recursive: true, mode: DIR_MODE });
  mkdirSync(join(home, "cache", "petdex"), { recursive: true, mode: DIR_MODE });
  mkdirSync(join(home, "logs"), { recursive: true, mode: DIR_MODE });
  security.protectLogs(home);
}

/**
 * Startup hardening for an existing install: create the private layout, then
 * protect the config file before reading it. A protection failure throws, so
 * the bridge refuses to start with a weak config instead of reading the token.
 *
 * Only startup commands (`init`, `up`, `run`, `service`) call this, directly or
 * through `ensureConfig`. Hook reads use the pure `loadConfig`.
 */
export function hardenConfig(home: string, security: PrivatePaths = platform.security): Config {
  ensurePrivateLayout(home, security);
  return hardenExistingConfig(home, security);
}

function hardenExistingConfig(home: string, security: PrivatePaths): Config {
  security.protectFile(configPath(home));
  return loadConfig(home);
}

/**
 * Startup entry point: harden an existing install or create the first config.
 * Protection happens before any token file is read or written.
 */
export function ensureConfig(
  home: string,
  env: NodeJS.ProcessEnv = process.env,
  security: PrivatePaths = platform.security,
): Config {
  ensurePrivateLayout(home, security);
  if (existsSync(configPath(home))) return hardenExistingConfig(home, security);
  const config: Config = {
    token: randomBytes(32).toString("base64url"),
    port: initialPort(env),
    activePet: null,
    sleepAfterMinutes: 10,
    quietHours: null,
    appearance: normalizeAppearance(DEFAULT_APPEARANCE),
  };
  saveConfig(home, config, security);
  return config;
}

/**
 * Pure read of an already hardened config. It never changes permissions, so the
 * hook hot path cannot spawn an ACL command; startup callers harden first.
 */
export function loadConfig(home: string): Config {
  const target = configPath(home);
  const parsed = JSON.parse(readFileSync(target, "utf8")) as Partial<Config>;
  if (typeof parsed.token !== "string" || parsed.token.length < 16) throw new Error("config.token missing or too short");
  const port = parsed.port ?? 7788;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("config.port invalid");
  return {
    token: parsed.token,
    port,
    activePet: parsed.activePet ?? null,
    sleepAfterMinutes: parsed.sleepAfterMinutes ?? 10,
    quietHours: parsed.quietHours ?? null,
    appearance: normalizeAppearance(parsed.appearance),
  };
}

/**
 * Write the config atomically and fail closed. The token-bearing temp file is
 * protected and verified before it can replace the live config, so the rename
 * cannot install a weaker DACL. After the rename the final path is verified
 * again; that verification is intentionally not destructive: once the rename
 * happened the old token is gone, and deleting the file would turn a transient
 * verification failure into token loss.
 *
 * Precondition: an existing home must already be protected by `ensureConfig` or
 * `hardenConfig`. A home created here is protected before the temp file exists.
 */
export function saveConfig(home: string, config: Config, security: PrivatePaths = platform.security): void {
  if (mkdirSync(home, { recursive: true, mode: DIR_MODE })) security.protectHome(home);
  const target = configPath(home);
  const mode = existsSync(target) ? statSync(target).mode & 0o777 : FILE_MODE;
  const tmpPath = `${target}.tmp`;
  try {
    writeFileSync(tmpPath, JSON.stringify(config, null, 2) + "\n", { mode });
    security.protectFile(tmpPath);
    renameSync(tmpPath, target);
    security.protectFile(target);
  } catch (error) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // The temp file may never have been created, or the rename already consumed it.
    }
    throw error;
  }
}
