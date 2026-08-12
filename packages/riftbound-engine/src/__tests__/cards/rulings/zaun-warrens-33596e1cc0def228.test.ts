/**
 * Ruling 33596e1cc0def228 — Zaun Warrens (OGN-298 → ogn-298-298) · Battlefield
 *   "When you conquer here, discard 1, then draw 1."
 *
 * Q: At 7 points, conquering makes you draw a card instead of gaining the point. When does that draw happen
 *    relative to the "when I conquer" triggers?
 * A: It happens AS you conquer, replacing the normal point gain, so it comes first; only afterwards do the
 *    "when I conquer" effects trigger (and you may order them as you like).
 * Rules: 471.1.b.1 (a Conquer point at one short of the Victory Score becomes a draw unless every battlefield
 *        was scored), 471.2 (Score abilities trigger after the point/draw is handled).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZAUN_WARRENS = "ogn-298-298";

/**
 * P1 is on 7 of 8 points and holds nothing. P2 controls the live Zaun Warrens (a 2-Might Guard there) and a
 * second battlefield P1 will NOT have scored, so the Final Point is not available. P1's deck is X then Y.
 */
function board() {
  return scenario()
    .victoryScore(8)
    .points(P1, 7)
    .battlefield("warrens", { controller: P2, def: ZAUN_WARRENS, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "warrens", { might: 2, name: "Guard" }, "guard")
    .unit(P2, "bf2", { might: 2, name: "Sentry" }, "sentry")
    .unit(P1, "base", { might: 6, name: "Brute" }, "brute")
    .deck(P1, ["ogn-009-298", "ogn-175-298", "ogn-175-298"], ["x", "y", "z"])
    .fillDecks(false);
}

/** P1's Brute takes the Warrens. */
async function conquer(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.hand()).toEqual([]);
  await game.p1.move("brute", "warrens");
  await game.settle();
  expect(game.gameState.battlefields.warrens?.controller).toBe(P1);
  return game;
}

describe("Ruling 33596e1cc0def228 — the Final-Point substitute draw happens as you conquer, BEFORE the conquer triggers", () => {
  test("the point is not gained: P1 stays on 7 and the game is not over", async () => {
    const game = await conquer();
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
  });

  test("ruling: the draw comes first — X is drawn by the substitution, so the Warrens' 'discard 1' has X to discard, and its 'draw 1' then yields Y", async () => {
    const game = await conquer();
    expect(game.zoneOf("x")).toBe("trash"); // drawn first, then discarded by the battlefield
    expect(game.p1.hand()).toEqual(["y"]); // the Warrens' own draw
    expect(game.zoneOf("z")).toBe("mainDeck");
    expect(game.violations()).toEqual([]);
  });

  test("control: below the Final-Point threshold there is no substitute draw — conquering just scores, and the Warrens then makes P1 discard the card it drew", async () => {
    const game = await board().points(P1, 3).build();
    await game.p1.move("brute", "warrens");
    await game.settle();
    expect(game.p1.points()).toBe(4); // the point was gained normally
    // Only the Warrens acted: draw X? no — it discards FIRST, from an empty hand, then draws.
    expect(game.p1.hand()).toEqual(["x"]);
    expect(game.p1.trash()).toEqual([]);
  });
});
