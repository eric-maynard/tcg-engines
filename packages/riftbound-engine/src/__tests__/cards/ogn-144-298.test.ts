/**
 * Spoils of War — ogn-144-298 · Spell · Body · 4 energy + [body]
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   If an enemy unit has died this turn, this costs [2] less.
 *   Draw 2.
 *
 * Rule 356.4.b — "cost [amount] less" is a discount applied while paying costs.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-144-298";
const HEXTECH_RAY = "ogn-009-298"; // [Action] 1 energy + [fury]: Deal 3 to a unit at a battlefield.

function board(energy: number) {
  return scenario()
    .resources(P1, { energy, power: { body: 1, fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2 }, "foe")
    .unit(P1, "bf1", { might: 2 }, "ally")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P1, CARD, "spoils");
}

describe("Spoils of War (ogn-144-298)", () => {
  test("costs 4 energy + 1 body and draws 2; spell goes to trash", async () => {
    const game = await board(4).build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("spoils");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, fury: 1 } });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 2);
    expect(game.zoneOf("spoils")).toBe("trash");
  });

  test("unaffordable with 3 energy (no enemy death) or without the body power", async () => {
    const lowEnergy = await board(3).build();
    expect(lowEnergy.p1.can("cast", "spoils")).toBe(false);
    const noBody = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "spoils").build();
    expect(noBody.p1.can("cast", "spoils")).toBe(false);
  });

  test.failing("BUG: costs [2] less (2 energy + body) once an enemy unit has died this turn", async () => {
    // Expected: after Hextech Ray kills the enemy 2-might unit, Spoils of War costs 2 energy + [body],
    // so with 3 energy (1 spent on the Ray) it is castable and leaves 0. Actual: the parsed ability only
    // carries "Draw 2" — no conditional discount — so it still demands 4 energy.
    const game = await board(3).build();
    await game.p1.cast("ray", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("cast", "spoils")).toBe(true);
    await game.p1.cast("spoils");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, fury: 0 } });
  });

  test("a FRIENDLY unit dying this turn does not discount it", async () => {
    const game = await board(3).build();
    await game.p1.cast("ray", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("cast", "spoils")).toBe(false);
  });

  test("[Reaction]: castable on the opponent's turn and in response to a spell on the chain", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 4, power: { body: 1 } })
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3 }, "ally")
      .hand(P2, HEXTECH_RAY, "ray")
      .hand(P1, CARD, "spoils")
      .build();
    expect(game.p1.can("cast", "spoils")).toBe(true);
    await game.p2.cast("ray", { targets: "ally" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "spoils")).toBe(true);
    const handBefore = game.p1.hand().length;
    await game.p1.cast("spoils");
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "spoils"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Spoils resolves first (LIFO)
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 2);
    expect(game.state("ally").damage).toBe(0); // Ray still waiting underneath
  });
});
