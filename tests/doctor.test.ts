import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureConfig } from "../src/config.js";
import { CLAUDE_HOOK_EVENTS } from "../src/adapters/claudeInstall.js";
import { QODER_HOOK_EVENTS } from "../src/adapters/qoderInstall.js";
import { doctorChecks } from "../src/doctor.js";

let home = "";
afterEach(() => { if (home) rmSync(home, { recursive: true, force: true }); });

const QODER_COMMAND = "'/usr/local/bin/node' '/app/dist/cli.js' hook qoder";

function qoderPath(): string {
  return join(home, ".qoder", "settings.json");
}

function writeQoderSettings(settings: unknown): string {
  mkdirSync(join(home, ".qoder"), { recursive: true });
  const file = qoderPath();
  writeFileSync(file, JSON.stringify(settings));
  return file;
}

function allQoderEvents(): Record<string, unknown> {
  return Object.fromEntries(
    QODER_HOOK_EVENTS.map((event) => [event, [{ hooks: [{ type: "command", command: QODER_COMMAND }] }]]),
  );
}

describe("doctorChecks", () => {
  it("fails config and hooks when missing", async () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const checks = await doctorChecks({
      home,
      settingsPath: join(home, "settings.json"),
      qoderSettingsPaths: [qoderPath()],
      localPetDirs: [join(home, "pets")],
      probePort: async () => false,
    });
    expect(checks.find((c) => c.name === "config")?.status).toBe("FAIL");
    expect(checks.find((c) => c.name === "claude hooks")?.status).toBe("FAIL");
    expect(checks.find((c) => c.name === "qoder hooks")?.status).toBe("WARN");
    expect(checks.find((c) => c.name === "qoder hooks")?.detail).toContain("not detected");
    expect(checks.find((c) => c.name === "pets")?.status).toBe("WARN");
    expect(checks.find((c) => c.name === "bridge")?.status).toBe("WARN");
  });

  it("passes when config and all hooks exist", async () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    ensureConfig(home);
    const settingsPath = join(home, "settings.json");
    writeFileSync(settingsPath, JSON.stringify({ hooks: Object.fromEntries(CLAUDE_HOOK_EVENTS.map((event) => [event, [{ hooks: [{ type: "command", command: "pocketpet hook claude" }] }]])) }));
    const checks = await doctorChecks({
      home,
      settingsPath,
      qoderSettingsPaths: [qoderPath()],
      localPetDirs: [join(home, "pets")],
      probePort: async () => true,
    });
    expect(checks.find((c) => c.name === "claude hooks")?.status).toBe("PASS");
    expect(checks.find((c) => c.name === "qoder hooks")?.status).toBe("WARN");
    expect(checks.find((c) => c.name === "config")?.status).toBe("PASS");
    expect(checks.find((c) => c.name === "bridge")?.status).toBe("PASS");
  });
});

describe("doctorChecks Qoder hooks", () => {
  it("passes and lists the root when every event is wired", async () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    writeQoderSettings({ hooks: allQoderEvents() });
    const checks = await doctorChecks({
      home,
      settingsPath: join(home, "settings.json"),
      qoderSettingsPaths: [qoderPath(), join(home, ".qoder-cn", "settings.json")],
      localPetDirs: [join(home, "pets")],
      probePort: async () => false,
    });
    const check = checks.find((c) => c.name === "qoder hooks");
    expect(check?.status).toBe("PASS");
    expect(check?.detail).toContain(join(home, ".qoder"));
    expect(check?.detail).not.toContain(".qoder-cn");
  });

  it("fails and lists the missing events", async () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    writeQoderSettings({ hooks: { Stop: [{ hooks: [{ type: "command", command: QODER_COMMAND }] }] } });
    const checks = await doctorChecks({
      home,
      settingsPath: join(home, "settings.json"),
      qoderSettingsPaths: [qoderPath()],
      localPetDirs: [join(home, "pets")],
      probePort: async () => false,
    });
    const check = checks.find((c) => c.name === "qoder hooks");
    expect(check?.status).toBe("FAIL");
    expect(check?.detail).toContain(join(home, ".qoder"));
    expect(check?.detail).toContain("missing");
    expect(check?.detail).toContain("SessionStart");
    expect(check?.detail).not.toContain("missing Stop,");
  });

  it("fails on invalid Qoder settings JSON without printing contents", async () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    mkdirSync(join(home, ".qoder"), { recursive: true });
    writeFileSync(qoderPath(), '{ "token": "SECRET_TOKEN_VALUE" ');
    const checks = await doctorChecks({
      home,
      settingsPath: join(home, "settings.json"),
      qoderSettingsPaths: [qoderPath()],
      localPetDirs: [join(home, "pets")],
      probePort: async () => false,
    });
    const check = checks.find((c) => c.name === "qoder hooks");
    expect(check?.status).toBe("FAIL");
    expect(check?.detail).toContain("invalid settings JSON");
    expect(check?.detail).not.toContain("SECRET_TOKEN_VALUE");
  });
});
