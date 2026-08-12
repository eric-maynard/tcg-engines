/**
 * Ruling 2959d9c21009cbfc — Time Warp (OGN-122 → ogn-122-298) · Mind · [10][mind×4]
 *   "Take a turn after this one. Banish this."
 *
 * Q: When time is called and five additional turns are played, does a Time Warp turn consume one of the five,
 *    or is it granted on top?
 * A: It consumes one. Time Warp does not create a turn outside the count — it only changes WHOSE the next turn
 *    is. Five turns after time is called are five turns however they are distributed, and a Time Warp cast on
 *    the fifth grants nothing extra.
 *   (The "call time / five more turns" allotment is a tournament end-of-round procedure and is not modelled by
 *    the engine; what is testable here is the game-rules half: the additional turn is an ordinary, counted turn
 *    inserted directly after the current one.)
 * Rules: 734 / 738 (an additional turn is inserted directly after the current turn), 315 (each turn is one turn).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TIME_WARP = "ogn-122-298";

/** Turn 5 is P1's. P1 holds Time Warp with its full [10][mind][mind][mind][mind]. */
function board() {
  return scenario()
    .turn(5)
    .active(P1)
    .resources(P1, { energy: 10, power: { mind: 4 } })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .hand(P1, TIME_WARP, "warp")
    .fillDecks({ main: 20, runes: 20 });
}

describe("Ruling 2959d9c21009cbfc — a Time Warp turn is an ordinary counted turn, not a turn on top of the allotment", () => {
  test("casting it banishes the spell and grants an additional turn to P1", async () => {
    const game = await board().build();
    await game.p1.cast("warp");
    await game.settle();
    expect(game.zoneOf("warp")).toBe("banishment");
    expect(game.turnNumber()).toBe(5); // nothing has advanced yet
  });

  test("ruling: the extra turn is inserted directly after this one and the turn counter still moves by exactly 1 — no uncounted turn appears", async () => {
    const game = await board().build();
    await game.p1.cast("warp");
    await game.settle();
    const first = await game.advanceTurn();
    expect(first).toEqual({ next: P1, turn: 6 }); // P1 again — the additional turn
    const second = await game.advanceTurn();
    expect(second).toEqual({ next: P2, turn: 7 }); // the normal rotation resumes
  });

  test("counting five turns from the moment time is called: the Time Warp turn OCCUPIES slot 2 of the five (P1, P1, P2, P1, P2) — P2 does not get an extra turn back", async () => {
    const game = await board().build();
    await game.p1.cast("warp"); // "time is called" during this, the first of the five turns
    await game.settle();
    const seats = [game.turnPlayer()];
    const numbers = [game.turnNumber()];
    for (let i = 0; i < 4; i++) {
      const next = await game.advanceTurn();
      seats.push(next.next);
      numbers.push(next.turn);
    }
    expect(seats).toEqual([P1, P1, P2, P1, P2]);
    expect(numbers).toEqual([5, 6, 7, 8, 9]); // five turns, consecutively numbered
    expect(game.violations()).toEqual([]);
  });

  test("control: with no Time Warp the same five turns alternate P1, P2, P1, P2, P1 — the Warp swapped a P2 turn for a P1 one, it did not add one", async () => {
    const game = await scenario()
      .turn(5)
      .active(P1)
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .fillDecks({ main: 20, runes: 20 })
      .build();
    const seats = [game.turnPlayer()];
    const numbers = [game.turnNumber()];
    for (let i = 0; i < 4; i++) {
      const next = await game.advanceTurn();
      seats.push(next.next);
      numbers.push(next.turn);
    }
    expect(seats).toEqual([P1, P2, P1, P2, P1]);
    expect(numbers).toEqual([5, 6, 7, 8, 9]);
  });
});
