/**
 * Ruling 49b6922e9449fdff — (no specific card) leaving and re-entering a battlefield you held.
 *
 * Q: I hold a battlefield, move my units out, then move them back in — does that start a showdown?
 * A: Yes. Moving the last unit out leaves the battlefield unoccupied and uncontrolled; moving back in
 *    is a move into a battlefield you do not control, so it becomes Contested and a NON-COMBAT showdown
 *    opens. You regain control when it closes, but you score nothing more — you already scored this
 *    battlefield this turn (holding), so no second point and no conquer triggers.
 * Rules: 323.6 (control lapses in an Open Cleanup with no unit there), 445 (Contested), 344.2 (showdown
 *        staged), 348.2.a (lone player takes control on close), 464 / 469.1 (one score per battlefield
 *        per turn; conquering is part of scoring).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/**
 * Turn 2 is P2's; P1 holds bf1 with a 3-Might Holder (so P1's turn opens with the hold) and keeps a
 * ready 2-Might Runner in base — a unit that moved is exhausted, so the return trip is made by the Runner.
 */
const board = () =>
  scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 2, name: "Runner" }, "runner");

describe("Ruling 49b6922e9449fdff — move out, move back: a non-combat showdown, but no second score", () => {
  test("holding at the start of P1's turn scores exactly 1", async () => {
    const game = await board().build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("moving the last unit out gives the battlefield up: it becomes uncontrolled", async () => {
    const game = await board().build();
    await game.advanceTurn();
    await game.p1.move("holder", "base");
    await game.settle();
    expect(game.locationOf("holder")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });

  test("moving back in opens a NON-COMBAT showdown (nobody is an attacker) and control returns when it closes", async () => {
    const game = await board().build();
    await game.advanceTurn();
    await game.p1.move("holder", "base");
    await game.settle();
    await game.p1.move("runner", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("runner").combatRole).toBeNull();
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("no second point: the battlefield was already scored this turn by the hold — P1 is still on 1", async () => {
    const game = await board().build();
    await game.advanceTurn();
    const afterHold = game.p1.points();
    await game.p1.move("holder", "base");
    await game.settle();
    await game.p1.move("runner", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(afterHold);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
