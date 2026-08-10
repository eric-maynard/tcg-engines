/**
 * Ruling 00ad3b5b8797082c — Darius, Trifarian (OGN-027 → ogn-027-298) · Fury Champion Unit · [5][fury] · 5 Might
 *   "When you play your second card in a turn, give me +2 [Might] this turn and ready me."
 *
 * Q: Does Darius get ready if he is played as the 3rd card (instead of the 2nd)?
 * A: No. He only triggers when he "sees" the second card being played: played AS the 2nd card he triggers (for himself);
 *    played as the 3rd card the second card is already in the past — no trigger. If he is already on the board when the
 *    2nd card is played, he triggers.
 * Rules: 383 (triggered abilities only watch events while on the board / as they resolve), 419.4.a (a played card's
 *        own play counts on resolution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DARIUS = "ogn-027-298";

const cheap = (name: string) => ({ cardType: "unit", energyCost: 1, might: 1, name });

/** P1's turn with [7] + 1 fury: Darius (5+fury) and two 1-cost recruits in hand. */
function handBoard() {
  return scenario()
    .resources(P1, { energy: 7, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .hand(P1, DARIUS, "darius")
    .hand(P1, cheap("Recruit A"), "a")
    .hand(P1, cheap("Recruit B"), "b");
}

describe("Ruling 00ad3b5b8797082c — Darius must witness the second card: 2nd = yes, 3rd = no, on board = yes", () => {
  test("played AS the second card: A first, then Darius — his own play is the 2nd card, he triggers: enters, then +2 (→ 7) and READY", async () => {
    const game = await handBoard().build();
    await game.p1.play("a");
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 1 });
    await game.p1.play("darius");
    expect(game.zoneOf("darius")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "darius", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 2 });
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7 });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 0 } });
  });

  test("played as the THIRD card: A, B, then Darius — the second card (B) was played before he existed on the board, so NO trigger: he enters exhausted at 5 Might and stays so", async () => {
    const game = await handBoard().build();
    await game.p1.play("a");
    await game.settle();
    await game.p1.play("b");
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 2 });
    expect(game.chain()).toEqual([]);
    await game.p1.play("darius");
    expect(game.zoneOf("darius")).toBe("base");
    expect(game.chain().some((c) => c.cardId === "darius")).toBe(false);
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 3 });
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5, mightModifier: 0 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance: Darius ALREADY on the board (exhausted) sees the 2nd card — A then B: B's play triggers him, +2 (→ 7) and readied", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", DARIUS, "darius", { exhausted: true })
      .hand(P1, cheap("Recruit A"), "a")
      .hand(P1, cheap("Recruit B"), "b")
      .build();
    await game.p1.play("a");
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 }); // first card: nothing
    await game.p1.play("b");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "darius", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7 });
    // "this turn": gone after the turn ends.
    await game.advanceTurn();
    expect(game.state("darius").might).toBe(5);
  });
});
