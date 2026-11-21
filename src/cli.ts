#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { foldPetHome, loadConfig, type Config } from "./config.js";
import { mapClaudeHook } from "./adapters/claudeHook.js";

const HOOK_TIMEOUT_MS = 500;
const MAX_LOG_BYTES = 1_000_000;
export const MAX_STDIN_BYTES = 256 * 1024;
export const STDIN_TIMEOUT_MS = 1000;

export type ReadStdinOptions = { maxBytes?: number; timeoutMs?: number };

/**
 * Reads a hook payload from `input` with a hard size cap and an overall
 * deadline. Returns `null` when either trips so the hook can exit cleanly
 * without posting, instead of blocking the agent on an open pipe.
 */
export async function readStdin(input: Readable = process.stdin, opts: ReadStdinOptions = {}): Promise<string | null> {
  if ((input as Readable & { isTTY?: boolean }).isTTY) return "";
  const maxBytes = opts.maxBytes ?? MAX_STDIN_BYTES;
  const timeoutMs = opts.timeoutMs ?? STDIN_TIMEOUT_MS;
  return await new Promise<string | null>((resolve) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    let timer: NodeJS.Timeout;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.off("data", onData);
      input.off("end", onEnd);
      input.off("error", onError);
      if (value === null) input.pause();
      resolve(value);
    };
    const onData = (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > maxBytes) {
        finish(null);
        return;
      }
      chunks.push(buffer);
    };
    const onEnd = () => finish(Buffer.concat(chunks).toString("utf8"));
    const onError = () => finish(null);
    timer = setTimeout(() => finish(null), timeoutMs);
    input.on("data", onData);
    input.on("end", onEnd);
    input.on("error", onError);
  });
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
    if (raw === null || !raw.trim()) return;
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
    let config: Config;
    try {
      config = loadConfig(home);
    } catch {
      // Do not log the config error: Node's JSON.parse message may quote the token.
      logHookError(home, "config unreadable");
      return;
    }
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
