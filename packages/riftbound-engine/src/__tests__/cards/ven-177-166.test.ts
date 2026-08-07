/**
 * Renekton, Brute — ven-177-166 · Champion Unit (Renekton) · Body · 5 energy · 4 Might
 *
 *   [1]: Give me +1 [Might] this turn.
 *   When my Might becomes 10 or more, empower me.
 *   [Empowered][>] I have [Ganking] and [Deflect].
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. The pump has NO once-per-turn text: 1 energy per +1, as many times as you can pay, each use its
 *     own chain item; all of it is "this turn" and falls off at end of turn.
 *  2. "When my Might BECOMES 10 or more" is a threshold-crossing trigger on his EFFECTIVE Might from
 *     any source (six pumps, one Onslaught +6, …): 4 → 9 does nothing; 4 → 10 (exactly) or 9 → 11
 *     empowers. Empowered is a status (441.1.a) — it persists after the pumps expire next turn.
 *  3. 828.1.c — Ganking and Deflect exist ONLY while Empowered: an un-empowered Renekton cannot move
 *     battlefield → battlefield and is targeted for free; an Empowered one ganks and taxes opponents a
 *     [rainbow] (any power) to choose him — his own controller is never taxed.
 *  4. Cost sanity: 5 energy flat to play; the pump is exactly [1] energy (no power) and is not
 *     offered at 0 energy.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-177-166";
const ONSLAUGHT = "ven-081-166"; // Spell · 4 · Give a unit +6 Might this turn.
const VOID_SEEKER = "ogn-024-298"; // Action · 3 + [fury] · Deal 4 to a unit at a battlefield. Draw 1.

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

async function pump(game: Game, times: number) {
  for (let i = 0; i < times; i++) {
    await game.p1.activate("rene");
    await game.settle();
  }
}

describe("Renekton, Brute (ven-177-166)", () => {
  test("costs 5 energy (no power): a 4-Might un-empowered champion unit with neither Ganking nor Deflect; 4 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "rene").build();
    await game.p1.play("rene");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("rene")).toBe("base");
    expect(game.state("rene")).toMatchObject({ baseMight: 4, isEmpowered: false, might: 4 });
    expect(game.state("rene").keywords).not.toContain("Ganking");
    expect(game.state("rene").keywords).not.toContain("Deflect");
    const poor = await scenario().resources(P1, { energy: 4, power: { body: 3 } }).hand(P1, CARD, "rene").build();
    expect(poor.p1.can("play", "rene")).toBe(false);
  });

  test("[1]: pays exactly 1 energy, goes on the chain, +1 Might on resolution; repeatable (three uses → 7); all gone next turn", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).unit(P1, "base", CARD, "rene").build();
    await game.p1.activate("rene");
    expect(game.p1.resources()).toEqual({ energy: 2, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rene", controller: P1, triggered: false })]);
    expect(game.state("rene").might).toBe(4);
    await game.settle();
    expect(game.state("rene").might).toBe(5);
    await pump(game, 2);
    expect(game.state("rene").might).toBe(7);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("activate", "rene")).toBe(false); // nothing left to pay with
    await game.advanceTurn();
    expect(game.state("rene").might).toBe(4);
  });

  test("pump cost negative space: 0 energy (even with plenty of power) → not offered; the pump does not exhaust him", async () => {
    const broke = await scenario().resources(P1, { energy: 0, power: { body: 5 } }).unit(P1, "base", CARD, "rene").build();
    expect(broke.p1.can("activate", "rene")).toBe(false);
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", CARD, "rene").build();
    await pump(game, 1);
    expect(game.state("rene")).toMatchObject({ isExhausted: false, might: 5 });
  });

  // BUG — expected (441 / printed trigger): the sixth pump takes him 9 → 10, "my Might becomes 10 or
  // more" triggers and he becomes Empowered (gaining Ganking + Deflect); at 9 he was still not.
  // Actual: the "When my Might becomes 10 or more, empower me" line was dropped by the parser — no
  // trigger exists, he is never Empowered.
  test("six pumps (4 → 10) — not Empowered at 9, Empowered with Ganking + Deflect at exactly 10", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).unit(P1, "base", CARD, "rene").build();
    await pump(game, 5);
    expect(game.state("rene")).toMatchObject({ isEmpowered: false, might: 9 });
    await pump(game, 1);
    expect(game.state("rene").might).toBe(10);
    expect(game.state("rene").isEmpowered).toBe(true);
    expect(game.state("rene").keywords).toEqual(expect.arrayContaining(["Ganking", "Deflect"]));
  });

  // BUG — expected: a single Onslaught (+6) takes him 4 → 10 in one step → Empowered; and Empowered is
  // a status, so next turn when the +6 expires (back to 4) he is STILL Empowered with both keywords.
  // Actual: no threshold trigger.
  test("Onslaught 4 → 10 in one jump empowers him, and he stays Empowered after the Might falls back to 4 next turn", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).unit(P1, "base", CARD, "rene").hand(P1, ONSLAUGHT, "ons").build();
    await game.p1.cast("ons", { targets: "rene" });
    await game.settle();
    expect(game.state("rene").might).toBe(10);
    expect(game.state("rene").isEmpowered).toBe(true);
    await game.advanceTurn();
    expect(game.state("rene")).toMatchObject({ isEmpowered: true, might: 4 });
    expect(game.state("rene").keywords).toEqual(expect.arrayContaining(["Ganking", "Deflect"]));
  });

  // BUG — expected: "10 or MORE" — 9 (five pumps) then Onslaught → 15 crosses the threshold without
  // ever being exactly 10 → Empowered. Actual: no trigger.
  test("skipping past 10 (9 → 15) still counts as 'becomes 10 or more'", async () => {
    const game = await scenario().resources(P1, { energy: 9 }).unit(P1, "base", CARD, "rene").hand(P1, ONSLAUGHT, "ons").build();
    await pump(game, 5);
    await game.p1.cast("ons", { targets: "rene" });
    await game.settle();
    expect(game.state("rene")).toMatchObject({ isEmpowered: true, might: 15 });
  });

  test("near-miss: Onslaught on a fresh Renekton's neighbour, or pumps stopping at 9, leave him un-empowered without keywords", async () => {
    const game = await scenario().resources(P1, { energy: 9 }).unit(P1, "base", CARD, "rene").unit(P1, "base", { might: 4 }, "other").hand(P1, ONSLAUGHT, "ons").build();
    await game.p1.cast("ons", { targets: "other" });
    await game.settle();
    expect(game.state("other").might).toBe(10);
    await pump(game, 5);
    expect(game.state("rene")).toMatchObject({ isEmpowered: false, might: 9 });
    expect(game.state("rene").keywords).not.toContain("Ganking");
    expect(game.state("rene").keywords).not.toContain("Deflect");
  });

  test("[Empowered] → I have Ganking and Deflect (static, condition-bound grants); Might itself is unchanged", async () => {
    const game = await scenario().unit(P1, "base", CARD, "rene", { empowered: true }).build();
    const s = game.state("rene");
    expect(s.isEmpowered).toBe(true);
    expect(s.keywords).toEqual(expect.arrayContaining(["Ganking", "Deflect"]));
    expect(s.might).toBe(4);
  });

  test("Ganking only while Empowered: the Empowered one may move bf1 → bf2 (exhausting, conquering the empty bf2); the plain one may not", async () => {
    const emp = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CARD, "rene", { empowered: true })
      .build();
    expect(emp.p1.can("gank", "rene")).toBe(true);
    await emp.p1.gank("rene", "bf2");
    await emp.settle();
    expect(emp.locationOf("rene")).toBe("bf2");
    expect(emp.state("rene").isExhausted).toBe(true);
    expect(emp.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(emp.p1.points()).toBe(1);

    const plain = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CARD, "rene")
      .build();
    expect(plain.p1.can("gank", "rene")).toBe(false);
    const r = await plain.p1.try((p) => p.gank("rene", "bf2"));
    expect(r.ok).toBe(false);
    expect(plain.locationOf("rene")).toBe("bf1");
  });

  test("Deflect only while Empowered: the opponent's exact-cost Void Seeker cannot choose the Empowered one; with a spare power it can (paying it) and 4 damage kills him", async () => {
    const exact = await scenario().active(P2).resources(P2, { energy: 3, power: { fury: 1 } }).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "rene", { empowered: true }).hand(P2, VOID_SEEKER, "vs").build();
    expect(exact.p2.can("cast", "vs")).toBe(false);
    const spare = await scenario().active(P2).resources(P2, { energy: 3, power: { fury: 1, mind: 1 } }).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "rene", { empowered: true }).hand(P2, VOID_SEEKER, "vs").build();
    await spare.p2.cast("vs", { targets: "rene" });
    expect(spare.p2.resources()).toEqual({ energy: 0, power: { fury: 0, mind: 0 } });
    await spare.settle();
    expect(spare.zoneOf("rene")).toBe("trash");
  });

  test("near-miss: NOT Empowered → no Deflect; the exact 3 + [fury] Void Seeker is legal and kills the 4-Might Renekton", async () => {
    const game = await scenario().active(P2).resources(P2, { energy: 3, power: { fury: 1 } }).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "rene").hand(P2, VOID_SEEKER, "vs").build();
    expect(game.p2.can("cast", "vs")).toBe(true);
    await game.p2.cast("vs", { targets: "rene" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("rene")).toBe("trash");
  });

  test("Deflect never taxes his controller: P1's own Onslaught on the Empowered Renekton costs exactly 4 energy", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).unit(P1, "base", CARD, "rene", { empowered: true }).hand(P1, ONSLAUGHT, "ons").build();
    await game.p1.cast("ons", { targets: "rene" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("rene").might).toBe(10);
  });

  test("parsed abilities: the [1] pump (activated, +1 self, turn) and two while-empowered statics granting Ganking and Deflect", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 5, isChampion: true, might: 4, name: "Renekton, Brute", tags: ["Renekton"] });
    expect(def?.powerCost ?? []).toEqual([]);
    const abilities = (def?.abilities ?? []) as { type: string; condition?: unknown; effect?: unknown; cost?: unknown }[];
    expect(abilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cost: { energy: 1 }, effect: { amount: 1, duration: "turn", target: "self", type: "modify-might" }, type: "activated" }),
        expect.objectContaining({ condition: { type: "while-empowered" }, effect: expect.objectContaining({ keyword: "Ganking", type: "grant-keyword" }), type: "static" }),
        expect.objectContaining({ condition: { type: "while-empowered" }, effect: expect.objectContaining({ keyword: "Deflect", type: "grant-keyword" }), type: "static" }),
      ]),
    );
  });

  // BUG — expected: a fourth ability — a self trigger on Might reaching 10+ whose effect empowers him.
  // Actual: only 3 abilities; the middle line of the card produced nothing.
  test("the 'When my Might becomes 10 or more, empower me' line is parsed into a triggered empower-self ability", async () => {
    const abilities = ((await loadDefaultCardPool()).get(CARD)?.abilities ?? []) as { type: string; effect?: { type?: string } }[];
    expect(abilities).toHaveLength(4);
    const trig = abilities.find((a) => a.type === "triggered");
    expect(trig).toBeDefined();
    expect(trig?.effect).toMatchObject({ type: "empower" });
    expect(JSON.stringify(trig)).toContain("10");
  });
});
