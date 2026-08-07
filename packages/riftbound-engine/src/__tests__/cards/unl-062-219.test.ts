/**
 * Dramatic Visionary — unl-062-219 · Unit · Mind · 4 energy · 4 Might
 *
 *   [Deathknell] [Predict 2]. (When I die, look at the top two cards of your
 *   Main Deck. Recycle any of them and put the rest back in any order.)
 *
 * Rule 386.2: the cards that are NOT recycled go back on top in an order the
 * Predicting player chooses — that arrangement is a real decision.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "unl-062-219";

const A = { cardType: "spell", energyCost: 0, name: "Top Card A" };
const B = { cardType: "spell", energyCost: 0, name: "Top Card B" };
const ZAP = {
  abilities: [{ effect: { amount: 9, target: { type: "unit" }, type: "damage" }, type: "spell" }],
  cardType: "spell",
  energyCost: 1,
  name: "Zap",
};

/** Visionary on a battlefield, two known cards on top of P1's deck (a then b). */
function board() {
  return scenario()
    .active(P1)
    .resources(P1, { energy: 10 })
    .battlefield("bf1")
    .unit(P1, "bf1", CARD, "seer")
    .deckTop(P1, A, "a")
    .deckTop(P1, B, "b")
    .hand(P1, ZAP, "zap");
}

describe("Dramatic Visionary (unl-062-219)", () => {
  // rule 386.2 (rule-id: unl-062-219) — "put the rest back in any order":
  // declining every recycle must still let the player arrange the cards.
  test("declining the recycles offers an order prompt for the cards left on top", async () => {
    const game = await board().build();
    expect(game.p1.deck().slice(0, 2)).toEqual(["a", "b"]);
    await game.p1.cast("zap", { targets: "seer" });
    await game.settle();
    expect(game.zoneOf("seer")).toBe("trash");
    expect(game.decision()?.kind).toBe("pick");
    await game.p1.decline();
    await game.settle();
    expect(game.decision()?.kind).toBe("order");
    await game.p1.order(["b", "a"]);
    await game.settle();
    expect(game.p1.deck().slice(0, 2)).toEqual(["b", "a"]);
  });

  // rule 386.2 — with only one card left on top there is nothing to arrange,
  // so no order prompt is raised.
  test("recycling one of the two cards leaves nothing to arrange", async () => {
    const game = await board().build();
    await game.p1.cast("zap", { targets: "seer" });
    await game.settle();
    await game.p1.pick("a");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.decline();
      await game.settle();
    }
    expect(game.decision()?.kind).not.toBe("order");
    expect(game.p1.deck()[0]).toBe("b");
  });
});
