#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { foldPetHome, loadConfig } from "./config.js";
import { mapClaudeHook } from "./adapters/claudeHook.js";

const HOOK_TIMEOUT_MS = 500;
const MAX_LOG_BYTES = 1_000_000;

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Appends a single-line diagnostic to `<home>/logs/hook.log`, truncating the
 * file once it grows past 1 MB. Never throws and never receives hook payloads.
 */
export function logHookError(home: string, message: string): void {
  try {
    const dir = join(home, "logs");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "hook.log");
    if (existsSync(file) && statSync(file).size > MAX_LOG_BYTES) writeFileSync(file, "");
    const line = message.replace(/[\r\n]+/g, " ");
    appendFileSync(file, `${new Date().toISOString()} ${line}\n`);
  } catch {
    return;
  }
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  if (cause instanceof Error && cause.message && cause.message !== error.message) return `${error.message}: ${cause.message}`;
  return error.message;
}

/**
 * Hook hot path: reads one Claude hook payload from stdin, maps it and posts it
 * to the loopback bridge. Failures are logged and swallowed; this never throws.
 */
export async function runHook(agent: string): Promise<void> {
  if (agent !== "claude") return;
  const home = foldPetHome();
  try {
    const raw = await readStdin();
    if (!raw.trim()) return;
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      // Do not log the parse error: Node embeds a snippet of the raw payload in it.
      logHookError(home, "invalid hook input JSON");
      return;
    }
    const event = mapClaudeHook(payload);
    if (!event) return;
    const config = loadConfig(home);
    const response = await fetch(`http://127.0.0.1:${config.port}/api/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(HOOK_TIMEOUT_MS),
    });
    if (!response.ok) logHookError(home, `bridge rejected event: HTTP ${response.status}`);
  } catch (error) {
    logHookError(home, describeError(error));
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const [command, arg] = argv;
  switch (command) {
    case "hook":
      await runHook(arg ?? "");
      return 0;
    default:
      console.error("usage: fold-pet init | run | doctor | hook claude");
      return 2;
  }
}

function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main().then((code) => { process.exitCode = code; });
}
