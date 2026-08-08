/**
 * Altar of Blood — unl-206-219 · Battlefield
 *
 *   If a unit here would die during combat, its controller may pay [rainbow][rainbow][rainbow] to heal it,
 *   exhaust it, and recall it instead.
 *
 * Rules: 368–370 (a "would … instead" passive is a replacement effect, applied before the event happens,
 * 370.1.c), 371.2 (a "may" replacement is offered to the named player when the event would occur;
 * declining leaves the death alone), 370.1.a.1 (a replaced death never happened: no trash, no Deathknell),
 * 373 (simultaneous deaths are separate events — each gets its own offer and its own payment),
 * 135.2.e.5.a ([rainbow] = one Power of ANY domain; Energy cannot pay it), 459–466 (Combat spans the
 * showdown, the damage step and the resolution step; Attacker/Defender designations last until 466.7.a),
 * 466.3 / 466.5 (the side left alone at the battlefield wins and Establishes Control = Conquer; nobody
 * left → Uncontrolled, 466.5.b), 454 (a recall sends the unit to base and is not a move).
 *
 * Head-judge notes — the trickiest situations for THIS card:
 *  1. "ITS controller may pay": the dying unit's controller decides and pays — the ATTACKER's units are
 *     covered exactly like the defender's, whoever owns/controls the battlefield card.
 *  2. Saving a unit changes the combat result: defender saved+recalled → the attacker stands alone and
 *     CONQUERS; attacker saved → the defender simply holds; both saved → empty battlefield, Uncontrolled,
 *     no point for anyone.
 *  3. "during combat" includes the combat SHOWDOWN (a spell kill on a designated defender is covered) but
 *     not a main-phase spell kill at the Altar, and never a death at another battlefield.
 *  4. Cost edge: exactly three Power of any mix (fury+mind+calm is fine); two Power or a pile of Energy →
 *     the offer is never made and the unit dies.
 *  5. Two of your units dying in the same damage step with only 3 Power: one offer per death; saying no to
 *     the first still gets you asked about the second (you effectively choose which one lives).
 *  6. Not a death: a saved [Deathknell] unit (Watchful Sentry) draws nothing.
 */

