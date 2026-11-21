import type { IncomingMessage, ServerResponse } from "node:http";

export function isLoopback(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

/**
 * Host-header allowlist for the loopback `/setup` page. Only the loopback
 * host forms on the actual listening port pass; a DNS-rebinding page that
 * resolves a hostile name to 127.0.0.1 fails here even though its socket
 * address is loopback.
 */
export function isLoopbackHost(host: string | undefined, port: number): boolean {
  if (!host) return false;
  const normalized = host.trim().toLowerCase();
  return normalized === `127.0.0.1:${port}` || normalized === `localhost:${port}` || normalized === `[::1]:${port}`;
}

function cookieToken(req: IncomingMessage): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== "foldpet_token") continue;
    try {
      return decodeURIComponent(part.slice(index + 1));
    } catch {
      return null;
    }
  }
  return null;
}

export function requestToken(req: IncomingMessage, url: URL): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return url.searchParams.get("token") ?? cookieToken(req);
}

export function isAuthorized(req: IncomingMessage, url: URL, token: string): boolean {
  return requestToken(req, url) === token;
}

export function setTokenCookie(res: ServerResponse, token: string): void {
  res.setHeader("Set-Cookie", `foldpet_token=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000`);
}
