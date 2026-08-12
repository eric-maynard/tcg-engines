/**
 * Interaction: conceding out from under a finalized Score ability, through the app's two buttons.
 *   Renata Glasc, Mastermind (sfd-088-221) · Champion Unit · Mind · 5 · 4 Might —
 *     "[1][mind]: Draw 1. / [4][mind][mind][mind][mind], [Exhaust]: Score 1 point. /
 *      Use my abilities only while I'm at a battlefield."
 *   Aspirant's Climb (ogn-276-298) · Battlefield — "Increase the points needed to win the game by 1."
 *   Ahri, Alluring (ogn-066-298) · Champion Unit · Calm · 5 · 4 Might — "When I hold, you score 1 point."
 *     (the second scorer on P1's board, so the position is not a one-card curiosity)
 *
 * Question: Bo3 game 1. P1 presented Aspirant's Climb, so the Victory Score is 9. P1 is on 8 and
 * activates Renata's "Score 1 point"; it is finalized on the chain and P2 holds priority. P2 concedes.
 * Run it through both app buttons, concede_game and concede_match.
 *   (a) Does the finalized item resolve before the game ends — 9 or 8? Do 652's steps run?
 *   (b) What does the Bo3 match record hold in each case (record / score / decided / game_over vs match_over)?
 *   (c) 486.5: which battlefields are unavailable for game 2, and what is game 2's Victory Score?
 *   (d) Who chooses the first player for game 2 after a concession?
 *   (e) Contrast Bo1, and a second concede afterwards.
 *
 * Rules: 650 / 651 / 651.1 / 651.3 (a player may concede at any time; the remaining player wins),
 * 652 (the Removal-of-a-Player steps, conditional on the game continuing), 196 (winning ends the game
 * immediately), 194.3.a (Aspirant's Climb raises the Victory Score), 485.3 / 485.6 (Duel: the first
 * game is the match), 486.3 / 486.5 / 486.5.a / 486.6 (Match: battlefields used in a game somebody won
 * are removed; a game nobody won leaves them available), 115.1.a (the Mode of Play specifies the First
 * Player), 358.5 (an illegal action is rolled back entirely).
 *
 * The match-level facets exercise the app's own match layer (apps/riftbound-app/server/match.ts +
 * match-state.ts + pregame.ts) — the Core Rules have no "concede the match" button, and the
 * games-2/3 first-player rule is a documented organized-play convention the app owns.
 */
import { describe, expect, test } from "bun:test";
import type { ServerWebSocket } from "bun";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";
import { effectiveVictoryScore } from "../../../operations/points";
import type { PlayerId } from "../../../types/game-state";
import { buildDefaultDeck } from "../../../../../../apps/riftbound-app/server/decks";
import { matchSummary } from "../../../../../../apps/riftbound-app/server/match-state";
import { concedeGame, concedeMatch, voteContinue } from "../../../../../../apps/riftbound-app/server/match";
import { chooseFirstPlayer, createGameFromDecks, finalizePregame, lockSideboard, selectBattlefield } from "../../../../../../apps/riftbound-app/server/pregame";
import type { GameSession, WsData } from "../../../../../../apps/riftbound-app/server/state";

const RENATA_MASTERMIND = "sfd-088-221";
const ASPIRANTS_CLIMB = "ogn-276-298";
const AHRI = "ogn-066-298";
/** Renata's second printed ability: "[4][mind]x4, [Exhaust]: Score 1 point." */
const SCORE_ABILITY = 1;

// ---------------------------------------------------------------------------
// (a) the engine position: a finalized Score item, P2 holding priority
// ---------------------------------------------------------------------------

