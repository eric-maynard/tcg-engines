/**
 * Stand United — ogn-053-298 · Spell · Calm · 3 energy · Action
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   [Action] (Play on your turn or in showdowns.)
 *   Buff a friendly unit. Buffs give an additional +1 [Might] to friendly units
 *   this turn. (To buff a unit, give it a +1 [Might] buff if it doesn't already have one.)
 *
 * Rules: 426/702-703 (a buff is a counter worth +1 Might, max one per unit),
 * 811 (Hidden; 811.2 uses this very card as the example: from facedown the buff
 * target must be at that battlefield, the "+1 to buffed friends" part is global).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-053-298";

function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .unit(P1, "base", { might: 2 }, "ally")
    .unit(P1, "base", { might: 2 }, "veteran", { buffed: true })
    .unit(P2, "base", { might: 2 }, "foe")
    .unit(P2, "base", { might: 2 }, "foeBuffed", { buffed: true })
    .hand(P1, CARD, "su");
}

describe("Stand United (ogn-053-298)", () => {
  test("costs 3 energy; only friendly units are legal targets; buffs the chosen unit; goes to trash", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "su")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(2);
    expect(targets).toEqual(expect.arrayContaining([["ally"], ["veteran"]]));
    await game.p1.cast("su", { targets: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("ally").isBuffed).toBe(true);
    expect(game.state("foe").isBuffed).toBe(false);
    expect(game.zoneOf("su")).toBe("trash");
    const poor = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", { might: 2 }, "ally").hand(P1, CARD, "su").build();
    expect(poor.p1.can("cast", "su")).toBe(false);
  });

  test("the buff itself is permanent: +1 Might that is still there next turn (703)", async () => {
    const game = await board().build();
    await game.p1.cast("su", { targets: "ally" });
    await game.settle();
    await game.advanceTurn();
    expect(game.state("ally").isBuffed).toBe(true);
    expect(game.state("ally").might).toBe(3);
    expect(game.state("veteran").might).toBe(3);
  });

  test.failing("BUG: 'Buffs give an additional +1 Might to friendly units this turn' — every buffed friendly unit is +2 over base this turn, buffed enemies are not", async () => {
    // Expected this turn: ally 2+1+1 = 4, veteran (already buffed) 4, foeBuffed stays 3; next turn ally/veteran back to 3.
    // Actual: only the plain buff is applied (ally 3, veteran 3).
    const game = await board().build();
    await game.p1.cast("su", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(4);
    expect(game.state("veteran").might).toBe(4);
    expect(game.state("foeBuffed").might).toBe(3);
    expect(game.state("foe").might).toBe(2);
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(3);
    expect(game.state("veteran").might).toBe(3);
  });

  test("Action timing: not playable on the opponent's turn outside a showdown", async () => {
    const game = await scenario().active(P2).resources(P1, { energy: 3 }).unit(P1, "base", { might: 2 }, "ally").hand(P1, CARD, "su").build();
    expect(game.p1.can("cast", "su")).toBe(false);
  });

  test("Hidden: hide for [rainbow] at a battlefield you control; no chain opens; not at an enemy battlefield", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "here")
      .hand(P1, CARD, "su")
      .build();
    await game.p1.hide("su", "bf1");
    expect(game.zoneOf("su")).toBe("facedown-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([]);
    const enemyBf = await scenario().resources(P1, { power: { rainbow: 1 } }).battlefield("bf1", { controller: P2 }).hand(P1, CARD, "su").build();
    expect(enemyBf.p1.can("hide", "su")).toBe(false);
  });

  test("from facedown on a later turn: played for 0 energy, buff target restricted to a friendly unit at that battlefield (811.2)", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "here")
      .unit(P1, "bf2", { might: 2 }, "there")
      .hand(P1, CARD, "su")
      .build();
    await game.p1.hide("su", "bf1");
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.energy()).toBe(0);
    await game.p1.reveal("su");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "su", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.state("here").isBuffed).toBe(true);
    expect(game.state("there").isBuffed).toBe(false);
    expect(game.zoneOf("su")).toBe("trash");
  });
});
