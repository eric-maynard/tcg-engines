/**
 * Ruling 44a55f46e6b50513 — Double Trouble (UNL-032 → unl-032-219) · Spell · Calm · 2 · [Repeat] [2]
 *   "Look at the top 3 cards of your Main Deck. You may reveal a unit from among them and draw it. Recycle the rest."
 *
 * Q: If I don't reveal a unit, do the 3 cards go back on TOP of my Main Deck?
 * A: No. "Recycle the rest" puts every looked-at-but-not-drawn card on the BOTTOM of the Main Deck (in a random order
 *    when several are recycled at once) — never back on top.
 * Rules: 416.1 (recycle = bottom of the corresponding deck), 416.5 (multiple simultaneously → random order).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const DOUBLE_TROUBLE = "unl-032-219";
const SKULKER = "ogn-175-298"; // vanilla unit
const SNAX = "sfd-046-221"; // Poro Snax — gear
const CLEAVE = "ogn-004-298"; // spell

/** P1, 2 energy, Double Trouble in hand; known 7-card deck (top first): unit, gear, unit, spell, unit, unit, unit. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .fillDecks(false)
    .deck(P1, [SKULKER, SNAX, SKULKER, CLEAVE, SKULKER, SKULKER, SKULKER], ["u1", "gear2", "u3", "spell4", "u5", "u6", "u7"])
    .hand(P1, DOUBLE_TROUBLE, "dt");
}

describe("Ruling 44a55f46e6b50513 — Double Trouble's un-drawn cards are recycled to the BOTTOM, not returned to the top", () => {
  test("declining to reveal a unit: nothing is drawn and ALL THREE looked-at cards go to the bottom — the former 4th card is the new top, deck size unchanged, nothing trashed but the spell", async () => {
    const game = await board().build();
    await game.p1.cast("dt");
    await game.settle();
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, semantics: "from-revealed" });
    await game.p1.decline();
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
    const deck = game.p1.deck();
    expect(deck).toHaveLength(7);
    expect(deck[0]).toBe("spell4"); // NOT u1 — the three did not go back on top
    expect(deck.slice(0, 4)).toEqual(["spell4", "u5", "u6", "u7"]);
    expect([...deck.slice(-3)].sort()).toEqual(["gear2", "u1", "u3"]); // on the bottom (order among them is random, 416.5)
    expect(game.p1.trash()).toEqual(["dt"]);
    expect(game.violations()).toEqual([]);
  });

  test("no unit among the top 3 at all (gear, spell, gear): nothing CAN be drawn — again all 3 end up on the bottom and the 4th card is on top", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .fillDecks(false)
      .deck(P1, [SNAX, CLEAVE, SNAX, SKULKER, SKULKER], ["g1", "s2", "g3", "u4", "u5"])
      .hand(P1, DOUBLE_TROUBLE, "dt")
      .build();
    await game.p1.cast("dt");
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card)).toEqual([]); // decline-only
      await game.p1.decline();
      await game.settle();
    }
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()).toHaveLength(5);
    expect(game.p1.deck().slice(0, 2)).toEqual(["u4", "u5"]);
    expect([...game.p1.deck().slice(-3)].sort()).toEqual(["g1", "g3", "s2"]);
  });

  test("contrast — drawing a unit: only 'the rest' (2 cards) is recycled to the bottom; the 4th card is still the new top", async () => {
    const game = await board().build();
    await game.p1.cast("dt");
    await game.settle();
    await game.p1.pick("u3");
    await game.settle();
    expect(game.p1.hand()).toEqual(["u3"]);
    const deck = game.p1.deck();
    expect(deck).toHaveLength(6);
    expect(deck[0]).toBe("spell4");
    expect([...deck.slice(-2)].sort()).toEqual(["gear2", "u1"]);
  });
});