/** P1's turn, P1 on 8 with Aspirant's Climb in play (Victory Score 9) and Renata at that battlefield. */
function climbBoard() {
  return scenario()
    .turn(2)
    .active(P1)
    .points(P1, 8)
    .points(P2, 3)
    .resources(P1, { energy: 9, power: { mind: 5 } })
    .battlefield("climb", { controller: P1, def: ASPIRANTS_CLIMB, inert: false })
    .unit(P1, "climb", RENATA_MASTERMIND, "renata")
    .unit(P1, "climb", AHRI, "ahri")
    .unit(P2, "base", { might: 1, name: "P2 Grunt" }, "grunt");
}

/** Activate the Score ability and hand priority to P2, who then holds it over the finalized item. */
async function scoreItemPendingWithP2(): Promise<Game> {
  const game = await climbBoard().build();
  await game.p1.activate("renata", SCORE_ABILITY);
  await game.p1.passPriority();
  return game;
}

describe("Concede over a finalized Renata Score item at 8 under Aspirant's Climb", () => {
  test("(a) premise: the Victory Score really is 9, so P1's 8 is not a win — the Score ability is on the chain, unresolved, and P2 is the seat holding priority", async () => {
    const game = await scoreItemPendingWithP2();
    expect(effectiveVictoryScore(game.gameState, P1 as PlayerId)).toBe(9);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(false);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "renata", controller: P1, triggered: false })]);
    expect(game.actingSeat()).toBe(P2);
    expect(game.state("renata").isExhausted).toBe(true); // the [Exhaust] cost was paid at finalization
    expect(game.p1.energy()).toBe(5); // and the [4] too
    expect(game.p1.power("mind")).toBe(1);
  });

  test("(a) P2 concedes while holding priority: P1 wins immediately, the finalized item never resolves, P1 finishes on 8 — never on the raised Victory Score of 9 (650, 651.1, 196, 194.3.a)", async () => {
    const game = await scoreItemPendingWithP2();
    expect(game.p2.can("concede")).toBe(true);
    await game.p2.concede();

    expect(game.isOver()).toBe(true);
    expect(game.gameState.status).toBe("finished");
    expect(game.winner()).toBe(P1);
    expect(game.p1.points()).toBe(8); // NOT 9 — the chain was abandoned, not drained
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "renata" })]); // still sitting there
    expect(game.engine.getGameEndResult()).toEqual({ metadata: { concededBy: P2 }, reason: "concede", winner: P1 });
  });

  test("(a) 652's Removal-of-a-Player steps do not run — they are conditional on the game continuing: nobody is handed priority, neither seat has a legal action, and settle() reports game-over", async () => {
    const game = await scoreItemPendingWithP2();
    await game.p2.concede();
    expect(game.decision()).toBeNull();
    expect(game.actingSeat()).toBeUndefined();
    expect(game.p1.legal()).toEqual([]);
    expect(game.p2.legal()).toEqual([]);
    expect((await game.settle()).reason).toBe("game-over");
    expect(game.p1.points()).toBe(8);
    expect(game.violations()).toEqual([]);
  });

  test("(a) control: let the very same item RESOLVE and P1 reaches 9 and wins on points — so the concession really did abandon a live win", async () => {
    const game = await climbBoard().build();
    await game.p1.activate("renata", SCORE_ABILITY);
    await game.settle();
    expect(game.p1.points()).toBe(9);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.engine.getGameEndResult()?.reason).not.toBe("concede");
  });

  test("(a) a second concede after the game is over is rejected from either seat and changes nothing (650 presupposes a game in progress, 358.5)", async () => {
    const game = await scoreItemPendingWithP2();
    await game.p2.concede();
    const before = game.stateHash();
    expect(game.p1.can("concede")).toBe(false);
    expect(game.p2.can("concede")).toBe(false);
    expect((await game.p1.try((p) => p.do("concede"))).ok).toBe(false);
    expect((await game.p2.try((p) => p.do("concede"))).ok).toBe(false);
    expect(game.stateHash()).toBe(before);
    expect(game.winner()).toBe(P1);
  });
});

// ---------------------------------------------------------------------------
// (b)–(e) the app's match layer
// ---------------------------------------------------------------------------

