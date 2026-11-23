import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { connect } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { configPath, loadConfig } from "./config.js";
import { CLAUDE_HOOK_EVENTS, isClaudeHookCommand } from "./adapters/claudeInstall.js";
import { qoderHookEventStatus, qoderSettingsPaths } from "./adapters/qoderInstall.js";
import { scanLocalPets } from "./pets.js";
import type { CommandRunner, ServiceState } from "./platform/types.js";
import { auditFirewallRules, type FirewallAudit } from "./platform/windows/firewall.js";
import { currentUserSid } from "./platform/windows/security.js";
import { windowsService } from "./platform/windows/service.js";

export type Check = { name: string; status: "PASS" | "WARN" | "FAIL"; detail: string };

/**
 * Injectable Windows probes. Unit tests run on macOS with fakes; production
 * defaults only touch PowerShell/netsh/HTTP when `platformName` is win32.
 */
export type WindowsDoctorProbes = {
  service?: () => Promise<ServiceState> | ServiceState;
  firewall?: () => FirewallAudit;
  acl?: () => { ok: boolean; detail: string };
  localHostname?: () => Promise<string | null> | string | null;
};

type Options = {
  home: string;
  settingsPath?: string;
  qoderSettingsPaths?: string[];
  localPetDirs?: string[];
  probePort?: (port: number) => Promise<boolean>;
  /** Test/selection hook: defaults to `process.platform`. */
  platformName?: NodeJS.Platform;
  /** The running CLI entry point, used for the Windows service status config. */
  cliPath?: string;
  /** Test hook: replaces the real Windows probes. */
  windows?: WindowsDoctorProbes;
};

function probe(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.setTimeout(300);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(false));
  });
}

function claudeHookCheck(settingsPath: string, platformName: NodeJS.Platform): Check {
  if (!existsSync(settingsPath)) return { name: "claude hooks", status: "FAIL", detail: `settings not found: ${settingsPath}` };
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as { hooks?: Record<string, Array<{ hooks?: Array<{ command?: string }> }>> };
    const missing = CLAUDE_HOOK_EVENTS.filter((event) => !(settings.hooks?.[event] ?? []).some((entry) => (entry.hooks ?? []).some((hook) => isClaudeHookCommand(hook.command, platformName))));
    return missing.length === 0 ? { name: "claude hooks", status: "PASS", detail: "all events wired" } : { name: "claude hooks", status: "FAIL", detail: `missing: ${missing.join(", ")}` };
  } catch {
    return { name: "claude hooks", status: "FAIL", detail: "invalid settings JSON" };
  }
}

/** Wiring is all doctor can prove; the real Qoder app has never been observed. */
const QODER_GATE = "real-app gate NOT RUN";

/**
 * Qoder is optional: an absent root is a WARN, an existing root missing any
 * required event is a FAIL. The check only reads settings files, and its detail
 * never claims the hook was executed.
 */
function qoderHookCheck(settingsPaths: string[]): Check {
  const roots = settingsPaths.filter((settingsPath) => existsSync(dirname(settingsPath)));
  if (roots.length === 0) return { name: "qoder hooks", status: "WARN", detail: `Qoder not detected; ${QODER_GATE}` };
  const rootNames = roots.map((settingsPath) => dirname(settingsPath));
  const problems: string[] = [];
  for (const settingsPath of roots) {
    const status = qoderHookEventStatus(settingsPath);
    if (status === null) {
      problems.push(`${dirname(settingsPath)}: invalid settings JSON`);
      continue;
    }
    if (status.missing.length > 0) problems.push(`${dirname(settingsPath)}: missing ${status.missing.join(", ")}`);
  }
  return problems.length === 0
    ? { name: "qoder hooks", status: "PASS", detail: `wired (${rootNames.join(", ")}); ${QODER_GATE}` }
    : { name: "qoder hooks", status: "FAIL", detail: `${problems.join("; ")}; ${QODER_GATE}` };
}

// Never surface a raw JSON.parse message here: newer Node versions quote file
// content in it, which would leak config.token into doctor output.
function describeConfigError(error: unknown): string {
  if (error instanceof SyntaxError) return "invalid config JSON";
  return error instanceof Error ? error.message : "invalid";
}

const POWERSHELL = "powershell.exe";
const HTTP_TIMEOUT_MS = 800;

const defaultRunner: CommandRunner = (command, args) => {
  try {
    const stdout = execFileSync(command, args, { encoding: "utf8", stdio: "pipe", windowsHide: true });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const failed = error as { status?: number | null; stdout?: string | Buffer; stderr?: string | Buffer };
    return {
      status: typeof failed.status === "number" ? failed.status : 1,
      stdout: failed.stdout?.toString() ?? "",
      stderr: failed.stderr?.toString() ?? "",
    };
  }
};

/** PowerShell single-quoted literal: only `'` needs doubling. */
const psLiteral = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const ACL_FAILURES: Record<number, string> = {
  3: "a protected path is missing",
  4: "inherited permissions are still enabled",
  5: "an ACL entry belongs to another user",
  6: "the current-user entry is not an allow rule",
  7: "the current-user entry does not grant FullControl",
  8: "a protected path has no ACL entry",
  9: "a protected path has more than one ACL entry",
};

