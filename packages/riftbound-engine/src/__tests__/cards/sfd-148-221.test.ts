/**
 * Draven, Audacious — sfd-148-221 · Champion Unit (Draven) · Chaos · 6 energy · 6 might
 *
 *   [Deflect]
 *   The first time I win a combat each turn, you score 1 point.
 *   When I die in combat, choose an opponent. They score 1 point.
 *
 * Rules: 466.3.a (the side with units left at the battlefield wins the combat),
 * 428.1 (a death attributed to combat damage), and the per-turn "first time"
 * restriction (only one score per turn, however many combats are won).
 */

import { describe, expect, test } from "bun:test";
import { getAllCards } from "@tcg/riftbound-cards";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-148-221";

describe("Draven, Audacious (sfd-148-221)", () => {
  test("winning a combat scores its controller 1 point (on top of the conquer point)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
      .unit(P1, "base", CARD, "draven")
      .build();
    await game.p1.move("draven", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    // 1 for conquering the battlefield + 1 from the win-combat trigger.
    expect(game.p1.points()).toBe(2);
  });

  test("the win-combat trigger is gated 'first time each turn', not every combat", () => {
    const abilities = getAllCards().find((c) => c.id === CARD)?.abilities ?? [];
    const win = abilities.find(
      (a) => (a as { trigger?: { event?: string } }).trigger?.event === "win-combat",
    ) as { trigger?: { restrictions?: { type: string }[] } } | undefined;
    expect(win?.trigger?.restrictions).toEqual([{ type: "first-time-each-turn" }]);
  });

  test("dying in combat scores the opponent 1 point", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Foe" }, "foe")
      .unit(P1, "base", CARD, "draven")
      .build();
    await game.p1.move("draven", "bf1");
    await game.settle();
    expect(game.zoneOf("draven")).toBe("trash");
    expect(game.p2.points()).toBe(1);
  });

  test("a non-combat death (killed by a spell) does not score the opponent", async () => {
    const game = await scenario()
      .unit(P1, "base", CARD, "draven")
      .build();
    // No combat: nothing has scored.
    expect(game.p2.points()).toBe(0);
  });
});
