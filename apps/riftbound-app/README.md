# Riftbound App

The Riftbound play platform: a Bun HTTP server + Vite/React SPA hosting
the engine, deck builder, lobby, goldfish, sealed, profile, and replay
viewer.

This README covers local dev, production deploy prep (Slice 8), and the
auth-service swap point.

## Quickstart (dev)

```bash
# from repo root
export PATH="$HOME/.bun/bin:$PATH"

# 1. Install workspace deps
bun install

# 2. Start the Bun server on :3000 (SQLite auth + card API + engine + SSE/WS)
cd apps/riftbound-app
bun run server.ts

# 3. In a second terminal, run the Vite dev server on :5173
#    (proxies /api/*, /auth/*, and /ws/* to :3000)
cd apps/riftbound-app/web
bun run dev

# Open http://localhost:5173/play/
```

## Quickstart (full-stack Docker)

```bash
cd apps/riftbound-app
cp .env.example .env   # fill in COOKIE_SECRET
docker compose up --build
# → http://localhost:3000/play
```

The `riftbound-data` named volume persists the SQLite DB across
container restarts.

> **TLS** — terminate TLS at a reverse proxy in front of the container
> (Cloudflare, nginx, Caddy, or your PaaS load balancer). The app itself
> speaks plain HTTP/1.1 and WebSocket on the configured port. **Never
> expose the container directly to the public internet without a
> TLS-terminating proxy.**

## Architecture

```
                                                                  
   Browser  ----->  TLS proxy   ----->   riftbound-app  ----->   SQLite
 (SPA: web/dist)   (Cloudflare /        (Bun.serve on :3000)    (data/riftbound.db)
                    nginx / Caddy /                                    
                    Fly.io edge)                                       
                                              |                        
                                              | WebSocket (game/lobby) 
                                              v                        
                                         in-memory                     
                                        sessions Map                   
```

Single-process, single-node by design today. Sessions + lobbies live in
in-memory `Map`s; the SQLite DB persists users, decks, replays,
friends, and game-end stats. Horizontal scale-out is **not** supported
yet (the rate-limiter, session map, and SSE channels are all
process-local).

## Feature list

Slices 0–8 of the RiftAtlas parity plan are landed. Pages:

- [/play](http://localhost:3000/play) — landing / play hub
- [/play/decks](http://localhost:3000/play/decks) — deck builder + browser
- [/play/lobby](http://localhost:3000/play/lobby) — private-room 2P matchmaking
- [/play/goldfish](http://localhost:3000/play/goldfish) — solo practice mode
- [/play/sealed](http://localhost:3000/play/sealed) — sealed-pool simulator
- [/play/profile](http://localhost:3000/play/profile) — stats, replays, friends

Production endpoints (Slice 8):

- `GET /health` — `{status, uptime, version}` JSON for readiness probes.
- Per-IP rate limit: 100 req/min anon, 1000 req/min authenticated → 429 + `Retry-After`.
- Structured JSON request log: one line per request with
  `{ts, level, msg, ip, method, path, status, duration_ms, authenticated}`.

## Environment variables

See `.env.example` for the full list. Required in production:

| Variable | Notes |
|----------|-------|
| `PORT` | HTTP port (default 3000). PaaS providers set this. |
| `NODE_ENV` | Set to `production` to enable JSON logging. |
| `COOKIE_SECRET` | Long random string. `openssl rand -hex 32`. |
| `DATABASE_URL` | `sqlite://./data/riftbound.db` for the bundled DB. |
| `SESSION_TIMEOUT` | Seconds; default 86400 (24h). |
| `RIFTBOUND_VERSION` | Surfaced by `/health`. Set to commit SHA in CI. |

## Tests

```bash
# Vitest (SPA components, hooks)
cd apps/riftbound-app/web
bun run vitest run
# Baseline: 682 passed | 7 skipped

# Bun test (server, helpers, middleware)
cd apps/riftbound-app
bun test
# Baseline: 144 passed (131 prior + 13 from Slice 8 prod-middleware)
```

## Deploy

This repo is hosting-agnostic. The Dockerfile produces a single image
ready for any container platform:

```bash
docker build -t riftbound-app -f apps/riftbound-app/Dockerfile .
```

Hosting targets that work out-of-the-box (tested via the Docker image's
`/health` endpoint):

- **Fly.io** — `fly launch` from `apps/riftbound-app/`, mount a volume
  at `/app/apps/riftbound-app/data`.
- **Railway** — point at the repo root, set the Dockerfile path.
- **Render** — Docker deploy, mount a persistent disk.
- **Self-hosted Caddy/nginx** — see the `docker-compose.yml`.

For Vercel / Cloudflare Workers / other edge platforms: the in-memory
game-session map is not compatible with serverless cold starts. Use a
single-node deploy until Slice 9 introduces Redis/Postgres-backed state.

## CI

`.github/workflows/riftbound-app.yml` runs on every PR / push that
touches `apps/riftbound-app/` or its workspace deps:

1. `bun install --frozen-lockfile`
2. Typecheck (`tsc --noEmit` fallback if turbo script is absent)
3. Vitest in `apps/riftbound-app/web`
4. `bun test` in `apps/riftbound-app`
5. `vite build` → upload `web/dist` as a CI artifact
6. Verify dist has > 1 file and > 1KB

## Auth backends

`apps/riftbound-app` has its own SQLite user-repo for local dev. The
intent (per `.ai_memory/riftatlas-parity-plan.md` Slice 0) is to swap
to the dedicated `apps/auth-service` (Better Auth + JWT + Postgres +
Discord OAuth) once it's bootable locally.

The swap point is `apps/riftbound-app/lib/auth.ts`. Set
`AUTH_BACKEND=service` and `AUTH_SERVICE_URL=http://localhost:3001` to
have the Bun server proxy `/api/auth/me` to the auth-service instead
of hitting the local SQLite repo.

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

## Slice 8 file map (production deploy prep)

- `apps/riftbound-app/Dockerfile` — multi-stage build, runs as non-root.
- `apps/riftbound-app/.dockerignore` — keeps image lean.
- `apps/riftbound-app/docker-compose.yml` — local production stack
  (riftbound-app + persistent SQLite volume; auth-service block
  commented until blockers clear).
- `apps/riftbound-app/.env.example` — full env-var reference.
- `apps/riftbound-app/lib/prod-middleware.ts` — `/health`, structured
  JSON logging, per-IP rate limiter (in-memory).
- `apps/riftbound-app/server.ts` — reads `PORT` (PaaS convention), wraps
  fetch with `withProdMiddleware`.
- `.github/workflows/riftbound-app.yml` — PR + push CI (typecheck,
  vitest, bun test, vite build, dist verification).
- `apps/riftbound-app/__tests__/prod-middleware.test.ts` — 13 unit
  tests for the rate-limiter, IP extraction, and request wrapper.
