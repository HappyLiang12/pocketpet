import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommandRunner, ServiceConfig } from "../src/platform/types.js";
import {
  FIREWALL_MDNS,
  FIREWALL_TCP,
  TASK_NAME,
  firewallAddCommands,
  firewallRemoveCommands,
  firewallRulesPresent,
} from "../src/platform/windows/firewall.js";
import {
  TASK_STATE_SCRIPT,
  serviceStatusFromQuery,
  serviceStatusFromState,
  windowsLauncher,
  windowsLauncherBytes,
  windowsTaskXml,
  windowsTaskXmlBytes,
} from "../src/platform/windows/builders.js";
import {
  ELEVATION_CANCELLED,
  WindowsServiceError,
  createWindowsService,
  defaultElevatedRunner,
  elevatedWrapperScript,
  installWindowsService,
  windowsInstallScript,
  windowsUninstallScript,
  type WindowsDeps,
} from "../src/platform/windows/service.js";

const SID = "S-1-5-21-42";
const windowsCfgFixture: ServiceConfig = {
  home: "C:\\Users\\happy\\.pocketpet",
  nodePath: "C:\\Program Files\\nodejs\\node.exe",
  cliPath: "C:\\app\\dist\\cli.js",
  port: 7788,
};

const launcherPath = "C:\\Users\\happy\\.pocketpet\\bridge-service.ps1";
const logPath = "C:\\Users\\happy\\.pocketpet\\logs\\bridge.log";

