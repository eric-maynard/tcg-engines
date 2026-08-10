/**
 * Ruling f5b97cf58e1226a2 — Gust (OGN-169 → ogn-169-298) · Chaos Reaction · [1]
 *   "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Darius, Trifarian (OGN-027 → ogn-027-298) · 5 Might — "When you play your second card in a turn, give me +2
 *     [Might] this turn and ready me."
 *   × Defy (OGN-045 → ogn-045-298) · Calm Reaction · [1][calm] — "Counter a spell that costs no more than [4] and no
 *     more than [rainbow]."
 *
 * Q: I play Gust as my second card and it gets countered — does it still count as a card played to ready Darius?
 * A: No. A countered card is not considered played for play-triggers (425.1.b / 419.4.a.1): Gust never resolves,
 *    Darius never "sees" a second card, so he neither gets +2 nor readies.
 * Rules: 425.1.a–c (Counter), 419.4.a / 419.4.a.1 (play-triggers fire on resolution; countered ⇒ no trigger),
 *        419.4.b (non-triggered "played a card" checks still see the finalized card).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const DARIUS = "ogn-027-298";
const DEFY = "ogn-045-298";

const cheap = (name: string) => ({ cardType: "unit", energyCost: 1, might: 1, name });

/**
 * P1's turn with [3]: Recruit (1), Gust (1), Spare (1). Darius already on board, EXHAUSTED. P2 holds bf1 with a
 * 2-Might Lookout (Gust-sized) and has Defy + [1][calm].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", DARIUS, "darius", { exhausted: true })
    .unit(P2, "bf1", { might: 2, name: "Lookout" }, "lookout")
    .hand(P1, cheap("Recruit"), "recruit")
    .hand(P1, GUST, "gust")
    .hand(P1, cheap("Spare"), "spare")
    .hand(P2, DEFY, "defy");
}

/** First card (Recruit) resolves; then Gust at the Lookout, P1 passes, P2 Defies it, chain resolves. */
async function recruitThenCounteredGust(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("recruit");
  await game.settle();
  expect(game.zoneOf("recruit")).toBe("base");
  expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 }); // first card — nothing
  await game.p1.cast("gust", { targets: "lookout" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["gust"]);
  await game.p1.passPriority();
  expect(game.p2.can("cast", "defy")).toBe(true); // Gust: [1], no power — within Defy's limits
  await game.p2.cast("defy", { targets: "gust" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["gust", "defy"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Defy resolves → Gust countered
  await game.settle();
  return game;
}

describe("Ruling f5b97cf58e1226a2 — a countered Gust is not a 'card played' for Darius, Trifarian", () => {
  test("control (no counter): Recruit then Gust resolving IS the second card — Darius triggers: +2 (→ 7) and readied; Lookout bounced", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", DARIUS, "darius", { exhausted: true })
      .unit(P2, "bf1", { might: 2, name: "Lookout" }, "lookout")
      .hand(P1, cheap("Recruit"), "recruit")
      .hand(P1, GUST, "gust")
      .build();
    await game.p1.play("recruit");
    await game.settle();
    await game.p1.cast("gust", { targets: "lookout" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Gust resolves
    expect(game.zoneOf("lookout")).toBe("hand");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "darius", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7 });
  });

  test("Gust Defied: it goes to the trash doing nothing (Lookout stays), the cost is not refunded, and Darius does NOT trigger — no chain item, still 5 Might, still exhausted", async () => {
    const game = await recruitThenCounteredGust();
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("lookout")).toBe("battlefield-bf1"); // 425.1.a — countered Gust did nothing
    expect(game.p1.energy()).toBe(1); // 425.1.c — Recruit 1 + Gust 1 spent, no refund
    expect(game.chain()).toEqual([]);
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5, mightModifier: 0 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("bookkeeping: the countered Gust was finalized so non-triggered 'played a card' checks still count it (419.4.b), but Darius's ordinal skips it — the NEXT card (Spare) is his 'second card' and triggers him", async () => {
    const game = await recruitThenCounteredGust();
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 2 });
    await game.p1.play("spare");
    expect(game.zoneOf("spare")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "darius", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7 });
  });
});
