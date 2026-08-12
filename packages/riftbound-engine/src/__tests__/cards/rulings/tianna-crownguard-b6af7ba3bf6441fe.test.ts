/**
 * Ruling b6af7ba3bf6441fe — Tianna Crownguard (SFD-060 → sfd-060-221) · Unit · [7][calm][calm] · 4 [Might]
 *   "[Deflect]. While I'm at a battlefield, opponents can't gain points."
 *
 * Q: Tianna stops my Hold from giving a point. Both players are on 7. If I then kill her and conquer the second
 *    battlefield, do I get the last point?
 * A: Yes, and you win. Tianna blocks the point GAIN, not the act of Scoring: the attempted Hold still marks that
 *    battlefield as Scored this turn, so once she is dead the Conquer of the other battlefield satisfies the final-point
 *    requirement of having Scored every battlefield this turn.
 * Rules: 465 (Score once per battlefield per turn), 466.1 (Conquer), 466.1.b (the final point needs every battlefield
 *        Scored this turn).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TIANNA_CROWNGUARD = "sfd-060-221";

/** P2's turn is ending, both players on 7 of 8. P1 holds bf1; Tianna guards P2's bf2; P1 has a 9-[Might] hammer. */
function board() {
  return scenario()
    .active(P2)
    .victoryScore(8)
    .points(P1, 7)
    .points(P2, 7)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P2, "bf2", TIANNA_CROWNGUARD, "tianna")
    .unit(P1, "base", { might: 9, name: "Big" }, "big");
}

describe("Ruling b6af7ba3bf6441fe — Tianna stops the point, not the Scoring, so the last point still lands", () => {
  test("the Beginning-Phase Hold at bf1 gives no point while Tianna stands at a battlefield", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(7); // the Hold happened, the point did not
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.isOver()).toBe(false);
  });

  test("killing her and conquering bf2 then scores the 8th point and wins the game", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.settle();
    await game.p1.move("big", "bf2");
    await game.settle();
    expect(game.zoneOf("tianna")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("the blocked Hold is what made it legal: with bf1 never Scored this turn, the same Conquer gives no point", async () => {
    const game = await scenario()
      .active(P2)
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 7)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "TheirHolder" }, "th")
      .unit(P2, "bf2", TIANNA_CROWNGUARD, "tianna")
      .unit(P1, "base", { might: 9, name: "Big" }, "big")
      .build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(7);
    await game.p1.move("big", "bf2");
    await game.settle();
    expect(game.zoneOf("tianna")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1); // conquered all the same
    expect(game.p1.points()).toBe(7); // …but bf1 was never Scored, so no final point
    expect(game.isOver()).toBe(false);
  });

  test("while she is still alive somewhere else, a Conquer earns nothing either", async () => {
    const game = await scenario()
      .active(P2)
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 7)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .battlefield("bf3", { controller: P2 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "bf2", { might: 2, name: "Guard" }, "guard")
      .unit(P2, "bf3", TIANNA_CROWNGUARD, "tianna")
      .unit(P1, "base", { might: 9, name: "Big" }, "big")
      .build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(7);
    await game.p1.move("big", "bf2");
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.zoneOf("tianna")).toBe("battlefield-bf3"); // untouched, still switching the points off
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
  });
});
