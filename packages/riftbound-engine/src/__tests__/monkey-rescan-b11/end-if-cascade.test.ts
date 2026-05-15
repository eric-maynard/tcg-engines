/**
 * Phase B batch 12 - monkey-rescan finding R-1: endIf cascade not pumped.
 *
 * Discovered by the random-monkey harness (scripts/random-monkey/run.ts)
 * after the harness-side workaround for O-1 (engine→flow read-back) was
 * applied. With state visible, the monkey could see the engine's view of
 * `state.turn.phase` is stuck at `channel` immediately after
 * `transitionToPlay`, even though Riftbound's flow defines
 * `beginning → channel → draw → main` with `endIf: () => true` on every
 * non-main phase. The expected end state is `main`.
 *
 * Root cause: `FlowManager.checkEndConditions()` in @tcg/core fires at
 * most ONE transition per call (each branch returns after triggering
 * one of step / phase / turn / segment). The engine's `executeMove` and
 * the public `nextPhase()` / `nextTurn()` etc. each call
 * `checkEndConditions()` exactly once after their own transition, so a
 * chain of phases with `endIf: () => true` only advances 1-2 steps,
 * never to the actual rest state.
 *
 * Effect on play:
 *   - After `transitionToPlay` (which ends the setup segment), the FM
 *     enters `beginning` and runs its `onBegin`, then checkEndConditions
 *     transitions `beginning → channel`. STOPS. Engine view: phase=channel.
 *     The player is supposed to be in `main` and able to play cards.
 *     Instead the only legal move is `endTurn` (which also doesn't work
 *     correctly per finding O-1).
 *
 * STATUS: punted to a future batch — the fix lives in @tcg/core
 * (`checkEndConditions` should loop until no transition fires). A naive
 * loop fix breaks `rules-audit/helpers.ts::advancePhase` and the
 * 515.1-awaken regression test because those helpers depend on the
 * step-by-step buggy behavior to land on intermediate phases that are
 * actually unobservable at the rules level (awaken auto-advances to
 * beginning, etc.). Fixing properly requires also updating the helper
 * to drive phases via a different mechanism (e.g. `runPhaseHook` —
 * which already exists for surgical hook execution).
 *
 * The monkey harness works around this by repeatedly calling
 * `flowManager.checkEndConditions()` until the phase / player / turn
 * stop changing (see `syncFlowIntoEngine` in
 * `scripts/random-monkey/run.ts`).
 *
 * This test LOCKS THE BUG via `.todo`: it documents the expected
 * behavior, and once the core fix + helper update both land, drop the
 * `.todo` and it should pass.
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
    { seed: "monkey-b12-cascade" },
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
  return engine;
}

describe("monkey-b12 finding R-1: endIf cascade must pump to stable", () => {
  test("baseline: FM does NOT cascade through endIf:true chain in one call (proves the bug)", () => {
    const engine = setupPlayingGame();
    const fm = (engine as unknown as {
      getFlowManager(): {
        getCurrentPhase(): string | undefined;
        checkEndConditions(): void;
      };
    }).getFlowManager();
    // Right after transitionToPlay, the flow manager has only made it to
    // `channel` (one transition fired during the post-move check). The
    // Chain is `beginning → channel → draw → main`; the FM should be in
    // `main`, but it's stuck.
    expect(fm.getCurrentPhase()).toBe("channel");

    // Hand-pumping checkEndConditions repeatedly DOES make progress —
    // Each call fires one transition. This is the proof that the data
    // Is there, only the loop is missing.
    fm.checkEndConditions();
    expect(fm.getCurrentPhase()).toBe("draw");
    fm.checkEndConditions();
    expect(fm.getCurrentPhase()).toBe("main");
  });

  test.todo(
    "(WAITING ON CORE FIX) after transitionToPlay, FM cascades to `main` in a single check",
    () => {
      const engine = setupPlayingGame();
      const fm = (engine as unknown as {
        getFlowManager(): { getCurrentPhase(): string | undefined };
      }).getFlowManager();
      // After the chain of `endIf: () => true` phases, the FM should be
      // At `main` — the first phase with `endIf: () => false` where the
      // Active player can actually act.
      expect(fm.getCurrentPhase()).toBe("main");
    },
  );

  test.todo(
    "(WAITING ON CORE FIX + O-1) engine view of state.turn.phase is `main` after setup",
    () => {
      const engine = setupPlayingGame();
      const state = engine.getState();
      // This requires BOTH fixes: the FM must cascade to `main`, AND the
      // Engine must read back the FM's `state.turn.phase` (finding O-1).
      expect(state.turn.phase).toBe("main");
    },
  );
});
