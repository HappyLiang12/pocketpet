import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { WebSocketServer, WebSocket } from "ws";
import QRCode from "qrcode";
import type { Config } from "./config.js";
import { saveConfig } from "./config.js";
import { mergeAppearance, type Appearance, type AppearanceOverrides } from "./appearance.js";
import { hostInfo, type HostInfo } from "./host.js";
import { Aggregator, type Snapshot } from "./aggregator.js";
import { parseEvent } from "./events.js";
import { isAuthorized, isLoopback, isLoopbackHost, setTokenCookie } from "./auth.js";
import { pickLanguage } from "./i18n.js";
import { localHostname, pairingLinks, setupDeniedHtml, setupHtml } from "./onboarding.js";
import { loadPetdexPets, type PetdexPet } from "./petdexManifest.js";
import { scanLocalPets, type LocalPet } from "./pets.js";

export interface BridgeOptions {
  home: string;
  config: Config;
  webDist: string;
  port?: number;
  manifestUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  ttlMs?: number;
  flashMs?: number;
  localPetDirs?: string[];
  probeService?: () => Promise<boolean>;
}

export interface Bridge {
  port: number;
  config: Config;
  aggregator: Aggregator;
  broadcast(): void;
  close(): Promise<void>;
}

type BridgeSnapshot = Snapshot & { appearance: Appearance; host: HostInfo };

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
const SLUG = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

function json(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(data) });
  res.end(data);
}
function text(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}
async function readBody(req: IncomingMessage, limit = 64 * 1024): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.from(chunk);
    size += buf.length;
    if (size > limit) throw new Error("body too large");
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}
function safeJoin(root: string, rel: string): string | null {
  const base = resolve(root);
  const target = resolve(base, "." + (rel.startsWith("/") ? rel : "/" + rel));
  return target.startsWith(base + sep) ? target : null;
}
function petdexUrlAllowed(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && (url.hostname === "petdex.dev" || url.hostname.endsWith(".petdex.dev"));
  } catch {
    return false;
  }
}
function petdexSpriteName(raw: string): string | null {
  try {
    return basename(new URL(raw).pathname) || null;
  } catch {
    return null;
  }
}
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function serveFile(res: ServerResponse, file: string): void {
  const data = readFileSync(file);
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  res.end(data);
}

export function isSetupRequestAllowed(req: IncomingMessage, port: number): boolean {
  return isLoopback(req.socket.remoteAddress) && isLoopbackHost(req.headers.host, port);
}

export function isSetupMutationAllowed(req: IncomingMessage, port: number): boolean {
  if (!isSetupRequestAllowed(req, port)) return false;
  if (req.headers["x-pocketpet-setup"] !== "1") return false;
  if (!String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) return false;
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    const o = new URL(origin);
    const h = new URL(`http://${req.headers.host}`);
    return o.protocol === "http:" && o.hostname === h.hostname && o.port === h.port;
  } catch {
    return false;
  }
}

