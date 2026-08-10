/**
 * Ruling e836bac99513a237 — Gardens of Becoming (UNL-213 → unl-213-219) · Battlefield
 *   'Units here have "[Exhaust]: Gain 1 XP."'
 *
 * Q: Can a unit that is already exhausted at Gardens of Becoming activate the granted ability?
 * A: No. The granted ability's cost is exhausting the unit; an already-exhausted unit cannot be exhausted,
 *    so the cost can't be paid and the ability can't be activated.
 * Rules: 414.4 (a cost action must be completable to be paid), 364/135.4.b (granted ability while here),
 *        730.1 (the activating unit's controller gains the XP).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const GARDENS = "unl-213-219";

function board(opts: { exhausted: boolean }) {
  return scenario()
    .battlefield("gardens", { controller: P1, def: GARDENS, inert: false })
    .unit(P1, "gardens", { might: 3, name: "Pilgrim" }, "pilgrim", opts.exhausted ? { exhausted: true } : undefined)
    .unit(P1, "base", { might: 2, name: "Homebody" }, "homebody");
}

describe("Ruling e836bac99513a237 — Gardens of Becoming's granted [Exhaust]: Gain 1 XP needs a READY unit", () => {
  test("a READY unit at the Gardens can activate it: the unit exhausts and its controller gains 1 XP", async () => {
    const game = await board({ exhausted: false }).build();
    expect(game.p1.can("activate", "pilgrim")).toBe(true);
    expect(game.p1.xp()).toBe(0);
    await game.p1.activate("pilgrim");
    expect(game.state("pilgrim").isExhausted).toBe(true); // cost paid up front
    await game.settle();
    expect(game.p1.xp()).toBe(1);
  });

  test("an already-EXHAUSTED unit at the Gardens cannot activate it — the [Exhaust] cost is unpayable (414.4): not on the menu, a forced attempt is rejected, no XP", async () => {
    const game = await board({ exhausted: true }).build();
    expect(game.state("pilgrim").isExhausted).toBe(true);
    expect(game.p1.can("activate", "pilgrim")).toBe(false);
    const r = await game.p1.try((p) => p.activate("pilgrim"));
    expect(r.ok).toBe(false);
    expect(game.p1.xp()).toBe(0);
    expect(game.chain()).toEqual([]);
  });

  test("once used, the now-exhausted unit cannot activate it a second time the same turn", async () => {
    const game = await board({ exhausted: false }).build();
    await game.p1.activate("pilgrim");
    await game.settle();
    expect(game.p1.xp()).toBe(1);
    expect(game.p1.can("activate", "pilgrim")).toBe(false);
  });

  test("the grant is 'units HERE' only: a unit in base has no such ability", async () => {
    const game = await board({ exhausted: false }).build();
    expect(game.p1.can("activate", "homebody")).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
