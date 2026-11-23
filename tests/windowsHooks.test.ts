import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CLAUDE_HOOK_EVENTS,
  HOOK_COMMAND,
  claudeHookCommand,
  installClaudeHooks,
} from "../src/adapters/claudeInstall.js";
import { QODER_HOOK_EVENTS } from "../src/adapters/qoderInstall.js";
import { hasPocketPetHooks, qoderHookCommand, setupPageOpenCommand } from "../src/cli.js";
import { doctorChecks, windowsAclCheck } from "../src/doctor.js";
import type { CommandRunner } from "../src/platform/types.js";
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
  it("passes when the home and config verify as current-user-only", () => {
    expect(windowsAclCheck("C:\\Users\\happy\\.pocketpet", aclRunner(0))).toMatchObject({ ok: true });
  });

  it("fails closed with an operation reason and never prints the path contents", () => {
    const inherited = windowsAclCheck("C:\\Users\\happy\\.pocketpet", aclRunner(4));
    expect(inherited.ok).toBe(false);
    expect(inherited.detail).toContain("inherited");
    const otherUser = windowsAclCheck("C:\\Users\\happy\\.pocketpet", aclRunner(5));
    expect(otherUser.ok).toBe(false);
    expect(otherUser.detail).toContain("another user");
    const exit = windowsAclCheck("C:\\Users\\happy\\.pocketpet", aclRunner(9));
    expect(exit.detail).toContain("exit 9");
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
        firewall: () => true,
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
        firewall: () => false,
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
