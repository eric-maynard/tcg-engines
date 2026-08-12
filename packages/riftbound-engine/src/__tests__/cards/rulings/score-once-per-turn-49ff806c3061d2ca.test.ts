/**
 * Ruling 49ff806c3061d2ca — (no specific card) scoring the same battlefield twice in a turn.
 *   Exercised with Ride the Wind (OGN-173 → ogn-173-298) "[Action] Move a friendly unit and ready it."
 *   and Charm (OGN-043 → ogn-043-298) "Move an enemy unit."
 *
 * Q: Can a player conquer and score the same battlefield several times in one turn by moving units
 *    in and out of it?
 * A: No — each PLAYER may score a given battlefield only once per turn. Leaving and re-conquering it
 *    the same turn conquers again but yields no second point. Both players may each score it once,
 *    though: hand the empty, already-scored battlefield to your opponent and they still score it.
 * Rules: 465/471.2.c (score once per battlefield per player per turn), 323.6 (control lapses when
 *        the last unit leaves), 344.2 (each arrival stages a new showdown).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const CHARM = "ogn-043-298";

/** P1 with a Scout, Ride the Wind and Charm; P2 with a Thug in base; one open battlefield. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { calm: 1, chaos: 1 } })
    .battlefield("bf1")
    .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 3, name: "Thug" }, "thug")
    .hand(P1, RIDE_THE_WIND, "ride")
    .hand(P1, CHARM, "charm");
}

/** Conquer bf1 with the Scout, then pull it home (readied) so bf1 is empty and uncontrolled again. */
async function conquerThenLeave(game: Game): Promise<void> {
  await game.p1.move("scout", "bf1");
  await game.settle();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  await game.p1.cast("ride", { targets: "scout", answers: ["base"] });
  await game.settle();
  expect(game.locationOf("scout")).toBe("base");
  expect(game.state("scout").isReady).toBe(true);
  expect(game.gameState.battlefields.bf1?.controller).toBeFalsy(); // control lapsed (323.6)
}

describe("Ruling 49ff806c3061d2ca — one score per battlefield per player per turn", () => {
  test("walking back in re-conquers bf1 but scores no second point for P1", async () => {
    const game = await board().build();
    await conquerThenLeave(game);
    await game.p1.move("scout", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // conquered again…
    expect(game.p1.points()).toBe(1); // …but no point
    expect(game.violations()).toEqual([]);
  });

  test("the OPPONENT has not scored it yet: charming their unit onto the empty battlefield gives THEM the point", async () => {
    const game = await board().build();
    await conquerThenLeave(game);
    await game.p1.cast("charm", { targets: "thug", answers: ["bf1"] });
    await game.settle();
    expect(game.locationOf("thug")).toBe("bf1");
    // The arrival staged a showdown at an uncontrolled battlefield; both pass Focus to close it.
    await game.p2.passFocus();
    await game.p1.passFocus();
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1); // P2's first score of bf1 this turn
    expect(game.p1.points()).toBe(1); // P1's stays where it was
    expect(game.violations()).toEqual([]);
  });

  test("the ledger is per turn: the same battlefield scores again for P1 on P1's NEXT turn", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    await game.advanceTurn();
    await game.advanceToTurnOf(P1);
    // Holding bf1 into P1's next turn scores it once more (a Hold, one score for the new turn).
    expect(game.p1.points()).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
