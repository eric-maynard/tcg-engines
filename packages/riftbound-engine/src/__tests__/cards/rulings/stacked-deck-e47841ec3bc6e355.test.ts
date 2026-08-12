/**
 * Ruling e47841ec3bc6e355 — Stacked Deck (OGN-183 → ogn-183-298) · Spell · [Action] · [1]
 *   "Look at the top 3 cards of your Main Deck. Put 1 into your hand and recycle the rest."
 *
 * Q: Can I play Stacked Deck with fewer than 3 cards left in my Main Deck?
 * A: Yes. You look at as many as are there and resolve normally — put 1 into hand, recycle the rest. The
 *    only blocker is an EMPTY Main Deck (0 cards): with nothing to look at, there is no legal play.
 * Rules: 355.8 (a play needs something to do), 425 / "as much as possible" (an instruction affecting fewer
 *        objects than named still resolves), 419 (draw/look), 424 (recycle).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const STACKED_DECK = "ogn-183-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker, a vanilla 3-Might unit

/** P1's main phase with exactly [1] and Stacked Deck in hand; the Main Deck holds `n` named cards and nothing else. */
function board(n: number) {
  const defs = Array.from({ length: n }, () => FILLER);
  const aliases = Array.from({ length: n }, (_, i) => `d${i + 1}`);
  return scenario().resources(P1, { energy: 1 }).fillDecks(false).hand(P1, STACKED_DECK, "stacked").deck(P1, defs, aliases);
}

describe("Ruling e47841ec3bc6e355 — Stacked Deck needs cards, not three of them", () => {
  test("premise: with 2 cards left the deck is short of the printed 3", async () => {
    const game = await board(2).build();
    expect(game.p1.deck()).toEqual(["d1", "d2"]);
  });

  test("ruling: it is playable with only 2 cards in the deck", async () => {
    const game = await board(2).build();
    expect(game.p1.can("cast", "stacked")).toBe(true);
  });

  test("…and resolves normally: P1 is shown the 2 available cards, keeps 1, and the other is recycled", async () => {
    const game = await board(2).build();
    await game.p1.cast("stacked");
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["d1", "d2"]);
    await game.p1.pick("d1");
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()).toEqual(["d2"]); // the rest is recycled (back into the deck), not lost
    expect(game.zoneOf("stacked")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("with exactly 1 card left it still works — that single card is the only option and goes to hand", async () => {
    const game = await board(1).build();
    expect(game.p1.can("cast", "stacked")).toBe(true);
    await game.p1.cast("stacked");
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()).toEqual([]);
    expect(game.zoneOf("stacked")).toBe("trash");
  });

  // The engine's 355.8 gate does not look at the Main Deck's size, so the play is offered and simply does nothing.
  test.failing("BUG: ruling e47841ec3bc6e355 — with an EMPTY Main Deck the play should be illegal, but the engine offers and resolves it", async () => {
    const game = await board(0).build();
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.can("cast", "stacked")).toBe(false);
    const attempt = await game.p1.try((p) => p.cast("stacked"));
    expect(attempt.ok).toBe(false);
    expect(game.zoneOf("stacked")).toBe("hand");
    expect(game.p1.energy()).toBe(1); // nothing paid
  });

  test("control: with a full deck all 3 are shown and 2 are recycled", async () => {
    const game = await board(5).build();
    await game.p1.cast("stacked");
    await game.settle();
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["d1", "d2", "d3"]);
    await game.p1.pick("d2");
    await game.settle();
    expect(game.p1.hand()).toEqual(["d2"]);
    expect(game.p1.deck().slice(0, 2)).toEqual(["d4", "d5"]); // d1/d3 recycled to the bottom
    expect(game.p1.deck().slice(2).toSorted()).toEqual(["d1", "d3"]);
    expect(game.violations()).toEqual([]);
  });
});
