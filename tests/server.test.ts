import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { ensureConfig } from "../src/config.js";
import { startBridge, type Bridge } from "../src/server.js";

let home = "";
let bridge: Bridge;
let cookie = "";

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "foldpet-"));
  const webDist = join(home, "web");
  mkdirSync(webDist, { recursive: true });
  writeFileSync(join(webDist, "index.html"), "<html>ok</html>");
  const config = ensureConfig(home);
  bridge = await startBridge({
    home, config, webDist, port: 0, localPetDirs: [join(home, "pets")],
    fetchImpl: async () => { throw new Error("offline"); },
  });
  const res = await fetch(`http://127.0.0.1:${bridge.port}/?token=${encodeURIComponent(config.token)}`);
  cookie = String(res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
});

afterEach(async () => { await bridge.close(); rmSync(home, { recursive: true, force: true }); });

const base = () => `http://127.0.0.1:${bridge.port}`;
const authed = () => ({ headers: { cookie } });

describe("bridge server", () => {
  it("rejects unauthenticated API calls", async () => {
    expect((await fetch(`${base()}/api/state`)).status).toBe(401);
  });

  it("serves the bootstrap page and sets a cookie", async () => {
    const res = await fetch(`${base()}/?token=${encodeURIComponent(bridge.config.token)}`);
    expect(res.status).toBe(200);
    expect(cookie.startsWith("foldpet_token=")).toBe(true);
  });

  it("accepts loopback events and reflects them in state", async () => {
    const event = { v: 1, agent: "claude", sessionId: "s1", project: "demo", phase: "working", tool: "Edit", ts: Date.now() };
    const res = await fetch(`${base()}/api/event`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event) });
    expect(res.status).toBe(204);
    const state = await (await fetch(`${base()}/api/state`, authed())).json();
    expect(state.pet).toBe("running");
    expect(state.sessions).toHaveLength(1);
  });

  it("rejects malformed events", async () => {
    expect((await fetch(`${base()}/api/event`, { method: "POST", body: "{}" })).status).toBe(400);
  });

  it("rejects unknown active pets", async () => {
    const res = await fetch(`${base()}/api/active-pet`, { method: "PUT", headers: { "content-type": "application/json", ...authed().headers }, body: JSON.stringify({ id: "local:nope" }) });
    expect(res.status).toBe(400);
  });

  it("streams snapshots over WebSocket and broadcasts updates", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/ws?token=${encodeURIComponent(bridge.config.token)}`);
    const messages: Array<Record<string, unknown>> = [];
    ws.on("message", (data) => messages.push(JSON.parse(String(data))));
    await new Promise<void>((resolve, reject) => { ws.once("open", () => resolve()); ws.once("error", reject); });
    await fetch(`${base()}/api/event`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ v: 1, agent: "claude", sessionId: "s9", project: "demo", phase: "waiting", ts: Date.now() }) });
    await new Promise((r) => setTimeout(r, 50));
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(messages.at(-1)).toMatchObject({ type: "snapshot", pet: "waiting" });
    ws.close();
  });

  it("rejects unauthenticated WebSocket upgrades", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/ws`);
    await new Promise<void>((resolve) => { ws.on("error", () => resolve()); ws.on("close", () => resolve()); });
    expect(ws.readyState).not.toBe(WebSocket.OPEN);
  });
});

