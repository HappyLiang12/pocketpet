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

  it("passes when config and all hooks exist on macOS", async () => {
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
      platformName: "darwin",
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
      platformName: "darwin",
    });
    const check = checks.find((c) => c.name === "qoder hooks");
    expect(check?.status).toBe("PASS");
    expect(check?.detail).toContain(join(home, ".qoder"));
    expect(check?.detail).not.toContain(".qoder-cn");
    // Wiring only: the real Qoder app has never been observed running the hook.
    expect(check?.detail).toContain("wired");
    expect(check?.detail).toContain("real-app gate NOT RUN");
    expect(check?.detail).not.toContain("observed");
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
      platformName: "darwin",
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
      platformName: "darwin",
    });
    const check = checks.find((c) => c.name === "qoder hooks");
    expect(check?.status).toBe("FAIL");
    expect(check?.detail).toContain("invalid settings JSON");
    expect(check?.detail).not.toContain("SECRET_TOKEN_VALUE");
  });
});

describe("doctorChecks Windows hook forms", () => {
  const WINDOWS_NODE = '"C:\\Program Files\\nodejs\\node.exe"';
  const WINDOWS_CLI = '"C:\\Program Files\\PocketPet\\dist\\cli.js"';
  const WINDOWS_CLAUDE = `${WINDOWS_NODE} ${WINDOWS_CLI} hook claude`;
  const WINDOWS_QODER = `${WINDOWS_NODE} ${WINDOWS_CLI} hook qoder`;

  const windowsProbes = {
    service: async () => ({ installed: false, running: false }),
    firewall: () => ({ level: "missing" as const, detail: "PocketPet firewall rules are missing" }),
    acl: () => ({ ok: true, detail: "current user only" }),
    localHostname: async () => null,
  };

  function writeClaude(command: string): string {
    const file = join(home, "settings.json");
    writeFileSync(file, JSON.stringify({
      hooks: Object.fromEntries(CLAUDE_HOOK_EVENTS.map((event) => [event, [{ hooks: [{ type: "command", command }] }]])),
    }));
    return file;
  }

  function writeQoder(command: string): void {
    writeQoderSettings({
      hooks: Object.fromEntries(QODER_HOOK_EVENTS.map((event) => [event, [{ hooks: [{ type: "command", command }] }]])),
    });
  }

  it("fails a bare Windows hook and passes the quoted absolute form", async () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const settingsPath = writeClaude("pocketpet hook claude");
    writeQoder("pocketpet hook qoder");

    const bare = await doctorChecks({
      home,
      settingsPath,
      qoderSettingsPaths: [qoderPath()],
      localPetDirs: [join(home, "pets")],
      probePort: async () => false,
      platformName: "win32",
      windows: windowsProbes,
    });
    expect(bare.find((c) => c.name === "claude hooks")?.status).toBe("FAIL");
    expect(bare.find((c) => c.name === "qoder hooks")?.status).toBe("FAIL");
    expect(bare.find((c) => c.name === "qoder hooks")?.detail).toContain("missing");

    writeClaude(WINDOWS_CLAUDE);
    writeQoder(WINDOWS_QODER);

    const quoted = await doctorChecks({
      home,
      settingsPath,
      qoderSettingsPaths: [qoderPath()],
      localPetDirs: [join(home, "pets")],
      probePort: async () => false,
      platformName: "win32",
      windows: windowsProbes,
    });
    expect(quoted.find((c) => c.name === "claude hooks")?.status).toBe("PASS");
    expect(quoted.find((c) => c.name === "qoder hooks")?.status).toBe("PASS");
    expect(quoted.find((c) => c.name === "qoder hooks")?.detail).toContain("real-app gate NOT RUN");
  });
});
