import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureConfig } from "../src/config.js";
import { CLAUDE_HOOK_EVENTS } from "../src/adapters/claudeInstall.js";
import { doctorChecks } from "../src/doctor.js";

let home = "";
afterEach(() => { if (home) rmSync(home, { recursive: true, force: true }); });

describe("doctorChecks", () => {
  it("fails config and hooks when missing", async () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    const checks = await doctorChecks({ home, settingsPath: join(home, "settings.json"), localPetDirs: [join(home, "pets")], probePort: async () => false });
    expect(checks.find((c) => c.name === "config")?.status).toBe("FAIL");
    expect(checks.find((c) => c.name === "claude hooks")?.status).toBe("FAIL");
    expect(checks.find((c) => c.name === "pets")?.status).toBe("WARN");
    expect(checks.find((c) => c.name === "bridge")?.status).toBe("WARN");
  });

  it("passes when config and all hooks exist", async () => {
    home = mkdtempSync(join(tmpdir(), "pocketpet-"));
    ensureConfig(home);
    const settingsPath = join(home, "settings.json");
    writeFileSync(settingsPath, JSON.stringify({ hooks: Object.fromEntries(CLAUDE_HOOK_EVENTS.map((event) => [event, [{ hooks: [{ type: "command", command: "pocketpet hook claude" }] }]])) }));
    const checks = await doctorChecks({ home, settingsPath, localPetDirs: [join(home, "pets")], probePort: async () => true });
    expect(checks.find((c) => c.name === "claude hooks")?.status).toBe("PASS");
    expect(checks.find((c) => c.name === "config")?.status).toBe("PASS");
    expect(checks.find((c) => c.name === "bridge")?.status).toBe("PASS");
  });
});
