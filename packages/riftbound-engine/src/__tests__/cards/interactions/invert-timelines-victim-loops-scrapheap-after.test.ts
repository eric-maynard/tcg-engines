/**
 * Interaction: Invert Timelines (ogn-201-298) · Spell · Chaos · 3 + [chaos] · "Each player discards their hand, then draws 4."
 *   × Scrapheap (ogn-182-298) · Gear · Chaos · 2 · "When this is played, discarded, or killed, draw 1."
 *
 * Question: P1's turn, Victory Score 8, P1 on 5, P2 on 4. P1 casts Invert Timelines; after casting P1's hand is
 * [H1, H2] and P1's deck is healthy (12). P2's Main Deck is EMPTY and P2's trash is EMPTY.
 *   (a) P2's hand = [Scrapheap, B, C] (3): order of operations, how many Burn Outs during P2's draw 4, who wins and
 *       when, does Scrapheap's discard trigger ever resolve, where is Invert Timelines at game end?
 *   (b) P2's hand = [Scrapheap, B, C, D] (4): P2 can exactly refill — does the game continue? What does Scrapheap's
 *       pending "draw 1" then do with deck and trash empty again? Contrast the chain state of the win with (a).
 *   (c) P2's hand = [B, C, D, E] (4, no Scrapheap): final state.
 *
 * Rules: 303.2.a (simultaneous instructions are sequenced in Turn Order from the turn player — P1 discards and
 * draws first), 422.1 / 422.1.b (discard; discard triggers are handled after the discard — here after the spell
 * finishes resolving), 413.4 (draw as many as possible → Burn Out → draw the rest), 431.2.b–d (Burn Out: recycle
 * trash into deck, an opponent gains 1, finish the draw), 431.3 / 431.3.a (empty trash → deck stays empty → the
 * retried draw burns out again, 1 point each), 431.3.b / 431.3.c / 431.3.c.1 (points after the first of a
 * sequence can't be prevented and WIN IMMEDIATELY on reaching the Victory Score with more than any opponent — no
 * Cleanup needed), 321 / 319.5 / 323.1 (otherwise a win is checked at a Cleanup, which can't happen mid-resolution),
 * 472 (winning ends the game).
 *
 * Expected: (a) P1 discards H1, H2 and draws 4 FIRST. P2 discards S, B, C (Scrapheap's trigger pending), draws 4:
 * deck 0 → Burn Out #1 (recycle 3, P1 6) → draws S, B, C → 1 still owed, deck 0 / trash 0 → Burn Out #2 (P1 7) →
 * Burn Out #3 (P1 8 > 4) → P1 wins IMMEDIATELY mid-resolution. Exactly 3 Burn Outs; Invert Timelines is still the
 * resolving item (NOT in P1's trash); Scrapheap's trigger never resolved; P2 holds its same 3 cards; P1 hand = 4
 * fresh cards, P1 trash = {H1, H2}. (b) one Burn Out inside the spell (P1 6), P2 draws all 4 back; Invert → trash;
 * no win at 6. Scrapheap's trigger then resolves: draw 1 from deck 0 / trash 0 → a NEW sequence: #1 → 7 (first —
 * not an immediate win), #2 → 8 → P1 wins immediately; Invert already in trash; P2 hand = its 4 cards. (c) one Burn
 * Out (P1 6), P2 redraws its 4, spell → trash, game continues 6–4 with P2 deck 0 / trash 0 (P2 loops at its next
 * Draw Phase).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const INVERT_TIMELINES = "ogn-201-298";
const SCRAPHEAP = "ogn-182-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker — P1's deck stock

const plain = (n: string) => ({ cardType: "unit", domain: "chaos", energyCost: 1, might: 1, name: `Card ${n}` });
const P1_DECK = ["p1d1", "p1d2", "p1d3", "p1d4", "p1d5", "p1d6", "p1d7", "p1d8", "p1d9", "p1d10", "p1d11", "p1d12"];

/**
 * P1's turn, Victory Score 8, P1 5 / P2 4. P1: Invert Timelines + H1 + H2 in hand, exactly 3 + [chaos], deck of 12.
 * P2: Main Deck EMPTY, trash EMPTY (no filler anywhere), hand per variant:
 *   "S3" = [Scrapheap, B, C] · "S4" = [Scrapheap, B, C, D] · "N4" = [B, C, D, E].
 */
