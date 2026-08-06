/**
 * Commander Ledros — ogn-231-298 · Unit · Order · 6 energy + 4 [order] · 8 Might
 *
 *   As you play me, you may kill any number of friendly units as an additional
 *   cost. Reduce my cost by [order] for each killed this way.
 *   [Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *   [Ganking] (I can move from battlefield to battlefield.)
 *
 * Rules: 356.2.b (optional additional costs, "you may … as an additional cost"),
 * 356.4 (discounts, applied after additional costs are declared), 809 (Deflect: a
 * mandatory additional cost of 1 power of ANY domain for opponents' targeting),
 * 810 (Ganking adds battlefield→battlefield to the Standard Move).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-231-298";
const CLEAVE = "ogn-004-298"; // 1-energy spell: "Give a unit [Assault 3] this turn."

describe("Commander Ledros (ogn-231-298)", () => {
  test("costs 6 energy + 4 order and is an 8-Might unit with Deflect and Ganking; unaffordable with 3 order", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { order: 4 } }).hand(P1, CARD, "led").build();
    await game.p1.play("led");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("led")).toBe("base");
    expect(game.state("led").might).toBe(8);
    expect(game.state("led").keywords).toEqual(expect.arrayContaining(["Deflect", "Ganking"]));
    const short = await scenario().resources(P1, { energy: 6, power: { order: 3 } }).hand(P1, CARD, "led").build();
    expect(short.p1.can("play", "led")).toBe(false);
  });

  test("the additional cost is optional: paying full price kills nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { order: 4 } })
      .unit(P1, "base", { might: 1, name: "Recruit" }, "a")
      .hand(P1, CARD, "led")
      .build();
    await game.p1.play("led");
    await game.settle();
    expect(game.zoneOf("a")).toBe("base");
    expect(game.zoneOf("led")).toBe("base");
  });

  test("may kill a friendly unit as you play him to reduce the cost by [order] (6 + 3 order with one kill; rule 356.2.b/356.4)", async () => {
    // Expected: with 6 energy, 3 order and a friendly unit, Ledros is playable by killing that unit;
    // the unit goes to trash and the pool is emptied. Actual: the clause parsed to an inert
    // `additional-cost-option` static, so no sacrifice is offered and 4 order is always required.
    const game = await scenario()
      .resources(P1, { energy: 6, power: { order: 3 } })
      .unit(P1, "base", { might: 1, name: "Recruit" }, "a")
      .hand(P1, CARD, "led")
      .build();
    expect(game.p1.can("play", "led")).toBe(true);
    await game.p1.play("led", { payOptional: true, sacrifice: "a" });
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("led")).toBe("base");
  });

  test("'any number' — killing four friendly units reduces the power cost to 0 (6 energy, no order)", async () => {
    // Expected: four kills discount all four [order] pips; only the 6 energy is paid. Actual: not playable.
    const b = scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "led");
    for (const id of ["a", "b", "c", "d"]) {
      b.unit(P1, "base", { might: 1, name: `Recruit ${id}` }, id);
    }
    const game = await b.build();
    expect(game.p1.can("play", "led")).toBe(true);
  });

  test("Deflect: an opponent must pay 1 extra power (any domain) to target him with a spell (rule 809)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", CARD, "led")
      .unit(P2, "base", { might: 3 }, "theirs")
      .hand(P2, CLEAVE, "cleave")
      .build();
    const targets = () => game.p2.option("cast", "cleave")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets()).toEqual([["theirs"]]);
    await game.p2.do("addResources", { power: { fury: 1 } }); // any domain pays Deflect
    expect(targets()).toEqual(expect.arrayContaining([["led"], ["theirs"]]));
    await game.p2.cast("cleave", { targets: "led" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.state("led").keywords).toContain("Assault");
  });

  test("Deflect does not tax his controller's own spells", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", CARD, "led").hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "led" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("Ganking: may make a Standard Move from one battlefield to another (a vanilla unit may not)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", CARD, "led")
      .unit(P1, "bf1", { might: 2, name: "Plain" }, "plain")
      .build();
    expect(game.p1.can("gank", "led")).toBe(true);
    expect(game.p1.can("gank", "plain")).toBe(false);
    await game.p1.gank("led", "bf2");
    expect(game.locationOf("led")).toBe("bf2");
    expect(game.state("led").isExhausted).toBe(true);
  });
});
