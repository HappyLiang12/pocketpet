import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
