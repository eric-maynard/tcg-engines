/**
 * Ruling f2eaeed905fbb44a — Ride the Wind (OGN-173 → ogn-173-298) · [Action] · Chaos · [2][chaos]
 *     "Move a friendly unit and ready it."
 *
 * Q: I conquered a battlefield on my previous turn and it has since become uncontested. On my opponent's turn
 *    may I move a unit back in with Ride the Wind and score it again?
 * A: Yes. The only restriction is that one battlefield cannot be SCORED twice in the SAME turn — it does not
 *    matter that you conquered it on an earlier turn, nor that you had no unit there when the turn began.
 * Rules: 448.1 (Conquer scores a point), 448.2 (a battlefield scores at most once per turn), 190.4 / 323.6
 *        (control lapses once the controller has no unit there), 348.2.a (non-combat showdown → establish
 *        control = Conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/**
 * Turn 3, P2's turn. bf1 is the battlefield P1 conquered on turn 2 (P1 already has that point) and then walked
 * away from, so it is uncontrolled and empty again. bf2 is open too. P1 has a Runner in base and Ride the Wind.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .points(P1, 1) // scored bf1 last turn
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: null })
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .resources(P1, { energy: 2, power: { chaos: 1 } });
}

/** P2 opens a showdown at bf2 so P1 gets a window for an [Action] spell on P2's turn. */
async function p2AttacksBf2(game: Game): Promise<void> {
  await game.p2.move("raider", "bf2");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  await game.p2.passFocus();
}

describe("Ruling f2eaeed905fbb44a — a battlefield conquered last turn can be conquered and scored again this turn", () => {
  test("the battlefield really is uncontrolled and empty at the start: P1 holds nothing there", async () => {
    const game = await board().build();
    expect(game.gameState.battlefields.bf1?.controller).toBeFalsy();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p1.points()).toBe(1);
  });

  test("ruling: Riding the Wind into the empty bf1 on P2's turn conquers it and scores P1's second point", async () => {
    const game = await board().build();
    await p2AttacksBf2(game);
    await game.p1.cast("rtw", { targets: "runner", answers: ["bf1"] });
    await game.settle();
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.locationOf("runner")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2); // 1 from last turn + 1 now
    expect(game.violations()).toEqual([]);
  });

  test("it is a conquer on the OPPONENT's turn: the turn player is still P2 when the point lands", async () => {
    const game = await board().build();
    await p2AttacksBf2(game);
    await game.p1.cast("rtw", { targets: "runner", answers: ["bf1"] });
    await game.settle();
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.points()).toBe(2);
    expect(game.p2.points()).toBe(1); // P2 conquered bf2 in their own showdown
  });

  test("the limit is per TURN, not per battlefield-for-ever: on P1's own next turn the same bf1 scores again, as a Hold", async () => {
    const game = await board().build();
    await p2AttacksBf2(game);
    await game.p1.cast("rtw", { targets: "runner", answers: ["bf1"] });
    await game.settle();
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.p1.points()).toBe(2);
    await game.advanceToTurnOf(P1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(3); // a fresh turn ⇒ bf1 may score once more (Hold)
  });
});
