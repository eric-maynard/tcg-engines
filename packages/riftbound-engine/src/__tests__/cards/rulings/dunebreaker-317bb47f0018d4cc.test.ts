/**
 * Ruling 317bb47f0018d4cc — Dunebreaker (SFD-027 → sfd-027-221) · Unit · Fury · [7][fury] · 7 Might
 *   "If you have two or fewer cards in your hand, I enter ready. When I hold, draw 2."
 *
 * Q: With three cards in hand INCLUDING Dunebreaker, does Dunebreaker enter ready or exhausted when I play it?
 * A: Ready. The condition is checked at the moment the unit enters the board; by then Dunebreaker has left the hand
 *    (3 − 1 = 2 cards), so "two or fewer" is met.
 * Rules: 143.4 (units normally enter exhausted), 364.3.a / 369.3 (conditional "enter ready" checked as it enters),
 *        349–350 (the played card leaves the hand before it enters the board).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const DUNEBREAKER = "sfd-027-221";
const FILLER = "ogn-175-298"; // Shipyard Skulker — any other card in hand

/** P1's turn with exactly [7][fury]; Dunebreaker plus `others` filler cards in hand. */
function handOf(others: number) {
  const s = scenario().resources(P1, { energy: 7, power: { fury: 1 } }).hand(P1, DUNEBREAKER, "dune");
  for (let i = 0; i < others; i++) {
    s.hand(P1, FILLER, `filler${i + 1}`);
  }
  return s;
}

describe("Ruling 317bb47f0018d4cc — Dunebreaker counts the hand AFTER it has left it", () => {
  test("3 cards in hand including Dunebreaker: playing it leaves 2 in hand, so it enters READY", async () => {
    const game = await handOf(2).build();
    expect(game.p1.hand()).toHaveLength(3); // dune + 2 fillers
    await game.p1.play("dune");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.p1.hand()).toEqual(["filler1", "filler2"]); // Dunebreaker already left the hand
    await game.settle();
    expect(game.zoneOf("dune")).toBe("base");
    expect(game.state("dune")).toMatchObject({ isExhausted: false, isReady: true, might: 7 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — 4 cards in hand including Dunebreaker: 3 remain, the condition fails and it enters EXHAUSTED as usual", async () => {
    const game = await handOf(3).build();
    expect(game.p1.hand()).toHaveLength(4);
    await game.p1.play("dune");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(3);
    expect(game.state("dune")).toMatchObject({ isExhausted: true, isReady: false });
  });
});
