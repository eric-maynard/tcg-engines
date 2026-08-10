/**
 * Interaction: Endless Riches (ven-022-166) · Gear · Fury · "… Skip your Draw Phase. You may play cards
 *     from your trash. If a card would go to your trash from anywhere other than your Main Deck, banish
 *     it instead."                                                          — under P1
 *   × Loose Cannon (ogn-251-298) · Legend (Jinx) · "At start of your Beginning Phase, draw 1 if you have
 *     one or fewer cards in your hand."                                    — P1's legend
 *
 * Rules: 443.1.a / 443.2 / 443.4 (Skip replaces the named procedure — the Draw Phase — with nothing;
 * 443.2.a: things keyed to it do not trigger), 315.2.a.1 (start-of-Beginning-Phase effects — Loose
 * Cannon is one; it is not the Draw Phase), 315.4.b (Draw Phase: draw 1; empty deck → Burn Out first),
 * 413.4 + 431.2.a–d (draw from an empty deck: recycle the trash into the Main Deck, an opponent gains
 * 1 point, then finish the draw), 431.2.b (the recycled cards go trash → deck, i.e. never INTO the trash,
 * so Riches' banish-instead replacement is irrelevant), 365.1 (Riches' passives work only while it is on
 * the board).
 *
 * Question: P1's Main Deck is EMPTY, its trash holds 2 previously burned cards, P2 is on 3. P1's turn
 * begins. (a) Hand 1 with Riches: does Loose Cannon still draw despite "Skip your Draw Phase" — and is
 * that a Burn Out (trash recycled, P2 +1)? (b) Then Channel 2 and a skipped Draw Phase — no second Burn
 * Out, no extra point? (c) Hand 3 with Riches: zero Burn Outs? (d) No Riches, hand 1: how many Burn Outs
 * and what do the two draws do?
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ENDLESS_RICHES = "ven-022-166";
const LOOSE_CANNON = "ogn-251-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla 3-might unit

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * Turn 2, P2 active and about to end the turn. P1: legend Loose Cannon, Main Deck EMPTY (no filler),
 * trash = t1, t2 (earlier burns), `hand` vanilla cards in hand, 12 runes in the rune deck, optionally
 * Endless Riches in base. P2 on 3 points with a small real deck of its own.
 */
function board(opts: { riches: boolean; hand: number }) {
  let b = scenario()
    .turn(2)
    .active(P2)
    .fillDecks({ main: 0, runes: 12 })
    .points(P1, 0)
    .points(P2, 3)
    .legend(P1, LOOSE_CANNON, "looseCannon")
    .trash(P1, FILLER, "t1")
    .trash(P1, FILLER, "t2")
    .deck(P2, [FILLER, FILLER, FILLER], ["p2d1", "p2d2", "p2d3"]);
  if (opts.riches) {
    b = b.gear(P1, ENDLESS_RICHES, "riches");
  }
  for (let i = 0; i < opts.hand; i++) {
    b = b.hand(P1, FILLER, `h${i + 1}`);
  }
  return b;
}

/** P2 ends the turn: P1's Beginning Phase starts with Loose Cannon's trigger pending on the chain. */
async function p1TurnBegins(opts: { riches: boolean; hand: number }): Promise<Game> {
  const game = await board(opts).build();
  expect(game.p1.deck()).toEqual([]);
  expect(game.p1.trash()).toEqual(["t1", "t2"]);
  expect(game.p1.hand()).toHaveLength(opts.hand);
  expect(game.p1.runes()).toHaveLength(0);
  await game.p2.endTurn();
  return game;
}

