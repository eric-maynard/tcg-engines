/**
 * Ruling a244ab755e1c8dcf — (general scoring; exercised with Plundering Poro, SFD-069 → sfd-069-221 · 2 Might ·
 *   "When I conquer, play a Gold gear token exhausted.")
 *
 * Q: Can I conquer the same battlefield several times in one turn just to re-fire a "when you conquer" trigger?
 * A: No. Each battlefield scores at most once per turn, by Hold or by Conquer. A later change of control at a
 *    battlefield already scored this turn is not a Conquer, so the triggers do not fire again — at most once
 *    per battlefield per turn, however many times units come and go.
 * Rules: 447 / 465 (once per battlefield per turn), 446.1 / 469 (Conquer = gaining control of a battlefield not
 *        yet scored this turn), 383 (a trigger needs its condition to actually happen).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PORO = "sfd-069-221";

/** [Action] "Kill a unit." — used to empty bf1 (a unit that already moved this turn cannot walk back out). */
const CULL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  name: "Test Cull",
  rulesText: "[Action] Kill a unit.",
  timing: "action",
} as const;

/** P1's turn: bf1 neutral and empty, bf2 held by P2's Wall; P1 has a Runner, the Poro, a Brute and a Cull. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 2 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 3, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 4, name: "Runner" }, "runner")
    .unit(P1, "base", { might: 6, name: "Brute" }, "brute")
    .unit(P1, "base", PORO, "poro")
    .hand(P1, CULL, "cull");
}

/** The Runner takes the neutral bf1: one point. */
async function firstConquer(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("runner", "bf1");
  await game.settle();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  return game;
}

describe("Ruling a244ab755e1c8dcf — one score, and one conquer trigger, per battlefield per turn", () => {
  test("emptying bf1 drops control, but the battlefield stays marked as scored this turn", async () => {
    const game = await firstConquer();
    await game.p1.cast("cull", { targets: "runner" });
    await game.settle();
    expect(game.zoneOf("runner")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("retaking it with the Poro the same turn gains control again, but scores no second point and fires no conquer trigger", async () => {
    const game = await firstConquer();
    await game.p1.cast("cull", { targets: "runner" });
    await game.settle();
    expect(game.p1.gear()).toEqual([]);
    await game.p1.move("poro", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1); // 447 — no second score
    expect(game.p1.gear()).toEqual([]); // …and so no "when I conquer" payout
    expect(game.violations()).toEqual([]);
  });

  test("baseline that the Poro's trigger works at all: it conquers an UNSCORED battlefield and a Gold appears", async () => {
    const game = await board().build();
    await game.p1.move("poro", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.p1.gear()).toHaveLength(1);
  });

  test("the OTHER battlefield is a separate score: taking bf2 the same turn does pay a second point", async () => {
    const game = await firstConquer();
    await game.p1.move("brute", "bf2");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
  });

  test("next turn bf1 is scorable again — the once-per-turn limit is per turn, not per game", async () => {
    const game = await firstConquer();
    await game.advanceTurn();
    await game.advanceToTurnOf(P1);
    expect(game.p1.points()).toBe(2); // held bf1 into P1's next Beginning Phase
  });
});
