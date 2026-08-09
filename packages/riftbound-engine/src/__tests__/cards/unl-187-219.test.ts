/**
 * Piltover Enforcer — unl-187-219 · Legend (Vi) · Fury/Order
 *
 *   When you conquer, if you assigned 3 or more excess damage, you may exhaust me to ready a unit.
 *
 * Rules: 383 triggered ability with an intervening "if" (383.2.a — checked when it would trigger:
 * fewer than 3 excess → it never goes on the chain); 465.2.c the ATTACKER assigns its damage among
 * the defenders — "excess" is what was assigned beyond their lethal thresholds, summed; a conquer of
 * an EMPTY battlefield involved no assignment at all (0 excess); 467 conquering scores 1; 204.3.b
 * "you may exhaust me to …" is a cost inside the instruction — if the legend is already exhausted
 * the cost cannot be paid and nothing is readied; "a unit" = any unit, either side, anywhere.
 *
 * Head-judge corner cases covered here:
 *   1. Threshold: 5 into a 2 (exactly 3 excess) triggers; 4 into a 2 (2 excess) does not; 5 into
 *      1 + 1 sums to 3 excess and triggers; walking onto an empty battlefield never does.
 *   2. The payoff loop: ready the conqueror itself — a Ganking bruiser then swings into a second
 *      battlefield the same turn; the SECOND conquer finds the legend exhausted → no second ready.
 *   3. Legend already exhausted before the first conquer → the "may exhaust me" cost is unpayable.
 *   4. "You may": declining leaves the legend ready and every unit as it was.
 *   5. Only YOUR conquers; holding is not conquering; the legend readies at your next Awaken.
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-187-219";

/** P1 (legend) with a `might`-Might Bruiser in base, an exhausted Sleepy in base; P2 holds bf1 with the given defenders and has an exhausted unit at home. */
function board(might: number, defenders: number[] = [2], opts: { ganking?: boolean; legendExhausted?: boolean } = {}) {
  const b = scenario()
    .card("vi", { def: CARD, meta: opts.legendExhausted ? { exhausted: true } : undefined, owner: P1, zone: "legendZone" })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { keywords: opts.ganking ? ["Ganking"] : [], might, name: "Bruiser" }, "bruiser")
    .unit(P1, "base", { might: 2, name: "Sleepy" }, "sleepy", { exhausted: true })
    .unit(P2, "base", { might: 2, name: "Napper" }, "napper", { exhausted: true })
    .unit(P2, "bf2", { might: 2, name: "Far Guard" }, "far");
  defenders.forEach((m, i) => b.unit(P2, "bf1", { might: m, name: `Def${i}` }, `def${i}`));
  return b;
}

