/**
 * Ruling 04d22dcefefbab7f — Nocturne, Horrifying (OGN-194 → ogn-194-298) × Stacked Deck (OGN-183 → ogn-183-298)
 *   Nocturne: "As you look at or reveal me from the top of your deck, you may banish me. If you do, you may
 *   play me for [rainbow]."
 *   Stacked Deck: "[Action] Look at the top 3 cards of your Main Deck. Put 1 into your hand and recycle the rest."
 *
 * Q: If Stacked Deck shows me 3 Nocturnes, can I banish (and pay for) all 3, even though Stacked Deck wants
 *    to put one into my hand?
 * A: Yes. All three may be banished as they are looked at; each may then be played for [rainbow] (or left in
 *    banishment — playing is optional). Stacked Deck then does nothing: the banished cards are no longer
 *    there to put into hand or recycle.
 * Rules: 369.1 / 370 ("as you look at" replacement), 356.1.a (alternative cost [rainbow]), 359.3.e (nothing
 *        left for Stacked Deck's instruction to act on).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const NOCTURNE = "ogn-194-298";
const STACKED_DECK = "ogn-183-298";
const SKULKER = "ogn-175-298";

const NOCS = ["noc1", "noc2", "noc3"] as const;

function board(rainbow = 3) {
  return scenario()
    .resources(P1, { energy: 1, power: { rainbow } })
    .deck(P1, [NOCTURNE, NOCTURNE, NOCTURNE, SKULKER, SKULKER], [...NOCS, "fourth", "fifth"])
    .hand(P1, STACKED_DECK, "sd");
}

/**
 * Cast Stacked Deck and walk the Nocturne offers: for each Nocturne the engine asks "banish me?" then
 * "play me for [rainbow]?". `play` decides the second answer. Asserts each offer is P1's yes/no sourced
 * from a Nocturne. Returns when an unrelated prompt (or the open main phase) is reached.
 */
async function castAndAnswer(game: Game, play: boolean): Promise<void> {
  await game.p1.cast("sd");
  expect(game.p1.energy()).toBe(0);
  for (let i = 0; i < 12; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || d?.kind !== "yes-no" || !NOCS.includes((d.source?.cardId ?? "") as (typeof NOCS)[number])) {
      return;
    }
    expect(d.seat).toBe(P1);
    const noc = d.source?.cardId as string;
    if (game.zoneOf(noc) === "mainDeck") {
      await game.p1.yes(); // "you may banish me"
      expect(game.zoneOf(noc)).toBe("banishment");
    } else {
      expect(game.zoneOf(noc)).toBe("banishment"); // "if you do, you may play me for [rainbow]"
      await (play ? game.p1.yes() : game.p1.no());
    }
  }
}

describe("Ruling 04d22dcefefbab7f — three Nocturnes off Stacked Deck: banish all three, play each for [rainbow]; Stacked Deck does nothing", () => {
  test("each of the 3 looked-at Nocturnes offers P1 'banish me?' then 'play me for [rainbow]?' — accepting all: 3 Nocturnes in base, exactly 3 rainbow spent, no energy beyond Stacked Deck's 1", async () => {
    const game = await board(3).build();
    await castAndAnswer(game, true);
    // Any leftover placement prompt (destination) — units can't be reacted to, so nothing else interrupts.
    for (let i = 0; i < 3 && game.decision()?.kind === "pick"; i++) {
      await game.p1.pick("base");
      await game.settle();
    }
    for (const n of NOCS) {
      expect(game.zoneOf(n)).toBe("base");
    }
    expect(game.p1.units("base").filter((u) => NOCS.includes(u as (typeof NOCS)[number]))).toHaveLength(3);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("Stacked Deck then has nothing to work with: no card was put into hand, nothing was recycled — the 4th card is simply on top and the deck order below is untouched", async () => {
    const game = await board(3).build();
    const deckBefore = game.p1.deck().length;
    await castAndAnswer(game, true);
    expect(game.p1.hand()).toEqual([]); // sd left, nothing came in
    const deck = game.p1.deck();
    expect(deck[0]).toBe("fourth");
    expect(deck[1]).toBe("fifth");
    expect(deck).toHaveLength(deckBefore - 3); // only the three Nocturnes left the deck
    for (const n of NOCS) {
      expect(deck).not.toContain(n);
    }
    expect(game.zoneOf("sd")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("playing is optional ('you may banish, then you may play'): banishing all three and declining every play leaves all 3 in banishment, rainbow untouched — and Stacked Deck still puts nothing in hand", async () => {
    const game = await board(3).build();
    await castAndAnswer(game, false);
    for (const n of NOCS) {
      expect(game.zoneOf(n)).toBe("banishment");
    }
    expect(game.p1.banishment().sort()).toEqual([...NOCS]);
    expect(game.p1.power("rainbow")).toBe(3);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("fourth");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
