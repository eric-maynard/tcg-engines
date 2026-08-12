/**
 * Ruling f18bd0dab710d637 — Divine Judgment (OGN-244 → ogn-244-298) · Order · [7][order][order]
 *     "Each player chooses 2 units, 2 gear, 2 runes, and 2 cards in their hands. Recycle the rest."
 *
 * Q: Can you float power by recycling runes at any time, even when you are not immediately spending it?
 * A: Yes. A rune's [Add] is an ordinary activated ability: you may use it whenever you have priority, and the
 *    power just sits in your pool. The classic use is floating the power for Hiding a card before casting
 *    Divine Judgment. Anything still floating is lost when the turn ends.
 * Rules: 429 / 444.2.c ([Add] abilities are activated abilities usable with priority), 205 (the pool holds what
 *        you added), 317.2 (Expiration Step empties the pools at end of turn), 421 (Hide costs [rainbow]).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DIVINE_JUDGMENT = "ogn-244-298";
const HIDDEN_BLADE = "ogn-213-298";

/** P1's turn with four ready Order runes, a Hidden Blade to hide and Divine Judgment in hand. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .runes(P1, "order", 4)
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P1, DIVINE_JUDGMENT, "judgment");
}

describe("Ruling f18bd0dab710d637 — power may be floated by recycling runes whenever you hold priority", () => {
  test("ruling: recycling a rune with nothing to spend it on is legal — the power simply sits in the pool", async () => {
    const game = await board().build();
    expect(game.p1.power("order")).toBe(0);
    await game.p1.recycleRune();
    expect(game.p1.power("order")).toBe(1);
    expect(game.p1.runes({ ready: true })).toHaveLength(3);
    expect(game.violations()).toEqual([]);
  });

  test("floating stacks: two recycles leave two power banked with no card played in between", async () => {
    const game = await board().build();
    await game.p1.recycleRune();
    await game.p1.recycleRune();
    expect(game.p1.power("order")).toBe(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("it is also legal while a chain is live — P1 floats power holding priority over their own spell", async () => {
    const game = await board().resources(P1, { energy: 2, power: { order: 1 } }).build();
    await game.p1.cast("blade", { targets: "holder" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.recycleRune();
    expect(game.p1.power("order")).toBe(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]); // the [Add] is not a chain item
  });

  test("the use case: float the power first, then spend it Hiding a card at a battlefield you control", async () => {
    const game = await board().build();
    await game.p1.recycleRune();
    expect(game.p1.power("order")).toBe(1);
    await game.p1.hide("blade", "bf1");
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
    expect(game.p1.power("order")).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("nuance: whatever is still floating is gone when the turn ends", async () => {
    const game = await board().build();
    await game.p1.recycleRune();
    await game.p1.recycleRune();
    expect(game.p1.power("order")).toBe(2);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.power("order")).toBe(0);
    expect(game.p1.energy()).toBe(0);
  });
});