describe("Piltover Enforcer (unl-187-219)", () => {
  test("5 into a 2-Might defender = exactly 3 excess: after the conquer point a triggered item asks yes/no, then which unit — readying the exhausted conqueror and exhausting the legend", async () => {
    const game = await board(5).build();
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("def0")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    expect(game.state("bruiser").isExhausted).toBe(true);
    await game.p1.yes();
    await game.settle();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1 });
    // "a unit": friendly or enemy, base or battlefield.
    expect(d.options.map((o) => o.card)).toEqual(expect.arrayContaining(["bruiser", "sleepy", "napper"]));
    await game.p1.pick("bruiser");
    await game.settle();
    expect(game.state("bruiser").isReady).toBe(true);
    expect(game.state("vi").isExhausted).toBe(true);
    expect(game.state("sleepy").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("4 into a 2 = only 2 excess: no trigger at all — just the conquer point, legend still ready", async () => {
    const game = await board(4).build();
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("def0")).toBe("trash");
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("vi").isReady).toBe(true);
    expect(game.state("bruiser").isExhausted).toBe(true);
  });

  test("excess is summed across defenders: 5 split over two 1-Might defenders leaves 3 excess → the offer appears", async () => {
    const game = await board(5, [1, 1]).build();
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("def0")).toBe("trash");
    expect(game.zoneOf("def1")).toBe("trash");
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  });

  test("conquering an EMPTY enemy battlefield assigns no damage (0 excess): a point, no offer", async () => {
    const game = await board(9, []).build();
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("vi").isReady).toBe(true);
  });

  test("'you may' — declining leaves the legend ready and readies nothing", async () => {
    const game = await board(5).build();
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    await game.p1.no();
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("vi").isReady).toBe(true);
    expect(game.state("bruiser").isExhausted).toBe(true);
    expect(game.state("sleepy").isExhausted).toBe(true);
    expect(game.p1.points()).toBe(1);
  });

  test("the readied unit may be one that never fought: pick the exhausted Sleepy in base instead of the conqueror", async () => {
    const game = await board(6).build();
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    await game.p1.yes();
    await game.settle();
    await game.p1.pick("sleepy");
    await game.settle();
    expect(game.state("sleepy").isReady).toBe(true);
    expect(game.state("bruiser").isExhausted).toBe(true);
    expect(game.state("vi").isExhausted).toBe(true);
  });

  test("the payoff loop with a Ganking bruiser: conquer bf1 (3 excess) → ready it → gank into bf2 and conquer again for a second point", async () => {
    const game = await board(5, [2], { ganking: true }).build();
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    await game.p1.yes();
    await game.settle();
    await game.p1.pick("bruiser");
    await game.settle();
    expect(game.state("bruiser")).toMatchObject({ damage: 0, isReady: true });
    await game.p1.gank("bruiser", "bf2");
    await game.settle();
    expect(game.zoneOf("far")).toBe("trash");
    expect(game.locationOf("bruiser")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
  });

  test("on that SECOND conquer the legend is already exhausted, so 'exhaust me' cannot be paid and no unit may be readied (204.3.b)", async () => {
    // Expected: no usable offer (absent, or canAccept:false, or accepting readies nothing). Actual:
    // the parsed effect is a plain sequence [exhaust self, ready a unit], so saying yes and picking
    // the bruiser readies it again with the legend already spent.
    const game = await board(5, [2], { ganking: true }).build();
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    await game.p1.yes();
    await game.settle();
    await game.p1.pick("bruiser");
    await game.settle();
    expect(game.state("vi").isExhausted).toBe(true);
    await game.p1.gank("bruiser", "bf2");
    await game.settle();
    expect(game.p1.points()).toBe(2);
    if (game.decision()?.kind === "yes-no" && (game.decision() as { canAccept?: boolean }).canAccept !== false) {
      await game.p1.yes();
      await game.settle();
      if (game.decision()?.kind === "pick") {
        await game.p1.pick("bruiser");
        await game.settle();
      }
    }
    expect(game.state("bruiser").isExhausted).toBe(true);
    expect(game.state("sleepy").isExhausted).toBe(true);
    expect(game.state("napper").isExhausted).toBe(true);
  });

  test("legend exhausted BEFORE the conquer — the optional cost is unpayable, so no unit may be readied (204.3.b)", async () => {
    // Expected: the offer is absent or cannot be accepted; every exhausted unit stays exhausted.
    // Actual: yes → pick bruiser → bruiser readied although the legend could not be exhausted.
    const game = await board(5, [2], { legendExhausted: true }).build();
    expect(game.state("vi").isExhausted).toBe(true);
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    if (game.decision()?.kind === "yes-no" && (game.decision() as { canAccept?: boolean }).canAccept !== false) {
      await game.p1.yes();
      await game.settle();
      if (game.decision()?.kind === "pick") {
        await game.p1.pick("bruiser");
        await game.settle();
      }
    }
    expect(game.state("bruiser").isExhausted).toBe(true);
    expect(game.state("sleepy").isExhausted).toBe(true);
    expect(game.state("napper").isExhausted).toBe(true);
  });

  test("only when YOU conquer: the opponent smashing your defender with 3+ excess gets no offer from your legend, and neither do you", async () => {
    const game = await scenario()
      .active(P2)
      .legend(P1, CARD, "vi")
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 6, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.state("vi").isReady).toBe(true);
  });

  test("holding is not conquering: scoring bf1 at the start of your turn puts nothing on the chain; and an exhausted legend readies at your Awaken", async () => {
    const game = await scenario()
      .active(P2)
      .card("vi", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 5, name: "Holder" }, "holder")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1); // hold
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("vi").isReady).toBe(true);
  });

  test("registry payload: optional conquer trigger on the controller, condition excess-damage-assigned ≥ 3, effect = exhaust self then ready a unit", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Vi", name: "Piltover Enforcer" });
    expect(def?.domain).toEqual(["fury", "order"]);
    expect(def?.abilities).toEqual([
      {
        condition: { amount: 3, type: "excess-damage-assigned" },
        effect: { effects: [{ target: "self", type: "exhaust" }, { target: { type: "unit" }, type: "ready" }], type: "sequence" },
        optional: true,
        trigger: { event: "conquer", on: "controller" },
        type: "triggered",
      },
    ]);
  });
});
