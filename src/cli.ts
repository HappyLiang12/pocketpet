#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import qrcode from "qrcode-terminal";
import { configPath, ensureConfig, hardenConfig, pocketpetHome, loadConfig, type Config } from "./config.js";
import { CLAUDE_HOOK_EVENTS, claudeHookCommand, installClaudeHooks, isClaudeHookCommand } from "./adapters/claudeInstall.js";
import { mapClaudeHook } from "./adapters/claudeHook.js";
import { installQoderHooks, qoderHookEventStatus, qoderSettingsPaths } from "./adapters/qoderInstall.js";
import { mapQoderHook } from "./adapters/qoderHook.js";
import { doctorChecks } from "./doctor.js";
import { pairingCopy, pickLanguage } from "./i18n.js";
import { askYesNo, pairingLinks, type InterfaceMap, type QrHost } from "./onboarding.js";
import { platform } from "./platform/index.js";
import type { Platform, ServiceConfig } from "./platform/types.js";
import { windowsHookCommand } from "./platform/windows/hooks.js";
import { startBridge, type Bridge, type BridgeOptions } from "./server.js";

const HOOK_TIMEOUT_MS = 500;
const MAX_LOG_BYTES = 1_000_000;
const HEALTH_TIMEOUT_MS = 800;
const SERVICE_HEALTH_TIMEOUT_MS = 10_000;
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

/** Agent name to hook mapper. Unknown agents are ignored so the hook exits 0. */
const HOOK_MAPPERS: Record<string, (input: unknown) => ReturnType<typeof mapClaudeHook>> = {
  claude: mapClaudeHook,
  qoder: mapQoderHook,
};

/**
 * Hook hot path: reads one agent hook payload from stdin, maps it and posts it
 * to the loopback bridge. Failures are logged and swallowed; this never throws.
 */
export async function runHook(agent: string): Promise<void> {
  const mapper = HOOK_MAPPERS[agent];
  if (!mapper) return;
  const home = pocketpetHome();
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
    const event = mapper(payload);
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

function claudeSettingsPath(): string {
  return join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "settings.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when every PocketPet hook event is wired as a command hook in the Claude settings file. */
export function hasPocketPetHooks(settingsPath: string): boolean {
  if (!existsSync(settingsPath)) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(settingsPath, "utf8"));
  } catch {
    return false;
  }
  if (!isRecord(parsed) || !isRecord(parsed.hooks)) return false;
  const hooks = parsed.hooks;
  return CLAUDE_HOOK_EVENTS.every((event) => {
    const entries = hooks[event];
    if (!Array.isArray(entries)) return false;
    return entries.some(
      (entry) =>
        isRecord(entry) &&
        Array.isArray(entry.hooks) &&
        entry.hooks.some((hook) => isRecord(hook) && hook.type === "command" && isClaudeHookCommand(hook.command)),
    );
  });
}

/** Qoder roots that already exist on this machine; a missing root is never created. */
function existingQoderSettingsPaths(): string[] {
  return qoderSettingsPaths().filter((settingsPath) => existsSync(dirname(settingsPath)));
}

