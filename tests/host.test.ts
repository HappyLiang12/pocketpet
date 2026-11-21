import { describe, expect, it } from "vitest";
import { bridgeVersion, hostInfo } from "../src/host.js";

describe("host info", () => {
  it("reports a non-empty bridge version", () => {
    expect(bridgeVersion()).toMatch(/^\d+\.\d+\.\d+|^dev$/);
  });

  it("reports a known OS label and version", () => {
    const value = hostInfo();
    expect(["macOS", "Windows", "Linux"]).toContain(value.os);
    expect(value.osVersion.length).toBeGreaterThan(0);
    expect(value.bridgeVersion).toBe(bridgeVersion());
  });
});
