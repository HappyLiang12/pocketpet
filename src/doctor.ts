import { existsSync, readFileSync } from "node:fs";
import { connect } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { configPath, loadConfig } from "./config.js";
import { CLAUDE_HOOK_EVENTS, HOOK_COMMAND } from "./adapters/claudeInstall.js";
import { scanLocalPets } from "./pets.js";

export type Check = { name: string; status: "PASS" | "WARN" | "FAIL"; detail: string };
type Options = { home: string; settingsPath?: string; localPetDirs?: string[]; probePort?: (port: number) => Promise<boolean> };

function probe(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.setTimeout(300);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(false));
  });
}

function claudeHookCheck(settingsPath: string): Check {
  if (!existsSync(settingsPath)) return { name: "claude hooks", status: "FAIL", detail: `settings not found: ${settingsPath}` };
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as { hooks?: Record<string, Array<{ hooks?: Array<{ command?: string }> }>> };
    const missing = CLAUDE_HOOK_EVENTS.filter((event) => !(settings.hooks?.[event] ?? []).some((entry) => (entry.hooks ?? []).some((hook) => hook.command === HOOK_COMMAND)));
    return missing.length === 0 ? { name: "claude hooks", status: "PASS", detail: "all events wired" } : { name: "claude hooks", status: "FAIL", detail: `missing: ${missing.join(", ")}` };
  } catch {
    return { name: "claude hooks", status: "FAIL", detail: "invalid settings JSON" };
  }
}

// Never surface a raw JSON.parse message here: newer Node versions quote file
// content in it, which would leak config.token into doctor output.
function describeConfigError(error: unknown): string {
  if (error instanceof SyntaxError) return "invalid config JSON";
  return error instanceof Error ? error.message : "invalid";
}

export async function doctorChecks(opts: Options): Promise<Check[]> {
  const checks: Check[] = [];
  const major = Number(process.versions.node.split(".")[0]);
  checks.push({ name: "node", status: major >= 20 ? "PASS" : "FAIL", detail: process.versions.node });

  let config = null as ReturnType<typeof loadConfig> | null;
  try {
    config = loadConfig(opts.home);
    checks.push({ name: "config", status: "PASS", detail: configPath(opts.home) });
  } catch (error) {
    checks.push({ name: "config", status: "FAIL", detail: describeConfigError(error) });
  }

  const settingsPath = opts.settingsPath ?? join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "settings.json");
  checks.push(claudeHookCheck(settingsPath));

  const pets = scanLocalPets(opts.localPetDirs ?? [join(opts.home, "pets"), join(homedir(), ".codex", "pets"), join(homedir(), ".petdex", "pets")]);
  checks.push(pets.length > 0 ? { name: "pets", status: "PASS", detail: `${pets.length} local pet(s)` } : { name: "pets", status: "WARN", detail: "none found; run npx petdex install boba" });

  if (config) {
    const open = await (opts.probePort ?? probe)(config.port);
    checks.push({ name: "bridge", status: open ? "PASS" : "WARN", detail: open ? `listening on ${config.port}` : `not listening on ${config.port}; run pocketpet run` });
  } else {
    checks.push({ name: "bridge", status: "WARN", detail: "no config; run pocketpet init" });
  }
  return checks;
}
