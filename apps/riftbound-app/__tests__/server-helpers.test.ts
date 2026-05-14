/**
 * Server-helper unit tests — Phase B batch 23 (WW#2, WW#3, WW#4, snapshot lag).
 *
 * These cover the pure helpers exported from `server.ts`:
 *   - `playMoveForCardType` — UI-string → engine-move-id mapping.
 *   - `tryPlayFromHand` — playFromHand fallback that surfaces a SPECIFIC
 *     engine error rather than the misleading "Move 'playCard' not found".
 *   - `getHumanPlayerIds` — default human-player set used by Step Bot to
 *     refuse to act on the human's turn.
 *
 * Integration tests for the v2 HTTP routes themselves run via the full
 * server fixture (out of scope for this batch); the helpers are isolated
 * so we can unit-test the playFromHand-error and step-bot guard without
 * spinning up Bun.serve.
 */

import { describe, expect, test } from "bun:test";
import {
  COMBAT_AND_CHAIN_MOVE_IDS,
  computeActionsLegal,
  getHumanPlayerIds,
  playMoveForCardType,
  routeCombatOrChainMove,
  setHumanPlayerIds,
  tryPlayFromHand,
} from "../lib/server-helpers";
import { EngineSession } from "../lib/engine-session";

describe("playMoveForCardType", () => {
  test("maps Unit/Champion/Legend → playUnit", () => {
    expect(playMoveForCardType("Unit")).toBe("playUnit");
    expect(playMoveForCardType("unit")).toBe("playUnit");
    expect(playMoveForCardType("Champion")).toBe("playUnit");
    expect(playMoveForCardType("Legend")).toBe("playUnit");
  });

  test("maps Spell → playSpell, Gear → playGear, Equipment → playEquipment", () => {
    expect(playMoveForCardType("Spell")).toBe("playSpell");
    expect(playMoveForCardType("Gear")).toBe("playGear");
    expect(playMoveForCardType("Equipment")).toBe("playEquipment");
  });

  test("returns undefined for unknown / empty / undefined", () => {
    expect(playMoveForCardType(undefined)).toBeUndefined();
    expect(playMoveForCardType("")).toBeUndefined();
    expect(playMoveForCardType("Battlefield")).toBeUndefined();
  });
});

describe("getHumanPlayerIds", () => {
  test("defaults to {player-1} when session not registered", () => {
    const ids = getHumanPlayerIds("brand-new-session-id-xyz");
    expect(ids.has("player-1")).toBe(true);
    expect(ids.has("player-2")).toBe(false);
  });
});

describe("tryPlayFromHand (Goal A — surfaces engine-specific error)", () => {
  test("returns ok=true when one of the engine play moves succeeds", () => {
    // Synthetic deck cards accept `playUnit` on the active player's turn —
    // Verify the happy path AND the attemptedMoveId field for debugging.
    const session = new EngineSession({ seed: "play-from-hand-ok" });
    const hand = session.buildHandView();
    const firstCard = hand["player-1"]?.[0];
    expect(firstCard).toBeDefined();
    const r = tryPlayFromHand(session, "player-1", { cardId: firstCard!.id });
    expect(r.ok).toBe(true);
    expect(r.attemptedMoveId).toBeDefined();
    // The synthetic-deck happy path should resolve via playUnit (the first
    // Fallback after the missing cardType).
    expect(["playUnit", "playSpell", "playGear", "playEquipment"]).toContain(
      r.attemptedMoveId!,
    );
  });

  test("nonexistent cardId surfaces engine-derived error, NOT 'Move not found'", () => {
    const session = new EngineSession({ seed: "play-bad-id" });
    const r = tryPlayFromHand(session, "player-1", { cardId: "no-such-card-id" });
    expect(r.ok).toBe(false);
    expect(r.error).toBeDefined();
    // The bug we're fixing: the dropped `playCard` candidate previously
    // Surfaced "Move 'playCard' not found" — now the message should come
    // From a real engine move (playUnit / playSpell / etc).
    expect(r.error).not.toContain("playCard' not found");
  });

  test("opponent playing on wrong turn surfaces an engine error", () => {
    // Player-2 is NOT active on turn 1; trying to play their card fires
    // An engine reject. The error should reflect that — NOT "Move not found".
    const session = new EngineSession({ seed: "play-wrong-turn" });
    const hand = session.buildHandView();
    const p2Card = hand["player-2"]?.[0];
    expect(p2Card).toBeDefined();
    const r = tryPlayFromHand(session, "player-2", { cardId: p2Card!.id });
    expect(r.ok).toBe(false);
    expect(r.error).toBeDefined();
    expect(r.error).not.toContain("playCard' not found");
  });
});

