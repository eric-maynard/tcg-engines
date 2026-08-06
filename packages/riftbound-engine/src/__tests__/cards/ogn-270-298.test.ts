/**
 * Showstopper — ogn-270-298 · Spell · Body/Order · 1 energy + [rainbow] (hybrid body/order pip)
 *
 *   Buff a friendly unit in your base, then move it to a battlefield.
 *   (If it doesn't have a buff, it gets a +1 [Might] buff.)
 *
 * Rules: 702–703 (buff = +1 Might marker, max one), 450 / 190.3.a (a unit moved to a
 * battlefield its controller doesn't control contests it → showdown/combat follows).
 * Engine note: a hybrid pip is modelled as `rainbow` and paid from `power.rainbow`.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-270-298";

function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "base", { might: 2, name: "Star" }, "star")
    .unit(P1, "bf2", { might: 2, name: "Fielded" }, "fielded")
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
    .hand(P1, CARD, "show");
}

describe("Showstopper (ogn-270-298)", () => {
  test("costs 1 energy + 1 (hybrid) power; buffs the chosen friendly base unit; goes to trash", async () => {
    const game = await board().build();
    await game.p1.cast("show", { targets: "star" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("bf2");
      await game.settle();
    }
    expect(game.state("star").isBuffed).toBe(true);
    expect(game.state("star").might).toBe(3);
    expect(game.zoneOf("show")).toBe("trash");
  });

  test("not castable without the power pip or without 1 energy", async () => {
    const noPower = await scenario().resources(P1, { energy: 5 }).unit(P1, "base", { might: 2 }, "star").battlefield("bf1").hand(P1, CARD, "show").build();
    expect(noPower.p1.can("cast", "show")).toBe(false);
    const noEnergy = await scenario().resources(P1, { energy: 0, power: { rainbow: 1 } }).unit(P1, "base", { might: 2 }, "star").battlefield("bf1").hand(P1, CARD, "show").build();
    expect(noEnergy.p1.can("cast", "show")).toBe(false);
  });

  test.failing("BUG: targets only a FRIENDLY unit IN YOUR BASE — units at battlefields and enemy units are not offered", async () => {
    // Expected: only "star" is a legal target. Actual: the parsed target is `friendly unit`
    // (no base restriction), so the friendly unit at bf2 is offered as well.
    const game = await board().build();
    const targets = game.p1.option("cast", "show")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual([["star"]]);
    const t = await game.p1.try((p) => p.cast("show", { targets: "fielded" }));
    expect(t.ok).toBe(false);
  });

  test("enemy units are never legal targets", async () => {
    const game = await board().build();
    const t = await game.p1.try((p) => p.cast("show", { targets: "foe" }));
    expect(t.ok).toBe(false);
    expect(game.zoneOf("show")).toBe("hand");
  });

  test.failing("BUG: 'then move it to a battlefield' — after the buff the unit is moved to a battlefield of your choice", async () => {
    // Expected: after resolving, P1 picks a battlefield (bf2 here) and "star" ends up there, buffed.
    // Actual: only the buff clause was parsed; the unit stays in base and no destination is asked.
    const game = await board().build();
    await game.p1.cast("show", { targets: "star" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("bf2");
      await game.settle();
    }
    expect(game.state("star").isBuffed).toBe(true);
    expect(game.locationOf("star")).toBe("bf2");
  });

  test.failing("BUG: moving it into an enemy-held battlefield contests it — combat follows and the buffed 3-Might unit beats a 2-Might defender", async () => {
    // Expected: star (2+1) is moved to bf1, combat opens, the 2-Might defender dies, P1 conquers bf1.
    // Actual: no move happens at all (see above), so nothing is contested.
    const game = await scenario()
      .resources(P1, { energy: 1, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "star")
      .unit(P2, "bf1", { might: 2 }, "def")
      .hand(P1, CARD, "show")
      .build();
    await game.p1.cast("show", { targets: "star" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("bf1");
      await game.settle();
    }
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.locationOf("star")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
