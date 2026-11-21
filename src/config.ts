import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

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

export function ensureConfig(home: string): Config {
  mkdirSync(join(home, "pets"), { recursive: true });
  mkdirSync(join(home, "cache", "petdex"), { recursive: true });
  mkdirSync(join(home, "logs"), { recursive: true });
  if (existsSync(configPath(home))) return loadConfig(home);
  const config: Config = {
    token: randomBytes(32).toString("base64url"),
    port: 7788,
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
  mkdirSync(home, { recursive: true });
  writeFileSync(configPath(home), JSON.stringify(config, null, 2) + "\n");
}
