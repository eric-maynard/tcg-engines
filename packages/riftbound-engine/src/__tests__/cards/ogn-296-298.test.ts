/**
 * Void Gate — ogn-296-298 · Battlefield
 *
 *   Spells and abilities deal 1 Bonus Damage to units here. (Each instance of damage the spell
 *   deals to a unit here is increased by 1.)
 *
 * Rules: 712–715 (Bonus Damage is a property of a DEAL action; 715.1 single target +N; 715.2 each
 * target of a multi-target deal +N separately; 714 several sources sum; 715.4.a — the example IS Void
 * Gate: Hextech Ray deals 4 here), 417.6.c.1 (combat damage is dealt by units, not by a spell or
 * ability → never increased), 364 (a passive of a battlefield applies no matter who controls it or
 * whose spell it is — "units here" is every unit at this battlefield, either side's).
 *
 * Head-judge corner cases for THIS card:
 *  1. Symmetric and controller-agnostic: P2's spell into P1's unit here, P1's spell into its OWN unit
 *     here, and an UNCONTROLLED Void Gate all get +1.
 *  2. Location is read per damaged unit: same spell, target at another battlefield / in a base → +0.
 *  3. Exactly-lethal arithmetic: Incinerate (2) kills a 3-Might unit here, but leaves a 3-Might unit
 *     elsewhere alive on 2 damage.
 *  4. Multi-instance: Falling Star (3 + 3, independent targets) → each instance aimed here is +1;
 *     Firestorm (3 to ALL enemy units at a battlefield) → every unit here takes 4.
 *  5. Abilities too, not just spells: Iron Ballista's activated "Deal 2" → 3 here; Crackshot Corsair's
 *     attack trigger "deal 1" → 2 here — while the COMBAT damage of an attack here is not increased.
 *  6. Stacking (714): Ravenborn Tome's "+1 to your next spell" + Void Gate → Hextech Ray deals 5 here.
 *
 * Engine status: the parser emits `{type:"static", effect:{type:"bonus-damage", source:"spells-and-
 * abilities", target:{location:"here"}}}` but no static handler reads it — every "+1" below is a BUG
 * test (expected printed+1, actual printed), the negative-space tests pass today.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ogn-296-298";
const HEXTECH_RAY = "ogn-009-298"; // [Action] 1 + [fury]: Deal 3 to a unit at a battlefield.
const INCINERATE = "ogs-003-024"; // [Action] 2: Deal 2 to a unit at a battlefield.
const FALLING_STAR = "ogn-029-298"; // 2 + [fury][fury]: Deal 3 to a unit. Deal 3 to a unit.
const FIRESTORM = "ogs-002-024"; // 6 + [fury]: Deal 3 to all enemy units at a battlefield.
const RAVENBORN_TOME = "ogn-032-298"; // gear, [Exhaust]: next spell you play this turn deals 1 Bonus Damage.
const IRON_BALLISTA = "ogn-017-298"; // gear, [Exhaust]: Deal 2 to a unit at a battlefield.
const CORSAIR = "ogn-130-298"; // 3-Might unit: When I attack, deal 1 to an enemy unit here.

/** bf1 = live Void Gate (P2 controls it and owns the card); bf2 = inert plain battlefield. 8-Might units so damage is readable. */
function board(withAlly = true) {
  const b = scenario()
    .resources(P1, { energy: 10, power: { fury: 3 } })
    .resources(P2, { energy: 10, power: { fury: 3 } })
    .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 8, name: "Gate Giant" }, "gateFoe")
    .unit(P2, "bf1", { might: 8, name: "Gate Twin" }, "gateFoe2")
    .unit(P2, "bf2", { might: 8, name: "Field Giant" }, "fieldFoe")
    .unit(P2, "base", { might: 8, name: "Home Giant" }, "homeFoe");
  return withAlly ? b.unit(P1, "bf1", { might: 8, name: "Gate Ally" }, "gateAlly") : b;
}

