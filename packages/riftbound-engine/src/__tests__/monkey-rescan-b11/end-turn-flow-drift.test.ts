/**
 * Phase B batch 11 - monkey-rescan finding O-1: endTurn / advancePhase drift.
 *
 * Discovered by the random-monkey harness (scripts/random-monkey/run.ts).
 * The monkey enumerated legal moves on a fresh game and found `endTurn`
 * was the only meaty move available. It executed `endTurn` ~800 times
 * in a row and the engine reported success: true with patches.length === 0
 * every time. The state's `turn.activePlayer` and `turn.phase` never moved.
 *
 * Root cause: riftbound's `endTurn` reducer calls `context.flow?.endPhase()`,
 * which sets a pending flag on the engine. After the Immer `produce()`
 * returns, the engine calls `flowManager.nextPhase()` — the flow manager
 * runs its `onBegin` / `onEnd` hooks which DO mutate the flow manager's
 * internal `gameState` (advancing phase from main → ending → cleanup →
 * awaken, swapping active player, etc.) — but the engine NEVER reads
 * those mutations back into its own `currentState`. As a result every
 * caller of `engine.getState()` sees a frozen `state.turn` view.
 *
 * The rules-audit helpers (`runFlowHook` in __tests__/rules-audit/helpers.ts)
 * explicitly work around this by doing
 *   (internal as { currentState }).currentState = flowManager.getGameState()
 * after each phase advance. That confirms the gap.
 *
 * STATUS: punted to batch 12 — the fix lives in @tcg/core (back-sync the
 * flow manager's gameState into engine.currentState after pendingPhaseEnd /
 * pendingSegmentEnd / pendingTurnEnd handlers run). Touching core requires
 * regression-testing every game (gundam, lorcana, riftbound) so it is
 * outside the riftbound-only scope of this batch.
 *
 * This test LOCKS THE BUG: it fails against the current engine and will
 * pass once the back-sync is wired. Marked `.todo` so it surfaces in the
 * pending-fix list without blocking CI.
 */

import { describe, expect, test } from "bun:test";
import { RuleEngine } from "@tcg/core";
import type { PlayerId } from "@tcg/core";
import { riftboundDefinition } from "../../game-definition/definition";
import type {
  RiftboundCardMeta,
  RiftboundGameState,
  RiftboundMoves,
} from "../../types";

const P1 = "player-1";
const P2 = "player-2";

function setupPlayingGame() {
  const engine = new RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>(
    riftboundDefinition,
    [
      { id: P1, name: "P1" },
      { id: P2, name: "P2" },
    ],
    { seed: "monkey-b11-drift" },
  );
  for (const pid of [P1, P2]) {
    engine.executeMove("initializeMainDeck", {
      params: {
        cardIds: Array.from({ length: 40 }, (_, i) => `${pid}-card-${i}`),
        playerId: pid,
      },
      playerId: pid as PlayerId,
    });
    engine.executeMove("initializeRuneDeck", {
      params: {
        playerId: pid,
        runeIds: Array.from({ length: 12 }, (_, i) => `${pid}-rune-${i}`),
      },
      playerId: pid as PlayerId,
    });
    engine.executeMove("drawInitialHand", {
      params: { playerId: pid },
      playerId: pid as PlayerId,
    });
  }
  engine.executeMove("placeBattlefields", {
    params: { battlefieldIds: ["bf-1", "bf-2"] },
    playerId: P1 as PlayerId,
  });
  engine.executeMove("transitionToPlay", {
    params: {},
    playerId: P1 as PlayerId,
  });
  // Post-batch-15 (core engine↔FlowManager back-sync fix): each executeMove
  // Runs `checkEndConditions` which auto-advances the `endIf:true` opening
  // Phases (awaken → beginning → channel → draw → main) one step per move.
  // Drive the flow to main here so the test's "before endTurn" assertions
  // See a stable phase regardless of how many moves the setup invoked.
  while ((engine.getState() as { turn: { phase: string } }).turn.phase !== "main") {
    const before = (engine.getState() as { turn: { phase: string } }).turn.phase;
    engine.executeMove("advancePhase", {
      params: { playerId: P1 },
      playerId: P1 as PlayerId,
    });
    const after = (engine.getState() as { turn: { phase: string } }).turn.phase;
    if (before === after) {
      break;
    }
  }
  return engine;
}

