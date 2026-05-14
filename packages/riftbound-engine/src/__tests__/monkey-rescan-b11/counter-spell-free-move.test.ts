/**
 * Phase B batch 12 - monkey-rescan finding R-3: counterSpell is a free
 * enumerable player move with no cost and no ownership check.
 *
 * Discovered by the random-monkey harness across seeds 1-25. With the
 * full move space exercised (post-R-2 fix), the monkey kept hitting
 * `counterSpell` against any chain item from either player, paying
 * nothing. Across the 25-seed sweep, 175 free counterSpell moves landed.
 *
 * Why this is a bug:
 *   - In Riftbound rules, "counter" is an ABILITY of specific cards
 *     (e.g. cards with the `counter` keyword) — it has a cost (energy /
 *     power) and is itself a chain item. Rule 544.3-544.4: "players
 *     may only counter cards when directed by a game effect".
 *   - The `counterSpell` move's reducer is fine for game effects to
 *     invoke programmatically (mark a chain item as `countered`), but
 *     exposing it via `enumerator` lets a player invoke it directly
 *     with NO cost, NO source card, and NO targeting limitations.
 *   - Effect: the monkey trivially counters any spell the opponent
 *     plays — effectively neutralizing playSpell as a tool because
 *     anything you put on the chain gets countered for free.
 *
 * The current code comments acknowledge this gap:
 *   > "players may only counter cards when directed by a game effect;
 *   >  the move permits any relevant player to invoke it because game
 *   >  effects themselves pick the target and owner, but real card
 *   >  text will funnel through the `counter` effect type in the
 *   >  executor."
 *
 * Fix: the `counterSpell` move should have NO `enumerator` so the
 * generic move-enumeration system doesn't expose it as a free move.
 * Game effects can still invoke it directly via `executeMove`. (We
 * keep `condition` so direct calls still validate.)
 *
 * Generic, no per-card ifs. Locked as a `.todo` test until the
 * enumerator removal lands and the chain interaction model fully
 * funnels real counter effects through card abilities.
 */

import { describe, expect, test } from "bun:test";
import { RuleEngine } from "@tcg/core";
import type { PlayerId } from "@tcg/core";
import { riftboundDefinition } from "../../game-definition/definition";
import {
  CardDefinitionRegistry,
  setGlobalCardRegistry,
} from "../../operations/card-lookup";
import type {
  RiftboundCardMeta,
  RiftboundGameState,
  RiftboundMoves,
} from "../../types";

const P1 = "player-1";
const P2 = "player-2";

