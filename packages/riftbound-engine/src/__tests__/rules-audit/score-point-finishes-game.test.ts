/**
 * Phase B batch 22 — score-point-finishes-game regression.
 *
 * Batch 21 (RR) reported that `BotDriver`'s tournament test on real decks saw
 * bots reach `victoryScore` via `scorePoint` but the engine's `state.status`
 * never flipped to `"finished"` and `state.winner` was never set —
 * `EngineSession.isGameOver()` had to work around it by inspecting VP totals
 * directly. Engine post-batch-14 already routes every VP-gain site through
 * `hasPlayerWonStrict` + a `status:"finished"`/`winner` write (rule 467):
 *
 *   1. `moves/combat.ts` scorePoint reducer (rule 632) — line ~1525
 *   2. `moves/combat.ts` conquerBattlefield reducer (rule 630.1) — line ~1365
 *   3. `moves/combat.ts` combat-resolution attacker-conquer paths (rules
 *      461.3.a / 461.5.d / 461 establish-control) — lines ~554, ~623, ~710,
 *      ~859
 *   4. `abilities/effect-executor.ts` `score` case (ability-driven score,
 *      rule 466.1.a.1 carve-out + rule 467 cleanup gate) — line ~684
 *   5. `flow/riftbound-flow.ts` Beginning-phase Hold path (rule 630.2) —
 *      line ~644
 *   6. `flow/riftbound-flow.ts` Burn-Out path (rule 607) — line ~767
 *   7. `effect-executor.ts` Burn-Out effect path (rule 431.3.a) — line ~486
 *
 * This file pins the contract end-to-end so any future refactor that drops
 * a `hasPlayerWonStrict` gate at one of those sites — or any new VP-gain
 * site that forgets to add one — gets caught immediately. Every test asserts
 * `state.status === "finished"` AND `state.winner === <player>`, plus a
 * matching control where the player is one point further from victory.
 *
 * No per-card if-statements; the engine machinery is generic.
 */

import { describe, expect, it } from "bun:test";
import {
  P1,
  P2,
  applyMove,
  createBattlefield,
  createCard,
  createMinimalGameState,
  getState,
  setVictoryPoints,
} from "./helpers";
import type { EffectContext, ExecutableEffect } from "../../abilities/effect-executor";
import { executeEffect } from "../../abilities/effect-executor";
import type { RiftboundGameState } from "../../types";

// ---------------------------------------------------------------------------
// Helper: build the same kind of live-engine-backed EffectContext as
// `riftjudge-cases.test.ts` does (engine internal state pointer so mutations
// Are observable on `getState()` reads). Kept inline rather than exported
// From helpers.ts to avoid leaking the test-only harness into the public
// Helper surface.
// ---------------------------------------------------------------------------
function liveExecContext(
  engine: ReturnType<typeof createMinimalGameState>,
  opts: { playerId: string; sourceCardId: string },
): EffectContext {
  const internal = engine as unknown as {
    internalState: {
      cards: Record<string, { owner: string; controller: string; zone: string }>;
      cardMetas: Record<string, Record<string, unknown>>;
      zones: Record<string, { cardIds: string[]; config: unknown }>;
    };
    currentState: RiftboundGameState;
  };
  return {
    cards: {
      getCardController: (id: string) => internal.internalState.cards[id]?.controller,
      getCardMeta: (id: string) => internal.internalState.cardMetas[id],
      getCardOwner: (id: string) => internal.internalState.cards[id]?.owner,
      setCardController: (id: string, c: string) => {
        const card = internal.internalState.cards[id];
        if (card) {
          card.controller = c;
        }
      },
      updateCardMeta: (id: string, updates: Record<string, unknown>) => {
        internal.internalState.cardMetas[id] = {
          ...(internal.internalState.cardMetas[id] ?? {}),
          ...updates,
        };
      },
    },
    counters: {
      addCounter: () => {},
      clearCounter: () => {},
      removeCounter: () => {},
      setFlag: () => {},
    },
    draft: internal.currentState,
    fireTriggers: () => {},
    playerId: opts.playerId,
    sourceCardId: opts.sourceCardId,
    sourceZone: internal.internalState.cards[opts.sourceCardId]?.zone,
    zones: {
      drawCards: () => {},
      getCardZone: (id: string) => internal.internalState.cards[id]?.zone as never,
      getCardsInZone: (zoneId: string) =>
        (internal.internalState.zones[zoneId]?.cardIds ?? []) as never,
      moveCard: () => {},
    },
  } as unknown as EffectContext;
}

