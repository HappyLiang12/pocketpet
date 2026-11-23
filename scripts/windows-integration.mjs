#!/usr/bin/env node
/**
 * Windows-only integration smoke for the real host APIs PocketPet depends on.
 *
 * It creates a temporary home and config, proves the config ACL is
 * current-user-only, then creates, queries and deletes a uniquely named
 * scheduled task and uniquely named private-profile firewall rules. Every
 * resource is removed in `finally`; the real `PocketPet Bridge` task and the
 * real PocketPet firewall rules are never read or written.
 *
 * Run it from an elevated shell: adding firewall rules requires administrator
 * rights, and this script fails loudly instead of silently skipping work.
 * It must run after `npm run build` because it imports the compiled config
 * store.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (process.platform !== "win32") {
  console.log("SKIP non-Windows");
  process.exit(0);
}

const home = mkdtempSync(join(tmpdir(), "pocketpet-win-integration-"));
const stamp = `${process.pid}-${Date.now().toString(36)}`;
const taskName = `PocketPet Integration ${stamp}`;
const rulePrefix = `PocketPet Integration Rule ${stamp}`;
const rules = [
  { name: `${rulePrefix} TCP`, protocol: "TCP", port: 50000 + (process.pid % 10000) },
  { name: `${rulePrefix} UDP`, protocol: "UDP", port: 5353 },
];

function run(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: "pipe",
      windowsHide: true,
      timeout: 60_000,
    });
  } catch (error) {
    const status = typeof error.status === "number" ? error.status : 1;
    const stderr = typeof error.stderr === "string" ? error.stderr.trim() : "";
    const detail = stderr ? `: ${stderr.split(/\r?\n/)[0]}` : "";
    throw new Error(`${command} ${args.join(" ")} failed (exit ${status})${detail}`);
  }
}

/** Firewall changes need administrator rights; a non-elevated run fails here. */
function assertElevated() {
  const output = run("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)",
  ]).trim().toLowerCase();
  if (output !== "true") {
    throw new Error("windows integration requires an elevated shell; run it from an elevated PowerShell");
  }
}

/**
 * `icacls` must show exactly one allow entry, for the signed-in user, with no
 * inherited entries. This mirrors the product's strict current-user-only DACL
 * on the temporary config; failure names no file content.
 */
function assertCurrentUserOnlyAcl(path) {
  const expected = run("whoami", []).trim().toLowerCase();
  // `icacls` echoes the path as it was passed on the first ACE line; accept
  // either the absolute form we use or a bare basename.
  const prefixes = [path, path.split(/[\\/]/).pop() ?? path].map((value) => value.toLowerCase());
  const lines = run("icacls", [path])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes(":("));
  if (lines.length === 0) throw new Error(`icacls reported no access entries for the temporary config`);
  for (const line of lines) {
    if (line.includes("(I)")) throw new Error(`temporary config ACL still contains inherited entries: ${line}`);
    let principal = line.slice(0, line.indexOf(":(")).trim();
    for (const prefix of prefixes) {
      if (principal.toLowerCase().startsWith(`${prefix} `)) {
        principal = principal.slice(prefix.length).trim();
        break;
      }
    }
    if (principal.toLowerCase() !== expected) {
      throw new Error(`temporary config ACL grants a non-owner principal (${principal})`);
    }
  }
}

function deleteTaskAndVerify() {
  run("schtasks.exe", ["/Delete", "/TN", taskName, "/F"]);
  try {
    run("schtasks.exe", ["/Query", "/TN", taskName, "/FO", "LIST"]);
  } catch {
    return;
  }
  throw new Error(`temporary scheduled task ${taskName} still exists after delete`);
}

function deleteRuleAndVerify(name) {
  run("netsh", ["advfirewall", "firewall", "delete", "rule", `name="${name}"`]);
  // `netsh` may exit 0 with "No rules match" on some builds, so require the
  // unique name to be absent from the output before claiming removal.
  try {
    const output = run("netsh", ["advfirewall", "firewall", "show", "rule", `name="${name}"`]);
    if (!output.includes(name)) return;
  } catch {
    return;
  }
  throw new Error(`temporary firewall rule ${name} still exists after delete`);
}

let failure = null;
let taskCreated = false;
const createdRules = new Set();
const cleanupErrors = [];

try {
  assertElevated();

  const { ensureConfig } = await import("../dist/config.js").catch(() => {
    throw new Error("windows integration requires the compiled bridge: run `npm run build` first");
  });
  ensureConfig(home);
  assertCurrentUserOnlyAcl(join(home, "config.json"));

  run("schtasks.exe", ["/Create", "/TN", taskName, "/SC", "DAILY", "/ST", "23:59", "/TR", "cmd.exe /d /c exit 0", "/F"]);
  taskCreated = true;
  const query = run("schtasks.exe", ["/Query", "/TN", taskName, "/FO", "LIST"]);
  if (!query.includes(taskName)) throw new Error(`scheduled task query did not return ${taskName}`);
  deleteTaskAndVerify();
  taskCreated = false;

  for (const rule of rules) {
    run("netsh", [
      "advfirewall", "firewall", "add", "rule",
      `name="${rule.name}"`, "dir=in", "action=allow",
      `protocol=${rule.protocol}`, `localport=${rule.port}`, "profile=private",
    ]);
    createdRules.add(rule.name);
    const shown = run("netsh", ["advfirewall", "firewall", "show", "rule", `name="${rule.name}"`]);
    if (!shown.includes(rule.name) || !shown.includes(String(rule.port))) {
      throw new Error(`firewall rule ${rule.name} was not returned by netsh`);
    }
    deleteRuleAndVerify(rule.name);
    createdRules.delete(rule.name);
  }
} catch (error) {
  failure = error;
} finally {
  if (taskCreated) {
    try {
      deleteTaskAndVerify();
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error.message : String(error));
    }
  }
  for (const name of createdRules) {
    try {
      deleteRuleAndVerify(name);
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error.message : String(error));
    }
  }
  try {
    rmSync(home, { recursive: true, force: true });
  } catch (error) {
    cleanupErrors.push(`could not remove the temporary home: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failure) {
  const message = failure instanceof Error ? failure.message : String(failure);
  console.error(`FAIL windows integration: ${message}`);
  for (const error of cleanupErrors) console.error(`FAIL cleanup: ${error}`);
  process.exitCode = 1;
} else if (cleanupErrors.length > 0) {
  for (const error of cleanupErrors) console.error(`FAIL cleanup: ${error}`);
  process.exitCode = 1;
} else {
  console.log(`PASS windows integration (task, ${rules.length} firewall rules, current-user ACL)`);
}
