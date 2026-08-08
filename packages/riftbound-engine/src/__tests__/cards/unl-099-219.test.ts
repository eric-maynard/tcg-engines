/**
 * Towering Combatant — unl-099-219 · Unit · Body · 4 energy (no power) · 3 Might
 *
 *   [Shield 2] (+2 [Might] while I'm a defender.)
 *   [Tank] (I must be assigned combat damage first.)
 *
 * Head-judge notes — the tricky spots for this card:
 *   1. Shield 2 is defender-only (814.1.c) and it is real Might (432.1.a): 5 while it holds the Defender
 *      designation — it both TAKES 5 to kill and DEALS 5 back — plain 3 when attacking, in base, or against
 *      spell damage outside combat. Exactly-lethal edges: a 4-Might attacker is one short (4 < 5) and dies,
 *      a 5 trades, a 6 conquers; a 3-damage bolt kills it in the open but not mid-combat as a defender
 *      (healed at 466.1.a.1 before the designation drops at 466.7.a).
 *   2. Tank (815.1.b) is about ASSIGNMENT order among same-controller units in that combat, in either
 *      role (it also eats damage first while attacking, where Shield is off → lethal is 3), and does
 *      nothing for allies fighting somewhere it isn't.
 *   3. 815.1.c legality: with a real split available, non-Tank sinks are illegal until the Tank has lethal.
 *   4. 814.2 stacking with Block (ogn-057-298: Shield 3 + Tank this turn) → Shield 5 → 8 as a defender.
 *   5. Stunned defender (Back Off, unl-042-219): deals 0 (423.1.b) but still needs its FULL 5 to die (423.1.c).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-099-219";
const BLOCK = "ogn-057-298"; // [Action] Give a unit [Shield 3] and [Tank] this turn. (2)
const BACK_OFF = "unl-042-219"; // [Action] Stun a unit. (3)
const BOLT3 = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Bolt Three",
  timing: "action",
} as const;

/** P2 to act with a `raiderMight` Raider in base; P1 holds bf1 with Towering Combatant (+ whatever the caller adds). */
function siege(raiderMight: number) {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", CARD, "tc")
    .unit(P2, "base", { might: raiderMight, name: "Raider" }, "raider");
}

