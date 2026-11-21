import { describe, expect, it } from "vitest";
import { parseEvent } from "../src/events.js";

const valid = { v: 1, agent: "claude", sessionId: "s1", project: "demo", phase: "working", tool: "Edit", ts: 1000 };

describe("parseEvent", () => {
  it("accepts a valid event", () => expect(parseEvent(valid)).toEqual(valid));
  it("drops unknown fields", () => expect(parseEvent({ ...valid, secret: "x" })).toEqual(valid));
  it("rejects wrong version", () => expect(parseEvent({ ...valid, v: 2 })).toBeNull());
  it("rejects unknown agent", () => expect(parseEvent({ ...valid, agent: "vim" })).toBeNull());
  it("rejects unknown phase", () => expect(parseEvent({ ...valid, phase: "thinking" })).toBeNull());
  it("rejects empty session", () => expect(parseEvent({ ...valid, sessionId: " " })).toBeNull());
  it("rejects non-finite ts", () => expect(parseEvent({ ...valid, ts: Number.NaN })).toBeNull());
});
