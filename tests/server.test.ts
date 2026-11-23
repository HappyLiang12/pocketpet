import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { DEFAULT_APPEARANCE, normalizeAppearance } from "../src/appearance.js";
import { ensureConfig } from "../src/config.js";
import { urlsForPort } from "../src/net.js";
import type { HostIdentity } from "../src/platform/types.js";
import { startBridge, setupServiceRunning, type Bridge } from "../src/server.js";
import { testHost, testSecurity } from "./helpers/test-platform.js";

let home = "";
let bridge: Bridge;
let cookie = "";

/** Spy for the Petdex manifest fetch so tests can prove when the catalog is (not) loaded. */
const petdexFetch = vi.fn(async () => { throw new Error("offline"); });
/** Spy for the login-service probe so tests never touch real launchd state. */
const probeService = vi.fn(async () => false);

beforeEach(async () => {
  petdexFetch.mockClear();
  probeService.mockClear();
  home = mkdtempSync(join(tmpdir(), "pocketpet-"));
  const webDist = join(home, "web");
  mkdirSync(webDist, { recursive: true });
  writeFileSync(join(webDist, "index.html"), "<html>ok</html>");
  const config = ensureConfig(home, process.env, testSecurity);
  bridge = await startBridge({
    home, config, webDist, port: 0, localPetDirs: [join(home, "pets")], host: testHost,
    fetchImpl: petdexFetch, probeService,
  });
  const res = await fetch(`http://127.0.0.1:${bridge.port}/?token=${encodeURIComponent(config.token)}`);
  cookie = String(res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
});

afterEach(async () => { await bridge.close(); rmSync(home, { recursive: true, force: true }); });

const base = () => `http://127.0.0.1:${bridge.port}`;
const authed = () => ({ headers: { cookie } });

async function setupJson(path: string, init: RequestInit = {}) {
  return fetch(`${base()}${path}`, {
    ...init,
    headers: {
      origin: base(),
      "x-pocketpet-setup": "1",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

describe("bridge server", () => {
  it("rejects unauthenticated API calls", async () => {
    expect((await fetch(`${base()}/api/state`)).status).toBe(401);
  });

  it("serves the bootstrap page and sets a cookie", async () => {
    const res = await fetch(`${base()}/?token=${encodeURIComponent(bridge.config.token)}`);
    expect(res.status).toBe(200);
    expect(cookie.startsWith("pocketpet_token=")).toBe(true);
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

/** Raw node:http GET so the test controls the Host header (fetch always sets it from the URL). */
function rawGet(path: string, headers: Record<string, string> = {}): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port: bridge.port, path, method: "GET", headers }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("bridge server setup page", () => {
  it("renders loopback pairing links without a token using the actual port", async () => {
    const res = await fetch(`${base()}/setup`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("content-security-policy")).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    const html = await res.text();
    expect(html).toContain("<svg");
    expect(html).toContain(`?token=${encodeURIComponent(bridge.config.token)}`);
    expect(html).toContain(`127.0.0.1:${bridge.port}/`);
    expect(html).toContain("This computer");
    expect(html).toContain("Open phone view");
    expect(html).toContain("Open Studio");
    expect(html).toContain("Bridge version");
    expect(html).toContain("loopback-only");
    expect(html).not.toMatch(/\bMac\b/);
    expect(bridge.port).not.toBe(bridge.config.port);
    // Darwin and Windows both expose a real service status; only unsupported platforms are unknown.
    expect(html).toContain("Not running");
    expect(probeService).toHaveBeenCalled();
  });

  it("maps a rejected service probe to an unavailable System card instead of failing", async () => {
    await expect(setupServiceRunning(async () => false)).resolves.toBe(false);
    await expect(setupServiceRunning(async () => true)).resolves.toBe(true);
    await expect(
      setupServiceRunning(async () => {
        throw new Error("service is not supported on this platform");
      }),
    ).resolves.toBeNull();
  });

  it("accepts the loopback Host forms with the actual listening port", async () => {
    for (const host of ["127.0.0.1", "localhost", "LOCALHOST", "[::1]"]) {
      const res = await rawGet("/setup", { host: `${host}:${bridge.port}` });
      expect(res.status, `Host: ${host}`).toBe(200);
      expect(res.headers["referrer-policy"], `Host: ${host}`).toBe("no-referrer");
    }
  });

  it("refuses a non-loopback Host header with a computer-only page (DNS rebinding)", async () => {
    const phrases = { en: "computer", "zh-Hant": "電腦", "zh-Hans": "电脑" } as const;
    for (const host of ["evil.example", `evil.example:${bridge.port}`, `localhost:${bridge.port + 1}`]) {
      for (const [lang, phrase] of Object.entries(phrases)) {
        const res = await rawGet(`/setup?lang=${lang}`, { host });
        expect(res.status, `Host: ${host} lang: ${lang}`).toBe(403);
        expect(res.headers["content-type"], `Host: ${host} lang: ${lang}`).toBe("text/html; charset=utf-8");
        expect(res.headers["cache-control"], `Host: ${host} lang: ${lang}`).toBe("no-store");
        expect(res.body, `Host: ${host} lang: ${lang}`).toContain(phrase);
        expect(res.body, `Host: ${host} lang: ${lang}`).not.toContain("Mac-only");
        expect(res.body).not.toContain(bridge.config.token);
      }
    }
  });

  it("localizes the 403 page from Accept-Language", async () => {
    const res = await rawGet("/setup", { host: "evil.example", "accept-language": "zh-TW,zh;q=0.9" });
    expect(res.status).toBe(403);
    expect(res.body).toContain('<html lang="zh-Hant">');
    expect(res.body).toContain("電腦");
    expect(res.body).not.toContain(bridge.config.token);
  });

  it("localizes the setup page via ?lang and Accept-Language", async () => {
    const traditional = await rawGet("/setup?lang=zh-Hant");
    expect(traditional.status).toBe(200);
    expect(traditional.body).toContain('<html lang="zh-Hant">');
    expect(traditional.body).toContain("三步完成配對");

    const simplified = await rawGet("/setup?lang=zh-Hans");
    expect(simplified.status).toBe(200);
    expect(simplified.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(simplified.headers["cache-control"]).toBe("no-store");
    expect(simplified.body).toContain('<html lang="zh-Hans">');
    expect(simplified.body).toContain("三步完成配对");

    const english = await rawGet("/setup?lang=en");
    expect(english.status).toBe(200);
    expect(english.body).toContain('<html lang="en">');
    expect(english.body).toContain("Pair in three steps");

    const detected = await rawGet("/setup", { "accept-language": "zh-CN,zh;q=0.9" });
    expect(detected.status).toBe(200);
    expect(detected.body).toContain('<html lang="zh-Hans">');
    expect(detected.body).toContain("三步完成配对");
  });

  it("serves the manifest setup script and stylesheet on loopback without a cookie", async () => {
    const webDist = join(home, "web");
    writeFileSync(join(webDist, "manifest.json"), JSON.stringify({
      "src/setup/main.ts": { isEntry: true, file: "assets/setup-test.js", css: ["assets/setup-test.css"] },
    }));
    mkdirSync(join(webDist, "assets"), { recursive: true });
    writeFileSync(join(webDist, "assets", "setup-test.js"), "console.log('setup');");
    writeFileSync(join(webDist, "assets", "setup-test.css"), ":root { color-scheme: light dark; }");

    const page = await (await fetch(`${base()}/setup`)).text();
    expect(page).toContain('<script type="module" src="/assets/web/assets/setup-test.js"></script>');
    expect(page).toContain('<link rel="stylesheet" href="/assets/web/assets/setup-test.css">');
    expect(page).not.toMatch(/<script(?![^>]*src=)[^>]*>/);

    const script = await fetch(`${base()}/assets/web/assets/setup-test.js`);
    expect(script.status).toBe(200);
    expect(script.headers.get("content-type")).toContain("text/javascript");
    const scriptBody = await script.text();
    expect(scriptBody).toBe("console.log('setup');");
    expect(scriptBody).not.toContain(bridge.config.token);

    const css = await fetch(`${base()}/assets/web/assets/setup-test.css`);
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toContain("text/css");
    expect(await css.text()).toContain("color-scheme");

    expect(page).not.toMatch(/"token"\s*:/);
  });
});

describe("bridge server setup look API", () => {
  it("includes appearance and host in state and WebSocket snapshots", async () => {
    const state = await (await fetch(`${base()}/api/state`, authed())).json();
    expect(state.appearance).toEqual(bridge.config.appearance);
    expect(state.host.os).toMatch(/^(macOS|Windows|Linux)$/);
    expect(state.host.bridgeVersion).toBeTruthy();
    const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/ws?token=${encodeURIComponent(bridge.config.token)}`);
    const first = await new Promise<Record<string, unknown>>((resolve, reject) => {
      ws.once("message", (data) => resolve(JSON.parse(String(data))));
      ws.once("error", reject);
    });
    expect(first.appearance).toEqual(bridge.config.appearance);
    expect(first.host).toMatchObject({ os: state.host.os, bridgeVersion: state.host.bridgeVersion });
    ws.close();
  });

  it("serves setup look without a token and saves host appearance with CSRF", async () => {
    const look = await (await fetch(`${base()}/api/setup/look`)).json();
    expect(look.appearance).toEqual(bridge.config.appearance);
    expect(look.activePet).toBeNull();
    expect(Array.isArray(look.pets)).toBe(true);

    const denied = await fetch(`${base()}/api/setup/look`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ appearance: { theme: "light" } }),
    });
    expect(denied.status).toBe(403);

    const saved = await setupJson("/api/setup/look", {
      method: "PUT",
      body: JSON.stringify({ appearance: { ...bridge.config.appearance, theme: "light", clock: { scale: 140 } } }),
    });
    expect(saved.status).toBe(200);
    expect((await saved.json()).appearance).toMatchObject({ theme: "light", clock: { scale: 140 } });
    expect(bridge.config.appearance).toMatchObject({ theme: "light", clock: { scale: 140 } });
    const state = await (await fetch(`${base()}/api/state`, authed())).json();
    expect(state.appearance).toMatchObject({ theme: "light", clock: { scale: 140 } });
  });

  it("applies a full appearance object", async () => {
    const full = {
      ...DEFAULT_APPEARANCE,
      layout: { mode: "free" as const, gap: 24 },
      clock: { x: 10, y: 12, scale: 80, format: "12h" as const },
      theme: "light" as const,
      motion: "reduced" as const,
      sessions: { density: "compact" as const, maxVisible: 2, showProject: false, showTool: false, showElapsed: false },
    };
    const res = await setupJson("/api/setup/look", { method: "PUT", body: JSON.stringify({ appearance: full }) });
    expect(res.status).toBe(200);
    expect((await res.json()).appearance).toEqual(normalizeAppearance(full));
    expect(bridge.config.appearance).toEqual(normalizeAppearance(full));
  });

  it("merges a partial appearance over the current host look", async () => {
    const arranged = await setupJson("/api/setup/look", {
      method: "PUT",
      body: JSON.stringify({
        appearance: {
          ...DEFAULT_APPEARANCE,
          theme: "dark",
          layout: { mode: "free", gap: 24 },
          sessions: { ...DEFAULT_APPEARANCE.sessions, density: "compact", maxVisible: 2, showTool: false },
        },
      }),
    });
    expect(arranged.status).toBe(200);

    const res = await setupJson("/api/setup/look", {
      method: "PUT",
      body: JSON.stringify({ appearance: { clock: { scale: 140 } } }),
    });
    expect(res.status).toBe(200);
    const { appearance } = await res.json();
    // Omitted fields keep the arranged host look instead of resetting to defaults.
    expect(appearance.clock).toEqual({ x: 50, y: 36, scale: 140, format: "24h" });
    expect(appearance.theme).toBe("dark");
    expect(appearance.layout).toEqual({ mode: "free", gap: 24 });
    expect(appearance.sessions).toEqual({ density: "compact", maxVisible: 2, showProject: true, showTool: false, showElapsed: true });
    expect(bridge.config.appearance).toEqual(appearance);
  });

  it("rejects non-object appearance values with 400", async () => {
    for (const appearance of ["light", null, [1], 5]) {
      const res = await setupJson("/api/setup/look", { method: "PUT", body: JSON.stringify({ appearance }) });
      expect(res.status, JSON.stringify(appearance)).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code: "invalid_appearance" } });
    }
    expect(bridge.config.appearance).toEqual(normalizeAppearance(DEFAULT_APPEARANCE));
  });

  it("saves appearance-only and clear-pet updates without loading the pet catalog", async () => {
    const appearanceOnly = await setupJson("/api/setup/look", {
      method: "PUT",
      body: JSON.stringify({ appearance: { clock: { scale: 140 } } }),
    });
    expect(appearanceOnly.status).toBe(200);
    expect((await appearanceOnly.json()).appearance.clock.scale).toBe(140);
    expect(petdexFetch).not.toHaveBeenCalled();

    const petDir = join(home, "pets", "demo");
    mkdirSync(petDir, { recursive: true });
    writeFileSync(join(petDir, "pet.json"), JSON.stringify({ displayName: "Demo" }));
    writeFileSync(join(petDir, "spritesheet.webp"), "RIFF-demo");
    const selected = await setupJson("/api/setup/look", {
      method: "PUT",
      body: JSON.stringify({ activePet: "local:demo" }),
    });
    expect(selected.status).toBe(200);
    expect((await selected.json()).activePet).toBe("local:demo");

    petdexFetch.mockClear();
    const cleared = await setupJson("/api/setup/look", {
      method: "PUT",
      body: JSON.stringify({ activePet: null }),
    });
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).activePet).toBeNull();
    expect(bridge.config.activePet).toBeNull();
    expect(petdexFetch).not.toHaveBeenCalled();
  });

  it("rejects unknown host pets from setup", async () => {
    const res = await setupJson("/api/setup/look", {
      method: "PUT",
      body: JSON.stringify({ activePet: "local:nope" }),
    });
    expect(res.status).toBe(400);
  });

  it("serves setup-only pet sprites without the phone cookie", async () => {
    const petDir = join(home, "pets", "demo");
    mkdirSync(petDir, { recursive: true });
    writeFileSync(join(petDir, "pet.json"), JSON.stringify({ displayName: "Demo" }));
    writeFileSync(join(petDir, "spritesheet.webp"), "RIFF-demo");

    const look = await (await fetch(`${base()}/api/setup/look`)).json();
    expect(look.pets).toContainEqual(expect.objectContaining({
      id: "local:demo",
      spriteUrl: "/assets/setup/pets/local/demo/spritesheet.webp",
    }));
    const sprite = await fetch(`${base()}/assets/setup/pets/local/demo/spritesheet.webp`);
    expect(sprite.status).toBe(200);
    expect(await sprite.text()).toBe("RIFF-demo");
    expect((await fetch(`${base()}/assets/setup/pets/local/..%2F..%2Fpackage.json`)).status).toBe(404);
  });

  it("refuses setup mutations from a foreign Origin", async () => {
    const res = await fetch(`${base()}/api/setup/look`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-pocketpet-setup": "1",
        origin: "http://evil.example",
      },
      body: JSON.stringify({ appearance: { theme: "light" } }),
    });
    expect(res.status).toBe(403);
  });

  it("requires the setup header, an Origin, and a JSON content type on mutations", async () => {
    const body = JSON.stringify({ appearance: { theme: "light" } });

    const missingHeader = await fetch(`${base()}/api/setup/look`, {
      method: "PUT",
      headers: { origin: base(), "content-type": "application/json" },
      body,
    });
    expect(missingHeader.status).toBe(403);

    const missingOrigin = await fetch(`${base()}/api/setup/look`, {
      method: "PUT",
      headers: { "x-pocketpet-setup": "1", "content-type": "application/json" },
      body,
    });
    expect(missingOrigin.status).toBe(403);

    const wrongContentType = await fetch(`${base()}/api/setup/look`, {
      method: "PUT",
      headers: { origin: base(), "x-pocketpet-setup": "1", "content-type": "text/plain" },
      body,
    });
    expect(wrongContentType.status).toBe(403);

    expect(bridge.config.appearance.theme).toBe("system");
  });

  it("never includes the token or host config in setup look responses", async () => {
    const lookText = await (await fetch(`${base()}/api/setup/look`)).text();
    expect(lookText).not.toContain(bridge.config.token);
    expect(Object.keys(JSON.parse(lookText)).sort()).toEqual(["activePet", "appearance", "pets"]);
    expect(lookText).not.toMatch(/"sleepAfterMinutes"|"quietHours"|"token"|"port"/);

    const putText = await (await setupJson("/api/setup/look", {
      method: "PUT",
      body: JSON.stringify({ appearance: { clock: { scale: 140 } } }),
    })).text();
    expect(putText).not.toContain(bridge.config.token);
    expect(Object.keys(JSON.parse(putText)).sort()).toEqual(["activePet", "appearance"]);
    expect(putText).not.toMatch(/"sleepAfterMinutes"|"quietHours"|"token"|"port"/);
  });

  it("refuses setup look reads with a non-loopback Host header", async () => {
    const res = await rawGet("/api/setup/look", { host: "evil.example" });
    expect(res.status).toBe(403);
  });
});

describe("bridge server security", () => {
  it("serves loopback health without a token", async () => {
    const res = await fetch(`${base()}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("serves loopback web assets without a cookie and requires the token elsewhere", async () => {
    const loopback = await fetch(`${base()}/assets/web/index.html`);
    expect(loopback.status).toBe(200);
    expect(await loopback.text()).toBe("<html>ok</html>");

    const foreignHost = await rawGet("/assets/web/index.html", { host: "evil.example" });
    expect(foreignHost.status).toBe(401);

    // A LAN request carries the host's LAN address, so it misses the loopback branch.
    const lan = await rawGet("/assets/web/index.html", { host: `192.168.1.5:${bridge.port}` });
    expect(lan.status).toBe(401);

    expect((await fetch(`${base()}/assets/web/index.html`, authed())).status).toBe(200);
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
    const bad = { headers: { cookie: "pocketpet_token=%E0%A4%A" } };
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
    const config = ensureConfig(home, process.env, testSecurity);
    const second = await startBridge({
      home, config, webDist: join(home, "web"), port: 0, localPetDirs: [], host: testHost,
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
    const config = ensureConfig(home, process.env, testSecurity);
    const second = await startBridge({
      home, config, webDist: join(home, "web"), port: 0, localPetDirs: [], host: testHost,
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
    const config = ensureConfig(home, process.env, testSecurity);
    const second = await startBridge({
      home, config, webDist: join(home, "web"), port: 0, localPetDirs: [join(home, "pets")], host: testHost,
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

describe("bridge host lifecycle", () => {
  async function withHost(host: HostIdentity, work: (local: Bridge) => Promise<void>): Promise<void> {
    const local = await startBridge({
      home, config: bridge.config, webDist: join(home, "web"), port: 0, host,
      fetchImpl: petdexFetch, probeService,
    });
    try {
      await work(local);
    } finally {
      await local.close();
    }
  }

  it("advertises after listen, serves the live .local URL, and stops on close", async () => {
    const calls: string[] = [];
    let advertising = false;
    const host: HostIdentity = {
      localHostname: () => (advertising ? "happy-pc.local" : null),
      startAdvertisement: async () => {
        calls.push("start");
        advertising = true;
        return true;
      },
      stopAdvertisement: async () => {
        calls.push("stop");
        advertising = false;
      },
    };

    await withHost(host, async (local) => {
      expect(calls).toEqual(["start"]);
      const token = encodeURIComponent(local.config.token);
      const first = await (await fetch(`http://127.0.0.1:${local.port}/setup`)).text();
      expect(first).toContain(`http://happy-pc.local:${local.port}/?token=${token}`);

      // Loopback health exposes the live, gated name for service-mode pairing; no token.
      const health = await (await fetch(`http://127.0.0.1:${local.port}/health`)).json();
      expect(health).toMatchObject({ ok: true, localHostname: "happy-pc.local" });
      expect(JSON.stringify(health)).not.toContain(local.config.token);

      // The setup page reads the adapter live, so a stopped responder hides the name again.
      advertising = false;
      const second = await (await fetch(`http://127.0.0.1:${local.port}/setup`)).text();
      expect(second).not.toContain("happy-pc.local");
      expect((await (await fetch(`http://127.0.0.1:${local.port}/health`)).json()).localHostname).toBeNull();
    });

    expect(calls).toEqual(["start", "stop"]);
    expect(advertising).toBe(false);
  });

  it("omits the .local URL when advertisement is refused, keeping IP and USB pairing", async () => {
    const calls: string[] = [];
    const host: HostIdentity = {
      // A refused advertisement must hide the name even if the adapter would report one.
      localHostname: () => "happy-pc.local",
      startAdvertisement: async () => {
        calls.push("start");
        return false;
      },
      stopAdvertisement: async () => {
        calls.push("stop");
      },
    };

    await withHost(host, async (local) => {
      const token = encodeURIComponent(local.config.token);
      const html = await (await fetch(`http://127.0.0.1:${local.port}/setup`)).text();
      expect(html).not.toContain("happy-pc.local");
      expect(html).toContain(`http://127.0.0.1:${local.port}/?token=${token}`);
      const [firstIp] = urlsForPort(local.port, local.config.token);
      if (firstIp) expect(html).toContain(firstIp);
      // A refused advertisement must not leak the adapter name through health either.
      expect((await (await fetch(`http://127.0.0.1:${local.port}/health`)).json()).localHostname).toBeNull();
    });

    expect(calls).toEqual(["start", "stop"]);
  });
});