import { describe, expect, test } from "bun:test";
import type { YesNoDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-206-219";
const WATCHFUL_SENTRY = "ogn-096-298"; // 2 Might · [Deathknell] — Draw 1.
const CHEMTECH_ENFORCER = "ogn-003-298"; // 2 Might · [Assault 2]
const BOLT = {
  abilities: [{ effect: { amount: 4, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

/** P1's `atk`-Might raider in base vs P2's `def`-Might defender at the Altar (P2's card); pools per seat. */
function board(opts: { atk?: number; def?: number; p1?: Record<string, number>; p2?: Record<string, number>; defDamage?: number } = {}) {
  return scenario()
    .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P2 })
    .resources(P1, { power: opts.p1 ?? {} })
    .resources(P2, { power: opts.p2 ?? { fury: 3 } })
    .unit(P1, "base", { might: opts.atk ?? 3, name: "Raider" }, "raider")
    .unit(P2, "bf1", { might: opts.def ?? 1, name: "Defender" }, "def", opts.defDamage ? { damage: opts.defDamage } : undefined);
}

describe("Altar of Blood (unl-206-219)", () => {
  test("registry payload: an optional pay-[rainbow]×3 die-replacement for units HERE, during combat, paid by the affected unit's controller, doing heal → exhaust → recall", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Altar of Blood" });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      condition: { cost: { power: ["rainbow", "rainbow", "rainbow"] }, type: "pay-cost" },
      duringCombat: true,
      payer: "affected-controller",
      replacement: { effects: [{ amount: "all", type: "heal" }, { type: "exhaust" }, { type: "recall" }], type: "sequence" },
      replaces: "die",
      target: { location: "here", type: "unit" },
      type: "replacement",
    });
  });

  test("a defender taking lethal combat damage → ITS controller (P2, not the attacker) is asked yes/no while the unit is still on the battlefield (370.1.c)", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision() as YesNoDecision;
    expect(d).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "bf1" } });
    expect(d.canAccept).toBe(true);
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.p2.trash()).toEqual([]);
  });

  test("accepting: exactly 3 Power of ANY mix is spent, the pre-damaged defender is fully healed, exhausted and recalled to base (never the trash) — and the attacker, now alone, CONQUERS for 1 point", async () => {
    const game = await board({ atk: 2, def: 4, defDamage: 2, p2: { calm: 1, fury: 1, mind: 1 } }).build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    await game.p2.yes();
    await game.settle();
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0, mind: 0 } });
    expect(game.zoneOf("def")).toBe("base");
    expect(game.state("def")).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
    expect(game.p2.trash()).toEqual([]);
    expect(game.zoneOf("raider")).toBe("trash"); // took 4 — P1 had no Power, so no offer for it
    expect(game.gameState.battlefields.bf1?.controller).toBe(null); // 466.5.b: nobody left
    // Same line with a surviving attacker: it conquers.
    const win = await board({ p2: { calm: 1, fury: 1, mind: 1 } }).build();
    await win.p1.move("raider", "bf1");
    await win.settle();
    await win.p2.yes();
    await win.settle();
    expect(win.zoneOf("def")).toBe("base");
    expect(win.locationOf("raider")).toBe("bf1");
    expect(win.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(win.p1.points()).toBe(1);
    expect(win.violations()).toEqual([]);
  });

  test("declining (371.2.b): the defender dies to the trash, P2 keeps all 3 Power, the attacker conquers", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    await game.p2.no();
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.p2.power()).toBe(3);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("cost negative space: only 2 Power, or 9 Energy and no Power → the offer is never made and the unit just dies", async () => {
    for (const p2 of [{ power: { fury: 2 } }, { energy: 9, power: {} }]) {
      const game = await board({ p2: p2.power }).resources(P2, { energy: p2.energy ?? 0 }).build();
      expect(game.p2.power()).toBeLessThan(3);
      await game.p1.move("raider", "bf1");
      const r = await game.settle();
      expect(r.reason).toBe("open");
      expect(game.zoneOf("def")).toBe("trash");
      expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    }
  });

  test("'its controller' covers the ATTACKER too: P1's 2-Might raider dying into a 4-Might wall at P2's Altar → P1 is asked, pays 3 chaos, raider goes home healed+exhausted; P2 holds, nobody scores", async () => {
    const game = await board({ atk: 2, def: 4, p1: { chaos: 3 }, p2: {} }).build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("raider")).toBe("base");
    expect(game.state("raider")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p1.power()).toBe(0);
    expect(game.locationOf("def")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points() + game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("both sides lethal (3 vs 3), both controllers pay → both units recalled home, the Altar is left EMPTY and Uncontrolled (466.5.b), no point for anyone", async () => {
    const game = await board({ atk: 3, def: 3, p1: { chaos: 3 }, p2: { fury: 3 } }).build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    for (let i = 0; i < 2; i++) {
      const d = game.decision() as YesNoDecision;
      expect(d.kind).toBe("yes-no");
      await game.seat(d.seat).yes();
      await game.settle();
    }
    expect(game.zoneOf("raider")).toBe("base");
    expect(game.zoneOf("def")).toBe("base");
    expect(game.p1.power() + game.p2.power()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(null);
    expect(game.p1.points() + game.p2.points()).toBe(0);
  });

  test("'during combat' includes the combat SHOWDOWN: the attacker (holding Focus) bolts the designated defender dead → P2 is offered the Altar; paying recalls it and the raider takes the empty battlefield", async () => {
    const game = await board({ atk: 2, def: 3 }).resources(P1, { energy: 1 }).hand(P1, BOLT, "bolt").build();
    await game.p1.move("raider", "bf1");
    expect(game.state("def").combatRole).toBe("defender");
    await game.p1.cast("bolt", { targets: "def" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    await game.p2.yes();
    await game.settle();
    expect(game.zoneOf("def")).toBe("base");
    expect(game.state("def").damage).toBe(0);
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.state("raider").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("negative space — NOT during combat: a main-phase bolt killing the unit at the Altar is a plain death (no offer, Power kept)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P2 })
      .resources(P2, { power: { fury: 3 } })
      .resources(P1, { energy: 1 })
      .hand(P1, BOLT, "bolt")
      .unit(P2, "bf1", { might: 1 }, "def")
      .build();
    await game.p1.cast("bolt", { targets: "def" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.p2.power()).toBe(3);
  });

  test("negative space — NOT here: a combat death at the battlefield next door gets no offer", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P2 })
      .battlefield("bf2", { controller: P2 })
      .resources(P2, { power: { fury: 3 } })
      .unit(P1, "base", { might: 3 }, "raider")
      .unit(P2, "bf2", { might: 1 }, "far")
      .build();
    await game.p1.move("raider", "bf2");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("far")).toBe("trash");
    expect(game.p2.power()).toBe(3);
  });

  test("a replaced death is not a death (370.1.a.1): a saved Watchful Sentry draws P2 nothing; declined, it dies and its Deathknell draws 1", async () => {
    const solo = await scenario()
      .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P2 })
      .resources(P2, { power: { fury: 3 } })
      .unit(P1, "base", { might: 5 }, "raider")
      .unit(P2, "bf1", WATCHFUL_SENTRY, "sentry")
      .build();
    const h0 = solo.p2.hand().length;
    await solo.p1.move("raider", "bf1");
    await solo.settle();
    await solo.p2.yes();
    await solo.settle();
    expect(solo.zoneOf("sentry")).toBe("base");
    expect(solo.p2.hand()).toHaveLength(h0);
    expect(solo.chain()).toEqual([]);
    const declined = await scenario()
      .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P2 })
      .resources(P2, { power: { fury: 3 } })
      .unit(P1, "base", { might: 5 }, "raider")
      .unit(P2, "bf1", WATCHFUL_SENTRY, "sentry")
      .build();
    await declined.p1.move("raider", "bf1");
    await declined.settle();
    await declined.p2.no();
    await declined.settle();
    expect(declined.zoneOf("sentry")).toBe("trash");
    expect(declined.p2.hand()).toHaveLength(h0 + 1);
  });

  test("two of P2's units die in the same damage step with only 3 Power (373): one offer per death — declining the first still brings the second; exactly one is saved and the pool is empty", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P2 })
      .resources(P2, { power: { fury: 3 } })
      .unit(P1, "base", { might: 5 }, "raider")
      .unit(P2, "bf1", { might: 1, name: "A" }, "a")
      .unit(P2, "bf1", { might: 1, name: "B" }, "b")
      .build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.no();
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.yes();
    await game.settle();
    const zones = [game.zoneOf("a"), game.zoneOf("b")].sort();
    expect(zones).toEqual(["base", "trash"]);
    expect(game.p2.power()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("mixed-keyword combat: Chemtech Enforcer ([Assault 2] → 4) + a 2-Might grunt into Tank 3 + Back 2 — Tank must soak first and dies, P2 saves it via the Altar; Back dies; the Enforcer dies to the 5 return damage; the grunt conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P2 })
      .resources(P2, { power: { fury: 3 } })
      .unit(P1, "base", CHEMTECH_ENFORCER, "enforcer")
      .unit(P1, "base", { might: 2, name: "Grunt" }, "grunt")
      .unit(P2, "bf1", { keywords: ["Tank"], might: 3, name: "Tank" }, "tank")
      .unit(P2, "bf1", { might: 2, name: "Back" }, "back")
      .build();
    await game.p1.move(["enforcer", "grunt"], "bf1");
    expect(game.state("enforcer").might).toBe(4); // Assault 2 while attacking
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.yes(); // the first P2 death offered is paid for; the second cannot be (pool empty)
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect([game.zoneOf("tank"), game.zoneOf("back")].sort()).toEqual(["base", "trash"]);
    expect(game.zoneOf("enforcer")).toBe("trash");
    expect(game.locationOf("grunt")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("on the OPPONENT's turn: P1 defends the Altar it controls (P2 owns the card); P1's 2-Might unit would die to a 4-Might attacker → P1 pays order+order+body and keeps the unit; P2 conquers the vacated battlefield", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P2 })
      .resources(P1, { power: { body: 1, order: 2 } })
      .unit(P2, "base", { might: 4 }, "raider")
      .unit(P1, "bf1", { might: 2 }, "mine")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("mine")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, order: 0 } });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });
});
