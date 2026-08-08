/**
 * Mister Root — unl-127-219 · Unit · Chaos · 2 energy (no power) · 1 Might
 *
 *   [Accelerate] (You may pay [1][chaos] as an additional cost to have me enter ready.)
 *   When I move to a battlefield, gain 2 XP.
 *
 * Head-judge notes (the tricky spots this file covers):
 *   1. Accelerate (805): optional additional cost [1] + one CHAOS power (805.1.a.1 — a fury power can't
 *      pay it); paid → enters ready, unpaid → enters exhausted (143.4). Total 3 energy + 1 chaos.
 *   2. The natural line: Accelerate, then Standard Move the same turn → the move trigger gives 2 XP.
 *   3. Only a move whose destination is a battlefield counts: base→bf yes, bf→base no, being PLAYED
 *      directly to a battlefield is not a move (446.2), an ally's move is not "I move".
 *   4. Not optional and not targeted: the trigger resolves off the chain and XP goes to the controller;
 *      moving into a losing combat still banks the XP before he dies.
 *   5. XP is a persistent player resource (728) — it survives the turn ending and stacks (2 → 4).
 *   6. Moved by a spell (Ride the Wind, same Chaos domain) instead of the Standard Move still triggers.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-127-219";
const RIDE_THE_WIND = "ogn-173-298"; // Chaos [Action] 2 + [chaos]: Move a friendly unit and ready it.

function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", CARD, "root")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "bf2", { might: 5, name: "Wall" }, "wall");
}

describe("Mister Root (unl-127-219)", () => {
  test("registry payload: Accelerate keyword costing {1 energy, [chaos]} + a self move-to-battlefield trigger of gain-xp 2", async () => {
    await scenario().build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 2, might: 1, name: "Mister Root" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      { cost: { energy: 1, power: ["chaos"] }, keyword: "Accelerate", type: "keyword" },
      { effect: { amount: 2, type: "gain-xp" }, trigger: { event: "move-to-battlefield", on: "self" }, type: "triggered" },
    ]);
  });

  test("cost: 2 energy, no power → a 1-Might unit that enters the base EXHAUSTED without Accelerate; no XP for being played; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "root").build();
    await game.p1.play("root");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("root")).toBe("base");
    expect(game.state("root")).toMatchObject({ isExhausted: true, might: 1 });
    expect(game.state("root").keywords).toContain("Accelerate");
    expect(game.p1.xp()).toBe(0);
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "root").build();
    expect(poor.p1.can("play", "root")).toBe(false);
  });

  test("Accelerate: 3 energy + 1 chaos in total and he enters READY", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).hand(P1, CARD, "root").build();
    await game.p1.play("root", { accelerate: true });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("root")).toBe("base");
    expect(game.state("root").isReady).toBe(true);
  });

  test("Accelerate's power must be CHAOS (805.1.a.1): with 3 energy + a fury power only the plain (exhausted) play is possible", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, CARD, "root").build();
    expect(game.p1.can("play", "root")).toBe(true);
    const r = await game.p1.try((p) => p.play("root", { accelerate: true }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("root")).toBe("hand");
    // and 2 energy + chaos (can't pay the extra [1]) also refuses the accelerated variant
    const short = await scenario().resources(P1, { energy: 2, power: { chaos: 1 } }).hand(P1, CARD, "root").build();
    const r2 = await short.p1.try((p) => p.play("root", { accelerate: true }));
    expect(r2.ok).toBe(false);
  });

  test("the tempo line: Accelerate in, then Standard Move to a battlefield the same turn → trigger on the chain → 2 XP", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .battlefield("bf1", { controller: null })
      .hand(P1, CARD, "root")
      .build();
    await game.p1.play("root", { accelerate: true });
    await game.settle();
    expect(game.p1.xp()).toBe(0);
    await game.p1.move("root", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "root", controller: P1, triggered: true })]);
    expect(game.p1.xp()).toBe(0); // not yet — it is a triggered ability on the chain
    await game.settle();
    expect(game.p1.xp()).toBe(2);
    expect(game.p2.xp()).toBe(0);
    expect(game.locationOf("root")).toBe("bf1");
    expect(game.state("root").isExhausted).toBe(true); // the Standard Move exhausts
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("moving from a battlefield back to base gains nothing", async () => {
    const game = await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "root").build();
    await game.p1.move("root", "base");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.locationOf("root")).toBe("base");
    expect(game.p1.xp()).toBe(0);
  });

  test("being PLAYED straight to a battlefield you control is not a move: no trigger, no XP", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "holder")
      .hand(P1, CARD, "root")
      .build();
    await game.p1.play("root", { to: "bf1" });
    await game.settle();
    expect(game.locationOf("root")).toBe("bf1");
    expect(game.chain()).toEqual([]);
    expect(game.p1.xp()).toBe(0);
  });

  test("another friendly unit's move does not trigger him", async () => {
    const game = await board().build();
    await game.p1.move("ally", "bf1");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.p1.xp()).toBe(0);
  });

  test("moving into a losing combat still banks the 2 XP before he dies (the trigger resolves before combat damage)", async () => {
    const game = await board().build();
    await game.p1.move("root", "bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "root", triggered: true })]);
    await game.settle();
    expect(game.zoneOf("root")).toBe("trash");
    expect(game.locationOf("wall")).toBe("bf2");
    expect(game.p1.xp()).toBe(2);
    expect(game.p1.points()).toBe(0);
  });

  test("XP persists across turns and stacks: move (2), come home next turn, move again the turn after (4)", async () => {
    const game = await board().build();
    await game.p1.move("root", "bf1");
    await game.settle();
    expect(game.p1.xp()).toBe(2);
    await game.advanceTurn(); // → P2
    expect(game.p1.xp()).toBe(2);
    await game.advanceTurn(); // → P1 (root readied)
    expect(game.state("root").isReady).toBe(true);
    await game.p1.move("root", "base");
    await game.settle();
    expect(game.p1.xp()).toBe(2);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1
    await game.p1.move("root", "bf1");
    await game.settle();
    expect(game.p1.xp()).toBe(4);
  });

  test("moved by a spell (Ride the Wind) rather than the Standard Move — still 'moves to a battlefield': +2 XP and he is ready there", async () => {
    const game = await board().resources(P1, { energy: 2, power: { chaos: 1 } }).hand(P1, RIDE_THE_WIND, "rtw").build();
    await game.p1.cast("rtw", { targets: "root" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.locationOf("root")).toBe("bf1");
    expect(game.state("root").isReady).toBe(true);
    expect(game.p1.xp()).toBe(2);
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