describe("Void Gate (ogn-296-298)", () => {
  test("baseline / negative space: Hextech Ray costs 1 + [fury] and deals its printed 3 to a unit at ANOTHER battlefield; spell → trash", async () => {
    const game = await board().hand(P1, HEXTECH_RAY, "ray").build();
    await game.p1.cast("ray", { targets: "fieldFoe" });
    expect(game.p1.resources()).toEqual({ energy: 9, power: { fury: 2 } });
    await game.settle();
    expect(game.state("fieldFoe").damage).toBe(3);
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // BUG — expected (715.4.a names this exact pair): 3 + 1 = 4 damage on a unit at Void Gate. Actual: 3.
  test("Hextech Ray (Deal 3) into an enemy unit HERE should deal 4 (715.1 / 715.4.a)", async () => {
    const game = await board().hand(P1, HEXTECH_RAY, "ray").build();
    await game.p1.cast("ray", { targets: "gateFoe" });
    await game.settle();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.state("gateFoe").damage).toBe(4);
  });

  // BUG — expected: the passive is symmetric — my own unit here takes 3+1 from my Falling Star while the
  // second instance into a unit in a base stays 3; and P2's Ray into my unit here is 4. Actual: 3 / 3 / 3.
  test("symmetric — my spell into my OWN unit here, and the opponent's spell into my unit here, are both +1", async () => {
    const own = await board().hand(P1, FALLING_STAR, "star").build();
    await own.p1.cast("star", { targets: ["gateAlly", "homeFoe"] });
    await own.settle();
    expect(own.state("homeFoe").damage).toBe(3); // a unit in a base is not "here"
    expect(own.state("gateAlly").damage).toBe(4);
    const theirs = await board().active(P2).hand(P2, HEXTECH_RAY, "ray").build();
    await theirs.p2.cast("ray", { targets: "gateAlly" });
    await theirs.settle();
    expect(theirs.state("gateAlly").damage).toBe(4);
  });

  // BUG — expected: a passive ability needs no controller; Incinerate (2) into a unit at an uncontrolled
  // Void Gate deals 3. Actual: 2.
  test("an UNCONTROLLED Void Gate still grants +1 (Incinerate deals 3 here)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: null, def: CARD, inert: false, owner: P2 })
      .unit(P2, "bf1", { might: 8, name: "Squatter" }, "squatter")
      .hand(P1, INCINERATE, "inc")
      .build();
    await game.p1.cast("inc", { targets: "squatter" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("squatter").damage).toBe(3);
  });

  // BUG — expected: 2 + 1 = 3 ≥ 3 Might → the unit here dies; the same 3-Might unit at bf2 lives on 2.
  // Actual: both survive on 2.
  test("exactly lethal — Incinerate (2) kills a 3-Might unit HERE but not a 3-Might unit at bf2", async () => {
    const b = () =>
      scenario()
        .resources(P1, { energy: 2 })
        .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P2 })
        .battlefield("bf2", { controller: P2 })
        .unit(P2, "bf1", { might: 3, name: "Gate Grunt" }, "gateGrunt")
        .unit(P2, "bf2", { might: 3, name: "Field Grunt" }, "fieldGrunt")
        .hand(P1, INCINERATE, "inc");
    const there = await b().build();
    await there.p1.cast("inc", { targets: "fieldGrunt" });
    await there.settle();
    expect(there.state("fieldGrunt")).toMatchObject({ damage: 2, zone: "battlefield-bf2" });
    const here = await b().build();
    await here.p1.cast("inc", { targets: "gateGrunt" });
    await here.settle();
    expect(here.zoneOf("gateGrunt")).toBe("trash");
    // rule 190.4.c / 323.6: the spell kill is no conquer for P1, but P2 has no Units left at bf1
    // and the turn is in an Open State, so P2 loses control of it in the following cleanup.
    expect(here.gameState.battlefields.bf1?.controller).toBeNull();
  });

  // BUG — expected (715.2): each damage instance is increased separately → 4 and 4; cost 2 + [fury][fury]. Actual: 3 and 3.
  test("Falling Star's two instances (3 + 3) into two units here deal 4 apiece (715.2)", async () => {
    const game = await board().hand(P1, FALLING_STAR, "star").build();
    await game.p1.cast("star", { targets: ["gateFoe", "gateFoe2"] });
    expect(game.p1.resources()).toEqual({ energy: 8, power: { fury: 1 } });
    await game.settle();
    expect(game.state("gateFoe").damage).toBe(4);
    expect(game.state("gateFoe2").damage).toBe(4);
  });

  // BUG — expected (715.2): every enemy unit at Void Gate takes 3+1; my unit here and units elsewhere take 0. Actual: 3 each.
  test("Firestorm (3 to ALL enemy units at a battlefield) aimed at Void Gate deals 4 to each enemy unit here", async () => {
    const game = await board().hand(P1, FIRESTORM, "storm").build();
    await game.p1.cast("storm", { targets: "bf1" });
    await game.settle();
    expect(game.state("gateAlly").damage).toBe(0);
    expect(game.state("fieldFoe").damage).toBe(0);
    expect(game.state("gateFoe").damage).toBe(4);
    expect(game.state("gateFoe2").damage).toBe(4);
  });

  // BUG — expected: "and abilities" — an ACTIVATED gear ability dealing 2 deals 3 to a unit here (and 2 at bf2).
  // Actual: 2 in both places.
  test("abilities count too — Iron Ballista's activated 'Deal 2' deals 3 to a unit here (2 at bf2)", async () => {
    const there = await board().gear(P1, IRON_BALLISTA, "ballista").build();
    await there.p1.activate("ballista", undefined, { answers: ["fieldFoe"] });
    await there.settle();
    if (there.decision()?.kind === "pick") {
      await there.p1.pick("fieldFoe");
      await there.settle();
    }
    expect(there.state("ballista").isExhausted).toBe(true);
    expect(there.state("fieldFoe").damage).toBe(2);
    const here = await board().gear(P1, IRON_BALLISTA, "ballista").build();
    await here.p1.activate("ballista", undefined, { answers: ["gateFoe"] });
    await here.settle();
    if (here.decision()?.kind === "pick") {
      await here.p1.pick("gateFoe");
      await here.settle();
    }
    expect(here.state("gateFoe").damage).toBe(3);
  });

  // BUG — expected: a TRIGGERED unit ability ("When I attack, deal 1 to an enemy unit here") resolving in the
  // combat chain at Void Gate deals 1+1 = 2, readable while the showdown is still open. Actual: 1.
  test("Crackshot Corsair attacking INTO Void Gate — its 'deal 1' attack trigger deals 2 to the defender", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P2 })
      .unit(P2, "bf1", { might: 8, name: "Gate Giant" }, "gateFoe")
      .unit(P1, "base", CORSAIR, "corsair")
      .build();
    await game.p1.move("corsair", "bf1");
    // Resolve just the attack trigger: answer/pass while a chain item exists, stop at the Focus window.
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "pick") {
        await game.seat(d.seat).pick("gateFoe");
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.state("corsair").combatRole).toBe("attacker");
    expect(game.state("gateFoe").damage).toBe(2);
  });

  test("negative space — combat damage is never increased: a vanilla 3-Might attacker into a 4-Might defender here deals exactly 3 (defender lives) and dies to exactly 4", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P2 })
      .unit(P2, "bf1", { might: 4, name: "Gate Guard" }, "guard")
      .unit(P1, "base", { might: 3, name: "Grunt" }, "grunt")
      .build();
    await game.p1.move("grunt", "bf1");
    expect(game.chain()).toEqual([]); // a passive puts nothing on the chain
    await game.settle();
    expect(game.zoneOf("grunt")).toBe("trash"); // took 4 ≥ 3
    expect(game.zoneOf("guard")).toBe("battlefield-bf1"); // took 3 < 4 (a bonus would have made it lethal)
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  // BUG — expected (714): Tome +1 and Void Gate +1 sum → the next Ray deals 5 here; the Ray after that (Tome
  // spent) deals 4 here. Actual: 4 then 3 (only the Tome is applied).
  test("714 stacking — Ravenborn Tome + Void Gate → Hextech Ray deals 5 here, the following Ray 4", async () => {
    const game = await board(false).gear(P1, RAVENBORN_TOME, "tome").hand(P1, HEXTECH_RAY, "ray1").hand(P1, HEXTECH_RAY, "ray2").build();
    await game.p1.activate("tome");
    await game.settle();
    expect(game.state("tome").isExhausted).toBe(true);
    await game.p1.cast("ray1", { targets: "gateFoe" });
    await game.settle();
    await game.p1.cast("ray2", { targets: "gateFoe2" });
    await game.settle();
    expect(game.state("gateFoe").damage).toBe(5);
    expect(game.state("gateFoe2").damage).toBe(4);
  });

  test("Ravenborn Tome alone (control for the stacking test): the boosted Ray deals 4 to a unit at bf2, the next Ray 3", async () => {
    const game = await board(false).gear(P1, RAVENBORN_TOME, "tome").hand(P1, HEXTECH_RAY, "ray1").hand(P1, HEXTECH_RAY, "ray2").build();
    await game.p1.activate("tome");
    await game.settle();
    await game.p1.cast("ray1", { targets: "fieldFoe" });
    await game.settle();
    expect(game.state("fieldFoe").damage).toBe(4);
    await game.p1.cast("ray2", { targets: "fieldFoe" });
    await game.settle();
    expect(game.state("fieldFoe").damage).toBe(7);
  });

  test("registry payload: a single static 'bonus-damage' ability — amount 1, source spells-and-abilities, scoped to units HERE", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Void Gate" });
    expect(def?.abilities).toEqual([
      {
        effect: { amount: 1, source: "spells-and-abilities", target: { location: "here", type: "unit" }, type: "bonus-damage" },
        type: "static",
      },
    ]);
  });
});
