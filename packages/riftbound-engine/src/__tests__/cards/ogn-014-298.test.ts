/**
 * Sky Splitter — ogn-014-298 · Spell · Fury · 8 energy + 1 [fury]
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   This spell's Energy cost is reduced by the highest Might among units you control.
 *   Deal 5 to a unit at a battlefield.
 *
 * Rule 356.4 (discounts) / 206 (printed cost is still 8 for other effects).
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-014-298";

function board(energy: number) {
  return scenario()
    .resources(P1, { energy, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Target" }, "foe")
    .unit(P2, "base", { might: 7, name: "Homebody" }, "home")
    .hand(P1, CARD, "sky");
}

describe("Sky Splitter (ogn-014-298)", () => {
  test("with no friendly units it costs the full 8 energy + 1 fury and deals 5 to a unit at a battlefield", async () => {
    const game = await board(8).build();
    await game.p1.cast("sky", { targets: "foe" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("sky")).toBe("chain");
    await game.settle();
    expect(game.state("foe").damage).toBe(5);
    expect(game.zoneOf("foe")).toBe("battlefield-bf1"); // 5 < 6, survives
    expect(game.zoneOf("sky")).toBe("trash");
  });

  // BUG: the parser dropped the self-discount clause; the engine always charges the printed 8.
  // Expected: 3 energy + 1 fury is enough with a 5-Might friendly unit. Actual: not playable.
  test.failing("BUG: energy cost should be reduced by the highest Might among units you control (8 - 5 = 3; rule 356.4)", async () => {
    const game = await board(3)
      .unit(P1, "base", { might: 2 }, "small")
      .unit(P1, "base", { might: 5 }, "big")
      .build();
    expect(game.p1.can("cast", "sky")).toBe(true);
    await game.p1.cast("sky", { targets: "foe" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.state("foe").damage).toBe(5);
  });

  // Expected: 9-Might friendly unit → energy cost 0, only [fury] due. Actual: full 8 energy demanded.
  test.failing("BUG: a friendly unit with 8+ Might should reduce the energy cost to 0 with the power cost still due (rule 356.4.e)", async () => {
    const game = await board(0).unit(P1, "base", { might: 9 }, "giant").build();
    expect(game.p1.can("cast", "sky")).toBe(true);
    await game.p1.cast("sky", { targets: "foe" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    const noPower = await scenario()
      .resources(P1, { energy: 0 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6 }, "foe")
      .unit(P1, "base", { might: 9 }, "giant")
      .hand(P1, CARD, "sky")
      .build();
    expect(noPower.p1.can("cast", "sky")).toBe(false);
  });

  // Expected: 2 energy is short of the reduced cost 3, 3 energy is enough. Actual: never playable below 8.
  test.failing("BUG: reduced cost boundary — 2 energy with a 5-Might unit is not enough, 3 is (rule 356.4)", async () => {
    const game = await board(2).unit(P1, "base", { might: 5 }, "big").build();
    expect(game.p1.can("cast", "sky")).toBe(false);
    await game.p1.do("addResources", { energy: 1 });
    expect(game.p1.can("cast", "sky")).toBe(true);
  });

  test("targets only units at a battlefield (either side) — units in a base are not offered", async () => {
    const game = await board(8).unit(P1, "bf1", { might: 1 }, "mine").build();
    const targets = game.p1.option("cast", "sky")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(2);
    expect(targets).toEqual(expect.arrayContaining([["foe"], ["mine"]]));
    const t = await game.p1.try((p) => p.cast("sky", { targets: "home" }));
    expect(t.ok).toBe(false);
  });

  test("kills a unit at a battlefield with 5 or less Might", async () => {
    const game = await board(8).unit(P2, "bf1", { might: 5 }, "weak").build();
    await game.p1.cast("sky", { targets: "weak" });
    await game.settle();
    expect(game.zoneOf("weak")).toBe("trash");
  });

  test("[Action] timing: legal during a showdown where you have Focus, not on the opponent's turn", async () => {
    const game = await board(8).unit(P1, "base", { might: 1 }, "scout").build();
    await game.p1.move("scout", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "sky")).toBe(true);
    const oppTurn = await board(8).active(P2).build();
    expect(oppTurn.p1.can("cast", "sky")).toBe(false);
  });
});