function hasQoderHooks(settingsPath: string): boolean {
  const status = qoderHookEventStatus(settingsPath);
  return status !== null && status.missing.length === 0;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * Shell-safe command for Qoder's Settings → Hooks. A macOS GUI app may not
 * inherit the shell PATH, so a compiled CLI (dist/cli.js) is invoked through
 * the absolute Node binary. Windows uses the platform's quoted absolute
 * command. A TypeScript entry point (tsx) falls back to the linked `pocketpet`
 * command; production installs use dist/cli.js.
 */
export function qoderHookCommand(
  cliPath = fileURLToPath(import.meta.url),
  nodePath = process.execPath,
  platformName: NodeJS.Platform = process.platform,
): string {
  if (!cliPath.endsWith(".js")) return "pocketpet hook qoder";
  if (platformName === "win32") return windowsHookCommand(nodePath, cliPath, "qoder");
  return `${shellQuote(nodePath)} ${shellQuote(cliPath)} hook qoder`;
}

/**
 * Installs Qoder hooks into every existing root without prompting. Used by
 * `pocketpet init`; absent roots are reported, never created.
 */
function installQoderHooksForInit(): void {
  const roots = existingQoderSettingsPaths();
  if (roots.length === 0) {
    console.log("Qoder not detected (no ~/.qoder or ~/.qoder-cn); skipping Qoder hooks.");
    return;
  }
  const command = qoderHookCommand();
  for (const settingsPath of roots) {
    const root = dirname(settingsPath);
    try {
      const result = installQoderHooks(settingsPath, command);
      console.log(`Qoder hooks (${root}) added: ${result.added.join(", ") || "none"}`);
      console.log(`Qoder hooks (${root}) already present: ${result.already.join(", ") || "none"}`);
    } catch {
      console.error(`Qoder hooks (${root}): could not update settings; continuing.`);
    }
  }
}

/**
 * Installs Claude hooks only with explicit consent. Non-TTY callers are never
 * prompted, and failures are reported generically because the settings JSON
 * may contain unrelated secrets.
 */
async function setupClaudeHooks(options: { yes: boolean; noHooks: boolean }): Promise<void> {
  if (options.noHooks) {
    console.log("Claude Code hooks: skipped (--no-hooks)");
    return;
  }
  const settingsPath = claudeSettingsPath();
  if (hasPocketPetHooks(settingsPath)) {
    console.log("Claude Code hooks: already installed");
    return;
  }
  const tty = Boolean(process.stdin.isTTY);
  let install = false;
  if (options.yes) install = true;
  else if (tty) install = await askYesNo("Install Claude Code hooks?", true, tty);
  else {
    console.log("Claude Code hooks: skipped (not a TTY; pass --yes or run `pocketpet init`)");
    return;
  }
  if (!install) {
    console.log("Claude Code hooks: skipped");
    return;
  }
  try {
    const result = installClaudeHooks(settingsPath, claudeHookCommand(fileURLToPath(import.meta.url), process.execPath));
    console.log(`Claude Code hooks added: ${result.added.join(", ") || "none"}`);
  } catch {
    console.error("Claude Code hooks: could not update settings; continuing without hooks.");
  }
}

/**
 * Installs Qoder hooks only into existing roots, with the same consent rules as
 * Claude. A missing root is skipped silently; failures never block the bridge.
 */
async function setupQoderHooks(options: { yes: boolean; noHooks: boolean }): Promise<void> {
  const roots = existingQoderSettingsPaths();
  if (roots.length === 0) return;
  if (options.noHooks) {
    console.log("Qoder hooks: skipped (--no-hooks)");
    return;
  }
  const pending = roots.filter((settingsPath) => !hasQoderHooks(settingsPath));
  if (pending.length === 0) {
    console.log("Qoder hooks: already installed");
    return;
  }
  const tty = Boolean(process.stdin.isTTY);
  let install = false;
  if (options.yes) install = true;
  else if (tty) install = await askYesNo("Install Qoder hooks?", true, tty);
  else {
    console.log("Qoder hooks: skipped (not a TTY; pass --yes or run `pocketpet init`)");
    return;
  }
  if (!install) {
    console.log("Qoder hooks: skipped");
    return;
  }
  const command = qoderHookCommand();
  for (const settingsPath of pending) {
    const root = dirname(settingsPath);
    try {
      const result = installQoderHooks(settingsPath, command);
      console.log(`Qoder hooks added (${root}): ${result.added.join(", ") || "none"}`);
    } catch {
      console.error(`Qoder hooks (${root}): could not update settings; continuing without Qoder hooks.`);
    }
  }
}

async function bridgeHealthy(port: number): Promise<boolean> {
  if (port <= 0) return false;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * The `.local` name the *bridge process* is currently advertising, read from
 * its loopback-only health response. A service-mode `up` runs in a different
 * process, so its own host adapter never has the live advertisement. The
 * response carries no token; anything malformed or unreachable is null and the
 * IP/USB pairing stays usable.
 */
export async function liveLocalHostname(port: number): Promise<string | null> {
  if (port <= 0) return null;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!isRecord(body)) return null;
    const value = body.localHostname;
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

async function waitForHealth(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await bridgeHealthy(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return bridgeHealthy(port);
}

type UpOptions = { yes: boolean; noHooks: boolean; noService: boolean; noOpen: boolean; qrHost: QrHost };

const UP_USAGE = "usage: pocketpet up [--yes] [--no-hooks] [--no-service] [--no-open] [--qr-host ip|local]";
const SERVICE_USAGE = "usage: pocketpet service install|uninstall|status";

function parseQrHost(value: string): QrHost | null {
  return value === "ip" || value === "local" ? value : null;
}

function parseUpOptions(args: string[]): UpOptions | null {
  const options: UpOptions = { yes: false, noHooks: false, noService: false, noOpen: false, qrHost: "ip" };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--yes") options.yes = true;
    else if (arg === "--no-hooks") options.noHooks = true;
    else if (arg === "--no-service") options.noService = true;
    else if (arg === "--no-open") options.noOpen = true;
    else if (arg === "--qr-host") {
      const value = args[index + 1];
      const qrHost = value === undefined ? null : parseQrHost(value);
      if (!qrHost) return null;
      options.qrHost = qrHost;
      index += 1;
    } else if (arg.startsWith("--qr-host=")) {
      const qrHost = parseQrHost(arg.slice("--qr-host=".length));
      if (!qrHost) return null;
      options.qrHost = qrHost;
    } else return null;
  }
  return options;
}

export type PairingOutput = {
  port: number;
  token: string;
  qrHost: QrHost;
  open: boolean;
  keepRunning: boolean;
  /** Test hook: overrides the detected LAN interfaces. */
  interfaces?: InterfaceMap;
  /** Test/selection hook: overrides the active platform hostname. */
  hostname?: string | null;
};

export type SetupOpenCommand = { command: string; args: string[] };

/**
 * Platform-aware setup-page opener. macOS keeps `open`; Windows launches the
 * loopback URL through PowerShell `Start-Process`, which ShellExecutes the
 * default browser without a `cmd /c` quoting layer. The URL contains only the
 * loopback port, never the token.
 */
export function setupPageOpenCommand(port: number, platformName: NodeJS.Platform = process.platform): SetupOpenCommand {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new RangeError(`invalid bridge port: expected an integer in 1-65535, got ${String(port)}`);
  }
  const url = `http://127.0.0.1:${port}/setup`;
  if (platformName === "win32") {
    return {
      command: "powershell.exe",
      args: ["-NoProfile", "-NonInteractive", "-Command", `Start-Process -FilePath '${url}'`],
    };
  }
  return { command: "open", args: [url] };
}

function openSetupPage(port: number): void {
  try {
    const { command, args } = setupPageOpenCommand(port);
    execFileSync(command, args, { stdio: "ignore" });
  } catch {
    // Opening the browser is best effort.
  }
}

/** Pairing URLs, a full-size terminal QR, the fallback, and the three phone steps. */
export function printPairing(options: PairingOutput): void {
  const lang = pickLanguage(process.env.POCKETPET_LANG ?? process.env.LANG ?? null);
  const copy = pairingCopy[lang];
  const links = pairingLinks(options.port, options.token, {
    hostname: options.hostname !== undefined ? options.hostname : platform.host.localHostname(),
    qrHost: options.qrHost,
    interfaces: options.interfaces,
  });
  if (links.ipUrls.length === 0) console.log(copy.noLanUrl);
  for (const url of links.ipUrls) console.log(url);
  if (links.localUrl) console.log(links.localUrl);
  if (links.qrUrl) {
    qrcode.generate(links.qrUrl, { small: false });
  } else {
    console.log(copy.usbFallbackHeading);
    console.log(`  adb reverse tcp:${options.port} tcp:${options.port}`);
    console.log(`  ${copy.usbThenOpen.replace("{usbUrl}", links.usbUrl)}`);
  }
  console.log(copy.stepsHeading);
  console.log(`  1. ${copy.stepWifi}`);
  if (links.qrUrl) console.log(`  2. ${copy.stepScan}`);
  else console.log(`  2. ${copy.stepOpenUrl}`);
  console.log(`  3. ${copy.stepHomeScreen}`);
  console.log(options.keepRunning ? copy.keepRunning : links.qrUrl ? copy.scanCta : copy.usbCta);
  if (options.open) openSetupPage(options.port);
}

function webDistPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "web");
}

