/**
 * Bot vs Bot — end-to-end smoke test for the engine↔UI binding.
 *
 * Two `BotDriver`s share one `EngineSession`. We let them play until either
 * the game ends or a turn cap is reached, then assert:
 *   - no thrown errors / uncaught rejections,
 *   - the final state is well-formed (positive scores/energy etc.),
 *   - we either reached a winner *or* hit the turn cap cleanly.
 *
 * The synthetic decks (no real card registry payloads) mean the bots can't
 * actually play units or spells — they mostly cycle resource/end-turn moves.
 * That's fine for a smoke test: the goal is to prove the binding doesn't
 * crash under hundreds of moves.
 */

import { describe, expect, test } from "bun:test";
import { BotDriver } from "../lib/bot-driver";
import { EngineSession } from "../lib/engine-session";

const TURN_CAP = 30;
const MOVE_CAP = 2000;

describe("bot vs bot", () => {
  test("runs to game-end or turn cap without crashing", () => {
    const session = new EngineSession({ seed: "bvb-smoke" });
    const bot1 = new BotDriver("player-1", { seed: "bot1" });
    const bot2 = new BotDriver("player-2", { seed: "bot2" });

    let moves = 0;
    let lastTurn = -1;
    let turnsObserved = 0;

    while (!session.isGameOver() && moves < MOVE_CAP) {
      const view = session.getView();

      if (view.turn.number !== lastTurn) {
        lastTurn = view.turn.number;
        turnsObserved++;
        if (turnsObserved > TURN_CAP) {break;}
      }

      const active = view.turn.activePlayer;
      const driver = active === "player-1" ? bot1 : bot2;
      const step = driver.step(session);
      if (!step) {
        // Bot returned null but game isn't over — fall back to explicit endTurn.
        const fallback = session.applyMove(active, {
          moveId: "endTurn",
          params: { playerId: active },
        });
        if (!fallback.success) {break;}
      }
      moves++;
    }

    expect(moves).toBeLessThanOrEqual(MOVE_CAP);
    expect(turnsObserved).toBeGreaterThan(0);

    // Final state well-formedness checks.
    const finalView = session.getView();
    expect(finalView.players).toHaveLength(2);
    for (const p of finalView.players) {
      expect(p.victoryPoints).toBeGreaterThanOrEqual(0);
      expect(p.victoryPoints).toBeLessThanOrEqual(finalView.victoryScore + 8);
      expect(p.handSize).toBeGreaterThanOrEqual(0);
      expect(p.deckSize).toBeGreaterThanOrEqual(0);
      expect(p.energy).toBeGreaterThanOrEqual(0);
      for (const [, v] of Object.entries(p.power)) {
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
    expect(["setup", "playing", "finished"]).toContain(finalView.status);
    if (finalView.status === "finished") {
      expect(finalView.winner).not.toBeNull();
    }
  });

  test("trail captures every move and view snapshots are JSON-safe", () => {
    const session = new EngineSession({ seed: "bvb-trail" });
    const bot1 = new BotDriver("player-1", { seed: "bot1" });
    const bot2 = new BotDriver("player-2", { seed: "bot2" });

    for (let i = 0; i < 50 && !session.isGameOver(); i++) {
      const active = session.getActivePlayer();
      const step = (active === "player-1" ? bot1 : bot2).step(session);
      if (!step) {
        session.applyMove(active, {
          moveId: "endTurn",
          params: { playerId: active },
        });
      }
    }

    const trail = session.getTrail();
    expect(trail.length).toBeGreaterThan(0);
    // Sequence numbers should be 1..N strictly increasing.
    for (let i = 0; i < trail.length; i++) {
      expect(trail[i].seq).toBe(i + 1);
    }
    // Every step should round-trip through JSON.
    const round = JSON.parse(JSON.stringify(trail));
    expect(round.length).toBe(trail.length);
    expect(round[0].moveId).toBe(trail[0].moveId);
  });

  test("bot returns null when it is not its turn", () => {
    const session = new EngineSession({ seed: "bvb-turn" });
    // It's player-1's turn at start.
    const bot2 = new BotDriver("player-2");
    expect(bot2.step(session)).toBeNull();
  });

  test("active player flips at least once over many moves", () => {
    const session = new EngineSession({ seed: "bvb-flip" });
    const bot1 = new BotDriver("player-1", { seed: "bot1" });
    const bot2 = new BotDriver("player-2", { seed: "bot2" });

    const seenActive = new Set<string>();
    for (let i = 0; i < 200 && !session.isGameOver(); i++) {
      const active = session.getActivePlayer();
      seenActive.add(active);
      const step = (active === "player-1" ? bot1 : bot2).step(session);
      if (!step) {
        const fb = session.applyMove(active, {
          moveId: "endTurn",
          params: { playerId: active },
        });
        if (!fb.success) {break;}
      }
    }
    expect(seenActive.has("player-1")).toBe(true);
    expect(seenActive.has("player-2")).toBe(true);
  });

  test("with realDecks, vanilla BotDriver plays at least one real card across 30 turns", () => {
    // Batch 15 Y fixed the BotDriver dynamic-priority bug: previously the
    // Default `exhaustRune(30) < endTurn(40)` floor meant a vanilla bot
    // Never ramped energy on real decks, so this test had to use an inline
    // Play-greedy picker. With the dynamic raise (`exhaustRune` jumps
    // Above `endTurn` while hand is nonempty + no affordable play), the
    // Default `BotDriver` now drives card plays end-to-end.
    const session = new EngineSession({ realDecks: true, seed: "bvb-real" });
    const bot1 = new BotDriver("player-1", { seed: "bot1" });
    const bot2 = new BotDriver("player-2", { seed: "bot2" });

    const CARD_PLAY_MOVE_IDS = new Set([
      "standardMove",
      "playUnit",
      "playSpell",
      "playGear",
      "playEquipment",
    ]);

    let moves = 0;
    let turnsObserved = 0;
    let lastTurn = -1;
    while (!session.isGameOver() && moves < MOVE_CAP) {
      const view = session.getView();
      if (view.turn.number !== lastTurn) {
        lastTurn = view.turn.number;
        turnsObserved++;
        if (turnsObserved > TURN_CAP) {break;}
      }
      const active = view.turn.activePlayer;
      const step =
        active === "player-1" ? bot1.step(session) : bot2.step(session);
      if (!step) {
        const fb = session.applyMove(active, {
          moveId: "endTurn",
          params: { playerId: active },
        });
        if (!fb.success) {break;}
      }
      moves++;
    }

    const trail = session.getTrail();
    const cardPlays = trail.filter((s) => s.success && CARD_PLAY_MOVE_IDS.has(s.moveId));
    expect(cardPlays.length).toBeGreaterThan(0);
  });

  test("same seed produces same move sequence (determinism)", () => {
    const runOnce = () => {
      const session = new EngineSession({ seed: "bvb-det" });
      const b1 = new BotDriver("player-1", { seed: "b1" });
      const b2 = new BotDriver("player-2", { seed: "b2" });
      for (let i = 0; i < 60 && !session.isGameOver(); i++) {
        const active = session.getActivePlayer();
        const step = (active === "player-1" ? b1 : b2).step(session);
        if (!step) {
          session.applyMove(active, {
            moveId: "endTurn",
            params: { playerId: active },
          });
        }
      }
      return session.getTrail().map((s) => `${s.playerId}:${s.moveId}`);
    };
    expect(runOnce()).toEqual(runOnce());
  });
});
