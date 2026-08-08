/**
 * Serene Ascetic — ven-030-166 · Unit · Calm · 3 energy · 3 Might
 *
 *   [Empower] [3] ([3]: Empower me. Use only if not Empowered.)
 *   [Empowered][>] I have [Deflect] and [Shield 3]. (Opponents must pay [rainbow] to choose me with a
 *   spell or ability. +3 [Might] while I'm a defender.)
 *
 * Head-judge notes — the tricky spots for this card:
 *   1. 827/145.2 — Empower is an ACTIVATED ability of a unit: own turn, Main Phase, Neutral Open State
 *      only. You cannot "flash" Shield 3 in when attacked (no activation in a showdown / on P2's turn).
 *   2. 827.1.c.1 — "Use only if not Empowered": once Empowered the ability is no longer legal, even
 *      with energy to spare; 441.1.a Empowered is binary and PERSISTS across turns (not "this turn").
 *   3. 814.1.c — Shield 3 is defender-only real Might: 6 while defending (takes AND deals 6), plain 3
 *      when attacking or sitting in base — even while Empowered.
 *   4. 809 — Deflect taxes only OPPONENTS' choices, by 1 power of ANY domain (mandatory additional cost,
 *      356.2.a.2): no spare power → she is simply not a legal choice; her controller targets her free.
 *   5. Not Empowered → neither keyword: free enemy target, trades evenly with a 3 as a defender.
 *   6. Natural partner: Guttural Roar (ven-072) reads her Empowered status — covered in that file.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-030-166";
const CLEAVE = "ogn-004-298"; // Fury Action, 1 energy: "Give a unit [Assault 3] this turn." — cheap targeted spell

const cleaveTargets = (seat: { option: (v: string, c?: string) => { fields: readonly { arg: string; options?: readonly unknown[] }[] } | undefined }) =>
  (seat.option("cast", "cleave")?.fields.find((f) => f.arg === "targets")?.options ?? []).map((o) => (Array.isArray(o) ? o[0] : o));

/** P2 to act with a `might` raider in base; P1 holds bf1 with the Ascetic (optionally already Empowered). */
function siege(might: number, empowered: boolean) {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", CARD, "asc", empowered ? { empowered: true } : undefined)
    .unit(P2, "base", { might, name: "Raider" }, "raider");
}

