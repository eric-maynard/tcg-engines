/**
 * Ruling 1fb2e972d429fd3d — Time Warp (OGN-122 → ogn-122-298) · [10][mind]×4
 *   "Take a turn after this one. Banish this."
 *
 * Q: When someone plays Time Warp, does the player whose turn would have come next still collect
 *    their holding points?
 * A: No. Holding points are scored in YOUR Beginning Phase, and Time Warp inserts an extra turn for
 *    its caster before that player's turn arrives — so the skipped-over player scores nothing until
 *    their turn actually begins. The caster, taking a second Beginning Phase, scores their holds twice.
 * Rules: 469 (holding scores at the start of your Beginning Phase), 734–738 (an additional turn is
 *        inserted directly after the current turn; the queue then resumes).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIME_WARP = "ogn-122-298";

/**
 * Turn 2, P1 active, victory far away. Each player durably holds one battlefield (a unit is parked
 * there), so every Beginning Phase is worth exactly 1 point to whoever's turn it is.
 * P1 holds Time Warp and can afford it.
 */
function board() {
  return scenario()
    .turn(2)
    .active(P1)
    .victoryScore(30)
    .resources(P1, { energy: 10, power: { mind: 4 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", { might: 2, name: "A Holder" }, "aHolder")
    .unit(P2, "bfB", { might: 2, name: "B Holder" }, "bHolder")
    .hand(P1, TIME_WARP, "warp");
}

async function castWarp(game: Game): Promise<void> {
  expect(game.p1.can("cast", "warp")).toBe(true);
  await game.p1.cast("warp");
  await game.settle();
  expect(game.zoneOf("warp")).toBe("banishment");
}

describe("Ruling 1fb2e972d429fd3d — the player skipped over by Time Warp scores no holding points", () => {
  test("baseline: without Time Warp, P2's own turn begins and P2 scores 1 for holding bfB", async () => {
    const game = await board().build();
    expect(game.p2.points()).toBe(0);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  test("ruling: P1 Time Warps on turn 2 → the next turn is P1's again; P2 is still on 0 points because P2 never had a Beginning Phase", async () => {
    const game = await board().build();
    await castWarp(game);
    const p1Before = game.p1.points();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1); // the additional turn
    expect(game.p2.points()).toBe(0); // no Beginning Phase ⇒ no holding points
    expect(game.p1.points()).toBe(p1Before + 1); // the caster does get a second hold score
  });

  test("…and P2 collects their holding point only once their real turn finally arrives", async () => {
    const game = await board().build();
    await castWarp(game);
    await game.advanceTurn(); // P1's extra turn
    expect(game.p2.points()).toBe(0);
    await game.advanceTurn(); // now P2
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("net effect over the next three turns: with Time Warp P1 banks two hold scores to P2's one; without it the split is reversed", async () => {
    const warped = await board().build();
    await castWarp(warped);
    await warped.advanceTurn(); // P1* (extra)
    await warped.advanceTurn(); // P2
    await warped.advanceTurn(); // P1
    expect(warped.p1.points()).toBe(2);
    expect(warped.p2.points()).toBe(1);
    expect(warped.zoneOf("warp")).toBe("banishment");
    expect(warped.violations()).toEqual([]);

    const plain = await board().build();
    await plain.advanceTurn(); // P2
    await plain.advanceTurn(); // P1
    await plain.advanceTurn(); // P2
    expect(plain.p1.points()).toBe(1);
    expect(plain.p2.points()).toBe(2);
  });
});
