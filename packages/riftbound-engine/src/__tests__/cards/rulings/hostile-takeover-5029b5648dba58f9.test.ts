/**
 * Ruling 5029b5648dba58f9 — Hostile Takeover (SFD-202 → sfd-202-221) · Spell · [5][rainbow][rainbow] · [Hidden]
 *   "Take control of an enemy unit at a battlefield. Ready it. (Start a combat if other enemies are there.
 *    Otherwise, conquer.) Lose control of that unit and recall it at end of turn."
 *
 * Q: I control no battlefields and I am one point from winning. If I Hostile Takeover an enemy unit, do I score
 *    a HOLD point and win?
 * A: No. Hold points are only awarded in your Beginning Phase; seizing the battlefield in your Main Phase is a
 *    CONQUER. That Conquer scores (if you have not already scored that battlefield this turn) and can be the
 *    winning point — but it is a Conquer win, never a Hold, and it obeys the Conquer scoring restrictions.
 * Rules: 464.2 (Hold is scored in the Beginning Phase), 464.1 (Conquer on gaining control), 348.2.a (a non-combat
 *        showdown closes and settles control), 448.1.b.2 (final point via Conquer needs every battlefield scored
 *        this turn), 467 (victory).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HOSTILE_TAKEOVER = "sfd-202-221";

/** P1's turn, on 7 of 8 and controlling nothing. P2 holds each declared battlefield with a lone Thrall. */
function board(extraBattlefield: boolean) {
  const s = scenario()
    .victoryScore(8)
    .points(P1, 7)
    .resources(P1, { energy: 5, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Thrall" }, "thrall")
    .hand(P1, HOSTILE_TAKEOVER, "takeover");
  return extraBattlefield ? s.battlefield("bf2", { controller: P2 }).unit(P2, "bf2", { might: 3, name: "Warden" }, "warden") : s;
}

async function seize(extraBattlefield: boolean): Promise<Game> {
  const game = await board(extraBattlefield).build();
  expect(game.p1.battlefields({ controlled: true })).toEqual([]);
  expect(game.phase()).toBe("main"); // not the Beginning Phase, so a Hold is impossible
  await game.p1.cast("takeover", { targets: "thrall" });
  await game.settle();
  // 348.2.a — taking the lone enemy unit opens a NON-COMBAT showdown; control settles when it closes.
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
  expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
  await game.acting().passFocus();
  await game.acting().passFocus();
  return game;
}

describe("Ruling 5029b5648dba58f9 — Hostile Takeover produces a CONQUER, never a Hold point", () => {
  test("the spell takes control of the unit, readies it, and P1 ends up controlling the battlefield", async () => {
    const game = await seize(false);
    expect(game.state("thrall")).toMatchObject({ controller: P1, isReady: true, owner: P2 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("ruling: the point is recorded as a Conquer of that battlefield — it happens in the Main Phase, so no Hold is involved", async () => {
    const game = await seize(false);
    expect(game.gameState.scoredThisTurn?.[P1] ?? []).toEqual(["bf1"]);
  });

  test("ruling: this Conquer can be the winning point — with bf1 the only battlefield, P1 reaches 8 and wins", async () => {
    const game = await seize(false);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("ruling nuance: it is Conquer scoring, so with a second unscored battlefield the final point becomes a card draw instead", async () => {
    const game = await board(true).build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("takeover", { targets: "thrall" });
    await game.settle();
    await game.acting().passFocus();
    await game.acting().passFocus();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p1.points()).toBe(7); // 448.1.b.2 — no 8th point
    expect(game.p1.hand().length).toBe(handBefore); // Takeover left the hand, a card came back in
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
