import { useEffect, useState } from "react";

/**
 * UseAuth — RiftAtlas parity Slice 0 (auth wiring).
 *
 * Reads the current session from the Bun server's `/api/auth/me` endpoint.
 * That endpoint today is backed by the local SQLite user-repo + `rb_token`
 * cookie (see `apps/riftbound-app/server.ts`). When the dedicated
 * `apps/auth-service` (Better Auth + Discord OAuth) is fully bootable
 * locally, the server-side handler will be swapped to proxy to it; the
 * hook contract here stays the same so callers don't need to change.
 *
 * Contract:
 *   - `user === undefined` → still loading
 *   - `user === null`      → not logged in
 *   - `user` is `AuthUser` → logged in
 *
 * The hook is intentionally tiny and dependency-free. We use the native
 * `fetch` API with `credentials: "include"` so the `rb_token` cookie
 * (HttpOnly, SameSite=Lax) is sent on the same origin during dev (the
 * Vite proxy forwards `/api/*` to the Bun server on :3000).
 */
export interface AuthUser {
  id: string;
  username: string;
  displayName: string | null;
}

export interface UseAuthResult {
  /** `undefined` while loading, `null` if unauthenticated, else the user. */
  user: AuthUser | null | undefined;
  /** `true` while the initial `/api/auth/me` request is in flight. */
  loading: boolean;
  /** Error message, if the request failed for a reason other than 401. */
  error: string | null;
  /** Re-fetch the current session (call after login/logout). */
  refresh: () => void;
}

const AUTH_ME_URL = "/api/auth/me";

export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const res = await fetch(AUTH_ME_URL, {
          credentials: "include",
          headers: { Accept: "application/json" },
        });

        if (cancelled) {
          return;
        }

        if (res.status === 401) {
          // Not logged in — this is the expected unauthenticated state.
          setUser(null);
          setError(null);
          return;
        }

        if (!res.ok) {
          setUser(null);
          setError(`auth/me returned ${res.status}`);
          return;
        }

        const body = (await res.json()) as { user?: AuthUser };
        if (cancelled) {
          return;
        }
        setUser(body.user ?? null);
        setError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        // Network errors (e.g. server not running) should not crash the
        // SPA — treat as logged-out + surface error for diagnostics.
        setUser(null);
        setError(error instanceof Error ? error.message : String(error));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return {
    error,
    loading: user === undefined,
    refresh: () => setTick((t) => t + 1),
    user,
  };
}
