/**
 * Ruling 810b179d872001d3 — (no specific card) 2v2 (Magma Chamber) and the conquest win.
 *   Exercised in a four-seat game (teams P1+P3 vs P2+P4) with three battlefields and inline units.
 *
 * Q: In 2v2, must a player conquer all three battlefields — including one their ally controls — to
 *    win by conquering rather than holding?
 * A: You need to conquer every battlefield IGNORING the ones your ally controls. Teammates are
 *    friendly but share neither battlefields nor resources, and an ally's battlefield does not count
 *    against your conquest victory condition.
 * Rules: 471.1.b / 471.1.b.1 (the Final Point needs every battlefield Scored this turn), 489.8.b
 *    (battlefields a teammate controlled at your Beginning Phase are disqualified from being scored
 *    by that team that turn), 489.8.c (control is not shared), 489.3 (2v2 Victory Score 11).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, P3, P4, scenario } from "../../../harness";

const VANILLA = "ogn-175-298";

/**
 * P1's turn in a 2v2 at Victory Score 11 with P1 on 10 after one conquest. bfA is nobody's, bfB is
 * the opponent's (1-Might picket), bfC belongs to P1's ALLY P3 and has P3's unit on it.
 */
function board(opts: { allyBattlefield: boolean }) {
  const b = scenario({ players: 4 })
    .turn(4)
    .active(P1)
    .victoryScore(11)
    .points(P1, 9)
    .battlefield("bfA", { controller: null })
    .battlefield("bfB", { controller: P2 })
    .unit(P2, "bfB", { might: 1, name: "Picket" }, "picket")
    .unit(P1, "base", { might: 5, name: "Vanguard" }, "u1")
    .unit(P1, "base", { might: 5, name: "Rearguard" }, "u2")
    .deck(P1, [VANILLA, VANILLA, VANILLA], ["d1", "d2", "d3"]);
  return opts.allyBattlefield
    ? b.battlefield("bfC", { controller: P3 }).unit(P3, "bfC", { might: 2, name: "Ally Holder" }, "allyholder")
    : b;
}

/** P1 conquers the empty bfA, reaching one point short of the Victory Score. */
async function afterFirstConquest(opts: { allyBattlefield: boolean }): Promise<Game> {
  const game = await board(opts).build();
  await game.p1.move("u1", "bfA");
  await game.settle();
  await game.settle();
  expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
  expect(game.p1.points()).toBe(10);
  return game;
}

describe("Ruling 810b179d872001d3 — 2v2: your ally's battlefields are not yours, and not your problem", () => {
  test("setup: the seats are paired P1+P3 vs P2+P4 and the Victory Score is 11", async () => {
    const game = await board({ allyBattlefield: true }).build();
    expect(game.gameState.teams).toEqual({ [P1]: 0, [P2]: 1, [P3]: 0, [P4]: 1 });
    expect(game.gameState.victoryScore).toBe(11);
  });

  test("control is not shared: the ally's battlefield is not one P1 controls", async () => {
    const game = await board({ allyBattlefield: true }).build();
    expect(game.gameState.battlefields.bfC?.controller).toBe(P3);
    expect(game.p1.battlefields({ controlled: true })).not.toContain("bfC");
    expect(game.seat(P3).battlefields({ controlled: true })).toContain("bfC");
  });

  test("P1's own conquests score normally — the empty bfA takes them to 10", async () => {
    const game = await afterFirstConquest({ allyBattlefield: true });
    expect(game.gameState.scoredThisTurn[P1] ?? []).toEqual(["bfA"]);
    expect(game.isOver()).toBe(false);
  });

  test("control: with only P1's OWN battlefields in play, conquering the last one takes the Final Point and wins", async () => {
    const game = await afterFirstConquest({ allyBattlefield: false });
    await game.p1.move("u2", "bfB");
    await game.settle();
    expect(game.zoneOf("picket")).toBe("trash");
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.p1.points()).toBe(11);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test.failing(
    "BUG: ruling 810b179d872001d3 — the engine counts the ALLY's battlefield in the Final Point's 'every battlefield scored this turn' check, so P1 draws a card instead of the winning point",
    async () => {
      // Expected (489.8.b + this ruling): bfC is controlled by P1's teammate, so it is disqualified
      // from being scored by the team this turn and must be IGNORED by 471.1.b.1 — conquering bfB
      // with bfA already scored is therefore the Final Point and the team wins at 11.
      // Actual: `finalPointRestrictionApplies` (operations/points.ts) walks every battlefield in play
      // with no teammate exemption, finds bfC unscored, and turns the point into a draw (P1 stays on
      // 10 with one extra card).
      const game = await afterFirstConquest({ allyBattlefield: true });
      const handBefore = game.p1.hand().length;
      await game.p1.move("u2", "bfB");
      await game.settle();
      expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
      expect(game.p1.hand().length).toBe(handBefore); // no consolation draw
      expect(game.p1.points()).toBe(11);
      expect(game.isOver()).toBe(true);
    },
  );

  test("what the engine does today, recorded: the conquest happens, the point does not, and P1 draws instead", async () => {
    const game = await afterFirstConquest({ allyBattlefield: true });
    const handBefore = game.p1.hand().length;
    await game.p1.move("u2", "bfB");
    await game.settle();
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.p1.points()).toBe(10);
    expect(game.p1.hand().length).toBe(handBefore + 1);
    expect(game.isOver()).toBe(false);
    expect(game.seat(P4).points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
