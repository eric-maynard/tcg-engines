/**
 * Apprentice Smith — sfd-041-221 · Unit · Calm · 2 energy · 2 might
 *
 *   When I move, reveal the top card of your Main Deck. If it's a gear, draw it.
 *   Otherwise, recycle it.
 *
 * Rules: 424.1.a.2 (a revealed card stays where it is until moved), 403 Recycle (put on
 * the bottom of its deck), 143.4 (units enter exhausted), "When I move" triggers on any
 * move of this unit (to a battlefield or back to base) — not on other units' moves.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-041-221";
const GEAR = "ogn-120-298"; // Seal of Insight — a gear
const UNIT = "ogn-175-298"; // Shipyard Skulker — not a gear

function board(top: string) {
  return scenario()
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", CARD, "smith")
    .unit(P1, "base", { might: 2 }, "other")
    .deck(P1, [top, UNIT, UNIT], ["top", "d2", "d3"]);
}

describe("Apprentice Smith (sfd-041-221)", () => {
  test("cost: 2 energy for a 2-might unit that enters exhausted; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "smith").build();
    await game.p1.play("smith");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("smith")).toBe("base");
    expect(game.state("smith").might).toBe(2);
    expect(game.state("smith").isExhausted).toBe(true);
    expect((await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "smith").build()).p1.can("play", "smith")).toBe(false);
  });

  test.failing("BUG: When I move — a GEAR revealed on top is DRAWN into hand (engine puts it onto the board instead)", async () => {
    // Expected: the revealed Seal goes to P1's hand and d2 becomes the top card. Actual: the
    // hand-authored `reveal until gear → recycle` approximation plays the gear to the base.
    const game = await board(GEAR).build();
    await game.p1.move("smith", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "smith", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.zoneOf("top")).toBe("hand");
    expect(game.p1.hand()).toEqual(["top"]);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.locationOf("smith")).toBe("bf1");
  });

  test.failing("BUG: a NON-gear on top is recycled to the bottom of the deck (engine leaves it on top)", async () => {
    // Expected: `top` moves to the bottom, d2 is the new top, hand unchanged. Actual: the deck
    // order is untouched — nothing is recycled.
    const game = await board(UNIT).build();
    const size = game.p1.deck().length;
    await game.p1.move("smith", "bf1");
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
    const deck = game.p1.deck();
    expect(deck).toHaveLength(size);
    expect(deck[0]).toBe("d2");
    expect(deck[deck.length - 1]).toBe("top");
  });

  test("only when I move: another unit moving does not reveal anything", async () => {
    const game = await board(GEAR).build();
    await game.p1.move("other", "bf1");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("top")).toBe("mainDeck");
    expect(game.p1.deck()[0]).toBe("top");
    expect(game.p1.hand()).toEqual([]);
  });

  test.failing("BUG: moving back to base is also a move — the gear on top is drawn (engine banishes it)", async () => {
    // Expected: `top` (a gear) ends in hand. Actual: it ends in banishment.
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "smith")
      .deck(P1, [GEAR, UNIT], ["top", "d2"])
      .build();
    await game.p1.move("smith", "base");
    await game.settle();
    expect(game.locationOf("smith")).toBe("base");
    expect(game.zoneOf("top")).toBe("hand");
  });

  test("opponent's units are irrelevant: an enemy move reveals nothing from either deck", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "smith")
      .unit(P2, "base", { might: 2 }, "foe")
      .deck(P1, [GEAR], ["top"])
      .build();
    await game.p2.move("foe", "bf1");
    await game.settle();
    expect(game.zoneOf("top")).toBe("mainDeck");
    expect(game.p1.hand()).toEqual([]);
  });
});
