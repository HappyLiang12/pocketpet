import { describe, expect, it, vi } from "vitest";
import type { CommandResult, CommandRunner } from "../src/platform/types.js";
import { currentUserSid, WindowsSecurityError, windowsSecurity } from "../src/platform/windows/security.js";
import { powershellEnv } from "../src/platform/windows/powershell.js";

const SID = "S-1-5-21-42";
// Windows PowerShell 5.1 cannot resolve the bare `[WindowsIdentity]` accelerator
// for this type; only the fully qualified name works on every supported host.
const SID_SCRIPT = "([System.Security.Principal.WindowsIdentity]::GetCurrent()).User.Value";

type PowerShellCall = { command: string; args: string[] };

/** Runner that answers the SID probe and records every PowerShell call. */
function sidRunner(protection: CommandResult = { status: 0, stdout: "", stderr: "" }) {
  const calls: PowerShellCall[] = [];
  const run: CommandRunner = (command, args) => {
    calls.push({ command, args });
    if (args.includes("-Command")) return { status: 0, stdout: `${SID}\n`, stderr: "" };
    return protection;
  };
  return { run, calls };
}

function decode(call: PowerShellCall): string {
  expect(call.command).toBe("powershell.exe");
  expect(call.args.slice(0, 3)).toEqual(["-NoProfile", "-NonInteractive", "-EncodedCommand"]);
  return Buffer.from(call.args[3], "base64").toString("utf16le");
}

