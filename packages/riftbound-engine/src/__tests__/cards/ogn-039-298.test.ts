/**
 * Kai'Sa, Survivor — ogn-039-298 · Champion Unit · Fury · 4 energy · 4 might
 *
 *   [Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)
 *   When I conquer, draw 1.
 *
 * Rules: 143.4 (enter exhausted), 805 (Accelerate), 383.4.c (Conquer Effects —
 * "When I conquer" needs THIS unit present at the conquered battlefield),
 * 469.1/469.2 (conquer vs hold).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-039-298";

describe("Kai'Sa, Survivor (ogn-039-298)", () => {
  test("costs 4 energy (no power); enters exhausted without Accelerate", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "kaisa").build();
    await game.p1.play("kaisa", { to: "base" });
    await game.settle();
    expect(game.zoneOf("kaisa")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.state("kaisa").might).toBe(4);
    expect(game.state("kaisa").isExhausted).toBe(true);
    const poor = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "kaisa").build();
    expect(poor.p1.can("play", "kaisa")).toBe(false);
  });

  test("Accelerate: 5 energy + 1 fury total and she enters ready", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { fury: 1 } }).hand(P1, CARD, "kaisa").build();
    await game.p1.play("kaisa", { accelerate: true, to: "base" });
    await game.settle();
    expect(game.state("kaisa").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("Accelerate needs the [fury] power: with 5 energy and no power only the plain play is offered", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "kaisa").build();
    const r = await game.p1.try((p) => p.play("kaisa", { accelerate: true, to: "base" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("kaisa")).toBe("hand");
  });

  test("When I conquer, draw 1: Kai'Sa takes an empty enemy battlefield → 1 point and +1 card", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "kaisa")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("kaisa", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  test("conquering through combat also draws (she kills a 1-might defender)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1 }, "weak")
      .unit(P1, "base", CARD, "kaisa")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("kaisa", "bf1");
    await game.settle();
    expect(game.zoneOf("weak")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  test.failing("BUG: 'When I conquer' — another friendly unit conquering elsewhere must NOT draw (383.4.c.2)", async () => {
    // Expected: Kai'Sa stays in base while "other" conquers bf2 → P1 scores but draws nothing.
    // Actual: the draw fires on any conquer by her controller.
    const game = await scenario()
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", CARD, "kaisa")
      .unit(P1, "base", { might: 3 }, "other")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("other", "bf2");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  test("holding is not conquering: Kai'Sa holding bf1 at the start of her turn scores but draws only the draw-phase card", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "kaisa")
      .build();
    const hand0 = game.p1.hand().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });
});
