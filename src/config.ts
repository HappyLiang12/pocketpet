import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;
const DEFAULT_PORT = 7788;

/** Override for the very first config only; invalid values fall back to the default. */
function initialPort(env: NodeJS.ProcessEnv): number {
  const raw = env.FOLDPET_PORT?.trim();
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
};

export function foldPetHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.FOLDPET_HOME ?? join(homedir(), ".fold-pet");
}

export function configPath(home: string): string {
  return join(home, "config.json");
}

export function ensureConfig(home: string, env: NodeJS.ProcessEnv = process.env): Config {
  mkdirSync(join(home, "pets"), { recursive: true, mode: DIR_MODE });
  mkdirSync(join(home, "cache", "petdex"), { recursive: true, mode: DIR_MODE });
  mkdirSync(join(home, "logs"), { recursive: true, mode: DIR_MODE });
  if (existsSync(configPath(home))) return loadConfig(home);
  const config: Config = {
    token: randomBytes(32).toString("base64url"),
    port: initialPort(env),
    activePet: null,
    sleepAfterMinutes: 10,
    quietHours: null,
  };
  saveConfig(home, config);
  return config;
}

export function loadConfig(home: string): Config {
  const parsed = JSON.parse(readFileSync(configPath(home), "utf8")) as Partial<Config>;
  if (typeof parsed.token !== "string" || parsed.token.length < 16) throw new Error("config.token missing or too short");
  const port = parsed.port ?? 7788;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("config.port invalid");
  return {
    token: parsed.token,
    port,
    activePet: parsed.activePet ?? null,
    sleepAfterMinutes: parsed.sleepAfterMinutes ?? 10,
    quietHours: parsed.quietHours ?? null,
  };
}

export function saveConfig(home: string, config: Config): void {
  mkdirSync(home, { recursive: true, mode: DIR_MODE });
  const target = configPath(home);
  const mode = existsSync(target) ? statSync(target).mode & 0o777 : FILE_MODE;
  const tmpPath = `${target}.tmp`;
  try {
    writeFileSync(tmpPath, JSON.stringify(config, null, 2) + "\n", { mode });
    renameSync(tmpPath, target);
  } catch (error) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // The temp file may never have been created.
    }
    throw error;
  }
}
