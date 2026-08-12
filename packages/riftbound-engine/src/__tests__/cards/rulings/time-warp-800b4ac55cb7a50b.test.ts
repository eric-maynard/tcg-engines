/**
 * Ruling 800b4ac55cb7a50b — Time Warp (OGN-122 → ogn-122-298) · Spell · [10][mind][mind][mind][mind]
 *   "Take a turn after this one. Banish this."
 *
 * Q: In 2v2, if I cast Time Warp on my teammate's turn, when does my extra turn happen and how does it affect the
 *    turn order?
 * A: Immediately after the current turn ends. The Additional Turn is inserted into the turn queue after the turn
 *    that is running; afterwards the regular order simply resumes with whoever would have gone next. The order is
 *    not permanently shifted.
 * Rules: 735 (an Additional Turn is inserted into the turn queue after the current turn), 315 (turn structure).
 *
 * Table: a 2v2 seating (P1+P3 vs P2+P4) with the 489.2 team map seeded onto the built state (the builder has no
 * team knob). See the timing facet below for why the cast itself happens on P1's own turn here.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, P3, P4, scenario } from "../../../harness";
import { peekCurrentState, replaceCurrentState } from "../../../harness/internal";

const TIME_WARP = "ogn-122-298";

/** 4 seats, teams {P1,P3} vs {P2,P4}, `active` player's turn, P1 holding Time Warp with exactly its cost. */
async function teamTable(active: typeof P1 | typeof P3): Promise<Game> {
  const game = await scenario({ players: 4 })
    .turn(5)
    .active(active)
    .victoryScore(20)
    .resources(P1, { energy: 10, power: { mind: 4 } })
    .hand(P1, TIME_WARP, "warp")
    .build();
  const st = structuredClone(peekCurrentState(game.engine));
  (st as { teams?: Record<string, number> }).teams = { [P1]: 0, [P2]: 1, [P3]: 0, [P4]: 1 };
  replaceCurrentState(game.engine, st);
  game.engine.getFlowManager()?.syncState(st);
  expect(game.gameState.teams).toEqual({ [P1]: 0, [P2]: 1, [P3]: 0, [P4]: 1 });
  return game;
}

describe("Ruling 800b4ac55cb7a50b — Time Warp's extra turn is inserted after the current turn, then the order resumes", () => {
  // RULING-CONFLICT: riftjudge 800b4ac55cb7a50b assumes Time Warp can be cast on a teammate's turn; CR 346 (a spell
  // with neither [Action] nor [Reaction] is playable only on its controller's own turn, in a Neutral Open state)
  // says it cannot — engine follows CR. Everything the ruling says about WHEN the extra turn happens is asserted below.
  test("timing: on teammate P3's turn P1 cannot play Time Warp at all — it carries neither [Action] nor [Reaction]", async () => {
    const game = await teamTable(P3);
    expect(game.turnPlayer()).toBe(P3);
    expect(game.p1.can("cast", "warp")).toBe(false);
    expect((await game.p1.try((p) => p.cast("warp"))).ok).toBe(false);
    expect(game.zoneOf("warp")).toBe("hand");
  });

  test("premise: cast on P1's own turn it resolves, banishes itself, and does NOT interrupt the running turn", async () => {
    const game = await teamTable(P1);
    await game.p1.cast("warp");
    await game.settle();
    expect(game.zoneOf("warp")).toBe("banishment");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("ruling: the Additional Turn comes IMMEDIATELY after the turn it was created in — the very next turn is P1's again, not P2's", async () => {
    const game = await teamTable(P1);
    await game.p1.cast("warp");
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
  });

  test("ruling: afterwards the REGULAR order resumes — P2, P3, P4, then back to P1; the queue was not permanently shifted", async () => {
    const game = await teamTable(P1);
    await game.p1.cast("warp");
    await game.settle();
    const seats: string[] = [];
    for (let i = 0; i < 5; i++) {
      await game.advanceTurn();
      seats.push(game.turnPlayer());
    }
    expect(seats).toEqual([P1, P2, P3, P4, P1]);
    expect(game.violations()).toEqual([]);
  });

  test("control — with no Time Warp the same table just runs P1, P2, P3, P4", async () => {
    const game = await teamTable(P1);
    const seats: string[] = [];
    for (let i = 0; i < 4; i++) {
      await game.advanceTurn();
      seats.push(game.turnPlayer());
    }
    expect(seats).toEqual([P2, P3, P4, P1]);
  });
});
