/**
 * Ruling 3dc4a38bdc4b7c59 — (attacking in several batches; no specific card)
 *   Vanilla stand-ins: a Trader (3) that trades with the defending Warden (3), then a Recruit (2) sent in after.
 *
 * Q: Attacking a battlefield the opponent controls, can I move units in separate batches — trade with the
 *    first, then send another unit in — and do I score when I conquer that way?
 * A: Yes to both. Nothing limits a turn to one move into a battlefield. The trade alone conquers nothing (both
 *    units die and the battlefield is left uncontrolled), but the follow-up unit that takes it does Conquer,
 *    and a Conquer scores.
 * Rules: 140 (Standard Move is a repeatable turn action), 466.3.d / 466.5.b (nobody left ⇒ No Result and the
 *        battlefield becomes Uncontrolled), 348.2.a / 469.1 (establishing control is a Conquer and scores).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** P1's turn. P2 holds bf1 with a lone Warden (3). P1 has a Trader (3) and a Recruit (2) in base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Warden" }, "warden")
    .unit(P1, "base", { might: 3, name: "Trader" }, "trader")
    .unit(P1, "base", { might: 2, name: "Recruit" }, "recruit");
}

/** First batch: the Trader goes in alone and trades with the Warden. */
async function traded(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("trader", "bf1");
  await game.settle();
  expect(game.zoneOf("trader")).toBe("trash");
  expect(game.zoneOf("warden")).toBe("trash");
  return game;
}

describe("Ruling 3dc4a38bdc4b7c59 — move in batches: the trade conquers nothing, the follow-up unit conquers and scores", () => {
  test("after the trade nobody is left at bf1: it is Uncontrolled, and no point has been scored by either player", async () => {
    const game = await traded();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // still my turn
  });

  test("a SECOND batch is legal in the same turn: the Recruit walks into the now-empty bf1 and takes it", async () => {
    const game = await traded();
    await game.p1.move("recruit", "bf1");
    for (let i = 0; i < 6 && game.decision()?.context === "showdown"; i++) {
      await game.acting().passFocus();
    }
    await game.settle();
    expect(game.locationOf("recruit")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("that second batch is a Conquer, so it scores: P1 gains the point the trade did not", async () => {
    const game = await traded();
    expect(game.p1.points()).toBe(0);
    await game.p1.move("recruit", "bf1");
    for (let i = 0; i < 6 && game.decision()?.context === "showdown"; i++) {
      await game.acting().passFocus();
    }
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.scoredThisTurn[P1]).toContain("bf1");
  });
});
