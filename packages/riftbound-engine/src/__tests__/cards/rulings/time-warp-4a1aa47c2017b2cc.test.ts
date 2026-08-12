/**
 * Ruling 4a1aa47c2017b2cc — Time Warp (OGN-122 → ogn-122-298) · [10][mind]×4
 *   "Take a turn after this one. Banish this."
 *
 * Q: (2v2) I conquer a battlefield, an opponent holds one and my teammate holds the third. Can I still win
 *    on Victory Points by Time Warping and holding my own battlefield?
 * A: Yes. Victory Points have nothing to do with who controls which battlefield, and a HOLD carries no
 *    Final-Point restriction — only a Conquer does. So on the extra turn you hold your own battlefield and
 *    take the winning point even though an opponent controls another one.
 *   (The engine has no team mode, so the 2v2 framing is played out here between two seats: what is asserted
 *    is the seat-level substance — an opponent's control of another battlefield never blocks your points,
 *    and a Hold may take the final point.)
 * Rules: 471.1.a / 471.1.a.1 (only Conquer is beholden to the Final Point restriction), 471.3 (Hold),
 *        472 (win at Victory Score), 734–738 (the additional turn).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TIME_WARP = "ogn-122-298";

describe("Ruling 4a1aa47c2017b2cc — Time Warp + a Hold takes the winning point while an opponent controls another battlefield", () => {
  test("ruling: at 7/8, the Hold of your OWN battlefield wins outright — the opponent's battlefield is irrelevant and was never scored by you", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .victoryScore(8)
      .points(P1, 7)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P2 })
      .unit(P1, "A", { might: 3, name: "Mine" }, "mine")
      .unit(P2, "B", { might: 3, name: "Theirs" }, "theirs")
      .build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.gameState.battlefields.B?.controller).toBe(P2); // still theirs …
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("contrast — a CONQUER at match point IS restricted: at 7/8 conquering one of two battlefields gives no point (a card instead)", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .battlefield("A", { controller: null })
      .battlefield("B", { controller: P2 })
      .unit(P2, "B", { might: 2, name: "Theirs" }, "theirs")
      .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
      .build();
    const hand = game.p1.hand().length;
    await game.p1.move("runner", "A");
    await game.settle();
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7); // no point — 471.1.b.1
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.isOver()).toBe(false);
  });

  test("the whole line: conquer on your turn (6 → 7), Time Warp, then hold on the extra turn for the win — with the opponent holding a battlefield throughout", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 6)
      .resources(P1, { energy: 10, power: { mind: 4 } })
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P2 })
      .battlefield("C", { controller: null })
      .unit(P1, "A", { might: 3, name: "Mine" }, "mine")
      .unit(P2, "B", { might: 3, name: "Theirs" }, "theirs")
      .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
      .hand(P1, TIME_WARP, "warp")
      .build();
    await game.p1.move("runner", "C"); // conquer the uncontrolled battlefield
    await game.settle();
    expect(game.gameState.battlefields.C?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    await game.p1.cast("warp");
    await game.settle();
    expect(game.zoneOf("warp")).toBe("banishment");
    expect(game.p1.points()).toBe(7);
    await game.advanceTurn(); // the additional turn is P1's
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.battlefields.B?.controller).toBe(P2); // the opponent still holds one …
    expect(game.p1.points()).toBeGreaterThanOrEqual(8); // … and P1 still reaches the Victory Score
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("and the opponent gets no Hold of their own in between: the extra turn is P1's, so P2's points never move", async () => {
    const game = await scenario()
      .victoryScore(20)
      .resources(P1, { energy: 10, power: { mind: 4 } })
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P2 })
      .unit(P1, "A", { might: 3, name: "Mine" }, "mine")
      .unit(P2, "B", { might: 3, name: "Theirs" }, "theirs")
      .hand(P1, TIME_WARP, "warp")
      .build();
    await game.p1.cast("warp");
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
  });
});
