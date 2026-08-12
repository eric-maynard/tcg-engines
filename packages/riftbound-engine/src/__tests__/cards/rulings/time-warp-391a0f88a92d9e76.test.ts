/**
 * Ruling 391a0f88a92d9e76 — Time Warp (OGN-122 → ogn-122-298) · [10][mind]×4
 *   "Take a turn after this one. Banish this."
 *
 * Q: If I Time Warp while an opponent controls a battlefield, do they get a Hold point?
 * A: No. Holding is scored at the start of YOUR OWN Beginning Phase. Time Warp makes the next turn yours,
 *    so the opponent never reaches a Beginning Phase in between and scores nothing. They hold again only
 *    when their own turn finally comes round.
 * Rules: 471.3 (Hold is scored in the Beginning Phase of the battlefield controller's own turn),
 *        734–738 (the additional turn is inserted immediately after the current one).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIME_WARP = "ogn-122-298";

/** P1's turn. P1 holds bf1 with a Sitter, P2 holds bf2 with a Squatter. P1 has exactly Time Warp's cost. */
function board() {
  return scenario()
    .victoryScore(20)
    .resources(P1, { energy: 10, power: { mind: 4 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Sitter" }, "sitter")
    .unit(P2, "bf2", { might: 3, name: "Squatter" }, "squatter")
    .hand(P1, TIME_WARP, "warp");
}

async function warped(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("warp");
  await game.settle();
  expect(game.zoneOf("warp")).toBe("banishment");
  return game;
}

describe("Ruling 391a0f88a92d9e76 — Time Warp denies the opponent their Hold point because the next turn is yours", () => {
  test("premise: each player controls one battlefield and neither has scored yet", async () => {
    const game = await board().build();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("ruling: the turn after the Time Warp turn is P1's again — P1 scores the Hold on bf1, P2 scores nothing for bf2", async () => {
    const game = await warped();
    const r = await game.advanceTurn();
    expect(r.next).toBe(P1); // the additional turn
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1); // P1's own Beginning Phase → Hold bf1
    expect(game.p2.points()).toBe(0); // P2 never had a Beginning Phase
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2); // they still control it — they just don't score it
  });

  test("P2's Hold point only arrives when P2's own turn finally comes round, after the extra turn", async () => {
    const game = await warped();
    await game.advanceTurn(); // P1's extra turn
    expect(game.p2.points()).toBe(0);
    await game.advanceTurn(); // now P2
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — without the Time Warp the very next turn is P2's and they do score the Hold", async () => {
    const game = await board().build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
  });
});
