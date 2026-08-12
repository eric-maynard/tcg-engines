/**
 * Ruling 4eb2f536bb88102e — Yasuo, Windrider (OGN-205 → ogn-205-298) · Unit · 4 Might
 *   "[Ganking] — The third time I move in a turn, you score 1 point."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · [Action] · [2][chaos] "Move a friendly unit and ready it."
 *
 * Q: Do you need to control both battlefields to win with Yasuo, Windrider's ability?
 * A: No. The point it scores is not a Conquer or a Hold, so the "score every battlefield this turn" restriction
 *    on taking the final point does not apply — the third move can be the winning point even with a battlefield
 *    in the opponent's hands.
 * Rules: 448.1.b.2 (the final-point restriction applies to Conquer scoring), 464 (Conquer / Hold), 467 (victory).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-205-298";
const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn, on 7 of 8. bf1 is empty and neutral; bf2 is P2's, held by a Sentinel. Two Ride the Winds + [4][chaos][chaos]. */
function board() {
  return scenario()
    .victoryScore(8)
    .points(P1, 7)
    .resources(P1, { energy: 4, power: { chaos: 2 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 5, name: "Sentinel" }, "sentinel")
    .unit(P1, "base", YASUO, "yasuo")
    .hand(P1, RIDE_THE_WIND, "wind1")
    .hand(P1, RIDE_THE_WIND, "wind2");
}

/** Ride the Wind moves Yasuo to `to` and readies him — one more "move" for his counter. */
async function windTo(game: Game, card: string, to: string): Promise<void> {
  await game.p1.cast(card, { targets: "yasuo" });
  await game.settle();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick(to);
    await game.settle();
  }
  expect(game.state("yasuo").isReady).toBe(true);
}

describe("Ruling 4eb2f536bb88102e — Yasuo's third-move point is not a Conquer, so it can be the winning point", () => {
  test("move 1: he takes the neutral bf1, but a Conquer at 7 without having scored every battlefield draws a card instead of the point", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7); // 448.1.b.2 — the Conquer point became a card
    expect(game.isOver()).toBe(false);
  });

  test("move 2 (Ride the Wind home) still scores nothing", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "bf1");
    await game.settle();
    await windTo(game, "wind1", "base");
    expect(game.locationOf("yasuo")).toBe("base");
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
  });

  test("ruling: move 3 scores Yasuo's point and wins at 8 — even though P2 still controls bf2 and bf1 was already scored this turn", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "bf1");
    await game.settle();
    await windTo(game, "wind1", "base");
    await windTo(game, "wind2", "bf1");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2); // P1 never controlled every battlefield
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
