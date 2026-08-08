/**
 * Fortified Position — ogn-279-298 · Battlefield
 *
 *   When you defend here, choose a unit. It gains [Shield 2] this combat.
 *   (+2 [Might] while it's a defender.)
 *
 * Rules: 190.6.d ("you" on a battlefield = its CONTROLLER; uncontrolled → "you" is no one);
 * 383.4.f (Defend Trigger — fires when the player gains the Defender designation, checked ONCE
 * per combat, 383.4.f.2.a); 464.2.e.1 (attacker's triggers go on the Combat Chain first, the
 * defender's last → the defender's resolves FIRST); 814 (Shield X = +X Might while a defender;
 * 814.2 multiple Shields SUM); 466.1.a.1 (heal all units after combat); 466.7 (combat ends →
 * "this combat" effects end).
 *
 * Head-judge corner cases for THIS card:
 *   1. Who is "you": P1 attacking P2's Fortified Position → P2 (controller + defender) gets the
 *      trigger and makes the choice; the attacker never does. Mirror: P1 controls it and P2 attacks
 *      on P2's turn → P1 chooses. Walking onto an EMPTY uncontrolled Fortified Position is not a
 *      combat at all → no trigger, plain conquer.
 *   2. "choose a unit" is unrestricted — any unit on the board is offered (even the attacker or a
 *      unit in a base); Shield on a non-defender is legal but does nothing (814.1.c).
 *   3. The +2 decides combat: 3-Might attacker into a 2-Might defender → defender is 4, attacker
 *      dies, defender lives (healed), P2 keeps the battlefield. Chosen on the attacker instead →
 *      defender dies and P1 conquers.
 *   4. 814.2 summing with printed Shield (Stalwart Poro: 1 + 2 = Shield 3 → 5 Might defending) and
 *      chain order vs an attack trigger (Crackshot Corsair's ping resolves AFTER the Shield grant).
 *   5. Once per combat: two defenders → exactly one Fortified Position item on the chain.
 *   6. "this combat" must EXPIRE (466.7): a second combat here later must see Shield 2, not 4.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ogn-279-298";
const STALWART_PORO = "ogn-052-298"; // 2 Might, [Shield]
const CRACKSHOT_CORSAIR = "ogn-130-298"; // 3 Might, When I attack, deal 1 to an enemy unit here.

/** P2 controls Fortified Position with a 2-Might defender; P1 has attackers in base. */
function board() {
  return scenario()
    .battlefield("fp", { controller: P2, def: CARD, inert: false, owner: P2 })
    .unit(P2, "fp", { might: 2, name: "Defender" }, "def")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .unit(P1, "base", { might: 3, name: "Attacker" }, "atk")
    .unit(P1, "base", { might: 5, name: "Big Attacker" }, "big");
}

