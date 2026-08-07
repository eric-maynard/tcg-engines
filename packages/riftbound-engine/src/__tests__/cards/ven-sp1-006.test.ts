/**
 * Kai'Sa, Survivor — ven-sp1-006 · Champion Unit (Kai'Sa) · Fury · 4 energy · 4 Might
 *
 *   [Accelerate]
 *   When I conquer, draw 1.
 *
 * (Promo reprint of ogn-039-298; printed WITHOUT the Accelerate reminder text.)
 *
 * Head-judge notes — the tricky situations for this card:
 *   1. Accelerate (805): optional additional cost [1][fury] paid AS she is played; she enters ready
 *      via a replacement (805.6) — never "enters exhausted then readies". Without the fury power the
 *      accelerated line is simply not legal; the plain 4-energy play still is.
 *   2. "When I conquer" (383.4.c.2): only a conquer where SHE is among the conquering units counts —
 *      another friendly unit conquering elsewhere, or Kai'Sa merely HOLDING (469.2), draws nothing.
 *   3. Conquer through combat: she must survive the damage step and be the last side standing.
 *      Exactly-lethal the other way (a 4-Might defender) trades both units → nobody conquers → no draw.
 *   4. Final Point (471.1.b): on 7/8 with two battlefields, conquering just one gives a CARD instead
 *      of the point — and her conquer trigger still fires (383.4.c.2.c) → two cards, still 7 points.
 *   5. Accelerate + attack the same turn: the whole point of paying the extra — she is ready, walks
 *      into an open enemy battlefield and draws immediately.
 *   6. Registry: the parser must still emit the Accelerate keyword (cost 1 + fury) even though this
 *      printing has no reminder text.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-sp1-006";

describe("Kai'Sa, Survivor (ven-sp1-006)", () => {
  // Expected: [{keyword Accelerate, cost {1, [fury]}}, {triggered conquer/self → draw 1}] exactly like
  // ogn-039-298. Actual: the bare "[Accelerate]" line (no reminder text) is dropped by the parser.
  test("registry payload should carry the Accelerate keyword (805) alongside the conquer trigger", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 4, isChampion: true, might: 4, name: "Kai'Sa, Survivor" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      { cost: { energy: 1, power: ["fury"] }, keyword: "Accelerate", type: "keyword" },
      { effect: { amount: 1, type: "draw" }, trigger: { event: "conquer", on: "self" }, type: "triggered" },
    ]);
  });

  test("the conquer trigger itself is parsed: triggered · conquer · self → draw 1", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def?.abilities).toContainEqual({ effect: { amount: 1, type: "draw" }, trigger: { event: "conquer", on: "self" }, type: "triggered" });
  });

  test("costs exactly 4 energy (no power); a 4-Might champion unit that enters the base EXHAUSTED (143.4); 3 energy → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "kaisa").build();
    await game.p1.play("kaisa", { to: "base" });
    await game.settle();
    expect(game.zoneOf("kaisa")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("kaisa")).toMatchObject({ baseMight: 4, isExhausted: true, might: 4 });
    const poor = await scenario().resources(P1, { energy: 3, power: { fury: 2 } }).hand(P1, CARD, "kaisa").build();
    expect(poor.p1.can("play", "kaisa")).toBe(false);
  });

  // Expected (805.1.a): paying [1][fury] on top of the 4 makes her enter READY, pool drained to 0/0.
  // Actual: no Accelerate ability on the ven printing, so the accelerated play is not offered.
  test("Accelerate — 5 energy + 1 fury total and she enters ready (805.1.a / 805.6)", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { fury: 1 } }).hand(P1, CARD, "kaisa").build();
    await game.p1.play("kaisa", { accelerate: true, to: "base" });
    await game.settle();
    expect(game.zoneOf("kaisa")).toBe("base");
    expect(game.state("kaisa").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("Accelerate negative space: with 5 energy but no fury power the accelerated line is illegal and nothing is spent", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "kaisa").build();
    const r = await game.p1.try((p) => p.play("kaisa", { accelerate: true, to: "base" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("kaisa")).toBe("hand");
    expect(game.p1.energy()).toBe(5);
  });

  test("When I conquer, draw 1: walking into an open enemy-held battlefield → control flips, 1 point, exactly +1 card; trigger is hers", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "kaisa").build();
    const hand0 = game.p1.hand().length;
    const deck0 = game.p1.deck().length;
    await game.p1.move("kaisa", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
    expect(game.p2.hand()).toHaveLength(0); // the opponent draws nothing
    expect(game.violations()).toEqual([]);
  });

  test("conquering THROUGH combat draws too: she kills a 3-Might defender, survives (one short of lethal; healed in combat cleanup 466.1.a.1), takes bf1", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
      .unit(P1, "base", CARD, "kaisa")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("kaisa", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("kaisa")).toBe("bf1");
    expect(game.state("kaisa").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  test("exactly-lethal trade (4 into 4): both die, nobody conquers (bf1 becomes uncontrolled, 466.5.b), no point and NO draw", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Wall" }, "wall")
      .unit(P1, "base", CARD, "kaisa")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("kaisa", "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("kaisa")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  test("'When I conquer' is personal (383.4.c.2): another friendly unit conquering while Kai'Sa sits in base scores but draws nothing", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "kaisa")
      .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("runner", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  test("holding is not conquering (469.2): Kai'Sa parked on bf1 at the start of her turn scores a hold point but only draws the draw-phase card", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "kaisa").build();
    const hand0 = game.p1.hand().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0 + 1); // rule 515.4 draw only
  });

  test("Final Point (471.1.b): on 7/8 with two battlefields, conquering only bf1 gives a card INSTEAD of the point — and her trigger still draws (383.4.c.2.c) → +2 cards, still 7", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 9, name: "Anchor" }, "anchor")
      .unit(P1, "base", CARD, "kaisa")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("kaisa", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.isOver()).toBe(false);
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
  });

  // Expected: pay 5 + fury, she is READY, immediately moves to the open enemy battlefield, conquers and
  // draws. Actual: blocked at step one — the accelerated play is not offered (see the Accelerate BUG).
  test("Accelerate then attack the same turn — ready on arrival, walk into an open bf1, conquer, draw 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .hand(P1, CARD, "kaisa")
      .build();
    await game.p1.play("kaisa", { accelerate: true, to: "base" });
    await game.settle();
    const hand0 = game.p1.hand().length;
    expect(game.p1.can("move")).toBe(true);
    await game.p1.move("kaisa", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });
});
