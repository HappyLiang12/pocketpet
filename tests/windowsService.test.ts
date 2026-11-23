import { describe, expect, it, vi } from "vitest";
import type { CommandRunner, ServiceConfig } from "../src/platform/types.js";
import {
  FIREWALL_MDNS,
  FIREWALL_TCP,
  TASK_NAME,
  firewallAddCommands,
  firewallRemoveCommands,
  firewallRulesPresent,
} from "../src/platform/windows/firewall.js";
import { serviceStatusFromQuery, windowsLauncher, windowsTaskXml } from "../src/platform/windows/builders.js";

const SID = "S-1-5-21-42";
const cfg: ServiceConfig = {
  home: "C:\\Users\\happy\\.pocketpet",
  nodePath: "C:\\Program Files\\nodejs\\node.exe",
  cliPath: "C:\\app\\dist\\cli.js",
  port: 7788,
};

const launcherPath = "C:\\Users\\happy\\.pocketpet\\bridge-service.cmd";
const logPath = "C:\\Users\\happy\\.pocketpet\\logs\\bridge.log";

describe("Windows firewall builders", () => {
  it("uses the fixed rule and task names", () => {
    expect(TASK_NAME).toBe("PocketPet Bridge");
    expect(FIREWALL_TCP).toBe("PocketPet Bridge TCP");
    expect(FIREWALL_MDNS).toBe("PocketPet Bridge mDNS");
  });

  it("creates private TCP and mDNS rules without a token", () => {
    const commands = firewallAddCommands(cfg.port, cfg.nodePath).join("\n");
    expect(commands).toContain("PocketPet Bridge TCP");
    expect(commands).toContain("PocketPet Bridge mDNS");
    expect(commands).toContain("protocol=TCP");
    expect(commands).toContain("protocol=UDP localport=5353");
    expect(commands).toContain("profile=private");
    expect(commands).not.toMatch(/token=/i);
    expect(firewallRemoveCommands()).toEqual(
      expect.arrayContaining([
        expect.stringContaining("PocketPet Bridge TCP"),
        expect.stringContaining("PocketPet Bridge mDNS"),
      ]),
    );
  });

  it("removes stale rules before adding the current inbound allow rules", () => {
    const commands = firewallAddCommands(cfg.port, cfg.nodePath);

    expect(commands).toHaveLength(4);
    expect(commands.slice(0, 2)).toEqual(firewallRemoveCommands());
    expect(commands[2]).toBe(
      `netsh advfirewall firewall add rule name="${FIREWALL_TCP}" dir=in action=allow program="${cfg.nodePath}" protocol=TCP localport=${cfg.port} profile=private`,
    );
    expect(commands[3]).toBe(
      `netsh advfirewall firewall add rule name="${FIREWALL_MDNS}" dir=in action=allow program="${cfg.nodePath}" protocol=UDP localport=5353 profile=private`,
    );
    // Private profile only: no public/domain scope, no remote-address wildcard broadening.
    expect(commands.join("\n")).not.toMatch(/profile=(public|domain|any)/i);
    expect(commands.join("\n")).not.toMatch(/token|pairing|\/setup|\?t=/i);
  });

  it("deletes exactly the two PocketPet rules", () => {
    expect(firewallRemoveCommands()).toEqual([
      `netsh advfirewall firewall delete rule name="${FIREWALL_TCP}"`,
      `netsh advfirewall firewall delete rule name="${FIREWALL_MDNS}"`,
    ]);
  });

  it("defaults the program scope to the running Node executable", () => {
    const addCommands = firewallAddCommands(cfg.port);
    expect(addCommands[2]).toContain(`program="${process.execPath}"`);
    expect(addCommands[3]).toContain(`program="${process.execPath}"`);
  });

  it("rejects a port that is not an integer in 1-65535", () => {
    for (const port of [0, -1, 65536, 7788.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => firewallAddCommands(port), String(port)).toThrow(/port/i);
    }
  });

  it("probes both rules read-only through the injected runner", () => {
    const calls: string[][] = [];
    const run: CommandRunner = (command, args) => {
      calls.push([command, ...args]);
      return { status: 0, stdout: "Ok.\n", stderr: "" };
    };

    expect(firewallRulesPresent(run)).toBe(true);
    expect(calls).toEqual([
      ["netsh", "advfirewall", "firewall", "show", "rule", `name=${FIREWALL_TCP}`],
      ["netsh", "advfirewall", "firewall", "show", "rule", `name=${FIREWALL_MDNS}`],
    ]);
    // A read-only probe never adds or deletes rules.
    expect(calls.flat().join(" ")).not.toMatch(/\b(add|delete|set)\b/i);
  });

  it("reports missing rules when either probe fails", () => {
    for (const statuses of [[1, 0], [0, 1], [1, 1]]) {
      const run = vi.fn<CommandRunner>(() => ({ status: statuses.shift() ?? 1, stdout: "", stderr: "" }));
      expect(firewallRulesPresent(run), JSON.stringify(statuses)).toBe(false);
    }
  });
});

