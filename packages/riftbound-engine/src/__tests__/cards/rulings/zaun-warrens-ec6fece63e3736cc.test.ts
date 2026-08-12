/**
 * Ruling ec6fece63e3736cc — Zaun Warrens (OGN-298 → ogn-298-298) · Battlefield
 *   "When you conquer here, discard 1, then draw 1."
 *
 * Q: An attacker conquers the Warrens with 0 cards left in their Main Deck while both players sit at 7 of 8
 *    points. Who wins?
 * A: It depends on whether they had already scored the OTHER battlefield this turn. Scoring happens at the
 *    conquer (step 5), before the conquer trigger resolves. Having scored every battlefield this turn, the
 *    conquer pays the 8th point and the game is already won when the Warrens would make them draw. Without
 *    that, the Final-Point restriction gives a card draw instead of the point — they stay at 7, the Warrens
 *    trigger then also draws, and drawing from an empty deck loses the game.
 * Rules: 466.5.d (Conquer at step 5), 471.1.b/471.1.b.1 (Final Point: conquering at VS−1 without having
 *        scored every battlefield this turn draws a card instead), 466.4 (conquer triggers resolve after),
 *        104.2.b (a player who must draw from an empty Main Deck loses).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZAUN_WARRENS = "ogn-298-298";

/**
 * P1's turn, Victory Score 8, P1 at `points` with an EMPTY Main Deck and two hand cards to discard.
 * bf1 = the live Zaun Warrens, held by P2 with a 1-Might Wall. bf2 is an empty, uncontrolled battlefield.
 * P1 has a Raider and a Runner in base.
 */
function board(points: number) {
  return scenario()
    .victoryScore(8)
    .points(P1, points)
    .points(P2, 7)
    .fillDecks(false)
    .deck(P1, [])
    .battlefield("bf1", { controller: P2, def: ZAUN_WARRENS, inert: false })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 1, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .unit(P1, "base", { might: 2, name: "Runner" }, "runner")
    .hand(P1, { cardType: "unit", energyCost: 9, might: 9, name: "Junk A" }, "junkA")
    .hand(P1, { cardType: "unit", energyCost: 9, might: 9, name: "Junk B" }, "junkB");
}

describe("Ruling ec6fece63e3736cc — the conquer's point lands before the Warrens' draw", () => {
  test("premise: P1 is at 7 of 8 with an empty Main Deck; P2 holds the Warrens with a 1-Might Wall", async () => {
    const game = await board(7).build();
    expect(game.p1.points()).toBe(7);
    expect(game.p1.deck()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("ruling (already scored the other battlefield): P1 takes bf2 first for the 7th→… then conquers the Warrens for the 8th point and WINS before any draw", async () => {
    const game = await board(6).build();
    await game.p1.move("runner", "bf2"); // conquer the empty battlefield → 7
    await game.settle();
    expect(game.p1.points()).toBe(7);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["bf2"]);

    await game.p1.move("raider", "bf1"); // now conquer the Warrens: every battlefield scored this turn
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("ruling (other battlefield NOT scored): the conquer pays no point — P1 stays at 7 — and the empty-deck draw loses the game for P1", async () => {
    const game = await board(7).build();
    expect(game.gameState.scoredThisTurn[P1] ?? []).toEqual([]);
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // it IS a conquer
    expect(game.p1.points()).toBe(7); // …but the Final Point is withheld (471.1.b)
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
  });

  test("nuance: conquering at 7 without having scored everything is still a CONQUER — control changes hands even though no point is paid", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 7)
      .deck(P1, ["ogn-175-298", "ogn-175-298"], ["t1", "t2"])
      .battlefield("bf1", { controller: P2, def: ZAUN_WARRENS, inert: false })
      .battlefield("bf2", { controller: null })
      .unit(P2, "bf1", { might: 1, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
      .hand(P1, { cardType: "unit", energyCost: 9, might: 9, name: "Junk A" }, "junkA")
      .build();
    await game.p1.move("raider", "bf1");
    const stop = await game.settle();
    const d = game.decision();
    if (stop.reason === "unanswered" && d?.kind === "pick") {
      await game.p1.pick(d.options[0]!.key);
      await game.settle();
    }
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false); // the deck was not empty here
    expect(game.violations()).toEqual([]);
  });
});
