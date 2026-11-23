import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CLAUDE_HOOK_EVENTS,
  HOOK_COMMAND,
  claudeHookCommand,
  installClaudeHooks,
  isClaudeHookCommand,
} from "../src/adapters/claudeInstall.js";
import { QODER_HOOK_EVENTS } from "../src/adapters/qoderInstall.js";
import { hasPocketPetHooks, qoderHookCommand, setupPageOpenCommand } from "../src/cli.js";
import { doctorChecks, windowsAclCheck } from "../src/doctor.js";
import type { CommandRunner } from "../src/platform/types.js";
import { FIREWALL_MDNS, FIREWALL_TCP, auditFirewallRules } from "../src/platform/windows/firewall.js";
import { windowsHookCommand } from "../src/platform/windows/hooks.js";

let home = "";
afterEach(() => {
  if (home) rmSync(home, { recursive: true, force: true });
  home = "";
});

const NODE_PATH = "C:\\Program Files\\nodejs\\node.exe";
const CLI_PATH = "C:\\Program Files\\PocketPet\\dist\\cli.js";
const WINDOWS_CLAUDE = `"${NODE_PATH}" "${CLI_PATH}" hook claude`;
const WINDOWS_QODER = `"${NODE_PATH}" "${CLI_PATH}" hook qoder`;

describe("windowsHookCommand", () => {
  it("quotes spaced Windows paths for Claude and Qoder", () => {
    expect(windowsHookCommand(NODE_PATH, CLI_PATH, "claude")).toBe(WINDOWS_CLAUDE);
    expect(windowsHookCommand(NODE_PATH, CLI_PATH, "qoder")).toBe(WINDOWS_QODER);
  });

  it("rejects a path containing an unsupported quote", () => {
    expect(() => windowsHookCommand('C:\\bad"path\\node.exe', CLI_PATH, "claude")).toThrow(/unsupported quote/);
    expect(() => windowsHookCommand(NODE_PATH, 'C:\\bad"path\\cli.js', "qoder")).toThrow(/unsupported quote/);
  });
});

describe("Windows hook command selection", () => {
  it("keeps the macOS Claude command unchanged", () => {
    expect(claudeHookCommand("/app/dist/cli.js", "/usr/local/bin/node", "darwin")).toBe(HOOK_COMMAND);
    expect(claudeHookCommand("/app/dist/cli.js", "/usr/local/bin/node", "linux")).toBe(HOOK_COMMAND);
  });

  it("uses the quoted absolute command for Claude on Windows", () => {
    expect(claudeHookCommand(CLI_PATH, NODE_PATH, "win32")).toBe(WINDOWS_CLAUDE);
  });

  it("falls back to the linked command for a TypeScript entry point on Windows", () => {
    expect(claudeHookCommand("C:\\repo\\src\\cli.ts", NODE_PATH, "win32")).toBe(HOOK_COMMAND);
  });

  it("uses the quoted absolute command for Qoder on Windows and keeps macOS output unchanged", () => {
    expect(qoderHookCommand(CLI_PATH, NODE_PATH, "win32")).toBe(WINDOWS_QODER);
    expect(qoderHookCommand("/app/dist/cli.js", "/usr/local/bin/node", "darwin")).toBe(
      "'/usr/local/bin/node' '/app/dist/cli.js' hook qoder",
    );
  });

  it("recognises a Windows Claude command installed for every event", () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-winhooks-"));
    const settingsPath = join(home, "settings.json");
    const hooks = Object.fromEntries(
      CLAUDE_HOOK_EVENTS.map((event) => [event, [{ hooks: [{ type: "command", command: WINDOWS_CLAUDE }] }]]),
    );
    writeFileSync(settingsPath, JSON.stringify({ hooks }));
    expect(hasPocketPetHooks(settingsPath)).toBe(true);
  });

  it("installs the Windows Claude command when one is supplied", () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-winhooks-"));
    const settingsPath = join(home, "settings.json");
    expect(installClaudeHooks(settingsPath, WINDOWS_CLAUDE).added).toEqual([...CLAUDE_HOOK_EVENTS]);
    expect(hasPocketPetHooks(settingsPath)).toBe(true);
  });
});

