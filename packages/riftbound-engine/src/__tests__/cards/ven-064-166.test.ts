/**
 * Plaza Guardian — ven-064-166 · Unit · Mind · 10 energy · 8 Might
 *
 *   I cost [1] less for each gear you control.
 *   [Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. The discount is a self static read when the cost is determined (356.4): 10 − (gear YOU CONTROL
 *     right now). Enemy gear never counts; control, not ownership, is what matters (108.2). It cannot
 *     take the cost below 0 (11 gear → free, not a refund).
 *  2. 0 gear → the full 10; exactly-affordable vs one-short boundaries at each count.
 *  3. [Deflect] (809) is printed, so it is on from the moment he lands: opponents' spells AND activated
 *     abilities that choose him cost 1 power (any domain) more per choice; his controller's are free.
 *     With the surcharge unpayable he is simply not a legal choice.
 *  4. 8 Might body: a Void Seeker (4) through Deflect leaves him on 4 damage, alive; the damage heals
 *     at end of turn.
 *  5. Natural partners: cheap Mind gear (Seal of Insight 0, Orb of Regret 1) both feed the discount;
 *     Orb of Regret in ENEMY hands is also the cleanest "ability vs Deflect" check.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-064-166";
const SEAL = "ogn-120-298"; // Seal of Insight · gear · 0 · mind
const ORB = "ogn-090-298"; // Orb of Regret · gear · 1 · mind · [Exhaust]: Give a unit -1 Might this turn (min 1).
const VOID_SEEKER = "ogn-024-298"; // Action · 3 + [fury] · Deal 4 to a unit at a battlefield. Draw 1.
const DISCIPLINE = "ogn-058-298"; // Reaction · 2 · Give a unit +2 Might this turn. Draw 1.

function withGear(mine: number, theirs = 0, energy = 10) {
  const b = scenario().resources(P1, { energy }).hand(P1, CARD, "pg");
  for (let i = 0; i < mine; i++) {
    b.gear(P1, i % 2 === 0 ? SEAL : ORB, `g${i}`);
  }
  for (let i = 0; i < theirs; i++) {
    b.gear(P2, SEAL, `e${i}`);
  }
  return b;
}

describe("Plaza Guardian (ven-064-166)", () => {
  test("no gear: costs the full 10 energy (no power); lands in base as an 8-Might unit with printed Deflect; 9 energy is one short", async () => {
    const game = await withGear(0).build();
    await game.p1.play("pg");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("pg")).toBe("base");
    expect(game.state("pg")).toMatchObject({ baseMight: 8, might: 8 });
    expect(game.state("pg").keywords).toContain("Deflect");
    expect((await withGear(0, 0, 9).resources(P1, { power: { mind: 3 } }).build()).p1.can("play", "pg")).toBe(false);
  });

  // BUG — expected (356.4): two gear you control → cost 8; with exactly 8 energy the play is legal and
  // empties the pool. Actual: the "for each gear you control" scope is not evaluated, cost stays 10.
  test("'I cost [1] less for each gear you control' — 2 gear → playable for exactly 8", async () => {
    const game = await withGear(2, 0, 8).build();
    expect(game.p1.can("play", "pg")).toBe(true);
    await game.p1.play("pg");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("pg")).toBe("base");
  });

  // BUG — same root cause. Expected: with 10 energy and 3 gear only 7 is charged (3 left over).
  test("3 gear and 10 energy — only 7 is deducted", async () => {
    const game = await withGear(3, 0, 10).build();
    await game.p1.play("pg");
    expect(game.p1.energy()).toBe(3);
  });

  test("one short even after the discount: 2 gear (cost 8) with 7 energy → not playable", async () => {
    const game = await withGear(2, 0, 7).build();
    expect(game.p1.can("play", "pg")).toBe(false);
  });

  // BUG — same root cause. Expected: enemy gear is not "gear you control": 1 own + 3 enemy → cost 9.
  test("enemy gear does not count — 1 own gear + 3 enemy gear → costs 9 (playable at 9, 0 left)", async () => {
    const nine = await withGear(1, 3, 9).build();
    expect(nine.p1.can("play", "pg")).toBe(true);
    await nine.p1.play("pg");
    expect(nine.p1.energy()).toBe(0);
  });

  test("negative space: 1 own + 3 enemy gear with only 8 energy → not playable (the enemy gear must not help)", async () => {
    const eight = await withGear(1, 3, 8).build();
    expect(eight.p1.can("play", "pg")).toBe(false);
  });

  // BUG — same root cause. Expected: 10 gear → free; 11 gear → still free, never a refund.
  test("10 gear → costs 0 (playable with an empty pool); 11 gear → still 0, energy never goes up", async () => {
    const ten = await withGear(10, 0, 0).build();
    expect(ten.p1.can("play", "pg")).toBe(true);
    const eleven = await withGear(11, 0, 1).build();
    await eleven.p1.play("pg");
    expect(eleven.p1.energy()).toBe(1);
  });

  test("[Deflect] vs an opponent's spell: exact 3 + [fury] cannot Void-Seeker him; one spare power of any domain can, is spent, and 4 damage leaves the 8-Might Guardian alive (healed next turn)", async () => {
    const base = () => scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "pg").hand(P2, VOID_SEEKER, "vs");
    const exact = await base().resources(P2, { energy: 3, power: { fury: 1 } }).build();
    expect(exact.p2.can("cast", "vs")).toBe(false);
    const spare = await base().resources(P2, { energy: 3, power: { fury: 1, order: 1 } }).build();
    await spare.p2.cast("vs", { targets: "pg" });
    expect(spare.p2.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } });
    await spare.settle();
    expect(spare.zoneOf("pg")).toBe("battlefield-bf1");
    expect(spare.state("pg").damage).toBe(4);
    await spare.advanceTurn();
    expect(spare.state("pg").damage).toBe(0);
  });

  test("[Deflect] never taxes his controller: P1's Discipline on him costs exactly 2 and makes him 10 for the turn", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARD, "pg").hand(P1, DISCIPLINE, "disc").build();
    await game.p1.cast("disc", { targets: "pg" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("pg").might).toBe(10);
    await game.advanceTurn();
    expect(game.state("pg").might).toBe(8);
  });

  test("[Deflect] vs an opponent's ACTIVATED ability (809.1.c 'spells and abilities'): P2's Orb of Regret with no power cannot shrink him; with 1 power it can (8 → 7) and the power is spent", async () => {
    const mk = (power: Record<string, number>) =>
      scenario().active(P2).resources(P2, { energy: 0, power }).unit(P1, "base", CARD, "pg").unit(P2, "base", { might: 3 }, "own").gear(P2, ORB, "orb").build();
    const targetsOf = (g: Awaited<ReturnType<typeof mk>>) => g.p2.option("activate", "orb")?.fields.find((f) => f.arg === "targets")?.options;
    const broke = await mk({});
    expect(targetsOf(broke)).toEqual([["own"]]); // the Guardian is not a legal choice without the surcharge
    const t = await broke.p2.try((p) => p.activate("orb", 0, { targets: ["pg"] }));
    expect(t.ok).toBe(false);
    expect(broke.state("pg").might).toBe(8);
    const rich = await mk({ chaos: 1 });
    expect(targetsOf(rich)).toEqual(expect.arrayContaining([["own"], ["pg"]]));
    await rich.p2.activate("orb", 0, { targets: ["pg"] });
    await rich.settle();
    if (rich.decision()?.kind === "pick") {
      await rich.p2.pick("pg");
      await rich.settle();
    }
    expect(rich.state("pg").might).toBe(7);
    expect(rich.p2.power()).toBe(0);
  });

  test("parsed abilities: a self cost-reduction static scoped 'for each gear you control' (1 energy each) + printed Deflect 1", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 10, might: 8, name: "Plaza Guardian" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { scope: "for each gear you control", target: "self", type: "cost-reduction" },
      type: "static",
    });
    const reduction = (def?.abilities?.[0] as { effect: { reduction?: unknown; amount?: unknown } }).effect;
    expect(JSON.stringify(reduction)).toMatch(/energy_1|"amount":1|"energy":1/);
    expect(def?.abilities?.[1]).toMatchObject({ keyword: "Deflect", type: "keyword", value: 1 });
  });
});
