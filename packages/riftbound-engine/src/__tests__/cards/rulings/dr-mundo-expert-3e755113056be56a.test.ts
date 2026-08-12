/**
 * Ruling 3e755113056be56a — Dr. Mundo, Expert (OGN-109 → ogn-109-298) · 6 Might ·
 *   "My Might is increased by the number of cards in your trash. / At the start of your Beginning Phase,
 *   recycle 3 from your trash."
 *
 * Q: When Mundo recycles cards from your trash, do you choose which ones, or are they taken from the
 *    top/bottom?
 * A: You choose which cards are recycled. (They then go back into the deck in a random order — the
 *    standard rule for recycling from the trash, and not something a test can pin down.)
 * Rules: 416.6 (recycling a number of cards from your trash: the player chooses which), 416.1.a / 416.5
 *        (recycled cards return to the Main Deck), 355.10 (a real selection is asked of the chooser).
 */
import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MUNDO = "ogn-109-298";
const SKULKER = "ogn-175-298"; // vanilla filler for the trash

/** Turn 2 is P2's, so advancing the turn opens P1's Beginning Phase with Mundo's trigger. */
function board() {
  const b = scenario().turn(2).active(P2).unit(P1, "base", MUNDO, "mundo");
  for (let i = 1; i <= 5; i++) {
    b.trash(P1, SKULKER, `t${i}`);
  }
  return b.trash(P2, SKULKER, "theirs");
}

describe("Ruling 3e755113056be56a — the player chooses which cards Mundo recycles", () => {
  test("the trigger asks P1 to pick exactly 3 from their OWN trash — not the top or bottom of it", async () => {
    const game = await board().build();
    expect(game.state("mundo").might).toBe(11); // 6 + 5 cards in the trash
    await game.advanceTurn();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d.max).toBe(3); // three cards, named by the player

    expect((d.options.map((o) => o.card ?? o.key) as string[]).sort()).toEqual(["t1", "t2", "t3", "t4", "t5"]);
  });

  test("the three P1 names are the three that leave: t2, t4 and t5 go to the deck, t1 and t3 stay in the trash", async () => {
    const game = await board().build();
    const deckBefore = game.p1.deck().length;
    await game.advanceTurn();
    await game.p1.pick("t2", "t4", "t5");
    await game.settle();
    expect(game.p1.trash().sort()).toEqual(["t1", "t3"]);
    expect(game.p1.deck()).toHaveLength(deckBefore + 3 - 1); // +3 recycled, −1 for the turn's draw
    for (const id of ["t2", "t4", "t5"]) {
      expect(game.zoneOf(id)).toBe("mainDeck");
    }
    expect(game.p2.trash()).toEqual(["theirs"]); // "your trash" only
  });

  test("Mundo shrinks with the trash he empties: 6 + 5 = 11 becomes 6 + 2 = 8", async () => {
    const game = await board().build();
    await game.advanceTurn();
    await game.p1.pick("t1", "t2", "t3");
    await game.settle();
    expect(game.state("mundo").might).toBe(8);
    expect(game.violations()).toEqual([]);
  });
});
