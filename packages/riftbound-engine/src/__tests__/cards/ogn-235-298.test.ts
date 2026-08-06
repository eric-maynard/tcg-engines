/**
 * Karma, Channeler — ogn-235-298 · Unit (Champion, Karma) · Order · 6 energy + 1 order · 6 Might
 *
 *   [Vision] (When you play me, look at the top card of your Main Deck. You may recycle it.)
 *   When you recycle one or more cards to your Main Deck, buff a friendly unit.
 *   (If it doesn't have a buff, it gets a +1 [Might] buff. Runes aren't cards.)
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const KARMA = "ogn-235-298";
const FILLER = "ogn-175-298";

function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { order: 1 } })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .hand(P1, KARMA, "karma")
    .deckTop(P1, FILLER, "top");
}

describe("Karma, Channeler (ogn-235-298)", () => {
  test("Vision: recycling the looked-at card fires 'When you recycle … to your Main Deck, buff a friendly unit'", async () => {
    const game = await board().build();
    await game.p1.play("karma");
    await game.settle();
    // Vision look prompt — recycle the top card.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "karma" } });
    await game.p1.pick("top");
    await game.settle();
    // rule-id: ogn-235-298 — the recycle trigger now asks for a friendly unit to buff.
    expect(game.decision()).toMatchObject({
      kind: "pick",
      seat: P1,
      source: { cardId: "karma", pendingChoiceType: "choose-target" },
    });
    await game.p1.pick("ally");
    await game.settle();
    const deck = game.p1.deck();
    expect(deck[deck.length - 1]).toBe("top");
    expect(game.state("ally").isBuffed).toBe(true);
    expect(game.state("ally").might).toBe(3);
    expect(game.state("karma").isBuffed).toBe(false);
  });

  test("declining the Vision recycle leaves the card on top and buffs nothing", async () => {
    const game = await board().build();
    await game.p1.play("karma");
    await game.settle();
    await game.p1.decline();
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.p1.deck()[0]).toBe("top");
    expect(game.state("ally").isBuffed).toBe(false);
    expect(game.state("karma").isBuffed).toBe(false);
  });
});