describe("Towering Combatant (unl-099-219)", () => {
  test("costs 4 energy; enters the base exhausted as a 3-Might Body unit with Shield and Tank; 3 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "tc").build();
    await game.p1.play("tc");
    await game.settle();
    expect(game.zoneOf("tc")).toBe("base");
    expect(game.state("tc")).toMatchObject({ baseMight: 3, isExhausted: true, might: 3 });
    expect(game.state("tc").keywords).toEqual(expect.arrayContaining(["Shield", "Tank"]));
    expect(game.state("tc").domains).toEqual(["body"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect((await scenario().resources(P1, { energy: 3, power: { body: 3 } }).hand(P1, CARD, "tc").build()).p1.can("play", "tc")).toBe(false);
  });

  test("[Shield 2] defending: it IS 5 Might for the combat (takes and deals as 5) — a 4-Might attacker is one short (4 < 5) and dies to the 5 back; afterwards a plain, undamaged 3 still holding bf1", async () => {
    const game = await siege(4).build();
    expect(game.state("tc").might).toBe(3); // not a defender yet
    await game.p2.move("raider", "bf1");
    expect(game.state("tc")).toMatchObject({ combatRole: "defender", might: 5 });
    await game.settle();
    expect(game.zoneOf("tc")).toBe("battlefield-bf1");
    expect(game.zoneOf("raider")).toBe("trash"); // took 5 ≥ 4
    expect(game.state("tc")).toMatchObject({ combatRole: null, damage: 0, might: 3 }); // healed (466.1.a.1), Shield off (466.7.a)
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
  });

  test("exactly lethal both ways: a 5-Might attacker kills it (5 ≥ 3+2) and dies to its 5 — bf1 is left empty and Uncontrolled (466.5.b), nobody scores; a 6-Might attacker survives (5 < 6) and conquers", async () => {
    const five = await siege(5).build();
    await five.p2.move("raider", "bf1");
    await five.settle();
    expect(five.zoneOf("tc")).toBe("trash");
    expect(five.zoneOf("raider")).toBe("trash");
    expect(five.gameState.battlefields.bf1?.controller).toBeNull();
    expect(five.p2.points()).toBe(0);

    const six = await siege(6).build();
    await six.p2.move("raider", "bf1");
    await six.settle();
    expect(six.zoneOf("tc")).toBe("trash");
    expect(six.locationOf("raider")).toBe("bf1");
    expect(six.state("raider").damage).toBe(0); // took 5, healed in the combat cleanup
    expect(six.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(six.p2.points()).toBe(1);
  });

  test("[Shield] is off while ATTACKING: into a 3-Might defender both die; into a 4-Might defender only the Combatant dies", async () => {
    const trade = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "tc").unit(P2, "bf1", { might: 3 }, "def").build();
    await trade.p1.move("tc", "bf1");
    expect(trade.state("tc")).toMatchObject({ combatRole: "attacker", might: 3 });
    await trade.settle();
    expect(trade.zoneOf("def")).toBe("trash");
    expect(trade.zoneOf("tc")).toBe("trash");

    const wall = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "tc").unit(P2, "bf1", { might: 4 }, "def").build();
    await wall.p1.move("tc", "bf1");
    await wall.settle();
    expect(wall.zoneOf("tc")).toBe("trash");
    expect(wall.zoneOf("def")).toBe("battlefield-bf1");
    expect(wall.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("[Tank] defending: a 3-Might raider into Pal (2) + Combatant must dump all 3 on the Combatant (5) — nobody dies on P1's side; without the Tank present Pal would die", async () => {
    const control = await scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 2, name: "Pal" }, "pal").unit(P1, "bf1", { might: 5, name: "Big" }, "big").unit(P2, "base", { might: 3, name: "Raider" }, "raider").build();
    await control.p2.move("raider", "bf1");
    await control.settle();
    expect(control.zoneOf("pal")).toBe("trash");

    const game = await siege(3).unit(P1, "bf1", { might: 2, name: "Pal" }, "pal").build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("pal")).toBe("battlefield-bf1");
    expect(game.zoneOf("tc")).toBe("battlefield-bf1");
    expect(game.zoneOf("raider")).toBe("trash"); // took 2 + 5
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("[Tank] assignment legality (815.1.c): a 6-Might raider into Pal + Pal2 + Combatant — {pal:1, pal2:1, tc:4} and {pal:2, pal2:4} refused; {tc:5, pal:1} legal → Combatant dies, both Pals hold", async () => {
    const game = await siege(6)
      .autoProcedures(false)
      .unit(P1, "bf1", { might: 2, name: "Pal" }, "pal")
      .unit(P1, "bf1", { might: 2, name: "Pal2" }, "pal2")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    await game.p2.choose("resolveFullCombat:bf1");
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2, total: 6 });
    expect((await game.p2.try((p) => p.distribute({ pal: 1, pal2: 1, tc: 4 }))).ok).toBe(false);
    expect((await game.p2.try((p) => p.distribute({ pal: 2, pal2: 4 }))).ok).toBe(false);
    await game.p2.distribute({ pal: 1, tc: 5 });
    if (game.p2.can("resolveFullCombat:bf1")) {
      await game.p2.choose("resolveFullCombat:bf1");
    }
    await game.settle();
    expect(game.zoneOf("tc")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("battlefield-bf1");
    expect(game.zoneOf("pal2")).toBe("battlefield-bf1");
    expect(game.zoneOf("raider")).toBe("trash"); // 2 + 2 + 5 = 9 ≥ 6
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("[Tank] also binds while ATTACKING (Shield off → lethal is 3): Combatant + Pal (2) into a 4-Might defender — the 4 goes 3→Combatant then 1→Pal; Combatant dies, Pal survives and conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
      .unit(P1, "base", CARD, "tc")
      .unit(P2, "bf1", { might: 4, name: "Def" }, "def")
      .build();
    await game.p1.move(["pal", "tc"], "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash"); // 2 + 3 = 5 ≥ 4
    expect(game.zoneOf("tc")).toBe("trash");
    expect(game.locationOf("pal")).toBe("bf1");
    expect(game.state("pal").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("[Tank] scope: a Combatant sitting in the BASE does nothing for Pal defending bf1 alone — Pal dies to a 3-Might raider", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Pal" }, "pal")
      .unit(P1, "base", CARD, "tc")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("tc")).toMatchObject({ combatRole: null, might: 3 });
    await game.settle();
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.state("tc")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("spell damage in the OPEN: no Defender designation, no Shield — a 3-damage bolt kills the 3-Might Combatant where it stands", async () => {
    const open = await scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "tc").hand(P2, BOLT3, "bolt").build();
    expect(open.state("tc")).toMatchObject({ combatRole: null, might: 3 });
    await open.p2.cast("bolt", { targets: "tc" });
    await open.settle();
    expect(open.zoneOf("tc")).toBe("trash");
  });

  test("spell damage MID-COMBAT is measured against its defending Might of 5 (142.4.b / 814.1.c / 432.1.a): a 3-damage bolt plus a 1-Might poke (4 < 5) must not kill it; it heals before Shield lapses", async () => {
    // Expected: after the bolt resolves the Combatant sits at bf1 with 3 damage on 5 Might; the 1-Might attacker
    // adds 1 (total 4 < 5), dies to the 5 back, and the Combatant heals (466.1.a.1) before losing the designation.
    // Actual: the lethal check on spell damage uses the base 3, so the bolt alone sends the defender to the trash.
    const combat = await siege(1).hand(P2, BOLT3, "bolt").build();
    await combat.p2.move("raider", "bf1");
    await combat.p2.cast("bolt", { targets: "tc" }); // attacker holds Focus
    await combat.p2.passPriority();
    await combat.p1.passPriority();
    expect(combat.state("tc")).toMatchObject({ combatRole: "defender", damage: 3, might: 5, zone: "battlefield-bf1" });
    await combat.settle();
    expect(combat.zoneOf("tc")).toBe("battlefield-bf1");
    expect(combat.state("tc")).toMatchObject({ damage: 0, might: 3 });
    expect(combat.zoneOf("raider")).toBe("trash"); // the 1-Might poke took 5
    expect(combat.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("814.2 stacking with Block: Shield 2 + Shield 3 = Shield 5 → 8 Might while defending; a 7-Might raider is one short (7 < 8) and dies to the 8 back", async () => {
    const game = await siege(7).resources(P1, { energy: 2 }).hand(P1, BLOCK, "block").build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("block", { targets: "tc" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("tc").grantedKeywords).toEqual(expect.arrayContaining([{ duration: "turn", keyword: "Shield", value: 3 }]));
    expect(game.state("tc").might).toBe(8);
    await game.settle();
    expect(game.zoneOf("tc")).toBe("battlefield-bf1");
    expect(game.state("tc")).toMatchObject({ damage: 0, might: 3 }); // out of combat: neither Shield counts
    expect(game.zoneOf("raider")).toBe("trash"); // took 8 ≥ 7
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("stunned defender (Back Off from the attacker): deals 0 (423.1.b) yet still needs its full 5 to die (423.1.c) — a 4-Might raider neither kills it nor takes damage, and is recalled", async () => {
    const game = await siege(4).resources(P2, { energy: 3 }).hand(P2, BACK_OFF, "bo").build();
    await game.p2.move("raider", "bf1");
    await game.p2.cast("bo", { targets: "tc" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("tc")).toMatchObject({ isStunned: true, might: 5 });
    await game.settle();
    expect(game.zoneOf("tc")).toBe("battlefield-bf1"); // 4 < 5
    expect(game.zoneOf("raider")).toBe("base"); // dealt nothing to it; defenders remain → recalled
    expect(game.state("raider").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("registry payload: exactly [Shield 2, Tank] — no triggered/activated text — on a 4-cost, 3-Might Body unit with no power cost", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 4, might: 3, name: "Towering Combatant" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.isChampion ?? false).toBe(false);
    expect(def?.abilities).toEqual([
      { keyword: "Shield", type: "keyword", value: 2 },
      { keyword: "Tank", type: "keyword" },
    ]);
  });
});
