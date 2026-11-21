import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../src/cli.js";
import { configPath, ensureConfig, saveConfig } from "../src/config.js";

let home = "";
let claudeDir = "";
let savedHome: string | undefined;
let savedClaudeConfigDir: string | undefined;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "foldpet-cli-"));
  claudeDir = mkdtempSync(join(tmpdir(), "foldpet-claude-"));
  savedHome = process.env.FOLDPET_HOME;
  savedClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
  process.env.FOLDPET_HOME = home;
  process.env.CLAUDE_CONFIG_DIR = claudeDir;
});

afterEach(() => {
  if (savedHome === undefined) delete process.env.FOLDPET_HOME;
  else process.env.FOLDPET_HOME = savedHome;
  if (savedClaudeConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedClaudeConfigDir;
  rmSync(home, { recursive: true, force: true });
  rmSync(claudeDir, { recursive: true, force: true });
});

async function runMain(argv: string[]): Promise<{ code: number; output: string }> {
  const lines: string[] = [];
  const record = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  const log = vi.spyOn(console, "log").mockImplementation(record);
  const error = vi.spyOn(console, "error").mockImplementation(record);
  try {
    const code = await main(argv);
    return { code, output: lines.join("\n") };
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
}

type SpawnedCli = { code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string };

/**
 * Spawns the real CLI and waits until `until` shows up on stdout (or the
 * child exits), then terminates it. The bridge runs until killed, so every
 * smoke ends with an explicit signal.
 */
async function spawnCli(
  args: string[],
  until: RegExp,
  env: Record<string, string> = {},
  timeoutMs = 20_000,
): Promise<SpawnedCli> {
  const child = spawn(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, FOLDPET_HOME: home, CLAUDE_CONFIG_DIR: claudeDir, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
  child.stderr?.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.on("close", (code, signal) => resolve({ code, signal }));
  });
  const deadline = Date.now() + timeoutMs;
  let matched = false;
  while (Date.now() < deadline) {
    if (until.test(stdout)) {
      matched = true;
      break;
    }
    if (child.exitCode !== null || child.signalCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  child.kill(matched ? "SIGTERM" : "SIGKILL");
  const { code, signal } = await closed;
  return { code, signal, stdout, stderr };
}

function writeConfig(port: number): string {
  const token = randomBytes(18).toString("base64url");
  writeFileSync(
    configPath(home),
    JSON.stringify({ token, port, activePet: null, sleepAfterMinutes: 10, quietHours: null }, null, 2),
  );
  return token;
}

describe("fold-pet up and forgiving run", () => {
  it("starts the foreground bridge and prints pairing URLs plus the three steps", async () => {
    writeConfig(0);

    const result = await spawnCli(["up", "--no-hooks", "--no-service", "--no-open"], /Ctrl\+C to stop/);

    expect(result.stdout).toContain(`Config: ${configPath(home)}`);
    expect(result.stdout).toMatch(/http:\/\/[^\s]+\?token=/);
    expect(result.stdout).toContain("同一個 Wi-Fi");
    expect(result.stdout).toContain("用相機掃描");
    expect(result.stdout).toContain("加到主畫面");
    expect(existsSync(configPath(home))).toBe(true);
  }, 30_000);

  it("run auto-creates a missing config on an ephemeral port and hints that hooks need init", async () => {
    const result = await spawnCli(["run"], /Ctrl\+C to stop/, { FOLDPET_PORT: "0" });

    expect(result.stdout).toContain(`Created config: ${configPath(home)}`);
    expect(result.stdout).toContain("fold-pet init");
    expect(result.stdout).toMatch(/http:\/\/[^\s]+\?token=/);
    expect(result.stdout).toContain("Ctrl+C to stop");
    expect(existsSync(configPath(home))).toBe(true);
    expect(JSON.parse(readFileSync(configPath(home), "utf8")).port).toBe(0);
    expect(result.signal ?? result.code).not.toBeNull();
  }, 30_000);

  it("run --service prints only the listening line and no tokenized URLs", async () => {
    writeConfig(0);

    const result = await spawnCli(["run", "--service"], /FoldPet bridge listening on port \d+/);

    expect(result.stdout).toMatch(/FoldPet bridge listening on port \d+/);
    expect(result.stdout).not.toContain("token=");
    expect(result.stdout).not.toContain("http://");
  }, 30_000);
});

describe("fold-pet cli usage", () => {
  it("service with an unknown action prints usage and exits 2", async () => {
    const { code, output } = await runMain(["service", "bogus"]);

    expect(code).toBe(2);
    expect(output).toContain("usage: fold-pet service");
  });

  it("up rejects an unknown flag with usage and exit 2", async () => {
    const { code, output } = await runMain(["up", "--bogus"]);

    expect(code).toBe(2);
    expect(output).toContain("usage: fold-pet up");
  });
});

describe("fold-pet cli error handling", () => {
  it("init fails without printing malformed config contents", async () => {
    writeFileSync(configPath(home), '{\n  "token": "SECRET_TOKEN_VALUE",\n  "port": 7788,\n');

    const { code, output } = await runMain(["init"]);

    expect(code).toBe(1);
    expect(output).toContain("config unreadable");
    expect(output).toContain(configPath(home));
    expect(output).toMatch(/fix or delete/i);
    expect(output).not.toContain("SECRET_TOKEN_VALUE");
    expect(output).not.toMatch(/SECRET|TOKEN_VALUE/);
    expect(output).not.toContain('"token"');
    expect(existsSync(join(claudeDir, "settings.json"))).toBe(false);
  });

  it("run never surfaces a raw thrown error", async () => {
    const config = ensureConfig(home);
    const blocked = createServer();
    await new Promise<void>((resolve) => blocked.listen(0, "0.0.0.0", resolve));
    try {
      const address = blocked.address();
      if (typeof address !== "object" || !address) throw new Error("failed to reserve a port");
      saveConfig(home, { ...config, port: address.port });

      const { code, output } = await runMain(["run"]);

      expect(code).toBe(1);
      expect(output).toContain("fold-pet: run failed");
      expect(output).not.toContain("EADDRINUSE");
      expect(output).not.toContain(config.token);
    } finally {
      await new Promise<void>((resolve) => blocked.close(() => resolve()));
    }
  });
});
