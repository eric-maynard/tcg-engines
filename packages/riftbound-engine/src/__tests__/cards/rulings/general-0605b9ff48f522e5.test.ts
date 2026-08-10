/**
 * Ruling 0605b9ff48f522e5 — (general scoring question; "Yasuo" = any [Ganking] unit)
 *
 * Q: I hold a battlefield at the start of my turn to reach 7, then gank over to the opposing battlefield and conquer it — but in
 *    doing so I no longer control the first one. Do I still win?
 * A: Yes. Holding scores at the start of your turn; you don't need to KEEP that battlefield to score the winning point from
 *    conquering the other one later in the turn (both battlefields were scored this turn, so the final-point conquer rule is met).
 *    Same from 6: hold (7) + conquer (8) wins.
 * Rules: 441–444 (hold in Beginning Phase; conquer), 441.3 / 466.1.b.2-style final-point restriction (every battlefield scored
 *        this turn), 190.4/323.6 (control lapses when you leave — irrelevant to points already scored).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** End of P2's turn 2. Victory at 8. P1 holds bf1 with a Ganking "Yasuo" (5); P2 holds bf2 with a Sentry (1). */
function board(p1Points: number) {
  return scenario()
    .turn(2)
    .active(P2)
    .victoryScore(8)
    .points(P1, p1Points)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { keywords: ["Ganking"], might: 5, name: "Yasuo" }, "yasuo")
    .unit(P2, "bf2", { might: 1, name: "Sentry" }, "sentry")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander");
}

describe("Ruling 0605b9ff48f522e5 — hold for 7, gank away (losing the first battlefield) and conquer the second: you still win", () => {
  test("start of P1's turn: holding bf1 scores 6 → 7 (before any action)", async () => {
    const game = await board(6).build();
    await game.advanceTurn(); // P2 ends → P1's Beginning Phase: hold
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("Yasuo ganks bf1 → bf2: bf1 is left empty and P1's control of it LAPSES, yet conquering bf2 scores the 8th point and P1 WINS", async () => {
    const game = await board(6).build();
    await game.advanceTurn();
    expect(game.p1.points()).toBe(7);
    await game.p1.gank("yasuo", "bf2");
    // bf1 no longer has a P1 unit: control lapses (Open-State cleanup) — P1 does not "still hold" it.
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBe(null);
    await game.settle(); // showdown passes → combat: 5 kills the Sentry → conquer
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("nuance — from 6 at the START of the turn cycle: hold (→ 7) then conquer the second battlefield (→ 8) also wins, because both battlefields were scored this turn", async () => {
    // Same line as above but phrased from the ruling's last bullet: 6 → hold 7 → conquer 8.
    const game = await board(6).build();
    await game.advanceTurn();
    await game.p1.gank("yasuo", "bf2");
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.winner()).toBe(P1);
  });

  test("contrast — the final-point restriction is about scoring EVERY battlefield this turn, not about keeping control: starting at 7 WITHOUT the hold (bf1 not scored this turn), the lone conquer of bf2 does not give the 8th point", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { might: 5, name: "Yasuo" }, "yasuo")
      .unit(P2, "bf2", { might: 1, name: "Sentry" }, "sentry")
      .build();
    await game.p1.move("yasuo", "bf2");
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
  });
});
