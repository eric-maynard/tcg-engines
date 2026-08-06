/**
 * Portal Rescue — ogn-102-298 · Spell · Mind · 3 energy + [mind]
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Banish a friendly unit, then its owner plays it to their base, ignoring its cost.
 *
 * Rule 356.1.b.1 — "ignoring its cost": energy and power cost are 0 for that play.
 * The re-played card is a new object: damage, buffs and "this turn" modifiers are gone, and a
 * played unit enters exhausted as usual.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-102-298";
const PRICEY = { energyCost: 7, might: 4, name: "Pricey Recruit", powerCost: ["mind", "mind"] };

function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", PRICEY, "ally", { buffed: true, damage: 2 })
    .unit(P2, "base", { might: 2 }, "foe")
    .hand(P1, CARD, "rescue");
}

describe("Portal Rescue (ogn-102-298)", () => {
  test("costs 3 energy + 1 mind; unaffordable without the mind power", async () => {
    const game = await board().build();
    await game.p1.cast("rescue", { targets: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    const short = await board().resources(P1, { energy: 3, power: { mind: 0 } }).build();
    expect(short.p1.can("cast", "rescue")).toBe(false);
  });

  test("only friendly units are legal choices", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "rescue")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual([["ally"]]);
    const r = await game.p1.try((p) => p.cast("rescue", { targets: "foe" }));
    expect(r.ok).toBe(false);
  });

  test("the unit leaves the battlefield and ends up in its owner's base under their control, paid for with nothing extra", async () => {
    const game = await board().build();
    await game.p1.cast("rescue", { targets: "ally" });
    await game.settle({ policy: "first" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally").owner).toBe(P1);
    expect(game.state("ally").controller).toBe(P1);
    // Ignoring its cost: nothing beyond the spell's own 3+[mind] was spent (the unit costs 7 + 2 mind).
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("rescue")).toBe("trash");
    expect(game.p1.units("bf1")).toEqual([]);
  });

  test("banish-then-play makes it a freshly played unit — no damage, no buff, and it enters exhausted", async () => {
    const game = await board().build();
    await game.p1.cast("rescue", { targets: "ally" });
    await game.settle({ policy: "first" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally").damage).toBe(0);
    expect(game.state("ally").isBuffed).toBe(false);
    expect(game.state("ally").might).toBe(4);
    expect(game.state("ally").isExhausted).toBe(true);
  });

  test("[Action]: castable during a showdown; not castable on the opponent's turn in Neutral Open", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9 }, "wall")
      .unit(P1, "base", { might: 1 }, "scout")
      .hand(P1, CARD, "rescue")
      .build();
    await game.p1.move("scout", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "rescue")).toBe(true);
    // Rescue the attacker out of a losing fight: it ends up safe (and fresh) in base.
    await game.p1.cast("rescue", { targets: "scout" });
    await game.settle({ policy: "first" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("scout")).toBe("base");
    expect(game.locationOf("wall")).toBe("bf1");

    const theirs = await board().active(P2).build();
    expect(theirs.p1.can("cast", "rescue")).toBe(false);
  });
});
