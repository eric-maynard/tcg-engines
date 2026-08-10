/**
 * Ruling c8094da8255b9020 — The Grand Plaza (OGN-293 → ogn-293-298) · Battlefield
 *     "When you hold here, if you have 7+ units here, you win the game."
 *   × Recruit (ogn-273-298) · 1-Might unit token
 *
 * Q: Do Recruit tokens count towards the 7+ units required to hold Grand Plaza to win?
 * A: Yes. Tokens are not cards, but they are still units — they count toward "7+ units here".
 * Rules: 186 (tokens are game objects of their type, not cards), 108.2 / 740.1.a ("units" you control includes unit
 *        tokens), 469.2 / 471.2 (hold triggers in your Beginning Phase), 383.2.a.1 (intervening "if").
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GRAND_PLAZA = "ogn-293-298";
const RECRUIT = "ogn-273-298"; // 1-Might Recruit unit token

/** P2 about to end the turn; P1 controls the (live) Plaza with `cards` vanilla units and `tokens` Recruit tokens. */
function plaza(cards: number, tokens: number) {
  const b = scenario().active(P2).victoryScore(8).battlefield("plaza", { controller: P1, def: GRAND_PLAZA, inert: false, owner: P1 });
  for (let i = 0; i < cards; i++) {
    b.unit(P1, "plaza", { might: 1, name: `Citizen ${i}` }, `c${i}`);
  }
  for (let i = 0; i < tokens; i++) {
    b.unit(P1, "plaza", RECRUIT, `r${i}`);
  }
  return b;
}

describe("Ruling c8094da8255b9020 — Recruit tokens are units and count toward The Grand Plaza's 7+", () => {
  test("4 unit cards + 3 Recruit TOKENS = 7 units here: on P1's hold the Plaza triggers and P1 wins the game", async () => {
    const game = await plaza(4, 3).build();
    expect(game.state("r0").isToken).toBe(true);
    expect(game.state("r0").cardType).toBe("unit");
    expect(game.p1.units("plaza")).toHaveLength(7);
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "plaza", controller: P1, triggered: true })]);
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p1.points()).toBe(1); // just the hold point — the win is the Plaza's, not a points win
  });

  test("seven Recruit tokens and no unit cards at all also win — tokens alone satisfy 'units here'", async () => {
    const game = await plaza(0, 7).build();
    await game.advanceTurn();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("contrast — 4 cards + 2 tokens is only 6: the hold scores its point but the Plaza never triggers, no win", async () => {
    const game = await plaza(4, 2).build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.isOver()).toBe(false);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