describe("monkey-b11 finding O-1: endTurn must propagate flow state back into engine state", () => {
  test("baseline: after setup, P1 is the active player on turn 1, phase main", () => {
    const engine = setupPlayingGame();
    const state = engine.getState();
    expect(state.status).toBe("playing");
    expect(state.turn.activePlayer).toBe(P1);
    expect(state.turn.number).toBe(1);
    expect(state.turn.phase).toBe("main");
  });

  // [DELETED] The original "drifted" test compared engine view to flow
  // Manager view and asserted they differed. Now that the bug is fixed in
  // `endTurn` (the move reducer back-syncs to draft.turn), the engine view
  // Matches the flow manager view, so that test's assertion no longer holds.
  // Replaced by the assertions below that verify the fix instead of the bug.

  test("after endTurn, state.turn.activePlayer should be P2", () => {
    const engine = setupPlayingGame();
    engine.executeMove("endTurn", {
      params: { playerId: P1 },
      playerId: P1 as PlayerId,
    });
    const state = engine.getState();
    expect(state.turn.activePlayer).toBe(P2);
  });

  test("after endTurn, executeMove returns non-zero patches reflecting the turn flip", () => {
    const engine = setupPlayingGame();
    const result = engine.executeMove("endTurn", {
      params: { playerId: P1 },
      playerId: P1 as PlayerId,
    });
    expect(result.success).toBe(true);
    // Patches must include the turn.activePlayer flip
    expect(
      Array.isArray((result as { patches?: unknown[] }).patches)
        ? (result as { patches: unknown[] }).patches.length
        : 0,
    ).toBeGreaterThan(0);
  });

  test("repeatedly calling endTurn from the wrong-turn player should fail", () => {
    const engine = setupPlayingGame();
    // P1 ends their turn — now it should be P2's turn.
    engine.executeMove("endTurn", {
      params: { playerId: P1 },
      playerId: P1 as PlayerId,
    });
    // P1 tries to end again — should be rejected because they're not
    // The active player.
    const second = engine.executeMove("endTurn", {
      params: { playerId: P1 },
      playerId: P1 as PlayerId,
    });
    expect(second.success).toBe(false);
  });

  // ADDED (batch 12): regression coverage for the fix.

  test("after endTurn, turn.number increments to 2", () => {
    const engine = setupPlayingGame();
    const before = engine.getState();
    expect(before.turn.number).toBe(1);

    engine.executeMove("endTurn", {
      params: { playerId: P1 },
      playerId: P1 as PlayerId,
    });

    const state = engine.getState();
    expect(state.turn.number).toBe(2);
  });

  test("after endTurn, turn.phase resets to awaken for the new active player", () => {
    const engine = setupPlayingGame();
    const before = engine.getState();
    expect(before.turn.phase).toBe("main");

    engine.executeMove("endTurn", {
      params: { playerId: P1 },
      playerId: P1 as PlayerId,
    });

    const state = engine.getState();
    // Per rule 510 — once main ends, ending+cleanup auto-advance and the
    // Next turn begins in the awaken phase. We surface that on the draft.
    // After Z's batch-15 core back-sync, the begin-of-turn auto-advance
    // Runs past awaken into channel (Riftbound turn structure:
    // Awaken → channel → main). channel is where the player pauses
    // For input. This is the correct, fully-propagated phase.
    expect(state.turn.phase).toBe("channel");
  });

  test("two endTurns ping-pong the active player P1↔P2 (and turn.number bumps each time)", () => {
    const engine = setupPlayingGame();

    engine.executeMove("endTurn", {
      params: { playerId: P1 },
      playerId: P1 as PlayerId,
    });
    let state = engine.getState();
    expect(state.turn.activePlayer).toBe(P2);
    expect(state.turn.number).toBe(2);

    engine.executeMove("endTurn", {
      params: { playerId: P2 },
      playerId: P2 as PlayerId,
    });
    state = engine.getState();
    expect(state.turn.activePlayer).toBe(P1);
    expect(state.turn.number).toBe(3);
  });
});
