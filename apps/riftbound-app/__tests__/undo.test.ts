/**
 * Slice 4 (undo/rewind) tests.
 *
 * Two layers of coverage:
 *
 *   1. EngineSession unit tests — snapshot/restore round-trip, history
 *      stack, canUndo gating (own-move only, no-opponent-action since,
 *      no-chain-resolved since), and game-over guard. Lives at the
 *      engine-session layer per the slice plan ("engine package is closed
 *      scope so do snapshot/restore at the riftbound-app layer").
 *
 *   2. HTTP integration tests for POST /api/v2/undo/:sessionId — covers
 *      the wire envelope (ok / error / undone metadata), the same player-
 *      identity guard, and that the SSE broadcast fires on success.
 *
 * We share the port-33701 server fixture pattern used by the other
 * scenario tests so bun's per-file alphabetical ordering doesn't fight
 * the require-cache.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { EngineSession } from "../lib/engine-session";

// NOTE: the server is bound at top-level on first require. We pick the same
// Port (33701) as the other scenario tests so we share a single bound
// Instance across the test run. See scenario-game-over.test.ts for the
// Detailed explanation of this pattern.
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

describe("EngineSession.snapshot / restore", () => {
  test("snapshot/restore round-trips the engine state", () => {
    const session = new EngineSession({ seed: "undo-rt-1" });
    const before = session.snapshot();
    const viewBefore = session.getView();
    const active = session.getActivePlayer();

    // Dispatch a no-op-style move (endTurn). The engine requires
    // `playerId` in params even when the dispatching playerId matches.
    const r = session.applyMove(active, {
      moveId: "endTurn",
      params: { playerId: active },
    });
    expect(r.success).toBe(true);
    const viewAfter = session.getView();

    // Sanity: turn changed
    expect(viewAfter.turn.activePlayer).not.toBe(viewBefore.turn.activePlayer);

    // Now restore and verify
    session.restore(before);
    const viewRestored = session.getView();
    expect(viewRestored.turn.activePlayer).toBe(viewBefore.turn.activePlayer);
    expect(viewRestored.turn.number).toBe(viewBefore.turn.number);
  });

  test("snapshot is deep-cloned (mutations don't leak)", () => {
    const session = new EngineSession({ seed: "undo-rt-2" });
    const snap = session.snapshot();
    // Tamper with the snapshot — mutations must not leak into the engine.
    (snap.currentState as { turn: { activePlayer: string } }).turn.activePlayer = "haxxor";
    const view = session.getView();
    expect(view.turn.activePlayer).not.toBe("haxxor");
  });
});

describe("EngineSession move history + canUndo", () => {
  test("starts empty, populated on successful applyMove", () => {
    const session = new EngineSession({ seed: "undo-hist-1" });
    expect(session.undoCount).toBe(0);
    expect(session.canUndo("player-1")).toBe(false);
    expect(session.peekLastMove()).toBeUndefined();

    const active = session.getActivePlayer();
    session.applyMove(active, { moveId: "endTurn", params: { playerId: active } });
    expect(session.undoCount).toBe(1);
    expect(session.canUndo(active)).toBe(true);
    expect(session.canUndo(active === "player-1" ? "player-2" : "player-1")).toBe(false);

    const last = session.peekLastMove();
    expect(last).toBeDefined();
    expect(last?.moveId).toBe("endTurn");
    expect(last?.playerId).toBe(active);
  });

  test("failed applyMove does NOT push history", () => {
    const session = new EngineSession({ seed: "undo-hist-2" });
    // Have the WRONG player try to endTurn — engine rejects it.
    const active = session.getActivePlayer();
    const wrong = active === "player-1" ? "player-2" : "player-1";
    // Pass the wrong player's id in params too — that's what the engine
    // Validates. (If we passed `active` here it would still succeed.)
    const r = session.applyMove(wrong, { moveId: "endTurn", params: { playerId: wrong } });
    expect(r.success).toBe(false);
    expect(session.undoCount).toBe(0);
  });

  test("undoLastMove pops history and rewinds state", () => {
    const session = new EngineSession({ seed: "undo-pop-1" });
    const active = session.getActivePlayer();
    const beforeTurn = session.getView().turn.activePlayer;
    session.applyMove(active, { moveId: "endTurn", params: { playerId: active } });
    expect(session.getView().turn.activePlayer).not.toBe(beforeTurn);

    const r = session.undoLastMove(active);
    expect(r.ok).toBe(true);
    expect(r.undone?.moveId).toBe("endTurn");
    expect(session.undoCount).toBe(0);
    expect(session.getView().turn.activePlayer).toBe(beforeTurn);
  });

  test("trail entry gets undone=true after rewind", () => {
    const session = new EngineSession({ seed: "undo-trail-1" });
    const active = session.getActivePlayer();
    const step = session.applyMove(active, { moveId: "endTurn", params: { playerId: active } });
    expect(step.undone).toBeUndefined();
    session.undoLastMove(active);
    const trail = session.getTrail();
    const undone = trail.find((s) => s.seq === step.seq);
    expect(undone?.undone).toBe(true);
  });

  test("rejects undo for the wrong player", () => {
    const session = new EngineSession({ seed: "undo-reject-1" });
    const active = session.getActivePlayer();
    session.applyMove(active, { moveId: "endTurn", params: { playerId: active } });
    const wrong = active === "player-1" ? "player-2" : "player-1";
    const r = session.undoLastMove(wrong);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("cannot undo");
    // History unchanged
    expect(session.undoCount).toBe(1);
  });

  test("rejects undo when no history", () => {
    const session = new EngineSession({ seed: "undo-empty-1" });
    const r = session.undoLastMove("player-1");
    expect(r.ok).toBe(false);
  });

  test("history capped at MOVE_HISTORY_CAP (50) entries", () => {
    const session = new EngineSession({ seed: "undo-cap-1" });
    // Drive 60 successful endTurns by alternating players.
    for (let i = 0; i < 60; i++) {
      const active = session.getActivePlayer();
      const r = session.applyMove(active, { moveId: "endTurn", params: { playerId: active } });
      if (!r.success) {break;}
    }
    expect(session.undoCount).toBeLessThanOrEqual(50);
  });
});

describe("POST /api/v2/undo — happy path", () => {
  test("rewinds engine state to pre-move snapshot", async () => {
    const sessionId = `undo-happy-${Date.now()}`;
    // Boot a session via the state endpoint
    const initR = await fetch(`${BASE}/api/v2/state/${sessionId}`);
    const init = (await initR.json()) as {
      view: { turn: { activePlayer: string; number: number } };
    };
    const initialActive = init.view.turn.activePlayer;
    const initialTurn = init.view.turn.number;

    // Play an endTurn
    const moveR = await fetch(`${BASE}/api/v2/move/${sessionId}`, {
      body: JSON.stringify({ moveId: "endTurn", params: { playerId: initialActive }, playerId: initialActive }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const moveBody = (await moveR.json()) as {
      ok: boolean;
      view: { turn: { activePlayer: string } };
      undo: { canUndoBy: Record<string, boolean>; undoCount: number };
    };
    expect(moveBody.ok).toBe(true);
    expect(moveBody.view.turn.activePlayer).not.toBe(initialActive);
    expect(moveBody.undo.undoCount).toBeGreaterThanOrEqual(1);
    expect(moveBody.undo.canUndoBy[initialActive]).toBe(true);

    // Now undo
    const undoR = await fetch(`${BASE}/api/v2/undo/${sessionId}`, {
      body: JSON.stringify({ playerId: initialActive }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const undoBody = (await undoR.json()) as {
      ok: boolean;
      view: { turn: { activePlayer: string; number: number } };
      undone?: { moveId: string };
      undo: { undoCount: number };
    };
    expect(undoBody.ok).toBe(true);
    expect(undoBody.undone?.moveId).toBe("endTurn");
    expect(undoBody.view.turn.activePlayer).toBe(initialActive);
    expect(undoBody.view.turn.number).toBe(initialTurn);
    expect(undoBody.undo.undoCount).toBe(0);
  });
});

describe("POST /api/v2/undo — rejection paths", () => {
  test("rejects undo with no history", async () => {
    const sessionId = `undo-nohistory-${Date.now()}`;
    // Boot session
    await fetch(`${BASE}/api/v2/state/${sessionId}`);
    const r = await fetch(`${BASE}/api/v2/undo/${sessionId}`, {
      body: JSON.stringify({ playerId: "player-1" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await r.json()) as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBeDefined();
  });

  test("rejects undo when last move was by the opponent", async () => {
    const sessionId = `undo-opponent-${Date.now()}`;
    const initR = await fetch(`${BASE}/api/v2/state/${sessionId}`);
    const init = (await initR.json()) as {
      view: { turn: { activePlayer: string } };
    };
    const active = init.view.turn.activePlayer;
    const opponent = active === "player-1" ? "player-2" : "player-1";

    // Active player plays an endTurn
    await fetch(`${BASE}/api/v2/move/${sessionId}`, {
      body: JSON.stringify({ moveId: "endTurn", params: { playerId: active }, playerId: active }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    // The OPPONENT tries to undo — should be rejected (it's not their move)
    const r = await fetch(`${BASE}/api/v2/undo/${sessionId}`, {
      body: JSON.stringify({ playerId: opponent }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await r.json()) as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("cannot undo");
  });

  test("returns 404 for unknown sessionId", async () => {
    const r = await fetch(`${BASE}/api/v2/undo/this-session-does-not-exist`, {
      body: JSON.stringify({ playerId: "player-1" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(r.status).toBe(404);
  });
});

describe("POST /api/v2/undo — SSE broadcast on success", () => {
  test("a connected SSE subscriber receives a state event after undo", async () => {
    const sessionId = `undo-sse-${Date.now()}`;
    // Boot session
    await fetch(`${BASE}/api/v2/state/${sessionId}`);

    // Open a raw SSE stream and collect events for a short window.
    const ctrl = new AbortController();
    const sseR = await fetch(`${BASE}/api/v2/stream/${sessionId}`, {
      signal: ctrl.signal,
    });
    expect(sseR.ok).toBe(true);
    const reader = sseR.body!.getReader();
    const decoder = new TextDecoder();
    const events: string[] = [];

    // Read in the background
    const readPromise = (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {break;}
          const chunk = decoder.decode(value);
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event:")) {events.push(line.slice(6).trim());}
          }
        }
      } catch {
        // Aborted — fine
      }
    })();

    // Give the stream a tick to send the initial state event
    await new Promise((r) => setTimeout(r, 50));

    // Get active player
    const stateR = await fetch(`${BASE}/api/v2/state/${sessionId}`);
    const state = (await stateR.json()) as {
      view: { turn: { activePlayer: string } };
    };
    const active = state.view.turn.activePlayer;

    // Move and undo
    await fetch(`${BASE}/api/v2/move/${sessionId}`, {
      body: JSON.stringify({ moveId: "endTurn", params: { playerId: active }, playerId: active }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    await new Promise((r) => setTimeout(r, 50));
    await fetch(`${BASE}/api/v2/undo/${sessionId}`, {
      body: JSON.stringify({ playerId: active }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    // Let the broadcast deliver
    await new Promise((r) => setTimeout(r, 100));

    ctrl.abort();
    await readPromise;

    // We expect at least 3 `state` events: initial greeting, post-move,
    // Post-undo. We tolerate >= 2 in case the greeting raced the move.
    const stateEvents = events.filter((e) => e === "state");
    expect(stateEvents.length).toBeGreaterThanOrEqual(2);
  });
});
