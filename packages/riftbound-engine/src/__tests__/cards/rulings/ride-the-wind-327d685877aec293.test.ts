/**
 * Ruling 327d685877aec293 — Ride the Wind (OGN-173 → ogn-173-298) · Action · Chaos · [2][chaos]
 *     "Move a friendly unit and ready it."
 *
 * Q: If I Ride the Wind into a battlefield during a showdown on my opponent's turn and win the combat, do I
 *    conquer it and score?
 * A: Yes — conquering scores on the opponent's turn just as on your own. The one thing it cannot do is take
 *    the final point: the 8th point by conquer requires having scored every battlefield this turn, which is
 *    impossible on their turn, so at Victory Score − 1 the conquer draws a card instead.
 * Rules: 466.5/471 (win the combat ⇒ establish control ⇒ Conquer ⇒ score), 471.2 (a battlefield scores once
 *        per turn, either player's), 471.1.b/.b.1 (the Final Point restriction and its card-draw fallback).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/** P2's turn (turn 3), Victory Score 8. bf1 is open; P1 has a 5-Might Striker in base, Ride the Wind and [2][chaos]. */
function board(p1Points: number) {
  return scenario()
    .turn(3)
    .active(P2)
    .victoryScore(8)
    .points(P1, p1Points)
    .points(P2, 2)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 4, name: "Sentinel" }, "sentinel")
    .unit(P1, "base", { might: 5, name: "Striker" }, "striker")
    .unit(P2, "base", { might: 1, name: "Scout" }, "scout")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** P2 walks onto the open bf1; P1 answers with Ride the Wind and the combat is fought out. */
async function rideInAndWin(game: Game): Promise<void> {
  await game.p2.move("scout", "bf1");
  await game.p2.passFocus();
  expect(game.p1.can("cast", "rtw")).toBe(true);
  await game.p1.cast("rtw", { targets: "striker" });
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick("battlefield-bf1");
  }
  await game.settle();
  expect(game.zoneOf("scout")).toBe("trash");
  expect(game.locationOf("striker")).toBe("bf1");
}

describe("Ruling 327d685877aec293 — a Ride the Wind conquer on the opponent's turn scores, except for the final point", () => {
  test("at 3 points: P1 conquers bf1 in the middle of P2's turn and scores (3 → 4)", async () => {
    const game = await board(3).build();
    const hand = game.p1.hand().length;
    await rideInAndWin(game);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(4);
    expect(game.p1.hand()).toHaveLength(hand - 1); // only Ride the Wind left the hand — no draw
    expect(game.turnPlayer()).toBe(P2);
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("at 7 of 8 the very same conquer cannot be the winning point: P1 stays at 7 and draws a card instead", async () => {
    const game = await board(7).build();
    const hand = game.p1.hand().length;
    const deck = game.p1.deck().length;
    await rideInAndWin(game);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(game.p1.deck()).toHaveLength(deck - 1);
  });

  test("and the battlefield is not scored twice: P1 holding it into their own next turn does not re-score the conquer", async () => {
    const game = await board(3).build();
    await rideInAndWin(game);
    expect(game.p1.points()).toBe(4);
    await game.advanceTurn(); // P2's turn ends, P1's begins — holding is scored in the Beginning Phase
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(5); // one HOLD point, not a second conquer
  });
});
