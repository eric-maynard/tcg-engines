# UI Next Steps — SPA Migration Plan

## Current state

`apps/riftbound-app` is a **Bun HTTP server** serving:

- `GET /demo` → server-rendered HTML page (built by `components/InteractiveGameBoard.ts`).
- `POST /api/demo/move/:id` → applies a move to an `EngineSession` and re-renders.
- `GET /api/demo/state/:id` → JSON snapshot of the current game session.

Everything is server-rendered + inline JS POSTs (htmx-flavored). No React, no
bundler, no client framework. `package.json` has only `puppeteer-core`,
`websockify`, and `better-sqlite3` — no UI framework deps.

## Why move to an SPA

1. Optimistic UI / latency: server round-trip per click feels sluggish.
2. Animated chain/showdown UI is impossible with full-page HTML re-renders.
3. Replay scrubbing + bot-vs-bot fast-forward want real client state.
4. iPad / mobile play needs a touch-first React Native or React-DOM build.

## Recommended framework: Vite + React + TypeScript

- **Why Vite over Next**: this is a pure SPA; we don't need SSR. The Bun
  server already serves the engine API. Vite's dev server is fastest and
  plays nicely with Bun.
- **Why React over Solid/Svelte**: the broader ecosystem covers what we'll
  need (touch DnD, animations, virtual lists for the chain log) and most
  contributors know it.

### Dependencies to add to `apps/riftbound-app/package.json`

```jsonc
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

### Suggested directory layout

```
apps/riftbound-app/
├── server.ts                ← keep — serves /api/* unchanged
├── client/                  ← NEW Vite root
│   ├── index.html           ← Vite entry (replaces /demo HTML wrapper)
│   ├── main.tsx             ← React mount
│   ├── App.tsx              ← router (lobby / deck builder / play)
│   ├── pages/
│   │   ├── PlayPage.tsx     ← hydrates from /api/demo/state/:id
│   │   ├── DeckPage.tsx
│   │   └── LobbyPage.tsx
│   ├── components/          ← Board, Hand, Chain, BattlefieldRow, …
│   ├── hooks/               ← useEngineSession, useLegalMoves
│   └── api/                 ← typed fetch client (POST /api/demo/move)
├── vite.config.ts
└── tsconfig.client.json
```

### Minimal `PlayPage.tsx` shape

```tsx
import { useEffect, useState } from "react";

export function PlayPage({ sessionId }: { sessionId: string }) {
  const [view, setView] = useState<unknown>(null);
  const [legal, setLegal] = useState<unknown[]>([]);

  async function refresh() {
    const res = await fetch(`/api/demo/state/${sessionId}`);
    const data = await res.json();
    setView(data.view);
    setLegal(data.legalMoves);
  }

  useEffect(() => { void refresh(); }, [sessionId]);

  async function play(move: { moveId: string; params?: unknown }) {
    await fetch(`/api/demo/move/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(move),
    });
    await refresh();
  }

  if (!view) return <div>Loading…</div>;
  return (
    <div className="board">
      {/* render view; on click, call play(move) */}
      {legal.map((m, i) => (
        <button key={i} onClick={() => void play(m as never)}>
          {(m as { moveId: string }).moveId}
        </button>
      ))}
    </div>
  );
}
```

### Server-side changes

`server.ts` stays as-is. The `/api/demo/state/:id` endpoint already returns
JSON; we just expose it on a stable contract. The `/demo` route can keep
serving the legacy HTML for the duration of the migration so both UIs work
side by side.

Add ONE new route:
- `GET /` → serve Vite-built `client/dist/index.html` in production, or
  proxy to the Vite dev server in development.

### Build pipeline

```jsonc
{
  "scripts": {
    "dev": "concurrently \"vite\" \"bun run server.ts\"",
    "build:client": "vite build",
    "build": "vite build && bun build server.ts --outdir dist"
  }
}
```

## Migration plan (4 PRs)

1. **PR 1 — Scaffold**: add Vite + React deps, `client/` directory, a single
   "hello" page that fetches `/api/demo/state/:id` and renders raw JSON.
   Server route `/` proxies/serves the Vite build. `/demo` keeps working.
2. **PR 2 — PlayPage**: port the rendering from `InteractiveGameBoard.ts`
   into React components. Wire up the move buttons. No animations yet.
3. **PR 3 — Animations**: chain push/pop, damage numbers, card flip on
   reveal. Use Framer Motion or CSS transitions.
4. **PR 4 — Retire `/demo`**: once parity is reached, remove the legacy
   HTML renderer.

## Open questions for Eric

- iPad/mobile native (React Native + Expo) **or** React DOM + responsive
  CSS? RN unlocks haptics + push notifications for async play; RDOM is
  cheaper to ship.
- Do we want server-side rendering for SEO on deck pages? If yes, swap
  Vite for Next.js and run it alongside the Bun engine API on a different
  port (or behind a reverse proxy).
- Realtime multiplayer: WebSocket over the same Bun server, or a separate
  PartyKit/Colyseus deployment? The current `EngineSession` is single-user
  goldfish; multiplayer needs a session sync protocol.
