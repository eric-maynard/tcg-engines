import { useAuth } from "../lib/useAuth";

/**
 * AuthBadge — RiftAtlas parity Slice 0.
 *
 * Small top-right widget that shows the current auth state. Rendered as
 * a fixed-position overlay so it sits on top of /play/ without disturbing
 * the existing flex/grid layout (every Iter parity test currently asserts
 * against the inner play-page structure, which we must not change).
 *
 * States:
 *   - loading       → unobtrusive "…" placeholder
 *   - logged out    → "Sign in" link to /api/auth/login (Slice 0+ adds a
 *                     real login page; for now this hits the JSON endpoint
 *                     which 401s a GET — fine for the scaffold, it's a
 *                     placeholder until the deck-builder/lobby slices)
 *   - logged in     → shows display name + a "Sign out" action
 */
export function AuthBadge() {
  const { user, loading, refresh } = useAuth();

  if (loading) {
    return (
      <div className="auth-badge auth-badge-loading" data-testid="auth-badge">
        <span aria-hidden="true">…</span>
      </div>
    );
  }

  if (user === null) {
    return (
      <div className="auth-badge auth-badge-anon" data-testid="auth-badge">
        <a
          className="auth-badge-signin"
          href="/login"
          data-testid="auth-signin-link"
        >
          Sign in
        </a>
      </div>
    );
  }

  const name = user.displayName ?? user.username;

  const onSignOut = () => {
    void fetch("/api/auth/logout", {
      credentials: "include",
      method: "POST",
    })
      .catch(() => {
        // Best-effort — server may not have a /logout handler yet
      })
      .finally(() => {
        // Clear the rb_token cookie client-side as a fallback.
        document.cookie = "rb_token=; Path=/; Max-Age=0; SameSite=Lax";
        refresh();
      });
  };

  return (
    <div className="auth-badge auth-badge-user" data-testid="auth-badge">
      <span className="auth-badge-name" data-testid="auth-display-name">
        {name}
      </span>
      <button
        type="button"
        className="auth-badge-signout"
        data-testid="auth-signout"
        onClick={onSignOut}
      >
        Sign out
      </button>
    </div>
  );
}
