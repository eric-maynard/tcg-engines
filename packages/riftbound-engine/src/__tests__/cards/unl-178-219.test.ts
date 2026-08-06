/**
 * Poppy, Defender of the Meek — unl-178-219 · Unit · Order · 6 energy + 1 [order] · 5 might
 *
 *   You may spend 3 XP as an additional cost to play me. If you do, I cost [3] less.
 *   [Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)
 *   [Tank] (I must be assigned combat damage first.)
 *
 * Rule 560 — optional additional cost paid in XP with a cost-reduction rider.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const POPPY = "unl-178-219";

describe("Poppy, Defender of the Meek (unl-178-219)", () => {
  test("paying 3 XP plays her for 3 energy", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { order: 1 } })
      .xp(P1, 4)
      .hand(P1, POPPY, "poppy")
      .build();

    expect(game.p1.can("play", "poppy")).toBe(true);
    await game.p1.play("poppy", { payOptional: true });
    await game.settle();

    expect(game.zoneOf("poppy")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.xp()).toBe(1);
  });

  test("without enough XP the discounted play is not offered", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { order: 1 } })
      .xp(P1, 2)
      .hand(P1, POPPY, "poppy")
      .build();

    expect(game.p1.can("play", "poppy")).toBe(false);
  });

  test("unpaid play charges the full 6 energy and no XP", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { order: 1 } })
      .xp(P1, 3)
      .hand(P1, POPPY, "poppy")
      .build();

    await game.p1.play("poppy", { payOptional: false });
    await game.settle();

    expect(game.zoneOf("poppy")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.xp()).toBe(3);
  });
});
