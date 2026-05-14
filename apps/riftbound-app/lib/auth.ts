/**
 * Server-side auth bridge — RiftAtlas parity Slice 0.
 *
 * Today the Bun server has its own SQLite-backed user-repo (see
 * `src/db/user-repo.ts`) that exposes `/api/auth/login`, `/api/auth/me`,
 * etc. The intent of Slice 0 is to eventually replace that local repo
 * with a proxy to the dedicated `apps/auth-service` (Better Auth + JWT +
 * Postgres + Discord OAuth).
 *
 * For Slice 0 we keep the local repo as the canonical auth backend (it
 * works, has cookies, and is already wired into the deck routes) and
 * expose a thin abstraction here so that follow-up slices can swap to
 * auth-service without touching the route handlers.
 *
 * Current backends:
 *   - `local`     (default) — riftbound-app's own SQLite user-repo.
 *   - `service`   — proxy `/api/auth/*` to `process.env.AUTH_SERVICE_URL`.
 *
 * Selection is driven by `process.env.AUTH_BACKEND`. Defaults to `local`.
 *
 * The service backend is NOT YET FUNCTIONAL because the auth-service
 * requires Postgres + Discord OAuth credentials to boot, neither of which
 * are available in the local dev environment as of 2026-05-14. The
 * scaffolding here exists so the swap is a small, well-typed diff once
 * the auth-service is bootable. See `apps/auth-service/README.md` and
 * the parity-plan doc for blockers.
 */

export type AuthBackend = "local" | "service";

export interface AuthBridgeUser {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
}

export interface SessionLookupResult {
  readonly user: AuthBridgeUser | null;
  /** Reason the lookup returned null (for logging/diagnostics). */
  readonly reason?: "no-cookie" | "invalid-token" | "service-error";
}

/**
 * Resolve which auth backend the server should talk to. Read once at
 * module-load — flipping the env var requires a server restart, which
 * matches how every other env var in this server is handled.
 */
export function getAuthBackend(): AuthBackend {
  const v = (process.env.AUTH_BACKEND ?? "").trim().toLowerCase();
  return v === "service" ? "service" : "local";
}

/**
 * URL of the auth-service when AUTH_BACKEND=service. Defaults to the
 * docker-compose port (3001) so a contributor can flip the env var and
 * have it Just Work once they've started the service.
 */
export function getAuthServiceUrl(): string {
  return (process.env.AUTH_SERVICE_URL ?? "http://localhost:3001").replace(/\/$/, "");
}

/**
 * Proxy `/v1/users/me` on the auth-service to map a session cookie to a
 * user. Used by `/api/auth/me` when AUTH_BACKEND=service.
 *
 * The auth-service expects Better Auth's session cookie on incoming
 * requests; we forward whatever cookie header the SPA sent untouched.
 * The auth-service's CORS already sets `credentials: true` so this
 * works for cross-origin browser sessions too — though in practice the
 * Bun server and the auth-service will be reverse-proxied behind the
 * same domain in prod.
 */
export async function lookupSessionViaService(
  cookieHeader: string,
): Promise<SessionLookupResult> {
  if (!cookieHeader) {
    return { reason: "no-cookie", user: null };
  }
  const url = `${getAuthServiceUrl()}/v1/users/me`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", Cookie: cookieHeader },
    });
    if (res.status === 401) {
      return { reason: "invalid-token", user: null };
    }
    if (!res.ok) {
      return { reason: "service-error", user: null };
    }
    const body = (await res.json()) as {
      id?: string;
      email?: string;
      name?: string | null;
    };
    if (!body.id) {
      return { reason: "service-error", user: null };
    }
    return {
      user: {
        displayName: body.name ?? null,
        id: body.id,
        username: body.email ?? body.id,
      },
    };
  } catch {
    return { reason: "service-error", user: null };
  }
}
