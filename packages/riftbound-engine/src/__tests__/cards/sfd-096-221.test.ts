/**
 * Laurent Bladekeeper — sfd-096-221 · Unit · Body · 3 energy · 3 Might
 *
 *   Ganking (I can move from battlefield to battlefield.)
 *
 * Head-judge notes — the tricky spots for this card:
 *  - 810.1.b/c: Ganking only ADDS the battlefield → battlefield option to the Standard Move; it is
 *    still a Standard Move: costs exhausting the unit (144.2), needs a ready unit, own Main Phase in an
 *    Open state only (144.1) — never during a showdown or on the opponent's turn.
 *  - 144.3.a/b: a multi-unit Standard Move needs one destination but origins may differ — Laurent may
 *    gank from bf1 while a buddy walks from base to the same bf2 in ONE move (one combat); a
 *    non-Ganking unit sharing his battlefield may NOT tag along battlefield → battlefield.
 *  - Ganking into an enemy-occupied battlefield starts a combat like any move (he fights as a plain 3);
 *    into an empty enemy-controlled battlefield he conquers; ganking away with your LAST unit at a
 *    battlefield forfeits control of it at the next cleanup (323.6), a squire left behind keeps it.
 *  - Base ↔ battlefield moves remain available (810.1.c.1: nothing is removed).
 *  - The keyword is printed unbracketed on the card; the hand-authored ability must still be a real
 *    Ganking keyword the engine honours.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-096-221";

function twoFields() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", CARD, "laurent")
    .unit(P1, "bf1", { might: 2, name: "Plain Squire" }, "squire")
    .unit(P1, "base", { might: 2, name: "Base Buddy" }, "buddy");
}

describe("Laurent Bladekeeper (sfd-096-221)", () => {
  test("cost: 3 energy, no power; enters base exhausted as a 3-Might unit with Ganking; unaffordable at 2", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "laurent").build();
    await game.p1.play("laurent");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("laurent")).toBe("base");
    expect(game.state("laurent")).toMatchObject({ isExhausted: true, might: 3 });
    expect(game.state("laurent").keywords).toContain("Ganking");
    expect(game.p1.can("gank", "laurent")).toBe(false); // exhausted (and in base) — no move this turn
    const broke = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "laurent").build();
    expect(broke.p1.can("play", "laurent")).toBe(false);
  });

  test("Ganking: battlefield → battlefield is legal for him and not for the vanilla unit beside him; it exhausts him (Standard Move cost)", async () => {
    const game = await twoFields().build();
    expect(game.p1.can("gank", "laurent")).toBe(true);
    expect(game.p1.can("gank", "squire")).toBe(false);
    const groupTargets = game.p1.option("standardMove:to:bf2")?.fields.find((f) => f.arg === "units")?.options ?? [];
    expect(groupTargets).toContainEqual(["laurent"]);
    expect(groupTargets.some((g) => Array.isArray(g) && g.includes("squire"))).toBe(false);
    await game.p1.gank("laurent", "bf2");
    expect(game.locationOf("laurent")).toBe("bf2");
    expect(game.state("laurent").isExhausted).toBe(true);
    expect(game.locationOf("squire")).toBe("bf1");
  });

  test("ganking onto an empty enemy-controlled battlefield conquers it (1 point) and bf1 stays yours", async () => {
    const game = await twoFields().build();
    await game.p1.gank("laurent", "bf2");
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("ganking into an enemy-occupied battlefield opens a combat showdown; he fights as a plain 3 (kills a 3, dies to it too)", async () => {
    const game = await twoFields().unit(P2, "bf2", { might: 3, name: "Guard" }, "guard").build();
    await game.p1.gank("laurent", "bf2");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.state("laurent").combatRole).toBe("attacker");
    expect(game.state("laurent").might).toBe(3);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("laurent")).toBe("trash"); // 3 damage on 3 Might
    expect(game.gameState.battlefields.bf2?.controller).toBeNull(); // 466.5.b: nobody left → uncontrolled
    expect(game.p1.points()).toBe(0);
  });

  test("ganking away with your LAST unit there forfeits control of the origin battlefield at the next cleanup (323.6) — the engine keeps it controlled", async () => {
    // Expected: bf1 (now empty of P1 units, Open state after the bf2 conquer) becomes uncontrolled.
    // Actual: bf1.controller stays "player-1" (control is only stripped when the last unit DIES there).
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CARD, "laurent")
      .build();
    await game.p1.gank("laurent", "bf2");
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });

  test("wins through: against a 2-Might defender he survives, conquers bf2 and scores", async () => {
    const game = await twoFields().unit(P2, "bf2", { might: 2, name: "Weakling" }, "weak").build();
    await game.p1.gank("laurent", "bf2");
    await game.settle();
    expect(game.zoneOf("weak")).toBe("trash");
    expect(game.locationOf("laurent")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("144.3.b: one Standard Move, two origins — Laurent ganks from bf1 while the base buddy walks in; both arrive and fight one combat together", async () => {
    const game = await twoFields().unit(P2, "bf2", { might: 4, name: "Guard" }, "guard").build();
    await game.p1.move(["laurent", "buddy"], "bf2");
    expect(game.locationOf("laurent")).toBe("bf2");
    expect(game.locationOf("buddy")).toBe("bf2");
    expect(game.state("laurent").isExhausted).toBe(true);
    expect(game.state("buddy").isExhausted).toBe(true);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash"); // 3 + 2 = 5 ≥ 4
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });

  test("negative: the non-Ganking squire cannot be dragged battlefield → battlefield in his group", async () => {
    const game = await twoFields().build();
    const r = await game.p1.try((p) => p.move(["laurent", "squire"], "bf2"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("laurent")).toBe("bf1");
    expect(game.locationOf("squire")).toBe("bf1");
    expect(game.state("laurent").isReady).toBe(true); // nothing paid
  });

  test("still a Standard Move: an exhausted Laurent cannot gank; base ↔ battlefield options remain (810.1.c.1)", async () => {
    const tired = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CARD, "laurent", { exhausted: true })
      .build();
    expect(tired.p1.can("gank", "laurent")).toBe(false);
    const game = await twoFields().build();
    await game.p1.move("laurent", "base"); // battlefield → base is an ordinary option
    expect(game.locationOf("laurent")).toBe("base");
    const fromBase = await scenario().battlefield("bf2", { controller: P2 }).unit(P1, "base", CARD, "laurent").build();
    expect(fromBase.p1.can("gank", "laurent")).toBe(false); // base → bf is not a "gank"…
    await fromBase.p1.move("laurent", "bf2"); // …but the normal move is there
    expect(fromBase.locationOf("laurent")).toBe("bf2");
  });

  test("timing (144.1): no ganking on the opponent's turn or while a showdown is open", async () => {
    const opp = await twoFields().active(P2).build();
    expect(opp.p1.can("gank", "laurent")).toBe(false);
    expect((await opp.p1.try((p) => p.gank("laurent", "bf2"))).ok).toBe(false);
    const game = await twoFields().battlefield("bf3", { controller: P2 }).unit(P2, "bf3", { might: 5 }, "wall").build();
    await game.p1.move("buddy", "bf3");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("gank", "laurent")).toBe(false);
    expect(game.p1.can("move")).toBe(false);
  });

  test("with only one battlefield in play there is nowhere to gank to", async () => {
    const game = await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "laurent").build();
    expect(game.p1.can("gank", "laurent")).toBe(false);
    expect(game.p1.can("standardMove:to:base")).toBe(true);
  });

  test("parsed abilities match the printed text: exactly one Ganking keyword ability, no cost pips beyond 3 energy", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 3, might: 3 });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities ?? []).toEqual([{ keyword: "Ganking", type: "keyword" }]);
  });
});
