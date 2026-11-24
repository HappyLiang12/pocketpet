import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, win32 } from "node:path";
import type { PrivatePaths, ServiceConfig } from "../types.js";
import { windowsLauncherBytes } from "./builders.js";
import { windowsSecurity } from "./security.js";

/** Per-user Startup entry; a shortcut-free VBS that runs the hidden launcher. */
export const PORTABLE_ENTRY_FILE = "PocketPet Portable.vbs";
export const PORTABLE_LAUNCHER_FILE = "bridge-portable.ps1";

export type PortableStartupPaths = {
  launcher: string;
  entry: string;
};

export type PortableStartupDeps = {
  startupDir?: string;
  protectLogs?: PrivatePaths["protectLogs"];
  protectFile?: PrivatePaths["protectFile"];
};

/** `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`. */
export function defaultPortableStartupDir(env: NodeJS.ProcessEnv = process.env): string {
  const appData = env.APPDATA?.trim();
  if (!appData) {
    throw new Error("cannot find APPDATA for the per-user Startup folder");
  }
  return win32.join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
}

export function portableStartupPaths(home: string, startupDir: string): PortableStartupPaths {
  return {
    launcher: join(home, PORTABLE_LAUNCHER_FILE),
    entry: join(startupDir, PORTABLE_ENTRY_FILE),
  };
}

function vbsQuote(value: string): string {
  return value.replace(/"/g, '""');
}

/** UTF-16LE with BOM so WSH reads Unicode paths correctly. Contains no token. */
export function portableStartupEntryBytes(launcherPath: string): Buffer {
  const command = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "${launcherPath}"`;
  const script = [
    'Set shell = CreateObject("WScript.Shell")',
    `shell.Run "${vbsQuote(command)}", 0, False`,
    "",
  ].join("\r\n");
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(script, "utf16le")]);
}

function assertPortableConfig(cfg: ServiceConfig): void {
  if (cfg.cliPath.endsWith(".ts") || !existsSync(cfg.cliPath)) {
    throw new Error(`refusing to install portable startup from ${cfg.cliPath}: build and run the compiled CLI (dist/cli.js)`);
  }
  if (!existsSync(cfg.nodePath)) {
    throw new Error("refusing to install portable startup: the Node executable was not found; reinstall Node and retry");
  }
}

/**
 * Install a per-user Startup entry without elevation. The launcher is protected
 * like the service launcher; the Startup entry is token-free and runs hidden.
 */
export function installPortableStartup(cfg: ServiceConfig, deps: PortableStartupDeps = {}): void {
  assertPortableConfig(cfg);
  const startupDir = deps.startupDir ?? defaultPortableStartupDir();
  const paths = portableStartupPaths(cfg.home, startupDir);
  const protectLogs = deps.protectLogs ?? ((home: string) => windowsSecurity.protectLogs(home));
  const protectFile = deps.protectFile ?? ((path: string) => windowsSecurity.protectFile(path));

  mkdirSync(join(cfg.home, "logs"), { recursive: true, mode: 0o700 });
  protectLogs(cfg.home);
  mkdirSync(startupDir, { recursive: true });

  let createdLauncher = false;
  try {
    writeFileSync(paths.launcher, windowsLauncherBytes(cfg), { mode: 0o600 });
    createdLauncher = true;
    protectFile(paths.launcher);
    writeFileSync(paths.entry, portableStartupEntryBytes(paths.launcher), { mode: 0o600 });
  } catch (error) {
    if (createdLauncher) rmSync(paths.launcher, { force: true });
    throw error;
  }
}

export type PortableStartupStatus = {
  installed: boolean;
  launcher: boolean;
  entry: boolean;
};

export function portableStartupStatus(cfg: ServiceConfig, deps: Pick<PortableStartupDeps, "startupDir"> = {}): PortableStartupStatus {
  const startupDir = deps.startupDir ?? defaultPortableStartupDir();
  const paths = portableStartupPaths(cfg.home, startupDir);
  const launcher = existsSync(paths.launcher);
  const entry = existsSync(paths.entry);
  return { installed: launcher && entry, launcher, entry };
}

export function uninstallPortableStartup(cfg: ServiceConfig, deps: Pick<PortableStartupDeps, "startupDir"> = {}): void {
  const startupDir = deps.startupDir ?? defaultPortableStartupDir();
  const paths = portableStartupPaths(cfg.home, startupDir);
  rmSync(paths.entry, { force: true });
  rmSync(paths.launcher, { force: true });
}
