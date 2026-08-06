/**
 * Vilemaw — unl-060-219 · Unit · Calm · 8 energy · 8 might
 *
 *   [Ambush]
 *   Enemy units here with less Might than me don't deal combat damage.
 *   When I hold, draw 1.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const VILEMAW = "unl-060-219";

describe("Vilemaw (unl-060-219)", () => {
  test("weaker enemy attackers deal no combat damage: Vilemaw survives two 5-Might attackers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", VILEMAW, "vilemaw")
      .unit(P1, "base", { might: 5 }, "a1")
      .unit(P1, "base", { might: 5 }, "a2")
      .build();

    await game.p1.move(["a1", "a2"], "bf1");
    await game.settle();

    // Without the static, 5 + 5 = 10 ≥ 8 would kill Vilemaw.
    expect(game.locationOf("vilemaw")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("an enemy with equal or greater Might still deals combat damage", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", VILEMAW, "vilemaw")
      .unit(P1, "base", { might: 8 }, "big")
      .build();

    await game.p1.move("big", "bf1");
    await game.settle();

    expect(game.zoneOf("vilemaw")).toBe("trash");
  });
});
