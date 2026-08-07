/**
 * Hextech Formula — ven-062-166 · Gear · Mind · 2 energy
 *
 *   This enters exhausted.
 *   [Exhaust]: Empower another gear. (It becomes Empowered if it's not already.)
 *
 * "Another gear" is a gear-typed target that excludes Hextech Formula itself —
 * units are never legal choices.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ven-062-166";
const OTHER_GEAR = "ven-011-166"; // Pendulum Blade — a plain [Equip] gear

describe("Hextech Formula (ven-062-166)", () => {
  test("[Exhaust]: empowers another gear, not a unit", async () => {
    const game = await scenario()
      .gear(P1, CARD, "formula")
      .gear(P1, OTHER_GEAR, "blade")
      .unit(P1, "base", { might: 3 }, "ally")
      .build();

    await game.p1.activate("formula", 1);
    await game.settle();

    expect(game.state("blade").isEmpowered).toBe(true);
    expect(game.state("ally").isEmpowered).toBeFalsy();
    expect(game.state("formula").isExhausted).toBe(true);
  });

  test("the ability never offers a unit or Hextech Formula itself as the target", async () => {
    const game = await scenario()
      .gear(P1, CARD, "formula")
      .gear(P1, OTHER_GEAR, "blade")
      .unit(P1, "base", { might: 3 }, "ally")
      .unit(P2, "base", { might: 3 }, "foe")
      .build();

    await game.p1.activate("formula", 1);
    await game.settle();

    expect(game.state("ally").isEmpowered).toBeFalsy();
    expect(game.state("foe").isEmpowered).toBeFalsy();
    expect(game.state("formula").isEmpowered).toBeFalsy();
    expect(game.state("blade").isEmpowered).toBe(true);
  });
});
