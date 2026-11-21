import { describe, expect, it } from "vitest";
import { Aggregator } from "../src/aggregator.js";
import type { NormalizedEvent } from "../src/events.js";

function ev(phase: NormalizedEvent["phase"], sessionId = "s1", ts = 0): NormalizedEvent {
  return { v: 1, agent: "claude", sessionId, project: "demo", phase, ts };
}
const extra = { sleepAfterMinutes: 10, quietHours: null };

describe("Aggregator", () => {
  it("waits while any session waits", () => {
    let now = 1000;
    const agg = new Aggregator({ now: () => now });
    agg.apply(ev("working", "s1"));
    agg.apply(ev("waiting", "s2"));
    expect(agg.petState()).toBe("waiting");
  });

  it("flashes failed then reverts", () => {
    let now = 1000;
    const agg = new Aggregator({ now: () => now, flashMs: 2500 });
    agg.apply(ev("working", "s1"));
    agg.apply(ev("failed", "s2"));
    expect(agg.petState()).toBe("failed");
    now += 3000;
    expect(agg.petState()).toBe("running");
  });

  it("prefers waiting over a failed flash", () => {
    const agg = new Aggregator({ now: () => 1000 });
    agg.apply(ev("waiting", "s1"));
    agg.apply(ev("failed", "s2"));
    expect(agg.petState()).toBe("waiting");
  });

  it("flashes jumping on done", () => {
    const agg = new Aggregator({ now: () => 1000 });
    agg.apply(ev("done", "s1"));
    expect(agg.petState()).toBe("jumping");
  });

  it("flashes waving on started", () => {
    const agg = new Aggregator({ now: () => 1000 });
    agg.apply(ev("started", "s1"));
    expect(agg.petState()).toBe("waving");
  });

  it("returns review when only review sessions remain", () => {
    const agg = new Aggregator({ now: () => 1000 });
    agg.apply(ev("review", "s1"));
    expect(agg.petState()).toBe("review");
  });

  it("removes idle sessions and expired sessions", () => {
    let now = 1000;
    const agg = new Aggregator({ now: () => now, ttlMs: 1000 });
    agg.apply(ev("working", "s1"));
    agg.apply(ev("idle", "s1"));
    expect(agg.snapshot(null, extra).sessions).toHaveLength(0);
    agg.apply(ev("working", "s2"));
    now += 2000;
    expect(agg.snapshot(null, extra).sessions).toHaveLength(0);
  });

  it("sorts waiting sessions first and carries extra fields", () => {
    const agg = new Aggregator({ now: () => 1000 });
    agg.apply(ev("working", "s1"));
    agg.apply(ev("waiting", "s2"));
    const snap = agg.snapshot("local:boba", extra);
    expect(snap.type).toBe("snapshot");
    expect(snap.sessions[0]?.sessionId).toBe("s2");
    expect(snap.activePet).toBe("local:boba");
    expect(snap.sleepAfterMinutes).toBe(10);
  });
});
