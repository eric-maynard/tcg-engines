/**
 * Shipyard Skulker — ogn-175-298 · Unit · Chaos · 3 energy (no power) · 3 Might
 *
 *   (no rules text — a vanilla unit)
 *
 * Rules: 143.4 (units enter the board exhausted; nothing here replaces that — no [Accelerate]),
 * 359.2.c (a unit is played to your base or to a battlefield you CONTROL), 349/343.1 (a permanent is
 * played only in your Main Phase, Neutral Open State), 144.4 (Standard Move: a READY unit exhausts to
 * move), 465/466 (combat: simultaneous damage equal to Might; 143.2.a lethal = damage ≥ Might; 466.1.a.1
 * survivors are healed in the Combat Cleanup; 466.3.d both dying = No Result → 466.5.b uncontrolled),
 * 143.3.b.1 / 317.2 (marked damage heals at end of turn), 469.2 (Hold: control a battlefield through
 * your Beginning Phase → 1 point).
 *
 * Head-judge notes — what can still go wrong with a card that "does nothing":
 *  1. Cost is 3 ENERGY only: chaos power never substitutes for energy, but ready runes can be tapped in
 *     for it; 2 energy is one short.
 *  2. No printed [Accelerate] → the accelerate option must not exist even with [1][chaos] to spare, and
 *     it always enters exhausted, so it cannot move the turn it is played.
 *  3. Locations: base or a battlefield P1 controls — never an enemy-held or uncontrolled battlefield.
 *  4. Timing: not on the opponent's turn, not while a spell waits on the chain (Closed State).
 *  5. Combat knife-edges as a plain 3: 3 into 2 conquers unhurt (healed), 3 into 3 trades and the
 *     battlefield ends up controlled by NOBODY, 3 into 4 just dies.
 *  6. Non-lethal spell damage (2 < 3) sticks through the turn and is gone after the Ending Phase; exactly
 *     3 kills it.
 *  7. Registry payload: no abilities, no keywords — a silent parser addition would show up here.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ogn-175-298";
const BOLT2 = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt 2",
  rulesText: "[Action] Deal 2 to a unit.",
  timing: "action",
};
const BOLT3 = { ...BOLT2, abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], name: "Test Bolt 3", rulesText: "[Action] Deal 3 to a unit." };

function attack(defenderMight: number) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: defenderMight, name: "Guard" }, "guard")
    .unit(P1, "base", CARD, "ss");
}

describe("Shipyard Skulker (ogn-175-298)", () => {
  test("registry payload: a 3-cost Chaos unit with 3 Might, no power cost, no keywords and no abilities", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 3, might: 3, name: "Shipyard Skulker" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities ?? []).toEqual([]);
    expect(def?.keywords ?? []).toEqual([]);
    const game = await scenario().unit(P1, "base", CARD, "ss").build();
    expect(game.state("ss")).toMatchObject({ baseMight: 3, keywords: [], might: 3 });
    expect(game.p1.can("activate", "ss")).toBe(false);
  });

  test("cost: exactly 3 energy is deducted, nothing goes on the chain, and it enters the base EXHAUSTED (143.4) as a 3-Might unit", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { chaos: 1 } }).hand(P1, CARD, "ss").build();
    await game.p1.play("ss", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 1 } });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ss")).toBe("base");
    expect(game.state("ss")).toMatchObject({ isExhausted: true, might: 3 });
    // Exhausted → no Standard Move this turn.
    expect(game.p1.legal().some((o) => o.verb === "move")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("cost negative space: 2 energy is one short and chaos power cannot make up the difference; two ready runes + 1 energy CAN (357.1.a)", async () => {
    const short = await scenario().resources(P1, { energy: 2, power: { chaos: 3 } }).hand(P1, CARD, "ss").build();
    expect(short.p1.can("play", "ss")).toBe(false);
    expect((await short.p1.try((p) => p.play("ss"))).ok).toBe(false);
    expect(short.zoneOf("ss")).toBe("hand");

    const runes = await scenario().resources(P1, { energy: 1 }).runes(P1, "chaos", 2).hand(P1, CARD, "ss").build();
    await runes.p1.tapRunes(2);
    expect(runes.p1.energy()).toBe(3);
    await runes.p1.play("ss");
    await runes.settle();
    expect(runes.zoneOf("ss")).toBe("base");
    expect(runes.p1.energy()).toBe(0);
  });

  test("no [Accelerate]: even with [1][chaos] to spare no accelerate/payOptional variant is offered and asking for it is illegal", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { chaos: 1 } }).hand(P1, CARD, "ss").build();
    expect(game.p1.option("play", "ss")?.fields.some((f) => f.arg === "payOptional" || f.arg === "accelerate")).toBe(false);
    const r = await game.p1.try((p) => p.play("ss", { accelerate: true, to: "base" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("ss")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { chaos: 1 } });
  });

  test("locations (359.2.c): base or a battlefield P1 controls; an enemy-held or uncontrolled battlefield is rejected", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("mine", { controller: P1 })
      .battlefield("theirs", { controller: P2 })
      .battlefield("open", { controller: null })
      .hand(P1, CARD, "ss")
      .build();
    const to = [...(game.p1.option("play", "ss")?.fields.find((f) => f.arg === "to")?.options ?? [])].sort();
    expect(to).toEqual(["base", "battlefield-mine"]);
    expect((await game.p1.try((p) => p.play("ss", { to: "theirs" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.play("ss", { to: "open" }))).ok).toBe(false);
    await game.p1.play("ss", { to: "mine" });
    await game.settle();
    expect(game.locationOf("ss")).toBe("mine");
    expect(game.state("ss").isExhausted).toBe(true);
  });

  test("timing: not playable on the opponent's turn, nor while a spell is waiting on the chain; playable again once it resolves", async () => {
    const opp = await scenario().active(P2).resources(P1, { energy: 3 }).hand(P1, CARD, "ss").build();
    expect(opp.p1.can("play", "ss")).toBe(false);

    const game = await scenario()
      .resources(P1, { energy: 4 })
      .unit(P2, "base", { might: 5, name: "Dummy" }, "dummy")
      .hand(P1, BOLT2, "bolt")
      .hand(P1, CARD, "ss")
      .build();
    await game.p1.cast("bolt", { targets: "dummy" });
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.can("play", "ss")).toBe(false);
    await game.settle();
    expect(game.p1.can("play", "ss")).toBe(true);
  });

  test("combat 3 into 2: the Guard dies, Skulker survives healed (466.1.a.1), conquers bf1 for 1 point and is exhausted from the move", async () => {
    const game = await attack(2).build();
    await game.p1.move("ss", "bf1");
    expect(game.state("ss")).toMatchObject({ combatRole: "attacker", might: 3 });
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("ss")).toBe("bf1");
    expect(game.state("ss")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("combat 3 into 3: both die (No Result, 466.3.d) — nobody scores and bf1 is left controlled by nobody (466.5.b)", async () => {
    const game = await attack(3).build();
    await game.p1.move("ss", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("ss")).toBe("trash");
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
  });

  test("combat 3 into 4: Skulker dies, the Guard keeps bf1 with no damage left on it", async () => {
    const game = await attack(4).build();
    await game.p1.move("ss", "bf1");
    await game.settle();
    expect(game.zoneOf("ss")).toBe("trash");
    expect(game.locationOf("guard")).toBe("bf1");
    expect(game.state("guard").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("defending as a plain 3: a 2-Might raider dies against it on P2's turn and P2 scores nothing", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ss")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("ss")).toMatchObject({ combatRole: "defender", might: 3 });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("ss")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("spell damage: 2 is not lethal and stays marked for the turn, then heals in the Ending Phase (143.3.b.1); exactly 3 kills it (143.2.a)", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", CARD, "ss").hand(P1, BOLT2, "bolt").build();
    await game.p1.cast("bolt", { targets: "ss" });
    await game.settle();
    expect(game.state("ss")).toMatchObject({ damage: 2, zone: "base" });
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("ss")).toMatchObject({ damage: 0, zone: "base" });

    const lethal = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", CARD, "ss").hand(P1, BOLT3, "bolt").build();
    await lethal.p1.cast("bolt", { targets: "ss" });
    await lethal.settle();
    expect(lethal.zoneOf("ss")).toBe("trash");
  });

  test("hold (469.2): parked on a battlefield P1 controls through P1's Beginning Phase → exactly 1 point, and Awaken readied it", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "ss", { exhausted: true }).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("ss")).toMatchObject({ isReady: true, location: "bf1" });
    // A ready unit at a battlefield may walk home.
    expect(game.p1.can("move")).toBe(true);
  });
});