describe("Windows Claude hook acceptance", () => {
  it("accepts the quoted absolute command and rejects the bare command on Windows", () => {
    expect(isClaudeHookCommand(WINDOWS_CLAUDE, "win32")).toBe(true);
    expect(isClaudeHookCommand(HOOK_COMMAND, "win32")).toBe(false);
    expect(isClaudeHookCommand('"C:\\node.exe" "C:\\cli.js" hook claude ', "win32")).toBe(false);
    expect(isClaudeHookCommand('"node.exe" "C:\\cli.js" hook claude', "win32")).toBe(false);
    expect(isClaudeHookCommand('"C:\\node.exe" "cli.js" hook claude', "win32")).toBe(false);
    expect(isClaudeHookCommand('"C:\\node.exe" "C:\\cli.js" hook qoder', "win32")).toBe(false);
    expect(isClaudeHookCommand(undefined, "win32")).toBe(false);
  });

  it("keeps accepting the bare and quoted commands on macOS", () => {
    expect(isClaudeHookCommand(HOOK_COMMAND, "darwin")).toBe(true);
    expect(isClaudeHookCommand(WINDOWS_CLAUDE, "darwin")).toBe(true);
  });

  it("does not treat a bare hook file as wired on Windows", () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-winhooks-"));
    const settingsPath = join(home, "settings.json");
    const hooks = Object.fromEntries(
      CLAUDE_HOOK_EVENTS.map((event) => [event, [{ hooks: [{ type: "command", command: HOOK_COMMAND }] }]]),
    );
    writeFileSync(settingsPath, JSON.stringify({ hooks }));
    expect(hasPocketPetHooks(settingsPath, "win32")).toBe(false);
    expect(hasPocketPetHooks(settingsPath, "darwin")).toBe(true);
  });

  it("upgrades stale bare hooks in place instead of adding duplicates", () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-winhooks-"));
    const settingsPath = join(home, "settings.json");
    const foreign = { type: "command", command: "echo keep me" };
    const hooks = Object.fromEntries(
      CLAUDE_HOOK_EVENTS.map((event) => [event, [{ hooks: [{ type: "command", command: HOOK_COMMAND }, foreign] }]]),
    );
    writeFileSync(settingsPath, JSON.stringify({ hooks, other: { untouched: true } }));

    const result = installClaudeHooks(settingsPath, WINDOWS_CLAUDE, "win32");
    expect(result.added).toEqual([]);
    expect(result.replaced).toEqual([...CLAUDE_HOOK_EVENTS]);
    expect(hasPocketPetHooks(settingsPath, "win32")).toBe(true);

    const updated = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      hooks: Record<string, Array<{ hooks: Array<{ command?: string }> }>>;
      other: { untouched: boolean };
    };
    for (const event of CLAUDE_HOOK_EVENTS) {
      expect(updated.hooks[event]).toHaveLength(1);
      expect(updated.hooks[event][0].hooks).toHaveLength(2);
      expect(updated.hooks[event][0].hooks[0].command).toBe(WINDOWS_CLAUDE);
      expect(updated.hooks[event][0].hooks[1].command).toBe("echo keep me");
    }
    expect(updated.other).toEqual({ untouched: true });

    const again = installClaudeHooks(settingsPath, WINDOWS_CLAUDE, "win32");
    expect(again).toEqual({ added: [], already: [...CLAUDE_HOOK_EVENTS], replaced: [] });
  });

  it("does not rewrite stale hooks on macOS", () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-winhooks-"));
    const settingsPath = join(home, "settings.json");
    const hooks = Object.fromEntries(
      CLAUDE_HOOK_EVENTS.map((event) => [event, [{ hooks: [{ type: "command", command: WINDOWS_CLAUDE }] }]]),
    );
    writeFileSync(settingsPath, JSON.stringify({ hooks }));
    const result = installClaudeHooks(settingsPath, HOOK_COMMAND, "darwin");
    expect(result.added).toEqual([...CLAUDE_HOOK_EVENTS]);
    expect(result.replaced).toEqual([]);
  });
});

