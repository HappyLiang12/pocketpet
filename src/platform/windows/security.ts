import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { CommandRunner, PrivatePaths } from "../types.js";
import { POWERSHELL, powershellEnv } from "./powershell.js";

// Windows PowerShell 5.1 does not resolve the bare `[WindowsIdentity]` name;
// the fully qualified .NET type resolves on every supported PowerShell host.
const SID_SCRIPT = "([System.Security.Principal.WindowsIdentity]::GetCurrent()).User.Value";
const SID_PATTERN = /^S-1-5-\d+(-\d+)+$/;

export type WindowsSecurityOperation = "resolve-sid" | "protect";

/**
 * Safe, typed failure for private-path protection. The message names the
 * operation, the path, and the PowerShell exit code only; command output and
 * config content are never included.
 */
export class WindowsSecurityError extends Error {
  readonly operation: WindowsSecurityOperation;
  readonly path: string | null;
  readonly exitCode: number;

  constructor(operation: WindowsSecurityOperation, path: string | null, exitCode: number, message: string) {
    super(message);
    this.name = "WindowsSecurityError";
    this.operation = operation;
    this.path = path;
    this.exitCode = exitCode;
  }
}

function toText(value: string | Buffer | undefined): string {
  if (typeof value === "string") return value;
  return value ? value.toString("utf8") : "";
}

const defaultRunner: CommandRunner = (command, args) => {
  try {
    const stdout = execFileSync(command, args, {
      encoding: "utf8",
      stdio: "pipe",
      windowsHide: true,
      env: powershellEnv(),
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const failed = error as { status?: number | null; stdout?: string | Buffer; stderr?: string | Buffer };
    return {
      status: typeof failed.status === "number" ? failed.status : 1,
      stdout: toText(failed.stdout),
      stderr: toText(failed.stderr),
    };
  }
};

/** PowerShell single-quoted literal: only `'` needs doubling. */
const psQuote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

/** Resolve the signed-in user SID; throws before any ACL work when unavailable. */
export function currentUserSid(run: CommandRunner = defaultRunner): string {
  const result = run(POWERSHELL, ["-NoProfile", "-NonInteractive", "-Command", SID_SCRIPT]);
  const sid = result.stdout.trim();
  if (result.status !== 0 || !SID_PATTERN.test(sid)) {
    throw new WindowsSecurityError(
      "resolve-sid",
      null,
      result.status,
      `cannot resolve the current user SID (powershell exit ${result.status})`,
    );
  }
  return sid;
}

/**
 * Replace the DACL with one full-control ACE for `sid`, then verify it — unless
 * the DACL already is exactly that.
 *
 * `SetAccessRuleProtection($true,$false)` removes inheritance and inherited
 * entries; the loop removes every remaining explicit entry (including
 * administrators and SYSTEM). The verification exits non-zero unless the path
 * ends with exactly one protected allow ACE for the current-user SID.
 *
 * A standard (non-elevated) user cannot apply `Set-Acl` to a DACL that is
 * already protected: the call requires SeSecurityPrivilege and fails with
 * `PrivilegeNotHeldException`. The script therefore exits 0 before any mutation
 * when the DACL already equals the exact required current-user-only state, so
 * repeated startup protection is a read-only no-op. Anything weaker falls
 * through to the full replacement and must pass the post-mutation verification
 * (fail closed).
 */
function protectScript(path: string, sid: string, kind: "dir" | "file"): string {
  const inheritance = kind === "dir" ? "ContainerInherit,ObjectInherit" : "None";
  // InheritanceFlags compared as an integer mask: None = 0,
  // ContainerInherit|ObjectInherit = 1|2 = 3.
  const inheritanceMask = kind === "dir" ? 3 : 0;
  return [
    "$ErrorActionPreference='Stop';",
    `$p=${psQuote(path)};$sid=${psQuote(sid)};`,
    // The FileSystemAccessRule constructor overloads that take a string treat it
    // as an NTAccount name; a SID string must first become a SecurityIdentifier.
    "$sidObj=New-Object System.Security.Principal.SecurityIdentifier($sid);",
    "$acl=Get-Acl -LiteralPath $p;",
    // Idempotence gate: only the exact required DACL skips the mutation below.
    // An inherited entry, or an InheritOnly entry (PropagationFlags), for the
    // same SID is not exact and must fall through to the replacement path.
    `$requiredInheritance=${inheritanceMask};`,
    "$alreadyExact=$false;",
    "if($acl.AreAccessRulesProtected -and $acl.Access.Count -eq 1){$r=$acl.Access[0];if($r.AccessControlType -eq 'Allow' -and $r.FileSystemRights.ToString().Contains('FullControl') -and [int]$r.InheritanceFlags -eq $requiredInheritance -and [int]$r.PropagationFlags -eq 0 -and $r.IsInherited -eq $false){try{$alreadyExact=($r.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -eq $sid)}catch{$alreadyExact=$false}}};",
    "if($alreadyExact -eq $true){exit 0};",
    "$acl.SetAccessRuleProtection($true,$false);",
    "foreach($r in @($acl.Access)){$null=$acl.RemoveAccessRule($r)};",
    `$acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sidObj,'FullControl','${inheritance}','None','Allow')));`,
    "Set-Acl -LiteralPath $p -AclObject $acl;",
    "$check=Get-Acl -LiteralPath $p;",
    "if($check.Access.Count -ne 1){exit 3};",
    "if($check.AreAccessRulesProtected -ne $true){exit 4};",
    "if($check.Access[0].IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -ne $sid){exit 5};",
    "if($check.Access[0].AccessControlType -ne 'Allow'){exit 6};",
    "if(-not $check.Access[0].FileSystemRights.ToString().Contains('FullControl')){exit 7};",
  ].join("");
}

function protect(path: string, kind: "dir" | "file", run: CommandRunner): void {
  const sid = currentUserSid(run);
  const encoded = Buffer.from(protectScript(path, sid, kind), "utf16le").toString("base64");
  const result = run(POWERSHELL, ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded]);
  if (result.status !== 0) {
    throw new WindowsSecurityError(
      "protect",
      path,
      result.status,
      `could not protect ${path} with a current-user-only ACL (powershell exit ${result.status})`,
    );
  }
}

/**
 * Windows private-path protection. Directory ACEs are inheritable, so future
 * children stay current-user-only; files are protected directly. Tests inject a
 * fake runner so the real home is never touched.
 */
export const windowsSecurity = {
  protectHome: (home: string, run: CommandRunner = defaultRunner): void => protect(home, "dir", run),
  protectLogs: (home: string, run: CommandRunner = defaultRunner): void => protect(join(home, "logs"), "dir", run),
  protectFile: (path: string, run: CommandRunner = defaultRunner): void => protect(path, "file", run),
} satisfies PrivatePaths;
