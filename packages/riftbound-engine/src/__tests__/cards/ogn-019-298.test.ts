/**
 * Raging Soul — ogn-019-298 · Unit · Fury · 4 energy · 4 might
 *
 *   If you've discarded a card this turn, I have [Assault] and [Ganking].
 *   (+1 [Might] while I'm an attacker. I can move from battlefield to battlefield.)
 *
 * Rules: 719 Assault (bare keyword = Assault 1, attacker-only bonus), 726
 * Ganking (battlefield → battlefield standard move). The discard is produced by
 * Chemtech Enforcer (ogn-003-298: "When you play me, discard 1").
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const SOUL = "ogn-019-298";
const ENFORCER = "ogn-003-298";
const FILLER = "ogn-175-298";

function board(soulAt: "base" | "bf1") {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, soulAt, SOUL, "soul")
    .unit(P2, "bf2", { might: 5 }, "foe")
    .hand(P1, ENFORCER, "ce")
    .hand(P1, FILLER, "toss");
}

/** Play Enforcer → its trigger discards the only other card in hand ("toss"). */
async function discardOne(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>) {
  await game.p1.play("ce", { to: "base" });
  await game.settle();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("toss");
    await game.settle();
  }
  expect(game.zoneOf("toss")).toBe("trash");
}

describe("Raging Soul (ogn-019-298)", () => {
  test("cost: 4 energy, no power; unaffordable with 3", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, SOUL, "soul").build();
    await game.p1.play("soul", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("soul")).toBe("base");
    const poor = await scenario().resources(P1, { energy: 3 }).hand(P1, SOUL, "soul").build();
    expect(poor.p1.can("play", "soul")).toBe(false);
  });

  test("with no discard this turn it has neither Assault nor Ganking (cannot move battlefield → battlefield)", async () => {
    const game = await board("bf1").build();
    expect(game.state("soul").keywords).toEqual([]);
    expect(game.p1.can("gank", "soul")).toBe(false);
    const t = await game.p1.try((p) => p.move("soul", "bf2"));
    expect(t.ok).toBe(false);
  });

  test("after you discard a card this turn it has Assault and Ganking", async () => {
    const game = await board("bf1").build();
    await discardOne(game);
    expect([...game.state("soul").keywords].sort()).toEqual(["Assault", "Ganking"]);
    expect(game.state("soul").might).toBe(4); // Assault only counts while attacking
  });

  test("Ganking: after a discard it may move from bf1 to bf2", async () => {
    const game = await board("bf1").build();
    await discardOne(game);
    expect(game.p1.can("gank", "soul")).toBe(true);
    await game.p1.gank("soul", "bf2");
    await game.settle();
    // 4 +1 Assault = 5 into a 5-might defender: both die.
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("soul")).toBe("trash");
  });

  test("Assault: attacking from base after a discard deals 5 (kills a 5-might defender); without a discard it deals only 4", async () => {
    const withDiscard = await board("base").build();
    await discardOne(withDiscard);
    await withDiscard.p1.move("soul", "bf2");
    await withDiscard.settle();
    expect(withDiscard.zoneOf("foe")).toBe("trash");

    const noDiscard = await board("base").build();
    await noDiscard.p1.move("soul", "bf2");
    await noDiscard.settle();
    expect(noDiscard.locationOf("foe")).toBe("bf2");
    expect(noDiscard.zoneOf("soul")).toBe("trash");
  });

  test("'discarded a card this turn' expires — Assault/Ganking do not persist into later turns with no discard", async () => {
    // Expected: the condition is scoped to the current turn, so on the opponent's turn and on
    // P1's following turn (no discard yet) Raging Soul has no keywords and cannot gank.
    // Actual: the discarded-this-turn flag is never cleared; keywords and gankingMove stay on.
    const game = await board("bf1").build();
    await discardOne(game);
    expect(game.state("soul").keywords).toContain("Ganking");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("soul").keywords).toEqual([]);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("soul").keywords).toEqual([]);
    expect(game.p1.can("gank", "soul")).toBe(false);
  });
});