describe("setupPageOpenCommand", () => {
  it("opens the setup page with `open` on macOS", () => {
    expect(setupPageOpenCommand(7788, "darwin")).toEqual({
      command: "open",
      args: ["http://127.0.0.1:7788/setup"],
    });
  });

  it("uses a token-free PowerShell Start-Process on Windows", () => {
    const opened = setupPageOpenCommand(7788, "win32");
    expect(opened.command).toBe("powershell.exe");
    expect(opened.args).toContain("-NoProfile");
    const script = opened.args.at(-1) ?? "";
    expect(script).toContain("Start-Process");
    expect(script).toContain("'http://127.0.0.1:7788/setup'");
    expect(script).not.toContain("token");
  });

  it("rejects an out-of-range port instead of launching a shell with it", () => {
    expect(() => setupPageOpenCommand(0, "win32")).toThrow(/invalid bridge port/);
  });
});

function aclRunner(status: number): CommandRunner {
  let call = 0;
  return (_command, _args) => {
    call += 1;
    if (call === 1) return { status: 0, stdout: "S-1-5-21-1-2-3\n", stderr: "" };
    return { status, stdout: "", stderr: "" };
  };
}

describe("windowsAclCheck", () => {
  it("passes when the home and config verify as current-user-only with FullControl", () => {
    expect(windowsAclCheck("C:\\Users\\happy\\.pocketpet", aclRunner(0))).toMatchObject({ ok: true });
  });

  it("fails closed with an operation reason and never prints the path contents", () => {
    const inherited = windowsAclCheck("C:\\Users\\happy\\.pocketpet", aclRunner(4));
    expect(inherited.ok).toBe(false);
    expect(inherited.detail).toContain("inherited");
    const otherUser = windowsAclCheck("C:\\Users\\happy\\.pocketpet", aclRunner(5));
    expect(otherUser.ok).toBe(false);
    expect(otherUser.detail).toContain("another user");
    const exit = windowsAclCheck("C:\\Users\\happy\\.pocketpet", aclRunner(12));
    expect(exit.detail).toContain("exit 12");
  });

  it("distinguishes the three exit-3-and-friends causes", () => {
    const missing = windowsAclCheck("C:\\Users\\happy\\.pocketpet", aclRunner(3));
    expect(missing.detail).toContain("missing");
    const noEntries = windowsAclCheck("C:\\Users\\happy\\.pocketpet", aclRunner(8));
    expect(noEntries.detail).toContain("no ACL entry");
    const multiple = windowsAclCheck("C:\\Users\\happy\\.pocketpet", aclRunner(9));
    expect(multiple.detail).toContain("more than one");
    const noRights = windowsAclCheck("C:\\Users\\happy\\.pocketpet", aclRunner(7));
    expect(noRights.detail).toContain("FullControl");
  });
});

function firewallRunner(contentStatus: number, nameStatus = 0): CommandRunner {
  return (command, args) => {
    if (command === "powershell.exe") return { status: contentStatus, stdout: "", stderr: "" };
    const named = args.some((arg) => arg === `name=${FIREWALL_TCP}` || arg === `name=${FIREWALL_MDNS}`);
    return { status: named ? nameStatus : 1, stdout: "", stderr: "" };
  };
}

describe("auditFirewallRules", () => {
  const PROGRAM = "C:\\Program Files\\nodejs\\node.exe";

  it("reports verified evidence only from the locale-independent content query", () => {
    const audit = auditFirewallRules(7788, PROGRAM, firewallRunner(0));
    expect(audit.level).toBe("verified");
    expect(audit.detail).toContain("7788");
    expect(audit.detail).toContain("Private");
  });

  it("reports a content mismatch as WARN-level evidence", () => {
    const audit = auditFirewallRules(7788, PROGRAM, firewallRunner(5));
    expect(audit.level).toBe("mismatch");
    expect(audit.detail).toContain("disabled");
  });

  it("never reports verified from names alone", () => {
    const audit = auditFirewallRules(7788, PROGRAM, firewallRunner(1, 0));
    expect(audit.level).toBe("names-only");
    expect(audit.detail).toContain("not verified");
  });

  it("reports missing when neither the content query nor the names check finds a rule", () => {
    const audit = auditFirewallRules(7788, PROGRAM, firewallRunner(1, 1));
    expect(audit.level).toBe("missing");
    expect(audit.detail).toContain("missing");
  });
});

