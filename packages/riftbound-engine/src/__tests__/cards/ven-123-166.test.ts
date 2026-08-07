/**
 * Soulspinner — ven-123-166 · Unit · Order · 3 energy · 3 Might
 *
 *   [Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)
 *
 * Head-judge note: a battlefield holds at most one showdown (344.1). Ambushing into a
 * battlefield whose showdown is already in progress joins that showdown (464.2.c.3.a);
 * it must not open a second one on the showdown stack.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ven-123-166";

describe("Soulspinner (ven-123-166)", () => {
  test("Ambush into a battlefield with a showdown already in progress joins it — no duplicate showdown", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { order: 3, rainbow: 3 } })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .hand(P1, CARD, "spinner")
      .build();

    await game.p1.move("scout", "bf1");
    const openOn = () =>
      (game.gameState.interaction?.showdownStack ?? []).filter(
        (sd) => sd.active && sd.battlefieldId === "bf1",
      );
    expect(openOn()).toHaveLength(1);

    await game.p1.play("spinner", { to: "bf1" });
    expect(game.locationOf("spinner")).toBe("bf1");
    expect(openOn()).toHaveLength(1);

    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
