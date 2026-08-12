/**
 * Ruling 99daa3e822510f6b — (general scoring; exercised with Plundering Poro, SFD-069 → sfd-069-221 · 2 Might ·
 *   "When I conquer, play a Gold gear token exhausted." — the visible "when you conquer" payout)
 *
 * Q: I score a battlefield this turn, move everything off it, then retake it the same turn. Do conquer
 *    effects (Rek'Sai-style) trigger?
 * A: No. A battlefield can be scored only once per turn, and Conquering is defined as gaining control of a
 *    battlefield you have NOT yet scored this turn — so retaking one you already scored is not a Conquer and
 *    "when you conquer" abilities do not trigger.
 * Rules: 447 (score each battlefield at most once per turn), 446.1 / 469 (Conquer = gain control of a
 *        battlefield not yet scored this turn), 383 / 376.4.b.2.a (conquer triggers key on the Conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PORO = "sfd-069-221"; // 2 Might · "When I conquer, play a Gold gear token exhausted."

/** End of P2's turn: P1 holds bf1 with a lone Holder and has the Poro waiting in base. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "base", PORO, "poro")
    .unit(P2, "bf2", { might: 3, name: "Wall" }, "wall");
}

/** P2 ends the turn → P1's Beginning Phase scores the HOLD of bf1. */
async function afterHoldScore(): Promise<Game> {
  const game = await board().build();
  await game.p2.endTurn();
  await game.settle();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.p1.points()).toBe(1); // bf1 scored this turn, by Hold
  return game;
}

describe("Ruling 99daa3e822510f6b — leaving and retaking a battlefield already scored this turn is no Conquer", () => {
  test("baseline: the Poro conquering a battlefield NOT yet scored this turn does trigger (a Gold token appears)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 3, name: "Wall" }, "wall")
      .unit(P1, "base", PORO, "poro")
      .build();
    expect(game.p1.gear()).toEqual([]);
    await game.p1.move("poro", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.gear()).toHaveLength(1); // the conquer trigger paid out
  });

  test("after holding bf1 this turn, walking the Holder off it drops control — but the battlefield stays SCORED for the turn", async () => {
    const game = await afterHoldScore();
    await game.p1.move("holder", "base");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("retaking it with the Poro the same turn scores nothing AND fires no conquer trigger — no Gold token", async () => {
    const game = await afterHoldScore();
    await game.p1.move("holder", "base");
    await game.p1.move("poro", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // control is back…
    expect(game.p1.points()).toBe(1); // …but no second point (447)
    expect(game.p1.gear()).toEqual([]); // and no "when I conquer" payout
    expect(game.violations()).toEqual([]);
  });

  test("next turn it is scorable again: holding bf1 into P1's following Beginning Phase pays the point", async () => {
    const game = await afterHoldScore();
    await game.p1.move("holder", "base");
    await game.p1.move("poro", "bf1");
    await game.settle();
    await game.advanceTurn(); // P1 ends → P2's turn
    await game.advanceToTurnOf(P1); // …and back to P1's Beginning Phase
    expect(game.p1.points()).toBe(2);
  });
});
