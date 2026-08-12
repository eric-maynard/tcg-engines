/**
 * Ruling f961c53cf89eb0ca — Darius, Trifarian (OGN-027 → ogn-027-298) · 5 Might · 5 + [fury]
 *   "When you play your second card in a turn, give me +2 [Might] this turn and ready me."
 *
 * Q: If I play a card first and then play Darius, does he ready himself and get +2?
 * A: Yes. A card counts as played when it finishes resolving, and Darius arrives on the board as part
 *    of that resolution — so he is already there when the "second card" trigger checks, and he sees
 *    himself as the second card. Played third or later he does not trigger: the condition has passed
 *    and he cannot count cards played after him.
 * Rules: 419.4.a (played = play completed by resolution), 383.1 (trigger conditions are checked as the
 *        event happens, with the board as it then is).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const DARIUS = "ogn-027-298";
const DREDGE_UP = "ven-049-166"; // Spell · 2 · "Draw 1."
const FILLER = "ogn-175-298";

/** P1 with Darius and two cheap spells in hand, and enough Energy for all three. */
function board() {
  return scenario()
    .resources(P1, { energy: 11, power: { fury: 1 } })
    .hand(P1, DARIUS, "darius")
    .hand(P1, DREDGE_UP, "spell1")
    .hand(P1, DREDGE_UP, "spell2")
    .deck(P1, [FILLER, FILLER, FILLER, FILLER], ["d1", "d2", "d3", "d4"]);
}

describe("Ruling f961c53cf89eb0ca — Darius played as the second card of the turn triggers on himself", () => {
  test("played FIRST, Darius does not trigger: he arrives exhausted at 5 Might", async () => {
    const game = await board().build();
    await game.p1.play("darius");
    await game.settle();
    expect(game.zoneOf("darius")).toBe("base");
    expect(game.state("darius").might).toBe(5);
    expect(game.state("darius").isReady).toBe(false);
  });

  test("a spell, then Darius: he IS the second card, so he readies himself and is at 7 Might", async () => {
    const game = await board().build();
    await game.p1.cast("spell1");
    await game.settle();
    await game.p1.play("darius");
    await game.settle();
    expect(game.zoneOf("darius")).toBe("base");
    expect(game.state("darius").might).toBe(7); // 5 + 2
    expect(game.state("darius").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("played THIRD the trigger has already passed him by: 5 Might, still exhausted", async () => {
    const game = await board().build();
    await game.p1.cast("spell1");
    await game.settle();
    await game.p1.cast("spell2");
    await game.settle();
    await game.p1.play("darius");
    await game.settle();
    expect(game.state("darius").might).toBe(5);
    expect(game.state("darius").isReady).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("the +2 is 'this turn' — Darius is back to 5 Might on the next turn (and stays ready)", async () => {
    const game = await board().build();
    await game.p1.cast("spell1");
    await game.settle();
    await game.p1.play("darius");
    await game.settle();
    expect(game.state("darius").might).toBe(7);
    await game.advanceTurn();
    expect(game.state("darius").might).toBe(5);
  });
});
