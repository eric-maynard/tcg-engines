/**
 * Gemcraft Seer — ogn-100-298 · Unit · Mind · 3 energy + 1 mind · 3 Might
 *
 *   [Vision] (When you play me, look at the top card of your Main Deck. You may recycle it.)
 *   Other friendly units have [Vision].
 *
 * Rules: 817 (Vision — triggered "when this is played, look at top card, may recycle";
 * 817.2 multiple instances trigger separately), 477.2.b ("have [keyword]" static), 594 (recycle).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-100-298";
const SKULKER = "ogn-175-298"; // vanilla 3-might unit, 3 energy

describe("Gemcraft Seer (ogn-100-298)", () => {
  test("costs 3 energy + 1 mind; own Vision: one look-and-may-recycle prompt, recycling sends the top card to the bottom", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .hand(P1, CARD, "seer")
      .deckTop(P1, SKULKER, "top")
      .build();
    await game.p1.play("seer");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "seer", triggered: true })]);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, allowDecline: true, source: { cardId: "seer" } });
    await game.p1.pick("top");
    await game.settle();
    const deck = game.p1.deck();
    expect(deck[deck.length - 1]).toBe("top");
    expect(game.decision()?.kind).toBe("action"); // "Other": the Seer does not grant itself a second Vision
  });

  test("not playable without the mind power or with only 2 energy", async () => {
    const noMind = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "seer").build();
    expect(noMind.p1.can("play", "seer")).toBe(false);
    const low = await scenario().resources(P1, { energy: 2, power: { mind: 1 } }).hand(P1, CARD, "seer").build();
    expect(low.p1.can("play", "seer")).toBe(false);
  });

  test("Other friendly units have Vision: a vanilla unit played while the Seer is on board triggers Vision", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .unit(P1, "base", CARD, "seer")
      .unit(P1, "base", { might: 1 }, "old")
      .hand(P1, SKULKER, "sk")
      .deckTop(P1, SKULKER, "top")
      .build();
    await game.p1.play("sk");
    expect(game.state("sk").keywords).toContain("Vision");
    expect(game.state("old").keywords).toContain("Vision");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sk", triggered: true })]);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "sk" } });
    await game.p1.decline();
    await game.settle();
    expect(game.p1.deck()[0]).toBe("top");
    expect(game.decision()?.kind).toBe("action");
  });

  test("'friendly': an enemy unit played while your Seer is on board gets no Vision", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3 })
      .unit(P1, "base", CARD, "seer")
      .hand(P2, SKULKER, "foe")
      .deckTop(P2, SKULKER, "theirTop")
      .build();
    await game.p2.play("foe");
    expect(game.state("foe").keywords).not.toContain("Vision");
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.p2.deck()[0]).toBe("theirTop");
  });

  test("without the Seer the same vanilla unit has no Vision (control)", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, SKULKER, "sk").deckTop(P1, SKULKER, "top").build();
    await game.p1.play("sk");
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
  });
});
