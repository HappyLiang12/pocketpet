export type WindowsHookAgent = "claude" | "qoder";

/**
 * Absolute hook command for a Windows agent settings file. Both paths are
 * double-quoted so `C:\Program Files\...` survives agents that do not inherit
 * the shell PATH. A path containing `"` is rejected rather than silently
 * producing a command that cannot round-trip.
 */
export function windowsHookCommand(nodePath: string, cliPath: string, agent: WindowsHookAgent): string {
  const quote = (value: string): string => {
    if (value.includes('"')) throw new Error("path contains an unsupported quote");
    return `"${value}"`;
  };
  return `${quote(nodePath)} ${quote(cliPath)} hook ${agent}`;
}
