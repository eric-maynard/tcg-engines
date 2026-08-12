/**
 * Ruling 87b74e0553c416ee — (no specific card) re-taking a battlefield you already scored this turn.
 *
 * Q: I conquer a battlefield, then kill my own unit there, then walk a fresh unit into the now-empty
 *    battlefield the same turn. Do I score a second point?
 * A: No. A player scores a given battlefield at most once per turn, by either method. Losing and
 *    regaining control does not reset that ledger — the second arrival Conquers but pays nothing.
 * Rules: 470 (a player may only Score, from either method, once per Battlefield per turn),
 *        469.1 (Conquer), 466.5.d (Establishing Control conquers only if not yet scored this turn),
 *        323.6 / 190.4.c (control lapses at the next Open-State Cleanup once the last unit leaves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** "Kill a friendly unit." — the self-inflicted removal the question describes. */
const CULL = {
  abilities: [{ effect: { target: { controller: "friendly", type: "unit" }, type: "kill" }, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Cull",
  rulesText: "Kill a friendly unit.",
} as const;

/** P1's turn, one open battlefield, two units in base and the Cull in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1")
    .unit(P1, "base", { might: 3, name: "First" }, "first")
    .unit(P1, "base", { might: 3, name: "Second" }, "second")
    .hand(P1, CULL, "cull");
}

/** Conquer bf1 with `first`, then kill it so bf1 empties and control lapses. */
async function conquerThenSelfKill(game: Game): Promise<void> {
  await game.p1.move("first", "bf1");
  await game.settle();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  await game.p1.cast("cull", { targets: "first" });
  await game.settle();
  expect(game.zoneOf("first")).toBe("trash");
  expect(game.gameState.battlefields.bf1?.controller).toBeFalsy(); // 323.6 — control lapsed
}

describe("Ruling 87b74e0553c416ee — one score per battlefield per turn, whatever happened in between", () => {
  test("intermediate fact: the first arrival really did Conquer and score", async () => {
    const game = await board().build();
    await game.p1.move("first", "bf1");
    await game.settle();
    expect(game.locationOf("first")).toBe("bf1");
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("kill your own unit there, walk a second one in the same turn: control returns, the point does not", async () => {
    const game = await board().build();
    await conquerThenSelfKill(game);
    await game.p1.move("second", "bf1");
    await game.settle();
    expect(game.locationOf("second")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // conquered again…
    expect(game.p1.points()).toBe(1); // …and still exactly one point this turn
    expect(game.violations()).toEqual([]);
  });

  test("the same cap applies to the Hold method: holding into the next turn scores it once, not twice", async () => {
    const game = await board().build();
    await game.p1.move("first", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    await game.advanceTurn();
    await game.advanceToTurnOf(P1);
    expect(game.p1.points()).toBe(2); // exactly one Hold score on the new turn
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("the ledger is per player: P2 has not scored bf1 this turn, so P2 still scores it after P1 leaves", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1")
      .unit(P1, "base", { might: 3, name: "First" }, "first")
      .unit(P2, "base", { might: 3, name: "Thug" }, "thug")
      .hand(P1, CULL, "cull")
      .build();
    await game.p1.move("first", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    await game.p1.cast("cull", { targets: "first" });
    await game.settle();
    await game.advanceTurn(); // P2's turn
    await game.p2.move("thug", "bf1");
    await game.settle();
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
