/**
 * Iter 16: integration test for `POST /api/v2/scenario/game-over/:sessionId`.
 *
 * The endpoint seeds a finished/game-over state directly into the engine
 * session (status=finished, winner=<chosen>, victoryPoints bumped to the
 * VP threshold). This lets the SPA's headless-screenshot harness capture
 * the GAME OVER banner without driving a real bot game to VP threshold.
 *
 * Reuses the same isolated-port trick as scenario-mid-combat.test.ts.
 */

import { afterAll, describe, expect, test } from "bun:test";

// NOTE: server.ts binds at top-level on first require. Bun runs test files
// In alphabetical order, so `scenario-game-over.test.ts` may load the
// Server BEFORE `scenario-mid-combat.test.ts`. We pick the SAME port as
// Mid-combat (33701) so both files share one server instance — the
// `require` cache returns the same module and we hit whichever port won
// The race. Using a different port here would silently bind 33701 first
// (because scenario-game-over runs first alphabetically) and the
// Mid-combat test would fail.
process.env.RIFTBOUND_PORT = "33701";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const serverMod = require("../server") as { default?: { stop?: () => void } };

const PORT = 33_701;
const BASE = `http://localhost:${PORT}`;

afterAll(() => {
  try {
    serverMod.default?.stop?.();
  } catch {
    // Ignore
  }
});

describe("POST /api/v2/scenario/game-over/:sessionId", () => {
  test("seeds a finished state with winner reflected in the SPA view", async () => {
    const sessionId = `gameover-test-${Date.now()}`;
    const r = await fetch(`${BASE}/api/v2/scenario/game-over/${sessionId}`, {
      body: JSON.stringify({ winner: "player-1" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(r.ok).toBe(true);
    const body = (await r.json()) as {
      ok: boolean;
      seed: { seeded: boolean; winnerId?: string };
      view: { winner?: string | null; status?: string };
    };
    expect(body.ok).toBe(true);
    expect(body.seed.seeded).toBe(true);
    expect(body.seed.winnerId).toBe("player-1");
    expect(body.view.winner).toBe("player-1");
    expect(body.view.status).toBe("finished");
  });

  test("defaults to player-1 and accepts player-2 explicitly", async () => {
    const sessionA = `gameover-default-${Date.now()}`;
    const ra = await fetch(`${BASE}/api/v2/scenario/game-over/${sessionA}`, {
      body: "{}",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const ba = (await ra.json()) as {
      seed: { winnerId?: string };
      view: { winner?: string | null };
    };
    expect(ba.seed.winnerId).toBe("player-1");
    expect(ba.view.winner).toBe("player-1");

    const sessionB = `gameover-p2-${Date.now()}`;
    const rb = await fetch(`${BASE}/api/v2/scenario/game-over/${sessionB}`, {
      body: JSON.stringify({ winner: "player-2" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const bb = (await rb.json()) as {
      seed: { winnerId?: string };
      view: { winner?: string | null };
    };
    expect(bb.seed.winnerId).toBe("player-2");
    expect(bb.view.winner).toBe("player-2");
  });
});
