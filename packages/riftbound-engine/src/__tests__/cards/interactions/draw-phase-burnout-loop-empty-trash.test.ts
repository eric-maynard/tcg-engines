/**
 * Interaction: Draven, Showboat (ogn-028-298) · Champion Unit · Fury · 3 Might
 *     "My Might is increased by your points."
 *   × Frigid Jewel (unl-074-219) · Gear · Mind
 *     "When you draw your second card each turn, give a friendly unit +2 [Might] this turn."
 *
 * Question — the pathological case (1v1, Victory Score 8). P1 has 6 points; P2 has 5 and controls
 * Draven, Showboat. P1 controls Frigid Jewel, holds 2 cards, has a 6-card Rune Deck, and BOTH its
 * Main Deck and its trash are empty. P1's turn begins:
 *   (a) Does the Channel Phase still channel 2 before anything goes wrong?
 *   (b) At the Draw Phase does P1 burn out once, or repeatedly? How many Burn Outs, what is P2's
 *       total after each, and Draven's Might along the way?
 *   (c) P1 starts AHEAD (6 v 5): at which burn-out does P2 actually win — immediately or at the next
 *       Cleanup? Does the loop overshoot past 8?
 *   (d) Did P1 ever draw (Frigid Jewel)? Does P1 reach its Main Phase? Final points per seat.
 *
 * Rules: 315.3.b (Channel 2 — the Rune Deck is a different deck, unaffected), 315.4.b / 315.4.b.1 /
 * 315.4.b.2 + 413.4 (Draw 1 from an empty Main Deck → Burn Out, then complete the draw), 431.2
 * (Burn Out: recycle trash → deck, an opponent gains 1, finish the action), 431.3 / 431.3.a (empty
 * trash → deck stays empty → the retried draw burns out AGAIN, 1 point each time), 431.3.b (points
 * after the first in the sequence cannot be prevented), 431.3.c / 431.3.c.1 (such a point that
 * reaches the Victory Score with more points than any opponent wins IMMEDIATELY — no Cleanup), 323.1
 * (win needs ≥ Victory Score AND more than any opponent: 6–6 and 7–6 do not end it, 8–6 does).
 *
 * Expected walk: Awaken, Beginning, Channel 2 (Rune Deck 6 → 4). Draw Phase: Burn Out #1 → P2 6
 * (Draven 9), retry → #2 → P2 7 (Draven 10), retry → #3 → P2 8 (Draven 11) → P2 wins on the spot.
 * Exactly three Burn Outs, no overshoot to 9; P1 drew nothing (hand 2), Frigid Jewel never
 * triggered, P1 never reaches its Main Phase. Final 6 – 8, P2 wins.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAVEN = "ogn-028-298";
const FRIGID_JEWEL = "unl-074-219";
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla stock for hands / P2's deck

const RUNE = { cardType: "rune", domain: "mind", name: "Mind Rune" } as const;

/**
 * P2 is about to end turn 2. Victory 8; P1 6, P2 5. P2: Draven in base + a small real deck (so P2's
 * own end/turn bookkeeping never burns out). P1: Frigid Jewel + a vanilla unit in base (a legal
 * "+2 Might" recipient, should the Jewel ever trigger), 2 cards in hand, Rune Deck of exactly 6,
 * Main Deck EMPTY, trash EMPTY. No deck auto-fill.
 */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .fillDecks(false)
    .victoryScore(8)
    .points(P1, 6)
    .points(P2, 5)
    .unit(P2, "base", DRAVEN, "draven")
    .deck(P2, [FILLER, FILLER, FILLER, FILLER, FILLER])
    .gear(P1, FRIGID_JEWEL, "jewel")
    .unit(P1, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, FILLER, "h1")
    .hand(P1, FILLER, "h2")
    .runeDeck(P1, [RUNE, RUNE, RUNE, RUNE, RUNE, RUNE]);
}

async function p1TurnBegins(): Promise<Game> {
  const game = await board().build();
  // Sanity of the premise.
  expect(game.p1.deck()).toEqual([]);
  expect(game.p1.trash()).toEqual([]);
  expect(game.p1.hand()).toHaveLength(2);
  expect(game.p1.runeDeck()).toHaveLength(6);
  expect(game.p1.runes()).toHaveLength(0);
  expect(game.state("draven").might).toBe(3 + 5);
  await game.p2.endTurn();
  return game;
}

