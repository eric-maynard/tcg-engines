/**
 * Ruling bf3cb5fa6bc67dd9 — Draven, Audacious (SFD-148 → sfd-148-221) · 6 Might
 *   "[Deflect] · The first time I win a combat each turn, you score 1 point. · When I die in combat,
 *    choose an opponent. They score 1 point."
 *
 * Q: At 6 points I move Draven into an occupied battlefield and win the combat. Do I score 1 for the
 *    conquer and 1 for Draven's ability, reaching 8 and winning?
 * A: No. Draven's own trigger scores first, taking you to 7. The conquer would then be your FINAL point,
 *    and a Final Point from a Conquer only happens if every other battlefield was already scored this
 *    turn — otherwise you draw a card instead. So you sit at 7 with an extra card, not at 8.
 * Rules: 471.1.b (Final Point restriction on a Conquer ⇒ draw instead), 466.5 (conquer resolution),
 *        the Combat Special Cleanup ordering that puts Draven's trigger before the Conquer score.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DRAVEN = "sfd-148-221";

/** P1's turn. Draven attacks bf1 whose lone defender is stunned, so he wins and conquers. */
function board(opts: { points: number; secondBattlefield: boolean }) {
  const b = scenario()
    .points(P1, opts.points)
    .victoryScore(8)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard", { stunned: true })
    .unit(P1, "base", DRAVEN, "draven");
  return opts.secondBattlefield ? b.battlefield("bf2", { controller: null }) : b;
}

describe("Ruling bf3cb5fa6bc67dd9 — Draven's point plus a conquer does not simply add up to the win", () => {
  test("both scoring events exist: from 0 points the same attack scores twice (Draven's trigger + the conquer)", async () => {
    const game = await board({ points: 0, secondBattlefield: true }).build();
    await game.p1.move("draven", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.isOver()).toBe(false);
  });

  test("ruling: from 6 points with another battlefield unscored, P1 ends on 7 — and DRAWS instead of taking the 8th", async () => {
    const game = await board({ points: 6, secondBattlefield: true }).build();
    const handBefore = game.p1.hand().length;

    await game.p1.move("draven", "bf1");
    await game.settle();

    expect(game.p1.points()).toBe(7); // Draven's trigger got P1 to 7
    expect(game.p1.hand().length).toBe(handBefore + 1); // the denied conquer point became a draw
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // still conquered
  });

  test("ruling: the restriction is only about the OTHER battlefields — with bf1 the sole battlefield the conquer does deliver the 8th point and the game is won", async () => {
    const game = await board({ points: 6, secondBattlefield: false }).build();
    const handBefore = game.p1.hand().length;

    await game.p1.move("draven", "bf1");
    await game.settle();

    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p1.hand().length).toBe(handBefore); // it scored, so no consolation draw
  });
});