describe("Serene Ascetic (ven-030-166)", () => {
  test("costs 3 energy; enters the base exhausted as a plain 3-Might Calm unit — NOT Empowered, no Deflect, no Shield; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "asc").build();
    await game.p1.play("asc");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("asc")).toMatchObject({ baseMight: 3, domains: ["calm"], isEmpowered: false, isExhausted: true, might: 3, zone: "base" });
    expect(game.state("asc").keywords).not.toContain("Deflect");
    expect(game.state("asc").keywords).not.toContain("Shield");
    expect((await scenario().resources(P1, { energy: 2, power: { calm: 3 } }).hand(P1, CARD, "a").build()).p1.can("play", "a")).toBe(false);
  });

  test("[Empower] [3]: pays exactly 3 energy, uses the chain, and on resolution she is Empowered with Deflect + Shield showing (Might in base still 3)", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).unit(P1, "base", CARD, "asc").build();
    expect(game.p1.can("activate", "asc")).toBe(true);
    await game.p1.activate("asc");
    expect(game.p1.energy()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "asc", controller: P1 })]);
    expect(game.state("asc").isEmpowered).toBe(false); // not until it resolves
    await game.settle();
    expect(game.state("asc")).toMatchObject({ isEmpowered: true, isExhausted: false, might: 3 }); // no exhaust in the cost; Shield is defender-only
    expect(game.state("asc").keywords).toEqual(expect.arrayContaining(["Deflect", "Shield"]));
  });

  test("Empower is unaffordable at 2 energy (power does not substitute), and 'use only if not Empowered' removes it once she is Empowered", async () => {
    const poor = await scenario().resources(P1, { energy: 2, power: { calm: 5 } }).unit(P1, "base", CARD, "asc").build();
    expect(poor.p1.can("activate", "asc")).toBe(false);
    const done = await scenario().resources(P1, { energy: 6 }).unit(P1, "base", CARD, "asc", { empowered: true }).build();
    expect(done.state("asc").isEmpowered).toBe(true);
    expect(done.p1.can("activate", "asc")).toBe(false);
    expect((await done.p1.try((p) => p.activate("asc", 0))).ok).toBe(false);
    expect(done.p1.energy()).toBe(6);
  });

  test("145.2 timing — no flashing it in: on P2's turn, before and during P2's attack showdown (even holding Focus), P1 cannot activate Empower", async () => {
    const game = await siege(4, false).resources(P1, { energy: 3 }).build();
    expect(game.p1.can("activate", "asc")).toBe(false); // P2's neutral open state
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "asc")).toBe(false); // showdown: spells only
    await game.settle();
    expect(game.zoneOf("asc")).toBe("trash"); // un-Empowered 3 vs 4
    expect(game.p1.energy()).toBe(3);
  });

  test("also not during a showdown on her OWN turn: P1 attacks with a Pal, holds Focus, still cannot Empower the Ascetic back in base", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1 }, "def")
      .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
      .unit(P1, "base", CARD, "asc")
      .build();
    expect(game.p1.can("activate", "asc")).toBe(true);
    await game.p1.move("pal", "bf1");
    expect(game.p1.can("activate", "asc")).toBe(false);
  });

  test("[Empowered] Shield 3 defending: she is 6 for the combat — a 5-Might raider is one short and dies to the 6 back; she heals and P1 keeps bf1; un-Empowered the same raider kills her", async () => {
    const game = await siege(5, true).build();
    expect(game.state("asc").might).toBe(3);
    await game.p2.move("raider", "bf1");
    expect(game.state("asc")).toMatchObject({ combatRole: "defender", might: 6 });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.state("asc")).toMatchObject({ combatRole: null, damage: 0, might: 3, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);

    const plain = await siege(5, false).build();
    await plain.p2.move("raider", "bf1");
    expect(plain.state("asc").might).toBe(3);
    await plain.settle();
    expect(plain.zoneOf("asc")).toBe("trash");
    expect(plain.locationOf("raider")).toBe("bf1");
    expect(plain.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("exactly-lethal edges while Empowered: a 6-Might raider trades (both die, bf1 uncontrolled); a 7 survives and conquers", async () => {
    const six = await siege(6, true).build();
    await six.p2.move("raider", "bf1");
    await six.settle();
    expect(six.zoneOf("asc")).toBe("trash");
    expect(six.zoneOf("raider")).toBe("trash");
    expect(six.gameState.battlefields.bf1?.controller).toBeNull();

    const seven = await siege(7, true).build();
    await seven.p2.move("raider", "bf1");
    await seven.settle();
    expect(seven.zoneOf("asc")).toBe("trash");
    expect(seven.locationOf("raider")).toBe("bf1");
    expect(seven.p2.points()).toBe(1);
  });

  test("Shield is OFF while attacking, Empowered or not: into a 3-Might defender both die; into a 4 only she dies", async () => {
    const trade = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "asc", { empowered: true }).unit(P2, "bf1", { might: 3 }, "def").build();
    await trade.p1.move("asc", "bf1");
    expect(trade.state("asc")).toMatchObject({ combatRole: "attacker", isEmpowered: true, might: 3 });
    await trade.settle();
    expect(trade.zoneOf("asc")).toBe("trash");
    expect(trade.zoneOf("def")).toBe("trash");

    const wall = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "asc", { empowered: true }).unit(P2, "bf1", { might: 4 }, "def").build();
    await wall.p1.move("asc", "bf1");
    await wall.settle();
    expect(wall.zoneOf("asc")).toBe("trash");
    expect(wall.zoneOf("def")).toBe("battlefield-bf1");
  });

  test("[Empowered] Deflect: P2's Cleave cannot choose her without a spare power; with 1 power of ANY domain it can, and that power is spent on top of the 1 energy", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", CARD, "asc", { empowered: true })
      .unit(P2, "base", { might: 2 }, "theirs")
      .hand(P2, CLEAVE, "cleave")
      .build();
    expect(cleaveTargets(game.p2)).toEqual(["theirs"]);
    expect((await game.p2.try((p) => p.cast("cleave", { targets: "asc" }))).ok).toBe(false);
    await game.p2.do("addResources", { power: { mind: 1 } });
    expect(new Set(cleaveTargets(game.p2))).toEqual(new Set(["theirs", "asc"]));
    await game.p2.cast("cleave", { targets: "asc" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.state("asc").keywords).toContain("Assault");
  });

  test("un-Empowered she has no Deflect (free enemy target), and Deflect never taxes her OWN controller's spells", async () => {
    const free = await scenario().active(P2).resources(P2, { energy: 1 }).unit(P1, "base", CARD, "asc").hand(P2, CLEAVE, "cleave").build();
    expect(cleaveTargets(free.p2)).toEqual(["asc"]);
    await free.p2.cast("cleave", { targets: "asc" });
    expect(free.p2.resources()).toEqual({ energy: 0, power: {} });

    const own = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", CARD, "asc", { empowered: true }).hand(P1, CLEAVE, "cleave").build();
    await own.p1.cast("cleave", { targets: "asc" });
    expect(own.p1.resources()).toEqual({ energy: 0, power: {} });
    await own.settle();
    expect(own.state("asc").keywords).toEqual(expect.arrayContaining(["Assault", "Deflect", "Shield"]));
  });

  test("full line: Empower on P1's turn → still Empowered on P2's turn (441.1.a persists) → P2's 5-Might raider bounces off Shield 3; and it is still on a turn later", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "asc")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .build();
    await game.p1.activate("asc");
    await game.settle();
    expect(game.state("asc").isEmpowered).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("asc")).toMatchObject({ isEmpowered: true });
    expect(game.state("asc").keywords).toEqual(expect.arrayContaining(["Deflect", "Shield"]));
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("asc")).toBe("battlefield-bf1");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("asc").isEmpowered).toBe(true);
    expect(game.p1.can("activate", "asc")).toBe(false); // still "only if not Empowered"
    expect(game.violations()).toEqual([]);
  });

  test("registry payload: [3]-cost self-Empower with a not-empowered restriction, plus two while-empowered statics granting Deflect and Shield 3, on a 3/3 Calm non-champion", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 3, might: 3, name: "Serene Ascetic" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.isChampion ?? false).toBe(false);
    expect(def?.abilities).toEqual([
      { cost: { energy: 3 }, effect: { target: "self", type: "empower" }, restrictions: [{ type: "not-empowered" }], type: "activated" },
      { condition: { type: "while-empowered" }, effect: { keyword: "Deflect", target: { type: "self" }, type: "grant-keyword" }, type: "static" },
      { condition: { type: "while-empowered" }, effect: { keyword: "Shield", target: { type: "self" }, type: "grant-keyword", value: 3 }, type: "static" },
    ]);
  });
});
