/**
 * Ruling bdbd1c73b58d0a59 — Ride the Wind (OGN-173 → ogn-173-298) · Action · Chaos · 2 + [chaos]
 *   "Move a friendly unit and ready it."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction · 1 · "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: At 7 points (of 8) holding one battlefield, can I conquer the other battlefield to win?
 * A: Yes. Holding always scores with no restriction. Only a CONQUER for the final point requires having scored every
 *    battlefield this turn — so: at 6, hold one (→ 7) then conquer the other the same turn (→ 8, win), e.g. by Riding
 *    the Wind onto the empty battlefield; already at 7, simply holding at the start of your turn wins. The opponent can
 *    still answer the move (e.g. Gust) to stop the conquer.
 * Rules: 469.1 / 469.2 (Conquer / Hold), 471.1.b.1 (final point by Conquer only if every battlefield was scored this
 *        turn — otherwise draw 1), 471.1.a.1 (non-Conquer points unrestricted).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const GUST = "ogn-169-298";

/**
 * End of P2's turn 2. P1 holds bf1 with Holder (3) + Runner (2); bf2 is empty and uncontrolled. P1 has Ride the Wind in
 * hand (resources are floated on P1's turn — pools empty at end of turn). P2 has Gust in hand.
 */
function board(p1Points: number) {
  return scenario()
    .active(P2)
    .points(P1, p1Points)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "bf1", { might: 2, name: "Runner" }, "runner")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .hand(P2, GUST, "gust");
}

/** Into P1's turn (the Hold scores), float [2][chaos] for P1 and [1] for P2. */
async function p1TurnAfterHold(p1Points: number): Promise<Game> {
  const game = await board(p1Points).build();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  await game.p1.do("addResources", { energy: 2, power: { chaos: 1 } });
  await game.p2.do("addResources", { energy: 1 });
  return game;
}

/** P1 Rides the Wind the Runner from bf1 onto the empty bf2. Stops with the spell on the chain (P1 has priority). */
async function rideRunnerToBf2(game: Game): Promise<void> {
  await game.p1.cast("rtw", { targets: "runner" });
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("battlefield-bf2");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["rtw"]);
}

describe("Ruling bdbd1c73b58d0a59 — hold one battlefield, then conquer the other for the winning point", () => {
  test("at 6: holding bf1 at the start of P1's turn scores → 7 (game not over yet)", async () => {
    const game = await p1TurnAfterHold(6);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("…then Ride the Wind moves the Runner onto empty bf2 the same turn: P1 conquers it — every battlefield has now been scored this turn — and takes the FINAL point: 8, P1 wins", async () => {
    const game = await p1TurnAfterHold(6);
    await rideRunnerToBf2(game);
    await game.settle();
    await game.settle();
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.locationOf("runner")).toBe("bf2");
    expect(game.state("runner").isReady).toBe(true); // "…and ready it"
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("already at 7: simply holding bf1 at the start of the turn is the winning point — no conquer needed (Hold has no final-point restriction)", async () => {
    const game = await board(7).build();
    await game.p2.endTurn();
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect(game.p1.points()).toBe(8);
    expect(game.winner()).toBe(P1);
  });

  test("contrast (the Conquer-only restriction): at 7 on a turn where bf1 was NOT scored, conquering bf2 alone does not win — P1 draws a card instead and stays at 7", async () => {
    const game = await scenario()
      .points(P1, 7)
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P1, "bf1", { might: 2, name: "Runner" }, "runner")
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();
    const hand = game.p1.hand().length;
    await rideRunnerToBf2(game);
    await game.settle();
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1); // conquered all right …
    expect(game.p1.points()).toBe(7); // … but no final point
    expect(game.isOver()).toBe(false);
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1); // drew 1 instead
  });

  test("nuance: the opponent can still respond — P2 Gusts the 2-Might Runner in response to Ride the Wind; it goes back to hand, nothing is conquered, P1 stays at 7", async () => {
    const game = await p1TurnAfterHold(6);
    await rideRunnerToBf2(game);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "runner" });
    await game.settle();
    await game.settle();
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("runner")).toBe("hand");
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