describe("Step-Bot human-guard (Goal B)", () => {
  test("default human is player-1; player-2 is bot-controlled", () => {
    const session = new EngineSession({ seed: "step-default" });
    const { whoseTurnNow } = computeActionsLegal(session, "session-default-z");
    // Turn 1 starts with player-1 active and player-1 is the default human.
    expect(session.getActivePlayer()).toBe("player-1");
    expect(whoseTurnNow).toBe("human");
  });

  test("can opt player-1 OUT of human set (full bot-vs-bot mode)", () => {
    const session = new EngineSession({ seed: "step-allbots" });
    setHumanPlayerIds("session-allbots", new Set());
    const { whoseTurnNow, actionsLegal } = computeActionsLegal(session, "session-allbots");
    expect(whoseTurnNow).toBe("bot");
    // Step bot should be legal when status playing AND it's the bot's turn.
    expect(actionsLegal.stepBot).toBe(true);
  });

  test("actionsLegal.stepBot is false when it's the human's turn", () => {
    const session = new EngineSession({ seed: "step-human-turn" });
    setHumanPlayerIds("session-human", new Set(["player-1"]));
    expect(session.getActivePlayer()).toBe("player-1");
    const { actionsLegal } = computeActionsLegal(session, "session-human");
    expect(actionsLegal.stepBot).toBe(false);
  });
});

describe("actionsLegal contract (Goal C)", () => {
  test("returns endTurn flag derived from engine.legalMoves", () => {
    const session = new EngineSession({ seed: "actions-legal" });
    const { actionsLegal } = computeActionsLegal(session, "actions-legal-sid");
    // We don't assert the exact bool — main-phase 1 turn 1 should support
    // EndTurn but synthetic decks may differ; the contract is just that
    // The field exists as a boolean.
    expect(typeof actionsLegal.endTurn).toBe("boolean");
    expect(typeof actionsLegal.stepBot).toBe("boolean");
  });

  test("stepBot is false when game has finished", () => {
    const session = new EngineSession({ seed: "actions-finished" });
    setHumanPlayerIds("actions-finished-sid", new Set());
    // Force-finish the game by replacing currentState wholesale (engine
    // Freezes individual fields but the slot itself is writable).
    const engineAny = session.engine as unknown as {
      currentState: Record<string, unknown>;
    };
    const next = { ...engineAny.currentState, status: "finished", winner: "player-1" };
    engineAny.currentState = next;
    const { actionsLegal } = computeActionsLegal(session, "actions-finished-sid");
    expect(actionsLegal.stepBot).toBe(false);
  });
});

describe("actionsLegal combat extensions (Phase B batch 26 GGG)", () => {
  test("exposes combat / chain legality booleans on actionsLegal", () => {
    const session = new EngineSession({ seed: "combat-flags" });
    const { actionsLegal } = computeActionsLegal(session, "combat-flags-sid");
    // Every flag must be a boolean — synthetic-deck setup has no showdown
    // Active so the combat flags are expected to be false, but the contract
    // Is just shape stability.
    expect(typeof actionsLegal.contestBattlefield).toBe("boolean");
    expect(typeof actionsLegal.startShowdown).toBe("boolean");
    expect(typeof actionsLegal.passShowdownFocus).toBe("boolean");
    expect(typeof actionsLegal.passChainPriority).toBe("boolean");
    expect(typeof actionsLegal.resolveCombat).toBe("boolean");
    expect(typeof actionsLegal.assignAttacker).toBe("boolean");
    expect(typeof actionsLegal.assignDefender).toBe("boolean");
    // No showdown active → all combat flags are false at session start.
    expect(actionsLegal.passShowdownFocus).toBe(false);
    expect(actionsLegal.passChainPriority).toBe(false);
    expect(actionsLegal.resolveCombat).toBe(false);
  });
});

