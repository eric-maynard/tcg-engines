/**
 * Grumpy Rockbear — ven-050-166 · Unit · Mind · 4 energy · 4 Might
 *
 *   [Empower] [12]. This ability costs [1] less for each rune you control.
 *     (Pay the cost: Empower me. Use only if not Empowered.)
 *   [Empowered][>] I have [Deflect] and [Shield 3]. (Opponents must pay [rainbow] to choose me with a
 *     spell or ability. +3 [Might] while I'm a defender.)
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. 827.1.c.3 — the cost text is part of the Empower ability: cost = 12 − (runes you control), read
 *     when the ability is played. Ready AND exhausted runes in your pool both count (control ≠ ready);
 *     a rune RECYCLED for power is gone and no longer discounts. 12 runes → free; 0 runes → the full 12.
 *  2. Interaction with paying: with N ready runes and no floating energy the cost is 12 − N but only N
 *     energy can be produced → self-sufficient only at N ≥ 6 (6 runes: cost 6, tap all six).
 *  3. [Shield 3] (814.1.c) is +3 Might only WHILE A DEFENDER: an Empowered Rockbear defends at 7 but
 *     attacks and idles at 4 — a 6-Might attacker dies to it and it lives; a 7 trades; when IT attacks
 *     a 5 it just dies.
 *  4. [Deflect] (809) taxes only OPPONENTS' choices, by [rainbow] = power of any domain; own spells are
 *     free. Un-empowered: no Deflect, no Shield — near-miss checks for both.
 *  5. Both keywords are while-Empowered statics (828.1.b.1): they appear the moment it is Empowered by
 *     ANY means (Sanction) and vanish when disempowered / when it leaves the board.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-050-166";
const VOID_SEEKER = "ogn-024-298"; // Action · 3 + [fury] · Deal 4 to a unit at a battlefield. Draw 1.
const DISCIPLINE = "ogn-058-298"; // Reaction · 2 · Give a unit +2 Might this turn. Draw 1.

function defending(empowered: boolean, attackerMight: number) {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", CARD, "bear", empowered ? { empowered: true } : undefined)
    .unit(P2, "base", { might: attackerMight, name: "Attacker" }, "atk");
}

describe("Grumpy Rockbear (ven-050-166)", () => {
  test("costs 4 energy (no power); enters base as an un-empowered 4-Might unit with neither Deflect nor Shield; 3 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "bear").build();
    await game.p1.play("bear");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("bear")).toBe("base");
    expect(game.state("bear")).toMatchObject({ isEmpowered: false, might: 4 });
    expect(game.state("bear").keywords).not.toContain("Deflect");
    expect(game.state("bear").keywords).not.toContain("Shield");
    expect((await scenario().resources(P1, { energy: 3, power: { mind: 2 } }).hand(P1, CARD, "bear").build()).p1.can("play", "bear")).toBe(false);
  });

  test("[Empowered] → has Deflect and Shield (3); still 4 Might outside combat (Shield only counts while defending)", async () => {
    const game = await scenario().unit(P1, "base", CARD, "bear", { empowered: true }).build();
    const s = game.state("bear");
    expect(s.isEmpowered).toBe(true);
    expect(s.keywords).toEqual(expect.arrayContaining(["Deflect", "Shield"]));
    expect(s.grantedKeywords).toEqual(expect.arrayContaining([expect.objectContaining({ keyword: "Shield", value: 3 })]));
    expect(s.might).toBe(4);
  });

  // 827.1.c.1/.3 — "[12 − runes you control]: Empower me". With 4 runes in the pool it costs 8.
  test("[Empower] [12] minus 1 per rune you control — with 4 runes it costs 8 and empowers on resolution", async () => {
    const game = await scenario().resources(P1, { energy: 12 }).runes(P1, "mind", 4, { exhausted: true }).unit(P1, "base", CARD, "bear").build();
    expect(game.p1.can("activate", "bear")).toBe(true);
    await game.p1.activate("bear");
    expect(game.p1.energy()).toBe(4); // exhausted runes still COUNT (controlled), they just cannot pay
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.state("bear")).toMatchObject({ isEmpowered: true, might: 4 });
    expect(game.state("bear").keywords).toEqual(expect.arrayContaining(["Deflect", "Shield"]));
  });

  test("with 12 runes the Empower cost is reduced to 0 — activatable with no energy at all", async () => {
    const game = await scenario().runes(P1, "mind", 12, { exhausted: true }).unit(P1, "base", CARD, "bear").build();
    expect(game.p1.can("activate", "bear")).toBe(true);
    await game.p1.activate("bear");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("bear").isEmpowered).toBe(true);
  });

  // BUG — expected (357.1.a): 6 READY runes → cost 12 − 6 = 6, payable by exhausting those same six
  // runes during Pay Costs, so the ability is legal with an empty pool. Actual: affordability compares
  // the REDUCED cost against floating energy only (or the unreduced 12 against pool + runes) → not offered.
  test.failing("BUG: 6 ready runes and nothing floating — cost 6 is exactly payable out of those runes", async () => {
    const game = await scenario().runes(P1, "mind", 6).unit(P1, "base", CARD, "bear").build();
    expect(game.p1.can("activate", "bear")).toBe(true);
  });

  test("negative space for the cost: 0 runes + 11 energy, or 5 ready runes + 1 floating (cost 7, only 6 producible) → not activatable; already Empowered → not activatable", async () => {
    const eleven = await scenario().resources(P1, { energy: 11 }).unit(P1, "base", CARD, "bear").build();
    expect(eleven.p1.can("activate", "bear")).toBe(false);
    const five = await scenario().resources(P1, { energy: 1 }).runes(P1, "mind", 5).unit(P1, "base", CARD, "bear").build();
    expect(five.p1.can("activate", "bear")).toBe(false);
    const done = await scenario().resources(P1, { energy: 12 }).unit(P1, "base", CARD, "bear", { empowered: true }).build();
    expect(done.p1.can("activate", "bear")).toBe(false);
  });

  test("[Shield 3] defending: an Empowered Rockbear (4+3 = 7 as defender) kills a 6-Might attacker and survives holding the battlefield", async () => {
    const game = await defending(true, 6).build();
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("bear")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("bear").might).toBe(4); // Shield stops applying once combat is over (814.1.d.1)
  });

  test("[Shield 3] boundary: a 7-Might attacker is exactly lethal through the shield — both die", async () => {
    const game = await defending(true, 7).build();
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("bear")).toBe("trash");
  });

  test("near-miss: NOT Empowered → no Shield; the same 6-Might attacker kills the 4-Might Rockbear and conquers", async () => {
    const game = await defending(false, 6).build();
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("bear")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("Shield is defender-only: an Empowered Rockbear ATTACKING a lone 5-Might unit fights at 4 and dies; the defender survives with 4 damage", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "bear", { empowered: true })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .build();
    await game.p1.move("bear", "bf1");
    await game.settle();
    expect(game.zoneOf("bear")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("[Deflect] while Empowered: an opponent with exactly 3 + [fury] cannot Void-Seeker it; with one spare power (any domain) they can, paying it, and 4 damage kills the 4-Might bear", async () => {
    const exact = await scenario().active(P2).resources(P2, { energy: 3, power: { fury: 1 } }).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "bear", { empowered: true }).hand(P2, VOID_SEEKER, "vs").build();
    expect(exact.p2.can("cast", "vs")).toBe(false);
    const spare = await scenario().active(P2).resources(P2, { energy: 3, power: { fury: 1, calm: 1 } }).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "bear", { empowered: true }).hand(P2, VOID_SEEKER, "vs").build();
    await spare.p2.cast("vs", { targets: "bear" });
    expect(spare.p2.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
    await spare.settle();
    expect(spare.zoneOf("bear")).toBe("trash"); // not a defender → no Shield against spell damage
  });

  test("near-miss: NOT Empowered → no Deflect; the opponent's exact 3 + [fury] Void Seeker is legal and kills it", async () => {
    const game = await scenario().active(P2).resources(P2, { energy: 3, power: { fury: 1 } }).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "bear").hand(P2, VOID_SEEKER, "vs").build();
    expect(game.p2.can("cast", "vs")).toBe(true);
    await game.p2.cast("vs", { targets: "bear" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("bear")).toBe("trash");
  });

  test("Deflect never taxes its controller: P1's own Discipline on the Empowered bear costs exactly 2 energy", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARD, "bear", { empowered: true }).hand(P1, DISCIPLINE, "disc").build();
    await game.p1.cast("disc", { targets: "bear" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("bear").might).toBe(6);
  });

  test("parsed abilities: while-empowered statics granting Deflect and Shield 3 are present", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 4, might: 4, name: "Grumpy Rockbear" });
    const statics = (def?.abilities ?? []).filter((a) => (a as { type?: string }).type === "static");
    expect(statics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ condition: { type: "while-empowered" }, effect: expect.objectContaining({ keyword: "Deflect", type: "grant-keyword" }) }),
        expect.objectContaining({ condition: { type: "while-empowered" }, effect: expect.objectContaining({ keyword: "Shield", type: "grant-keyword", value: 3 }) }),
      ]),
    );
  });

  test("parsed abilities include the [Empower] [12] activated ability with its per-rune cost reduction", async () => {
    const pool = await loadDefaultCardPool();
    const activated = (pool.get(CARD)?.abilities ?? []).filter((a) => (a as { type?: string }).type === "activated") as { cost?: { energy?: number }; effect?: { type?: string } }[];
    expect(activated).toHaveLength(1);
    expect(activated[0]).toMatchObject({ cost: { energy: 12 }, effect: { type: "empower" } });
    expect(JSON.stringify(activated[0])).toMatch(/rune/i);
  });
});
