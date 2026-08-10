/**
 * Ruling 041254a5f7e18c0b — Darius, Trifarian (OGN-027 → ogn-027-298) · Fury Champion Unit · [5][fury] · 5 Might
 *   "When you play your second card in a turn, give me +2 [Might] this turn and ready me."
 *   (+ Discipline ogn-058-298 · Reaction [2] "Give a unit +2 [Might] this turn. Draw 1." as the cards played off-turn.)
 *
 * Q: Does Darius's +2/ready work on the OPPONENT's turn?
 * A: Yes. The ability says "in a turn", not "on your turn": if YOU play two cards during the opponent's turn (typically
 *    Reactions / showdown plays), the second one triggers Darius — +2 [Might] this turn and he readies. It tracks cards
 *    you play, not whose turn it is.
 * Rules: 383 (trigger conditions read literally), 419.4.a (a card is "played" when it resolves), 813 (Reactions on any turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DARIUS = "ogn-027-298";
const DISCIPLINE = "ogn-058-298";

/**
 * P2's turn. P1: Darius EXHAUSTED in base, two Disciplines in hand, [4]. P2: a Raider (3) in base, its own Discipline + [2],
 * and bf1 held by a Sentry.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 4 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", DARIUS, "darius", { exhausted: true })
    .unit(P2, "bf1", { might: 2, name: "Sentry" }, "sentry")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, DISCIPLINE, "discA")
    .hand(P1, DISCIPLINE, "discB")
    .hand(P2, DISCIPLINE, "discP2");
}

/** P2 opens a chain on its own turn (Discipline on Raider) and passes priority to P1. */
async function p2OpensChain(): Promise<Game> {
  const game = await board().build();
  expect(game.turnPlayer()).toBe(P2);
  await game.p2.cast("discP2", { targets: "raider" });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 041254a5f7e18c0b — Darius triggers off YOUR second card even during the opponent's turn", () => {
  test("first Reaction on P2's turn (Discipline A on Darius) resolves: one card played by P1 this turn — no trigger yet (7 Might from Discipline only, still exhausted)", async () => {
    const game = await p2OpensChain();
    expect(game.p1.can("cast", "discA")).toBe(true);
    await game.p1.cast("discA", { targets: "darius" });
    for (let i = 0; i < 6 && game.chain().some((c) => c.cardId === "discA"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("discA")).toBe("trash");
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 1 });
    expect(game.chain().some((c) => c.cardId === "darius")).toBe(false);
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 7 });
  });

  test("second Reaction the same (opponent's) turn: when Discipline B resolves Darius's trigger goes on the chain and resolves — +2 more (5 + 2 from Discipline A + 2 = 9) and he READIES; it is still P2's turn", async () => {
    const game = await p2OpensChain();
    await game.p1.cast("discA", { targets: "darius" });
    for (let i = 0; i < 6 && game.chain().some((c) => c.cardId === "discA"); i++) {
      await game.acting().passPriority();
    }
    // P1 gets priority again on the still-open chain (P2's Discipline is underneath) and plays the SECOND card.
    for (let i = 0; i < 3 && game.decision()?.seat !== P1; i++) {
      await game.acting().passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.cast("discB", { targets: "raider" }); // aimed elsewhere so Darius's Might isolates his own +2
    for (let i = 0; i < 6 && game.chain().some((c) => c.cardId === "discB"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("discB")).toBe("trash");
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 2 });
    // Trigger condition met on the opponent's turn:
    expect(game.chain()).toContainEqual(expect.objectContaining({ cardId: "darius", controller: P1, triggered: true }));
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 9 }); // 5 + 2 (Discipline A) + 2 (own trigger)
    expect(game.state("darius").mightModifier).toBe(4);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("both bonuses are 'this turn': at the end of P2's turn Darius is back to 5 (and, being P1's, readies in P1's Awaken anyway)", async () => {
    const game = await p2OpensChain();
    await game.p1.cast("discA", { targets: "darius" });
    for (let i = 0; i < 6 && game.chain().some((c) => c.cardId === "discA"); i++) {
      await game.acting().passPriority();
    }
    for (let i = 0; i < 3 && game.decision()?.seat !== P1; i++) {
      await game.acting().passPriority();
    }
    await game.p1.cast("discB", { targets: "raider" });
    await game.settle();
    expect(game.state("darius").might).toBe(9);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 5 });
  });
});