export async function startBridge(opts: BridgeOptions): Promise<Bridge> {
  const { home, config } = opts;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const aggregator = new Aggregator({ now, ttlMs: opts.ttlMs, flashMs: opts.flashMs });
  const localPetDirs = opts.localPetDirs ?? [join(home, "pets"), join(homedir(), ".codex", "pets"), join(homedir(), ".petdex", "pets")];
  const cacheFile = join(home, "cache", "petdex", "manifest.json");
  const wsClients = new Set<WebSocket>();

  async function listPets(): Promise<{ local: LocalPet[]; petdex: PetdexPet[] }> {
    return { local: scanLocalPets(localPetDirs), petdex: await loadPetdexPets({ cacheFile, url: opts.manifestUrl, fetchImpl, now }) };
  }
  async function petSummaries() {
    const { local, petdex } = await listPets();
    return [
      ...local.map((pet) => ({ id: pet.id, source: pet.source, slug: pet.slug, name: pet.name, spriteUrl: `/assets/pets/local/${encodeURIComponent(pet.slug)}/${pet.spriteFile}` })),
      ...petdex.flatMap((pet) => {
        const spriteName = petdexSpriteName(pet.spritesheetUrl);
        if (!spriteName) return [];
        return [{ id: pet.id, source: pet.source, slug: pet.slug, name: pet.name, spriteUrl: `/assets/pets/petdex/${encodeURIComponent(pet.slug)}/${spriteName}` }];
      }),
    ];
  }
  async function setupSummaries() {
    return (await petSummaries()).map((pet) => ({
      ...pet,
      spriteUrl: pet.spriteUrl.replace(/^\/assets\/pets\//, "/assets/setup/pets/"),
    }));
  }
  function serveLocalPetAsset(rel: string, res: ServerResponse): void {
    const parts = rel.slice("/local/".length).split("/");
    if (parts.length !== 2 || !SLUG.test(parts[0]!)) return text(res, 404, "not found");
    const pet = scanLocalPets(localPetDirs).find((candidate) => candidate.slug === parts[0]);
    if (!pet) return text(res, 404, "not found");
    const file = parts[1]!;
    if (file !== "pet.json" && file !== pet.spriteFile) return text(res, 404, "not found");
    const target = join(pet.dir, file);
    if (!existsSync(target)) return text(res, 404, "not found");
    return serveFile(res, target);
  }
  async function servePetdexPetAsset(rel: string, res: ServerResponse): Promise<void> {
    const parts = rel.slice("/petdex/".length).split("/");
    if (parts.length !== 2 || !SLUG.test(parts[0]!) || !parts[1]) return text(res, 404, "not found");
    const pet = (await listPets()).petdex.find((candidate) => candidate.slug === parts[0]);
    if (!pet) return text(res, 404, "not found");
    const spriteName = petdexSpriteName(pet.spritesheetUrl);
    if (!spriteName) return text(res, 404, "not found");
    const source = parts[1] === "pet.json" ? pet.petJsonUrl : parts[1] === spriteName ? pet.spritesheetUrl : null;
    if (!source || !petdexUrlAllowed(source)) return text(res, 404, "not found");
    const cacheDir = join(home, "cache", "petdex", pet.slug);
    const cachePath = join(cacheDir, parts[1]!);
    if (!existsSync(cachePath)) {
      // redirect: "error" keeps the https/petdex.dev allowlist authoritative after redirects.
      const upstream = await fetchImpl(source, { signal: AbortSignal.timeout(10_000), redirect: "error" });
      if (!upstream.ok) return text(res, 502, "upstream error");
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(cachePath, Buffer.from(await upstream.arrayBuffer()));
    }
    return serveFile(res, cachePath);
  }
  const snapshot = (): BridgeSnapshot => ({
    ...aggregator.snapshot(config.activePet, { sleepAfterMinutes: config.sleepAfterMinutes, quietHours: config.quietHours }),
    appearance: config.appearance,
    host: hostInfo(),
  });
  const broadcast = (): void => {
    const data = JSON.stringify(snapshot());
    for (const client of wsClients) if (client.readyState === WebSocket.OPEN) client.send(data);
  };

  // Assigned from the real socket address after listen so `/setup` links use the actual port
  // (tests listen on port 0, which differs from config.port).
  let port = opts.port ?? config.port;

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const path = decodeURIComponent(url.pathname);

      if (req.method === "POST" && path === "/api/event") {
        if (!isLoopback(req.socket.remoteAddress)) return text(res, 403, "loopback only");
        let value: unknown;
        try { value = JSON.parse(await readBody(req)); } catch { return text(res, 400, "invalid json"); }
        const event = parseEvent(value);
        if (!event) return text(res, 400, "invalid event");
        aggregator.apply(event);
        broadcast();
        return res.writeHead(204).end();
      }
      if (path === "/health") {
        if (!isLoopback(req.socket.remoteAddress)) return text(res, 403, "loopback only");
        return json(res, 200, { ok: true, sessions: aggregator.snapshot(null, { sleepAfterMinutes: 0, quietHours: null }).sessions.length });
      }
      if (req.method === "GET" && path === "/setup") {
        const lang = pickLanguage(req.headers["accept-language"], url.searchParams.get("lang"));
        // Loopback sockets alone are not enough: a DNS-rebinding page also connects from
        // 127.0.0.1, so the Host header must name this exact loopback listener.
        if (!isLoopback(req.socket.remoteAddress) || !isLoopbackHost(req.headers.host, port)) {
          res.writeHead(403, {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
            "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
          });
          return res.end(setupDeniedHtml(port, lang));
        }
        const hostname = localHostname();
        const links = pairingLinks(port, config.token, { hostname });
        let qrSvg = "";
        if (links.qrUrl) {
          try {
            qrSvg = await QRCode.toString(links.qrUrl, { type: "svg", margin: 1, width: 320 });
          } catch {
            qrSvg = "";
          }
        }
        const html = setupHtml({ qrSvg, ipUrls: links.ipUrls, localUrl: links.localUrl, port, usbUrl: links.usbUrl, lang, hostname });
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "referrer-policy": "no-referrer",
          "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
        });
        return res.end(html);
      }
      if (req.method === "GET" && path === "/api/setup/look") {
        if (!isSetupRequestAllowed(req, port)) return text(res, 403, "loopback setup only");
        return json(res, 200, { appearance: config.appearance, activePet: config.activePet, pets: await setupSummaries() });
      }
      if (req.method === "PUT" && path === "/api/setup/look") {
        if (!isSetupMutationAllowed(req, port)) return text(res, 403, "setup mutation requires same-origin JSON");
        let value: unknown;
        try {
          value = JSON.parse(await readBody(req));
        } catch {
          return json(res, 400, { error: { code: "invalid_json", message: "invalid JSON" } });
        }
        const body = (value ?? {}) as { appearance?: unknown; activePet?: unknown };
        // Partial-merge semantics: a provided appearance object is merged over the current
        // host look, so callers may omit fields without resetting them to defaults.
        if (body.appearance !== undefined && !isPlainObject(body.appearance)) {
          return json(res, 400, { error: { code: "invalid_appearance", message: "appearance must be an object" } });
        }
        const next = mergeAppearance(config.appearance, (body.appearance ?? {}) as AppearanceOverrides);
        const requestedPet = body.activePet;
        if (requestedPet !== undefined && requestedPet !== null) {
          if (typeof requestedPet !== "string") {
            return json(res, 400, { error: { code: "unknown_pet", message: "unknown pet" } });
          }
          // Only a supplied pet id needs the catalog; appearance-only and clear-pet saves skip it.
          const pets = await petSummaries();
          if (!pets.some((pet) => pet.id === requestedPet)) {
            return json(res, 400, { error: { code: "unknown_pet", message: "unknown pet" } });
          }
        }
        const petId = requestedPet === undefined ? config.activePet : requestedPet;
        config.appearance = next;
        config.activePet = petId;
        saveConfig(home, config);
        broadcast();
        return json(res, 200, { appearance: config.appearance, activePet: config.activePet });
      }
      if (req.method === "GET" && path.startsWith("/assets/setup/pets/")) {
        if (!isSetupRequestAllowed(req, port)) return text(res, 403, "loopback setup only");
        const subpath = path.slice("/assets/setup/pets".length); // starts with /local/ or /petdex/
        if (subpath.startsWith("/local/")) return serveLocalPetAsset(subpath, res);
        if (subpath.startsWith("/petdex/")) return await servePetdexPetAsset(subpath, res);
        return text(res, 404, "not found");
      }
      if (!isAuthorized(req, url, config.token)) return text(res, 401, "unauthorized");
      if (url.searchParams.get("token") === config.token) setTokenCookie(res, config.token);

      if (req.method === "GET" && (path === "/" || path === "/index.html")) {
        const file = join(opts.webDist, "index.html");
        if (!existsSync(file)) return text(res, 500, "web build missing: npm run build:web");
        return serveFile(res, file);
      }
      if (req.method === "GET" && path.startsWith("/assets/web/")) {
        const file = safeJoin(opts.webDist, path.slice("/assets/web".length));
        if (!file || !existsSync(file)) return text(res, 404, "not found");
        return serveFile(res, file);
      }
      if (req.method === "GET" && path === "/api/state") return json(res, 200, snapshot());
      if (req.method === "GET" && path === "/api/pets") return json(res, 200, { pets: await petSummaries() });
      if (req.method === "PUT" && path === "/api/active-pet") {
        let value: unknown;
        try { value = JSON.parse(await readBody(req)); } catch { return text(res, 400, "invalid json"); }
        const id = (value as { id?: unknown })?.id;
        if (typeof id !== "string") return text(res, 400, "id required");
        if (!(await petSummaries()).some((pet) => pet.id === id)) return text(res, 400, "unknown pet");
        config.activePet = id;
        saveConfig(home, config);
        broadcast();
        return res.writeHead(204).end();
      }
      if (req.method === "GET" && path.startsWith("/assets/pets/local/")) {
        return serveLocalPetAsset(path.slice("/assets/pets".length), res);
      }
      if (req.method === "GET" && path.startsWith("/assets/pets/petdex/")) {
        return await servePetdexPetAsset(path.slice("/assets/pets".length), res);
      }
      return text(res, 404, "not found");
    } catch (error) {
      if (res.headersSent) return void res.destroy();
      return json(res, 500, { error: error instanceof Error ? error.message : "internal error" });
    }
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname !== "/ws" || !isAuthorized(req, url, config.token)) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    } catch {
      socket.destroy();
    }
  });
  wss.on("connection", (ws) => {
    wsClients.add(ws);
    ws.send(JSON.stringify(snapshot()));
    ws.on("close", () => wsClients.delete(ws));
    ws.on("error", () => wsClients.delete(ws));
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? config.port, "0.0.0.0", () => resolveListen());
  });
  const address = server.address();
  port = typeof address === "object" && address ? address.port : (opts.port ?? config.port);

  return {
    port,
    config,
    aggregator,
    broadcast,
    close: async () => {
      for (const client of wsClients) client.close();
      wss.close();
      server.closeIdleConnections();
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    },
  };
}