describe("doctor Windows checks", () => {
  const settingsPath = () => join(home, "settings.json");
  const qoderPath = () => join(home, ".qoder", "settings.json");
  const petDirs = () => [join(home, "pets")];

  it("adds ACL, service, firewall, and mDNS checks only on Windows", async () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-doctor-win-"));
    mkdirSync(join(home, ".qoder"), { recursive: true });
    const hooks = Object.fromEntries(
      QODER_HOOK_EVENTS.map((event) => [event, [{ hooks: [{ type: "command", command: WINDOWS_QODER }] }]]),
    );
    writeFileSync(qoderPath(), JSON.stringify({ hooks }));

    const checks = await doctorChecks({
      home,
      settingsPath: settingsPath(),
      qoderSettingsPaths: [qoderPath()],
      localPetDirs: petDirs(),
      probePort: async () => false,
      platformName: "win32",
      windows: {
        service: async () => ({ installed: true, running: true }),
        firewall: () => ({ level: "verified", detail: "Private-profile inbound TCP 7788 and mDNS (UDP 5353) allow rules are verified for the bridge program" }),
        acl: () => ({ ok: true, detail: "current user only" }),
        localHostname: async () => "happy-pc.local",
      },
    });

    expect(checks.find((check) => check.name === "config ACL")).toMatchObject({ status: "PASS", detail: "current user only" });
    expect(checks.find((check) => check.name === "service")?.status).toBe("PASS");
    expect(checks.find((check) => check.name === "firewall")?.status).toBe("PASS");
    expect(checks.find((check) => check.name === "mdns")).toMatchObject({ status: "PASS" });
    expect(checks.find((check) => check.name === "mdns")?.detail).toContain("happy-pc.local");

    const qoder = checks.find((check) => check.name === "qoder hooks");
    expect(qoder?.status).toBe("PASS");
    expect(qoder?.detail).toContain("wired");
    expect(qoder?.detail).toContain("real-app gate NOT RUN");
    expect(qoder?.detail).not.toContain("observed");
  });

  it("warns when the task is stopped, rules are missing, or no live .local exists", async () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-doctor-win-"));
    const checks = await doctorChecks({
      home,
      settingsPath: settingsPath(),
      qoderSettingsPaths: [qoderPath()],
      localPetDirs: petDirs(),
      probePort: async () => false,
      platformName: "win32",
      windows: {
        service: async () => ({ installed: true, running: false }),
        firewall: () => ({ level: "missing", detail: "PocketPet firewall rules are missing" }),
        acl: () => ({ ok: false, detail: "not current-user-only: inherited permissions are still enabled" }),
        localHostname: async () => null,
      },
    });

    expect(checks.find((check) => check.name === "service")?.status).toBe("WARN");
    expect(checks.find((check) => check.name === "firewall")?.status).toBe("WARN");
    expect(checks.find((check) => check.name === "config ACL")?.status).toBe("FAIL");
    expect(checks.find((check) => check.name === "mdns")?.status).toBe("WARN");
    expect(checks.find((check) => check.name === "mdns")?.detail).toContain("IP/USB");
  });

  it("warns with explicit not-verified detail when only rule names exist", async () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-doctor-win-"));
    const checks = await doctorChecks({
      home,
      settingsPath: settingsPath(),
      qoderSettingsPaths: [qoderPath()],
      localPetDirs: petDirs(),
      probePort: async () => false,
      platformName: "win32",
      windows: {
        service: async () => ({ installed: true, running: true }),
        firewall: () => ({ level: "names-only", detail: "PocketPet firewall rule names exist; profile/port/content not verified" }),
        acl: () => ({ ok: true, detail: "current user only" }),
        localHostname: async () => "happy-pc.local",
      },
    });

    const firewall = checks.find((check) => check.name === "firewall");
    expect(firewall?.status).toBe("WARN");
    expect(firewall?.detail).toContain("names exist");
    expect(firewall?.detail).toContain("not verified");
    // No PASS claim from a name-only probe.
    expect(checks.filter((check) => check.name === "firewall" && check.status === "PASS")).toHaveLength(0);
  });

  it("adds no Windows checks on macOS or Linux", async () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-doctor-posix-"));
    for (const platformName of ["darwin", "linux"] as const) {
      const checks = await doctorChecks({
        home,
        settingsPath: settingsPath(),
        qoderSettingsPaths: [qoderPath()],
        localPetDirs: petDirs(),
        probePort: async () => false,
        platformName,
      });
      const names = checks.map((check) => check.name);
      expect(names).not.toContain("config ACL");
      expect(names).not.toContain("service");
      expect(names).not.toContain("firewall");
      expect(names).not.toContain("mdns");
    }
  });
});
