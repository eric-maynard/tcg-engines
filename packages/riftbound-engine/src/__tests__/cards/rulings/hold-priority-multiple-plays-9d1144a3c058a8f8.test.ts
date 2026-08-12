/**
 * Ruling 9d1144a3c058a8f8 — (no specific card) the player with Priority may play several cards in a row.
 *   Exercised with inline filler spells: a base-speed "Draw 2" and three [Reaction] "Draw 1"s.
 *
 * Q: When I create a chain, must I pass priority after each card, or can I play several first?
 * A: You keep priority after each play — play as many legally-timed cards as you like, then pass
 *    when you choose to. (Same as holding priority in MTG.)
 * Rules: 337.1.a (finalizing an item does not pass Priority), 338.1.a (Execute: play a legally-timed
 *    card OR pass), 312.2 (who receives Priority), 813.1.c.1 ([Reaction] timing in Closed States).
 */
import { describe, expect, test } from "bun:test";
import type { InlineCardDef } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAW2: InlineCardDef = {
  abilities: [{ effect: { amount: 2, type: "draw" }, type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Filler Deep Insight",
  rulesText: "Draw 2.",
  timing: "standard",
};

const reactionDraw = (name: string): InlineCardDef => ({
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  keywords: ["Reaction"],
  name,
  rulesText: "[Reaction] Draw 1.",
  timing: "reaction",
});

/** A second base-speed spell, to show base speed is NOT legal once the chain is Closed. */
const SLOW_DRAW: InlineCardDef = { ...DRAW2, name: "Filler Slow Insight", rulesText: "Draw 1." };

function board() {
  return scenario()
    .resources(P1, { energy: 5 })
    .resources(P2, { energy: 5 })
    .hand(P1, DRAW2, "opener")
    .hand(P1, reactionDraw("Filler Snap 1"), "r1")
    .hand(P1, reactionDraw("Filler Snap 2"), "r2")
    .hand(P1, reactionDraw("Filler Snap 3"), "r3")
    .hand(P1, SLOW_DRAW, "slow");
}

describe("Ruling 9d1144a3c058a8f8 — the active player holds priority and may stack card after card", () => {
  test("after each play P1 is still the acting seat and may play again", async () => {
    const game = await board().build();
    await game.p1.cast("opener");
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("r1");
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("r2");
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("r3");
    expect(game.actingSeat()).toBe(P1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["opener", "r1", "r2", "r3"]);
    expect(game.chain().every((c) => c.controller === P1)).toBe(true);
  });

  test("P2 never got a window while P1 was holding — nothing resolved and P1 always had the pass option too", async () => {
    const game = await board().build();
    await game.p1.cast("opener");
    await game.p1.cast("r1");
    expect(game.p1.can("passPriority")).toBe(true); // passing was always available; P1 chose not to
    expect(game.p1.hand()).toContain("r2");
    expect(game.zoneOf("opener")).toBe("chain");
    expect(game.zoneOf("r1")).toBe("chain");
  });

  test("'as many LEGALLY TIMED cards as you want' — a base-speed spell is not legal once the chain is Closed", async () => {
    const game = await board().build();
    await game.p1.cast("opener");
    expect(game.p1.can("cast", "slow")).toBe(false);
    const denied = await game.p1.try((p) => p.cast("slow"));
    expect(denied.ok).toBe(false);
    expect(game.zoneOf("slow")).toBe("hand");
    expect(game.p1.can("cast", "r1")).toBe(true); // the [Reaction] is
  });

  test("only when P1 finally passes does P2 get priority; the stack then resolves top-down", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("opener");
    await game.p1.cast("r1");
    await game.p1.cast("r2");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.settle();
    expect(game.chain()).toEqual([]);
    // 3 cards left the hand, 1 + 1 + 2 cards were drawn.
    expect(game.p1.hand().length).toBe(handBefore - 3 + 4);
    expect(game.violations()).toEqual([]);
  });
});
