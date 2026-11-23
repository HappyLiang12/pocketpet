import { describe, expect, it } from "vitest";
import { platformFor } from "../src/platform/index.js";

describe("platform selection", () => {
  it("selects Darwin adapters and preserves the service contract", () => {
    const platform = platformFor("darwin");
    expect(platform.service.label).toBe("dev.pocketpet.bridge");
    expect(typeof platform.service.install).toBe("function");
    expect(typeof platform.host.localHostname).toBe("function");
    expect(typeof platform.security.protectFile).toBe("function");
  });

  it("does not claim .local or a service on unsupported platforms", async () => {
    const platform = platformFor("linux");
    expect(platform.service.label).toBe("PocketPet bridge");
    expect(platform.host.localHostname()).toBeNull();
    await expect(platform.service.status({ home: "/tmp/pocketpet-test", nodePath: process.execPath, cliPath: "/tmp/cli.js", port: 7788 }))
      .rejects.toThrow(/not supported/i);
  });

  it("selects the Windows bundle with the Task Scheduler service label", () => {
    const platform = platformFor("win32");
    expect(platform.service.label).toBe("PocketPet Bridge");
    expect(typeof platform.service.install).toBe("function");
    expect(typeof platform.service.uninstall).toBe("function");
    expect(typeof platform.service.status).toBe("function");
    // Task 6 replaces the hostname stub; mDNS is not claimed yet.
    expect(platform.host.localHostname()).toBeNull();
  });
});
