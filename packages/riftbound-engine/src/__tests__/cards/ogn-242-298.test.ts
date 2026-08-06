/**
 * Baited Hook — ogn-242-298 · Gear · Order · 3 energy
 *
 *   [1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your
 *   Main Deck. You may banish a unit from among them that has Might up to 1 more
 *   than the killed unit and play it, ignoring its cost. Then recycle the rest.
 *
 * Rules: 204.2 (activation costs), 429 (kill), 427 (banish), 416.1.a (recycle →
 * bottom of Main Deck), 358 ("play … ignoring its cost" still plays the card —
 * a unit lands on the board).
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ogn-242-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker, a vanilla 3-Might unit
const THREE = { cardType: "unit", energyCost: 3, might: 3, name: "Three" };
const FOUR = { cardType: "unit", energyCost: 4, might: 4, name: "Four" };
const ONE = { cardType: "unit", energyCost: 1, might: 1, name: "One" };

function board(res = { energy: 1, power: { order: 1 } }, gearMeta?: { exhausted?: boolean }) {
  return scenario()
    .resources(P1, res)
    .gear(P1, CARD, "hook", gearMeta)
    .unit(P1, "base", { might: 2, name: "Bait" }, "bait")
    .unit(P1, "base", { might: 5, name: "Keeper" }, "keep")
    .deck(P1, [THREE, FOUR, FILLER, ONE, FILLER, FILLER], ["three", "four", "sk1", "one", "sk2", "sixth"]);
}

describe("Baited Hook (ogn-242-298)", () => {
  test("costs 3 energy to play; lands in base", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "hook").build();
    await game.p1.play("hook");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("hook")).toBe("base");
    const poor = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "hook").build();
    expect(poor.p1.can("play", "hook")).toBe(false);
  });

  test("activation: pays [1] + [order] and exhausts; on resolution you choose and kill a friendly unit", async () => {
    const game = await board().build();
    await game.p1.activate("hook");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.state("hook").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hook", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "hook", pendingChoiceType: "choose-target" } });
    await game.p1.pick("bait");
    expect(game.zoneOf("bait")).toBe("trash");
    expect(game.zoneOf("keep")).toBe("base");
  });

  test("not activatable when exhausted, without [order], or without the [1]", async () => {
    const tapped = await board({ energy: 1, power: { order: 1 } }, { exhausted: true }).build();
    expect(tapped.p1.can("activate", "hook")).toBe(false);
    const noOrder = await board({ energy: 1, power: {} as { order: number } }).build();
    expect(noOrder.p1.can("activate", "hook")).toBe(false);
    const noEnergy = await board({ energy: 0, power: { order: 1 } }).build();
    expect(noEnergy.p1.can("activate", "hook")).toBe(false);
  });

  test("the look-at-5 pick is optional and offers only UNITS with Might ≤ killed unit's Might + 1", async () => {
    // Expected: killed Bait has 2 Might → eligible: Three (3), Skulker (3), One (1); Four (4) is NOT offered;
    // "you may" → declinable. Actual: a mandatory "pick a revealed card to draw" over all 5 cards.
    const game = await board().build();
    await game.p1.activate("hook");
    await game.settle();
    await game.p1.pick("bait");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, allowDecline: true });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card) : [];
    expect(offered).toEqual(expect.arrayContaining(["three", "sk1", "one"]));
    expect(offered).not.toContain("four");
    expect(offered).not.toContain("sixth"); // only the top 5 are looked at
  });

  test("the chosen unit is banished then PLAYED ignoring its cost (ends on the board, no energy spent); the rest are recycled", async () => {
    // Expected: Three leaves the deck and is played for free → on the board (base); four/sk1/one/sk2 go to the
    // bottom of the deck; hand unchanged. Actual: the picked card is simply drawn to hand.
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.activate("hook");
    await game.settle();
    await game.p1.pick("bait");
    await game.settle();
    await game.p1.pick("three");
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("three")).toBe("base");
    expect(game.p1.hand().length).toBe(handBefore);
    const deck = game.p1.deck();
    expect(deck[0]).toBe("sixth");
    expect(deck.slice(-4)).toEqual(expect.arrayContaining(["four", "sk1", "one", "sk2"]));
  });

  test("the un-chosen looked-at cards are recycled to the bottom of the Main Deck", async () => {
    const game = await board().build();
    await game.p1.activate("hook");
    await game.settle();
    await game.p1.pick("bait");
    await game.settle();
    await game.p1.pick("three");
    await game.settle();
    const deck = game.p1.deck();
    expect(deck[0]).toBe("sixth");
    expect(deck.slice(-4)).toEqual(expect.arrayContaining(["four", "sk1", "one", "sk2"]));
    expect(deck).not.toContain("three");
  });
});