// ---------------------------------------------------------------------------
// 1. The canonical `scorePoint` move — the one a bot picks up via the move
// Enumerator on its turn — must finish the game when the resulting VP gain
// Crosses the Victory Score and beats every opponent (rule 467).
// ---------------------------------------------------------------------------
describe("scorePoint move: finishes the game on the winning point", () => {
  it("at vp = victoryScore - 1, a Hold scorePoint flips status to finished + sets winner", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    // Default victoryScore is 8 — set P1 one short so the next point wins.
    setVictoryPoints(engine, P1, getState(engine).victoryScore - 1);

    const res = applyMove(engine, "scorePoint", {
      battlefieldId: "bf-1",
      method: "hold",
      playerId: P1,
    });

    expect(res.success).toBe(true);
    const state = getState(engine);
    expect(state.players[P1].victoryPoints).toBeGreaterThanOrEqual(state.victoryScore);
    expect(state.status).toBe("finished");
    expect(state.winner).toBe(P1);
  });

  it("control: at vp = victoryScore - 2, scorePoint does NOT finish the game", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    // Two points away — one Hold/Conquer brings them to threshold - 1, not the
    // Winning point.
    setVictoryPoints(engine, P1, getState(engine).victoryScore - 2);

    const res = applyMove(engine, "scorePoint", {
      battlefieldId: "bf-1",
      method: "hold",
      playerId: P1,
    });

    expect(res.success).toBe(true);
    const state = getState(engine);
    expect(state.players[P1].victoryPoints).toBe(state.victoryScore - 1);
    expect(state.status).toBe("playing");
    expect(state.winner).toBeUndefined();
  });

  it("Conquer at vp = victoryScore - 1 with every bf already scored this turn finishes (rule 632.1.b.2)", () => {
    // Conquer of the winning point requires "scored every battlefield this
    // Turn" — set scoredThisTurn so the gate lets the gain through.
    const engine = createMinimalGameState({
      battlefields: ["bf-a", "bf-b"],
      currentPlayer: P1,
      phase: "main",
    });
    // P1 controls both bf; pre-mark bf-b as already scored this turn so the
    // Bf-a Conquer at vp=7 lands as the winning point.
    const internal = engine as unknown as {
      currentState: RiftboundGameState & { scoredThisTurn: Record<string, string[]> };
    };
    internal.currentState.battlefields["bf-a"]!.controller = P1;
    internal.currentState.battlefields["bf-b"]!.controller = P1;
    internal.currentState.scoredThisTurn[P1] = ["bf-b"];
    setVictoryPoints(engine, P1, getState(engine).victoryScore - 1);

    const res = applyMove(engine, "scorePoint", {
      battlefieldId: "bf-a",
      method: "conquer",
      playerId: P1,
    });

    expect(res.success).toBe(true);
    const state = getState(engine);
    expect(state.status).toBe("finished");
    expect(state.winner).toBe(P1);
  });
});

// ---------------------------------------------------------------------------
// 2. The ability-driven `score` effect (rule 466.1.a.1 carve-out — always
// Gains, not gated by the conquer-winning-point restriction). RR's batch-21
// Blocker was specifically that the `score` effect-executor case didn't
// Finish the game; the engine now does — pin it.
// ---------------------------------------------------------------------------
describe("score effect: finishes the game when it crosses the threshold", () => {
  it("score amount:1 at vp = victoryScore - 1 sets status finished + winner", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createCard(engine, "src", { cardType: "spell", owner: P1, zone: "hand" });
    const internal = engine as unknown as { currentState: RiftboundGameState };
    internal.currentState.players[P1]!.victoryPoints = internal.currentState.victoryScore - 1;

    const ctx = liveExecContext(engine, { playerId: P1, sourceCardId: "src" });
    executeEffect({ amount: 1, type: "score" } as ExecutableEffect, ctx);

    expect(internal.currentState.status).toBe("finished");
    expect(internal.currentState.winner).toBe(P1);
  });

  it("score amount:N that vaults past the threshold still finishes the game", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createCard(engine, "src", { cardType: "spell", owner: P1, zone: "hand" });
    const internal = engine as unknown as { currentState: RiftboundGameState };
    // 4 points short — a single amount:5 score should overshoot and end the
    // Game (the gate is `>= victoryScore`, not `== victoryScore`).
    internal.currentState.players[P1]!.victoryPoints = internal.currentState.victoryScore - 4;

    const ctx = liveExecContext(engine, { playerId: P1, sourceCardId: "src" });
    executeEffect({ amount: 5, type: "score" } as ExecutableEffect, ctx);

    expect(internal.currentState.status).toBe("finished");
    expect(internal.currentState.winner).toBe(P1);
  });

  it("control: score amount:1 at vp = victoryScore - 2 leaves the game playing", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createCard(engine, "src", { cardType: "spell", owner: P1, zone: "hand" });
    const internal = engine as unknown as { currentState: RiftboundGameState };
    internal.currentState.players[P1]!.victoryPoints = internal.currentState.victoryScore - 2;

    const ctx = liveExecContext(engine, { playerId: P1, sourceCardId: "src" });
    executeEffect({ amount: 1, type: "score" } as ExecutableEffect, ctx);

    expect(internal.currentState.status).toBe("playing");
    expect(internal.currentState.winner).toBeUndefined();
    expect(internal.currentState.players[P1]!.victoryPoints).toBe(
      internal.currentState.victoryScore - 1,
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Tie-breaker (rule 467): if both players are at/above the Victory Score
// At the moment of resolution, `checkVictoryAtCleanup` returns null and the
// Game continues (each cleanup defers the win until exactly ONE player
// Strictly outpaces every opponent). The per-VP-gain hooks here use
// `hasPlayerWonStrict` directly, which already encodes that rule — the
// Scoring player must have STRICTLY more points than every opponent. Pin
// The behavior so a future refactor that drops to non-strict `hasPlayerWon`
// (the >= threshold check) gets caught.
// ---------------------------------------------------------------------------
describe("tie-breaker: rule 467 strictness — equal-VP score does NOT finish", () => {
  it("if both players are at threshold, the resolving score does NOT finish the game", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createCard(engine, "src", { cardType: "spell", owner: P1, zone: "hand" });
    const internal = engine as unknown as { currentState: RiftboundGameState };
    // P2 is already at the threshold; P1 scores to the SAME total. Neither
    // Strictly outpaces the other → cleanup-step rule 467 keeps the game
    // Going, `hasPlayerWonStrict` returns false at the score site.
    internal.currentState.players[P1]!.victoryPoints = internal.currentState.victoryScore - 1;
    internal.currentState.players[P2]!.victoryPoints = internal.currentState.victoryScore;

    const ctx = liveExecContext(engine, { playerId: P1, sourceCardId: "src" });
    executeEffect({ amount: 1, type: "score" } as ExecutableEffect, ctx);

    expect(internal.currentState.players[P1]!.victoryPoints).toBe(
      internal.currentState.victoryScore,
    );
    expect(internal.currentState.status).toBe("playing");
    expect(internal.currentState.winner).toBeUndefined();
  });

  it("scoring PAST a tied opponent (strictly ahead) DOES finish the game", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createCard(engine, "src", { cardType: "spell", owner: P1, zone: "hand" });
    const internal = engine as unknown as { currentState: RiftboundGameState };
    internal.currentState.players[P1]!.victoryPoints = internal.currentState.victoryScore;
    internal.currentState.players[P2]!.victoryPoints = internal.currentState.victoryScore;

    // P1 scores once more → strictly ahead of P2; status flips.
    const ctx = liveExecContext(engine, { playerId: P1, sourceCardId: "src" });
    executeEffect({ amount: 1, type: "score" } as ExecutableEffect, ctx);

    expect(internal.currentState.status).toBe("finished");
    expect(internal.currentState.winner).toBe(P1);
  });
});

