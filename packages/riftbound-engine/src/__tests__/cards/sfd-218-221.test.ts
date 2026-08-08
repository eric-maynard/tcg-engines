/**
 * Sunken Temple — sfd-218-221 · Battlefield · no domain · no cost
 *
 *   When you conquer here with one or more [Mighty] units, you may pay [1] to draw 1.
 *   (A unit is Mighty while it has 5+ [Might].)
 *
 * Rules: 383.4.c / 471.2.a (conquer effects, only at the battlefield conquered), 469.2 (a hold
 * is not a conquer), 190.6.d ("you" = the Temple's controller = the conqueror), 706–710 (Mighty =
 * CURRENT Might ≥ 5 on the board: buffs and this-turn pumps count; damage never lowers Might),
 * 383.4.c.2 ("with … units" = units that took part in / are present for the conquer HERE, not
 * Mighty units you happen to control elsewhere), 355.10.c.1 / 205 ("pay [1] to draw 1" is a
 * cost-within-instruction: no energy → no draw, never a free card), 466.5.d–466.7 (the conquer and
 * its triggers happen before combat designations drop — see the Assault ruling file).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. Threshold on CURRENT Might: printed 5 yes, printed 4 no, printed 4 + buff yes; a 5-Might
 *     conqueror carrying 3 damage is still Mighty.
 *  2. "with": a Mighty unit parked in base (or at another battlefield) does not qualify a conquer
 *     made by a 3-Might unit; a Mighty attacker that DIES winning the fight is not there for the
 *     conquer either — the surviving small partner conquers "without" it.
 *  3. Mixed party: one Mighty + one small conqueror together → offered (one or more).
 *  4. Optional cost: decline keeps the energy; 0 energy → cannot accept; exactly [1] is taken.
 *  5. Hold with a Mighty unit → nothing; conquering elsewhere with a Mighty unit → nothing here.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-218-221";

/** P2 holds the Temple with a `def`-Might guard; P1 (with `energy`) attacks from base. */
function temple(opts: { energy?: number; def?: number } = {}) {
  return scenario()
    .resources(P1, { energy: opts.energy ?? 2 })
    .battlefield("temple", { controller: P2, def: CARD, inert: false, owner: P1 })
    .battlefield("other", { controller: null })
    .unit(P2, "temple", { might: opts.def ?? 2, name: "Temple Guard" }, "guard");
}