function board(p2Hand: "S3" | "S4" | "N4") {
  const s = scenario()
    .fillDecks(false)
    .victoryScore(8)
    .points(P1, 5)
    .points(P2, 4)
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .hand(P1, INVERT_TIMELINES, "invert")
    .hand(P1, plain("H1"), "H1")
    .hand(P1, plain("H2"), "H2")
    .deck(P1, Array<string>(12).fill(FILLER), P1_DECK);
  if (p2Hand !== "N4") {
    s.hand(P2, SCRAPHEAP, "S");
  }
  s.hand(P2, plain("B"), "B").hand(P2, plain("C"), "C");
  if (p2Hand !== "S3") {
    s.hand(P2, plain("D"), "D");
  }
  if (p2Hand === "N4") {
    s.hand(P2, plain("E"), "E");
  }
  return s;
}

/** Cast Invert Timelines and have both players pass once → it resolves (as far as the game lets it). */
async function invertResolves(p2Hand: "S3" | "S4" | "N4"): Promise<Game> {
  const game = await board(p2Hand).build();
  expect(game.p2.deck()).toEqual([]);
  expect(game.p2.trash()).toEqual([]);
  await game.p1.cast("invert");
  expect(game.p1.hand().sort()).toEqual(["H1", "H2"]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Invert Timelines into an opponent with an empty deck AND empty trash — Burn Out loops, and Scrapheap's trigger afterwards", () => {
  test("setup sanity: 3 + [chaos] paid, Invert Timelines on the chain, P1 holds H1 + H2, P2's deck and trash are empty, 5 – 4 towards 8", async () => {
    const game = await board("S3").build();
    await game.p1.cast("invert");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "invert", controller: P1, triggered: false })]);
    expect(game.p1.hand().sort()).toEqual(["H1", "H2"]);
    expect(game.p2.hand().sort()).toEqual(["B", "C", "S"]);
    expect(game.p2.deck()).toEqual([]);
    expect(game.p2.trash()).toEqual([]);
    expect([game.p1.points(), game.p2.points(), game.gameState.victoryScore]).toEqual([5, 4, 8]);
  });

  // ---- (a) P2 holds 3: cannot refill → loops to death mid-spell -----------------------------------------------------------

  test("(a) P1 (turn player) is processed FIRST (303.2.a): by the time the game ends P1 has already discarded H1, H2 and drawn its top 4 — which could not have happened had P2's fatal draw been sequenced first", async () => {
    const game = await invertResolves("S3");
    expect(game.p1.trash().sort()).toEqual(["H1", "H2"]);
    expect(game.p1.hand().sort()).toEqual(["p1d1", "p1d2", "p1d3", "p1d4"]);
    expect(game.p1.deck()).toHaveLength(8);
  });

  test("(a) P2 discards S, B, C and tries to draw 4: Burn Out #1 recycles those 3 (P1 6) and P2 draws them straight back; the 4th draw finds deck 0 / trash 0 → Burn Out #2 (P1 7) → Burn Out #3 (P1 8) — exactly THREE Burn Outs, P1 +3, no overshoot", async () => {
    const game = await invertResolves("S3");
    expect(game.p1.points()).toBe(5 + 3);
    expect(game.p2.points()).toBe(4);
    expect(game.p2.hand().sort()).toEqual(["B", "C", "S"]); // its same three cards, drawn back after the recycle
    expect(game.p2.deck()).toEqual([]);
    expect(game.p2.trash()).toEqual([]);
  });

  test("(a) the third point (post-first, 8 ≥ Victory Score and 8 > 4) wins IMMEDIATELY, mid-resolution, without a Cleanup (431.3.c.1): game over, P1 wins, nobody has a decision; no opponent-choice prompt was needed in 1v1", async () => {
    const game = await invertResolves("S3");
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.decision()).toBeNull();
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect(game.p1.points()).toBe(8);
    expect(game.violations()).toEqual([]);
  });

  test("(a) at game end Invert Timelines is still the resolving chain item — NOT in P1's trash (P1's trash is exactly {H1, H2}) — and Scrapheap's 'discarded → draw 1' trigger never resolved: P2 drew nothing from it", async () => {
    const game = await invertResolves("S3");
    expect(game.zoneOf("invert")).not.toBe("trash");
    expect(game.zoneOf("invert")).toBe("chain");
    expect(game.p1.trash().sort()).toEqual(["H1", "H2"]);
    expect(game.p2.hand()).toHaveLength(3);
    expect(game.zoneOf("S")).toBe("hand");
  });

  // ---- (b) P2 holds Scrapheap + 3: refills exactly, then dies to its own Scrapheap ---------------------------------------------

  test("(b) with 4 cards P2 discards 4, Burn Out #1 (P1 5 → 6) recycles them and P2 draws all 4 back — exactly ONE Burn Out inside the spell; Invert Timelines finishes and goes to P1's trash; 6 points is no win, the game continues", async () => {
    const game = await invertResolves("S4");
    expect(game.isOver()).toBe(false);
    expect(game.p1.points()).toBe(6);
    expect(game.p2.points()).toBe(4);
    expect(game.zoneOf("invert")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["H1", "H2", "invert"]);
    expect(game.p1.hand().sort()).toEqual(["p1d1", "p1d2", "p1d3", "p1d4"]);
    expect(game.p2.hand().sort()).toEqual(["B", "C", "D", "S"]);
    expect(game.p2.deck()).toEqual([]);
    expect(game.p2.trash()).toEqual([]);
  });

  test("(b) only NOW is Scrapheap's discard trigger put on the chain (422.1.b) — P2's triggered item, P2 holding Priority first — after the spell has completely finished (both hands already refilled)", async () => {
    const game = await invertResolves("S4");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "S", controller: P2, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.hand()).toHaveLength(4);
    expect(game.p1.hand()).toHaveLength(4);
  });

  test("(b) P2 pass, P1 pass → the trigger resolves: 'draw 1' with deck 0 / trash 0 starts a NEW Burn Out sequence — #1 → P1 7 (first of the sequence, and 7 < 8 anyway), deck still empty, retry → #2 → P1 8 > 4 → P1 wins immediately; P2 never drew (hand still its 4), Invert Timelines was already in the trash", async () => {
    const game = await invertResolves("S4");
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p1.points()).toBe(8); // 6 + exactly two more
    expect(game.p2.points()).toBe(4);
    expect(game.p2.hand().sort()).toEqual(["B", "C", "D", "S"]);
    expect(game.p2.deck()).toEqual([]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.zoneOf("invert")).toBe("trash"); // contrast with (a)
    expect(game.decision()).toBeNull();
    expect(game.violations()).toEqual([]);
  });

  test("(b) moral: surviving the spell with exactly 4 cards still loses to your own Scrapheap — total P1 gain over the whole line is 1 (spell) + 2 (trigger) = 3", async () => {
    const game = await invertResolves("S4");
    const afterSpell = game.p1.points();
    await game.settle();
    expect(afterSpell - 5).toBe(1);
    expect(game.p1.points() - afterSpell).toBe(2);
    expect(game.winner()).toBe(P1);
  });

  // ---- (c) P2 holds 4 plain cards: refills exactly, nothing pending -------------------------------------------------------------

  test("(c) no Scrapheap: Burn Out #1 (P1 6), recycle 4, draw 4; spell → trash; no further triggers; the game continues at 6 – 4 in P1's main phase with P2 on hand 4 / deck 0 / trash 0", async () => {
    const game = await invertResolves("N4");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.isOver()).toBe(false);
    expect(game.p1.points()).toBe(6);
    expect(game.p2.points()).toBe(4);
    expect(game.zoneOf("invert")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["H1", "H2", "invert"]);
    expect(game.p1.hand().sort()).toEqual(["p1d1", "p1d2", "p1d3", "p1d4"]);
    expect(game.p2.hand().sort()).toEqual(["B", "C", "D", "E"]);
    expect(game.p2.deck()).toEqual([]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) …and P2 is doomed anyway: when P1 ends the turn, P2's Draw Phase draws from deck 0 / trash 0 and loops — Burn Out → P1 7, Burn Out → P1 8 → P1 wins during P2's Draw Phase (431.3.a)", async () => {
    const game = await invertResolves("N4");
    await game.settle();
    await game.p1.endTurn();
    await game.settle();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("draw");
    expect(game.p2.hand()).toHaveLength(4); // never drew
  });
});
