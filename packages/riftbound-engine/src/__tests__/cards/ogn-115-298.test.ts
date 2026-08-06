/**
 * Promising Future — ogn-115-298 · Spell · Mind · 5 energy + 1 [mind]
 *
 *   Each player looks at the top 5 cards of their Main Deck, banishes one of them,
 *   then recycles the rest. Starting with the next player, each player plays those
 *   cards, ignoring Energy costs. (They must still pay Power costs.)
 *
 * No [Action]/[Reaction] tag: base spell timing (your turn, open state, empty chain).
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-115-298";
const U = (n: number) => ({ cardType: "unit", energyCost: 3, might: n, name: `Future ${n}` });

function board(energy = 5, power: Record<string, number> = { mind: 1 }) {
  return scenario()
    .resources(P1, { energy, power })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9 }, "wall")
    .deck(P1, [U(1), U(2), U(3), U(4), U(5), U(6)], ["a1", "a2", "a3", "a4", "a5", "a6"])
    .deck(P2, [U(1), U(2), U(3), U(4), U(5), U(6)], ["b1", "b2", "b3", "b4", "b5", "b6"])
    .hand(P1, CARD, "pf");
}

describe("Promising Future (ogn-115-298)", () => {
  test("castable on your turn for 5 energy + 1 mind; goes on the chain", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "pf")).toBe(true);
    await game.p1.cast("pf");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("pf")).toBe("chain");
  });

  test("castable with an empty board (this spell has no targets)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { mind: 1 } })
      .deck(P1, [U(1), U(2), U(3), U(4), U(5)])
      .deck(P2, [U(1), U(2), U(3), U(4), U(5)])
      .hand(P1, CARD, "pf")
      .build();
    expect(game.p1.can("cast", "pf")).toBe(true);
  });

  test("not affordable with 4 energy or without a mind power", async () => {
    const lowEnergy = await board(4).build();
    expect(lowEnergy.p1.can("cast", "pf")).toBe(false);
    const noPower = await board(5, {}).build();
    expect(noPower.p1.can("cast", "pf")).toBe(false);
  });

  test("base spell timing: not playable on the opponent's turn", async () => {
    const oppTurn = await board().active(P2).build();
    expect(oppTurn.p1.can("cast", "pf")).toBe(false);
  });

  // Expected: no [Action] in the rules text → not playable while a showdown is open. Actual: the
  // card data carries `timing: "action"`, so it is offered with Focus.
  test("not an [Action] spell — must not be playable during a showdown", async () => {
    const game = await board().unit(P1, "base", { might: 1 }, "scout").build();
    await game.p1.move("scout", "bf1");
    expect(game.decision()?.kind).toBe("action");
    expect(game.p1.can("cast", "pf")).toBe(false);
  });

  // Expected: on resolution each player is shown their own top 5, picks one to banish, and the
  // other four go to the bottom of that deck (a6 / b6 become the top cards). Actual: no prompt at all —
  // the spell "targets" a board unit and re-plays it to its owner's base; decks are untouched.
  test("each player picks one of their top 5 to banish and recycles the other four", async () => {
    const game = await board().build();
    await game.p1.cast("pf");
    await game.settle();
    const mine = game.decision() as PickDecision;
    expect(mine).toMatchObject({ kind: "pick", seat: P1 });
    expect(mine.options.map((o) => o.card ?? o.key).sort()).toEqual(["a1", "a2", "a3", "a4", "a5"]);
    await game.p1.pick("a3");
    await game.settle();
    const theirs = game.decision() as PickDecision;
    expect(theirs).toMatchObject({ kind: "pick", seat: P2 });
    expect(theirs.options.map((o) => o.card ?? o.key).sort()).toEqual(["b1", "b2", "b3", "b4", "b5"]);
    await game.p2.pick("b2");
    await game.settle({ policy: "first" });
    expect(game.p1.deck()[0]).toBe("a6");
    expect(game.p1.deck().slice(-4).sort()).toEqual(["a1", "a2", "a4", "a5"]);
    expect(game.p2.deck()[0]).toBe("b6");
    expect(game.p2.deck().slice(-4).sort()).toEqual(["b1", "b3", "b4", "b5"]);
  });

  // Expected: starting with P2 (the next player) each player plays their banished card without
  // paying its 3 energy — both 3-cost units land on the board with pools untouched. Actual: see above.
  test("starting with the next player, each player plays the banished card ignoring its Energy cost", async () => {
    const game = await board().build();
    await game.p1.cast("pf");
    await game.settle();
    await game.p1.pick("a3");
    await game.settle();
    await game.p2.pick("b2");
    await game.settle({ policy: "first" }); // take default locations / forced follow-ups
    expect(game.zoneOf("pf")).toBe("trash");
    expect(game.p2.units()).toContain("b2");
    expect(game.p1.units()).toContain("a3");
    expect(game.p1.energy()).toBe(0); // paid 5 for the spell, 0 for the 3-cost unit
    expect(game.p2.energy()).toBe(0);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p2.banishment()).toEqual([]);
  });
});