describe("Windows firewall builders", () => {
  it("uses the fixed rule and task names", () => {
    expect(TASK_NAME).toBe("PocketPet Bridge");
    expect(FIREWALL_TCP).toBe("PocketPet Bridge TCP");
    expect(FIREWALL_MDNS).toBe("PocketPet Bridge mDNS");
  });

  it("creates private TCP and mDNS rules without a token", () => {
    const commands = firewallAddCommands(windowsCfgFixture.port, windowsCfgFixture.nodePath).join("\n");
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
    const commands = firewallAddCommands(windowsCfgFixture.port, windowsCfgFixture.nodePath);

    expect(commands).toHaveLength(4);
    expect(commands.slice(0, 2)).toEqual(firewallRemoveCommands());
    expect(commands[2]).toBe(
      `netsh advfirewall firewall add rule name="${FIREWALL_TCP}" dir=in action=allow program="${windowsCfgFixture.nodePath}" protocol=TCP localport=${windowsCfgFixture.port} profile=private`,
    );
    expect(commands[3]).toBe(
      `netsh advfirewall firewall add rule name="${FIREWALL_MDNS}" dir=in action=allow program="${windowsCfgFixture.nodePath}" protocol=UDP localport=5353 profile=private`,
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
    const addCommands = firewallAddCommands(windowsCfgFixture.port);
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

describe("Windows PowerShell launcher", () => {
  it("sets the home, appends every service stream to bridge.log, and exits with the child code", () => {
    const launcher = windowsLauncher(windowsCfgFixture);
    expect(launcher.split("\r\n")).toEqual([
      "$ErrorActionPreference = 'Stop'",
      `$env:POCKETPET_HOME = 'C:\\Users\\happy\\.pocketpet'`,
      `& 'C:\\Program Files\\nodejs\\node.exe' 'C:\\app\\dist\\cli.js' run --service *>> 'C:\\Users\\happy\\.pocketpet\\logs\\bridge.log'`,
      "exit $LASTEXITCODE",
    ]);
    expect(launcher).not.toMatch(/token=|pairing|\/setup|\?t=/i);
    expect(launcher).not.toContain(".cmd");
  });

  it("writes the launcher as UTF-8 with a byte-order mark", () => {
    const bytes = windowsLauncherBytes(windowsCfgFixture);

    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.subarray(3).toString("utf8")).toBe(windowsLauncher(windowsCfgFixture));
  });

  it("quotes spaces, Unicode, and apostrophes as PowerShell literals", () => {
    const launcher = windowsLauncher({
      ...windowsCfgFixture,
      home: "C:\\Users\\O'Brien 口 袋\\.pocketpet",
      nodePath: "C:\\Program Files\\nodejs\\node.exe",
      cliPath: "C:\\应用 目录\\dist\\cli.js",
    });
    expect(launcher).toContain(
      `& 'C:\\Program Files\\nodejs\\node.exe' 'C:\\应用 目录\\dist\\cli.js' run --service *>> 'C:\\Users\\O''Brien 口 袋\\.pocketpet\\logs\\bridge.log'`,
    );
    expect(launcher).toContain(`$env:POCKETPET_HOME = 'C:\\Users\\O''Brien 口 袋\\.pocketpet'`);
  });
});

describe("Windows Task Scheduler XML", () => {
  it("writes a hidden logon task for the current user with least privilege and restart", () => {
    const xml = windowsTaskXml(windowsCfgFixture, SID);

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

  it("runs the PowerShell launcher in a hidden non-interactive process", () => {
    const xml = windowsTaskXml(windowsCfgFixture, SID);

    expect(xml).toContain("<Command>powershell.exe</Command>");
    expect(xml).toContain(
      `<Arguments>-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File &quot;${launcherPath}&quot;</Arguments>`,
    );
    expect(xml).toContain(`<WorkingDirectory>${windowsCfgFixture.home}</WorkingDirectory>`);
    expect(xml).toContain("bridge-service.ps1");
    expect(xml).not.toContain("cmd.exe");
    expect(xml).not.toContain("/d /s /c");
    expect(xml).not.toContain("bridge-service.cmd");
    // InteractiveToken is a logon type, not a credential.
    expect(xml).not.toMatch(/token=|pairing|\/setup|\?t=/i);
  });

  it("keeps a home path with spaces and Unicode quoted as one launcher argument", () => {
    const spacedHome = "C:\\Users\\Happy Liang 口 袋\\.pocketpet";
    const xml = windowsTaskXml({ ...windowsCfgFixture, home: spacedHome }, SID);

    expect(xml).toContain(
      `<Arguments>-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File &quot;${spacedHome}\\bridge-service.ps1&quot;</Arguments>`,
    );
  });

  it("writes the task XML as UTF-16LE with a byte-order mark", () => {
    const xml = windowsTaskXml(windowsCfgFixture, SID);
    const bytes = windowsTaskXmlBytes(xml);

    expect([...bytes.subarray(0, 2)]).toEqual([0xff, 0xfe]);
    expect(bytes.length).toBe(2 + Buffer.byteLength(xml, "utf16le"));
    expect(bytes.subarray(2).toString("utf16le")).toBe(xml);
    // A BOM-less UTF-16LE file is not acceptable for schtasks /XML.
    expect(bytes.length).toBeGreaterThan(Buffer.byteLength(xml, "utf16le"));
  });

  it("XML-escapes the SID, home, and launcher path", () => {
    const xml = windowsTaskXml({ ...windowsCfgFixture, home: 'C:\\Users\\o\'brien & <home> "q"' }, "S-1-5-21-<42>");
    expect(xml).toContain("S-1-5-21-&lt;42&gt;");
    expect(xml).toContain("o&apos;brien &amp; &lt;home&gt; &quot;q&quot;");
    expect(xml).toContain("o&apos;brien &amp; &lt;home&gt; &quot;q&quot;\\bridge-service.ps1");
    expect(xml).not.toContain("<home>");
    expect(xml).not.toContain("o'brien");
  });
});

describe("serviceStatusFromState", () => {
  it("uses a locale-independent PowerShell state query", () => {
    expect(TASK_STATE_SCRIPT).toBe(
      "Get-ScheduledTask -TaskName 'PocketPet Bridge' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty State",
    );
    expect(TASK_STATE_SCRIPT).not.toMatch(/TaskName:|Status:|Scheduled Task State:/);
    expect(TASK_STATE_SCRIPT).not.toContain("schtasks");
  });

  it("maps Running to installed and running", () => {
    expect(serviceStatusFromState("Running\r\n")).toEqual({ installed: true, running: true });
    expect(serviceStatusFromState("RUNNING\n")).toEqual({ installed: true, running: true });
  });

  it("maps Ready, Disabled, and other states to installed and stopped", () => {
    for (const state of ["Ready", "Disabled", "Queued", "Unknown"]) {
      expect(serviceStatusFromState(`${state}\r\n`), state).toEqual({ installed: true, running: false });
    }
  });

  it("maps empty output to a missing task", () => {
    expect(serviceStatusFromState("")).toEqual({ installed: false, running: false });
    expect(serviceStatusFromState("\r\n")).toEqual({ installed: false, running: false });
  });
});

describe("serviceStatusFromQuery fallback", () => {
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

type Recorder = {
  deps: WindowsDeps;
  scripts: string[];
  runs: Array<{ command: string; args: string[] }>;
  order: string[];
};

function fakeDeps(
  options: {
    elevatedStatus?: number;
    state?: string;
    runResult?: (command: string, args: string[]) => { status: number } | undefined;
    onElevated?: () => void;
  } = {},
): Recorder {
  const scripts: string[] = [];
  const runs: Array<{ command: string; args: string[] }> = [];
  const order: string[] = [];
  const deps: WindowsDeps = {
    run: (command, args) => {
      runs.push({ command, args });
      const override = options.runResult?.(command, args);
      if (override) return { status: override.status, stdout: "", stderr: "" };
      const text = args.join(" ");
      if (text.includes("WindowsIdentity")) return { status: 0, stdout: `${SID}\r\n`, stderr: "" };
      if (text.includes("Get-ScheduledTask")) return { status: 0, stdout: options.state ?? "Running\r\n", stderr: "" };
      return { status: 0, stdout: "", stderr: "" };
    },
    elevated: async (script) => {
      scripts.push(script);
      options.onElevated?.();
      return { status: options.elevatedStatus ?? 0, stdout: "", stderr: "" };
    },
    protectLogs: (home) => order.push(`logs:${home}`),
    protectFile: (path) => order.push(`file:${path}`),
  };
  return { deps, scripts, runs, order };
}

describe("Windows service transaction", () => {
  let root: string;
  let cfg: ServiceConfig;
  let launcher: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "pocketpet-winsvc-"));
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "dist", "cli.js"), "// compiled bridge cli\n");
    cfg = {
      home: join(root, "home"),
      nodePath: process.execPath,
      cliPath: join(root, "dist", "cli.js"),
      port: 7788,
    };
    launcher = join(cfg.home, "bridge-service.ps1");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("protects logs, stages a temp launcher, then stops, adds rules, registers, and starts the task", async () => {
    const { deps, scripts, order, runs } = fakeDeps();

    await installWindowsService(cfg, deps);

    expect(order[0]).toBe(`logs:${cfg.home}`);
    expect(order[1]).toMatch(/file:.*\.bridge-service\.ps1\..*\.tmp$/);
    // The final launcher is only protected after it has been installed.
    expect(order[2]).toBe(`file:${launcher}`);
    expect(existsSync(launcher)).toBe(true);
    const launcherBytes = readFileSync(launcher);
    expect([...launcherBytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);

    expect(scripts).toHaveLength(1);
    const script = scripts[0]!;
    const priorTaskCheck = script.indexOf("$hadTask = ");
    const stop = script.indexOf(`Stop-ScheduledTask -TaskName 'PocketPet Bridge'`);
    const staleDeletes = script.indexOf("'delete' 'rule'");
    const firewallAdds = script.indexOf("'add' 'rule'");
    const create = script.indexOf(`/Create /TN 'PocketPet Bridge' /XML $xmlPath /F`);
    expect(priorTaskCheck).toBeGreaterThanOrEqual(0);
    expect(priorTaskCheck).toBeLessThan(script.indexOf("try {"));
    expect(stop).toBeGreaterThanOrEqual(0);
    // An existing task is stopped before /Create /F replaces it.
    expect(stop).toBeLessThan(staleDeletes);
    expect(staleDeletes).toBeLessThan(firewallAdds);
    expect(firewallAdds).toBeLessThan(create);
    // Task probes, stop, and rollback use the cmdlets, never native schtasks:
    // PowerShell 5.1 turns absent-task stderr into a terminating error.
    expect(script).toContain(`$existing = Get-ScheduledTask -TaskName 'PocketPet Bridge' -ErrorAction SilentlyContinue`);
    expect(script).not.toMatch(/schtasks\.exe \/Query/);
    expect(script).not.toMatch(/schtasks\.exe \/End/);
    expect(script).not.toMatch(/schtasks\.exe \/(?:Delete|Run)/);
    expect(script).toContain(`Start-ScheduledTask -TaskName 'PocketPet Bridge' -ErrorAction SilentlyContinue`);
    expect(script).toContain(`Unregister-ScheduledTask -TaskName 'PocketPet Bridge' -Confirm:$false -ErrorAction SilentlyContinue`);
    // The task is started only after the launcher is in place, never inside the
    // elevation (where the previous launcher is still the one on disk).
    expect(script.slice(script.indexOf("try {"), script.indexOf("} catch {"))).not.toContain("/Run");
    expect(script).toContain("$env:TEMP");
    expect(script).toContain("Remove-Item -LiteralPath $xmlPath");
    expect(script).toContain("throw 'firewall rule update failed'");
    expect(script).toContain("throw 'task registration failed'");
    expect(script).toContain(`'name=${FIREWALL_TCP}'`);
    expect(script).toContain(`'name=${FIREWALL_MDNS}'`);
    expect(script).toContain(`'localport=${cfg.port}'`);
    expect(script).toContain(`'program=${cfg.nodePath}'`);

    const start = runs[runs.length - 1]!;
    expect(start.command).toBe("schtasks.exe");
    expect(start.args).toEqual(["/Run", "/TN", TASK_NAME]);
    expect(existsSync(launcher)).toBe(true);
  });

  it("keeps the previous launcher until the elevated install succeeds, then replaces it atomically", async () => {
    mkdirSync(cfg.home, { recursive: true });
    const previous = Buffer.from("old launcher\r\n", "utf8");
    writeFileSync(launcher, previous);
    let duringElevation: Buffer | null = null;
    let tempsDuringElevation = 0;
    const { deps } = fakeDeps({
      onElevated: () => {
        duringElevation = readFileSync(launcher);
        tempsDuringElevation = readdirSync(cfg.home).filter((name) => name.endsWith(".tmp")).length;
      },
    });

    await installWindowsService(cfg, deps);

    expect(duringElevation).toEqual(previous);
    expect(tempsDuringElevation, "the new launcher is staged at a temp path").toBe(1);
    expect(readFileSync(launcher)).toEqual(windowsLauncherBytes(cfg));
    expect(readdirSync(cfg.home).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("preserves the previous launcher when a reinstall is cancelled at UAC", async () => {
    mkdirSync(cfg.home, { recursive: true });
    writeFileSync(launcher, "old launcher\r\n");
    const { deps, scripts } = fakeDeps({ elevatedStatus: ELEVATION_CANCELLED });

    await expect(installWindowsService(cfg, deps)).rejects.toMatchObject({ cancelled: true });

    expect(scripts).toHaveLength(1);
    expect(readFileSync(launcher, "utf8")).toBe("old launcher\r\n");
    expect(readdirSync(cfg.home).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("embeds task XML as UTF-16LE with a BOM and no token", async () => {
    const { deps, scripts } = fakeDeps();

    await installWindowsService(cfg, deps);

    const script = scripts[0]!;
    const encoded = script.match(/FromBase64String\('([A-Za-z0-9+/=]+)'\)/)?.[1];
    expect(encoded, "install script embeds the task XML").toBeTruthy();
    const bytes = Buffer.from(encoded!, "base64");
    expect([...bytes.subarray(0, 2)]).toEqual([0xff, 0xfe]);
    expect(bytes.subarray(2).toString("utf16le")).toBe(windowsTaskXml(cfg, SID));
    expect(script).not.toMatch(/token=|pairing|\?t=/i);
  });

  it("rolls back firewall rules and unregisters the task on a fresh install failure and leaves no launcher", async () => {
    const { deps, scripts } = fakeDeps({ elevatedStatus: 1 });

    await expect(installWindowsService(cfg, deps)).rejects.toThrow(/elevated install failed \(exit 1\)/);

    expect(existsSync(launcher)).toBe(false);
    expect(readdirSync(cfg.home).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    expect(scripts).toHaveLength(1);
    const script = scripts[0]!;
    const catchIndex = script.indexOf("} catch {");
    expect(catchIndex).toBeGreaterThan(0);
    const rollback = script.slice(catchIndex);
    const ruleRemovals = rollback.indexOf("'delete' 'rule'");
    const taskPresence = rollback.indexOf(`$created = Get-ScheduledTask -TaskName 'PocketPet Bridge' -ErrorAction SilentlyContinue`);
    const stop = rollback.indexOf(`Stop-ScheduledTask -TaskName 'PocketPet Bridge'`);
    const unregister = rollback.indexOf(`Unregister-ScheduledTask -TaskName 'PocketPet Bridge' -Confirm:$false`);
    expect(ruleRemovals).toBeGreaterThanOrEqual(0);
    // A fresh-install cleanup probes with the cmdlet, so an absent task is a no-op.
    expect(taskPresence).toBeGreaterThan(ruleRemovals);
    expect(stop).toBeGreaterThan(taskPresence);
    expect(unregister).toBeGreaterThan(stop);
    // Never shell out for the cleanup: absent-task stderr is a PS 5.1 terminating error.
    expect(rollback).not.toContain("schtasks.exe /Delete");
    expect(rollback).not.toContain("/Delete");
    expect(rollback).toContain(FIREWALL_TCP);
    expect(rollback).toContain(FIREWALL_MDNS);
  });

  it("restores a previously installed task instead of deleting it when an upgrade fails", async () => {
    const { deps, scripts } = fakeDeps({ elevatedStatus: 1 });

    await expect(installWindowsService(cfg, deps)).rejects.toThrow(/elevated install failed/);

    const script = scripts[0]!;
    const catchIndex = script.indexOf("} catch {");
    const rollback = script.slice(catchIndex);
    expect(rollback).toContain("if ($hadTask)");
    // A prior install is restarted; only a fresh install is cleaned up.
    expect(rollback.indexOf("if ($hadTask)")).toBeLessThan(rollback.indexOf("'delete' 'rule'"));
    expect(rollback).toContain(`Start-ScheduledTask -TaskName 'PocketPet Bridge' -ErrorAction SilentlyContinue`);
    expect(rollback).not.toMatch(/schtasks\.exe \/Run/);
  });

  it("reports a failed task start instead of claiming the service is running", async () => {
    const { deps } = fakeDeps({
      runResult: (command, args) => (command === "schtasks.exe" && args.includes("/Run") ? { status: 1 } : undefined),
    });

    await expect(installWindowsService(cfg, deps)).rejects.toThrow(/could not be started/i);

    // The task and launcher are installed; only the start failed.
    expect(existsSync(launcher)).toBe(true);
    expect(readdirSync(cfg.home).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("surfaces UAC cancellation distinctly and leaves no launcher", async () => {
    const { deps } = fakeDeps({ elevatedStatus: ELEVATION_CANCELLED });
    expect(ELEVATION_CANCELLED).toBe(1223);

    let caught: unknown;
    try {
      await installWindowsService(cfg, deps);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(WindowsServiceError);
    const failure = caught as WindowsServiceError;
    expect(failure.cancelled).toBe(true);
    expect(failure.exitCode).toBe(ELEVATION_CANCELLED);
    expect(failure.message).toMatch(/cancel/i);
    expect(failure.message).not.toMatch(/token=|pairing|\?t=/i);
    expect(existsSync(launcher)).toBe(false);
  });

  it("refuses a source or missing CLI and a missing Node binary before elevation", async () => {
    for (const override of [
      { cliPath: join(root, "src", "cli.ts") },
      { cliPath: join(root, "dist", "missing.js") },
      { nodePath: join(root, "missing-node.exe") },
    ]) {
      const { deps, scripts } = fakeDeps();
      await expect(installWindowsService({ ...cfg, ...override }, deps), JSON.stringify(override)).rejects.toThrow(
        /compiled CLI|node/i,
      );
      expect(scripts, JSON.stringify(override)).toHaveLength(0);
      expect(existsSync(launcher), JSON.stringify(override)).toBe(false);
    }
  });

  it("rejects an invalid port before elevation and removes the launcher", async () => {
    const { deps, scripts } = fakeDeps();

    await expect(installWindowsService({ ...cfg, port: 0 }, deps)).rejects.toThrow(/port/i);

    expect(scripts).toHaveLength(0);
    expect(existsSync(launcher)).toBe(false);
  });
});

describe("Windows service uninstall", () => {
  let root: string;
  let cfg: ServiceConfig;
  let launcher: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "pocketpet-winsvc-uninstall-"));
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "dist", "cli.js"), "// compiled bridge cli\n");
    cfg = { home: join(root, "home"), nodePath: process.execPath, cliPath: join(root, "dist", "cli.js"), port: 7788 };
    mkdirSync(cfg.home, { recursive: true });
    launcher = join(cfg.home, "bridge-service.ps1");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("stops and unregisters the task, verifies it is gone, then removes both firewall rules in one elevation", async () => {
    writeFileSync(launcher, windowsLauncherBytes(cfg));
    const { deps, scripts } = fakeDeps();
    const service = createWindowsService(deps);

    await service.uninstall(cfg);

    expect(scripts).toHaveLength(1);
    const script = scripts[0]!;
    const presence = script.indexOf(`$task = Get-ScheduledTask -TaskName 'PocketPet Bridge' -ErrorAction SilentlyContinue`);
    const stop = script.indexOf(`Stop-ScheduledTask -TaskName 'PocketPet Bridge'`);
    const unregister = script.indexOf(`Unregister-ScheduledTask -TaskName 'PocketPet Bridge' -Confirm:$false`);
    const verify = script.indexOf(`$remaining = Get-ScheduledTask -TaskName 'PocketPet Bridge' -ErrorAction SilentlyContinue`);
    const ruleRemoval = script.indexOf("'delete' 'rule'");
    expect(presence).toBeGreaterThanOrEqual(0);
    // A missing task is a clean no-op because presence gates the cmdlets.
    expect(presence).toBeLessThan(stop);
    expect(stop).toBeGreaterThanOrEqual(0);
    expect(stop).toBeLessThan(unregister);
    // A task that survives the unregister must exit nonzero instead of reporting success.
    expect(unregister).toBeLessThan(verify);
    expect(verify).toBeGreaterThanOrEqual(0);
    expect(verify).toBeLessThan(ruleRemoval);
    expect(script).toContain("if ($null -ne $remaining) { throw 'task deletion failed' }");
    // No native schtasks on the absent-task path: PS 5.1 turns its stderr into a throw.
    expect(script).not.toContain("schtasks");
    // Rule deletion stays idempotent: a missing rule must not fail the uninstall.
    expect(script.trimEnd().endsWith("exit 0")).toBe(true);
    expect(script).toContain(FIREWALL_TCP);
    expect(script).toContain(FIREWALL_MDNS);
    expect(existsSync(launcher)).toBe(false);
  });

  it("propagates a failed elevated uninstall and keeps the launcher", async () => {
    writeFileSync(launcher, windowsLauncherBytes(cfg));
    const { deps } = fakeDeps({ elevatedStatus: 1 });
    const service = createWindowsService(deps);

    await expect(service.uninstall(cfg)).rejects.toThrow(/elevated uninstall failed \(exit 1\)/);
    expect(existsSync(launcher)).toBe(true);
  });

  it("keeps the launcher when UAC is canceled and reports the cancellation", async () => {
    writeFileSync(launcher, windowsLauncherBytes(cfg));
    const { deps } = fakeDeps({ elevatedStatus: ELEVATION_CANCELLED });
    const service = createWindowsService(deps);

    await expect(service.uninstall(cfg)).rejects.toMatchObject({ cancelled: true });
    expect(existsSync(launcher)).toBe(true);
  });

  it("is idempotent when the launcher and task are already gone", async () => {
    const { deps, scripts } = fakeDeps();
    const service = createWindowsService(deps);

    await expect(service.uninstall(cfg)).resolves.toBeUndefined();
    expect(scripts).toHaveLength(1);
    const script = scripts[0]!;
    // The missing task is a clean no-op: presence is probed with the cmdlet and
    // no native command can emit stderr that PS 5.1 would turn into a throw.
    expect(script).toContain(`Get-ScheduledTask -TaskName 'PocketPet Bridge' -ErrorAction SilentlyContinue`);
    expect(script).toContain("if ($null -ne $task)");
    expect(script).not.toContain("2>$null");
    expect(script).not.toContain("schtasks");
  });
});

describe("Windows service status and label", () => {
  let root: string;
  let cfg: ServiceConfig;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "pocketpet-winsvc-status-"));
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "dist", "cli.js"), "// compiled bridge cli\n");
    cfg = { home: join(root, "home"), nodePath: process.execPath, cliPath: join(root, "dist", "cli.js"), port: 7788 };
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("uses the PocketPet Bridge platform label", () => {
    expect(createWindowsService(fakeDeps().deps).label).toBe("PocketPet Bridge");
  });

  it("queries PowerShell state without English schtasks labels or elevation", async () => {
    const { deps, runs } = fakeDeps({ state: "Running\r\n" });
    const service = createWindowsService(deps);

    expect(await service.status(cfg)).toEqual({ installed: true, running: true });
    expect(runs).toHaveLength(1);
    expect(runs[0]!.command).toBe("powershell.exe");
    const text = runs[0]!.args.join(" ");
    expect(text).toContain(`Get-ScheduledTask -TaskName 'PocketPet Bridge'`);
    expect(text).toContain("Select-Object -ExpandProperty State");
    expect(text).not.toContain("/Query");
    expect(text).not.toContain("TaskName:");
  });

  it("reports a stopped or missing task honestly", async () => {
    for (const [state, expected] of [
      ["Ready\r\n", { installed: true, running: false }],
      ["Disabled\r\n", { installed: true, running: false }],
      ["", { installed: false, running: false }],
    ] as const) {
      const { deps } = fakeDeps({ state });
      expect(await createWindowsService(deps).status(cfg), state).toEqual(expected);
    }
  });
});

describe("Windows elevation runner", () => {
  it("wraps the token-free script in Start-Process -Verb RunAs -Wait -PassThru", () => {
    const script = "Write-Output 'hello'";
    const wrapper = elevatedWrapperScript(script);

    expect(wrapper).toContain("-Verb RunAs -Wait -PassThru");
    expect(wrapper).toContain("-EncodedCommand");
    expect(wrapper).not.toMatch(/token=|pairing|\?t=/i);
    const encoded = wrapper.match(/-EncodedCommand','([A-Za-z0-9+/=]+)'/)?.[1];
    expect(encoded, "wrapper embeds the encoded script").toBeTruthy();
    expect(Buffer.from(encoded!, "base64").toString("utf16le")).toBe(script);
    expect(wrapper).toContain(`exit ${ELEVATION_CANCELLED}`);
    // UAC cancellation surfaces as Win32Exception 1223 or HResult 0x800704C7.
    expect(wrapper).toContain("-2147023673");
    // The elevated child is hidden and a null ExitCode is never treated as success.
    expect(wrapper).toContain("-WindowStyle Hidden");
    expect(wrapper).toContain("$null -eq $p.ExitCode");
  });

  it("fails closed when the encoded command exceeds the Windows command line limit", async () => {
    await expect(defaultElevatedRunner("x".repeat(50_000))).rejects.toThrow(/command line limit/i);
  });

  it("probes, stops, and rolls back tasks with ScheduledTasks cmdlets instead of native schtasks", () => {
    const install = windowsInstallScript(windowsCfgFixture, SID);
    const uninstall = windowsUninstallScript();
    const task = `'PocketPet Bridge'`;

    for (const [name, script] of [
      ["install", install],
      ["uninstall", uninstall],
    ] as const) {
      // PowerShell 5.1 turns native stderr into a terminating error even when
      // redirected, so missing-task probes must never reach schtasks.
      expect(script, name).not.toMatch(/schtasks\.exe \/(?:Query|End|Delete|Run)/);
      expect(script, name).toContain(`Get-ScheduledTask -TaskName ${task} -ErrorAction SilentlyContinue`);
    }

    // Registration stays on `schtasks /Create /XML` with the BOM-tagged file.
    expect(install).toContain(`& schtasks.exe /Create /TN ${task} /XML $xmlPath /F;`);
    expect(install).toContain(`Stop-ScheduledTask -TaskName ${task} -ErrorAction SilentlyContinue`);
    expect(install).toContain(`Start-ScheduledTask -TaskName ${task} -ErrorAction SilentlyContinue`);
    expect(install).toContain(`Unregister-ScheduledTask -TaskName ${task} -Confirm:$false -ErrorAction SilentlyContinue`);
    // Uninstall stops, unregisters, and verifies absence of the task.
    expect(uninstall).toContain(`Stop-ScheduledTask -TaskName ${task} -ErrorAction SilentlyContinue`);
    expect(uninstall).toContain(`Unregister-ScheduledTask -TaskName ${task} -Confirm:$false -ErrorAction SilentlyContinue`);
    expect(uninstall).toContain(`$remaining = Get-ScheduledTask -TaskName ${task} -ErrorAction SilentlyContinue`);
    expect(uninstall).toContain("if ($null -ne $remaining) { throw 'task deletion failed' }");
  });

  it("builds install and uninstall scripts without secrets", () => {
    const install = windowsInstallScript(windowsCfgFixture, SID);
    const uninstall = windowsUninstallScript();

    expect(install).not.toMatch(/token=|pairing|\?t=/i);
    expect(uninstall).not.toMatch(/token=|pairing|\?t=/i);
    expect(uninstall).toContain("$ErrorActionPreference = 'Stop'");
  });
});