const BASE_DECK = buildDefaultDeck();
/** P1 registers Aspirant's Climb first, so its first free battlefield is the Climb. */
const CLIMB_DECK = { ...BASE_DECK, battlefieldIds: [ASPIRANTS_CLIMB, "ogn-290-298", "ogn-284-298"] };
/** P2's three battlefields deliberately exclude Aspirant's Climb, so game 2 is not raised again. */
const PLAIN_DECK = { ...buildDefaultDeck("calm", "mind"), battlefieldIds: ["ogn-275-298", "ogn-277-298", "ogn-279-298"] };

interface Frame { type: string; match?: ReturnType<typeof matchSummary> }

let seq = 0;

/** A two-human session with a fake socket per seat capturing every broadcast frame. */
function newMatch(gameMode: "duel" | "match") {
  const gameId = `renata-concede-${++seq}`;
  const session = createGameFromDecks(CLIMB_DECK, PLAIN_DECK, gameId, {
    gameMode,
    ...(gameMode === "duel" ? { firstPlayer: P1 } : { initiative: { kind: "roll" as const } }),
    names: { [P1]: "Alice", [P2]: "Bob" },
    sandbox: false,
  });
  const seats = Object.fromEntries([P1, P2].map((pid) => {
    const frames: Frame[] = [];
    const ws = {
      close: () => undefined,
      data: { connId: `${pid}-${gameId}`, gameId, playerId: pid },
      send: (s: string) => { frames.push(JSON.parse(s) as Frame); },
    } as unknown as ServerWebSocket<WsData>;
    session.clients.set(`${pid}-${gameId}`, { playerId: pid, ws });
    return [pid, { frames, last: (t?: string) => [...frames].reverse().find((f) => !t || f.type === t) }];
  })) as Record<string, { frames: Frame[]; last: (t?: string) => Frame | undefined }>;
  return { gameId, seats, session };
}

/** Drive the current pregame to a playing game; `first` is the seat the chooser puts first. */
function playOut(session: GameSession, first: string = P1): void {
  for (let i = 0; i < 10 && session.pregame; i++) {
    const pg = session.pregame;
    if (pg.phase === "battlefield_select") {
      for (const seat of [P1, P2]) {
        if (pg.battlefieldSelections[seat]) { continue; }
        const free = (pg.battlefieldOptions[seat] ?? []).find((id) => !(pg.battlefieldExcluded?.[seat] ?? []).includes(id));
        selectBattlefield(session, seat, free);
      }
    } else if (pg.phase === "sideboard") {
      for (const seat of [P1, P2]) { lockSideboard(session, seat); }
    } else if (pg.phase === "initiative") {
      chooseFirstPlayer(session, pg.initiative?.chooser as string, first);
    } else {
      pg.mulliganComplete.add(P1);
      pg.mulliganComplete.add(P2);
      finalizePregame(session);
    }
  }
}

