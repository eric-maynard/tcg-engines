/**
 * Phase B batch 17 FF — monkey-rescan finding FF-1: 0-might attacker stalls
 * combat into an infinite contest/resolve loop.
 *
 * Discovered by the random-monkey running real decks (Origins set) at seed
 * `s35`. By turn 14, P2 moves Scuttle Crab (`unl-053-219`, a 0-might
 * `unit` card) to P1's controlled battlefield. The priority-table bot
 * then enters an unending oscillation:
 *
 *   contestBattlefield(bf-1) → contested: false → true
 *   resolveFullCombat(bf-1)  → contested: true  → false
 *   contestBattlefield(bf-1) → contested: false → true
 *   resolveFullCombat(bf-1)  → contested: true  → false
 *   ... (~750 moves of pure oscillation before the move-cap)
 *
 * Root cause: `runCombatResolution` (in `game-definition/moves/combat.ts`)
 * filters non-might cards out of `attackerUnits` / `defenderUnits` at the
 * `(def?.might ?? 0) <= 0` line. When P2's only "attacker" at bf-1 is a
 * 0-might unit, `attackerUnits.length === 0` so the code falls into the
 * "early `endCombatNoDamage`" branch (rule 461 resolution step for an
 * empty side). `endCombatNoDamage` then derives the surviving-owner set
 * via `getCardsInZone(battlefieldZoneId)` — which STILL includes the
 * 0-might attacker — so `owners.size === 2` (both players have presence),
 * neither the single-survivor `Establish-Control` branch nor the
 * zero-survivor `Uncontrolled` branch fires, and control stays at P1.
 * `finalizeCombatEnd` clears Contested. The 0-might attacker remains at
 * bf-1, contestBattlefield's enumerator/condition (which counts presence
 * by owner only) re-fires, and we loop forever.
 *
 * Per Rule 461.1.a.2 (Combat Cleanup recalls surviving Attackers), a
 * non-conquering attacker must be returned to base — that step doesn't
 * care whether the attacker had any might-contributing units. The pre-fix
 * engine skipped the recall when the attacker side had ZERO might, which
 * is precisely the case that produces the loop.
 *
 * Fix (generic, no per-card ifs): in `runCombatResolution`, before
 * deferring to `endCombatNoDamage`, recall the non-might `unit`-typed
 * cards from whichever side has `attackerUnits.length === 0` /
 * `defenderUnits.length === 0` so they leave the battlefield. The
 * presence-set then collapses to the side that actually has might units,
 * letting `endCombatNoDamage` settle control via Establish-Control
 * (rule 461.3.a) and preventing the contest from re-firing.
 *
 * This test sets up the exact monkey scenario: P2 has a 0-might "unit"
 * card at the battlefield, P1 has a might-1 unit, P1 controls the bf.
 * P2 contests, P2 calls `resolveFullCombat`, we assert:
 *
 *   1. After resolution, `battlefield.contested === false` (combat ended),
 *      AND
 *   2. The 0-might attacker has been recalled to base (no longer at bf-1).
 *
 * Without the fix, (2) fails — the 0-might attacker stays at bf-1.
 */

