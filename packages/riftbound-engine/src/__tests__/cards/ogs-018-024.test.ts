/**
 * Tibbers — ogs-018-024 · Unit · Fury/Chaos · 8 energy + [rainbow][rainbow] · 7 Might
 *
 *   When you play me, deal 3 to all units at battlefields.
 *
 * "All units at battlefields" is not a choice (355.5.a) — every unit at any battlefield,
 * friendly or enemy, is dealt 3; units in a base are not at a battlefield.
 * Engine note: a [rainbow] pip is paid from `power.rainbow`.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogs-018-024";

function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 5, name: "BigFoe" }, "bigFoe")
    .unit(P2, "bf1", { might: 3, name: "SmallFoe" }, "smallFoe")
    .unit(P1, "bf2", { might: 4, name: "Ally" }, "ally")
    .unit(P2, "base", { might: 2, name: "HomeFoe" }, "homeFoe")
    .unit(P1, "base", { might: 2, name: "HomeAlly" }, "homeAlly")
    .hand(P1, CARD, "tibbers");
}

describe("Tibbers (ogs-018-024)", () => {
  test("costs 8 energy + 2 rainbow; enters the base as a 7-Might unit", async () => {
    const game = await scenario().resources(P1, { energy: 8, power: { rainbow: 2 } }).hand(P1, CARD, "tibbers").build();
    await game.p1.play("tibbers");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    expect(game.zoneOf("tibbers")).toBe("base");
    expect(game.state("tibbers").might).toBe(7);
  });

  test("not playable with 7 energy, or with only one rainbow power", async () => {
    const low = await scenario().resources(P1, { energy: 7, power: { rainbow: 2 } }).hand(P1, CARD, "tibbers").build();
    expect(low.p1.can("play", "tibbers")).toBe(false);
    const onePip = await scenario().resources(P1, { energy: 8, power: { rainbow: 1 } }).hand(P1, CARD, "tibbers").build();
    expect(onePip.p1.can("play", "tibbers")).toBe(false);
  });

  test("When you play me: the trigger goes on the chain", async () => {
    const game = await board().build();
    await game.p1.play("tibbers", { to: "base" });
    expect(game.chain()).toEqual(
      expect.arrayContaining([expect.objectContaining({ cardId: "tibbers", controller: P1, triggered: true })]),
    );
  });

  test.failing("BUG: 'all units at battlefields' is not a choice (355.5.a) — the trigger resolves without any target prompt", async () => {
    // Expected: both players pass → the trigger resolves on its own, back to P1's open main phase.
    // Actual: on resolution the engine asks P1 to "Choose a target for Tibbers" (pick 1 unit).
    const game = await board().build();
    await game.p1.play("tibbers", { to: "base" });
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.chain()).toHaveLength(0);
  });

  test.failing("BUG: deals 3 to EVERY unit at every battlefield (enemy and friendly); units in bases take nothing", async () => {
    // Expected: bigFoe 3 dmg, smallFoe (3) dies, friendly ally at bf2 3 dmg; base units and Tibbers untouched.
    // Actual: the effect is turned into a single-target pick and no unit is damaged after settling.
    const game = await board().build();
    await game.p1.play("tibbers", { to: "base" });
    await game.settle();
    expect(game.state("bigFoe").damage).toBe(3);
    expect(game.zoneOf("smallFoe")).toBe("trash"); // 3 ≥ 3
    expect(game.state("ally").damage).toBe(3); // friendly units at battlefields too
    expect(game.zoneOf("ally")).toBe("battlefield-bf2");
    expect(game.state("homeFoe").damage).toBe(0);
    expect(game.state("homeAlly").damage).toBe(0);
    expect(game.state("tibbers").damage).toBe(0);
    expect(game.zoneOf("tibbers")).toBe("base");
  });
});
