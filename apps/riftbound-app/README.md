# Riftbound App

The Riftbound play platform: a Bun HTTP server + Vite/React SPA that
hosts the engine, deck builder, and (eventually) the public lobby.

This README covers local dev setup, including the **RiftAtlas parity
Slice 0** auth wiring (`useAuth`, `AuthBadge`, and the optional
`apps/auth-service` SSO bridge).

## Dev quick-start

```bash
# from repo root
export PATH="$HOME/.bun/bin:$PATH"

# 1. Install deps (workspace-wide)
bun install

# 2. Start the Bun server (port 3000) — this includes:
#    - SQLite-backed auth (/api/auth/{register,login,me,logout})
#    - Card API, engine sessions, lobby, SSE/WS
cd apps/riftbound-app
bun run server.ts

# 3. In a second terminal, start the Vite dev server (port 5173).
#    `/api/*` and `/auth/*` are proxied to :3000.
cd apps/riftbound-app/web
bun run dev

# Open http://localhost:5173/play/
```

The SPA top-right shows the current auth state via the `AuthBadge`
component:

- Logged out → "Sign in" link.
- Logged in  → display name + "Sign out" button.

Account state is read from `GET /api/auth/me` via the `useAuth` hook
(`web/src/lib/useAuth.ts`). The `rb_token` cookie set by
`/api/auth/login` carries the session.

## Tests

```bash
cd apps/riftbound-app/web
bun run vitest run
```

Current baseline: **629 passed | 7 skipped** (Slice 0 added 4 AuthBadge
tests on top of the prior 625).

## Auth backends

`apps/riftbound-app` has its own SQLite user-repo for local dev. The
intent (per `.ai_memory/riftatlas-parity-plan.md` Slice 0) is to swap to
the dedicated `apps/auth-service` (Better Auth + JWT + Postgres +
Discord OAuth) once it's bootable locally.

The swap point is `apps/riftbound-app/lib/auth.ts`. Set
`AUTH_BACKEND=service` and `AUTH_SERVICE_URL=http://localhost:3001` to
have the Bun server proxy `/api/auth/me` to the auth-service instead of
hitting the local SQLite repo. (The proxy code is in `lib/auth.ts`;
wiring it into `server.ts` is a follow-up — see "Known blockers".)

### Known blockers — auth-service local boot

As of 2026-05-14 the `apps/auth-service` cannot boot locally for three
independent reasons. Each must be unblocked before SSO can actually be
exercised end-to-end:

1. **No Postgres.** This machine has neither Docker nor a brew Postgres
   install. Options:
   - Install Docker Desktop, then
     `docker compose -f apps/auth-service/docker-compose.yml up -d postgres-auth`
   - Or `brew install postgresql@14 && brew services start postgresql@14`
     and update `AUTH_DATABASE_URL` to match the brew port (5432).
2. **typebox version mismatch.** Running `bun run src/index.ts` in
   `apps/auth-service/` fails at module-load with:

   ```
   SyntaxError: Export named 'TransformDecodeError' not found in module
   '.../@sinclair+typebox@0.31.28/.../value/index.js'.
   ```

   Elysia is importing a symbol from a newer typebox API than the
   hoisted version provides. Fix candidates:
   - Pin `@sinclair/typebox` to a compatible version in the
     auth-service package.json.
   - Or bump `elysia` to a version that targets typebox 0.31.x.

   Typecheck (`bun run typecheck`) **does** pass — only runtime is
   blocked.
3. **Discord OAuth credentials.** `auth-service` is configured for
   Discord-only login (no email/password — `emailAndPassword.enabled =
   false` in `src/plugins/auth.ts`). Real SSO testing needs a Discord
   app: <https://discord.com/developers/applications>. Set
   `AUTH_DISCORD_CLIENT_ID` + `AUTH_DISCORD_CLIENT_SECRET` in
   `apps/auth-service/.env`.

Slice 0 ships the **client-side** wiring (hook + badge + tests) plus
the server-side bridge module (`lib/auth.ts`) so that when the above
blockers clear the swap is a small, well-typed change.

## Slice 0 file map

- `apps/riftbound-app/web/src/lib/useAuth.ts` — React hook, reads
  `/api/auth/me`.
- `apps/riftbound-app/web/src/components/AuthBadge.tsx` — top-right
  auth UI.
- `apps/riftbound-app/web/src/__tests__/AuthBadge.test.tsx` — pins the
  three render states.
- `apps/riftbound-app/web/src/App.tsx` — mounts `<AuthBadge />`.
- `apps/riftbound-app/web/src/styles.css` — `.auth-badge*` styles.
- `apps/riftbound-app/lib/auth.ts` — server-side backend selector +
  auth-service proxy stub.