import { describe, expect, test } from "bun:test";
import { RuleEngine } from "@tcg/core";
import type { ZoneId as CoreZoneId, PlayerId } from "@tcg/core";
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
  const reg = new CardDefinitionRegistry();
  // Synthetic deck: every card is a might-1 unit so combat baselines work.
  for (const pid of [P1, P2]) {
    for (let i = 0; i < 40; i++) {
      reg.register(`${pid}-card-${i}`, {
        cardType: "unit",
        energyCost: 0,
        id: `${pid}-card-${i}`,
        might: 1,
        name: `M-Unit-${i}`,
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
  // The 0-might "unit" — same shape as Scuttle Crab in the real card data.
  reg.register("zm-attacker", {
    cardType: "unit",
    energyCost: 0,
    id: "zm-attacker",
    might: 0,
    name: "ZeroMightAttacker",
  });
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
    { seed: "monkey-b17-zero-might-loop" },
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
  // Cascade flow manager to main (workaround for the @tcg/core back-sync
  // Gap — same pattern as combat-primitives-free-move.test.ts).
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

/**
 * Reach into the engine's internal card / zone store and place units at
 * the battlefield directly. Mirrors the rule-audit helper pattern; the
 * setup-from-real-moves path requires showdowns + standardMove which is
 * orthogonal to the bug under test.
 */
function planUnitAt(
  engine: RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>,
  cardId: string,
  owner: string,
  bfId: string,
): void {
  const internal = (
    engine as unknown as {
      internalState: {
        cards: Record<
          string,
          { definitionId: string; owner: string; controller: string; zone: string; position?: number }
        >;
        cardMetas: Record<string, RiftboundCardMeta>;
        zones: Record<string, { cardIds: string[]; config: unknown } | undefined>;
      };
    }
  ).internalState;
  internal.cards[cardId] = {
    controller: owner,
    definitionId: cardId,
    owner,
    position: undefined,
    zone: `battlefield-${bfId}`,
  };
  internal.cardMetas[cardId] = {
    buffed: false,
    combatRole: null,
    damage: 0,
    exhausted: false,
    hidden: false,
    stunned: false,
  };
  const bfZone = `battlefield-${bfId}` as CoreZoneId;
  if (!internal.zones[bfZone]) {
    internal.zones[bfZone] = {
      cardIds: [],
      config: {
        faceDown: false,
        id: bfZone,
        name: bfZone,
        ordered: false,
        visibility: "public",
      },
    };
  }
  if (!internal.zones[bfZone]!.cardIds.includes(cardId)) {
    internal.zones[bfZone]!.cardIds.push(cardId);
  }
  // Ensure a base zone exists for owner-side recalls.
  const baseZone = "base" as CoreZoneId;
  if (!internal.zones[baseZone]) {
    internal.zones[baseZone] = {
      cardIds: [],
      config: {
        faceDown: false,
        id: baseZone,
        name: baseZone,
        ordered: false,
        visibility: "public",
      },
    };
  }
}

describe("monkey-b17 finding FF-1: zero-might attacker must not stall combat", () => {
  test("resolveFullCombat recalls a 0-might attacker so the contest cannot re-stage", () => {
    const engine = setup();

    // Plant a might-1 defender (P1) and a 0-might attacker (P2) at bf-1.
    planUnitAt(engine, `${P1}-card-0`, P1, "bf-1");
    planUnitAt(engine, "zm-attacker", P2, "bf-1");

    // Set P1 as bf-1 controller (defender), P2 contests. P2 must be the
    // Active player for contestBattlefield's condition guard to pass.
    const state = (engine as unknown as { getState(): RiftboundGameState }).getState();
    (state.battlefields["bf-1"] as { controller: string | null }).controller = P1;
    (state.turn as { activePlayer: string }).activePlayer = P2;
    (engine as unknown as { currentState: RiftboundGameState }).currentState = state;

    const contestResult = engine.executeMove("contestBattlefield", {
      params: { battlefieldId: "bf-1", playerId: P2 },
      playerId: P2 as PlayerId,
    });
    expect(contestResult.success).toBe(true);

    // Sanity: bf-1 now contested.
    let post = (engine as unknown as { getState(): RiftboundGameState }).getState();
    expect(post.battlefields["bf-1"]?.contested).toBe(true);

    // P2 resolves the (no-might-attackers) combat.
    const resolveResult = engine.executeMove("resolveFullCombat", {
      params: { battlefieldId: "bf-1" },
      playerId: P2 as PlayerId,
    });
    expect(resolveResult.success).toBe(true);

    post = (engine as unknown as { getState(): RiftboundGameState }).getState();
    // Contested cleared by finalizeCombatEnd — that part was always working.
    expect(post.battlefields["bf-1"]?.contested).toBe(false);

    // THE KEY ASSERTION: the 0-might attacker is no longer at bf-1.
    // Without the fix, `zm-attacker` is still in the bf-1 zone and
    // `contestBattlefield` would be legal again, producing the loop.
    const internal = (
      engine as unknown as {
        internalState: { zones: Record<string, { cardIds: string[] } | undefined> };
      }
    ).internalState;
    const bf1Cards = internal.zones["battlefield-bf-1"]?.cardIds ?? [];
    expect(bf1Cards).not.toContain("zm-attacker");
  });

  test("after a no-might-attacker resolveFullCombat, the same player cannot re-contest the bf with the same 0-might 'unit'", () => {
    const engine = setup();
    planUnitAt(engine, `${P1}-card-0`, P1, "bf-1");
    planUnitAt(engine, "zm-attacker", P2, "bf-1");
    const state = (engine as unknown as { getState(): RiftboundGameState }).getState();
    (state.battlefields["bf-1"] as { controller: string | null }).controller = P1;
    (engine as unknown as { currentState: RiftboundGameState }).currentState = state;

    engine.executeMove("contestBattlefield", {
      params: { battlefieldId: "bf-1", playerId: P2 },
      playerId: P2 as PlayerId,
    });
    engine.executeMove("resolveFullCombat", {
      params: { battlefieldId: "bf-1" },
      playerId: P2 as PlayerId,
    });

    // ContestBattlefield requires BOTH players have units present at the
    // Bf. After the fix the 0-might attacker is recalled to base, so P2
    // No longer has presence at bf-1 and contestBattlefield must reject.
    const retry = engine.executeMove("contestBattlefield", {
      params: { battlefieldId: "bf-1", playerId: P2 },
      playerId: P2 as PlayerId,
    });
    expect(retry.success).toBe(false);
  });
});
