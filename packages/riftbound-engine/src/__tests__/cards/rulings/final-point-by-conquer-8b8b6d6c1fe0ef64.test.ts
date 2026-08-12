/**
 * Ruling 8b8b6d6c1fe0ef64 — (no specific card) winning by conquering the last battlefield.
 *   Exercised with inline filler units (a [Ganking] raider and a small defender) on two battlefields.
 *
 * Q: Can I hold one battlefield up to 7 points, leave it empty, then attack and conquer the other one
 *    to win?
 * A: Yes — provided you have scored EVERY battlefield this turn. The Final Point is only granted by a
 *    Conquer once every battlefield has been scored that turn (the one being conquered counts);
 *    otherwise the conquer draws you a card instead of the winning point.
 * Rules: 471.1.b / 471.1.b.1 (the Final Point restriction), 470 (once per battlefield per turn),
 *    315.2.b (Hold at the Scoring Step), 485.3 (Duel Victory Score 8).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/**
 * P2's turn 2. `holdA` decides whether P1 starts their turn controlling bfA (and so holds it for the
 * 7th point). bfB is P2's, defended by a 1-Might unit; P1's raider can gank battlefield → battlefield.
 */
function board(opts: { holdA: boolean }) {
  const b = scenario()
    .turn(2)
    .active(P2)
    .points(P1, 6)
    .battlefield("bfA", { controller: opts.holdA ? P1 : null })
    .battlefield("bfB", { controller: P2 })
    .unit(P2, "bfB", { might: 1, name: "Picket" }, "picket")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
  return opts.holdA
    ? b.unit(P1, "bfA", { keywords: ["Ganking"], might: 5, name: "Raider" }, "raider")
    : b.unit(P1, "base", { might: 5, name: "Raider" }, "raider");
}

async function myTurn(opts: { holdA: boolean }): Promise<Game> {
  const game = await board(opts).build();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  return game;
}

describe("Ruling 8b8b6d6c1fe0ef64 — the Final Point by conquer, once every battlefield was scored", () => {
  test("holding bfA takes me from 6 to 7 and puts bfA on this turn's scored ledger", async () => {
    const game = await myTurn({ holdA: true });
    expect(game.p1.points()).toBe(7);
    expect(game.gameState.scoredThisTurn[P1] ?? []).toContain("bfA");
    expect(game.isOver()).toBe(false);
  });

  test("leaving bfA to attack bfB is legal — and bfA goes uncontrolled behind me", async () => {
    const game = await myTurn({ holdA: true });
    await game.p1.gank("raider", "bfB");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.p1.units("bfA")).toEqual([]);
  });

  test("winning that combat conquers bfB — every battlefield is now scored this turn, so the 8th point lands and I win", async () => {
    const game = await myTurn({ holdA: true });
    await game.p1.gank("raider", "bfB");
    await game.settle();
    expect(game.zoneOf("picket")).toBe("trash");
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("the nuance made concrete: with bfA NOT scored this turn the same conquer draws a card instead of the winning point", async () => {
    const game = await myTurn({ holdA: false });
    expect(game.p1.points()).toBe(6);
    // Get to 7 without scoring bfA: conquer the empty bfA is not available here, so start from 7 directly.
    const seven = await scenario()
      .turn(2)
      .active(P2)
      .points(P1, 7)
      .battlefield("bfA", { controller: null })
      .battlefield("bfB", { controller: P2 })
      .unit(P2, "bfB", { might: 1, name: "Picket" }, "picket")
      .unit(P1, "base", { might: 5, name: "Raider" }, "raider")
      .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"])
      .build();
    await seven.advanceTurn();
    expect(seven.p1.points()).toBe(7);
    expect(seven.gameState.scoredThisTurn[P1] ?? []).toEqual([]); // bfA was never P1's — nothing held
    const handBefore = seven.p1.hand().length;
    await seven.p1.move("raider", "bfB");
    await seven.settle();
    expect(seven.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(seven.p1.points()).toBe(7); // 471.1.b.1 — no Final Point
    expect(seven.p1.hand().length).toBe(handBefore + 1); // a card instead
    expect(seven.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
