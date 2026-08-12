/**
 * Ruling 4a5d17d105022cd8 — Time Warp (OGN-122 → ogn-122-298) · Spell · Mind · [10][mind][mind][mind][mind] · [Action]
 *   "Take a turn after this one. Banish this."
 *
 * Q: I am on 6 points holding one battlefield, my opponent is on 7 holding another, Victory Score 8. If I play
 *    Time Warp, does my opponent score their holding point and win, or is their turn just skipped while I go to 7?
 * A: Neither player teleports to a score. The extra turn is inserted directly after yours, so the opponent's
 *    turn is DELAYED, not skipped — and since holding points are only scored in a player's own Beginning Phase,
 *    they score nothing during that window. You score your 7th point in the Beginning Phase of your extra turn.
 *    They then take their (delayed) turn as normal.
 * Rules: 734 (extra turn inserted after the current one), 315.2/471.2 (holding is scored in your own
 *        Beginning Phase), 468 (victory at the Victory Score).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIME_WARP = "ogn-122-298";
const unit = (might: number, name: string) => ({ cardType: "unit", energyCost: 1, might, name }) as const;

/** Turn 3, P1 active. Victory Score 8; P1 6 points holding bf1, P2 7 points holding bf2. */
async function board(): Promise<Game> {
  return await scenario()
    .turn(3)
    .victoryScore(8)
    .points(P1, 6)
    .points(P2, 7)
    .resources(P1, { energy: 10, power: { mind: 4 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", unit(2, "Holder"), "holder")
    .unit(P2, "bf2", unit(2, "Their Holder"), "theirs")
    .hand(P1, TIME_WARP, "tw")
    .build();
}

describe("Ruling 4a5d17d105022cd8 — Time Warp delays the opponent's turn, so they score no holding point in between", () => {
  test("the turn after P1's is P1's again; P1 scores 6 → 7 and the opponent stays on 7", async () => {
    const game = await board();

    await game.p1.cast("tw");
    await game.settle();
    expect(game.zoneOf("tw")).toBe("banishment"); // "Banish this"
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(6);

    await game.advanceTurn();

    expect(game.turnPlayer()).toBe(P1); // the extra turn, not P2's
    expect(game.p1.points()).toBe(7); // scored for holding bf1 in P1's own Beginning Phase
    expect(game.p2.points()).toBe(7); // P2 never entered a Beginning Phase, so nothing was scored
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("their turn is delayed, not lost: P2 takes it after the extra turn and scores then", async () => {
    const game = await board();
    await game.p1.cast("tw");
    await game.settle();
    await game.advanceTurn(); // into P1's extra turn

    await game.advanceTurn(); // now P2 finally gets their turn

    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
  });

  test("without Time Warp the same board hands P2 the win one turn sooner", async () => {
    const game = await board();

    await game.advanceTurn();

    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(8);
    expect(game.winner()).toBe(P2);
  });
});
