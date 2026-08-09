/**
 * Forbidding Waste — unl-210-219 · Battlefield · no domain · no cost
 *
 *   While a unit here is defending alone, it has -2 [Might]. (It's alone if there are no other
 *   friendly units here.)
 *
 * Rules: 740.2.a (alone = no OTHER FRIENDLY units at the same location — enemy attackers don't
 * count), 464.2.c.3 ("defending" = holding the Defender designation, which only exists inside a
 * combat), 364.3 (a "while" passive is continuous — it switches on the moment a second defender
 * leaves mid-showdown), 143.2.b (Might below 0 is treated as 0 for combat sums), 142.4.b (lethal =
 * NON-ZERO damage ≥ Might, so a 0-Might unit dies to 1), 465.2 (combat damage uses current Might,
 * dealt simultaneously), 190.6 (no "you" in the text: it bites whoever defends here).
 *
 * Head-judge notes — the tricky situations for THIS card:
 *  1. Only while DEFENDING: the same lone unit sitting on the Waste outside combat, or attacking
 *     from it, has full Might.
 *  2. Only the DEFENDER: a lone attacker is never penalised (exactly-lethal maths below depend on it).
 *  3. Only ALONE: two defenders → no penalty at all; bounce one mid-showdown (Fight or Flight) and
 *     the survivor immediately drops by 2.
 *  4. Floors: a lone 1-Might defender is "0" — it deals nothing and dies to a single point.
 *  5. Stacking with other statics: Wielder of Water (+2 alone) nets to printed; Shield +1 nets −1.
 *  6. Knife-edge results: 2 into a lone 3 (→1) conquers unhurt-ish; 1 into a lone 3 (→1) trades and
 *     nobody holds the Waste.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-210-219";
const FIGHT_OR_FLIGHT = "ogn-168-298"; // Spell · Chaos · 2 · [Action] Move a unit from a battlefield to its base.
const WIELDER_OF_WATER = "ogn-055-298"; // Unit · Calm · 2 Might · While I'm attacking or defending alone, I have +2 Might.
const LEONA = "ven-184-166"; // Unit · Order · 4 Might · [Shield] (+1 Might while I'm a defender) …

/** P2 controls the Waste with the given defenders; P1 has one attacker (and Fight or Flight money) in base. */
function waste(defenders: readonly (readonly [number, string])[], attackerMight: number) {
  let b = scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("fw", { controller: P2, def: CARD, inert: false, owner: P2 });
  for (const [might, alias] of defenders) {
    b = b.unit(P2, "fw", { might, name: alias.toUpperCase() }, alias);
  }
  return b.unit(P1, "base", { might: attackerMight, name: "Attacker" }, "atk");
}

