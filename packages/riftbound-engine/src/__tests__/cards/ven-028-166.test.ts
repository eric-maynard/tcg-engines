/**
 * Mournful Witness — ven-028-166 · Unit · Calm · 2 energy · 2 Might
 *
 *   When a combat that I was in ends, empower me. (I become Empowered if I'm not already.)
 *   [Empowered][>] I have +2 [Might].
 *
 * Rules: 466.7 (combat ENDS as the last step of the Resolution Step — after damage, kills, recalls and
 * control are settled; 466.7.b "combat ends" effects happen there), 441 (Empower: binary state,
 * 441.1.c empowering an Empowered object does nothing more; it is not a "this turn" effect), 727.1.b
 * ([Empowered][>] is a dependent passive: +2 exactly while Empowered), 383 (the trigger is a chain
 * item owned by the Witness's controller).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. The +2 arrives only AFTER the combat: during its first fight the Witness is a 2 (2 into a 2 is a
 *     double KO, not a 4-vs-2 win). Survive one combat (any role, any result) and it is a 4 from then on.
 *  2. "that I was IN": a combat at another battlefield, or a bloodless walk onto an open battlefield,
 *     is not a combat the Witness was in → stays 2.
 *  3. Attacker that fails to clear the defenders is RECALLED (466.1.a.2) before combat ends — it was
 *     still in that combat, so it comes home Empowered (set up with Calm partner Rune Prison stunning
 *     the defender so the 2-Might Witness survives the exchange).
 *  4. Dies in the combat → it is in the trash when combat ends; nothing on the board gets empowered.
 *  5. Already Empowered → a second combat changes nothing (still 4, not 6); Empowered and the +2
 *     persist across turns.
 *  6. Defend half on the opponent's turn.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-028-166";
const RUNE_PRISON = "ogn-050-298"; // [Action] Stun a unit. (2 energy + [calm]) — Calm partner

/** Drain the post-combat trigger (pass/forced picks) and report the Witness. */
async function afterCombat(game: Game) {
  await game.settle();
  return game.state("mw");
}

