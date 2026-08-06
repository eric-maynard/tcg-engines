/**
 * Final Spark — ogs-022-024 · Spell · Mind/Order · 8 energy · Action
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Deal 8 to a unit.
 *
 * "a unit": any unit on the board — friendly or enemy, in a base or at a battlefield. Damage ≥
 * Might is lethal (142.4); a tougher unit keeps the 8 damage marked. Action timing = your turn in
 * an open state, or while you hold Focus in a showdown.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogs-022-024";

function board(energy = 8) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 8, name: "Field Giant" }, "giant")
    .unit(P2, "base", { might: 3, name: "Home Foe" }, "homeFoe")
    .unit(P1, "base", { might: 9, name: "Colossus" }, "mine")
    .hand(P1, CARD, "spark");
}

describe("Final Spark (ogs-022-024)", () => {
  test("costs 8 energy and no power; 7 energy is not enough", async () => {
    const game = await board().build();
    await game.p1.cast("spark", { targets: "giant" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "spark", controller: P1, triggered: false })]);
    const poor = await board(7).build();
    expect(poor.p1.can("cast", "spark")).toBe(false);
  });

  test("Deal 8 to a unit: an 8-Might enemy at a battlefield is killed; the spell goes to the trash", async () => {
    const game = await board().build();
    await game.p1.cast("spark", { targets: "giant" });
    await game.settle();
    expect(game.zoneOf("giant")).toBe("trash");
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.zoneOf("spark")).toBe("trash");
  });

  test("'a unit' is any unit: enemy units in a base and your own units are legal; a 9-Might unit survives with 8 damage", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "spark")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(3);
    expect(targets).toEqual(expect.arrayContaining([["giant"], ["homeFoe"], ["mine"]]));
    await game.p1.cast("spark", { targets: "mine" });
    await game.settle();
    expect(game.zoneOf("mine")).toBe("base");
    expect(game.state("mine").damage).toBe(8);

    const other = await board().build();
    await other.p1.cast("spark", { targets: "homeFoe" });
    await other.settle();
    expect(other.zoneOf("homeFoe")).toBe("trash");
  });

  test("not playable with no unit on the board", async () => {
    const game = await scenario().resources(P1, { energy: 8 }).hand(P1, CARD, "spark").build();
    expect(game.p1.can("cast", "spark")).toBe(false);
  });

  test("[Action] timing: not on the opponent's turn in an open state; playable with Focus in a showdown on their turn", async () => {
    const game = await board().active(P2).battlefield("mineBf", { controller: P1 }).unit(P1, "mineBf", { might: 1 }, "bait").build();
    expect(game.p1.can("cast", "spark")).toBe(false);
    await game.p2.move("homeFoe", "mineBf");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "spark")).toBe(true);
    await game.p1.cast("spark", { targets: "homeFoe" });
    await game.settle();
    // The lone attacker died before combat damage: P1's bait keeps the battlefield.
    expect(game.zoneOf("homeFoe")).toBe("trash");
    expect(game.locationOf("bait")).toBe("mineBf");
    expect(game.gameState.battlefields.mineBf?.controller).toBe(P1);
  });
});
