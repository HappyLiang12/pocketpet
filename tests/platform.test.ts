import { describe, expect, it } from "vitest";
import { platformFor } from "../src/platform/index.js";

describe("platform selection", () => {
  it("selects Darwin adapters and preserves the service contract", () => {
    const platform = platformFor("darwin");
    expect(typeof platform.service.install).toBe("function");
    expect(typeof platform.host.localHostname).toBe("function");
    expect(typeof platform.security.protectFile).toBe("function");
  });

  it("does not claim .local or a service on unsupported platforms", async () => {
    const platform = platformFor("linux");
    expect(platform.host.localHostname()).toBeNull();
    await expect(platform.service.status({ home: "/tmp/pocketpet-test", nodePath: process.execPath, cliPath: "/tmp/cli.js", port: 7788 }))
      .rejects.toThrow(/not supported/i);
  });
});