describe("bridge server security", () => {
  it("serves loopback health without a token", async () => {
    const res = await fetch(`${base()}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("requires the token for assets", async () => {
    expect((await fetch(`${base()}/assets/web/index.html`)).status).toBe(401);
  });

  it("refuses path traversal under the static root", async () => {
    const res = await fetch(`${base()}/assets/web/..%2F..%2Fpackage.json`, authed());
    expect(res.status).toBe(404);
    expect((await fetch(`${base()}/assets/web/`, authed())).status).toBe(404);
  });

  it("refuses path traversal in local and petdex asset routes", async () => {
    expect((await fetch(`${base()}/assets/pets/local/..%2F..%2Fpackage.json`, authed())).status).toBe(404);
    expect((await fetch(`${base()}/assets/pets/petdex/..%2F..%2Fpackage.json`, authed())).status).toBe(404);
  });

  it("lists local pets, serves their files and switches the active pet", async () => {
    const petDir = join(home, "pets", "demo");
    mkdirSync(petDir, { recursive: true });
    writeFileSync(join(petDir, "pet.json"), JSON.stringify({ displayName: "Demo" }));
    writeFileSync(join(petDir, "spritesheet.webp"), "RIFF-demo");

    const listed = await (await fetch(`${base()}/api/pets`, authed())).json();
    expect(listed.pets).toContainEqual(expect.objectContaining({
      id: "local:demo",
      source: "local",
      name: "Demo",
      spriteUrl: "/assets/pets/local/demo/spritesheet.webp",
    }));

    const sprite = await fetch(`${base()}/assets/pets/local/demo/spritesheet.webp`, authed());
    expect(sprite.status).toBe(200);
    expect(await sprite.text()).toBe("RIFF-demo");
    expect((await fetch(`${base()}/assets/pets/local/demo/pet.json`, authed())).status).toBe(200);

    const put = await fetch(`${base()}/api/active-pet`, {
      method: "PUT",
      headers: { "content-type": "application/json", ...authed().headers },
      body: JSON.stringify({ id: "local:demo" }),
    });
    expect(put.status).toBe(204);
    const state = await (await fetch(`${base()}/api/state`, authed())).json();
    expect(state.activePet).toBe("local:demo");
  });

  it("rejects oversized event bodies", async () => {
    const body = JSON.stringify({ v: 1, agent: "claude", sessionId: "big", project: "demo", phase: "working", ts: Date.now(), pad: "x".repeat(70 * 1024) });
    const res = await fetch(`${base()}/api/event`, { method: "POST", headers: { "content-type": "application/json" }, body });
    expect(res.status).toBe(400);
  });

  it("rejects malformed cookies without crashing", async () => {
    const bad = { headers: { cookie: "foldpet_token=%E0%A4%A" } };
    expect((await fetch(`${base()}/api/state`, bad)).status).toBe(401);
    const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/ws`, { headers: bad.headers });
    await new Promise<void>((resolve) => { ws.on("error", () => resolve()); ws.on("close", () => resolve()); });
    expect(ws.readyState).not.toBe(WebSocket.OPEN);
    expect((await fetch(`${base()}/health`)).status).toBe(200);
  });

  it("proxies and caches allowlisted petdex assets", async () => {
    const calls: string[] = [];
    const manifest = {
      pets: [{ slug: "good", displayName: "Good", spritesheetUrl: "https://cdn.petdex.dev/pets/good/spritesheet.webp", petJsonUrl: "https://petdex.dev/pets/good/pet.json" }],
    };
    const fakeFetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push(url);
      if (url === "https://petdex.dev/api/manifest") return new Response(JSON.stringify(manifest), { status: 200 });
      if (url === "https://cdn.petdex.dev/pets/good/spritesheet.webp") return new Response("RIFF-good", { status: 200 });
      if (url === "https://petdex.dev/pets/good/pet.json") return new Response('{"displayName":"Good"}', { status: 200 });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const config = ensureConfig(home);
    const second = await startBridge({
      home, config, webDist: join(home, "web"), port: 0, localPetDirs: [],
      fetchImpl: fakeFetch,
    });
    try {
      const origin = `http://127.0.0.1:${second.port}`;
      const listed = await (await fetch(`${origin}/api/pets`, { headers: { cookie } })).json();
      expect(listed.pets).toContainEqual(expect.objectContaining({
        id: "petdex:good",
        spriteUrl: "/assets/pets/petdex/good/spritesheet.webp",
      }));

      const sprite = await fetch(`${origin}/assets/pets/petdex/good/spritesheet.webp`, { headers: { cookie } });
      expect(sprite.status).toBe(200);
      expect(await sprite.text()).toBe("RIFF-good");
      const again = await fetch(`${origin}/assets/pets/petdex/good/spritesheet.webp`, { headers: { cookie } });
      expect(again.status).toBe(200);
      expect(calls.filter((url) => url.includes("spritesheet.webp"))).toHaveLength(1);

      const meta = await fetch(`${origin}/assets/pets/petdex/good/pet.json`, { headers: { cookie } });
      expect(meta.status).toBe(200);
    } finally {
      await second.close();
    }
  });

  it("only proxies https petdex.dev assets", async () => {
    const calls: string[] = [];
    const manifest = {
      pets: [{ slug: "evil", displayName: "Evil", spritesheetUrl: "https://evil.example/spritesheet.webp", petJsonUrl: "https://evil.example/pet.json" }],
    };
    const fakeFetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push(url);
      if (url === "https://petdex.dev/api/manifest") return new Response(JSON.stringify(manifest), { status: 200 });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const config = ensureConfig(home);
    const second = await startBridge({
      home, config, webDist: join(home, "web"), port: 0, localPetDirs: [],
      fetchImpl: fakeFetch,
    });
    try {
      const res = await fetch(`http://127.0.0.1:${second.port}/assets/pets/petdex/evil/spritesheet.webp`, { headers: { cookie } });
      expect(res.status).toBe(404);
      expect(calls.some((url) => url.includes("evil.example"))).toBe(false);
    } finally {
      await second.close();
    }
  });

  it("keeps listing local pets when the manifest has a malformed asset URL", async () => {
    const petDir = join(home, "pets", "demo");
    mkdirSync(petDir, { recursive: true });
    writeFileSync(join(petDir, "pet.json"), JSON.stringify({ displayName: "Demo" }));
    writeFileSync(join(petDir, "spritesheet.webp"), "RIFF-demo");

    const manifest = {
      pets: [{ slug: "broken", displayName: "Broken", spritesheetUrl: "/relative/sheet.webp", petJsonUrl: "https://petdex.dev/pets/broken/pet.json" }],
    };
    const fakeFetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === "https://petdex.dev/api/manifest") return new Response(JSON.stringify(manifest), { status: 200 });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const config = ensureConfig(home);
    const second = await startBridge({
      home, config, webDist: join(home, "web"), port: 0, localPetDirs: [join(home, "pets")],
      fetchImpl: fakeFetch,
    });
    try {
      const res = await fetch(`http://127.0.0.1:${second.port}/api/pets`, { headers: { cookie } });
      expect(res.status).toBe(200);
      const listed = await res.json();
      expect(listed.pets).toContainEqual(expect.objectContaining({ id: "local:demo", name: "Demo" }));
      expect(listed.pets.some((pet: { id: string }) => pet.id === "petdex:broken")).toBe(false);
    } finally {
      await second.close();
    }
  });
});
