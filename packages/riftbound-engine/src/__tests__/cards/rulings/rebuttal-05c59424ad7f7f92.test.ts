/**
 * Ruling 05c59424ad7f7f92 — Rebuttal (VEN-152 → ven-152-166) · Reaction · Mind/Chaos · 1 + [C]
 *   "Choose a spell with Energy cost no more than [4]. You may pay [rainbow]. If you do, gain control of
 *    it and you may make new choices for it. Otherwise, counter it."
 *   × Stacked Deck (OGN-183 → ogn-183-298) [Action] · 1 "Look at the top 3 cards of your Main Deck. Put 1
 *     into your hand and recycle the rest."
 *
 * Q: If I Rebuttal an opponent's Stacked Deck, can I look at 3 and take 1?
 * A: Yes — if you pay the [rainbow] you control Stacked Deck, so "your Main Deck"/"your hand" is YOURS:
 *    you look at your own top 3, put 1 in your hand, recycle the rest; the opponent gets nothing and no
 *    refund. If you don't pay, it is simply countered — nobody looks. (It "puts", it doesn't "draw".)
 * Rules: 356.1 (pay within resolution), 359.3.f.4 ("your" = controller), 425.1.a (countered), 413.1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REBUTTAL = "ven-152-166";
const STACKED_DECK = "ogn-183-298";
const SKULKER = "ogn-175-298";

/** P2's turn. P2 casts Stacked Deck (its only energy). P1 holds Rebuttal with 1 energy, [mind] for the pip and `extra` for the optional [rainbow]. */
function board(extra: Record<string, number>) {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 1 })
    .resources(P1, { energy: 1, power: { mind: 1, ...extra } })
    .deck(P1, [SKULKER, SKULKER, SKULKER, SKULKER], ["a1", "a2", "a3", "a4"])
    .deck(P2, [SKULKER, SKULKER, SKULKER, SKULKER], ["b1", "b2", "b3", "b4"])
    .hand(P2, STACKED_DECK, "sd")
    .hand(P1, REBUTTAL, "reb");
}

/** P2 casts Stacked Deck, P1 answers with Rebuttal on it; both pass until Rebuttal resolves (stops at P1's pay prompt if any). */
async function rebutStackedDeck(extra: Record<string, number>): Promise<Game> {
  const game = await board(extra).build();
  await game.p2.cast("sd");
  expect(game.p2.energy()).toBe(0);
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  expect(game.p1.can("cast", "reb")).toBe(true); // Stacked Deck costs 1 ≤ 4
  await game.p1.cast("reb", { targets: "sd" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["sd", "reb"]);
  while (game.decision()?.kind === "action" && game.chain().some((c) => c.cardId === "reb")) {
    await game.acting().passPriority();
  }
  return game;
}

describe("Ruling 05c59424ad7f7f92 — Rebuttal on Stacked Deck", () => {
  test("pay [rainbow]: P1 is asked (yes-no, P1), pays, and now controls Stacked Deck on the chain", async () => {
    const game = await rebutStackedDeck({ rainbow: 1 });
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, rainbow: 0 } });
    expect(game.zoneOf("reb")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sd", controller: P1, countered: false })]);
  });

  test("pay [rainbow]: Stacked Deck then resolves FOR P1 — P1 looks at P1's own top 3 (a1 a2 a3), puts one in P1's hand, recycles the other two to the bottom of P1's deck", async () => {
    const game = await rebutStackedDeck({ rainbow: 1 });
    await game.p1.yes();
    // Decline any "make new choices" offer — Stacked Deck has no play-time choices anyway.
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.no();
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : [];
    expect(offered).toEqual(["a1", "a2", "a3"]); // P1's deck, never b1..b3
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.pick("a2");
    await game.settle();
    expect(game.zoneOf("a2")).toBe("hand");
    expect(game.p1.hand()).toContain("a2");
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    const deck = game.p1.deck();
    expect(deck[0]).toBe("a4");
    expect(deck.slice(-2).toSorted()).toEqual(["a1", "a3"]);
    // The opponent gets nothing and no refund; their deck is untouched; the spell goes to its OWNER's trash.
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.p2.deck().slice(0, 4)).toEqual(["b1", "b2", "b3", "b4"]);
    expect(game.p2.energy()).toBe(0);
    expect(game.zoneOf("sd")).toBe("trash");
    expect(game.p2.trash()).toContain("sd");
    expect(game.violations()).toEqual([]);
  });

  test("pay [rainbow]: 'put into your hand' is not a draw — P1's cards-drawn count does not change (413.1)", async () => {
    const game = await rebutStackedDeck({ rainbow: 1 });
    await game.p1.yes();
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.no();
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    const draws = (g: Game) => (g.gameState as { turnEventCounts?: Record<string, number> }).turnEventCounts?.[`draw|p:${P1}`] ?? 0;
    const drawnBefore = draws(game);
    await game.p1.pick("a1");
    await game.settle();
    expect(game.zoneOf("a1")).toBe("hand");
    expect(draws(game)).toBe(drawnBefore); // no draw event was tallied for the put
    // Sanity: the tally is live — P1's next turn-start draw registers.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(draws(game)).toBeGreaterThanOrEqual(1);
  });

  test("don't pay: Rebuttal simply counters Stacked Deck — nobody looks at or takes anything, P2's energy is not refunded", async () => {
    const game = await rebutStackedDeck({}); // only [mind] for Rebuttal's own pip; no [rainbow] to pay with
    // Either an unpayable opt-in (canAccept false) is shown, or the engine goes straight to the counter.
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      expect(d.canAccept).toBe(false);
      await game.p1.no();
    }
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.decision()?.kind).toBe("action"); // no look/pick prompt for anyone
    expect(game.zoneOf("sd")).toBe("trash");
    expect(game.zoneOf("reb")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.p1.deck().slice(0, 4)).toEqual(["a1", "a2", "a3", "a4"]);
    expect(game.p2.deck().slice(0, 4)).toEqual(["b1", "b2", "b3", "b4"]);
    expect(game.p2.energy()).toBe(0);
  });
});
