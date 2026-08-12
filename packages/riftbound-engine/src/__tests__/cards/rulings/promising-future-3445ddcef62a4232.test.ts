/**
 * Ruling 3445ddcef62a4232 — Promising Future (OGN-115 → ogn-115-298) · [5][mind]
 *   "Each player looks at the top 5 cards of their Main Deck, banishes one of them, then recycles the
 *    rest. Starting with the next player, each player plays those cards, ignoring Energy costs."
 *
 * Q: Does Promising Future cause burnout when a player has fewer than 5 cards left in their deck?
 * A: No. You do as much as you can — look at however many are there — and burnout only happens when
 *    a player would look at / draw / mill from an EMPTY Main Deck. The cards being looked at are
 *    still in the deck zone while the spell resolves, so it can never burn a player out by itself.
 * Rules: 359.3.d ("do as much as you can"), the burnout rule (an empty Main Deck when you must take
 *        cards from it), 416 (Recycle), 356.1.b.1 ("ignoring Energy costs").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PROMISING_FUTURE = "ogn-115-298";
const SKULKER = "ogn-175-298";

/** Turn 2, P1's turn with exactly [5][mind]; P1 has `p1Deck` cards left and P2 has `p2Deck`. */
function board(p1Deck: number, p2Deck: number) {
  return scenario()
    .resources(P1, { energy: 5, power: { mind: 1 } })
    .fillDecks({ main: 0, runes: 12 })
    .deck(P1, Array.from({ length: p1Deck }, () => SKULKER), Array.from({ length: p1Deck }, (_, i) => `a${i}`))
    .deck(P2, Array.from({ length: p2Deck }, () => SKULKER), Array.from({ length: p2Deck }, (_, i) => `b${i}`))
    .hand(P1, PROMISING_FUTURE, "pf");
}

/** Cast it and answer every "banish one of these" pick with the first offered card. */
async function cast(game: Game): Promise<void> {
  await game.p1.cast("pf");
  for (let i = 0; i < 10; i++) {
    const stop = await game.settle();
    if (stop.reason !== "unanswered") {
      return;
    }
    const d = game.decision();
    if (d?.kind === "pick") {
      await game.seat(d.seat).pick(d.options[0]!.key);
      continue;
    }
    if (d?.kind === "yes-no") {
      await game.seat(d.seat).no();
      continue;
    }
    return;
  }
}

describe("Ruling 3445ddcef62a4232 — Promising Future never burns a player out for holding fewer than 5 cards", () => {
  test("control: with 6 cards apiece both players are shown 5, banish 1 and recycle the other 4 — nobody is burned out", async () => {
    const game = await board(6, 6).build();
    await cast(game);
    expect(game.isOver()).toBe(false);
    expect(game.p1.deck()).toHaveLength(5); // 6 − 1 banished
    expect(game.p2.deck()).toHaveLength(5);
  });

  test("ruling: with only 4 cards in P2's deck the spell looks at those 4, banishes 1, recycles 3 — no burnout, the game goes on", async () => {
    const game = await board(6, 4).build();
    expect(game.p2.deck()).toHaveLength(4);
    await cast(game);
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.p2.deck()).toHaveLength(3); // the other three came straight back
    expect(game.p1.deck()).toHaveLength(5);
    expect(game.zoneOf("pf")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("…and with a single card left it is that one card that is looked at — still no burnout", async () => {
    const game = await board(6, 1).build();
    expect(game.p2.deck()).toEqual(["b0"]);
    await cast(game);
    expect(game.isOver()).toBe(false);
    expect(game.p2.deck()).toHaveLength(0);
    expect(game.zoneOf("b0")).not.toBe("mainDeck"); // it was the one banished
  });

  test("the cards stay in the Main Deck zone while they are merely being looked at — only the banished one leaves", async () => {
    const game = await board(6, 4).build();
    const p2Before = game.p2.deck();
    await game.p1.cast("pf");
    await game.settle();
    // P1's own look comes first; P2's four cards are all still in P2's deck at that moment.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(game.p2.deck()).toEqual(p2Before);
    // Finish the resolution: each player banishes one and the rest go back.
    for (let i = 0; i < 8; i++) {
      const stop = await game.settle();
      const d = game.decision();
      if (stop.reason !== "unanswered" || d?.kind !== "pick") {
        break;
      }
      await game.seat(d.seat).pick(d.options[0]!.key);
    }
    const stillThere = game.p2.deck();
    expect(stillThere).toHaveLength(3);
    expect(p2Before).toEqual(expect.arrayContaining(stillThere));
  });
});
