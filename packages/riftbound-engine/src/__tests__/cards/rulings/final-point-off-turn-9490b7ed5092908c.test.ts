/**
 * Ruling 9490b7ed5092908c — (no specific card) scoring the winning point outside your own turn.
 *   Exercised with Ride the Wind (OGN-173 → ogn-173-298) "[Action] Move a friendly unit and ready it."
 *
 * Q: When I score my 8th point outside my turn, do I still have to control every battlefield?
 * A: The requirement is about having SCORED every battlefield that turn, not merely controlling them.
 *    Off-turn the only scoring method available is Conquer (Hold happens only in your own Beginning
 *    Phase), so a lone off-turn conquer at 7 points draws you a card instead of winning.
 * Rules: 471.1.b / 471.1.b.1 (final point via Conquer needs every battlefield Scored this turn, else
 *        draw a card), 469.1 / 469.2 (the two scoring methods; Hold is a Beginning-Phase event),
 *        470 (once per battlefield per turn), 472 (win check at a cleanup).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/** Settle, passing Focus for whoever is asked, until the board is back in an open main phase. */
async function closeShowdowns(game: Game): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const result = await game.settle();
    const d = game.decision();
    if (result.reason !== "open" || !d) {
      return;
    }
    if (d.kind === "action" && d.context === "showdown") {
      await game.seat(d.seat).passFocus();
      continue;
    }
    return;
  }
}

describe("Ruling 9490b7ed5092908c — off-turn, one conquer at 7 points draws a card instead of winning", () => {
  test("P1 (7 points) conquers bf2 during P2's turn: a card is drawn, the score stays at 7 and nobody has won", async () => {
    const game = await scenario()
      .active(P2)
      .victoryScore(8)
      .points(P1, 7)
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .battlefield("bf1")
      .battlefield("bf2")
      .unit(P2, "base", { might: 3, name: "Runner" }, "runner")
      .unit(P1, "base", { might: 4, name: "Scout" }, "scout")
      .hand(P1, RIDE_THE_WIND, "ride")
      .build();
    const before = game.p1.hand().length;
    await game.p2.move("runner", "bf1"); // opens a (non-combat) showdown → P1 gets an [Action] window
    await game.p2.passFocus();
    expect(game.p1.can("cast", "ride")).toBe(true);
    await game.p1.cast("ride", { targets: "scout", answers: ["bf2"] });
    await closeShowdowns(game);
    expect(game.locationOf("scout")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1); // the conquer happened…
    expect(game.p1.points()).toBe(7); // …but no final point
    expect(game.p1.hand().length).toBe(before); // -1 Ride the Wind, +1 the consolation draw
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("holding a battlefield through the opponent's turn scores nothing — Hold only fires in YOUR Beginning Phase", async () => {
    const game = await scenario()
      .active(P2)
      .victoryScore(8)
      .points(P1, 7)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2")
      .unit(P1, "bf1", { might: 4, name: "Warden" }, "warden")
      .unit(P2, "base", { might: 3, name: "Runner" }, "runner")
      .build();
    await game.p2.move("runner", "bf2");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // still held all through P2's turn
    expect(game.p1.points()).toBe(7); // holding it gave nothing on someone else's turn
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — on P1's OWN turn, holding bf1 (a Score) and then conquering bf2 covers every battlefield: the final point lands and P1 wins", async () => {
    const game = await scenario()
      .active(P2)
      .victoryScore(8)
      .points(P1, 6)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2")
      .unit(P1, "bf1", { might: 4, name: "Warden" }, "warden")
      .unit(P1, "base", { might: 4, name: "Scout" }, "scout")
      .build();
    await game.advanceTurn(); // P2 ends → P1's Beginning Phase: Hold on bf1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(7);
    await game.p1.move("scout", "bf2"); // conquer the only remaining battlefield, same turn
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });
});
