import { describe, expect, it } from "vitest";
import { isQuiet } from "../web/src/quiet.js";

const at = (hour: number, minute = 0) => new Date(2026, 10, 21, hour, minute);

describe("isQuiet", () => {
  it("handles daytime ranges", () => {
    expect(isQuiet({ start: "09:00", end: "17:00" }, at(10))).toBe(true);
    expect(isQuiet({ start: "09:00", end: "17:00" }, at(18))).toBe(false);
  });
  it("handles overnight ranges", () => {
    expect(isQuiet({ start: "23:00", end: "07:00" }, at(2))).toBe(true);
    expect(isQuiet({ start: "23:00", end: "07:00" }, at(12))).toBe(false);
  });
  it("returns false without a range", () => {
    expect(isQuiet(null, at(2))).toBe(false);
  });
});
