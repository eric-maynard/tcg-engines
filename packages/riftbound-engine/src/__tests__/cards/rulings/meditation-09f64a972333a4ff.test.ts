/**
 * Ruling 09f64a972333a4ff — Meditation (OGN-048 → ogn-048-298)
 *   "[Reaction] As an additional cost to play this, you may exhaust a friendly unit. If you do, draw 2.
 *    Otherwise, draw 1."
 *   × The Dreaming Tree (OGN-292 → ogn-292-298) "When a player chooses a friendly unit here with a spell for
 *     the first time each turn, they draw 1."
 *
 * Q: Does exhausting a unit at The Dreaming Tree for Meditation count as choosing it with a spell (draw)?
 * A: No. The exhaust is an additional COST, not a target of the spell's effect; objects chosen as part of a
 *    cost are not targeted, so The Dreaming Tree does not trigger. Meditation just draws 2 (or 1 unpaid).
 * Rules: 356.2 (additional costs are paid while playing), 355.6 / 352.10.c (cost objects are not targets),
 *        383.4.b (Targeting Effects trigger only on targeting).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const MEDITATION = "ogn-048-298";
const DREAMING_TREE = "ogn-292-298";

/** Inline 1-cost Reaction "Deal 1 to a unit" — a spell that really TARGETS (control case). */
const SPARK = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  name: "Spark",
  timing: "reaction",
};

/** P1's turn. P1 controls a live Dreaming Tree with a ready Dreamer (3) on it; Meditation + Spark in hand, [3]. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false, owner: P1 })
    .unit(P1, "tree", { might: 3, name: "Dreamer" }, "dreamer")
    .unit(P2, "base", { might: 3, name: "Their Guy" }, "theirs")
    .hand(P1, MEDITATION, "med")
    .hand(P1, SPARK, "spark");
}

describe("Ruling 09f64a972333a4ff — Meditation's exhaust cost does not 'choose' the unit for The Dreaming Tree", () => {
  test("control: a spell that TARGETS the Dreamer (Spark) does trigger the Tree — a Tree item joins the chain and P1 draws 1", async () => {
    const game = await board().build();
    await game.p1.cast("spark", { targets: "dreamer" });
    const hand0 = game.p1.hand().length; // med only
    expect(game.chain().map((c) => c.cardId)).toEqual(["spark", "tree"]);
    await game.settle();
    expect(game.state("dreamer").damage).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  // The exhaust is a cost object, not a target → no Dreaming Tree item, 2 cards drawn in total.
  test("ruling 09f64a972333a4ff — Meditation's exhaust-cost unit is not a spell target, so The Dreaming Tree never fires", async () => {
    const game = await board().build();
    await game.p1.cast("med", { payOptional: true, targets: "dreamer" });
    expect(game.p1.energy()).toBe(1);
    expect(game.state("dreamer").isExhausted).toBe(true); // cost paid while playing (356.2)
    expect(game.chain().map((c) => c.cardId)).toEqual(["med"]);
    expect(game.chain().some((c) => c.cardId === "tree")).toBe(false);
    const hand0 = game.p1.hand().length; // spark only
    const deck0 = game.p1.deck().length;
    await game.settle();
    expect(game.zoneOf("med")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
    expect(game.p1.deck()).toHaveLength(deck0 - 2);
    expect(game.state("dreamer").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // Meditation never used the Tree's once-per-turn trigger, so the later Spark still draws.
  test("ruling 09f64a972333a4ff — a paid Meditation leaves the Tree's first-time-each-turn draw intact for a real targeting spell later that turn", async () => {
    const game = await board().build();
    await game.p1.cast("med", { payOptional: true, targets: "dreamer" });
    await game.settle();
    const hand0 = game.p1.hand().length;
    await game.p1.cast("spark", { targets: "dreamer" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["spark", "tree"]);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1); // spent Spark, drew 1 off the Tree
  });

  test("unpaid Meditation (no unit exhausted) draws 1 and, of course, no Tree item either", async () => {
    const game = await board().build();
    await game.p1.cast("med");
    expect(game.state("dreamer").isExhausted).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["med"]);
    const hand0 = game.p1.hand().length;
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });
});
