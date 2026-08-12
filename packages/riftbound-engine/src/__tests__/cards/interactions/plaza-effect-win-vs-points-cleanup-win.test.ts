/**
 * Interaction: The Grand Plaza (ogn-293-298) · Battlefield
 *     "When you hold here, if you have 7+ units here, you win the game."
 *   × Renata Glasc, Mastermind (sfd-088-221) · Champion Unit · Mind · 5 · 4 [Might]
 *     "[1][mind]: Draw 1. / [4][mind][mind][mind][mind], [Exhaust]: Score 1 point. /
 *      Use my abilities only while I'm at a battlefield."
 *   × Watchful Sentry (ogn-096-298) · Unit · Mind · 2 · 1 [Might]
 *     "[Deathknell] — Draw 1. (When I die, get the effect.)"
 *
 * Rules: 194.2 / 472 (a player wins on reaching the Victory Score while strictly ahead),
 * 195 / 196 (an EFFECT that says "you win the game" ends the game as it resolves), 319.5 (a
 * Cleanup becomes Outstanding after a Chain Item resolves), 320 / 320.1 (nothing is
 * finalized or resolved while a Cleanup is being performed), 321 / 321.1 (no Cleanup is
 * performed while a Chain Item is Resolving — it only becomes Outstanding), 323.1 (Cleanup
 * task 1: check for a winner), 383.4.d (simultaneous triggers of one player go on the chain
 * in the order that player chooses), 421.4 (when the game ends, every facedown card is
 * revealed to all players), 486.5 / 486.6 (Bo3: the winner takes a Game Win, both seats'
 * battlefields from a game somebody won are out for the rest of the match, and the players
 * reset the game state and play again).
 *
 * Question: the two ways a game ends and the exact instant each takes effect, plus what the
 * match layer records. (a) POINTS: Victory 8, P1 on 7, Renata's "Score 1 point" on the chain
 * with a Reaction stacked above it — does the game end the instant the point is added, or at
 * the Cleanup after that item leaves the chain? (b) EFFECT: the Plaza's hold ability resolves
 * "you win the game" with another of P1's simultaneous hold triggers queued underneath it —
 * does that win wait for a Cleanup, and does the item below ever resolve? (c) Cross-layer:
 * what end reason does each line hand the app's currentGameResult(), and what does the Bo3
 * bookkeeping make of it?
 *
 * Expected: (a) the point does NOT end the game where it is gained — 321 forbids a Cleanup
 * while a Chain Item is Resolving and 321.1 only makes one Outstanding, so Renata's whole
 * resolution completes, the item leaves the chain, and 323.1 / 472 / 194.2 (Cleanup task 1)
 * is where P1 is declared the winner. (b) a 195 effect-win is different: the instruction
 * resolves and P1 wins there and then (196), no Cleanup is needed, and the item queued below
 * it never resolves. Both lines end with a loaded chain that is abandoned, not drained, and
 * 421.4 reveals every facedown card. (c) the points line surfaces reason "victory_points"
 * from endIf/hasPlayerWon; the effect win is not a points win, so hasPlayerWon never produces
 * it and the engine must still expose an end record — otherwise match-state.ts
 * currentGameResult() silently falls back to reason "points" and the Bo3 log mis-narrates the
 * game. Either way somebody won, so the game is recorded as MatchGameRecord{gameNumber:1,
 * winner:P1}, the score is 1-0 and, with winsNeeded 2, the broadcast is game_over, not
 * match_over.
 *
 * BOARD NOTE (383.4.d): a Watchful Sentry Deathknell cannot in fact be queued UNDERNEATH the
 * Plaza's hold trigger. The chain is LIFO, so "underneath" means "created earlier", and the
 * hold trigger is the first thing the Beginning Phase creates; a Sentry that dies earlier has
 * already had its Deathknell resolve, and one that dies later lands ABOVE (336.1). The
 * constructible form of "an item queued underneath" is a SIMULTANEOUS trigger of the same
 * player, ordered below the Plaza by its controller under 383.4.d — that is what the (b)
 * tests use, with the Deathknell covering the above-the-win side.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";
import {
  currentGameResult,
  matchSummary,
  newMatchState,
} from "../../../../../../apps/riftbound-app/server/match-state";

const PLAZA = "ogn-293-298";
const RENATA = "sfd-088-221";
const SENTRY = "ogn-096-298";
const GROVE = "ogn-280-298"; // Grove of the God-Willow — "When you hold here, draw 1."
const GUST = "ogn-169-298"; // a [Reaction] for P2 to stack above Renata's item
const HOSTILE_TAKEOVER = "sfd-202-221"; // something to sit facedown, for 421.4
const FILLER = "ogn-175-298";

/** A minimal session shaped like the app's GameSession, for the cross-layer assertions. */
function session(game: Game, format: "duel" | "match") {
  return {
    engine: game.engine,
    gameNumber: 1,
    match: newMatchState(format),
    playerNames: { [P1]: "Alice", [P2]: "Bob" },
    players: [P1, P2],
  } as never;
}

