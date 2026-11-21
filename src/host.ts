import { readFileSync } from "node:fs";
import { platform, release } from "node:os";

export type HostInfo = {
  os: "macOS" | "Windows" | "Linux" | string;
  osVersion: string;
  bridgeVersion: string;
};

let cachedVersion: string | null = null;

export function bridgeVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    const raw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    cachedVersion = typeof parsed.version === "string" && parsed.version.trim() ? parsed.version.trim() : "dev";
  } catch {
    cachedVersion = "dev";
  }
  return cachedVersion;
}

export function hostInfo(): HostInfo {
  const os = platform() === "darwin" ? "macOS" : platform() === "win32" ? "Windows" : platform() === "linux" ? "Linux" : platform();
  return { os, osVersion: release(), bridgeVersion: bridgeVersion() };
}
