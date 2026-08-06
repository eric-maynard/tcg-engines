/**
 * Vengeance — ogn-229-298 · Spell · Order · 4 energy + [order][order]
 *
 *   Kill a unit.
 *
 * Rules: 429 (Kill: a permanent on the board goes to its owner's trash), 355.6
 * (targeting — "a unit" is any unit on the board, either side, any location).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-229-298";

function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { order: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 8, name: "Big" }, "big")
    .unit(P2, "base", { might: 2, name: "Homebody" }, "home")
    .unit(P1, "base", { might: 3, name: "Mine" }, "mine")
    .hand(P1, CARD, "vengeance");
}

describe("Vengeance (ogn-229-298)", () => {
  test("costs 4 energy + 2 order: kills the chosen unit regardless of its Might; spell goes to trash", async () => {
    const game = await board().build();
    await game.p1.cast("vengeance", { targets: "big" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("vengeance")).toBe("chain");
    await game.settle();
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.state("big").owner).toBe(P2);
    expect(game.zoneOf("home")).toBe("base");
    expect(game.zoneOf("vengeance")).toBe("trash");
  });

  test("targets: any unit — enemy at a battlefield, enemy in base, or your own", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "vengeance")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(3);
    expect(targets).toEqual(expect.arrayContaining([["big"], ["home"], ["mine"]]));
    await game.p1.cast("vengeance", { targets: "home" });
    await game.settle();
    expect(game.zoneOf("home")).toBe("trash");
  });

  test("can kill a friendly unit too", async () => {
    const game = await board().build();
    await game.p1.cast("vengeance", { targets: "mine" });
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash");
  });

  test("not castable with only 1 order power, or with 3 energy, or with no unit on the board", async () => {
    const onePower = await scenario().resources(P1, { energy: 4, power: { order: 1 } }).unit(P2, "base", { might: 1 }, "u").hand(P1, CARD, "vengeance").build();
    expect(onePower.p1.can("cast", "vengeance")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 3, power: { order: 2 } }).unit(P2, "base", { might: 1 }, "u").hand(P1, CARD, "vengeance").build();
    expect(lowEnergy.p1.can("cast", "vengeance")).toBe(false);
    const noUnits = await scenario().resources(P1, { energy: 4, power: { order: 2 } }).hand(P1, CARD, "vengeance").build();
    expect(noUnits.p1.can("cast", "vengeance")).toBe(false);
  });

  test("not castable on the opponent's turn (no Action/Reaction keyword)", async () => {
    const game = await scenario().active(P2).resources(P1, { energy: 4, power: { order: 2 } }).unit(P2, "base", { might: 1 }, "u").hand(P1, CARD, "vengeance").build();
    expect(game.p1.can("cast", "vengeance")).toBe(false);
  });
});
