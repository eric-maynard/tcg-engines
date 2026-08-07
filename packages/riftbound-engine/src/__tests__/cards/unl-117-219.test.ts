/**
 * Arachnoid Horror — unl-117-219 · Unit · Body · 6 energy + 1 [body] · 6 Might
 *
 *   [Hunt 2] (When I conquer or hold, gain 2 XP.)
 *   I can be played to an occupied battlefield if an enemy unit is alone there.
 *   Friendly units can be played to an occupied battlefield if an enemy unit is alone there.
 *
 * Rules: 823 (Hunt X = "When I conquer or hold, my controller gains X XP" — a chain trigger of THIS
 * unit), 469 (conquer / hold), 806.3 + 813.3.a (default: a unit is played only to your base or a
 * battlefield you CONTROL), 366.1 (a passive that widens where "I can be played" works from hand),
 * 365.1 (the "Friendly units can be played …" grant is a permanent's passive → active only while the
 * Horror is on the board), 170.11.a (occupied = a unit is there), 740.2.a (alone = no other friendly
 * unit at that location), 190.3.a.1 + 344.1 (a unit played onto a battlefield it doesn't control
 * contests it; the next Cleanup opens the combat with the arriving player attacking), 178.1.a.1
 * (units enter exhausted — an exhausted attacker still deals its Might).
 *
 * Head-judge checklist for THIS card:
 *  1. The permission is narrow: exactly ONE enemy unit there. Two enemies → no; an empty enemy-held
 *     battlefield → no (not occupied); an open battlefield → no.
 *  2. Dropping the 6-Might Horror onto a lone 3-Might holder is a real attack on arrival: it fights
 *     exhausted, kills the holder, conquers (+1 point) and Hunt 2 pays 2 XP on top.
 *  3. The friendly grant needs the Horror ON THE BOARD (base is enough); a Horror in hand grants
 *     nothing to the rest of the hand.
 *  4. Hunt 2 pays exactly 2 (not 1, not 4) per conquer/hold of THIS unit; dying on the attack or a
 *     different unit conquering pays nothing; the opponent's Beginning Phase is not a hold.
 *  5. Cost 6 + [body]: 6 alone or 5 + [body] is short.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-117-219";

const playTo = (game: Game, alias: string) =>
  [...(game.p1.option("play", alias)?.fields.find((f) => f.arg === "to")?.options ?? [])].map(String).sort();

/** bf1: lone 3-Might enemy · bf2: two enemies · bf3: enemy-controlled but empty · bf4: open. P1 can afford the Horror. */
function menuBoard() {
  return scenario()
    .resources(P1, { energy: 6, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: P2 })
    .battlefield("bf4", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Loner" }, "loner")
    .unit(P2, "bf2", { might: 1, name: "TwinA" }, "twinA")
    .unit(P2, "bf2", { might: 1, name: "TwinB" }, "twinB");
}

describe("Arachnoid Horror (unl-117-219)", () => {
  test("registry payload — Hunt 2 (+ its 2-XP conquer/hold triggers) and two play-location statics (self / friendly units) that keep the 'enemy unit ALONE there' condition", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 6, might: 6, name: "Arachnoid Horror", powerCost: ["body"] });
    type Ab = { type: string; keyword?: string; value?: number; trigger?: { event: string; on?: string }; effect?: Record<string, unknown> };
    const abilities = (def?.abilities ?? []) as Ab[];
    expect(abilities.filter((a) => a.type === "keyword")).toEqual([{ keyword: "Hunt", type: "keyword", value: 2 }]);
    for (const ev of ["conquer", "hold"]) {
      expect(abilities).toContainEqual(expect.objectContaining({ effect: { amount: 2, type: "gain-xp" }, trigger: { event: ev, on: "self" }, type: "triggered" }));
    }
    const statics = abilities.filter((a) => a.type === "static");
    expect(statics).toHaveLength(2);
    expect(statics[0]?.effect).toMatchObject({ target: { type: "self" }, type: "can-play-to-occupied" });
    expect(statics[1]?.effect).toMatchObject({ target: { controller: "friendly", type: "unit" }, type: "can-play-to-occupied" });
    for (const s of statics) {
      expect(JSON.stringify(s)).toMatch(/alone/i);
    }
  });

  test("cost: 6 energy + 1 body; enters the base exhausted as a 6-Might Hunt unit with nothing on the chain; 6 alone or 5 + body is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { body: 1 } }).hand(P1, CARD, "ah").build();
    await game.p1.play("ah");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("ah")).toMatchObject({ baseMight: 6, isExhausted: true, might: 6, zone: "base" });
    expect(game.state("ah").keywords).toContain("Hunt");
    expect(game.p1.xp()).toBe(0);
    expect((await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "ah").build()).p1.can("play", "ah")).toBe(false);
    expect((await scenario().resources(P1, { energy: 5, power: { body: 1 } }).hand(P1, CARD, "ah").build()).p1.can("play", "ah")).toBe(false);
    expect((await scenario().resources(P1, { energy: 6, power: { mind: 1 } }).hand(P1, CARD, "ah").build()).p1.can("play", "ah")).toBe(false);
  });

  test("[Hunt 2] on conquer: attacking a 2-Might defender — it dies, P1 conquers bf1 (+1 point) and the Hunt trigger pays exactly 2 XP", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 2, name: "Foe" }, "foe").unit(P1, "base", CARD, "ah").build();
    await game.p1.move("ah", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ah", controller: P1, triggered: true })]);
    expect(game.p1.xp()).toBe(0); // on resolution, not on conquer
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(2);
    expect(game.p2.xp()).toBe(0);
  });

  test("[Hunt 2] on hold: at the start of P1's turn the Horror holding bf1 scores the point and gains 2 XP; the opponent's Beginning Phase afterwards adds nothing", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "ah").build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ah", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(2);
    await game.advanceTurn(); // P2's turn: P1 still controls bf1, but it is not P1's hold
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.xp()).toBe(2);
    expect(game.p2.xp()).toBe(0);
  });

  test("negative space — no conquer, no XP: the Horror dying into a 7-Might wall gains nothing; a vanilla ally conquering while the Horror sits in base gains nothing", async () => {
    const dies = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 7, name: "Wall" }, "wall").unit(P1, "base", CARD, "ah").build();
    await dies.p1.move("ah", "bf1");
    await dies.settle();
    expect(dies.zoneOf("ah")).toBe("trash");
    expect(dies.p1.xp()).toBe(0);
    expect(dies.p1.points()).toBe(0);
    const other = await scenario().battlefield("bf1", { controller: null }).unit(P1, "base", { might: 2, name: "Ally" }, "ally").unit(P1, "base", CARD, "ah").build();
    await other.p1.move("ally", "bf1");
    await other.settle();
    expect(other.p1.points()).toBe(1);
    expect(other.p1.xp()).toBe(0);
  });

  test.failing("BUG: 'I can be played to an occupied battlefield if an enemy unit is alone there' — from hand the Horror is offered base + bf1 (lone enemy) and nothing else (not bf2 with two, not empty bf3, not open bf4)", async () => {
    // Expected: to ∈ {base, battlefield-bf1}. Actual: only base — the permission is not implemented.
    const game = await menuBoard().hand(P1, CARD, "ah").build();
    expect(playTo(game, "ah")).toEqual(["base", "battlefield-bf1"]);
  });

  test("negative space (806.3): with only a two-enemy battlefield, an empty enemy battlefield and an open one on the board, base is the Horror's only legal location", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { body: 1 } })
      .battlefield("bf2", { controller: P2 })
      .battlefield("bf3", { controller: P2 })
      .battlefield("bf4", { controller: null })
      .unit(P2, "bf2", { might: 1 }, "twinA")
      .unit(P2, "bf2", { might: 1 }, "twinB")
      .hand(P1, CARD, "ah")
      .build();
    expect(playTo(game, "ah")).toEqual(["base"]);
    const t = await game.p1.try((p) => p.play("ah", { to: "bf2" }));
    expect(t.ok).toBe(false);
    expect(game.zoneOf("ah")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 6, power: { body: 1 } }); // nothing spent on the rejected play
  });

  test.failing("BUG: the drop-in attack — played onto bf1 where a 3-Might Loner stands alone, the Horror enters there exhausted, contests bf1, and the ensuing combat kills the Loner: conquer (+1 point) and Hunt 2 (+2 XP)", async () => {
    // Expected: play(ah → bf1) is legal; after settling: loner in trash, bf1 → P1, points 1, xp 2, Horror
    // exhausted at bf1. Actual: bf1 is not a legal play location.
    const game = await menuBoard().hand(P1, CARD, "ah").build();
    await game.p1.play("ah", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.state("ah")).toMatchObject({ isExhausted: true, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    await game.settle();
    if (game.p1.can("startShowdown")) {
      await game.p1.choose("startShowdown:bf1");
    }
    await game.settle();
    await game.settle();
    expect(game.zoneOf("loner")).toBe("trash");
    expect(game.state("ah")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(2);
  });

  test.failing("BUG: 'Friendly units can be played to an occupied battlefield if an enemy unit is alone there' — with the Horror on the board (in base) a vanilla unit in hand is offered bf1, and only bf1 among the battlefields", async () => {
    // Expected: to ∈ {base, battlefield-bf1} for the Recruit. Actual: only base.
    const game = await menuBoard()
      .unit(P1, "base", CARD, "ah")
      .hand(P1, { cardType: "unit", energyCost: 1, might: 2, name: "Recruit" }, "recruit")
      .build();
    expect(playTo(game, "recruit")).toEqual(["base", "battlefield-bf1"]);
    await game.p1.play("recruit", { to: "bf1" });
    expect(game.state("recruit")).toMatchObject({ isExhausted: true, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
  });

  test("negative space (365.1): the friendly grant is a BOARD passive — with the Horror merely in hand, another unit in hand may only go to base", async () => {
    const game = await menuBoard()
      .hand(P1, CARD, "ah")
      .hand(P1, { cardType: "unit", energyCost: 1, might: 2, name: "Recruit" }, "recruit")
      .build();
    expect(playTo(game, "recruit")).toEqual(["base"]);
  });

  test("negative space: the grant is for FRIENDLY units — the opponent, on their turn with the Horror on P1's board, cannot drop a unit onto a battlefield where P1's unit stands alone", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 5 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Mine" }, "mine")
      .unit(P1, "base", CARD, "ah")
      .hand(P2, { cardType: "unit", energyCost: 1, might: 2, name: "Intruder" }, "intruder")
      .build();
    const to = [...(game.p2.option("play", "intruder")?.fields.find((f) => f.arg === "to")?.options ?? [])].map(String);
    expect(to).toEqual(["base"]);
  });
});