describe("Sunken Temple (sfd-218-221)", () => {
  test("registry payload: optional conquer-HERE trigger gated on ≥1 friendly Mighty unit here AND a pay-[1] cost, effect draw 1", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Sunken Temple" });
    expect(def?.abilities).toEqual([
      {
        condition: {
          conditions: [
            { count: 1, target: { controller: "friendly", filter: "mighty", location: "here", type: "unit" }, type: "has-at-least" },
            { cost: { energy: 1 }, type: "pay-cost" },
          ],
          type: "and",
        },
        effect: { amount: 1, type: "draw" },
        optional: true,
        trigger: { event: "conquer", on: { controller: "friendly", location: "here" } },
        type: "triggered",
      },
    ]);
  });

  test("a 5-Might conqueror: offer to P1 after the point is scored; yes → exactly [1] paid (2 → 1) and exactly 1 card drawn", async () => {
    const game = await temple().unit(P1, "base", { might: 5, name: "Colossus" }, "colossus").build();
    const deck0 = game.p1.deck().length;
    await game.p1.move("colossus", "temple");
    const r = await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.temple?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "temple" } });
    expect(game.p1.hand()).toHaveLength(0);
    await game.p1.yes();
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("negative space: a printed-4 conqueror (not Mighty) takes the Temple for 1 point with no offer, no draw, energy untouched", async () => {
    const game = await temple().unit(P1, "base", { might: 4, name: "Almost" }, "almost").build();
    await game.p1.move("almost", "temple");
    const r = await game.settle();
    expect(game.gameState.battlefields.temple?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(r.reason).toBe("open");
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("710 — Mighty is CURRENT Might: a printed-4 unit carrying a buff (5) qualifies", async () => {
    const game = await temple().unit(P1, "base", { might: 4, name: "Buffed" }, "buffedOne", { buffed: true }).build();
    expect(game.state("buffedOne").might).toBe(5);
    await game.p1.move("buffedOne", "temple");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.energy()).toBe(1);
  });

  test("damage never lowers Might: a 5-Might conqueror that took 3 from the guard (survives 3 < 5) is still Mighty → offered", async () => {
    const game = await temple({ def: 3 }).unit(P1, "base", { might: 5, name: "Colossus" }, "colossus").build();
    await game.p1.move("colossus", "temple");
    const r = await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("colossus")).toBe("temple");
    expect(game.state("colossus").might).toBe(5);
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  });

  test("declining keeps the energy and draws nothing", async () => {
    const game = await temple().unit(P1, "base", { might: 6, name: "Colossus" }, "colossus").build();
    await game.p1.move("colossus", "temple");
    await game.settle();
    await game.p1.no();
    await game.settle();
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("355.10.c.1 — with 0 energy the draw cannot be bought: no acceptable offer, and passing on it leaves hand and points as they were", async () => {
    const game = await temple({ energy: 0 }).unit(P1, "base", { might: 5, name: "Colossus" }, "colossus").build();
    await game.p1.move("colossus", "temple");
    const r = await game.settle();
    if (r.reason === "unanswered") {
      expect(game.decision()).toMatchObject({ canAccept: false, kind: "yes-no", seat: P1 });
      expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
      await game.p1.no();
      await game.settle();
    }
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("'one or more': a Mighty Colossus and a 1-Might Squire conquering together → offered once, one card for [1]", async () => {
    const game = await temple().unit(P1, "base", { might: 5, name: "Colossus" }, "colossus").unit(P1, "base", { might: 1, name: "Squire" }, "squire").build();
    await game.p1.move(["colossus", "squire"], "temple");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.chain().filter((i) => i.cardId === "temple")).toHaveLength(1);
    await game.p1.yes();
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.energy()).toBe(1);
    expect(game.decision()?.kind).toBe("action");
  });

  test("'with' (383.4.c.2) — a Mighty unit left in BASE does not qualify a conquer made by a 3-Might unit: no offer", async () => {
    const game = await temple().unit(P1, "base", { might: 3, name: "Scout" }, "scout").unit(P1, "base", { might: 7, name: "Idle Giant" }, "giant").build();
    await game.p1.move("scout", "temple");
    const r = await game.settle();
    expect(game.gameState.battlefields.temple?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(r.reason).toBe("open");
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.p1.energy()).toBe(2);
  });

  test("the Mighty attacker that DIES winning the combat is not there for the conquer: 5+1 into a 5-Might guard, the guard's 5 kills the Colossus, the Squire conquers alone → no offer", async () => {
    const game = await temple({ def: 5 }).unit(P1, "base", { might: 5, name: "Colossus" }, "colossus").unit(P1, "base", { might: 1, name: "Squire" }, "squire").build();
    game.script(P2, [(d) => (d.kind === "distribute" ? { allocation: { colossus: 5 }, kind: "distribute" } : undefined)]);
    await game.p1.move(["colossus", "squire"], "temple");
    const r = await game.settle();
    expect(game.zoneOf("guard")).toBe("trash"); // 6 ≥ 5
    expect(game.zoneOf("colossus")).toBe("trash");
    expect(game.locationOf("squire")).toBe("temple");
    expect(game.gameState.battlefields.temple?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(r.reason).toBe("open");
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("469.2 — HOLDING the Temple with a Mighty unit at the start of your turn: 1 point, no offer (hand +1 from the Draw phase only), energy untouched", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .resources(P1, { energy: 1 })
      .battlefield("temple", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "temple", { might: 6, name: "Colossus" }, "colossus")
      .build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("471.2.a 'here' — conquering a DIFFERENT battlefield with a Mighty unit while you control the Temple offers nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("temple", { controller: P1, def: CARD, inert: false, owner: P1 })
      .battlefield("other", { controller: null })
      .unit(P1, "temple", { might: 5, name: "Warden" }, "warden")
      .unit(P1, "base", { might: 6, name: "Colossus" }, "colossus")
      .build();
    await game.p1.move("colossus", "other");
    const r = await game.settle();
    expect(game.gameState.battlefields.other?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(r.reason).toBe("open");
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("190.6.d — the OPPONENT conquering the Temple card P1 owns with a Mighty unit: P2 is offered and pays from P2's pool; P1 is never asked", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .resources(P1, { energy: 3 })
      .battlefield("temple", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "temple", { might: 2, name: "Warden" }, "warden")
      .unit(P2, "base", { might: 5, name: "Behemoth" }, "behemoth")
      .build();
    await game.p2.move("behemoth", "temple");
    const r = await game.settle();
    expect(game.gameState.battlefields.temple?.controller).toBe(P2);
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
    await game.p2.yes();
    await game.settle();
    expect(game.p2.energy()).toBe(0);
    expect(game.p2.hand()).toHaveLength(1);
    expect(game.p1.energy()).toBe(3);
    expect(game.p1.hand()).toHaveLength(0);
  });
});