describe("Draw Phase into an empty deck AND empty trash — the repeated Burn Out loop (Draven counting along, Frigid Jewel never waking)", () => {
  test("(a) the Channel Phase happens normally first: P1 channels 2 (Rune Deck 6 → 4, 2 runes in the pool) — the Rune Deck has nothing to do with burning out (315.3.b)", async () => {
    const game = await p1TurnBegins();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runeDeck()).toHaveLength(4);
  });

  test("(b)(c) the Draw Phase burns P1 out REPEATEDLY (deck stays empty: the trash had nothing to recycle) — 1 point to P2 each time: 5 → 6 (6–6, no win) → 7 (7–6, below 8) → 8 (8–6) = exactly three Burn Outs (431.3, 431.3.a, 323.1)", async () => {
    const game = await p1TurnBegins();
    expect(game.p2.points()).toBe(5 + 3);
    expect(game.p1.points()).toBe(6); // P1's own score never moves
    expect(game.p1.deck()).toEqual([]); // still empty — nothing was ever recycled into it
    expect(game.p1.trash()).toEqual([]);
  });

  test("(c) the third burn-out point (a post-first point reaching the Victory Score with more than any opponent) wins IMMEDIATELY, in the Draw Phase, without a Cleanup — and the loop stops right there: no overshoot to 9 (431.3.c, 431.3.c.1)", async () => {
    const game = await p1TurnBegins();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.p2.points()).toBe(8); // exactly the Victory Score, not 9+
    expect(game.turnPlayer()).toBe(P1); // it ended during P1's own turn …
    expect(game.phase()).toBe("draw"); // … inside the Draw Phase
    expect(game.decision()).toBeNull();
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect(game.p2.points()).toBe(8);
  });

  test("(b) Draven, Showboat tracks P2's score: 3 + 5 = 8 before the turn; the win lands with P2 on 8", async () => {
    const game = await board().build();
    expect(game.state("draven")).toMatchObject({ baseMight: 3, might: 8 });
    await game.p2.endTurn();
    expect(game.p2.points()).toBe(8);
    expect(game.state("draven").baseMight).toBe(3);
  });

  // Expected: Draven's static is continuous (rule 710 — units are evaluated at their CURRENT Might),
  // so with P2 on 8 points Draven reads 3 + 8 = 11 (having passed through 9 and 10 on the way).
  // Actual: statics are only recomputed by the next player move; points gained inside the turn flow
  // (the Draw-Phase burn-outs) leave Draven stale at the pre-turn 8 — for good here, since the game
  // is over and no further move will ever run.
  test("Draven's Might should read 11 (3 + P2's 8 points) once the burn-out points have landed (710, static ability)", async () => {
    const game = await p1TurnBegins();
    expect(game.p2.points()).toBe(8);
    expect(game.state("draven").might).toBe(11);
  });

  // Same staleness in a live game: one burn-out (trash of 1) takes P2 to 6, P1 reaches its Main
  // Phase, yet Draven still shows 8 until somebody makes a move. Expected 3 + 6 = 9 right away.
  test("after a single Draw-Phase burn-out (P2 5 → 6) Draven should already read 9 when P1's Main Phase opens (710)", async () => {
    const game = await board().trash(P1, FILLER, "lastHope").build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p2.points()).toBe(6);
    expect(game.state("draven").might).toBe(9);
  });

  test("(d) P1 never drew a card: hand still exactly the same 2, so Frigid Jewel ('your second card each turn') never triggered — no +2 on anyone, nothing on the chain", async () => {
    const game = await p1TurnBegins();
    expect(game.p1.hand().sort()).toEqual(["h1", "h2"]);
    expect(game.chain()).toEqual([]);
    expect(game.state("bystander")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(game.zoneOf("jewel")).toBe("base");
  });

  test("(d) P1 never reaches its Main Phase; final score P1 6 – P2 8, P2 wins; P2's own zones untouched (its deck of 5 intact, hand unchanged)", async () => {
    const game = await board().build();
    const p2Hand0 = game.p2.hand().length;
    await game.p2.endTurn();
    await game.settle();
    expect(game.phase()).not.toBe("main");
    expect(game.p1.legal().filter((o) => o.moveId !== "concede")).toEqual([]);
    expect(game.p1.points()).toBe(6);
    expect(game.p2.points()).toBe(8);
    expect(game.winner()).toBe(P2);
    expect(game.p2.deck()).toHaveLength(5);
    expect(game.p2.hand()).toHaveLength(p2Hand0);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — same board but ONE card in P1's trash: Burn Out #1 recycles it (P2 5 → 6, a tie, no win), the retried draw then succeeds → exactly one Burn Out, P1 draws that card (hand 3) and plays on into its Main Phase at 6 – 6", async () => {
    const game = await board().trash(P1, FILLER, "lastHope").build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.isOver()).toBe(false);
    expect(game.p2.points()).toBe(6);
    expect(game.p1.points()).toBe(6);
    expect(game.p1.hand().sort()).toEqual(["h1", "h2", "lastHope"]);
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.phase()).toBe("main");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    // Only ONE card was drawn this turn, so Frigid Jewel still has not triggered.
    expect(game.state("bystander").might).toBe(2);
  });
});