function aclVerificationScript(home: string, sid: string): string {
  const paths = [home, configPath(home)];
  return [
    "$ErrorActionPreference='Stop';",
    `$sid=${psLiteral(sid)};`,
    `$paths=@(${paths.map(psLiteral).join(",")});`,
    "foreach($p in $paths){",
    "if(-not (Test-Path -LiteralPath $p)){exit 3};",
    "$acl=Get-Acl -LiteralPath $p;",
    "if($acl.Access.Count -eq 0){exit 8};",
    "if($acl.Access.Count -ne 1){exit 9};",
    "if($acl.AreAccessRulesProtected -ne $true){exit 4};",
    "if($acl.Access[0].IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -ne $sid){exit 5};",
    "if($acl.Access[0].AccessControlType -ne 'Allow'){exit 6};",
    "if(-not $acl.Access[0].FileSystemRights.HasFlag([System.Security.AccessControl.FileSystemRights]::FullControl)){exit 7};",
    "}",
  ].join("");
}

/**
 * Read-only Windows ACL verification for the home and its config. Writes
 * nothing; every failure maps to a fixed reason that carries no file content.
 */
export function windowsAclCheck(home: string, run: CommandRunner = defaultRunner): { ok: boolean; detail: string } {
  try {
    const sid = currentUserSid(run);
    const encoded = Buffer.from(aclVerificationScript(home, sid), "utf16le").toString("base64");
    const result = run(POWERSHELL, ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded]);
    if (result.status === 0) return { ok: true, detail: "home and config are current-user-only" };
    return { ok: false, detail: `not current-user-only: ${ACL_FAILURES[result.status] ?? `powershell exit ${result.status}`}` };
  } catch {
    return { ok: false, detail: "could not verify the current-user ACL" };
  }
}

function defaultServiceState(home: string, port: number, cliPath: string): Promise<ServiceState> {
  return windowsService.status({ home, nodePath: process.execPath, cliPath, port });
}

/** Live advertised `.local` from the bridge's loopback-only health response. */
async function defaultLocalHostname(port: number | null): Promise<string | null> {
  if (!port || port <= 0) return null;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return null;
    const value = (body as { localHostname?: unknown }).localHostname;
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

async function safeCall<T>(work: () => Promise<T> | T, fallback: T): Promise<T> {
  try {
    return await work();
  } catch {
    return fallback;
  }
}

function serviceCheck(state: ServiceState): Check {
  if (state.running) return { name: "service", status: "PASS", detail: "Task Scheduler task is running" };
  if (state.installed) return { name: "service", status: "WARN", detail: "task is installed but not running; run `pocketpet service install`" };
  return { name: "service", status: "WARN", detail: "task is not installed; run `pocketpet service install` (needs one UAC prompt)" };
}

function firewallCheck(audit: FirewallAudit): Check {
  switch (audit.level) {
    case "verified":
      return { name: "firewall", status: "PASS", detail: audit.detail };
    case "mismatch":
      return { name: "firewall", status: "WARN", detail: `${audit.detail}; rerun \`pocketpet service install\`` };
    case "names-only":
      return { name: "firewall", status: "WARN", detail: audit.detail };
    case "missing":
      return { name: "firewall", status: "WARN", detail: `${audit.detail}; run \`pocketpet service install\`` };
  }
}

function mdnsCheck(localHostname: string | null): Check {
  return localHostname
    ? { name: "mdns", status: "PASS", detail: `advertising ${localHostname}` }
    : { name: "mdns", status: "WARN", detail: "no live .local name; IP/USB pairing remains available" };
}

async function windowsChecks(opts: Options, config: ReturnType<typeof loadConfig> | null): Promise<Check[]> {
  const probes = opts.windows ?? {};
  const port = config?.port ?? null;
  const cliPath = opts.cliPath ?? process.argv[1] ?? process.execPath;
  const [service, firewall, acl, localHostname] = await Promise.all([
    safeCall(() => (probes.service ?? (() => defaultServiceState(opts.home, port ?? 7788, cliPath)))(), { installed: false, running: false }),
    safeCall(() => (probes.firewall ?? (() => auditFirewallRules(port, process.execPath)))(), {
      level: "names-only",
      detail: "PocketPet firewall rule content could not be read; profile/port/content not verified",
    } satisfies FirewallAudit),
    safeCall(() => (probes.acl ?? (() => windowsAclCheck(opts.home)))(), { ok: false, detail: "could not verify the current-user ACL" }),
    safeCall(() => (probes.localHostname ?? (() => defaultLocalHostname(port)))(), null),
  ]);
  return [
    { name: "config ACL", status: acl.ok ? "PASS" : "FAIL", detail: acl.detail },
    serviceCheck(service),
    firewallCheck(firewall),
    mdnsCheck(localHostname),
  ];
}

export async function doctorChecks(opts: Options): Promise<Check[]> {
  const platformName = opts.platformName ?? process.platform;
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
  checks.push(claudeHookCheck(settingsPath, platformName));
  checks.push(qoderHookCheck(opts.qoderSettingsPaths ?? qoderSettingsPaths()));

  const pets = scanLocalPets(opts.localPetDirs ?? [join(opts.home, "pets"), join(homedir(), ".codex", "pets"), join(homedir(), ".petdex", "pets")]);
  checks.push(pets.length > 0 ? { name: "pets", status: "PASS", detail: `${pets.length} local pet(s)` } : { name: "pets", status: "WARN", detail: "none found; run npx petdex install boba" });

  if (config) {
    const open = await (opts.probePort ?? probe)(config.port);
    checks.push({ name: "bridge", status: open ? "PASS" : "WARN", detail: open ? `listening on ${config.port}` : `not listening on ${config.port}; run pocketpet run` });
  } else {
    checks.push({ name: "bridge", status: "WARN", detail: "no config; run pocketpet init" });
  }

  // Windows service, firewall, ACL, and live `.local` checks are additive; the
  // macOS/Linux output above stays the best-effort baseline.
  if (platformName === "win32") checks.push(...(await windowsChecks(opts, config)));
  return checks;
}