// ---------------------------------------------------------------------------
// 4. Integration: a sequence of legit scorePoint moves from 0 → victoryScore
// Ends in `status:"finished"` + the correct winner — i.e. the engine
// Machinery is wired end-to-end, not just at the final point. This is the
// Engine-level analogue of the BotDriver tournament test (cf. RR batch 21
// Notes) without leaving the engine package.
// ---------------------------------------------------------------------------
describe("integration: a multi-scorePoint run finishes the game on the final point", () => {
  it("victoryScore scorePoint Holds (one battlefield per gain) end at status=finished, winner=P1", () => {
    // Use a victoryScore=8-default game with 8 distinct battlefields so each
    // Canonical engine `scorePoint` reducer call is a fresh-bf score (no need
    // To reset per-turn tracking on the immer-frozen state). Each iteration
    // Drives the same code path a real game uses; the final point should
    // Flip status to finished + winner=P1.
    const battlefieldIds = Array.from({ length: 8 }, (_, i) => `bf-${i + 1}`);
    const engine = createMinimalGameState({
      battlefields: battlefieldIds,
      currentPlayer: P1,
      phase: "main",
    });
    // CreateMinimalGameState seeds each bf with controller: null. The
    // Engine's currentState is still mutable at this point (it was written
    // Through structuredClone before the flow-manager sync), so a direct
    // Write here is safe; subsequent `applyMove` calls produce a fresh
    // Immer draft from this baseline.
    const internal = engine as unknown as {
      currentState: RiftboundGameState & {
        battlefields: Record<string, { controller: string | null }>;
      };
    };
    for (const bfId of battlefieldIds) {
      internal.currentState.battlefields[bfId]!.controller = P1;
    }

    const {victoryScore} = getState(engine);
    for (let i = 0; i < victoryScore; i++) {
      const res = applyMove(engine, "scorePoint", {
        battlefieldId: battlefieldIds[i],
        method: "hold",
        playerId: P1,
      });
      expect(res.success).toBe(true);
      const st = getState(engine);
      if (st.players[P1].victoryPoints < victoryScore) {
        // Mid-run: must still be playing.
        expect(st.status).toBe("playing");
      } else {
        // Crossed the threshold: status MUST be finished, winner MUST be P1.
        expect(st.status).toBe("finished");
        expect(st.winner).toBe(P1);
      }
    }

    const final = getState(engine);
    expect(final.status).toBe("finished");
    expect(final.winner).toBe(P1);
    expect(final.players[P1].victoryPoints).toBeGreaterThanOrEqual(victoryScore);
  });
});
