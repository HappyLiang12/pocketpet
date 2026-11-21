import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPEARANCE,
  DEFAULT_LOCAL_LOOK,
  diffAppearance,
  mergeAppearance,
  normalizeAppearance,
  normalizeLocalLook,
  resolveLook,
} from "../src/appearance.js";

describe("normalizeAppearance", () => {
  it("returns the v1 defaults for null and malformed input", () => {
    expect(normalizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance({ layout: { mode: "wat", gap: "nope" }, clock: { x: -4 } })).toMatchObject({
      v: 1,
      layout: { mode: "stack", gap: 16 },
      clock: { x: 0, y: 36, scale: 100, format: "24h" },
    });
  });

  it("clamps every numeric range and rounds integers", () => {
    const value = normalizeAppearance({
      layout: { mode: "free", gap: 999 },
      stage: { padding: 0 },
      clock: { x: 101, y: -1, scale: 10, format: "12h" },
      pet: { x: 0, y: 100, scale: 999 },
      theme: "dark",
      motion: "reduced",
      sessions: { density: "compact", maxVisible: 99, showProject: false, showTool: false, showElapsed: false },
    });
    expect(value).toMatchObject({
      layout: { mode: "free", gap: 48 },
      stage: { padding: 8 },
      clock: { x: 100, y: 0, scale: 60, format: "12h" },
      pet: { x: 0, y: 100, scale: 200 },
      theme: "dark",
      motion: "reduced",
      sessions: { density: "compact", maxVisible: 6, showProject: false, showTool: false, showElapsed: false },
    });
  });

  it("does not mutate its input", () => {
    const input = structuredClone(DEFAULT_APPEARANCE);
    const output = normalizeAppearance(input);
    output.layout.gap = 48;
    expect(input.layout.gap).toBe(16);
  });
});

describe("local look resolution", () => {
  const host = normalizeAppearance({
    ...DEFAULT_APPEARANCE,
    layout: { mode: "stack", gap: 24 },
    clock: { ...DEFAULT_APPEARANCE.clock, scale: 120 },
  });

  it("follows host values by default", () => {
    const local = normalizeLocalLook({ followHost: true, overrides: { pet: { scale: 200 } } });
    expect(resolveLook(host, local)).toEqual({ appearance: host, followHost: true });
  });

  it("applies only valid sparse overrides", () => {
    const local = normalizeLocalLook({
      followHost: false,
      overrides: { clock: { scale: 80, x: 20 }, theme: "light", sessions: { maxVisible: 2 } },
      petId: "local:boba",
    });
    const resolved = resolveLook(host, local);
    expect(resolved.followHost).toBe(false);
    expect(resolved.appearance.clock).toMatchObject({ scale: 80, x: 20, y: host.clock.y });
    expect(resolved.appearance.layout.gap).toBe(24);
    expect(resolved.appearance.theme).toBe("light");
    expect(resolved.appearance.sessions.maxVisible).toBe(2);
    expect(resolved.appearance.sessions.density).toBe(host.sessions.density);
    expect(local.petId).toBe("local:boba");
  });

  it("ignores malformed override fields", () => {
    const local = normalizeLocalLook({ followHost: false, overrides: { pet: { scale: "huge" }, theme: "neon" } });
    expect(local.overrides).toEqual({});
    expect(resolveLook(host, local).appearance).toEqual(host);
  });

  it("defaults to followHost true for malformed local state", () => {
    expect(normalizeLocalLook({ followHost: "no", overrides: null, petId: 4 })).toEqual(DEFAULT_LOCAL_LOOK);
  });

  it("produces a sparse diff for only changed values", () => {
    const draft = {
      ...host,
      clock: { ...host.clock, scale: 90 },
      sessions: { ...host.sessions, showTool: false },
    };
    expect(diffAppearance(host, draft)).toEqual({
      clock: { scale: 90 },
      sessions: { showTool: false },
    });
  });

  it("returns an empty diff for equal values", () => {
    expect(diffAppearance(host, normalizeAppearance(host))).toEqual({});
  });

  it("merges a diff back to the draft", () => {
    const draft = {
      ...host,
      layout: { ...host.layout, mode: "free" as const, gap: 32 },
      pet: { ...host.pet, x: 12, y: 88, scale: 140 },
    };
    expect(mergeAppearance(host, diffAppearance(host, draft))).toEqual(draft);
  });
});
