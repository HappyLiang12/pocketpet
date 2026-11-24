import { win32 } from "node:path";

export const POWERSHELL = "powershell.exe";

/**
 * A PowerShell 7 parent (for example Qoder or GitHub Actions pwsh) exports a
 * PSModulePath containing PowerShell 7 modules. Windows PowerShell 5.1 then
 * fails to autoload its own built-in modules such as Microsoft.PowerShell.Security
 * (Get-Acl/Set-Acl) and ScheduledTasks. Give every powershell.exe child the
 * 5.1 built-in module path instead of inheriting the incompatible one.
 */
export function powershellEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const root = env.SystemRoot?.trim() || "C:\\Windows";
  return {
    ...env,
    PSModulePath: win32.join(root, "System32", "WindowsPowerShell", "v1.0", "Modules"),
  };
}