describe("Forbidding Waste (unl-210-219)", () => {
  test("registry payload: one static — while a unit here is defending alone, units here get −2 Might", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Forbidding Waste" });
    expect(def?.abilities).toEqual([
      {
        condition: { location: "here", state: "defending-alone", type: "while-unit-state" },
        effect: { amount: -2, target: { location: "here", type: "unit" }, type: "modify-might" },
        type: "static",
      },
    ]);
  });

  test("only while DEFENDING — a lone unit merely standing on the Waste (no combat) keeps its full 3 Might; the engine applies −2 at all times", async () => {
    // Expected: might 3 outside combat. Actual: 1 (staticMightBonus −2 with no combat in progress).
    const game = await waste([[3, "d"]], 2).build();
    expect(game.state("d").combatRole).not.toBe("defender");
    expect(game.state("d")).toMatchObject({ might: 3, staticMightBonus: 0 });
  });

  test("lone 3-Might defender vs a 2-Might attacker — defender fights as 1, dies to the 2, attacker takes 1 and conquers; the engine also shrinks the ATTACKER to 0", async () => {
    // Expected: in the showdown d=1 / atk=2 → d dies, atk survives with 1 damage, P1 conquers and scores.
    // Actual: atk is also given −2 (0 Might), deals nothing and is killed by d's 1.
    const game = await waste([[3, "d"]], 2).build();
    await game.p1.move("atk", "fw");
    expect(game.state("d")).toMatchObject({ combatRole: "defender", might: 1 });
    expect(game.state("atk")).toMatchObject({ combatRole: "attacker", might: 2 });
    await game.settle();
    expect(game.zoneOf("d")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("battlefield-fw");
    expect(game.gameState.battlefields.fw?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("only the DEFENDER — a lone 3-Might attacker into a lone 3-Might defender stays 3 (defender drops to 1): defender dies, attacker lives with 1 damage", async () => {
    // Expected: atk 3 vs d 1 → d dies, atk takes 1, P1 conquers. Actual: both are 1 and trade.
    const game = await waste([[3, "d"]], 3).build();
    await game.p1.move("atk", "fw");
    expect(game.state("atk").might).toBe(3);
    expect(game.state("d").might).toBe(1);
    await game.settle();
    expect(game.zoneOf("d")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("battlefield-fw");
    expect(game.gameState.battlefields.fw?.controller).toBe(P1);
  });

  test("only ALONE (740.2.a) — two defenders (3 and 1) suffer no penalty: they fight as 3 and 1 against a 3-Might attacker", async () => {
    // Expected: d=3, e=1, atk=3 during the showdown; 4 combined kills the attacker. Actual: every unit here is at −2.
    const game = await waste(
      [
        [3, "d"],
        [1, "e"],
      ],
      3,
    ).build();
    await game.p1.move("atk", "fw");
    expect(game.state("d")).toMatchObject({ combatRole: "defender", might: 3 });
    expect(game.state("e")).toMatchObject({ combatRole: "defender", might: 1 });
    expect(game.state("atk").might).toBe(3);
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.gameState.battlefields.fw?.controller).toBe(P2);
  });

  test("continuous 'while' (364.3) — bouncing one of two defenders mid-showdown leaves the other alone: it drops 3 → 1 on the spot and the 2-Might attacker conquers", async () => {
    // d reads 3 while a friend shares the Waste and 1 the instant it is alone, so the 2-Might
    // attacker kills it and conquers.
    // rule 466.1.a.1: the Combat Special Cleanup inserts "Heal all Units", so a survivor can
    // never end a combat with damage marked — the 1 point the lone defender dealt is wiped
    // when the combat ends, exactly like the undamaged conqueror in the "floor" case below.
    const game = await waste(
      [
        [3, "d"],
        [1, "e"],
      ],
      2,
    )
      .hand(P1, FIGHT_OR_FLIGHT, "fof")
      .build();
    await game.p1.move("atk", "fw");
    expect(game.state("d").might).toBe(3);
    expect(game.p1.can("cast", "fof")).toBe(true); // [Action] with Focus in our own showdown
    await game.p1.cast("fof", { targets: "e" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("e")).toBe("base");
    expect(game.state("d").might).toBe(1);
    await game.settle();
    expect(game.zoneOf("d")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("battlefield-fw");
    expect(game.state("atk").damage).toBe(0); // rule 466.1.a.1: Combat Cleanup heals all units
    expect(game.gameState.battlefields.fw?.controller).toBe(P1);
  });

  test("floor (143.2.b, 142.4.b) — a lone 1-Might defender counts as 0: it deals nothing and dies to a 1-Might attacker, who conquers undamaged", async () => {
    // Expected: d dies, atk at fw with 0 damage, P1 controls fw. Actual: atk is also 0, nobody deals damage, atk is sent home.
    const game = await waste([[1, "d"]], 1).build();
    await game.p1.move("atk", "fw");
    expect(game.state("d").might).toBeLessThanOrEqual(0);
    expect(game.state("atk").might).toBe(1);
    await game.settle();
    expect(game.zoneOf("d")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("battlefield-fw");
    expect(game.state("atk").damage).toBe(0);
    expect(game.gameState.battlefields.fw?.controller).toBe(P1);
  });

  test("one short — a 1-Might attacker into a lone 3 (→1) trades: both die, nobody scores and P2 no longer controls the emptied Waste", async () => {
    // Expected: both in trash, P1 0 points, fw uncontrolled after cleanup (323.6). Actual: atk (−2 → 0) deals nothing; d survives.
    const game = await waste([[3, "d"]], 1).build();
    await game.p1.move("atk", "fw");
    await game.settle();
    expect(game.zoneOf("d")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.fw?.controller).not.toBe(P1);
    expect(game.p2.units("fw")).toEqual([]);
  });

  test("stacking — Wielder of Water defending alone is 2 (+2 alone, −2 Waste); a 2-Might attacker trades with it", async () => {
    // Expected: wow=2 in the showdown (and 2 at rest), atk=2 → both die. Actual: atk is 0 so only atk dies (and wow reads 0 at rest).
    const game = await scenario()
      .battlefield("fw", { controller: P2, def: CARD, inert: false, owner: P2 })
      .unit(P2, "fw", WIELDER_OF_WATER, "wow")
      .unit(P1, "base", { might: 2, name: "Attacker" }, "atk")
      .build();
    expect(game.state("wow").might).toBe(2);
    await game.p1.move("atk", "fw");
    expect(game.state("wow")).toMatchObject({ combatRole: "defender", might: 2 });
    expect(game.state("atk").might).toBe(2);
    await game.settle();
    expect(game.zoneOf("wow")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("trash");
  });

  test("stacking — a lone [Shield] Leona (4, +1 defending, −2 Waste) defends as 3 and trades with a 3-Might attacker", async () => {
    // Expected: leona=3 vs atk=3 → both die. Actual: atk is 1, dies alone.
    const game = await scenario()
      .battlefield("fw", { controller: P2, def: CARD, inert: false, owner: P2 })
      .unit(P2, "fw", LEONA, "leona")
      .unit(P1, "base", { might: 3, name: "Attacker" }, "atk")
      .build();
    await game.p1.move("atk", "fw");
    expect(game.state("leona")).toMatchObject({ combatRole: "defender", might: 3 });
    expect(game.state("atk").might).toBe(3);
    await game.settle();
    expect(game.zoneOf("leona")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("trash");
  });

  test("no 'you' (190.6) — it bites the Waste's OWN controller too: P1's lone 3-Might keeper defends as 1 on P2's turn and falls to a 2-Might raider", async () => {
    // Expected: keeper=1 vs raider=2 → keeper dies, raider conquers for P2. Actual: raider is 0 and dies.
    const game = await scenario()
      .active(P2)
      .battlefield("fw", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "fw", { might: 3, name: "Keeper" }, "keeper")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "fw");
    expect(game.state("keeper")).toMatchObject({ combatRole: "defender", might: 1 });
    expect(game.state("raider").might).toBe(2);
    await game.settle();
    expect(game.zoneOf("keeper")).toBe("trash");
    expect(game.gameState.battlefields.fw?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  test("negative space — 'here': a lone defender at a DIFFERENT battlefield is untouched (3 vs 2: the attacker dies, P2 keeps it)", async () => {
    const game = await scenario()
      .battlefield("fw", { controller: P2, def: CARD, inert: false, owner: P2 })
      .unit(P2, "fw", { might: 3 }, "far")
      .battlefield("plain", { controller: P2 })
      .unit(P2, "plain", { might: 3, name: "D" }, "d")
      .unit(P1, "base", { might: 2, name: "Attacker" }, "atk")
      .build();
    await game.p1.move("atk", "plain");
    expect(game.state("d")).toMatchObject({ combatRole: "defender", might: 3, staticMightBonus: 0 });
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("d")).toBe("battlefield-plain");
    expect(game.gameState.battlefields.plain?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("negative space — holding the Waste is unaffected by its text: P2's lone unit holds it at the start of P2's turn for 1 point", async () => {
    const game = await scenario()
      .turn(2)
      .active(P1)
      .battlefield("fw", { controller: P2, def: CARD, inert: false, owner: P2 })
      .unit(P2, "fw", { might: 3 }, "d")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.zoneOf("d")).toBe("battlefield-fw");
  });
});