describe("routeCombatOrChainMove (Phase B batch 26 GGG)", () => {
  test("allow-list includes the documented combat / chain moves", () => {
    for (const id of [
      "assignAttacker",
      "assignDefender",
      "contestBattlefield",
      "startShowdown",
      "passShowdownFocus",
      "passChainPriority",
      "resolveChain",
      "resolveCombat",
    ]) {
      expect(COMBAT_AND_CHAIN_MOVE_IDS.has(id)).toBe(true);
    }
  });

  test("unknown moveId returns routed:false so the v2 handler can fall through", () => {
    const session = new EngineSession({ seed: "route-unknown" });
    const r = routeCombatOrChainMove(session, "player-1", "endTurn", {});
    expect(r.routed).toBe(false);
    expect(r.ok).toBe(false);
  });

  test("known moveId is forwarded to engine and returns ok=false+error when illegal", () => {
    // `resolveCombat` is in the allow-list but there's no active combat in a
    // Freshly-built synthetic session — the engine MUST reject. The point
    // Of this test is to verify the routing forwards the call AND surfaces
    // The engine's rejection rather than masking it.
    const session = new EngineSession({ seed: "route-known" });
    const r = routeCombatOrChainMove(session, "player-1", "resolveCombat", {
      battlefieldId: "bf-1",
    });
    expect(r.routed).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.error).toBeDefined();
  });

  test("auto-fills playerId from caller when params.playerId absent", () => {
    const session = new EngineSession({ seed: "route-pid" });
    // ContestBattlefield will reject (no contested-eligible bf) but we just
    // Want to confirm routing succeeds without throwing on the missing pid.
    const r = routeCombatOrChainMove(session, "player-1", "contestBattlefield", {
      battlefieldId: "bf-1",
    });
    expect(r.routed).toBe(true);
    // Ok=false because the bf isn't eligible — but routing didn't throw.
    expect(typeof r.ok).toBe("boolean");
  });
});

describe("EngineSession snapshot-lag (Goal D)", () => {
  test("getView() always reflects current state — no caching across applyMove", () => {
    const session = new EngineSession({ seed: "snapshot-fresh" });
    const v1 = session.getView();
    // ApplyMove a no-op (likely-rejected) just to fire a trail step.
    session.applyMove("player-1", { moveId: "endTurn", params: {} });
    const v2 = session.getView();
    // Both views are independent objects (no shared mutation surface).
    expect(v1).not.toBe(v2);
  });

  test("view.status reflects VP-threshold game-over even if engine.state.status lags", () => {
    // We can't directly trigger a winning scorePoint here without real decks,
    // But we CAN verify the buildView fallback path: if isGameOver() agrees
    // We're done, the view should mirror it.
    const session = new EngineSession({ seed: "vp-lag" });
    const view = session.getView();
    // At construction, no one has VP — view should still be "playing".
    expect(view.status).toBe("playing");
    expect(view.winner).toBeNull();
    // Manually replace engine.currentState with a copy where player-1 sits
    // At victoryScore but status is still "playing" — that's the lag bug
    // We're fixing. Engine freezes leaf fields but `currentState` slot
    // Itself is writable.
    const engineAny = session.engine as unknown as {
      currentState: Record<string, unknown> & {
        players: Record<string, Record<string, unknown>>;
        victoryScore: number;
      };
    };
    const cs = engineAny.currentState;
    const next = {
      ...cs,
      players: {
        ...cs.players,
        "player-1": { ...cs.players["player-1"], victoryPoints: cs.victoryScore },
      },
    };
    engineAny.currentState = next;
    expect((engineAny.currentState as unknown as { status: string }).status).toBe("playing");
    // The view's effectiveStatus should derive "finished" from VP.
    const v2 = session.getView();
    expect(v2.status).toBe("finished");
    expect(v2.winner).toBe("player-1");
  });
});
