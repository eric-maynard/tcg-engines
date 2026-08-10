/**
 * Ruling eef1f459ab657147 — Meditation (OGN-048 → ogn-048-298) · [Reaction] · [2] "As an additional cost to play this, you may
 *     exhaust a friendly unit. If you do, draw 2. Otherwise, draw 1."
 *   × The Dreaming Tree (OGN-292 → ogn-292-298) "When a player chooses a friendly unit here with a spell for the first time
 *     each turn, they draw 1."
 *
 * Q: Does exhausting my unit at the Dreaming Tree for Meditation trigger the Tree (3 cards total)?
 * A: No. The exhaust is a COST of playing Meditation, not a target/choice of the spell, so the Tree does not trigger. You
 *    draw only what Meditation itself gives.
 * Rules: 356.2 (additional costs), 355.6 / 383.4.b.3 (only targeting counts as "choosing"), 130.
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const MEDITATION = "ogn-048-298";
const DREAMING_TREE = "ogn-292-298";
const DISCIPLINE = "ogn-058-298"; // [2] "Give a unit +2 [Might] this turn. Draw 1." — a spell that DOES choose (contrast)

/** P1's turn with exactly [2]. P1 controls the LIVE Dreaming Tree with a ready 3-Might Dreamer on it. Known deck d1..d4. */
function board(card: string) {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false, owner: P1 })
    .unit(P1, "tree", { might: 3, name: "Dreamer" }, "dreamer")
    .hand(P1, card, "spell")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3", "d4"]);
}

describe("Ruling eef1f459ab657147 — exhausting a unit at the Dreaming Tree for Meditation is a cost, not a choice", () => {
  test("Meditation paying the exhaust with the Dreamer: the Dreamer is exhausted as the spell is finalized, NO Tree item appears, and P1 draws exactly 2 (not 3)", async () => {
    const game = await board(MEDITATION).build();
    await game.p1.cast("spell", { payOptional: true, targets: "dreamer" });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("dreamer").isExhausted).toBe(true); // cost paid up front
    expect(game.chain().map((c) => c.cardId)).toEqual(["spell"]);
    expect(game.chain().some((c) => c.cardId === "tree")).toBe(false);
    await game.settle();
    expect(game.zoneOf("spell")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
    expect(game.p1.deck()[0]).toBe("d3");
    expect(game.violations()).toEqual([]);
  });

  test("Meditation without the optional cost: Dreamer stays ready, draw 1 — still no Tree involvement", async () => {
    const game = await board(MEDITATION).build();
    await game.p1.cast("spell", { payOptional: false });
    expect(game.chain().some((c) => c.cardId === "tree")).toBe(false);
    await game.settle();
    expect(game.state("dreamer").isReady).toBe(true);
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("contrast: a spell that actually CHOOSES the Dreamer (Discipline) does trigger the Tree — a Tree item above the spell, 1 + 1 = 2 cards", async () => {
    const game = await board(DISCIPLINE).build();
    await game.p1.cast("spell", { targets: "dreamer" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["spell", "tree"]);
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
    expect(game.state("dreamer").might).toBe(5);
  });
});
