/**
 * Tryndamere, Barbarian — ogn-034-298 · Champion Unit · Fury · 7 energy · [fury][fury] · 8 might
 *
 *   When I conquer after an attack, if you assigned 5 or more excess damage to
 *   enemy units, you score 1 point.
 *
 * Rule 465.2.c — the attacker assigns damage equal to its summed Might among
 * enemy units; "excess" is what was assigned beyond the defenders' lethal
 * thresholds. Conquering itself scores 1 (rule 467), the trigger adds 1 more.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-034-298";

function attackInto(defenderMight: number) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", CARD, "trynd")
    .unit(P2, "bf1", { might: defenderMight, name: "Defender" }, "def")
    .build();
}

describe("Tryndamere, Barbarian (ogn-034-298)", () => {
  test("costs 7 energy + 2 fury and enters the base exhausted as an 8-might unit", async () => {
    const game = await scenario().resources(P1, { energy: 7, power: { fury: 2 } }).hand(P1, CARD, "trynd").build();
    expect(game.p1.can("play", "trynd")).toBe(true);
    await game.p1.play("trynd", { to: "base" });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("fury")).toBe(0);
    await game.settle();
    expect(game.zoneOf("trynd")).toBe("base");
    expect(game.state("trynd").might).toBe(8);
    expect(game.state("trynd").isExhausted).toBe(true);
  });

  test("not playable with 7 energy but only 1 fury", async () => {
    const game = await scenario().resources(P1, { energy: 7, power: { fury: 1 } }).hand(P1, CARD, "trynd").build();
    expect(game.p1.can("play", "trynd")).toBe(false);
  });

  test("conquering after an attack with 5+ excess damage (8 into a 3-might defender) scores 1 extra point", async () => {
    const game = await attackInto(3);
    expect(game.p1.points()).toBe(0);
    await game.p1.move("trynd", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.locationOf("trynd")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    // 1 for the conquer + 1 from the trigger.
    expect(game.p1.points()).toBe(2);
  });

  test("with fewer than 5 excess damage (8 into a 4-might defender) only the conquer point should be scored", async () => {
    // Expected: 8 assigned vs lethal 4 → 4 excess → condition false → 1 point (conquer only).
    // Actual: evaluateTriggerCondition does not know `excess-damage-assigned` and is permissive,
    // so the trigger scores on every conquer (2 points).
    const game = await attackInto(4);
    await game.p1.move("trynd", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("excess is summed across enemy units: 8 into two 1-might defenders (6 excess) scores the extra point", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "trynd")
      .unit(P2, "bf1", { might: 1 }, "d1")
      .unit(P2, "bf1", { might: 1 }, "d2")
      .build();
    await game.p1.move("trynd", "bf1");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.zoneOf("d2")).toBe("trash");
    expect(game.p1.points()).toBe(2);
  });

  test("conquering an EMPTY enemy battlefield is not 'after an attack' (316.8.b.1) — only the conquer point should be scored", async () => {
    // Expected: no combat happened and 0 excess damage was assigned → 1 point.
    // Actual: the conquer trigger fires unconditionally → 2 points.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "trynd")
      .build();
    await game.p1.move("trynd", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
