/**
 * Hextech Ray — ogn-009-298 · Spell · Fury · 1 energy + 1 [fury]
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Deal 3 to a unit at a battlefield.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-009-298";

function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5 }, "big")
    .unit(P2, "bf1", { might: 3 }, "small")
    .unit(P1, "bf1", { might: 2 }, "mine")
    .unit(P2, "base", { might: 1 }, "home")
    .hand(P1, CARD, "ray");
}

describe("Hextech Ray (ogn-009-298)", () => {
  test("costs 1 energy + 1 fury; deals 3 damage to the chosen battlefield unit; goes to trash", async () => {
    const game = await board().build();
    await game.p1.cast("ray", { targets: "big" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("ray")).toBe("chain");
    await game.settle();
    expect(game.state("big").damage).toBe(3);
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
    expect(game.zoneOf("ray")).toBe("trash");
  });

  test("3 damage kills a 3-Might unit", async () => {
    const game = await board().build();
    await game.p1.cast("ray", { targets: "small" });
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
  });

  test("targets only units at a battlefield (either side); base units are not offered", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "ray")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(3);
    expect(targets).toEqual(expect.arrayContaining([["big"], ["small"], ["mine"]]));
    const t = await game.p1.try((p) => p.cast("ray", { targets: "home" }));
    expect(!t.ok && t.error.code).toBe("ILLEGAL_ARGS");
    const noBf = await scenario().resources(P1, { energy: 1, power: { fury: 1 } }).unit(P2, "base", { might: 1 }, "home").hand(P1, CARD, "ray").build();
    expect(noBf.p1.can("cast", "ray")).toBe(false);
  });

  test("[Action] timing: legal in a showdown with focus, not onto an open chain, not on the opponent's turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "mine")
      .unit(P2, "bf1", { might: 9 }, "wall")
      .hand(P1, CARD, "r1")
      .hand(P1, CARD, "r2")
      .build();
    await game.p1.move("mine", "bf1");
    const d = game.decision() as ActionDecision;
    expect(d.context).toBe("showdown");
    expect(game.p1.can("cast", "r1")).toBe(true);
    await game.p1.cast("r1", { targets: "wall" });
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.p1.can("cast", "r2")).toBe(false);

    const opp = await scenario()
      .active(P2)
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5 }, "big")
      .hand(P1, CARD, "ray")
      .build();
    expect(opp.p1.can("cast", "ray")).toBe(false);
  });

  test("not affordable without the fury power or without 1 energy", async () => {
    const noPower = await scenario().resources(P1, { energy: 1 }).battlefield("bf1").unit(P2, "bf1", { might: 5 }, "u").hand(P1, CARD, "ray").build();
    expect(noPower.p1.can("cast", "ray")).toBe(false);
    const noEnergy = await scenario().resources(P1, { power: { fury: 1 } }).battlefield("bf1").unit(P2, "bf1", { might: 5 }, "u").hand(P1, CARD, "ray").build();
    expect(noEnergy.p1.can("cast", "ray")).toBe(false);
  });
});
