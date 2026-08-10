/**
 * Ruling 6755b567a6c9abb2 — Time Warp (OGN-122 → ogn-122-298) · [10][mind]×4 "Take a turn after this one. Banish this."
 *   (× Ahri, Alluring OGN-066 — mentioned only as a further amplifier of hold points; not needed for the ruling.)
 *
 * Q: I hold two battlefields and gained 2 hold points this turn; I Time Warp. Do I get another 2 points for holding them on
 *    the additional turn?
 * A: Yes. An extra turn is a full turn with all phases, including the Beginning Phase in which held battlefields score.
 * Rules: 734–738 (additional turns), 316 (Beginning Phase: score 1 per battlefield you hold).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIME_WARP = "ogn-122-298";

/**
 * End of P2's turn 3 (so P1's NATURAL turn — and its hold scoring — is observed first). P1 holds bf1 and bf2 with a unit on
 * each; P2 holds nothing. P1 has Time Warp in hand and exactly [10] + 4 mind. P1 starts at 0 points; victory far away.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .victoryScore(15)
    .resources(P1, { energy: 10, power: { mind: 4 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Holder One" }, "h1")
    .unit(P1, "bf2", { might: 3, name: "Holder Two" }, "h2")
    .unit(P2, "base", { might: 1, name: "Bystander" }, "by")
    .hand(P1, TIME_WARP, "warp");
}

/** P2 ends → P1's natural turn: 2 hold points scored in its Beginning Phase; then P1 casts Time Warp and it resolves. */
async function naturalTurnThenWarp(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.points()).toBe(0);
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.p1.points()).toBe(2); // held bf1 + bf2
  // Pools empty at end of turn (the scenario's [10] was P2's-turn floating mana) — refill for the cast.
  await game.p1.do("addResources", { energy: 10 - game.p1.energy(), power: { mind: 4 - game.p1.power("mind") } });
  await game.p1.cast("warp");
  await game.settle();
  expect(game.zoneOf("warp")).toBe("banishment");
  expect(game.p1.points()).toBe(2); // casting it scores nothing by itself
  return game;
}

describe("Ruling 6755b567a6c9abb2 — the Time Warp turn scores hold points again", () => {
  test("ending the Time Warp turn gives P1 ANOTHER turn (not P2's), and its Beginning Phase scores the two held battlefields again: 2 → 4", async () => {
    const game = await naturalTurnThenWarp();
    const turnBefore = game.turnNumber();
    const extra = await game.advanceTurn();
    expect(extra.next).toBe(P1);
    expect(game.turnNumber()).toBe(turnBefore + 1);
    expect(game.phase()).toBe("main");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(4);
    expect(game.p2.points()).toBe(0);
  });

  test("the extra turn is a complete turn (channel + draw happened too), and afterwards normal order resumes with P2 — P1 does not score during P2's turn", async () => {
    const game = await naturalTurnThenWarp();
    const runesBefore = game.p1.runes().length;
    const handBefore = game.p1.hand().length;
    await game.advanceTurn(); // the extra turn
    expect(game.p1.runes().length).toBe(Math.min(12, runesBefore + 2));
    expect(game.p1.hand().length).toBe(handBefore + 1);
    const after = await game.advanceTurn();
    expect(after.next).toBe(P2);
    expect(game.p1.points()).toBe(4); // P2's Beginning Phase scores nothing for P1
    const back = await game.advanceTurn();
    expect(back.next).toBe(P1);
    expect(game.p1.points()).toBe(6); // and P1's next natural turn scores the pair once more
    expect(game.violations()).toEqual([]);
  });
});
