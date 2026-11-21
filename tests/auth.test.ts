import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { isAuthorized, isLoopback, setTokenCookie } from "../src/auth.js";

const req = (headers: Record<string, string>): IncomingMessage => ({ headers } as IncomingMessage);
const url = (suffix = ""): URL => new URL(`http://127.0.0.1/api/state${suffix}`);

describe("isLoopback", () => {
  it("accepts loopback forms", () => {
    expect(isLoopback("127.0.0.1")).toBe(true);
    expect(isLoopback("::1")).toBe(true);
    expect(isLoopback("::ffff:127.0.0.1")).toBe(true);
  });
  it("rejects everything else", () => {
    expect(isLoopback("192.168.1.5")).toBe(false);
    expect(isLoopback(undefined)).toBe(false);
  });
});

describe("isAuthorized", () => {
  it("accepts Bearer, query and cookie tokens", () => {
    expect(isAuthorized(req({ authorization: "Bearer tok" }), url(), "tok")).toBe(true);
    expect(isAuthorized(req({}), url("?token=tok"), "tok")).toBe(true);
    expect(isAuthorized(req({ cookie: "a=1; foldpet_token=tok" }), url(), "tok")).toBe(true);
  });
  it("rejects missing or wrong tokens", () => {
    expect(isAuthorized(req({}), url(), "tok")).toBe(false);
    expect(isAuthorized(req({ authorization: "Bearer nope" }), url("?token=tok"), "tok")).toBe(false);
    expect(isAuthorized(req({ cookie: "foldpet_token=nope" }), url(), "tok")).toBe(false);
    expect(isAuthorized(req({ cookie: "foldpet_token=%E0%A4%A" }), url(), "tok")).toBe(false);
  });
});

describe("setTokenCookie", () => {
  it("sets an encoded HttpOnly cookie", () => {
    const headers: Record<string, string> = {};
    const res = { setHeader: (name: string, value: string) => { headers[name] = value; } } as unknown as ServerResponse;
    setTokenCookie(res, "a b");
    expect(headers["Set-Cookie"]).toBe("foldpet_token=a%20b; HttpOnly; SameSite=Lax; Path=/");
  });
});

