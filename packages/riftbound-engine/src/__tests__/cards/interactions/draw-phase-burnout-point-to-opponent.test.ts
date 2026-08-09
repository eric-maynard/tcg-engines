/**
 * Interaction: Draw-Phase Burn Out
 *   × Sumpworks Map   (unl-085-219) · Gear · Mind · [Reaction] [Temporary] "When an opponent scores, draw 1."  — P2's
 *   × Find Your Center (ogn-047-298) · Spell · Calm · 3 · "[Action] If an opponent's score is within 3 points of
 *     the Victory Score, this costs [2] less. Draw 1 and channel 1 rune exhausted."                              — P1's
 *
 * Board: 1v1, Victory Score 8. P2 ends turn → P1's turn. P1: 2 points, Main Deck EMPTY, trash = 3 known cards,
 * Find Your Center in hand. P2: 4 points, Sumpworks Map in base.
 *
 * Rules: 315.4.b/.b.1/.b.2 (Draw Phase draw 1; empty deck → Burn Out; STILL draw 1 afterwards), 413.4 + 431.2.a-d
 * (draw what you can = 0, recycle trash into deck randomized, CHOOSE AN OPPONENT to gain 1, complete the draw),
 * 468.1 / 471.1.a.1 (a burn-out point is a Gain, not a Score), 431.3.c/.c.1 (only points after the FIRST burn out
 * in a sequence win instantly), 319.2 / 323.1 / 472 (phase-transition Cleanup checks the Victory Score).
 *
 * Expected: (a) deck 0 → recycle 3 → P2 4→5 (P1 stays 2) → P1 draws 1: deck 2, trash 0, hand 2; exactly one
 * burn-out gain. (b) Sumpworks Map does NOT trigger (gain ≠ score). (c) P2 at 5 is within 3 of 8 → Find Your
 * Center costs 1 in P1's Main Phase. (d) P2 at 7 → 8 from the first burn out: not instant; P1 completes the draw,
 * then the Draw→Main Cleanup sees P2 ≥ 8 and ahead → P2 wins before P1 acts.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SUMPWORKS_MAP = "unl-085-219";
const FIND_YOUR_CENTER = "ogn-047-298";
const SKULKER = "ogn-175-298"; // vanilla filler

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P2 about to end turn 3. P1's main deck = `p1Deck` (default EMPTY), trash t1..t3, FYC in hand. */
function board(opts: { p2Points?: number; p1Deck?: readonly string[] } = {}) {
  return scenario()
    .turn(3)
    .active(P2)
    .victoryScore(8)
    .points(P1, 2)
    .points(P2, opts.p2Points ?? 4)
    .fillDecks({ main: 0, runes: 12 }) // no main-deck filler for anyone; rune decks still full
    .battlefield("bf1", { controller: null })
    .deck(P2, [SKULKER, SKULKER, SKULKER, SKULKER, SKULKER])
    .deck(P1, [...(opts.p1Deck ?? [])], (opts.p1Deck ?? []).map((_, i) => `deck${i + 1}`))
    .trash(P1, SKULKER, "t1")
    .trash(P1, SKULKER, "t2")
    .trash(P1, SKULKER, "t3")
    .hand(P1, FIND_YOUR_CENTER, "fyc")
    .gear(P2, SUMPWORKS_MAP, "map");
}

const gains = (game: Game) => (game.gameState as unknown as { pointsGainedThisTurn?: Record<string, Record<string, number>> }).pointsGainedThisTurn ?? {};

