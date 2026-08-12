/**
 * Ruling c593e3bc5b438b57 — Nocturne, Horrifying (OGN-194 → ogn-194-298) · Unit · [4][chaos] · 4 [Might]
 *   "[Ganking]. As you look at or reveal me from the top of your deck, you may banish me. If you do, you may play me
 *    for [rainbow]."
 *   × Mystic Poro (OGN-171 → ogn-171-298) · Unit · [2] · "[Vision] (When you play me, look at the top card of your
 *     Main Deck. You may recycle it.)" as the look-at-the-top effect.
 *
 * Q: Did a rule update or errata change how Teemo, Grand Strategist and Nocturne interact?
 * A: No — the interaction is unchanged. The only thing the errata altered is the ORDER: Nocturne is banished first
 *    and is then played out of banishment for [rainbow], rather than being played straight off the deck.
 * Rules: 359.3.e.14 ("if you do" links the second offer to the first), 383.3.a.3 (a later "you may" is decided as the
 *        effect happens), 168 (banishment is a zone; the card is played from there).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const NOCTURNE_HORRIFYING = "ogn-194-298";
const MYSTIC_PORO = "ogn-171-298";

/** P1's turn: Nocturne sits on top of the Main Deck, and a [Vision] body is in hand to look at it. */
function board() {
  return scenario()
    .deckTop(P1, NOCTURNE_HORRIFYING, "noct")
    .hand(P1, MYSTIC_PORO, "poro")
    .resources(P1, { energy: 2, power: { rainbow: 1 } });
}

/** Play the [Vision] unit and let it resolve, so the look at the top card happens. */
async function lookAtTop() {
  const game = await board().build();
  expect(game.zoneOf("noct")).toBe("mainDeck");
  await game.p1.play("poro");
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Ruling c593e3bc5b438b57 — Nocturne is banished first, then played out of banishment", () => {
  test("merely LOOKING at the top card sets off Nocturne's offer, while it is still in the deck", async () => {
    const game = await lookAtTop();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "noct" } });
    expect(game.zoneOf("noct")).toBe("mainDeck");
  });

  test("accepting banishes it FIRST — the play offer only comes afterwards, from banishment", async () => {
    const game = await lookAtTop();
    await game.p1.yes();
    expect(game.zoneOf("noct")).toBe("banishment");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "noct" } });
    expect(game.p1.power("rainbow")).toBe(1); // nothing paid yet
  });

  test("accepting the second offer plays it for [rainbow] and it enters the board", async () => {
    const game = await lookAtTop();
    await game.p1.yes();
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("noct")).toBe("base");
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.state("noct")).toMatchObject({ baseMight: 4, controller: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("declining the banish leaves it untouched on top of the deck", async () => {
    const game = await lookAtTop();
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("noct")).toBe("mainDeck");
    expect(game.p1.power("rainbow")).toBe(1);
  });

  test("declining only the PLAY still leaves it banished — the banish is not undone", async () => {
    const game = await lookAtTop();
    await game.p1.yes();
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("noct")).toBe("banishment");
    expect(game.p1.power("rainbow")).toBe(1);
  });
});
