/**
 * Mystic Poro — ogn-171-298 · Unit (Poro) · Chaos · 2 energy · 2 Might
 *
 *   [Vision] (When you play me, look at the top card of your Main Deck. You may recycle it.)
 *
 * Rules: 817 (Vision is a triggered "when you play me" look / may-recycle; 817.2 one instance →
 * one trigger), 594 (recycle → bottom of the Main Deck), 143.4 (units enter exhausted).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-171-298";
const FILLER = "ogn-175-298";

function played() {
  return scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "poro").deckTop(P1, FILLER, "top");
}

describe("Mystic Poro (ogn-171-298)", () => {
  test("cost: 2 energy, no power; 2-Might Poro with the Vision keyword; enters exhausted; unaffordable with 1", async () => {
    const game = await played().build();
    await game.p1.play("poro");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.state("poro").might).toBe(2);
    expect(game.state("poro").isExhausted).toBe(true);
    expect(game.state("poro").keywords).toContain("Vision");
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "poro").build();
    expect(poor.p1.can("play", "poro")).toBe(false);
  });

  test("Vision: on play a single trigger goes on the chain; recycling sends the looked-at top card to the bottom", async () => {
    const game = await played().build();
    expect(game.p1.deck()[0]).toBe("top");
    await game.p1.play("poro");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, source: { cardId: "poro" } });
    expect((game.decision() as { options: { key: string }[] }).options.map((o) => o.key)).toEqual(["top"]);
    await game.p1.pick("top");
    await game.settle();
    const deck = game.p1.deck();
    expect(deck[0]).not.toBe("top");
    expect(deck[deck.length - 1]).toBe("top");
    expect(game.p1.hand()).not.toContain("top"); // looked at, not drawn
  });

  test("Vision: 'you may' — declining leaves the card on top of the deck", async () => {
    const game = await played().build();
    await game.p1.play("poro");
    await game.settle();
    await game.p1.decline();
    await game.settle();
    expect(game.p1.deck()[0]).toBe("top");
    expect(game.decision()?.kind).toBe("action");
  });

  test("one instance of Vision → exactly one look prompt (rule 817.2)", async () => {
    const game = await played().build();
    await game.p1.play("poro");
    await game.settle();
    expect(game.decision()?.kind).toBe("pick");
    await game.p1.decline();
    await game.settle();
    expect(game.decision()?.kind).toBe("action"); // no second Vision prompt
    expect(game.chain()).toHaveLength(0);
  });

  test("Vision looks only at YOUR deck: the opponent is never prompted and their top card is untouched", async () => {
    const game = await played().deckTop(P2, FILLER, "theirTop").build();
    await game.p1.play("poro");
    await game.settle();
    expect(game.decision()?.seat).toBe(P1);
    await game.p1.pick("top");
    await game.settle();
    expect(game.p2.deck()[0]).toBe("theirTop");
  });
});
