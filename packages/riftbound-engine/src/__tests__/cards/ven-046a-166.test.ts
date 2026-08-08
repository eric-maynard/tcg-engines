/**
 * Nasus, Ascended — ven-046a-166 · Champion Unit (Nasus) · Calm · 8 energy + [calm] · 8 Might
 *
 *   [Deflect 2]
 *   [Empower] [8]
 *   [Empowered][>] When I conquer, you score 1 point.
 *
 * Head-judge checklist for this card:
 *  - Deflect 2 (809): a MANDATORY additional cost of 2 power of ANY domain(s) on OPPONENTS' spells and
 *    abilities that choose him; his controller targets him for free (e.g. with Sanction).
 *  - Empower [8] (827): activated, uses the chain, your turn / Open state only, "only if not
 *    Empowered". Empowered has no duration of its own.
 *  - The conquer trigger is a DEPENDENT ability (828.1.c): it exists only while he is Empowered at the
 *    moment he conquers. Not Empowered → just the ordinary conquer point. It is "When I conquer": a
 *    different friendly unit conquering, or Nasus HOLDING, gives nothing extra.
 *  - Getting Empowered mid-showdown at Reaction speed (Sanction, ven-035-166: "Empower a unit.
 *    Disempower it at end of turn.") before control is established is good enough — and Sanction's
 *    end-of-turn disempower then switches the trigger off again.
 *  - Final Point (471.1.b): at 7/8 with two battlefields the CONQUER point becomes a card draw, but
 *    "you score 1 point" is not a Conquer point (471.1.a.1) and the Conquer trigger still fires when the
 *    point is replaced (383.4.c.2.c) → Nasus wins the game anyway.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-046a-166";
const SANCTION = "ven-035-166"; // Calm [Reaction] 3+[calm]: mode 0 = Empower a unit, disempower it at end of turn
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Bolt",
  rulesText: "[Action] Deal 3 to a unit.",
  timing: "action",
} as const;

/** P1's turn; Nasus in base (optionally Empowered); P2 holds bf1 (optionally with a defender) and bf2. */
function board(opts: { empowered?: boolean; defender?: number } = {}) {
  const b = scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", CARD, "nasus", opts.empowered ? { empowered: true } : undefined);
  return opts.defender ? b.unit(P2, "bf1", { might: opts.defender, name: "Defender" }, "def") : b;
}

const boltTargets = (game: Game) => game.p2.option("cast", "bolt")?.fields.find((f) => f.arg === "targets")?.options;

