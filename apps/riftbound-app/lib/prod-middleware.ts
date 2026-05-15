/**
 * Production middleware: structured logging + per-IP rate limiting.
 *
 * Slice 8 of the RiftAtlas parity plan. Intentionally dependency-free
 * (in-memory map; no Redis) and side-effect-light so it can be wrapped
 * around the existing `Bun.serve({ fetch })` handler without rewriting
 * the 5K-line server.ts.
 *
 * Usage in server.ts:
 *
 *   const server = Bun.serve({
 *     port: PORT,
 *     fetch: withProdMiddleware(originalFetch, { isAuthenticated }),
 *     websocket: { ... },
 *   });
 *
 * The middleware is a no-op when NODE_ENV !== "production" except that
 * `/health` is always served and rate limits always apply (so tests can
 * exercise them without spoofing env).
 */

export interface RateLimitConfig {
  /** Anonymous-request budget per minute (default 100). */
  anonPerMinute: number;
  /** Authenticated-request budget per minute (default 1000). */
  authPerMinute: number;
  /** Window length in ms (default 60_000). */
  windowMs: number;
}

export interface ProdMiddlewareOptions {
  /** Per-request: is this request authenticated? Used to pick rate-limit bucket. */
  isAuthenticated?: (req: Request) => boolean;
  /** Rate-limit config (defaults applied if omitted). */
  rateLimit?: Partial<RateLimitConfig>;
  /** Override `Date.now` for tests. */
  now?: () => number;
  /** Override the structured logger (defaults to console.log JSON). */
  logger?: (entry: Record<string, unknown>) => void;
  /** Process start time, used by /health uptime. */
  startedAt?: number;
  /** App version string for /health. */
  version?: string;
  /** Disable the built-in /health route (default: enabled). */
  disableHealthRoute?: boolean;
}

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  anonPerMinute: 100,
  authPerMinute: 1000,
  windowMs: 60_000,
};

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Per-IP rate limiter. Keeps two buckets (anon + auth) per IP.
 * Exposed so tests can construct it directly.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly config: RateLimitConfig;
  private readonly now: () => number;

  constructor(config: Partial<RateLimitConfig> = {}, now: () => number = Date.now) {
    this.config = { ...DEFAULT_RATE_LIMIT, ...config };
    this.now = now;
  }

  /**
   * Try to consume one request slot for `ip`. Returns `{ ok: true }` if
   * allowed, or `{ ok: false, retryAfterSec }` if the bucket is full.
   */
  consume(ip: string, authenticated: boolean): { ok: true; remaining: number; resetAt: number } | { ok: false; retryAfterSec: number; resetAt: number } {
    const key = `${authenticated ? "auth" : "anon"}:${ip}`;
    const limit = authenticated ? this.config.authPerMinute : this.config.anonPerMinute;
    const now = this.now();
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + this.config.windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      return { ok: true, remaining: limit - 1, resetAt };
    }
    if (existing.count >= limit) {
      return {
        ok: false,
        resetAt: existing.resetAt,
        retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      };
    }
    existing.count += 1;
    return { ok: true, remaining: limit - existing.count, resetAt: existing.resetAt };
  }

  /**
   * Drop expired buckets. Cheap O(n) sweep — fine for in-memory dev/single-node.
   * Production multi-node should use Redis.
   */
  sweep(): void {
    const now = this.now();
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {this.buckets.delete(key);}
    }
  }

  /** For tests. */
  size(): number {
    return this.buckets.size;
  }
}

/** Extract the best-effort client IP from a Bun request. */
export function getClientIp(req: Request, server?: { requestIP?: (req: Request) => { address: string } | null }): string {
  // X-Forwarded-For first (set by Cloudflare / nginx / Caddy).
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) {return first;}
  }
  const real = req.headers.get("x-real-ip");
  if (real) {return real.trim();}
  if (server?.requestIP) {
    const addr = server.requestIP(req);
    if (addr?.address) {return addr.address;}
  }
  return "unknown";
}

