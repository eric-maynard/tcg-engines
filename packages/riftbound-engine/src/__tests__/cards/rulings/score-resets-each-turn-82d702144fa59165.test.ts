/**
 * Ruling 82d702144fa59165 — (no specific card) the "once per Battlefield per turn" scoring limit resets
 *   on EVERY turn, including the opponent's. Exercised with inline filler units, a base-speed spell for
 *   the opponent to open a chain with, and a [Reaction] "Move a friendly unit to a battlefield".
 *
 * Q: I scored both battlefields on my turn. On my opponent's turn my unit arrives at one of them again —
 *    can I score it a second time?
 * A: Yes. "Once per battlefield per turn" means any player's turn; each new turn clears the ledger for
 *    every battlefield. You still have to actually establish control (a Conquer) — merely keeping control
 *    scores nothing.
 * Rules: 470 (each battlefield scores at most once per turn per player), 471 / 471.2.c, 317.2.c
 *    (the "this turn" ledger clears in the Ending Phase), 315.2.b (Hold at the Scoring Step),
 *    344.2 / 348.2.a (arriving at an uncontrolled battlefield ⇒ showdown ⇒ Conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game, InlineCardDef } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REACTION_MARCH: InlineCardDef = {
  abilities: [
    {
      effect: { target: { controller: "friendly", type: "unit" }, to: { battlefield: "any" }, type: "move" },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  keywords: ["Reaction"],
  name: "Filler March",
  rulesText: "[Reaction] Move a friendly unit to a battlefield.",
  timing: "reaction",
};

/** A base-speed spell for P2 to open a chain with on their own turn. */
const OPENER: InlineCardDef = {
  abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 0,
  name: "Filler Opener",
  rulesText: "Draw 1.",
  timing: "standard",
};

/** It is P2's turn 2. P1 controls BOTH battlefields (a unit on each) and holds a reserve + a Reaction. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 2 })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P1 })
    .unit(P1, "bfA", { might: 3, name: "Holder A" }, "holdA")
    .unit(P1, "bfB", { might: 3, name: "Holder B" }, "holdB")
    .unit(P1, "base", { might: 3, name: "Reserve" }, "reserve")
    .hand(P1, REACTION_MARCH, "march")
    .hand(P2, OPENER, "opener");
}

/** P1's turn begins: the Scoring Step holds both battlefields (2 points). P1 then vacates bfB. */
async function scoreBothThenLeaveB(): Promise<Game> {
  const game = await board().build();
  await game.advanceTurn(); // → P1's turn: Hold bfA and bfB
  expect(game.turnPlayer()).toBe(P1);
  expect(game.p1.points()).toBe(2);
  expect((game.gameState.scoredThisTurn[P1] ?? []).slice().sort()).toEqual(["bfA", "bfB"]);
  await game.p1.move("holdB", "base"); // leave bfB empty
  await game.settle();
  expect(game.p1.units("bfB")).toEqual([]);
  return game;
}

describe("Ruling 82d702144fa59165 — the scoring ledger resets on the opponent's turn too", () => {
  test("on my turn I score both battlefields: 2 points, and both are on the ledger", async () => {
    const game = await scoreBothThenLeaveB();
    expect(game.p1.points()).toBe(2);
  });

  test("bfB may not be scored AGAIN on the same turn — the reserve retaking it now yields no point", async () => {
    const game = await scoreBothThenLeaveB();
    await game.p1.move("reserve", "bfB");
    await game.settle();
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1); // control re-established
    expect(game.p1.points()).toBe(2); // …but no third point THIS turn (470)
  });

  test("the ledger is cleared when the turn ends — on P2's turn nothing of P1's is marked scored", async () => {
    const game = await scoreBothThenLeaveB();
    await game.advanceTurn(); // → P2's turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.gameState.scoredThisTurn[P1] ?? []).toEqual([]);
  });

  test("so arriving at bfB on the OPPONENT's turn conquers it and scores a third point", async () => {
    const game = await scoreBothThenLeaveB();
    await game.advanceTurn(); // → P2's turn
    expect(game.gameState.battlefields.bfB?.controller ?? null).toBe(null); // control lapsed while empty
    await game.p2.cast("opener"); // P2 opens a chain so P1 has a Reaction window on P2's turn
    await game.p2.passPriority();
    await game.p1.cast("march", { answers: ["battlefield-bfB"], targets: "reserve" });
    await game.settle();
    // The arrival applied Contested and opened a Non-Combat Showdown at bfB, on P2's turn.
    expect(game.locationOf("reserve")).toBe("bfB");
    expect(game.gameState.interaction?.showdownStack?.[0]).toMatchObject({ battlefieldId: "bfB", isCombatShowdown: false });
    await game.settle(); // both pass Focus → the showdown closes and P1 establishes control
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.p1.points()).toBe(3); // 2 from my turn + 1 conquered on the opponent's turn
  });

  test("nuance: merely KEEPING control scores nothing — bfA, never vacated, gives P1 no point on P2's turn", async () => {
    const game = await scoreBothThenLeaveB();
    await game.advanceTurn();
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
    await game.p2.cast("opener");
    await game.settle();
    expect(game.p1.points()).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
