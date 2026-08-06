/**
 * Riptide Rex — ogn-092-298 · Unit · Mind · 6 energy + 2 [mind] · 6 might
 *
 *   When you play me, deal 6 to an enemy unit at a battlefield.
 *
 * Rules: 383.4.b ("When you play me" play effect, resolves from the chain after
 * the unit has entered), targeting: enemy + at a battlefield (not in a base).
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-092-298";

function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7 }, "big")
    .unit(P2, "bf1", { might: 6 }, "six")
    .unit(P2, "base", { might: 2 }, "baseFoe")
    .unit(P1, "bf1", { might: 2 }, "bfAlly")
    .hand(P1, CARD, "rex");
}

describe("Riptide Rex (ogn-092-298)", () => {
  test("costs 6 energy + 2 mind power; enters the base and puts his play trigger on the chain", async () => {
    const game = await board().build();
    await game.p1.play("rex", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("rex")).toBe("base");
    expect(game.state("rex").might).toBe(6);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rex", controller: P1, triggered: true })]);
  });

  test("unaffordable with only 1 mind power or 5 energy", async () => {
    const onePower = await scenario().resources(P1, { energy: 6, power: { mind: 1 } }).hand(P1, CARD, "rex").build();
    expect(onePower.p1.can("play", "rex")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 5, power: { mind: 2 } }).hand(P1, CARD, "rex").build();
    expect(lowEnergy.p1.can("play", "rex")).toBe(false);
  });

  test("target menu = enemy units at a battlefield only (no base enemies, no friendly units); deals 6 → kills a 6-might unit", async () => {
    const game = await board().build();
    await game.p1.play("rex", { to: "base" });
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision() as PickDecision;
    expect(d.kind).toBe("pick");
    expect(d.seat).toBe(P1);
    expect(d.options.map((o) => o.key).sort()).toEqual(["big", "six"]);
    await game.p1.pick("six");
    await game.settle();
    expect(game.zoneOf("six")).toBe("trash");
    expect(game.state("big").damage).toBe(0);
    expect(game.state("baseFoe").damage).toBe(0);
  });

  test("6 damage on a 7-might unit leaves it alive with 6 damage", async () => {
    const game = await board().build();
    await game.p1.play("rex", { to: "base" });
    await game.settle();
    await game.p1.pick("big");
    await game.settle();
    expect(game.locationOf("big")).toBe("bf1");
    expect(game.state("big").damage).toBe(6);
  });

  test("no enemy unit at any battlefield: Rex still enters, nothing is damaged", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { mind: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "base", { might: 2 }, "baseFoe")
      .unit(P1, "bf1", { might: 2 }, "bfAlly")
      .hand(P1, CARD, "rex")
      .build();
    await game.p1.play("rex", { to: "base" });
    await game.settle();
    expect(game.zoneOf("rex")).toBe("base");
    expect(game.state("baseFoe").damage).toBe(0);
    expect(game.state("bfAlly").damage).toBe(0);
    expect(game.decision()?.kind).toBe("action");
  });
});