describe("concede_game vs concede_match in the app's Bo3 / Bo1 match layer", () => {
  test("(b) concede_game in a Bo3: the record names the conceder, the score is 1–0, the match is NOT decided, and the broadcast is game_over (the Continue interstitial)", async () => {
    const { gameId, seats, session } = newMatch("match");
    playOut(session);
    expect(session.engine.getState().status).toBe("playing");
    expect(matchSummary(session)).toMatchObject({ decided: false, format: "bo3", gameNumber: 1, winsNeeded: 2 });

    expect(concedeGame(session, gameId, P2)).toEqual({ ok: true });
    expect(session.engine.getState().status).toBe("finished");
    const summary = matchSummary(session);
    expect(summary).toMatchObject({
      current: { concededBy: P2, finished: true, reason: "concede", winner: P1 },
      decided: false,
      score: { [P1]: 1, [P2]: 0 },
    });
    expect(summary.winner).toBeUndefined();
    expect(seats[P1]?.last("game_over")?.match).toMatchObject({ decided: false, score: { [P1]: 1, [P2]: 0 } });
    expect(seats[P1]?.frames.some((f) => f.type === "match_over")).toBe(false);
    expect(seats[P2]?.last("game_over")).toBeDefined(); // both seats see the interstitial

    // Continue needs BOTH humans; then the game record is committed.
    expect(voteContinue(session, gameId, P1)).toEqual({ ok: true });
    expect(session.gameNumber).toBe(1);
    expect(voteContinue(session, gameId, P2)).toEqual({ ok: true });
    expect(session.gameNumber).toBe(2);
    expect(session.match?.games).toEqual([{ concededBy: P2, gameNumber: 1, reason: "concede", winner: P1 }]);
  });

  test("(b) concede_match: the same engine concession PLUS match.concededBy, continue votes cleared, decided true with P1 as match winner, a match_over broadcast, and voteContinue refused with MATCH_OVER", async () => {
    const { gameId, seats, session } = newMatch("match");
    playOut(session);
    expect(concedeMatch(session, gameId, P2)).toEqual({ ok: true });

    expect(session.engine.getState().status).toBe("finished"); // the running game is conceded too
    expect(session.match?.concededBy).toBe(P2);
    expect(session.match?.continueVotes).toEqual([]);
    expect(matchSummary(session)).toMatchObject({
      concededBy: P2,
      current: { concededBy: P2, finished: true, reason: "concede", winner: P1 },
      decided: true,
      winner: P1,
    });
    expect(seats[P2]?.last("match_over")?.match).toMatchObject({ concededBy: P2, decided: true, winner: P1 });
    expect(voteContinue(session, gameId, P1)).toMatchObject({ errorCode: "MATCH_OVER", ok: false });
    expect(session.gameNumber ?? 1).toBe(1); // game 2 is never built
    expect(session.pregame).toBeUndefined();
  });

  test("(c) 486.5: somebody won, so BOTH seats' game-1 battlefields are removed for the rest of the match — each must present one of its two set-aside ones", async () => {
    const { gameId, session } = newMatch("match");
    playOut(session);
    const usedIds = Object.keys(session.engine.getState().battlefields ?? {});
    expect(usedIds).toEqual(["player-1-bf-ogn-276-298", "player-2-bf-ogn-275-298"]);

    concedeGame(session, gameId, P2);
    voteContinue(session, gameId, P1);
    voteContinue(session, gameId, P2);

    expect(session.match?.usedBattlefields).toEqual({ [P1]: [ASPIRANTS_CLIMB], [P2]: ["ogn-275-298"] });
    expect(session.pregame?.battlefieldExcluded).toEqual({ [P1]: [ASPIRANTS_CLIMB], [P2]: ["ogn-275-298"] });
    expect(selectBattlefield(session, P1, ASPIRANTS_CLIMB)).toMatchObject({ ok: false });
    expect(session.pregame?.battlefieldOptions[P1]).toHaveLength(3); // still listed, just not selectable
  });

  test("(c) with Aspirant's Climb gone, game 2's Victory Score is back to the mode default of 8 (485.3 / 486.3, 194.3.a)", async () => {
    const { gameId, session } = newMatch("match");
    playOut(session);
    expect(effectiveVictoryScore(session.engine.getState(), P1 as PlayerId)).toBe(9);
    expect(effectiveVictoryScore(session.engine.getState(), P2 as PlayerId)).toBe(9); // it raises it for everyone

    concedeGame(session, gameId, P2);
    voteContinue(session, gameId, P1);
    voteContinue(session, gameId, P2);
    playOut(session, P2);

    expect(session.gameNumber).toBe(2);
    expect(Object.keys(session.engine.getState().battlefields ?? {})).not.toContain(`${P1}-bf-${ASPIRANTS_CLIMB}`);
    expect(effectiveVictoryScore(session.engine.getState(), P1 as PlayerId)).toBe(8);
    expect(effectiveVictoryScore(session.engine.getState(), P2 as PlayerId)).toBe(8);
  });

  test("(d) the conceder is the game-1 LOSER, so conceding buys P2 the first-player choice for game 2 — asserted deliberately, not derived by accident from result.winner", async () => {
    const { gameId, session } = newMatch("match");
    playOut(session);
    concedeGame(session, gameId, P2);
    voteContinue(session, gameId, P1);
    voteContinue(session, gameId, P2);

    expect(session.pregame?.initiative).toMatchObject({ afterGame: 1, chooser: P2, decided: false, kind: "loser_chooses" });
    expect(session.pregame?.initiative?.p1Roll).toBeUndefined(); // no roll in games 2–3
    // Only the chooser may answer, and the chooser may hand the first turn either way.
    playOut(session, P1); // walk to the initiative step (battlefields first)
    expect(chooseFirstPlayer(session, P1, P1)).toMatchObject({ ok: false });
  });

  test("(e) Bo1: 485.6 makes the first game the match, so a concession decides it at once — match_over, winsNeeded 1, no Continue", async () => {
    const { gameId, seats, session } = newMatch("duel");
    playOut(session);
    expect(concedeGame(session, gameId, P2)).toEqual({ ok: true });
    expect(matchSummary(session)).toMatchObject({ decided: true, format: "bo1", score: { [P1]: 1, [P2]: 0 }, winner: P1, winsNeeded: 1 });
    expect(seats[P1]?.last("match_over")).toBeDefined();
    expect(seats[P1]?.frames.some((f) => f.type === "game_over")).toBe(false);
    expect(voteContinue(session, gameId, P1)).toMatchObject({ errorCode: "MATCH_OVER", ok: false });
  });

  test("(e) a second concede is rejected in every variant and the state afterwards is byte-identical — GAME_OVER while the match lives on, MATCH_OVER once it is decided", async () => {
    // A Bo3 conceded GAME leaves the match alive, so only concede_game is refused there (conceding
    // the whole match after losing game 1 stays a real, separate action — covered by its own row).
    const cases = [
      { errorCode: "GAME_OVER", first: concedeGame, mode: "match", rejected: [concedeGame] },
      { errorCode: "MATCH_OVER", first: concedeMatch, mode: "match", rejected: [concedeGame, concedeMatch] },
      { errorCode: "MATCH_OVER", first: concedeGame, mode: "duel", rejected: [concedeGame, concedeMatch] },
      { errorCode: "MATCH_OVER", first: concedeMatch, mode: "duel", rejected: [concedeGame, concedeMatch] },
    ] as const;
    for (const { errorCode, first, mode, rejected } of cases) {
      const { gameId, session } = newMatch(mode);
      playOut(session);
      expect(first(session, gameId, P2)).toEqual({ ok: true });
      const engineBefore = JSON.stringify(session.engine.getState());
      const matchBefore = JSON.stringify(matchSummary(session));

      for (const seat of [P1, P2]) {
        for (const call of rejected) {
          expect(call(session, gameId, seat)).toMatchObject({ errorCode, ok: false });
        }
      }
      expect(JSON.stringify(session.engine.getState())).toBe(engineBefore);
      expect(JSON.stringify(matchSummary(session))).toBe(matchBefore);
      expect(matchSummary(session).current.winner).toBe(P1);
    }
  });

  test("(e) after a conceded Bo3 GAME, conceding the MATCH is still available and decides it for P1 — the two buttons are not the same action", async () => {
    const { gameId, session } = newMatch("match");
    playOut(session);
    expect(concedeGame(session, gameId, P2)).toEqual({ ok: true });
    expect(matchSummary(session).decided).toBe(false);
    expect(concedeMatch(session, gameId, P2)).toEqual({ ok: true });
    expect(matchSummary(session)).toMatchObject({ concededBy: P2, decided: true, winner: P1 });
  });
});