describe("Fortified Position (ogn-279-298)", () => {
  test("registry payload: one Defend Trigger for the controller, here, granting Shield 2 to a chosen unit for the combat", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Fortified Position" });
    expect(def?.abilities).toEqual([
      {
        effect: { duration: "combat", keyword: "Shield", target: { type: "unit" }, type: "grant-keyword", value: 2 },
        trigger: { event: "defend", location: "here", on: "controller" },
        type: "triggered",
      },
    ]);
  });

  test("P1 attacks P2's Fortified Position → a triggered item controlled by P2 goes on the chain and P2 (not P1) is asked to choose a unit", async () => {
    const game = await board().build();
    await game.p1.move("atk", "fp");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fp", controller: P2, triggered: true })]);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", min: 1, max: 1, seat: P2, source: { cardId: "fp" } });
    expect(game.state("def").combatRole).toBe("defender");
    expect(game.state("atk").combatRole).toBe("attacker");
  });

  test("'choose a unit' is unrestricted: every unit on the board is offered — the defender, the attacker, and units sitting in a base", async () => {
    const game = await board().build();
    await game.p1.move("atk", "fp");
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card).sort() : [];
    expect(offered).toEqual(["atk", "big", "def", "home"]);
  });

  test("chosen defender gains Shield 2 for the combat: it reads 4 Might while defending, kills the 3-Might attacker, survives healed, and P2 keeps the battlefield", async () => {
    const game = await board().build();
    await game.p1.move("atk", "fp");
    await game.p2.pick("def");
    // Resolve just the trigger (P2 then P1 pass), leaving the showdown open.
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toHaveLength(0);
    expect(game.state("def").grantedKeywords).toEqual([{ duration: "combat", keyword: "Shield", value: 2 }]);
    expect(game.state("def").might).toBe(4);
    await game.settle(); // both pass focus → combat damage
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("def")).toBe("battlefield-fp");
    expect(game.state("def").damage).toBe(0); // 466.1.a.1 heal
    expect(game.gameState.battlefields.fp?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("negative space: Shield on the ATTACKER is legal but worthless (814.1.c) — 3 vs 2, the defender dies and P1 conquers for a point", async () => {
    const game = await board().build();
    await game.p1.move("atk", "fp");
    await game.p2.pick("atk");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("battlefield-fp");
    expect(game.gameState.battlefields.fp?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("exact numbers: a 5-Might attacker still beats 2 + Shield 2 = 4 (defender dies, attacker takes 4 < 5 and lives)", async () => {
    const game = await board().build();
    await game.p1.move("big", "fp");
    await game.p2.pick("def");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("big")).toBe("battlefield-fp");
    expect(game.gameState.battlefields.fp?.controller).toBe(P1);
  });

  test("814.2 Shield sums + 464.2.e.1 chain order: Stalwart Poro (Shield 1+2 → 5 Might) vs Crackshot Corsair — the defender's trigger sits ON TOP of the attacker's and resolves first; Poro survives 3+1, Corsair dies", async () => {
    const game = await scenario()
      .battlefield("fp", { controller: P2, def: CARD, inert: false, owner: P2 })
      .unit(P2, "fp", STALWART_PORO, "poro")
      .unit(P1, "base", CRACKSHOT_CORSAIR, "corsair")
      .build();
    await game.p1.move("corsair", "fp");
    expect(game.chain().map((i) => [i.cardId, i.controller])).toEqual([
      ["corsair", P1],
      ["fp", P2],
    ]);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    await game.p2.pick("poro");
    await game.p2.passPriority();
    await game.p1.passPriority(); // Fortified Position resolves; Corsair's ping still pending
    expect(game.chain().map((i) => i.cardId)).toEqual(["corsair"]);
    expect(game.state("poro").might).toBe(5);
    await game.settle();
    expect(game.zoneOf("poro")).toBe("battlefield-fp");
    expect(game.zoneOf("corsair")).toBe("trash");
    expect(game.gameState.battlefields.fp?.controller).toBe(P2);
  });

  test("383.4.f.2.a once per combat: two defending units still produce exactly ONE Fortified Position trigger", async () => {
    const game = await scenario()
      .battlefield("fp", { controller: P2, def: CARD, inert: false, owner: P2 })
      .unit(P2, "fp", { might: 2, name: "D1" }, "d1")
      .unit(P2, "fp", { might: 2, name: "D2" }, "d2")
      .unit(P1, "base", { might: 3, name: "Attacker" }, "atk")
      .build();
    await game.p1.move("atk", "fp");
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "fp", controller: P2 });
  });

  test("mirror: P1 controls Fortified Position and P2 attacks on P2's turn → the trigger is P1's and P1 chooses", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("fp", { controller: P1, def: CARD, inert: false, owner: P2 })
      .unit(P1, "fp", { might: 2, name: "Mine" }, "mine")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "fp");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fp", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("mine");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("mine")).toBe("battlefield-fp");
    expect(game.gameState.battlefields.fp?.controller).toBe(P1);
  });

  test("negative space: I control Fortified Position but attack ELSEWHERE — nothing triggers (not defending, not here)", async () => {
    const game = await scenario()
      .battlefield("fp", { controller: P1, def: CARD, inert: false, owner: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "fp", { might: 2, name: "Garrison" }, "garrison")
      .unit(P2, "bf2", { might: 2, name: "Enemy" }, "enemy")
      .unit(P1, "base", { might: 3, name: "Attacker" }, "atk")
      .build();
    await game.p1.move("atk", "bf2");
    expect(game.chain()).toHaveLength(0);
    expect(game.decision()?.kind).toBe("action");
    await game.settle();
    expect(game.zoneOf("enemy")).toBe("trash"); // plain 3 vs 2, no Shield anywhere
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });

  test("negative space (190.6.d): moving onto an EMPTY, uncontrolled Fortified Position is no combat — no trigger, P1 simply conquers", async () => {
    const game = await scenario()
      .battlefield("fp", { controller: null, def: CARD, inert: false, owner: P2 })
      .unit(P1, "base", { might: 3, name: "Attacker" }, "atk")
      .build();
    await game.p1.move("atk", "fp");
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.gameState.battlefields.fp?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("atk").grantedKeywords).toEqual([]);
  });

  test("'this combat' Shield never expires (466.7) — a second combat here the same turn stacks to Shield 4, so a 5-Might attacker wrongly dies to a 2-Might defender", async () => {
    // Expected: combat 1 ends → the Shield 2 grant ends with it; combat 2 grants a fresh Shield 2 →
    // defender is 4, the 5-Might attacker kills it and conquers. Actual: the combat-1 grant lingers,
    // combat 2 sums to Shield 4 (6 Might) and the attacker dies.
    const game = await board().build();
    await game.p1.move("atk", "fp");
    await game.p2.pick("def");
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.state("def").grantedKeywords).toEqual([]); // combat over → grant gone
    await game.p1.move("big", "fp");
    await game.p2.pick("def");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("big")).toBe("battlefield-fp");
    expect(game.gameState.battlefields.fp?.controller).toBe(P1);
  });

  test("'this combat' Shield survives even across turns — two turns later the same defender defends with Shield 4", async () => {
    // Expected: on P1's next turn a fresh attack sees exactly one Shield 2 grant (4 Might); the
    // 5-Might attacker wins. Actual: the old grant is still on the unit (neither combat end nor the
    // end-of-turn expiry removes duration:"combat"), so it defends at 6.
    const game = await board().build();
    await game.p1.move("atk", "fp");
    await game.p2.pick("def");
    await game.settle();
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("def").grantedKeywords).toEqual([]);
    await game.p1.move("big", "fp");
    await game.p2.pick("def");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.fp?.controller).toBe(P1);
  });
});
