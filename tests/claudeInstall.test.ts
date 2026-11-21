import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CLAUDE_HOOK_EVENTS, installClaudeHooks } from "../src/adapters/claudeInstall.js";

let dir = "";
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe("installClaudeHooks", () => {
  it("adds hooks while preserving existing config and is idempotent", () => {
    dir = mkdtempSync(join(tmpdir(), "foldpet-"));
    const file = join(dir, "settings.json");
    writeFileSync(file, JSON.stringify({ model: "opus", hooks: { Stop: [{ hooks: [{ type: "command", command: "other-tool" }] }] } }));
    const first = installClaudeHooks(file);
    expect(first.added).toEqual([...CLAUDE_HOOK_EVENTS]);
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    expect(parsed.model).toBe("opus");
    expect(parsed.hooks.Stop).toHaveLength(2);
    const second = installClaudeHooks(file);
    expect(second.added).toEqual([]);
    expect(second.already).toEqual([...CLAUDE_HOOK_EVENTS]);
  });

  it("creates the file when missing", () => {
    dir = mkdtempSync(join(tmpdir(), "foldpet-"));
    const file = join(dir, "settings.json");
    expect(installClaudeHooks(file).added).toEqual([...CLAUDE_HOOK_EVENTS]);
  });

  it("rejects invalid JSON", () => {
    dir = mkdtempSync(join(tmpdir(), "foldpet-"));
    const file = join(dir, "settings.json");
    writeFileSync(file, "{oops");
    expect(() => installClaudeHooks(file)).toThrow(/invalid Claude settings/);
  });

  it("does not duplicate a custom command and preserves entry details", () => {
    dir = mkdtempSync(join(tmpdir(), "foldpet-"));
    const file = join(dir, "settings.json");
    writeFileSync(file, JSON.stringify({ hooks: { Notification: [{ matcher: "", hooks: [{ type: "command", command: "custom-pet hook claude" }] }] } }));
    const first = installClaudeHooks(file, "custom-pet hook claude");
    expect(first.added).toEqual([...CLAUDE_HOOK_EVENTS].filter((event) => event !== "Notification"));
    expect(first.already).toEqual(["Notification"]);
    const second = installClaudeHooks(file, "custom-pet hook claude");
    expect(second.added).toEqual([]);
    expect(second.already).toEqual([...CLAUDE_HOOK_EVENTS]);
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    expect(parsed.hooks.Notification).toHaveLength(1);
    expect(parsed.hooks.Notification[0].matcher).toBe("");
  });

  it("repairs missing and empty event arrays", () => {
    dir = mkdtempSync(join(tmpdir(), "foldpet-"));
    const file = join(dir, "settings.json");
    writeFileSync(file, JSON.stringify({ hooks: { Stop: [], UserPromptSubmit: null } }));
    const result = installClaudeHooks(file);
    expect(result.added).toEqual([...CLAUDE_HOOK_EVENTS]);
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    expect(parsed.hooks.Stop).toHaveLength(1);
    expect(parsed.hooks.UserPromptSubmit).toHaveLength(1);
  });

  it("rejects non-object settings", () => {
    dir = mkdtempSync(join(tmpdir(), "foldpet-"));
    const file = join(dir, "settings.json");
    writeFileSync(file, "null");
    expect(() => installClaudeHooks(file)).toThrow(/invalid Claude settings/);
  });

  it("leaves the file untouched when every hook is already installed", async () => {
    dir = mkdtempSync(join(tmpdir(), "foldpet-"));
    const file = join(dir, "settings.json");
    installClaudeHooks(file);
    const content = readFileSync(file, "utf8");
    const mtime = statSync(file).mtimeMs;
    expect(existsSync(`${file}.tmp`)).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(installClaudeHooks(file).added).toEqual([]);
    expect(readFileSync(file, "utf8")).toBe(content);
    expect(statSync(file).mtimeMs).toBe(mtime);
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });
});
