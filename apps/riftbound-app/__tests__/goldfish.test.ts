/**
 * Slice 6 — Goldfish mode HTTP endpoint integration tests.
 *
 * Spins up the actual server on an isolated port (sharing the port with the
 * other server-loading tests so bun:test's single-process runner reuses one
 * `Bun.serve`). Validates:
 *
 *   - POST /api/goldfish/start returns a sessionId tied to a live demoSession
 *   - The returned session is queryable via /api/v2/state/:id and yields
 *     a 2-player view with player-1 as the "human" seat
 *   - /api/v2/step/:id only auto-advances player-2 (the bot), never player-1
 */

import { afterAll, describe, expect, test } from "bun:test";

process.env.RIFTBOUND_PORT = "33701";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const serverMod = require("../server") as { default?: { stop?: () => void } };

const PORT = 33_701;
const BASE = `http://localhost:${PORT}`;

afterAll(() => {
  try { serverMod.default?.stop?.(); } catch { /* */ }
});

interface GoldfishStartResp {
  sessionId: string;
  deckId: string | null;
  mode: "goldfish";
}

interface V2StateResp {
  view: {
    players: readonly { id: string }[];
    turn: { activePlayer: string };
    status: string;
  };
}

interface StepResp {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
}

describe("POST /api/goldfish/start", () => {
  test("creates a goldfish session without auth and returns a sessionId", async () => {
    const r = await fetch(`${BASE}/api/goldfish/start`, {
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(r.ok).toBe(true);
    const body = (await r.json()) as GoldfishStartResp;
    expect(typeof body.sessionId).toBe("string");
    expect(body.sessionId.length).toBeGreaterThan(0);
    expect(body.mode).toBe("goldfish");
  });

  test("accepts optional deckId in the body", async () => {
    const r = await fetch(`${BASE}/api/goldfish/start`, {
      body: JSON.stringify({ deckId: "demo-deck-1" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(r.ok).toBe(true);
    const body = (await r.json()) as GoldfishStartResp;
    expect(body.deckId).toBe("demo-deck-1");
  });

  test("session is queryable via /api/v2/state/:id with 2 players", async () => {
    const startR = await fetch(`${BASE}/api/goldfish/start`, {
      body: "{}",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const { sessionId } = (await startR.json()) as GoldfishStartResp;

    const stateR = await fetch(`${BASE}/api/v2/state/${sessionId}`);
    expect(stateR.ok).toBe(true);
    const state = (await stateR.json()) as V2StateResp;
    expect(state.view.players.length).toBe(2);
    expect(state.view.players[0].id).toBe("player-1");
    expect(state.view.players[1].id).toBe("player-2");
  });

  test("step skips when active player is the human (player-1)", async () => {
    const startR = await fetch(`${BASE}/api/goldfish/start`, {
      body: "{}",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const { sessionId } = (await startR.json()) as GoldfishStartResp;

    // Initial active player is player-1 (the human seat) — Step should
    // Skip with `it's the human's turn`.
    const stepR = await fetch(`${BASE}/api/v2/step/${sessionId}`, {
      method: "POST",
    });
    expect(stepR.ok).toBe(true);
    const stepBody = (await stepR.json()) as StepResp;
    expect(stepBody.skipped).toBe(true);
    expect(stepBody.reason).toContain("human");
  });
});
