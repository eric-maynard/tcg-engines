/**
 * Tests for `lib/prod-middleware.ts` — Slice 8 production hardening.
 */
import { describe, expect, it } from "bun:test";
import {
  RateLimiter,
  getClientIp,
  withProdMiddleware,
} from "../lib/prod-middleware";

describe("RateLimiter", () => {
  it("allows requests up to the anon limit", () => {
    const lim = new RateLimiter({ anonPerMinute: 3, authPerMinute: 100 });
    const ip = "1.2.3.4";
    expect(lim.consume(ip, false).ok).toBe(true);
    expect(lim.consume(ip, false).ok).toBe(true);
    expect(lim.consume(ip, false).ok).toBe(true);
    const blocked = lim.consume(ip, false);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterSec).toBeGreaterThan(0);
    }
  });

  it("uses separate buckets for anon vs authed", () => {
    const lim = new RateLimiter({ anonPerMinute: 1, authPerMinute: 1 });
    const ip = "1.2.3.4";
    expect(lim.consume(ip, false).ok).toBe(true);
    expect(lim.consume(ip, false).ok).toBe(false);
    // Authed bucket is independent.
    expect(lim.consume(ip, true).ok).toBe(true);
    expect(lim.consume(ip, true).ok).toBe(false);
  });

  it("resets after the window elapses", () => {
    let now = 1_000_000;
    const lim = new RateLimiter({ anonPerMinute: 1, windowMs: 60_000 }, () => now);
    expect(lim.consume("ip", false).ok).toBe(true);
    expect(lim.consume("ip", false).ok).toBe(false);
    now += 60_001;
    expect(lim.consume("ip", false).ok).toBe(true);
  });

  it("sweep() drops expired buckets", () => {
    let now = 1_000_000;
    const lim = new RateLimiter({ anonPerMinute: 1, windowMs: 1000 }, () => now);
    lim.consume("a", false);
    lim.consume("b", false);
    expect(lim.size()).toBe(2);
    now += 5000;
    lim.sweep();
    expect(lim.size()).toBe(0);
  });
});

describe("getClientIp", () => {
  it("prefers X-Forwarded-For", () => {
    const req = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("9.9.9.9");
  });

  it("falls back to X-Real-IP", () => {
    const req = new Request("http://localhost/", {
      headers: { "x-real-ip": "8.8.8.8" },
    });
    expect(getClientIp(req)).toBe("8.8.8.8");
  });

  it("falls back to server.requestIP", () => {
    const req = new Request("http://localhost/");
    const server = {
      requestIP: () => ({ address: "1.1.1.1", family: "IPv4", port: 0 }),
    };
    expect(getClientIp(req, server)).toBe("1.1.1.1");
  });

  it("returns 'unknown' when nothing is available", () => {
    const req = new Request("http://localhost/");
    expect(getClientIp(req)).toBe("unknown");
  });
});

describe("withProdMiddleware", () => {
  const okInner = async () => new Response("ok", { status: 200 });

  it("serves /health without delegating", async () => {
    let innerCalled = false;
    const wrapped = withProdMiddleware(
      async () => {
        innerCalled = true;
        return new Response("inner");
      },
      { logger: () => {}, startedAt: Date.now() - 5000, version: "9.9.9" },
    );
    const res = await wrapped(new Request("http://localhost/health"), {});
    expect(res.status).toBe(200);
    expect(innerCalled).toBe(false);
    const body = (await res.json()) as { status: string; uptime: number; version: string };
    expect(body.status).toBe("ok");
    expect(body.version).toBe("9.9.9");
    expect(body.uptime).toBeGreaterThanOrEqual(5);
  });

  it("delegates normal requests to the inner handler", async () => {
    const wrapped = withProdMiddleware(okInner, { logger: () => {} });
    const res = await wrapped(new Request("http://localhost/api/x"), {});
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("returns 429 when the rate limit is exceeded", async () => {
    const wrapped = withProdMiddleware(okInner, {
      logger: () => {},
      rateLimit: { anonPerMinute: 2 },
    });
    const req = () =>
      new Request("http://localhost/api/x", {
        headers: { "x-forwarded-for": "5.5.5.5" },
      });
    expect((await wrapped(req(), {})).status).toBe(200);
    expect((await wrapped(req(), {})).status).toBe(200);
    const blocked = await wrapped(req(), {});
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
    const body = (await blocked.json()) as { error: string };
    expect(body.error).toBe("rate_limited");
  });

  it("catches inner errors and returns 500 with structured log", async () => {
    const logEntries: Record<string, unknown>[] = [];
    const wrapped = withProdMiddleware(
      async () => {
        throw new Error("boom");
      },
      { logger: (e) => logEntries.push(e) },
    );
    const res = await wrapped(new Request("http://localhost/api/x"), {});
    expect(res.status).toBe(500);
    expect(logEntries.some((e) => e.msg === "request_failed")).toBe(true);
    expect(logEntries.some((e) => e.msg === "request" && e.status === 500)).toBe(true);
  });

  it("uses authPerMinute when isAuthenticated returns true", async () => {
    const wrapped = withProdMiddleware(okInner, {
      isAuthenticated: () => true,
      logger: () => {},
      rateLimit: { anonPerMinute: 1, authPerMinute: 3 },
    });
    const req = () =>
      new Request("http://localhost/api/x", {
        headers: { "x-forwarded-for": "6.6.6.6" },
      });
    // 3 succeed (authed bucket), then 429.
    expect((await wrapped(req(), {})).status).toBe(200);
    expect((await wrapped(req(), {})).status).toBe(200);
    expect((await wrapped(req(), {})).status).toBe(200);
    expect((await wrapped(req(), {})).status).toBe(429);
  });
});