function setup() {
  // Seed minimal registry so the play moves work.
  const reg = new CardDefinitionRegistry();
  for (const pid of [P1, P2]) {
    for (let i = 0; i < 40; i++) {
      reg.register(`${pid}-card-${i}`, {
        cardType: "spell",
        energyCost: 1,
        id: `${pid}-card-${i}`,
        name: `M-Spell-${i}`,
        timing: "action",
      });
    }
    for (let i = 0; i < 12; i++) {
      reg.register(`${pid}-rune-${i}`, {
        cardType: "rune",
        energyCost: 0,
        id: `${pid}-rune-${i}`,
        name: `R${i}`,
      });
    }
  }
  setGlobalCardRegistry(reg);

  const engine = new RuleEngine<
    RiftboundGameState,
    RiftboundMoves,
    unknown,
    RiftboundCardMeta
  >(
    riftboundDefinition,
    [
      { id: P1, name: "P1" },
      { id: P2, name: "P2" },
    ],
    { seed: "monkey-b12-counter" },
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
  // Cascade FM to main phase (workaround for R-1).
  const fm = (engine as unknown as {
    getFlowManager(): {
      checkEndConditions(): void;
      getGameState(): RiftboundGameState;
    };
  }).getFlowManager();
  for (let i = 0; i < 16; i++) {fm.checkEndConditions();}
  (engine as unknown as { currentState: RiftboundGameState }).currentState = {
    ...(engine as unknown as { currentState: RiftboundGameState }).currentState,
    turn: { ...fm.getGameState().turn },
  };
  return engine;
}

describe("monkey-b12 finding R-3: counterSpell must not be an enumerable free move", () => {
  test("counterSpell appears in the enumerator output when a chain is active (proves the bug)", () => {
    const engine = setup();

    // Force a chain to exist: P1 exhausts a rune and plays a spell.
    // The spell goes on the chain and the chain becomes active.
    engine.executeMove("exhaustRune", {
      params: { playerId: P1, runeId: `${P1}-rune-0` },
      playerId: P1 as PlayerId,
    });
    const handCards = (
      engine as unknown as {
        internalState: { cards: Record<string, { owner?: string; zone?: string }> };
      }
    ).internalState.cards;
    const spellId = Object.entries(handCards).find(
      ([, c]) => c.zone === "hand" && c.owner === P1,
    )?.[0];
    expect(spellId).toBeDefined();
    engine.executeMove("playSpell", {
      params: { cardId: spellId, playerId: P1 },
      playerId: P1 as PlayerId,
    });

    // Now P2 can enumerate moves — counterSpell should NOT be in the
    // List (after the fix). Before the fix, it IS in the list.
    const p2Moves = (engine as unknown as {
      enumerateMoves(
        playerId: PlayerId,
        opts: { validOnly: boolean },
      ): { moveId: string }[];
    }).enumerateMoves(P2 as PlayerId, { validOnly: true });
    const counterMoves = p2Moves.filter((m) => m.moveId === "counterSpell");

    // BUG (current): counterSpell is enumerable for free — non-zero count.
    expect(counterMoves.length).toBeGreaterThan(0);
  });

  test.todo(
    "(WAITING ON FIX) counterSpell should NOT be enumerable as a player move (game-effect only)",
    () => {
      const engine = setup();
      engine.executeMove("exhaustRune", {
        params: { playerId: P1, runeId: `${P1}-rune-0` },
        playerId: P1 as PlayerId,
      });
      const handCards = (
        engine as unknown as {
          internalState: { cards: Record<string, { owner?: string; zone?: string }> };
        }
      ).internalState.cards;
      const spellId = Object.entries(handCards).find(
        ([, c]) => c.zone === "hand" && c.owner === P1,
      )?.[0];
      engine.executeMove("playSpell", {
        params: { cardId: spellId, playerId: P1 },
        playerId: P1 as PlayerId,
      });

      const p2Moves = (engine as unknown as {
        enumerateMoves(
          playerId: PlayerId,
          opts: { validOnly: boolean },
        ): { moveId: string }[];
      }).enumerateMoves(P2 as PlayerId, { validOnly: true });
      expect(p2Moves.filter((m) => m.moveId === "counterSpell").length).toBe(0);
    },
  );

  test.todo(
    "(WAITING ON FIX) directly invoking counterSpell via executeMove with no card-source-cost-paid is rejected",
    () => {
      const engine = setup();
      engine.executeMove("exhaustRune", {
        params: { playerId: P1, runeId: `${P1}-rune-0` },
        playerId: P1 as PlayerId,
      });
      const handCards = (
        engine as unknown as {
          internalState: { cards: Record<string, { owner?: string; zone?: string }> };
        }
      ).internalState.cards;
      const spellId = Object.entries(handCards).find(
        ([, c]) => c.zone === "hand" && c.owner === P1,
      )?.[0];
      engine.executeMove("playSpell", {
        params: { cardId: spellId, playerId: P1 },
        playerId: P1 as PlayerId,
      });

      // P2 tries to invoke counterSpell directly — should fail because
      // No source card with `counter` ability has been played and no
      // Cost has been paid.
      const r = engine.executeMove("counterSpell", {
        params: { playerId: P2, targetChainItemId: "chain-1" },
        playerId: P2 as PlayerId,
      });
      expect(r.success).toBe(false);
    },
  );
});
