/**
 * Ruling a100df63fcebfc64 — Zaun Warrens (OGN-298 → ogn-298-298, battlefield)
 *   "When you conquer here, discard 1, then draw 1."
 *   (the ruling calls it "Zaun Wasteland"; OGN-298 is the printed card with that text)
 *
 * Q: A player on 7 points with an EMPTY hand conquers the Warrens. In what order do the draws and the
 *    discard happen?
 * A: Draw first (the Final Point restriction turns the point into a draw), THEN the Warrens' conquer
 *    trigger: discard 1, then draw 1. So the drawn card is the one that can be discarded.
 * Rules: 471.1 then 471.2 (gain the point — or draw instead — BEFORE score abilities trigger),
 *    471.1.b.1 (Final Point: not every battlefield scored ⇒ draw a card instead), 383 (the trigger
 *    is a chain item that resolves afterwards).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZAUN_WARRENS = "ogn-298-298";
const VANILLA = "ogn-175-298"; // Shipyard Skulker — deck filler with a known identity

/**
 * P1's own turn (the Beginning Phase is already behind us, so no Draw-Phase card muddies the hand).
 * P1 is on 7 with an EMPTY hand; the Warrens is P2's, defended by a 1-Might picket, so P1's 5-Might
 * raider conquers it. bfA is nobody's, so P1 will NOT have scored every battlefield this turn.
 */
function board() {
  return scenario()
    .turn(2)
    .active(P1)
    .points(P1, 7)
    .battlefield("bfA", { controller: null })
    .battlefield("warrens", { controller: P2, def: ZAUN_WARRENS, inert: false })
    .unit(P2, "warrens", { might: 1, name: "Picket" }, "picket")
    .unit(P1, "base", { might: 5, name: "Raider" }, "raider")
    .deck(P1, [VANILLA, VANILLA, VANILLA], ["d1", "d2", "d3"]);
}

async function conquerTheWarrens(): Promise<Game> {
  const game = await board().build();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.p1.points()).toBe(7);
  expect(game.p1.hand()).toEqual([]); // the ruling's premise: no cards in hand
  expect(game.gameState.scoredThisTurn[P1] ?? []).toEqual([]);
  await game.p1.move("raider", "warrens");
  await game.settle();
  return game;
}

describe("Ruling a100df63fcebfc64 — draw instead of the 8th point, then discard, then draw", () => {
  test("the conquer happens and the game does NOT end — the Final Point is withheld", async () => {
    const game = await conquerTheWarrens();
    expect(game.zoneOf("picket")).toBe("trash");
    expect(game.gameState.battlefields.warrens?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
  });

  test("the three steps in order: d1 is drawn (instead of the point), d1 is discarded, d2 is drawn", async () => {
    const game = await conquerTheWarrens();
    // Only this exact order leaves d1 in the trash and d2 in hand: had the discard come first there
    // would have been nothing to discard (empty hand) and d1 would have stayed in hand.
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d2"]);
    expect(game.zoneOf("d3")).toBe("mainDeck");
  });

  test("net hand size is 1: two draws and one discard", async () => {
    const game = await conquerTheWarrens();
    expect(game.p1.hand().length).toBe(1);
    expect(game.p1.trash()).toContain("d1");
  });

  test("the draw-instead is not a trigger — nothing is left on the chain when it is over", async () => {
    const game = await conquerTheWarrens();
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
