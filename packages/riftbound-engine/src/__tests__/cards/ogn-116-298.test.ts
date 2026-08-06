/**
 * Thousand-Tailed Watcher — ogn-116-298 · Unit · Mind · 7 energy + 1 [mind] · 7 might
 *
 *   [Accelerate] (You may pay [1][mind] as an additional cost to have me enter ready.)
 *   When you play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might].
 *
 * Rules: 143.4 / 805 (enter exhausted / Accelerate), 383.4.b (play effect).
 * "enemy units" (plural, no "a"/"an") = every enemy unit, everywhere — no target choice.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-116-298";

describe("Thousand-Tailed Watcher (ogn-116-298)", () => {
  test("costs 7 energy + 1 mind power; enters exhausted; play trigger goes on the chain", async () => {
    const game = await scenario().resources(P1, { energy: 7, power: { mind: 1 } }).hand(P1, CARD, "ttw").build();
    await game.p1.play("ttw", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("ttw")).toBe("base");
    expect(game.state("ttw").isExhausted).toBe(true);
    expect(game.state("ttw").might).toBe(7);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ttw", triggered: true })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
  });

  test("unaffordable without the mind power or with 6 energy", async () => {
    const noPower = await scenario().resources(P1, { energy: 8 }).hand(P1, CARD, "ttw").build();
    expect(noPower.p1.can("play", "ttw")).toBe(false);
    const low = await scenario().resources(P1, { energy: 6, power: { mind: 2 } }).hand(P1, CARD, "ttw").build();
    expect(low.p1.can("play", "ttw")).toBe(false);
  });

  test("Accelerate: 8 energy + 2 mind in total and it enters ready", async () => {
    const game = await scenario().resources(P1, { energy: 8, power: { mind: 2 } }).hand(P1, CARD, "ttw").build();
    await game.p1.play("ttw", { accelerate: true, to: "base" });
    await game.settle();
    expect(game.state("ttw").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    // With only 7 energy (+2 mind) the accelerated variant is not offered.
    const short = await scenario().resources(P1, { energy: 7, power: { mind: 2 } }).hand(P1, CARD, "ttw").build();
    const r = await short.p1.try((p) => p.play("ttw", { accelerate: true, to: "base" }));
    expect(r.ok).toBe(false);
  });

  test.failing("BUG: Accelerate needs a SECOND [mind] on top of the base [mind] pip — with 8 energy + 1 mind the accelerated play is not legal", async () => {
    // Expected: total cost 8 energy + 2 mind is unaffordable with 1 mind, so the accelerate variant is
    // not in the legal menu. Actual: it is offered (power of the additional cost is checked in isolation);
    // executing it silently plays the unit un-accelerated.
    const game = await scenario().resources(P1, { energy: 8, power: { mind: 1 } }).hand(P1, CARD, "ttw").build();
    const r = await game.p1.try((p) => p.play("ttw", { accelerate: true, to: "base" }));
    expect(r.ok).toBe(false);
  });

  test("-3 Might to a minimum of 1, this turn only: a lone 2-might enemy drops to 1 and is back to 2 next turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { mind: 1 } })
      .unit(P2, "base", { might: 2 }, "two")
      .hand(P1, CARD, "ttw")
      .build();
    await game.p1.play("ttw", { to: "base" });
    await game.settle();
    expect(game.zoneOf("two")).toBe("base"); // not killed
    expect(game.state("two").might).toBe(1);
    await game.advanceTurn();
    expect(game.state("two").might).toBe(2);
  });

  test.failing("BUG: 'enemy units' — ALL enemy units everywhere get -3 (min 1) with no target prompt; friendly units untouched", async () => {
    // Expected: five→2, seven→4, two→1, ally stays 5, and no choice is asked.
    // Actual: the trigger asks P1 to pick ONE enemy unit and only debuffs that one.
    const game = await scenario()
      .resources(P1, { energy: 7, power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5 }, "five")
      .unit(P2, "base", { might: 7 }, "seven")
      .unit(P2, "base", { might: 2 }, "two")
      .unit(P1, "base", { might: 5 }, "ally")
      .hand(P1, CARD, "ttw")
      .build();
    await game.p1.play("ttw", { to: "base" });
    const stop = await game.settle();
    expect(stop.reason).not.toBe("unanswered");
    expect(game.state("five").might).toBe(2);
    expect(game.state("seven").might).toBe(4);
    expect(game.state("two").might).toBe(1);
    expect(game.state("ally").might).toBe(5);
    expect(game.state("ttw").might).toBe(7);
  });
});