describe("Nasus, Ascended (ven-046a-166)", () => {
  test("registry payload: Deflect 2 keyword, [Empower][8] activation, and an Empowered-gated 'When I conquer → score 1' trigger", async () => {
    const game = await scenario().hand(P1, CARD, "nasus").build();
    expect(game.state("nasus")).toMatchObject({ baseMight: 8, cardType: "unit", energyCost: 8, name: "Nasus, Ascended", powerCost: ["calm"] });
    expect(peekDefaultCardPool()?.get(CARD)?.abilities).toEqual([
      { keyword: "Deflect", type: "keyword", value: 2 },
      { cost: { energy: 8 }, effect: { target: "self", type: "empower" }, restrictions: [{ type: "not-empowered" }], type: "activated" },
      { condition: { type: "while-empowered" }, effect: { amount: 1, type: "score" }, trigger: { event: "conquer", on: "self" }, type: "triggered" },
    ]);
  });

  test("cost: 8 energy + 1 calm; enters the base exhausted, 8 Might, Deflect, not Empowered; short on either → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 8, power: { calm: 1 } }).hand(P1, CARD, "nasus").build();
    await game.p1.play("nasus");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.state("nasus")).toMatchObject({ isEmpowered: false, isExhausted: true, might: 8, zone: "base" });
    expect(game.state("nasus").keywords).toContain("Deflect");
    expect((await scenario().resources(P1, { energy: 7, power: { calm: 1 } }).hand(P1, CARD, "n").build()).p1.can("play", "n")).toBe(false);
    expect((await scenario().resources(P1, { energy: 8 }).hand(P1, CARD, "n").build()).p1.can("play", "n")).toBe(false);
  });

  test("Deflect 2: P2's Bolt cannot choose him without 2 spare power; with 2 power of mixed domains it can, and all of it is spent (809.1.c.1)", async () => {
    const game = await scenario().active(P2).resources(P2, { energy: 1, power: { fury: 1 } }).unit(P1, "base", CARD, "nasus").unit(P2, "base", { might: 1 }, "theirs").hand(P2, BOLT, "bolt").build();
    expect(boltTargets(game)).toEqual([["theirs"]]);
    await game.p2.do("addResources", { power: { mind: 1 } });
    expect(boltTargets(game)).toEqual(expect.arrayContaining([["nasus"], ["theirs"]]));
    await game.p2.cast("bolt", { targets: "nasus" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0, mind: 0 } });
    await game.settle();
    expect(game.state("nasus").damage).toBe(3);
  });

  test("[Empower] [8]: pays 8, goes on the chain, resolves → Empowered; afterwards not re-activatable; 7 energy or the opponent's turn → not offered", async () => {
    const game = await board().resources(P1, { energy: 8 }).build();
    await game.p1.activate("nasus");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "nasus", triggered: false })]);
    expect(game.state("nasus").isEmpowered).toBe(false);
    await game.settle();
    expect(game.state("nasus")).toMatchObject({ isEmpowered: true, isReady: true });
    await game.p1.do("addResources", { energy: 8 });
    expect(game.p1.can("activate", "nasus")).toBe(false);
    expect((await board().resources(P1, { energy: 7 }).build()).p1.can("activate", "nasus")).toBe(false);
    expect((await board().active(P2).resources(P1, { energy: 8 }).build()).p1.can("activate", "nasus")).toBe(false);
  });

  test("NOT Empowered: conquering an empty enemy battlefield is worth exactly the ordinary 1 point and puts no trigger on the chain", async () => {
    const game = await board().build();
    await game.p1.move("nasus", "bf1");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("Empowered: the same conquer scores 1 (conquer) + 1 (trigger) = 2", async () => {
    const game = await board({ empowered: true }).build();
    await game.p1.move("nasus", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.p2.points()).toBe(0);
  });

  test("Empowered through a real combat: kills a 5-Might defender (takes 5, healed in cleanup), conquers, 2 points", async () => {
    const game = await board({ defender: 5, empowered: true }).build();
    await game.p1.move("nasus", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.state("nasus")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
  });

  test("losing the combat is not conquering: an Empowered Nasus into a 9-Might defender dies and scores nothing", async () => {
    const game = await board({ defender: 9, empowered: true }).build();
    await game.p1.move("nasus", "bf1");
    await game.settle();
    expect(game.zoneOf("nasus")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("'When I conquer' — another friendly unit conquering while Empowered Nasus stays home gives only that unit's 1 point", async () => {
    const game = await board({ empowered: true }).unit(P1, "base", { might: 2, name: "Scout" }, "scout").build();
    await game.p1.move("scout", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("holding is not conquering: an Empowered Nasus parked on his battlefield earns the normal 1 hold point at the start of P1's turn, not 2", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "nasus", { empowered: true }).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("Sanction at Reaction speed during the showdown Empowers him in time (no Deflect tax for his own controller): conquer scores 2; at end of turn Sanction disempowers him again", async () => {
    const game = await board({ defender: 3 }).resources(P1, { energy: 3, power: { calm: 1 } }).hand(P1, SANCTION, "sanction").build();
    await game.p1.move("nasus", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    // rule 355.3 / 355.5 — mode and target are named as Sanction is played.
    await game.p1.cast("sanction", { mode: 0, targets: "nasus" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } }); // 3+[calm], nothing extra for Deflect
    await game.p1.passPriority();
    await game.p2.passPriority(); // Sanction resolves inside the showdown
    expect(game.state("nasus").isEmpowered).toBe(true);
    await game.settle(); // finish the showdown → combat → conquer
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
    await game.advanceTurn();
    expect(game.state("nasus").isEmpowered).toBe(false);
  });

  test("6 of 8, Empowered, one of two battlefields: conquer → 7, trigger → 8 = victory", async () => {
    const game = await board({ empowered: true }).victoryScore(8).points(P1, 6).build();
    await game.p1.move("nasus", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("Final Point: at 7 of 8 the CONQUER point is replaced by a draw (not every battlefield scored, 471.1.b.1) — but the trigger's non-conquer point still lands (471.1.a.1, 383.4.c.2.c) and wins", async () => {
    const game = await board({ empowered: true }).victoryScore(8).points(P1, 7).build();
    const hand = game.p1.hand().length;
    await game.p1.move("nasus", "bf1");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand + 1); // the replaced conquer point
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("negative space for the Final Point: the same 7-of-8 conquer WITHOUT Empowered only draws the card — still 7, game goes on", async () => {
    const game = await board().victoryScore(8).points(P1, 7).build();
    const hand = game.p1.hand().length;
    await game.p1.move("nasus", "bf1");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
