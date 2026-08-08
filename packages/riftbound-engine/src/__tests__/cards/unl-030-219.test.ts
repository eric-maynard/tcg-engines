/**
 * Vi, Hotheaded — unl-030-219 · Champion Unit (Vi) · Fury · 4 energy · 3 might
 *
 *   [Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *   [2][fury]: Double my Might this turn.
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. Doubling (432.1/432.1.a) adds the CURRENT Might at resolution as a flat +N for the turn: a
 *     buffed Vi (4) becomes 8, and a second activation doubles again (3 → 6 → 12), it is not
 *     "×2 of printed".
 *  2. The ability is an activated ability on the chain (381 / 145.2): the opponent gets priority
 *     and may respond. A Reaction that changes Vi's Might BEFORE the double resolves changes the
 *     amount doubled (Discipline +2 in response → 5 → 10) — and that enemy Discipline must pay the
 *     Deflect tax to choose Vi at all.
 *  3. Deflect (809.1.c) taxes only OPPONENTS' choices, by 1 power of ANY domain; with no power to
 *     spare the enemy spell simply cannot choose Vi. Vi's own controller targets her for free.
 *  4. Timing (145.2 / 381): Main Phase, Open State, her controller's turn only — not during a
 *     showdown, not on the opponent's turn, not with a chain open.
 *  5. Cost edge: exactly [2]+[fury] drains to zero and is legal; [2] with only calm power, or
 *     [1]+[fury], is not. No [Exhaust] in the cost → usable while exhausted and more than once.
 *  6. "this turn" — the bonus survives into the opponent's turn? No: it ends at THIS turn's
 *     Ending Step (517.2), so after advanceTurn() Vi is 3 again; damage never lowers Might.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-030-219";
const DISCIPLINE = "ogn-058-298"; // Reaction · 2 · Give a unit +2 Might this turn. Draw 1.
const HEXTECH_RAY = "ogn-009-298"; // Action · 1 + [fury] · Deal 3 to a unit at a battlefield.
const DOUBLE = 1; // ability index: #0 is the Deflect keyword, #1 the activated double

function viInBase(extra: { energy?: number; power?: Record<string, number> } = { energy: 2, power: { fury: 1 } }) {
  return scenario().resources(P1, extra).battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "vi");
}

describe("Vi, Hotheaded (unl-030-219)", () => {
  test("play cost: 4 energy, no power; a 3-Might Deflect champion that enters the base exhausted; 3 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "vi").build();
    await game.p1.play("vi");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("vi")).toBe("base");
    expect(game.state("vi")).toMatchObject({ baseMight: 3, isExhausted: true, might: 3 });
    expect(game.state("vi").keywords).toContain("Deflect");
    const short = await scenario().resources(P1, { energy: 3, power: { fury: 2 } }).hand(P1, CARD, "vi").build();
    expect(short.p1.can("play", "vi")).toBe(false);
  });

  test("[2][fury]: pays exactly 2 energy + 1 fury, goes on the chain as Vi's (non-triggered) ability, resolves to 3 → 6", async () => {
    const game = await viInBase().build();
    await game.p1.activate("vi", DOUBLE);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", controller: P1, triggered: false })]);
    expect(game.state("vi").might).toBe(3); // nothing happens before it resolves
    await game.settle();
    expect(game.chain()).toHaveLength(0);
    expect(game.state("vi").might).toBe(6);
    expect(game.state("vi").isExhausted).toBe(false); // no [Exhaust] in the cost
  });

  test("cost negative space: [2] with only non-fury power, or [1]+[fury], cannot activate; the fury pip is not payable with 'rainbow'-less calm", async () => {
    const calmOnly = await viInBase({ energy: 2, power: { calm: 1 } }).build();
    expect(calmOnly.p1.can("activate", "vi")).toBe(false);
    const oneEnergy = await viInBase({ energy: 1, power: { fury: 1 } }).build();
    expect(oneEnergy.p1.can("activate", "vi")).toBe(false);
    const nothing = await viInBase({ energy: 0 }).build();
    expect(nothing.p1.can("activate", "vi")).toBe(false);
  });

  test("doubling uses CURRENT Might (432.1): a buffed Vi (4) becomes 8; activating twice goes 3 → 6 → 12; works while exhausted", async () => {
    const b = await scenario().resources(P1, { energy: 2, power: { fury: 1 } }).unit(P1, "base", CARD, "vi", { buffed: true, exhausted: true }).build();
    expect(b.state("vi")).toMatchObject({ isBuffed: true, isExhausted: true, might: 4 });
    await b.p1.activate("vi", DOUBLE);
    await b.settle();
    expect(b.state("vi").might).toBe(8);

    const twice = await viInBase({ energy: 4, power: { fury: 2 } }).build();
    await twice.p1.activate("vi", DOUBLE);
    await twice.settle();
    expect(twice.state("vi").might).toBe(6);
    await twice.p1.activate("vi", DOUBLE);
    await twice.settle();
    expect(twice.state("vi").might).toBe(12);
    expect(twice.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("'this turn': the bonus is gone after the turn ends (back to 3 on the opponent's turn); damage never lowers Might", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "vi", { damage: 2 })
      .build();
    expect(game.state("vi")).toMatchObject({ damage: 2, might: 3 });
    await game.p1.activate("vi", DOUBLE);
    await game.settle();
    expect(game.state("vi").might).toBe(6);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("vi").might).toBe(3);
    expect(game.state("vi").damage).toBe(0); // damage cleared at end of turn too
  });

  test("the opponent gets priority with the double on the chain; an enemy Discipline in response (paying the Deflect power) makes Vi 5 first, so the double lands on 5 → 10", async () => {
    const game = await viInBase()
      .resources(P2, { energy: 2, power: { mind: 1 } })
      .hand(P2, DISCIPLINE, "disc")
      .build();
    await game.p1.activate("vi", DOUBLE);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("disc", { targets: "vi" });
    // Deflect: 2 energy for Discipline + 1 power of ANY domain (809.1.c.1) for choosing Vi.
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["vi", "disc"]);
    await game.settle(); // LIFO: Discipline (+2 → 5) resolves first, then the double (+5 → 10)
    expect(game.state("vi").might).toBe(10);
    await game.advanceTurn();
    expect(game.state("vi").might).toBe(3);
  });

  test("Deflect: an enemy Hextech Ray cannot choose Vi without a spare power; with one it pays it (any domain) on top of [1][fury] and deals 3", async () => {
    const broke = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "vi")
      .unit(P1, "bf1", { might: 5, name: "Plain" }, "plain")
      .hand(P2, HEXTECH_RAY, "ray")
      .build();
    const r = await broke.p2.try((p) => p.cast("ray", { targets: "vi" }));
    expect(r.ok).toBe(false);
    expect(broke.zoneOf("ray")).toBe("hand");
    await broke.p2.cast("ray", { targets: "plain" }); // the vanilla neighbour is fine at base cost
    expect(broke.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });

    const rich = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1, calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "vi")
      .hand(P2, HEXTECH_RAY, "ray")
      .build();
    await rich.p2.cast("ray", { targets: "vi" });
    expect(rich.p2.energy()).toBe(0);
    expect(rich.p2.power()).toBe(0); // both the fury pip and the off-domain Deflect power are gone
    await rich.settle();
    expect(rich.zoneOf("vi")).toBe("trash"); // 3 damage into 3 Might
  });

  test("Deflect taxes opponents only: Vi's controller Disciplines her for exactly 2 energy (3 → 5), then doubles to 10", async () => {
    const game = await viInBase({ energy: 4, power: { fury: 1 } }).hand(P1, DISCIPLINE, "disc").build();
    await game.p1.cast("disc", { targets: "vi" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } });
    await game.settle();
    expect(game.state("vi").might).toBe(5);
    await game.p1.activate("vi", DOUBLE);
    await game.settle();
    expect(game.state("vi").might).toBe(10);
  });

  test("timing (145.2 / 381): not on the opponent's turn, not during a showdown, not while a chain is open", async () => {
    const oppTurn = await viInBase().active(P2).build();
    expect(oppTurn.p1.can("activate", "vi")).toBe(false);

    const showdown = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "base", CARD, "vi")
      .unit(P1, "base", { might: 1, name: "Scout" }, "scout")
      .build();
    await showdown.p1.move("scout", "bf1");
    expect((showdown.decision() as ActionDecision).context).toBe("showdown");
    expect(showdown.p1.can("activate", "vi")).toBe(false);

    const chainOpen = await viInBase({ energy: 4, power: { fury: 2 } }).build();
    await chainOpen.p1.activate("vi", DOUBLE);
    expect((chainOpen.decision() as ActionDecision).context).toBe("chain");
    expect(chainOpen.p1.can("activate", "vi")).toBe(false); // Closed State: no second activation in response
  });

  test("a doubled Vi fights at the doubled value: 6 Might kills a 5-Might defender she could not beat at 3 and conquers", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard")
      .unit(P1, "base", CARD, "vi")
      .build();
    await game.p1.activate("vi", DOUBLE);
    await game.settle();
    await game.p1.move("vi", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("vi")).toBe("bf1");
    expect(game.state("vi").damage).toBe(0); // survived 5 < 6; healed at Combat Cleanup (143.3.b.2)
    expect(game.state("vi").might).toBe(6); // the turn-long bonus outlives the combat
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("registry payload matches the printed text: Deflect 1 keyword + one activated [2][fury] self double-might (turn)", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 4, isChampion: true, might: 3, name: "Vi, Hotheaded", tags: ["Vi"] });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      { keyword: "Deflect", type: "keyword", value: 1 },
      { cost: { energy: 2, power: ["fury"] }, effect: { duration: "turn", target: "self", type: "double-might" }, type: "activated" },
    ]);
  });
});