/** Default structured logger: one JSON line per event on stdout. */
export function jsonLogger(entry: Record<string, unknown>): void {
  // We intentionally use console.log (stdout) so log shippers can tail
  // It without needing pino/winston.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...entry }));
}

/**
 * Wrap an existing `fetch` handler with /health, structured request
 * logging, and per-IP rate limiting. Errors thrown inside the inner
 * handler are caught, logged with full stack, and surface as 500.
 *
 * The wrapper preserves the second `server` arg that Bun passes (used
 * for WebSocket upgrades + requestIP), so handlers that rely on it
 * keep working.
 */
export function withProdMiddleware(
  inner: (req: Request, server: BunServerLike) => Response | Promise<Response>,
  opts: ProdMiddlewareOptions = {},
): (req: Request, server: BunServerLike) => Promise<Response> {
  const limiter = new RateLimiter(opts.rateLimit, opts.now);
  const log = opts.logger ?? jsonLogger;
  const startedAt = opts.startedAt ?? Date.now();
  const version = opts.version ?? process.env.RIFTBOUND_VERSION ?? "0.1.0";
  const isAuthed = opts.isAuthenticated ?? (() => false);
  const healthEnabled = !opts.disableHealthRoute;

  return async (req, server) => {
    const url = new URL(req.url);
    const start = (opts.now ?? Date.now)();
    const ip = getClientIp(req, server);

    // /health is unauthenticated, unrate-limited, and never delegates
    // To the inner handler. Some PaaS (Fly.io, Railway) hit it every
    // ~5s so we keep it dependency-free.
    if (healthEnabled && url.pathname === "/health" && req.method === "GET") {
      const body = JSON.stringify({
        status: "ok",
        uptime: Math.floor(((opts.now ?? Date.now)() - startedAt) / 1000),
        version,
      });
      return new Response(body, {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Rate-limit BEFORE delegating, so we don't even parse the body
    // For abusive callers. WS upgrade requests share the bucket — if
    // Someone wants to DOS the WebSocket they get throttled too.
    const authenticated = (() => {
      try {return isAuthed(req);} catch {return false;}
    })();
    const decision = limiter.consume(ip, authenticated);
    if (!decision.ok) {
      log({
        authenticated,
        ip,
        level: "warn",
        method: req.method,
        msg: "rate_limited",
        path: url.pathname,
        retry_after_sec: decision.retryAfterSec,
      });
      return new Response(
        JSON.stringify({ error: "rate_limited", retryAfter: decision.retryAfterSec }),
        {
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(decision.retryAfterSec),
            "X-RateLimit-Reset": String(Math.ceil(decision.resetAt / 1000)),
          },
          status: 429,
        },
      );
    }

    let status = 500;
    let errored: unknown = null;
    try {
      const res = await inner(req, server);
      ({ status } = res);
      return res;
    } catch (error) {
      errored = error;
      const stack = error instanceof Error ? error.stack : String(error);
      log({
        level: "error",
        msg: "request_failed",
        ip,
        method: req.method,
        path: url.pathname,
        error: error instanceof Error ? error.message : String(error),
        stack,
      });
      return new Response(JSON.stringify({ error: "internal_server_error" }), {
        headers: { "Content-Type": "application/json" },
        status: 500,
      });
    } finally {
      const duration = (opts.now ?? Date.now)() - start;
      // Skip access-log noise for the health endpoint — PaaS hammers it.
      if (!(url.pathname === "/health" && req.method === "GET")) {
        log({
          authenticated,
          duration_ms: duration,
          ip,
          level: errored ? "error" : "info",
          method: req.method,
          msg: "request",
          path: url.pathname,
          status,
        });
      }
    }
  };
}

/**
 * Minimal subset of Bun.Server we touch. Defined as an interface so
 * tests can pass a mock and so we don't pull in @types/bun at module
 * scope.
 */
export interface BunServerLike {
  requestIP?: (req: Request) => { address: string; port: number; family: string } | null;
  upgrade?: (req: Request, opts?: unknown) => boolean;
}
