/**
 * Wraith of Echoes — ogn-118-298 · Unit · Mind · 6 energy + [mind] · 5 might
 *
 *   The first time a friendly unit dies each turn, draw 1.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const WRAITH = "ogn-118-298";

/** P1 has Wraith in base, two 1-might fodder units, and P2 holds bf1 with a 6-might wall. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", WRAITH, "wraith")
    .unit(P1, "base", { might: 1 }, "fodder1")
    .unit(P1, "base", { might: 1 }, "fodder2")
    .unit(P2, "bf1", { might: 6 }, "wall");
}

describe("Wraith of Echoes (ogn-118-298)", () => {
  test("costs 6 energy + 1 mind power", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { mind: 1 } }).hand(P1, WRAITH, "wraith").build();
    await game.p1.play("wraith", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("wraith")).toBe("base");
    expect(game.state("wraith").might).toBe(5);
    const noPower = await scenario().resources(P1, { energy: 6 }).hand(P1, WRAITH, "wraith").build();
    expect(noPower.p1.can("play", "wraith")).toBe(false);
  });

  test.failing("BUG: a friendly unit dying (in combat) draws 1", async () => {
    // Expected: fodder1 dies → the trigger resolves and P1's hand grows by 1. Actual: the
    // friendly-unit "die" trigger never fires (hand unchanged) — same for spell kills.
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("fodder1", "bf1");
    await game.settle();
    expect(game.zoneOf("fodder1")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  test.failing("BUG: only the FIRST friendly death each turn draws — a second death the same turn draws nothing", async () => {
    // Expected: +1 after the first death, still +1 after the second. Actual: never draws.
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("fodder1", "bf1");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    await game.p1.move("fodder2", "bf1");
    await game.settle();
    expect(game.zoneOf("fodder2")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  test.failing("BUG: two friendly units dying simultaneously is still one 'first time' → exactly 1 card", async () => {
    // Expected: a single trigger (one event), hand +1. Actual: never draws.
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await game.p1.move(["fodder1", "fodder2"], "bf1");
    await game.settle();
    expect(game.zoneOf("fodder1")).toBe("trash");
    expect(game.zoneOf("fodder2")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  test("an ENEMY unit dying does not draw", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", WRAITH, "wraith")
      .unit(P1, "base", { might: 6 }, "bruiser")
      .unit(P2, "bf1", { might: 1 }, "victim")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.locationOf("bruiser")).toBe("bf1");
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  test.failing("BUG: 'each turn' resets — a friendly death on the following (opponent's) turn draws again", async () => {
    // Expected: the once-per-turn limit refreshes every turn (yours and the opponent's). Actual:
    // the trigger never fires at all.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "base", WRAITH, "wraith")
      .unit(P1, "base", { might: 1 }, "fodder1")
      .unit(P1, "bf2", { might: 1 }, "sentry")
      .unit(P2, "bf1", { might: 6 }, "wall")
      .unit(P2, "base", { might: 6 }, "raider")
      .build();
    await game.p1.move("fodder1", "bf1");
    await game.settle();
    const afterFirst = game.p1.hand().length;
    await game.advanceTurn(); // → P2's turn
    expect(game.turnPlayer()).toBe(P2);
    const beforeRaid = game.p1.hand().length;
    expect(beforeRaid).toBe(afterFirst);
    await game.p2.move("raider", "bf2");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(beforeRaid + 1);
  });
});
