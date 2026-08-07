/**
 * Eclipse Dragon — ven-016-166 · Unit · Fury · 8 energy · 8 might
 *
 *   [Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)
 *   When I move, if you control 4 or fewer runes, draw 1.
 *
 * Rules: 805 Accelerate (optional additional cost [1][C]; paid → the unit enters ready,
 * otherwise units enter exhausted, 143.4).
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ven-016-166";

describe("Eclipse Dragon (ven-016-166)", () => {
  test("base play costs 8 energy and no power; the unit enters exhausted", async () => {
    const game = await scenario().resources(P1, { energy: 8, power: { fury: 1 } }).hand(P1, CARD, "d").build();
    await game.p1.play("d");
    await game.settle();
    expect(game.zoneOf("d")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
    expect(game.state("d").isExhausted).toBe(true);
  });

  // rule 805: Accelerate charges the printed additional cost [1][fury] on top of the play cost.
  test("Accelerate charges the extra [1][fury] and the unit enters ready", async () => {
    const game = await scenario().resources(P1, { energy: 9, power: { fury: 2 } }).hand(P1, CARD, "d").build();
    await game.p1.play("d", { accelerate: true });
    await game.settle();
    expect(game.zoneOf("d")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
    expect(game.state("d").isReady).toBe(true);
  });
});
