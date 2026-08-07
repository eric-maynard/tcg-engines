/**
 * Insightful Investigator — unl-135-219 · Unit · Chaos · 3 energy · 3 might
 *
 *   "When you play me, choose an opponent. They reveal their hand. You may pay
 *    2 XP to choose a card from their hand. If you do, they discard that card
 *    and draw 1."
 *
 * rule 356.1 — the reveal is unconditional; only the pick costs 2 XP.
 * rule 355.13 — the pick is optional: after the hand is revealed the player may
 * still decline instead of being forced to discard one of the revealed cards.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "unl-135-219";
const FILLER = "ogn-175-298"; // vanilla unit, 3 energy, no power

describe("Insightful Investigator (unl-135-219)", () => {
  test("picking a card spends the 2 XP and discards it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .xp(P1, 3)
      .hand(P1, CARD, "inv")
      .hand(P2, FILLER, "theirs")
      .build();
    await game.p1.play("inv");
    await game.settle();
    await game.p1.pick("theirs");
    await game.settle();
    expect(game.p1.xp()).toBe(1);
    expect(game.zoneOf("theirs")).toBe("trash");
  });

  test("the hand is revealed even when the 2 XP is not paid", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .xp(P1, 3)
      .hand(P1, CARD, "inv")
      .hand(P2, FILLER, "theirs")
      .build();
    await game.p1.play("inv");
    await game.settle();

    // rule 356.1 — "They reveal their hand" is free and happens before the
    // "you may pay 2 XP" decision, so the prompt shows the opponent's hand.
    const decision = game.decision();
    expect(decision?.seat).toBe(P1);
    expect(decision?.options?.map((o) => o.key)).toContain("theirs");

    await game.p1.decline();
    await game.settle();
    // Declining costs nothing and discards nothing.
    expect(game.p1.xp()).toBe(3);
    expect(game.zoneOf("theirs")).toBe("hand");
  });

  test("without 2 XP no card may be picked (the reveal still happened)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .xp(P1, 1)
      .hand(P1, CARD, "inv")
      .hand(P2, FILLER, "theirs")
      .build();
    await game.p1.play("inv");
    // rule 356.1 — the pick costs 2 XP, so with 1 XP only declining is legal
    // and the prompt resolves itself without charging or discarding anything.
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("hand");
    expect(game.p1.xp()).toBe(1);
  });

  test("the opponent who discarded draws 1, not the controller", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .xp(P1, 2)
      .hand(P1, CARD, "inv")
      .hand(P2, FILLER, "theirs")
      .hand(P2, FILLER, "keep")
      .build();
    const p1HandBefore = game.p1.hand().length;
    const p2DeckBefore = game.p2.deck().length;
    await game.p1.play("inv");
    await game.settle();
    await game.p1.pick("theirs");
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.p2.deck().length).toBe(p2DeckBefore - 1);
    // only the Investigator left P1's hand — P1 never draws.
    expect(game.p1.hand().length).toBe(p1HandBefore - 1);
  });
});