describe("Endless Riches 'Skip your Draw Phase' × Loose Cannon drawing from an empty deck", () => {
  // ── (a) hand 1, Riches on board ────────────────────────────────────────────────────────────

  test("(a) 'Skip your Draw Phase' does not touch a Beginning-Step trigger: Loose Cannon still goes on the chain at the start of P1's Beginning Phase (315.2.a.1, 443.2)", async () => {
    const game = await p1TurnBegins({ hand: 1, riches: true });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "looseCannon", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    // Nothing has happened yet.
    expect(game.p2.points()).toBe(3);
    expect(game.p1.hand()).toEqual(["h1"]);
  });

  test("(a) it resolves with hand ≤ 1 → draw 1 from the EMPTY deck = a Burn Out: the 2 trash cards are recycled into the Main Deck (not banished — they never go INTO the trash), P2 3 → 4, then 1 of them is drawn → deck 1, hand 2, trash 0 (413.4, 431.2.a–d)", async () => {
    const game = await p1TurnBegins({ hand: 1, riches: true });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p2.points()).toBe(4);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.banishment()).toEqual([]); // Riches' trash→banish replacement never applied
    const hand = game.p1.hand();
    const deck = game.p1.deck();
    expect(hand).toHaveLength(2);
    expect(deck).toHaveLength(1);
    expect(hand).toContain("h1");
    // t1/t2: exactly one was drawn, the other is the whole Main Deck now.
    expect([...hand.filter((c) => c !== "h1"), ...deck].sort()).toEqual(["t1", "t2"]);
  });

  // ── (b) rest of the turn start: channel yes, draw phase no ─────────────────────────────────

  test("(b) after that: Channel Phase channels 2 runes as normal, the Draw Phase is SKIPPED (replaced with nothing, 443.2) — no draw attempt, so no second Burn Out and no further point: P2 ends on exactly 4, P1's deck keeps its 1 card, and P1 is in an open Main Phase", async () => {
    const game = await p1TurnBegins({ hand: 1, riches: true });
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.deck()).toHaveLength(1); // the Draw Phase would have taken this card
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p2.points()).toBe(4); // exactly ONE Burn Out this turn
    expect(game.p1.points()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (c) hand 3, Riches on board ────────────────────────────────────────────────────────────

  test("(c) hand 3 with Riches: Loose Cannon triggers but draws nothing (hand > 1 at resolution), the Draw Phase is skipped → ZERO Burn Outs: P2 stays on 3, deck stays 0, trash keeps t1/t2, hand stays 3, runes 2", async () => {
    const game = await p1TurnBegins({ hand: 3, riches: true });
    expect(game.chain().map((c) => c.cardId)).toEqual(["looseCannon"]); // it does trigger (condition is checked on resolution)
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p2.points()).toBe(3);
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.trash()).toEqual(["t1", "t2"]);
    expect(game.p1.hand()).toEqual(["h1", "h2", "h3"]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.violations()).toEqual([]);
  });

  // ── (d) control: no Riches, hand 1 ─────────────────────────────────────────────────────────

  test("(d) WITHOUT Riches, hand 1: Loose Cannon's draw Burns Out (P2 3 → 4, trash recycled, draw 1 → deck 1), Channel 2, then the Draw Phase draws the last card normally (deck had 1 → no second Burn Out): deck 0, hand 3, trash 0, P2 exactly 4", async () => {
    const game = await p1TurnBegins({ hand: 1, riches: false });
    expect(game.chain().map((c) => c.cardId)).toEqual(["looseCannon"]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p2.points()).toBe(4); // still exactly one Burn Out
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.trash()).toEqual([]);
    const hand = game.p1.hand();
    expect(hand).toHaveLength(3); // one more card than with Riches
    expect([...hand].sort()).toEqual(["h1", "t1", "t2"]);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.violations()).toEqual([]);
  });

  test("(a)/(d) side by side: the only difference Riches makes on the hand-1 line is the skipped Draw Phase card (hand 2 & deck 1 vs hand 3 & deck 0) — the Burn Out count (P2 on 4) is the same", async () => {
    const withRiches = await p1TurnBegins({ hand: 1, riches: true });
    await withRiches.settle();
    const a = { deck: withRiches.p1.deck().length, hand: withRiches.p1.hand().length, p2: withRiches.p2.points() };
    const without = await p1TurnBegins({ hand: 1, riches: false });
    await without.settle();
    const d = { deck: without.p1.deck().length, hand: without.p1.hand().length, p2: without.p2.points() };
    expect([a.p2, d.p2]).toEqual([4, 4]);
    expect([a.hand, d.hand]).toEqual([2, 3]);
    expect([a.deck, d.deck]).toEqual([1, 0]);
  });
});