describe("Windows launcher", () => {
  it("writes a CRLF launcher that sets the home and appends service output to bridge.log", () => {
    const launcher = windowsLauncher(cfg);
    expect(launcher.split("\r\n")).toEqual([
      "@echo off",
      `set "POCKETPET_HOME=${cfg.home}"`,
      `"${cfg.nodePath}" "${cfg.cliPath}" run --service >> "${logPath}" 2>&1`,
    ]);
    expect(launcher).not.toMatch(/token|pairing|\/setup|\?t=/i);
  });

  it("quotes paths with spaces and keeps Unicode intact", () => {
    const launcher = windowsLauncher({
      ...cfg,
      home: "C:\\Users\\口 袋\\.pocketpet",
      nodePath: "C:\\Program Files\\nodejs\\node.exe",
      cliPath: "C:\\应用 目录\\dist\\cli.js",
    });
    expect(launcher).toContain('"C:\\Program Files\\nodejs\\node.exe" "C:\\应用 目录\\dist\\cli.js" run --service');
    expect(launcher).toContain(`>> "C:\\Users\\口 袋\\.pocketpet\\logs\\bridge.log" 2>&1`);
  });
});

describe("Windows Task Scheduler XML", () => {
  it("writes a hidden logon task for the current user with least privilege and restart", () => {
    const xml = windowsTaskXml(cfg, SID);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-16"?>');
    expect(xml).toMatch(/<LogonTrigger>\s*<Enabled>true<\/Enabled>\s*<UserId>S-1-5-21-42<\/UserId>\s*<\/LogonTrigger>/);
    expect(xml).toMatch(/<Principal id="Author">\s*<UserId>S-1-5-21-42<\/UserId>\s*<LogonType>InteractiveToken<\/LogonType>\s*<RunLevel>LeastPrivilege<\/RunLevel>\s*<\/Principal>/);
    expect(xml).toContain("<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>");
    expect(xml).toContain("<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>");
    expect(xml).toContain("<StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>");
    expect(xml).toContain("<StartWhenAvailable>true</StartWhenAvailable>");
    expect(xml).toMatch(/<RestartOnFailure>\s*<Interval>PT1M<\/Interval>\s*<Count>3<\/Count>\s*<\/RestartOnFailure>/);
    expect(xml).toContain("<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>");
    expect(xml).toContain("<Hidden>true</Hidden>");
  });

  it("runs the launcher through cmd.exe with the launcher path and working directory", () => {
    const xml = windowsTaskXml(cfg, SID);

    expect(xml).toContain("<Command>cmd.exe</Command>");
    expect(xml).toContain(`<Arguments>/d /s /c &quot;${launcherPath}&quot;</Arguments>`);
    expect(xml).toContain(`<WorkingDirectory>${cfg.home}</WorkingDirectory>`);
    expect(xml).toContain("bridge-service.cmd");
    expect(xml).toContain("PocketPet Bridge");
    // InteractiveToken is a logon type, not a credential.
    expect(xml).not.toMatch(/token=|pairing|\/setup|\?t=/i);
  });

  it("XML-escapes the SID, home, and launcher path", () => {
    const xml = windowsTaskXml({ ...cfg, home: 'C:\\Users\\o\'brien & <home> "q"' }, "S-1-5-21-<42>");
    expect(xml).toContain("S-1-5-21-&lt;42&gt;");
    expect(xml).toContain("o&apos;brien &amp; &lt;home&gt; &quot;q&quot;");
    expect(xml).toContain("o&apos;brien &amp; &lt;home&gt; &quot;q&quot;\\bridge-service.cmd");
    expect(xml).not.toContain("<home>");
    expect(xml).not.toContain("o'brien");
  });
});

describe("serviceStatusFromQuery", () => {
  const runningQuery = [
    "Folder: \\",
    "HostName:                             HAPPY-PC",
    `TaskName:                             \\${TASK_NAME}`,
    "Next Run Time:                        N/A",
    "Status:                               Running",
    "Logon Mode:                           Interactive/Background",
    "Scheduled Task State:                 Enabled",
  ].join("\r\n");

  const stoppedQuery = [
    "Folder: \\",
    "HostName:                             HAPPY-PC",
    `TaskName:                             \\${TASK_NAME}`,
    "Next Run Time:                        N/A",
    "Status:                               Ready",
    "Scheduled Task State:                 Enabled",
  ].join("\r\n");

  it("reports an installed, running task", () => {
    expect(serviceStatusFromQuery(runningQuery)).toEqual({ installed: true, running: true });
  });

  it("reports an installed task that is not running", () => {
    expect(serviceStatusFromQuery(stoppedQuery)).toEqual({ installed: true, running: false });
    expect(serviceStatusFromQuery(stoppedQuery.replace("Status:                               Ready", "Status:                               Disabled"))).toEqual({
      installed: true,
      running: false,
    });
  });

  it("reports a missing task for empty or failed query output", () => {
    expect(serviceStatusFromQuery("")).toEqual({ installed: false, running: false });
    expect(serviceStatusFromQuery("ERROR: The system cannot find the file specified.\r\n")).toEqual({
      installed: false,
      running: false,
    });
    expect(serviceStatusFromQuery(`ERROR: The task "${TASK_NAME}" does not exist.`)).toEqual({
      installed: false,
      running: false,
    });
  });

  it("does not treat a disabled task state as running", () => {
    expect(serviceStatusFromQuery(stoppedQuery.replace("Scheduled Task State:                 Enabled", "Scheduled Task State:                 Disabled"))).toEqual({
      installed: true,
      running: false,
    });
  });
});