function waitForInterrupt(bridge: Bridge): Promise<void> {
  return new Promise<void>((resolveStop) => {
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      // close() also stops the mDNS responder, so no signal leaves `.local` served.
      bridge.close().then(() => resolveStop(), () => resolveStop());
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

async function runInit(): Promise<number> {
  const home = pocketpetHome();
  try {
    ensureConfig(home);
  } catch {
    // Never print the error: it may quote the malformed config, including the token.
    console.error(`config unreadable: ${configPath(home)}`);
    console.error("Fix or delete the file, then run `pocketpet init` again.");
    return 1;
  }
  const result = installClaudeHooks(claudeSettingsPath(), claudeHookCommand(fileURLToPath(import.meta.url), process.execPath));
  console.log(`Config: ${configPath(home)}`);
  console.log(`Claude hooks added: ${result.added.join(", ") || "none"}`);
  console.log(`Claude hooks already present: ${result.already.join(", ") || "none"}`);
  installQoderHooksForInit();
  console.log("Next: pocketpet run");
  return 0;
}

export type UpDeps = {
  /** Test/selection hook: platform bundle to use for service and host state. */
  platform?: Platform;
  /** Test/selection hook: platform name that gates the Windows UAC fallback. */
  platformName?: NodeJS.Platform;
  /** Test hook: start the foreground bridge without binding a real port. */
  startForeground?: (options: BridgeOptions) => Promise<Bridge>;
  /** Test hook: stop waiting for Ctrl+C immediately. */
  waitForInterrupt?: (bridge: Bridge) => Promise<void>;
};

export async function runUp(args: string[], deps: UpDeps = {}): Promise<number> {
  const options = parseUpOptions(args);
  if (!options) {
    console.error(UP_USAGE);
    return 2;
  }
  const target = deps.platform ?? platform;
  const platformName = deps.platformName ?? process.platform;
  const home = pocketpetHome();
  let config: Config;
  try {
    config = ensureConfig(home);
  } catch {
    // Never print the error: it may quote the malformed config, including the token.
    console.error(`config unreadable: ${configPath(home)}`);
    console.error("Fix or delete the file, then run `pocketpet init` again.");
    return 1;
  }
  console.log(`Config: ${configPath(home)}`);

  await setupClaudeHooks({ yes: options.yes, noHooks: options.noHooks });
  await setupQoderHooks({ yes: options.yes, noHooks: options.noHooks });
  const tty = Boolean(process.stdin.isTTY);

  if (await bridgeHealthy(config.port)) {
    console.log(`Bridge already running on port ${config.port}.`);
    printPairing({
      port: config.port,
      token: config.token,
      qrHost: options.qrHost,
      open: !options.noOpen,
      keepRunning: true,
      hostname: (await liveLocalHostname(config.port)) ?? target.host.localHostname(),
    });
    return 0;
  }

  const serviceConfig: ServiceConfig = { home, nodePath: process.execPath, cliPath: fileURLToPath(import.meta.url), port: config.port };
  let installed = false;
  if (!options.noService) {
    try {
      installed = (await target.service.status(serviceConfig)).running;
    } catch {
      installed = false;
    }
  }

  let serviceMode = installed;
  if (!installed && !options.noService) {
    if (options.yes) serviceMode = true;
    else if (tty) serviceMode = await askYesNo("Start bridge at login?", false, tty);
  }

  let fellBack = false;
  if (serviceMode) {
    let ready = installed;
    if (!installed) {
      try {
        await target.service.install(serviceConfig);
        ready = true;
      } catch {
        console.error("Could not install the bridge service.");
        if (platformName !== "win32") {
          console.error("Build the CLI and run `pocketpet service install` for details.");
          return 1;
        }
        // One UAC was already spent. Report the actionable command and keep the
        // bridge usable in the foreground; never claim the service is running.
        console.error("Continuing in the foreground; run `pocketpet service install` from an elevated shell later.");
        console.error(`  ${elevatedServiceCommand(serviceConfig, "install")}`);
        fellBack = true;
      }
    }
    if (ready) {
      if (!(await waitForHealth(config.port, SERVICE_HEALTH_TIMEOUT_MS))) {
        console.error(`Bridge is not responding on port ${config.port}.`);
        console.error("Run `pocketpet service install` to reload it, or `pocketpet run` in the foreground to see the error.");
        return 1;
      }
      console.log(`Bridge service is running (${target.service.label}).`);
      printPairing({
        port: config.port,
        token: config.token,
        qrHost: options.qrHost,
        open: !options.noOpen,
        keepRunning: true,
        // The service process owns the Windows mDNS responder; its health is the
        // only live source. The adapter fallback keeps macOS behavior unchanged.
        hostname: (await liveLocalHostname(config.port)) ?? target.host.localHostname(),
      });
      return 0;
    }
  }

  if (fellBack) console.log("Starting the bridge in the foreground.");
  const startForeground = deps.startForeground ?? startBridge;
  const bridge = await startForeground({ home, config, webDist: webDistPath(), host: target.host });
  printPairing({
    port: bridge.port,
    token: config.token,
    qrHost: options.qrHost,
    open: !options.noOpen,
    keepRunning: false,
    hostname: target.host.localHostname(),
  });
  await (deps.waitForInterrupt ?? waitForInterrupt)(bridge);
  return 0;
}

/** PowerShell single-quoted literal for an exact, token-free elevated command. */
function quoteServiceArg(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Exact command a user can paste into an elevated PowerShell. Carries no token. */
export function elevatedServiceCommand(serviceConfig: ServiceConfig, action: "install" | "uninstall"): string {
  return `& ${quoteServiceArg(serviceConfig.nodePath)} ${quoteServiceArg(serviceConfig.cliPath)} service ${action}`;
}

/**
 * Fixed, token-free service error. Windows advice names the one elevated command
 * to retry; other platforms keep the build/troubleshooting hint.
 */
function serviceFailureMessage(
  action: "install" | "uninstall",
  error: unknown,
  label: string,
  options: { windows?: boolean; command?: string } = {},
): string {
  const message = error instanceof Error ? error.message : "";
  if (/cancel/i.test(message)) {
    return `Could not ${action} the bridge service (${label}). The elevation prompt was canceled.`;
  }
  const refusal = message.includes("build and run the compiled CLI") ? ` ${message}` : "";
  if (options.windows) {
    const command = options.command ? ` Run this exact command in an elevated PowerShell: ${options.command}` : "";
    return `Could not ${action} the bridge service (${label}). Windows needs one elevated ${action}.${command}${refusal}`;
  }
  return `Could not ${action} the bridge service (${label}). Build the CLI with \`npm run build\` and retry \`pocketpet service ${action}\`.${refusal}`;
}

export type ServiceDeps = {
  platform?: Platform;
  /** Test/selection hook: platform name that selects the Windows elevation advice. */
  platformName?: NodeJS.Platform;
};

export async function runService(action: string | undefined, deps: ServiceDeps = {}): Promise<number> {
  if (action !== "install" && action !== "uninstall" && action !== "status") {
    console.error(SERVICE_USAGE);
    return 2;
  }
  const target = deps.platform ?? platform;
  const platformName = deps.platformName ?? process.platform;
  const home = pocketpetHome();
  let config: Config;
  try {
    config = ensureConfig(home);
  } catch {
    console.error(`config unreadable: ${configPath(home)}`);
    return 1;
  }
  const serviceConfig: ServiceConfig = { home, nodePath: process.execPath, cliPath: fileURLToPath(import.meta.url), port: config.port };
  if (action === "install") {
    try {
      await target.service.install(serviceConfig);
    } catch (error) {
      // The refusal message names the CLI path, never the token.
      console.error(
        serviceFailureMessage("install", error, target.service.label, {
          windows: platformName === "win32",
          command: elevatedServiceCommand(serviceConfig, "install"),
        }),
      );
      return 1;
    }
    console.log(`Installed ${target.service.label}. The bridge starts at login and keeps running.`);
    return 0;
  }
  if (action === "uninstall") {
    try {
      await target.service.uninstall(serviceConfig);
    } catch (error) {
      console.error(
        serviceFailureMessage("uninstall", error, target.service.label, {
          windows: platformName === "win32",
          command: elevatedServiceCommand(serviceConfig, "uninstall"),
        }),
      );
      return 1;
    }
    console.log(`Removed ${target.service.label}.`);
    return 0;
  }
  const running = (await target.service.status(serviceConfig)).running;
  console.log(running ? `Bridge service is running (${target.service.label}).` : `Bridge service is not running (${target.service.label}).`);
  return running ? 0 : 1;
}

async function runServer(args: string[] = []): Promise<number> {
  const serviceMode = args.includes("--service");
  const home = pocketpetHome();
  const target = configPath(home);
  const created = !existsSync(target);
  let config: Config;
  try {
    // Startup hardening: protect an existing config before reading it; the hook
    // path uses the pure loadConfig instead.
    config = created ? ensureConfig(home) : hardenConfig(home);
  } catch {
    // Never print the error: it may quote the malformed config, including the token.
    console.error(`config unreadable: ${target}`);
    console.error("Fix or delete the file, then run `pocketpet init` again.");
    return 1;
  }
  if (created && !serviceMode) {
    console.log(`Created config: ${target}`);
    console.log("Claude Code hooks are not installed yet; run `pocketpet init` to add them.");
  }
  const bridge = await startBridge({ home, config, webDist: webDistPath(), host: platform.host });
  if (serviceMode) {
    // The launchd job redirects stdout to a log; never write URLs or the token there.
    console.log(`PocketPet bridge listening on port ${bridge.port}`);
  } else {
    printPairing({ port: bridge.port, token: config.token, qrHost: "ip", open: false, keepRunning: false });
  }
  await waitForInterrupt(bridge);
  return 0;
}

async function runDoctor(): Promise<number> {
  const checks = await doctorChecks({ home: pocketpetHome() });
  for (const check of checks) console.log(`${check.status} ${check.name}: ${check.detail}`);
  return checks.some((check) => check.status === "FAIL") ? 1 : 0;
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const [command, ...args] = argv;
  const arg = args[0];
  try {
    if (command === "init") return await runInit();
    if (command === "up") return await runUp(args);
    if (command === "run" || command === undefined) return await runServer(args);
    if (command === "service") return await runService(arg);
    if (command === "doctor") return await runDoctor();
    if (command === "hook") {
      await runHook(arg ?? "");
      return 0;
    }
  } catch {
    // Never print the thrown error: config parse messages or paths may carry secrets.
    if (command === "hook") return 0;
    console.error(`pocketpet: ${command ?? "run"} failed`);
    return 1;
  }
  console.error("usage: pocketpet init | up | run | service <install|uninstall|status> | doctor | hook claude|qoder");
  return 2;
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