describe("Draw Phase Burn Out — point goes to the opponent; Sumpworks Map silent; Find Your Center discounted", () => {
  test("setup sanity: P1's Main Deck is empty, trash has exactly t1..t3, scores 2–4 of 8", async () => {
    const game = await board().build();
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.trash().sort()).toEqual(["t1", "t2", "t3"]);
    expect(game.p1.hand()).toEqual(["fyc"]);
    expect(game.p1.points()).toBe(2);
    expect(game.p2.points()).toBe(4);
    expect(game.gameState.victoryScore).toBe(8);
  });

  test("(a) the Burn Out shuffle is scoped to the burning player: P2's own Main Deck order is untouched (431.2.b)", async () => {
    const game = await board().build();
    const p2DeckBefore = [...game.p2.deck()];
    const p2TrashBefore = [...game.p2.trash()];
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.trash()).toEqual([]); // P1 really did burn out
    expect(game.p2.deck()).toEqual(p2DeckBefore);
    expect(game.p2.trash()).toEqual(p2TrashBefore);
  });

  test("(a) the Burn Out: trash recycled INTO the Main Deck, P2 (the only opponent) gains 1 → 5, P1 stays 2, then P1 still draws 1 — deck 2 / trash 0 / hand 2 (315.4.b.2, 431.2)", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p2.points()).toBe(5);
    expect(game.p1.points()).toBe(2); // P1 cannot pick themself — "chooses an OPPONENT" (431.2.c)
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.deck()).toHaveLength(2);
    expect(game.p1.hand()).toHaveLength(2);
    // The drawn card is one of the three recycled trash cards; the other two are the deck.
    const drawn = game.p1.hand().find((c) => c !== "fyc");
    expect(["t1", "t2", "t3"]).toContain(drawn as string);
    expect([...game.p1.deck(), drawn as string].sort()).toEqual(["t1", "t2", "t3"]);
  });

  test("(a) exactly ONE burn-out gain is recorded for P2 and none for P1; no player-choice prompt interrupts (1v1 forces the opponent)", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    // Nothing to answer between end of P2's turn and P1's open main phase.
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(gains(game)).toEqual({ [P2]: { "burn-out": 1 } });
    expect(game.violations()).toEqual([]);
  });

  test("(b) Sumpworks Map does NOT trigger off the burn-out point — a Gain is not a Score (468.1, 471.1.a.1): P2 draws nothing, no Map item ever hits the chain", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    const p2Deck = game.p2.deck().length;
    await game.p2.endTurn();
    expect(game.chain().some((i) => i.cardId === "map")).toBe(false);
    await game.settle();
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.p2.deck()).toHaveLength(p2Deck);
    expect(game.gameState.scoredThisTurn).toEqual({ [P1]: [], [P2]: [] });
    expect(game.zoneOf("map")).toBe("base"); // Temporary only dies at the start of P2's own Beginning Phase
  });

  test("(c) the point really landed on P2: at 5 (within 3 of 8) Find Your Center costs 2 less — castable off ONE tapped rune (1 energy)", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("cast", "fyc")).toBe(false);
    await game.p1.tapRune();
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.can("cast", "fyc")).toBe(true);
    const runesBefore = game.p1.runes().length;
    const handBefore = game.p1.hand().length;
    await game.p1.cast("fyc");
    expect(game.p1.energy()).toBe(0); // paid exactly 1
    await game.settle();
    expect(game.zoneOf("fyc")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 1); // spent FYC, drew 1
    expect(game.p1.runes()).toHaveLength(runesBefore + 1); // channelled 1 …
    expect(game.p1.runes({ ready: false })).toHaveLength(2); // … exhausted (plus the one tapped)
  });

  test("(c) contrast — no Burn Out (P1 had a card to draw): P2 stays at 4, NOT within 3 of 8, and 1 energy is not enough for Find Your Center (full 3)", async () => {
    const game = await board({ p1Deck: [SKULKER] }).build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.p2.points()).toBe(4);
    expect(game.p1.points()).toBe(2);
    expect(gains(game)).toEqual({});
    expect(game.p1.trash().sort()).toEqual(["t1", "t2", "t3"]); // untouched
    expect(game.p1.hand().sort()).toEqual(["deck1", "fyc"]);
    await game.p1.tapRune();
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.can("cast", "fyc")).toBe(false);
    await game.p1.tapRune();
    expect(game.p1.can("cast", "fyc")).toBe(false); // 2 < 3
  });

  // ---- (d) P2 starts at 7 -------------------------------------------------------------------------

  test("(d) P2 at 7: the burn-out point makes it 8 and P2 WINS — P1 never gets a Main Phase action; final 2–8", async () => {
    const game = await board({ p2Points: 7 }).build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.p1.points()).toBe(2);
    expect(game.p2.points()).toBe(8);
    expect(game.decision()).toBeNull(); // no main-phase menu for P1, ever
    expect(game.zoneOf("fyc")).toBe("hand"); // never cast
  });

  // 431.2.d + 431.3.c/.c.1 + 319.2/323.1: the FIRST burn out's point is not an instant win; P1
  // completes the Draw (recycle 3, draw 1 → hand 2, deck 2, trash 0) and only the Draw→Main Cleanup crowns P2.
  test("(d) the win waits for the next Cleanup — P1 still finishes the burn-out draw (hand 2, deck 2, trash 0) before P2 is declared the winner", async () => {
    const game = await board({ p2Points: 7 }).build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.winner()).toBe(P2);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.deck()).toHaveLength(2);
  });
});
