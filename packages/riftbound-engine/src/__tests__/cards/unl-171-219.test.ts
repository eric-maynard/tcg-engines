/**
 * Galio, Indefatigable — unl-171-219 · Unit (Champion, Galio) · Order · 3 energy + [order] · 6 Might
 *
 *   [Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *   [Tank] (I must be assigned combat damage first.)
 *   I don't deal combat damage.
 *
 * Rules: 809 (Deflect 1: each opposing choice costs 1 extra power of ANY domain; own controller never
 * taxed), 815 + 465.2.c.3/.6 (Tank: the OPPOSING player must assign lethal damage to Galio before any
 * non-Tank unit of the same controller; if their total cannot reach lethal on him, all of it lands on
 * him), 465.2.a/b + 423.1.b analogue ("doesn't deal combat damage" = his Might is not summed into his
 * side's combat damage — attacking or defending — but he still HAS 6 Might and still needs 6 to die),
 * 466.1.a.2 + 466.3 (if both sides still have units after damage, attackers are recalled: no result),
 * 417 (only COMBAT damage is switched off — spell/ability damage he deals or takes is normal).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. Attacking alone into ANY defender (even 1 Might) can never conquer: he deals 0, eats their damage,
 *     survives (if < 6), is healed and recalled; the defender is untouched. An EMPTY battlefield is fine.
 *  2. Attacking with an ally: only the ally's Might counts (Galio+3 into a 4 bounces; Galio+4 into a 4
 *     kills it), while Tank makes the defender's damage land on Galio so the ally lives.
 *  3. Defending: a lone 5 into Galio + a 1-Might Buddy → all 5 must go on Galio (not lethal), Buddy's 1
 *     is the only return damage, attacker survives and is recalled, bf held. A 7 splits 6/1 and wipes
 *     both; exactly 6 into a lone Galio kills him and the attacker walks in undamaged.
 *  4. Non-combat damage is untouched both ways: Last Breath makes Galio deal his full 6; Void Seeker
 *     (paid through Deflect) marks 4 on him.
 *  5. Deflect: tax not immunity — power-less opponent cannot choose him; 1 power of any domain can.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-171-219";
const CLEAVE = "ogn-004-298"; // Fury Action, 1: Give a unit [Assault 3] this turn.
const VOID_SEEKER = "ogn-024-298"; // Fury Action, 3+[fury]: Deal 4 to a unit at a battlefield. Draw 1.
const LAST_BREATH = "ogn-260-298"; // Calm/Chaos Action, 3+[r][r]: Ready a friendly unit. It deals damage equal to its Might to an enemy unit at a battlefield.

const cleaveTargets = (g: { p2: { option: (v: string, c: string) => { fields: readonly { arg: string; options?: readonly unknown[] }[] } | undefined } }) =>
  g.p2.option("cast", "cleave")?.fields.find((f) => f.arg === "targets")?.options;

describe("Galio, Indefatigable (unl-171-219)", () => {
  test("registry payload: 3+[order] Order champion, 6 Might; Deflect 1 + Tank keywords and a static self-grant of NoCombatDamage — nothing else", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 3, isChampion: true, might: 6, name: "Galio, Indefatigable", tags: ["Galio"] });
    expect(def?.powerCost).toEqual(["order"]);
    expect(def?.abilities).toEqual([
      { keyword: "Deflect", type: "keyword", value: 1 },
      { keyword: "Tank", type: "keyword" },
      { effect: { keyword: "NoCombatDamage", target: "self", type: "grant-keyword" }, type: "static" },
    ]);
  });

  test("cost: 3 energy + 1 order; enters base exhausted as a 6 with Deflect, Tank and the no-combat-damage marker; no play effect; short either resource → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { order: 1 } }).hand(P1, CARD, "galio").build();
    await game.p1.play("galio");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("galio")).toMatchObject({ baseMight: 6, isExhausted: true, might: 6, zone: "base" });
    expect([...game.state("galio").keywords].sort()).toEqual(["Deflect", "NoCombatDamage", "Tank"]);
    expect((await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "g").build()).p1.can("play", "g")).toBe(false);
    expect((await scenario().resources(P1, { energy: 2, power: { order: 2 } }).hand(P1, CARD, "g").build()).p1.can("play", "g")).toBe(false);
  });

  test("'I don't deal combat damage' — attacking ALONE into a 1-Might defender: defender takes nothing, Galio takes 1 (< 6), is healed and recalled to base; no conquer, no points", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 1, name: "Sentry" }, "sentry").unit(P1, "base", CARD, "galio").build();
    await game.p1.move("galio", "bf1");
    expect(game.state("galio").combatRole).toBe("attacker");
    await game.settle();
    expect(game.state("sentry")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("galio")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("negative space — an EMPTY enemy battlefield involves no combat damage at all: Galio walks in and conquers (+1 point)", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "galio").build();
    await game.p1.move("galio", "bf1");
    await game.settle();
    expect(game.locationOf("galio")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("attacking WITH an ally, only the ally's Might is dealt: Galio + 3 into a 4-Might defender kills nothing and everyone is recalled unhurt; Galio + 4 into the same defender kills it and conquers, the defender's 4 landing on Tank Galio (ally undamaged)", async () => {
    const weak = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 4, name: "Warden" }, "warden").unit(P1, "base", CARD, "galio").unit(P1, "base", { might: 3, name: "Ally" }, "ally").build();
    await weak.p1.move(["galio", "ally"], "bf1");
    await weak.settle();
    expect(weak.state("warden")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(weak.zoneOf("galio")).toBe("base");
    expect(weak.zoneOf("ally")).toBe("base");
    expect(weak.gameState.battlefields.bf1?.controller).toBe(P2);

    const strong = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 4, name: "Warden" }, "warden").unit(P1, "base", CARD, "galio").unit(P1, "base", { might: 4, name: "Ally" }, "ally").build();
    await strong.p1.move(["galio", "ally"], "bf1");
    await strong.settle();
    expect(strong.zoneOf("warden")).toBe("trash");
    expect(strong.zoneOf("galio")).toBe("battlefield-bf1");
    expect(strong.state("ally")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(strong.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(strong.p1.points()).toBe(1);
  });

  test("[Tank] while defending: a lone 5-Might raider into Galio + a 1-Might Buddy must put all 5 on Galio (not lethal) — Buddy lives, the raider takes only Buddy's 1, survives and is recalled; bf1 held", async () => {
    const game = await scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "galio").unit(P1, "bf1", { might: 1, name: "Buddy" }, "buddy").unit(P2, "base", { might: 5, name: "Raider" }, "raider").build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.state("galio")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // healed in the combat cleanup
    expect(game.state("buddy")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("raider")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("[Tank] is enforced on the ATTACKER's assignment (815, 465.2.c.6): 3 damage into Galio(6, Tank) + Buddy(1) may not touch Buddy — any split naming Buddy is rejected, {galio: 3} is accepted, nobody on P1's side dies", async () => {
    const game = await scenario()
      .active(P2)
      .autoProcedures(false)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "galio")
      .unit(P1, "bf1", { might: 1, name: "Buddy" }, "buddy")
      .unit(P2, "base", { might: 3, name: "Poker" }, "poker")
      .build();
    await game.p2.move("poker", "bf1");
    await game.settle(); // focus passes; combat resolution is now a manual procedure
    await game.p2.choose("resolveFullCombat:bf1");
    if (game.decision()?.kind === "distribute") {
      expect((await game.p2.try((p) => p.distribute({ buddy: 1, galio: 2 }))).ok).toBe(false);
      expect((await game.p2.try((p) => p.distribute({ galio: 2, buddy: 1 }))).ok).toBe(false);
      await game.p2.distribute({ galio: 3 });
    }
    while (game.p2.can("resolveFullCombat:bf1")) {
      await game.p2.choose("resolveFullCombat:bf1");
    }
    await game.settle();
    expect(game.zoneOf("galio")).toBe("battlefield-bf1");
    expect(game.zoneOf("buddy")).toBe("battlefield-bf1");
    expect(game.state("poker")).toMatchObject({ damage: 0, zone: "base" }); // took Buddy's 1 (< 3), healed, recalled
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("[Tank] ordering with enough damage: a 7-Might raider assigns 6 to Galio first, then 1 to Buddy — both die, the raider (hit only by Buddy's 1) conquers", async () => {
    const game = await scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "galio").unit(P1, "bf1", { might: 1, name: "Buddy" }, "buddy").unit(P2, "base", { might: 7, name: "Raider" }, "raider").build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("galio")).toBe("trash");
    expect(game.zoneOf("buddy")).toBe("trash");
    expect(game.state("raider")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  test("he still HAS 6 Might for dying: exactly 6 into a lone defending Galio kills him and the attacker conquers undamaged; 5 does not (attacker recalled, bf held)", async () => {
    const six = await scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "galio").unit(P2, "base", { might: 6, name: "Raider" }, "raider").build();
    await six.p2.move("raider", "bf1");
    await six.settle();
    expect(six.zoneOf("galio")).toBe("trash");
    expect(six.state("raider")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(six.gameState.battlefields.bf1?.controller).toBe(P2);

    const five = await scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "galio").unit(P2, "base", { might: 5, name: "Raider" }, "raider").build();
    await five.p2.move("raider", "bf1");
    await five.settle();
    expect(five.zoneOf("galio")).toBe("battlefield-bf1");
    expect(five.zoneOf("raider")).toBe("base");
    expect(five.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("only COMBAT damage is switched off: via Last Breath ('ready a friendly unit; it deals damage equal to its Might') Galio deals his full 6 and kills a 5-Might unit at a battlefield", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1, chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Brute" }, "brute")
      .unit(P1, "base", CARD, "galio", { exhausted: true })
      .hand(P1, LAST_BREATH, "lb")
      .build();
    await game.p1.cast("lb", { targets: ["galio", "brute"] });
    await game.settle();
    expect(game.state("galio").isReady).toBe(true);
    expect(game.zoneOf("brute")).toBe("trash");
  });

  test("…and he TAKES spell damage normally: P2's Void Seeker (3+[fury] and +1 power for Deflect) marks 4 on Galio at a battlefield — he survives on 6", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3, power: { fury: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "galio")
      .hand(P2, VOID_SEEKER, "vs")
      .build();
    await game.p2.cast("vs", { targets: "galio" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // 1 fury for the pip + 1 for Deflect
    await game.settle();
    expect(game.state("galio")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
  });

  test("[Deflect]: a power-less opponent cannot choose Galio with Cleave (a plain ally is still offered); with 1 power of ANY domain (mind) they can, and it is spent", async () => {
    const poor = await scenario().active(P2).resources(P2, { energy: 1 }).unit(P1, "base", CARD, "galio").unit(P1, "base", { might: 2, name: "Plain" }, "plain").hand(P2, CLEAVE, "cleave").build();
    expect(cleaveTargets(poor)).toEqual([["plain"]]);
    expect((await poor.p2.try((p) => p.cast("cleave", { targets: "galio" }))).ok).toBe(false);
    expect(poor.p2.energy()).toBe(1);

    const rich = await scenario().active(P2).resources(P2, { energy: 1, power: { mind: 1 } }).unit(P1, "base", CARD, "galio").hand(P2, CLEAVE, "cleave").build();
    expect(cleaveTargets(rich)).toEqual([["galio"]]);
    await rich.p2.cast("cleave", { targets: "galio" });
    expect(rich.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await rich.settle();
    expect(rich.state("galio").keywords).toContain("Assault");
  });

  test("[Deflect] never taxes his controller: P1 Cleaves Galio for exactly 1 energy, no power", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", CARD, "galio").hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "galio" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("galio").grantedKeywords).toContainEqual({ duration: "turn", keyword: "Assault", value: 3 });
  });

  // rule 809.1.c.1: the surcharge is incurred when the target is CHOSEN, so a
  // prompted pick out of several candidates pays it just like an auto-bound one.
  test("[Deflect] taxes a prompted pick too: an opposing triggered ability choosing Galio out of two candidates spends the power at pick time", async () => {
    const PINGER = {
      abilities: [
        {
          effect: { amount: 1, target: { controller: "enemy", type: "unit" }, type: "damage" },
          trigger: { event: "play-self" },
          type: "triggered",
        },
      ],
      cardType: "unit",
      domain: "fury",
      energyCost: 0,
      might: 1,
      name: "Test Pinger",
      rulesText: "When you play me, deal 1 to an enemy unit.",
    };
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 0, power: { fury: 1 } })
      .unit(P1, "base", CARD, "galio")
      .unit(P1, "base", { might: 2, name: "Plain" }, "plain")
      .hand(P2, PINGER, "pinger")
      .build();
    await game.p2.play("pinger");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    await game.p2.pick("galio");
    await game.settle();
    expect(game.state("galio").damage).toBe(1);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("Assault on Galio is pointless: Cleaved (Assault 3 → 9 Might as attacker) he still deals no combat damage — a 1-Might defender survives untouched and Galio is recalled", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 1, name: "Sentry" }, "sentry").unit(P1, "base", CARD, "galio").hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "galio" });
    await game.settle();
    await game.p1.move("galio", "bf1");
    expect(game.state("galio").might).toBe(9);
    await game.settle();
    expect(game.state("sentry")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("galio")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
