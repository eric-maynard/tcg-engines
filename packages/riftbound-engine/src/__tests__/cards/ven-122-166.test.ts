/**
 * Solari Sunhawk — ven-122-166 · Unit · Order · 3 energy (no power) · 3 Might
 *
 *   [Empower] [2] ([2]: Empower me. Use only if not Empowered.)
 *   [Empowered][>] I have +1 [Might] and [Deflect 2]. (Opponents must pay [rainbow][rainbow] to
 *   choose me with a spell or ability.)
 *
 * Head-judge notes — the trickiest situations for THIS card:
 *  1. 827.1.c.1 — [Empower] is an ACTIVATED ability "[2]: Empower me. Play only if not Empowered": a
 *     chain item (383.3-like activated timing, your turn, Open state), exactly 2 ENERGY, and illegal once
 *     Empowered — also on later turns, because the Empowered status persists (441.1.a, no expiry).
 *  2. 828.1.c — "+1 and Deflect 2" is a DEPENDENT ability: absent while plain (3 Might, no Deflect, no
 *     tax), present while Empowered from ANY source, and gone again the moment she is Disempowered.
 *  3. 721.1.c / 560.2.a.2 — Deflect 2 is a MANDATORY extra cost of 2 power of ANY domain on OPPONENTS'
 *     spells AND abilities that choose her; her own controller's spells pay nothing extra; with < 2 spare
 *     power she is simply not a legal choice for the opponent.
 *  4. Counter-play — Lacerate ("If it's Empowered, disempower it. Then kill it if it has 3 or less"):
 *     the opponent pays 2 + [order] + 2 (Deflect), she drops 4 → 3 on disempower and THEN dies to the
 *     3-or-less check. Empower is not a Reaction: she cannot Empower in response to being targeted.
 *  5. Partners — Aurok General ("[Empowered] your Empowered units have +2") stacks to 6 only when BOTH are
 *     Empowered; Shock Blast costs [2] less while you control something Empowered.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-122-166";
const VENGEANCE = "ogn-229-298"; // Order spell, 4 + [order][order]: Kill a unit.
const LACERATE = "ven-127-166"; // Order spell, 2 + [order]: Choose a unit. If Empowered, disempower it. Then kill it if ≤3 Might.
const BALLISTA = "ogn-017-298"; // Fury gear: [Exhaust]: Deal 2 to a unit at a battlefield.
const DISCIPLINE = "ogn-058-298"; // Calm Reaction, 2: Give a unit +2 Might this turn. Draw 1.
const AUROK_GENERAL = "ven-130-166"; // Order unit 5: [Empowered] Your units that are Empowered have +2 Might (including me).
const SHOCK_BLAST = "ven-059-166"; // Mind Action, 3 + [mind]: costs [2] less if you control something Empowered. Deal 4 to a unit at a bf.

describe("Solari Sunhawk (ven-122-166)", () => {
  test("registry payload: activated {energy:2} empower-self gated 'not-empowered' + a while-empowered static giving +1 Might AND Deflect with value 2", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 3, might: 3, name: "Solari Sunhawk" });
    expect(def?.powerCost ?? []).toEqual([]);
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toMatchObject({
      cost: { energy: 2 },
      effect: { target: "self", type: "empower" },
      restrictions: [{ type: "not-empowered" }],
      type: "activated",
    });
    expect(JSON.stringify((abilities[0] as { cost?: unknown }).cost)).not.toContain("power");
    expect(abilities[1]).toMatchObject({ condition: { type: "while-empowered" }, type: "static" });
    const json = JSON.stringify(abilities[1]);
    expect(json).toContain('"modify-might"');
    expect(json).toContain('"amount":1');
    expect(json).toMatch(/"keyword":"Deflect"/);
    expect(json).toMatch(/"value":2/);
  });

  test("cost: 3 energy, no power — enters exhausted as a plain 3-Might unit with NO Deflect and not Empowered; 2 energy is short", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "hawk").build();
    await game.p1.play("hawk");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("hawk")).toMatchObject({ isEmpowered: false, isExhausted: true, might: 3, zone: "base" });
    expect(game.state("hawk").keywords).not.toContain("Deflect");
    expect((await scenario().resources(P1, { energy: 2, power: { order: 2 } }).hand(P1, CARD, "hawk").build()).p1.can("play", "hawk")).toBe(false);
  });

  test("[Empower] [2]: spends exactly 2 energy, is a NON-triggered chain item, and resolves into Empowered → 4 Might with Deflect 2 (works while exhausted)", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { order: 1 } }).unit(P1, "base", CARD, "hawk", { exhausted: true }).build();
    expect(game.p1.can("activate", "hawk")).toBe(true);
    await game.p1.activate("hawk");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hawk", controller: P1, triggered: false })]);
    expect(game.state("hawk").isEmpowered).toBe(false); // nothing happens before resolution
    await game.settle();
    expect(game.state("hawk")).toMatchObject({ baseMight: 3, isEmpowered: true, isExhausted: true, might: 4 });
    expect(game.state("hawk").grantedKeywords).toEqual([{ duration: "static", keyword: "Deflect", value: 2 }]);
    expect(game.p1.can("activate", "hawk")).toBe(false); // "Use only if not Empowered"
    expect(game.violations()).toEqual([]);
  });

  test("negative space — 1 energy (even with order power), already Empowered, the opponent's turn, or mid-showdown: [Empower] is not offered", async () => {
    expect((await scenario().resources(P1, { energy: 1, power: { order: 3 } }).unit(P1, "base", CARD, "hawk").build()).p1.can("activate", "hawk")).toBe(false);
    expect((await scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARD, "hawk", { empowered: true }).build()).p1.can("activate", "hawk")).toBe(false);
    expect((await scenario().active(P2).resources(P1, { energy: 2 }).unit(P1, "base", CARD, "hawk").build()).p1.can("activate", "hawk")).toBe(false);
    const sd = await scenario().resources(P1, { energy: 2 }).battlefield("bf1", { controller: null }).unit(P1, "base", { might: 2 }, "scout").unit(P1, "base", CARD, "hawk").build();
    await sd.p1.move("scout", "bf1"); // opens a showdown at bf1
    expect(sd.p1.can("activate", "hawk")).toBe(false);
  });

  test("Empowered persists: two turn-advances later she is still Empowered, 4 Might, Deflect 2, and [Empower] stays switched off", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARD, "hawk").build();
    await game.p1.activate("hawk");
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.tapRunes(2);
    expect(game.p1.energy()).toBe(2);
    expect(game.state("hawk")).toMatchObject({ isEmpowered: true, might: 4 });
    expect(game.state("hawk").keywords).toContain("Deflect");
    expect(game.p1.can("activate", "hawk")).toBe(false);
  });

  test("Deflect 2 taxes OPPONENTS' spells: Vengeance on the Empowered Sunhawk costs 4 + [order][order] + 2 power of ANY domain; on a plain one, nothing extra", async () => {
    const emp = await scenario()
      .active(P2)
      .resources(P2, { energy: 4, power: { fury: 3, order: 2 } })
      .unit(P1, "base", CARD, "hawk", { empowered: true })
      .hand(P2, VENGEANCE, "veng")
      .build();
    await emp.p2.cast("veng", { targets: "hawk" });
    expect(emp.p2.resources()).toEqual({ energy: 0, power: { fury: 1, order: 0 } });
    await emp.settle();
    expect(emp.zoneOf("hawk")).toBe("trash"); // Deflect is a tax, not protection
    const plain = await scenario()
      .active(P2)
      .resources(P2, { energy: 4, power: { fury: 3, order: 2 } })
      .unit(P1, "base", CARD, "hawk")
      .hand(P2, VENGEANCE, "veng")
      .build();
    await plain.p2.cast("veng", { targets: "hawk" });
    expect(plain.p2.resources()).toEqual({ energy: 0, power: { fury: 3, order: 0 } });
  });

  test("with fewer than 2 spare power the opponent cannot choose her at all — but a plain Sunhawk beside her is still fair game", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 4, power: { fury: 1, order: 2 } })
      .unit(P1, "base", CARD, "hawk", { empowered: true })
      .unit(P1, "base", CARD, "plain")
      .hand(P2, VENGEANCE, "veng")
      .build();
    const targets = game.p2.option("cast", "veng")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual([["plain"]]);
    expect((await game.p2.try((p) => p.cast("veng", { targets: "hawk" }))).ok).toBe(false);
    expect(game.zoneOf("veng")).toBe("hand");
    await game.p2.cast("veng", { targets: "plain" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 1, order: 0 } });
  });

  test("Deflect 2 taxes opponents' ABILITIES too: Iron Ballista's [Exhaust] at her battlefield spends 2 power; with none it is not even legal", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 0, power: { fury: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "hawk", { empowered: true })
      .gear(P2, BALLISTA, "ballista")
      .build();
    expect(game.p2.can("activate", "ballista")).toBe(true);
    await game.p2.activate("ballista");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("hawk");
      await game.settle();
    }
    expect(game.p2.power()).toBe(0);
    expect(game.state("hawk").damage).toBe(2);
    expect(game.zoneOf("hawk")).toBe("battlefield-bf1"); // 2 damage on a 4-Might unit is not lethal
    const broke = await scenario()
      .active(P2)
      .resources(P2, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "hawk", { empowered: true })
      .gear(P2, BALLISTA, "ballista")
      .build();
    expect(broke.p2.can("activate", "ballista")).toBe(false);
  });

  test("Deflect never taxes her OWN controller: P1's Discipline on the Empowered Sunhawk costs the bare 2 energy (4 → 6 this turn)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { calm: 2 } })
      .unit(P1, "base", CARD, "hawk", { empowered: true })
      .hand(P1, DISCIPLINE, "disc")
      .build();
    await game.p1.cast("disc", { targets: "hawk" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 2 } });
    await game.settle();
    expect(game.state("hawk").might).toBe(6);
    await game.advanceTurn();
    expect(game.state("hawk").might).toBe(4);
  });

  test("counter-play — Lacerate from the opponent: pays 2 + [order] + 2 Deflect, disempowers her (4 → 3, Deflect gone) and THEN the '3 or less' kill takes her", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { fury: 2, order: 1 } })
      .unit(P1, "base", CARD, "hawk", { empowered: true })
      .hand(P2, LACERATE, "lac")
      .build();
    expect(game.state("hawk").might).toBe(4); // out of Lacerate's kill range… until the disempower
    await game.p2.cast("lac", { targets: "hawk" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } });
    await game.settle();
    expect(game.zoneOf("hawk")).toBe("trash");
    // Same line with only 1 spare power: she cannot be chosen.
    const short = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { fury: 1, order: 1 } })
      .unit(P1, "base", CARD, "hawk", { empowered: true })
      .hand(P2, LACERATE, "lac")
      .build();
    expect(short.p2.can("cast", "lac")).toBe(false);
  });

  test("Empower is not a Reaction: targeted by Vengeance while plain, P1 gets priority but cannot Empower in response; she dies at 3 Might, untaxed", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 4, power: { order: 2 } })
      .resources(P1, { energy: 2 })
      .unit(P1, "base", CARD, "hawk")
      .hand(P2, VENGEANCE, "veng")
      .build();
    await game.p2.cast("veng", { targets: "hawk" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "hawk")).toBe(false);
    await game.settle();
    expect(game.zoneOf("hawk")).toBe("trash");
    expect(game.p1.energy()).toBe(2);
  });

  test("multi-step combat: play (3) → next own turn Empower (2) → the 4-Might Sunhawk attacks a 3-Might defender, kills it, survives with 3 damage and conquers", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Blocker" }, "blocker")
      .hand(P1, CARD, "hawk")
      .build();
    await game.p1.play("hawk");
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.tapRunes(2);
    await game.p1.activate("hawk");
    await game.settle();
    expect(game.state("hawk")).toMatchObject({ isEmpowered: true, isReady: true, might: 4 });
    await game.p1.move("hawk", "bf1");
    await game.settle();
    expect(game.zoneOf("blocker")).toBe("trash");
    expect(game.zoneOf("hawk")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    // A plain 3-Might Sunhawk would only have traded.
    const plain = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 3 }, "blocker").unit(P1, "base", CARD, "hawk").build();
    await plain.p1.move("hawk", "bf1");
    await plain.settle();
    expect(plain.zoneOf("hawk")).toBe("trash");
    expect(plain.p1.points()).toBe(0);
  });

  test("partner — Aurok General ('[Empowered] your units that are Empowered have +2'): Empowered General + Empowered Sunhawk = 6, but a PLAIN Sunhawk beside them stays 3", async () => {
    // Expected: hawk 3+1+2 = 6, plain 3 (not Empowered → no General bonus), General 5+2 = 7.
    // Actual: the General's bonus ignores the "that are [Empowered]" filter — the plain Sunhawk reads 5.
    const game = await scenario()
      .unit(P1, "base", AUROK_GENERAL, "general", { empowered: true })
      .unit(P1, "base", CARD, "hawk", { empowered: true })
      .unit(P1, "base", CARD, "plain")
      .build();
    expect(game.state("hawk").might).toBe(6);
    expect(game.state("general").might).toBe(7);
    expect(game.state("plain").might).toBe(3);
  });

  test("partner — Shock Blast 'costs [2] less if you control something that's [Empowered]': with an Empowered Sunhawk it is 1 + [mind]; with a plain one, the full 3 + [mind]", async () => {
    // Expected: 3 energy → 2 left after casting beside an Empowered Sunhawk. Actual: the discount is never applied (0 left).
    const emp = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5 }, "foe")
      .unit(P1, "base", CARD, "hawk", { empowered: true })
      .hand(P1, SHOCK_BLAST, "sb")
      .build();
    await emp.p1.cast("sb", { targets: "foe" });
    expect(emp.p1.resources()).toEqual({ energy: 2, power: { mind: 0 } });
    const plain = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5 }, "foe")
      .unit(P1, "base", CARD, "hawk")
      .hand(P1, SHOCK_BLAST, "sb")
      .build();
    await plain.p1.cast("sb", { targets: "foe" });
    expect(plain.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  });
});