// ---------------------------------------------------------------------------
// (a) POINTS — Renata scores the 8th point with a Reaction stacked above her
// ---------------------------------------------------------------------------

/** 1v1 duel, Victory 8, P1 on 7. Renata is ready at bf1 with the ability fully affordable. */
function pointsBoard() {
  return scenario()
    .victoryScore(8)
    .points(P1, 7)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", RENATA, "renata")
    .unit(P2, "bf2", { might: 1, name: "Runner" }, "runner")
    .facedown(P2, "bf2", HOSTILE_TAKEOVER, "fd")
    .resources(P1, { energy: 4, power: { mind: 4 } })
    .resources(P2, { energy: 1 })
    .hand(P2, GUST, "gust")
    .deckTop(P1, FILLER, "p1top");
}

/** Renata's score is on the chain; P2 answers with Gust, so the chain is [score, gust]. */
async function scoreUnderReaction(): Promise<Game> {
  const game = await pointsBoard().build();
  await game.p1.activate("renata", 1); // [4][mind]x4, [Exhaust]: Score 1 point
  await game.p1.passPriority();
  await game.p2.cast("gust", { targets: "runner" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["renata", "gust"]);
  return game;
}

describe("Two ways a Riftbound game ends: a Cleanup points win vs an effect win", () => {
  test("(a) the cost is paid when the ability is activated but the POINT is not — it is an instruction that only happens on resolution", async () => {
    const game = await pointsBoard().build();
    await game.p1.activate("renata", 1);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "renata", controller: P1, type: "ability" }),
    ]);
    expect(game.state("renata").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("mind")).toBe(0);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
  });

  test("(a) LIFO (340.1): P2's Reaction resolves first and in full — P1 is still on 7 and the game is still running while Renata's item waits underneath", async () => {
    const game = await scoreUnderReaction();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("runner")).toBe("hand");
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["renata"]);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
  });

  test("(a) the win is declared only once Renata's item has LEFT the chain (321 forbids a Cleanup mid-resolution; 319.5 + 323.1 do the declaring)", async () => {
    const game = await scoreUnderReaction();
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.chain()).toEqual([]); // the item resolved and left before the winner was written
    expect(game.gameState.status).toBe("finished");
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.state("renata").isExhausted).toBe(true); // the whole resolution stands
  });

  test("(a) 421.4 — the game ending reveals P2's facedown card to everybody", async () => {
    const game = await scoreUnderReaction();
    await game.settle();
    expect(game.gameState.publicReveals ?? []).toEqual([
      expect.objectContaining({ cardIds: ["fd"], playerId: P2 }),
    ]);
  });

  test("(a) the points win is what endIf/hasPlayerWon reports: reason 'victory_points', winner P1", async () => {
    const game = await scoreUnderReaction();
    await game.settle();
    expect(game.engine.checkGameEnd()).toEqual({ reason: "victory_points", winner: P1 });
  });

  // -------------------------------------------------------------------------
  // (b) EFFECT — The Grand Plaza says "you win the game"
  // -------------------------------------------------------------------------

  /**
   * P2's turn is about to end. P1 holds the Grand Plaza (bf1) with 7 units and also holds
   * Grove of the God-Willow (bf2), so both hold abilities trigger at the start of P1's
   * Beginning Phase and P1 orders them (383.4.d).
   */
  function plazaBoard(unitsAtPlaza: number) {
    const b = scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1, def: PLAZA, inert: false })
      .battlefield("bf2", { controller: P1, def: GROVE, inert: false })
      .unit(P1, "bf2", { might: 1, name: "Grover" }, "grover")
      .facedown(P2, "bf2", HOSTILE_TAKEOVER, "fd")
      .deckTop(P1, FILLER, "p1top");
    for (let i = 0; i < unitsAtPlaza; i += 1) {
      b.unit(P1, "bf1", { might: 1, name: `Crowd ${i}` }, `u${i}`);
    }
    return b;
  }

  test("(b) both hold abilities trigger together and P1 is asked to order them (383.4.d)", async () => {
    const game = await plazaBoard(7).build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain().map((c) => c.cardId)).toEqual(["bf1", "bf2"]);
    expect(game.decision()).toMatchObject({ kind: "order", seat: P1 });
  });

  test("(b) with the Plaza ordered on TOP it resolves first and P1 wins there and then (195/196) — the Grove trigger queued underneath NEVER resolves, so P1 never draws", async () => {
    const game = await plazaBoard(7).build();
    await game.p2.endTurn();
    // first = bottom, last = top → resolves first.
    await game.p1.order(["chain-2", "chain-1"]);
    await game.settle();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    // abandoned, not drained: the Grove trigger is still sitting on the chain, unresolved.
    expect(game.chain().map((c) => c.cardId)).toEqual(["bf2"]);
    expect(game.p1.hand()).toEqual([]); // Grove's "draw 1" never happened
    expect(game.zoneOf("p1top")).toBe("mainDeck");
  });

  test("(b) the effect win does not wait for the points threshold: P1 wins holding 1 point, far below the Victory Score", async () => {
    const game = await plazaBoard(7).build();
    await game.p2.endTurn();
    await game.p1.order(["chain-2", "chain-1"]);
    await game.settle();
    expect(game.p1.points()).toBeLessThan(8);
    expect(game.gameState.status).toBe("finished");
    expect(game.winner()).toBe(P1);
  });

  test("(b) the condition is real: with only 6 units at the Plaza the hold ability wins nothing and the game carries on", async () => {
    const game = await plazaBoard(6).build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.p1.hand()).toContain("p1top"); // the Grove trigger did resolve
    expect(game.p1.hand()).toHaveLength(2); // Grove's draw + the Beginning Phase draw
  });

  // BUG (rule 431.1 / 520, separate defect — NOT a game-end bug): a unit that is already
  // lethally damaged when the position starts is never reaped. No state-based check kills it on
  // `settle()`, on a move, or across a turn boundary, so its Deathknell never fires. Every other
  // facet of this file passes; this one is parked as a lead for the state-based-check lane.
  test.failing("(b) contrast — a Watchful Sentry Deathknell created ABOVE the pending hold trigger (336.1) resolves BEFORE the win, so its draw does happen", async () => {
    const b = plazaBoard(6).unit(P1, "bf1", SENTRY, "sentry", { damage: 5 });
    const game = await b.build();
    // The lethally damaged Sentry dies at the next Open-State Cleanup and its Deathknell
    // resolves; the Plaza then holds with 7 units (the 6 above plus the Sentry's slot is
    // gone, so this board deliberately does NOT win) — the point is only that a death
    // trigger is created above whatever is pending and resolves first.
    await game.p2.endTurn();
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand().length).toBeGreaterThan(0); // the Deathknell drew
  });

  test("(b) 421.4 — an effect win ends the game too, so P2's facedown card is revealed, exactly as the points line does", async () => {
    // Both win paths now run through `operations/points.ts finishGame`, which does the 421.4
    // reveal (and writes the end record) whoever called it.
    const game = await plazaBoard(7).build();
    await game.p2.endTurn();
    await game.p1.order(["chain-2", "chain-1"]);
    await game.settle();
    expect(game.isOver()).toBe(true);
    expect(game.gameState.publicReveals ?? []).toEqual([
      expect.objectContaining({ cardIds: ["fd"], playerId: P2 }),
    ]);
  });

  // -------------------------------------------------------------------------
  // (c) cross-layer — what the match bookkeeping is told
  // -------------------------------------------------------------------------

  test("(c) the points line hands currentGameResult() a real winner; the Bo3 score becomes 1-0", async () => {
    const game = await scoreUnderReaction();
    await game.settle();
    const s = session(game, "match");
    expect(currentGameResult(s)).toMatchObject({ winner: P1 });
    const summary = matchSummary(s);
    expect(summary.score).toEqual({ [P1]: 1, [P2]: 0 });
    expect(summary.winsNeeded).toBe(2);
    // 1 win of the 2 needed ⇒ the game is over but the match is not: broadcast game_over.
    expect(summary.decided).toBe(false);
    expect(summary.winner).toBeUndefined();
  });

  test("(c) the effect win also reaches currentGameResult() as a win for P1 and scores 1-0 in the Bo3", async () => {
    const game = await plazaBoard(7).build();
    await game.p2.endTurn();
    await game.p1.order(["chain-2", "chain-1"]);
    await game.settle();
    const s = session(game, "match");
    expect(currentGameResult(s)).toMatchObject({ winner: P1 });
    const summary = matchSummary(s);
    expect(summary.score).toEqual({ [P1]: 1, [P2]: 0 });
    expect(summary.decided).toBe(false); // winsNeeded 2 ⇒ game_over, not match_over
  });

  test("(c) every win path records an engine end result, so match-state.ts narrates the REAL reason", async () => {
    // The points line reports reason "victory_points" and the effect line "effect_win", so the
    // Bo3 log can tell a Plaza win from a points win instead of defaulting to "points".
    const points = await scoreUnderReaction();
    await points.settle();
    expect(points.engine.getGameEndResult()).toEqual({ reason: "victory_points", winner: P1 });
    expect(currentGameResult(session(points, "match"))?.reason).toBe("victory_points");

    const plaza = await plazaBoard(7).build();
    await plaza.p2.endTurn();
    await plaza.p1.order(["chain-2", "chain-1"]);
    await plaza.settle();
    expect(plaza.engine.getGameEndResult()).toBeDefined();
    expect(currentGameResult(session(plaza, "match"))?.reason).not.toBe("points");
  });

  test("(c) an effect win is invisible to endIf/hasPlayerWon — that is exactly why an end record is needed", async () => {
    const game = await plazaBoard(7).build();
    await game.p2.endTurn();
    await game.p1.order(["chain-2", "chain-1"]);
    await game.settle();
    expect(game.winner()).toBe(P1);
    // 195/472.2: not a points win, so the points predicate never sees it.
    expect(game.engine.checkGameEnd()).toBeUndefined();
  });
});
