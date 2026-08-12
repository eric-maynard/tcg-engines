/**
 * Ruling 9eca018e146b671c — (no specific card) the final point after losing the first battlefield.
 *
 * Q: I conquer battlefield A to reach 7, then my unit there dies so I no longer control A, then I
 *    conquer battlefield B. Do I get the 8th point?
 * A: Yes. The final-point requirement is that you SCORED every battlefield this turn, not that you
 *    still control them. The ledger of what you scored this turn is not undone by losing control.
 * Rules: 471.1.b.1 (final point via Conquer: "has Scored every Battlefield this turn"),
 *        469.1 (Conquer = gaining control of a battlefield not yet scored this turn),
 *        470 (once per battlefield per turn), 323.6 (control lapses when your last unit leaves),
 *        472 (the win is checked at a cleanup).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

/** "Kill a friendly unit." — the way the unit at the first battlefield is removed. */
const CULL = {
  abilities: [{ effect: { target: { controller: "friendly", type: "unit" }, type: "kill" }, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Cull",
  rulesText: "Kill a friendly unit.",
} as const;

/** P1's turn at 6 points, two open battlefields, two units in base and the Cull in hand. */
function board() {
  return scenario()
    .victoryScore(8)
    .points(P1, 6)
    .resources(P1, { energy: 3 })
    .battlefield("bf1")
    .battlefield("bf2")
    .unit(P1, "base", { might: 3, name: "First" }, "first")
    .unit(P1, "base", { might: 3, name: "Second" }, "second")
    .hand(P1, CULL, "cull");
}

describe("Ruling 9eca018e146b671c — the final point counts battlefields SCORED this turn, not battlefields still held", () => {
  test("step 1: conquering bf1 takes P1 from 6 to 7 (an ordinary conquer, no final-point check yet)", async () => {
    const game = await board().build();
    await game.p1.move("first", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("step 2: killing the unit at bf1 gives up control of it, and P1's score does not move", async () => {
    const game = await board().build();
    await game.p1.move("first", "bf1");
    await game.settle();
    await game.p1.cast("cull", { targets: "first" });
    await game.settle();
    expect(game.zoneOf("first")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBeFalsy();
    expect(game.p1.points()).toBe(7);
    expect(game.violations()).toEqual([]);
  });

  test("step 3 (the ruling): conquering bf2 with bf1 already abandoned still awards the 8th point and wins", async () => {
    const game = await board().build();
    await game.p1.move("first", "bf1");
    await game.settle();
    await game.p1.cast("cull", { targets: "first" });
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBeFalsy(); // not controlled at the moment of the final conquer
    await game.p1.move("second", "bf2");
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("control — conquering only bf2 while bf1 was never scored this turn draws a card instead of winning", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .battlefield("bf1")
      .battlefield("bf2")
      .unit(P1, "base", { might: 3, name: "Second" }, "second")
      .build();
    const before = game.p1.hand().length;
    await game.p1.move("second", "bf2");
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand().length).toBe(before + 1); // 471.1.b.1 — a card instead of the point
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
