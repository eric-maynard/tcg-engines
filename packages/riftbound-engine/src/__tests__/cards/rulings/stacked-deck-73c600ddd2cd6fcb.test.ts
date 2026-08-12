/**
 * Ruling 73c600ddd2cd6fcb — Stacked Deck (OGN-183 → ogn-183-298) · Spell · Chaos · [1] · [Action]
 *     "Look at the top 3 cards of your Main Deck. Put 1 into your hand and recycle the rest."
 *   × Frigid Jewel (UNL-074 → unl-074-219) · Gear · [2] · "When you draw your second card each turn, give a
 *     friendly unit +2 [Might] this turn." (the draw detector)
 *   × Dredge Up (VEN-049 → ven-049-166) · Spell · [2] · "Draw 1." (the control — a real draw)
 *
 * Q: Does the card Stacked Deck gains count as drawing a card?
 * A: No. Stacked Deck says "put into your hand", which is a different action from drawing. Draw-triggered
 *    effects do not see it.
 * Rules: 413.1 (drawing = taking the top card of your Main Deck into your hand), 359.3.e (an instruction does
 *        exactly what it says), 383 (a trigger only fires on the event it names).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const STACKED_DECK = "ogn-183-298";
const FRIGID_JEWEL = "unl-074-219";
const DREDGE_UP = "ven-049-166";
const SKULKER = "ogn-175-298";

/** P1's turn with the Jewel out, a 3-Might Ally to buff, [6] in pool, and a deck of vanilla bodies. */
function board() {
  return scenario()
    .resources(P1, { energy: 6 })
    .gear(P1, FRIGID_JEWEL, "jewel")
    .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
    .hand(P1, STACKED_DECK, "sd1")
    .hand(P1, STACKED_DECK, "sd2")
    .hand(P1, DREDGE_UP, "dd1")
    .hand(P1, DREDGE_UP, "dd2")
    .deck(P1, [SKULKER, SKULKER, SKULKER, SKULKER, SKULKER, SKULKER], ["t1", "t2", "t3", "t4", "t5", "t6"]);
}

/** Cast one Stacked Deck and take the first offered card into hand; returns the card id taken. */
async function stack(game: Game, card: string): Promise<string> {
  await game.p1.cast(card, {});
  await game.p1.passPriority();
  await game.acting().passPriority();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  const taken = d?.kind === "pick" ? (d.options[0]?.card ?? d.options[0]!.key) : "";
  await game.p1.pick(taken);
  await game.settle();
  return taken;
}

/** Cast one Dredge Up (a real Draw 1). */
async function dredge(game: Game, card: string): Promise<void> {
  await game.p1.cast(card, {});
  await game.settle();
}

describe("Ruling 73c600ddd2cd6fcb — Stacked Deck PUTS a card into your hand; it is not a draw", () => {
  test("it does what it says: one of the top three ends up in hand and it is the only card gained", async () => {
    const game = await board().build();
    const before = game.p1.hand().length;
    const taken = await stack(game, "sd1");
    expect(game.zoneOf("sd1")).toBe("trash");
    expect(game.p1.hand()).toContain(taken);
    expect(game.p1.hand().length).toBe(before); // −1 spell +1 card: exactly one card gained, the rest recycled
  });

  test("two Stacked Decks put TWO cards into hand and the 'when you draw your second card' Jewel never fires — the Ally is still 3 Might", async () => {
    const game = await board().build();
    const a = await stack(game, "sd1");
    const b = await stack(game, "sd2");
    expect(game.p1.hand()).toEqual(expect.arrayContaining([a, b]));
    expect(game.state("ally").might).toBe(3);
    expect(game.state("ally").mightModifier).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("control — two real draws (Dredge Up ×2) DO trip the Jewel on the second one: the Ally goes to 5 Might", async () => {
    const game = await board().build();
    await dredge(game, "dd1");
    expect(game.state("ally").might).toBe(3); // first draw — nothing yet
    await dredge(game, "dd2");
    expect(game.state("ally").might).toBe(5); // +2 this turn
  });

  test("… and the same detector stays silent for a Stacked Deck sandwiched after one real draw: draw 1, then PUT 1 → still 3 Might", async () => {
    const game = await board().build();
    await dredge(game, "dd1");
    await stack(game, "sd1");
    expect(game.state("ally").might).toBe(3);
  });
});