describe("Windows private paths", () => {
  it("uses Windows PowerShell 5.1 modules even under a PowerShell 7 parent", () => {
    const env = powershellEnv({
      SystemRoot: "D:\\Windows",
      PSModulePath: "C:\\Program Files\\PowerShell\\7\\Modules",
    });
    expect(env.PSModulePath).toBe("D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules");
  });

  it("falls back to C:\\Windows when SystemRoot is absent", () => {
    expect(powershellEnv({}).PSModulePath).toBe("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules");
  });

  it("replaces inheritance with one current-user ACE for a file", () => {
    const { run, calls } = sidRunner();
    windowsSecurity.protectFile("C:\\Users\\happy\\.pocketpet\\config.json", run);

    expect(calls).toHaveLength(2);
    expect(calls[0].args[2]).toBe("-Command");
    expect(calls[0].args[3]).toBe(SID_SCRIPT);
    expect(calls[0].args[3]).not.toContain("([WindowsIdentity]");
    const script = decode(calls[1]);
    expect(script).toContain("SetAccessRuleProtection($true,$false)");
    expect(script).toContain(SID);
    expect(script).toContain("RemoveAccessRule");
    expect(script).toContain("Set-Acl");
    expect(script).toContain("System.Security.Principal.SecurityIdentifier");
    expect(script).toContain("FileSystemAccessRule($sidObj,");
    expect(script).toContain("'FullControl'");
    expect(script).toContain("'None','None','Allow'");
    expect(script).toContain("Access.Count -ne 1");
    expect(script).toContain("AreAccessRulesProtected");
    // Administrators and SYSTEM may take ownership but are never granted by default.
    expect(script).not.toMatch(/S-1-5-32|Administrators|SYSTEM/);
    // A standard user cannot apply Set-Acl twice to an already-protected DACL
    // (SeSecurityPrivilege), so an exact current-user-only ACL must exit 0
    // before any mutation. Files require no inheritance (mask 0).
    const earlyExit = script.indexOf("exit 0");
    expect(earlyExit).toBeGreaterThan(-1);
    expect(earlyExit).toBeLessThan(script.indexOf("SetAccessRuleProtection"));
    const gate = script.slice(0, earlyExit);
    expect(gate).toContain("$requiredInheritance=0");
    expect(gate).toContain("AreAccessRulesProtected");
    expect(gate).toContain("$acl.Access.Count -eq 1");
    expect(gate).toContain("AccessControlType -eq 'Allow'");
    expect(gate).toContain("FullControl");
    expect(gate).toContain("IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -eq $sid");
    expect(gate).toContain("[int]$r.InheritanceFlags -eq $requiredInheritance");
    // An inherited or InheritOnly ACE for the same SID must not count as exact.
    expect(gate).toContain("[int]$r.PropagationFlags -eq 0");
    expect(gate).toContain("$r.IsInherited -eq $false");
  });

  it("builds the ACE from a SecurityIdentifier object, never the SID string", () => {
    const { run, calls } = sidRunner();
    windowsSecurity.protectFile("C:\\Users\\happy\\.pocketpet\\config.json", run);
    const script = decode(calls[1]);
    // PowerShell's string overload treats the SID as an NTAccount name and throws
    // IdentityNotMappedException, so the rule must receive a real SID object.
    expect(script).toContain("New-Object System.Security.Principal.SecurityIdentifier($sid)");
    expect(script).toContain("FileSystemAccessRule($sidObj,'FullControl'");
    expect(script).not.toContain("FileSystemAccessRule($sid,");
  });

  it("uses inheritable directory ACEs for home and logs", () => {
    const home = "C:\\Users\\happy\\.pocketpet";
    const recorder = sidRunner();
    windowsSecurity.protectHome(home, recorder.run);
    const homeScript = decode(recorder.calls.at(-1) as PowerShellCall);
    expect(homeScript).toContain("ContainerInherit,ObjectInherit");
    expect(homeScript).toContain(home);
    // Directories require exactly ContainerInherit|ObjectInherit (mask 3) for
    // the idempotence gate, so a repeat protection stays a read-only no-op.
    expect(homeScript).toContain("$requiredInheritance=3");
    expect(homeScript).toContain("[int]$r.PropagationFlags -eq 0");
    expect(homeScript).toContain("$r.IsInherited -eq $false");
    const homeEarlyExit = homeScript.indexOf("exit 0");
    expect(homeEarlyExit).toBeGreaterThan(-1);
    expect(homeEarlyExit).toBeLessThan(homeScript.indexOf("SetAccessRuleProtection"));

    const logsRecorder = sidRunner();
    windowsSecurity.protectLogs(home, logsRecorder.run);
    const logsScript = decode(logsRecorder.calls.at(-1) as PowerShellCall);
    expect(logsScript).toContain("ContainerInherit,ObjectInherit");
    expect(logsScript).toContain("logs");
    expect(logsScript).toContain("$requiredInheritance=3");
    expect(logsScript).toContain("[int]$r.PropagationFlags -eq 0");
    expect(logsScript).toContain("$r.IsInherited -eq $false");
    const logsEarlyExit = logsScript.indexOf("exit 0");
    expect(logsEarlyExit).toBeGreaterThan(-1);
    expect(logsEarlyExit).toBeLessThan(logsScript.indexOf("SetAccessRuleProtection"));
  });

  it("escapes single quotes in the protected path", () => {
    const { run, calls } = sidRunner();
    windowsSecurity.protectFile("C:\\Users\\o'brien\\.pocketpet\\config.json", run);
    const script = decode(calls[1]);
    expect(script).toContain("o''brien");
  });

  it("resolves the trimmed SID through powershell without a profile", () => {
    const { run, calls } = sidRunner();
    expect(currentUserSid(run)).toBe(SID);
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe("powershell.exe");
    expect(calls[0].args.slice(0, 3)).toEqual(["-NoProfile", "-NonInteractive", "-Command"]);
    // The SID probe must use the fully qualified .NET type on PowerShell 5.1.
    expect(calls[0].args[3]).toBe(SID_SCRIPT);
    expect(calls[0].args[3]).not.toContain("([WindowsIdentity]");
  });

  it("throws a typed error when the SID cannot be resolved, before touching any ACL", () => {
    const run = vi.fn((_command: string, _args: string[]) => ({ status: 1, stdout: "", stderr: "denied" }));
    let thrown: unknown;
    try {
      windowsSecurity.protectFile("C:\\x", run);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(WindowsSecurityError);
    const failure = thrown as WindowsSecurityError;
    expect(failure.operation).toBe("resolve-sid");
    expect(failure.path).toBeNull();
    expect(failure.message).toMatch(/SID/i);
    // Only the SID probe ran; no protection command was attempted.
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][1]).toContain("-Command");
  });

  it("rejects a malformed SID before touching any ACL", () => {
    const calls: PowerShellCall[] = [];
    const bad = vi.fn((command: string, args: string[]) => {
      calls.push({ command, args });
      return { status: 0, stdout: "SNEAKY-VALUE\n", stderr: "" };
    });
    expect(() => windowsSecurity.protectFile("C:\\x", bad)).toThrow(/SID/i);
    expect(bad).toHaveBeenCalledTimes(1);
    expect(calls[0].args[2]).toBe("-Command");
  });

  it("rejects partial S-1-5 prefixes before touching any ACL", () => {
    for (const sid of ["S-1-5", "S-1-5-", "S-1-5-21-", "S-1-5-abc", "S-1-5-21-42-extra-"]) {
      const run = vi.fn((_command: string, _args: string[]) => ({ status: 0, stdout: `${sid}\n`, stderr: "" }));
      expect(() => windowsSecurity.protectFile("C:\\x", run), sid).toThrow(/SID/i);
      expect(run, sid).toHaveBeenCalledTimes(1);
    }
  });

  it("throws when DACL replacement or verification fails", () => {
    const { run } = sidRunner({ status: 3, stdout: "", stderr: "verification failed" });
    let thrown: unknown;
    try {
      windowsSecurity.protectFile("C:\\Users\\happy\\.pocketpet\\config.json", run);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(WindowsSecurityError);
    const failure = thrown as WindowsSecurityError;
    expect(failure.operation).toBe("protect");
    expect(failure.path).toBe("C:\\Users\\happy\\.pocketpet\\config.json");
    expect(failure.exitCode).toBe(3);
    expect(failure.message).toMatch(/ACL/i);
    // Command output is not echoed; errors stay path-only.
    expect(failure.message).not.toContain("verification failed");
  });
});