describe("Mournful Witness (ven-028-166)", () => {
  test("registry payload: Calm 2-cost 2-Might; [triggered combat-end/self → empower self, static while-empowered → +2 Might]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 2, might: 2, name: "Mournful Witness" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({ effect: { target: "self", type: "empower" }, trigger: { event: "combat-end", on: "self" }, type: "triggered" });
    expect(def?.abilities?.[1]).toMatchObject({ condition: { type: "while-empowered" }, effect: { amount: 2, type: "modify-might" }, type: "static" });
  });

  test("cost: 2 energy for an exhausted, NOT empowered 2-Might unit; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "mw").build();
    await game.p1.play("mw");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("mw")).toMatchObject({ isEmpowered: false, isExhausted: true, might: 2, zone: "base" });
    expect((await scenario().resources(P1, { energy: 1, power: { calm: 2 } }).hand(P1, CARD, "mw").build()).p1.can("play", "mw")).toBe(false);
  });

  test("[Empowered][>] static: an Empowered Witness is a 4 (base 2), a plain one is a 2 — continuously, no chain needed", async () => {
    const emp = await scenario().unit(P1, "base", CARD, "mw", { empowered: true }).build();
    expect(emp.state("mw")).toMatchObject({ baseMight: 2, isEmpowered: true, might: 4 });
    const plain = await scenario().unit(P1, "base", CARD, "mw").build();
    expect(plain.state("mw")).toMatchObject({ baseMight: 2, isEmpowered: false, might: 2 });
  });

  test("during its first combat it is still a 2: attacking a 2-Might defender is a double KO (the +2 never arrives in time) and nothing is conquered", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 2, name: "Sentry" }, "sentry").unit(P1, "base", CARD, "mw").build();
    await game.p1.move("mw", "bf1");
    expect(game.state("mw")).toMatchObject({ combatRole: "attacker", isEmpowered: false, might: 2 });
    expect(game.chain()).toEqual([]); // "when combat ENDS" — nothing triggers on the attack itself
    await game.settle();
    expect(game.zoneOf("mw")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.points()).toBe(0);
  });

  test("after winning a combat (2 into a 1) the Witness should be Empowered → 4 Might on the conquered battlefield (466.7.b, 441)", async () => {
    // Expected (466.7.b + 441): combat ends → trigger → empower → static +2. The engine emits no
    // combat-end event, so the Witness stays a plain 2.
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 1, name: "Sentry" }, "sentry").unit(P1, "base", CARD, "mw").build();
    await game.p1.move("mw", "bf1");
    const s = await afterCombat(game);
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(s).toMatchObject({ isEmpowered: true, might: 4, zone: "battlefield-bf1" });
  });

  test("near miss — attack into a 3-Might wall that survives: the Witness DIES in that combat, so there is nothing on the board to empower", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 3, name: "Wall" }, "wall").unit(P1, "base", CARD, "mw").build();
    await game.p1.move("mw", "bf1");
    await game.settle();
    expect(game.zoneOf("mw")).toBe("trash");
    expect(game.state("wall")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("mw").isEmpowered).toBe(false);
  });

  test("an attacker that survives a stunned defender is recalled home (466.1.a.2) but WAS in that combat, so it should be Empowered 4 in base", async () => {
    // Expected: stunned Fortress takes 2 and lives, deals nothing; defenders remain → the Witness is
    // recalled to base; combat ends → empowered → 4 Might in base. Engine: no combat-end event.
    const game = await scenario()
      .resources(P1, { energy: 2, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Fortress" }, "fort")
      .unit(P1, "base", CARD, "mw")
      .hand(P1, RUNE_PRISON, "prison")
      .build();
    await game.p1.cast("prison", { targets: "fort" });
    await game.settle();
    expect(game.state("fort").isStunned).toBe(true);
    await game.p1.move("mw", "bf1");
    expect(game.state("mw").combatRole).toBe("attacker");
    const s = await afterCombat(game);
    expect(game.state("fort")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // took 2 < 5, healed
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(s.zone).toBe("base"); // recalled, not killed
    expect(s.damage).toBe(0);
    expect(s).toMatchObject({ isEmpowered: true, might: 4 });
  });

  test("defending and surviving on the opponent's turn should leave the Witness Empowered (4 Might) holding bf1", async () => {
    // Expected: after the combat the defending Witness is Empowered (4 Might). Engine: no combat-end event.
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "mw")
      .unit(P2, "base", { might: 1, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("mw").combatRole).toBe("defender");
    const s = await afterCombat(game);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(s).toMatchObject({ isEmpowered: true, might: 4, zone: "battlefield-bf1" });
  });

  test("negative space — 'that I was IN': a combat fought by OTHER units at another battlefield leaves the Witness (idle at bf2) un-empowered", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", { might: 1, name: "Sentry" }, "sentry")
      .unit(P1, "base", { might: 3, name: "Bruiser" }, "bruiser")
      .unit(P1, "bf2", CARD, "mw")
      .build();
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("mw")).toMatchObject({ isEmpowered: false, might: 2, zone: "battlefield-bf2" });
  });

  test("negative space — walking onto an OPEN battlefield is a conquer without a combat: +1 point but the Witness stays a plain 2", async () => {
    const game = await scenario().battlefield("bf1", { controller: null }).unit(P1, "base", CARD, "mw").build();
    await game.p1.move("mw", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("mw")).toMatchObject({ isEmpowered: false, might: 2 });
  });

  test("already Empowered (441.1.c): fights as a 4 (kills a 3, survives with 3 damage healed) and is still exactly 4 afterwards — no double dip; persists into the next turn", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
      .unit(P1, "base", CARD, "mw", { empowered: true })
      .build();
    expect(game.state("mw").might).toBe(4);
    await game.p1.move("mw", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.state("mw")).toMatchObject({ damage: 0, isEmpowered: true, might: 4, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("mw")).toMatchObject({ isEmpowered: true, might: 4 });
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("mw")).toMatchObject({ isEmpowered: true, isReady: true, might: 4 });
  });
});
