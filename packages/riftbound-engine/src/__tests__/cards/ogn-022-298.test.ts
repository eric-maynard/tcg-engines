/**
 * Thermo Beam — ogn-022-298 · Spell · Fury · 5 energy · [fury][fury]
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Kill all gear.
 *
 * Rule 355.10.d — "all gear" is selected programmatically, so the spell
 * targets nothing (playable with no gear around; friendly gear dies too).
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-022-298";

function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .gear(P1, { name: "My Trinket" }, "mine")
    .gear(P2, { name: "Their Trinket" }, "theirs1")
    .gear(P2, { name: "Their Bauble" }, "theirs2")
    .unit(P1, "base", { might: 2 }, "ally")
    .unit(P2, "bf1", { might: 3 }, "foe")
    .hand(P1, CARD, "beam");
}

describe("Thermo Beam (ogn-022-298)", () => {
  test("costs 5 energy + 2 fury; kills every gear on the board (both sides) and goes to trash", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "beam")).toBe(true);
    await game.p1.cast("beam");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("fury")).toBe(0);
    expect(game.zoneOf("beam")).toBe("chain");
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.zoneOf("theirs1")).toBe("trash");
    expect(game.zoneOf("theirs2")).toBe("trash");
    expect(game.zoneOf("beam")).toBe("trash");
  });

  test("only gear: units are untouched", async () => {
    const game = await board().build();
    await game.p1.cast("beam");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.state("ally").damage).toBe(0);
    expect(game.state("foe").damage).toBe(0);
  });

  test("targets nothing (355.10.d): castable with no gear on the board, simply resolves to trash", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { fury: 2 } }).hand(P1, CARD, "beam").build();
    expect(game.p1.can("cast", "beam")).toBe(true);
    await game.p1.cast("beam");
    await game.settle();
    expect(game.zoneOf("beam")).toBe("trash");
  });

  test("[Action] timing: castable with Focus in a showdown; not on the opponent's turn", async () => {
    const game = await board().build();
    await game.p1.move("ally", "bf1");
    const d = game.decision() as ActionDecision;
    expect(d.context).toBe("showdown");
    expect(d.seat).toBe(P1);
    expect(game.p1.can("cast", "beam")).toBe(true);
    await game.p1.cast("beam");
    await game.settle();
    expect(game.zoneOf("theirs1")).toBe("trash");

    const oppTurn = await board().active(P2).build();
    expect(oppTurn.p1.can("cast", "beam")).toBe(false);
  });

  test("not affordable with 5 energy but only 1 fury, or 4 energy + 2 fury", async () => {
    const lowPower = await scenario().resources(P1, { energy: 5, power: { fury: 1 } }).gear(P2, { name: "T" }, "t").hand(P1, CARD, "beam").build();
    expect(lowPower.p1.can("cast", "beam")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 4, power: { fury: 2 } }).gear(P2, { name: "T" }, "t").hand(P1, CARD, "beam").build();
    expect(lowEnergy.p1.can("cast", "beam")).toBe(false);
    const r = await lowEnergy.p1.try((p) => p.cast("beam"));
    expect(r.ok).toBe(false);
    expect(lowEnergy.zoneOf("t")).toBe("base");
  });
});
