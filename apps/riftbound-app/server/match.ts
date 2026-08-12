/**
 * Match flow (Bo1 duel / Bo3 match) on top of server/match-state.ts:
 * game-over / match-over announcements, Concede GAME vs Concede MATCH
 * (rule 650: a player may concede at any time), the Continue vote that builds
 * game N+1 in the SAME session (same game id, same sockets, same AI driver),
 * and the post-match Rematch.
 *
 * Between games nothing of the previous game state survives except match
 * bookkeeping: a fresh engine is built with `createGameFromDecks` from each
 * seat's post-sideboard deck (rule 486.6 "reset the game state"), the
 * battlefields already used in a game somebody won are excluded (rule 486.5),
 * and the previous game's LOSER chooses who takes the first turn (organized-
 * play convention — the Core Rules only say the Mode of Play specifies the
 * First Player, 115.1.a, and 486 is silent for games 2–3; documented in
 * README.md §Match play). Undo can never cross a game boundary: the old
 * engine — and its history — is gone once the next game is built.
 */

import type { ServerWebSocket } from "bun";
import { actorName, makeLogEntry } from "../src/narrator";
import { gameLogger } from "./log";
import { currentGameResult, ensureMatch, matchScore, matchSummary, newMatchState, scoreLine } from "./match-state";
import { broadcastPregameUpdate, createGameFromDecks, runBotPregame } from "./pregame";
import { buildAvailableMoves, buildGameSnapshot } from "./snapshot";
import { type DeckConfig, type GameSession, type WsData, broadcast } from "./state";
import { applySessionMove } from "./turn";

export type MatchActionResult = { ok: true } | { ok: false; error: string; errorCode: string };

/** Sessions whose current game's end has been announced (reset by a Rewind that un-finishes it, and by the next game). */
const announced = new WeakSet<GameSession>();

const fail = (error: string, errorCode: string): MatchActionResult => ({ error, errorCode, ok: false });

/** A `state_update` for every client with ITS seat's snapshot + moves and the match summary. */
export function broadcastState(session: GameSession, meta: { moveId: string; playerId: string }): void {
  const match = matchSummary(session);
  for (const [, client] of session.clients) {
    try {
      client.ws.send(JSON.stringify({
        match,
        moveId: meta.moveId,
        moves: buildAvailableMoves(session, client.playerId),
        playerId: meta.playerId,
        seq: session.seq,
        state: buildGameSnapshot(session, client.playerId),
        type: "state_update",
      }));
    } catch { /* disconnected */ }
  }
}

/** Full `sync` frames (pregame payload null) — used when the match ends outside a running game. */
function broadcastSync(session: GameSession): void {
  const match = matchSummary(session);
  for (const [, client] of session.clients) {
    try {
      client.ws.send(JSON.stringify({
        match,
        moves: buildAvailableMoves(session, client.playerId),
        pregame: null,
        seq: session.seq,
        state: buildGameSnapshot(session, client.playerId),
        type: "sync",
      }));
    } catch { /* disconnected */ }
  }
}

/**
 * Call after anything that may have changed the game's finished-ness (a move,
 * an AI step, a rewind). The first time the current game reads as finished it
 * is announced: a match-log line, a structured log event and a `game_over`
 * (match continues) or `match_over` (decided) broadcast carrying the summary.
 * A Rewind that takes the winning action back (sandbox) withdraws the
 * announcement and clears Continue votes so the interstitial can come again.
 */
export function noteGameState(session: GameSession, gameId?: string): void {
  if (session.pregame) {
    return;
  }
  const result = currentGameResult(session);
  const match = ensureMatch(session);
  if (result && !announced.has(session)) {
    announced.add(session);
    const summary = matchSummary(session);
    const n = summary.gameNumber;
    const who = result.winner ? actorName(result.winner, session.playerNames) : "Nobody";
    // rule 196 — the engine's end record names WHY, so the Bo3 log can tell a
    // "you win the game" effect from a points win instead of narrating both the
    // same way (`operations/points.ts finishGame` writes the record).
    const how =
      result.reason === "concede"
        ? " by concession"
        : result.reason === "effect_win"
          ? " by a game-winning effect"
          : result.reason === "victory_points"
            ? " on points"
            : "";
    if (match.format === "bo3") {
      session.log.push(makeLogEntry(`Game ${n}: ${who} wins${how}. Match score: ${scoreLine(session, summary.score)}.`));
      if (summary.decided && summary.winner) {
        session.log.push(makeLogEntry(`${actorName(summary.winner, session.playerNames)} wins the match ${summary.score[summary.winner] ?? 0}–${Math.min(...session.players.filter((p) => p !== summary.winner).map((p) => summary.score[p] ?? 0))}.`));
      }
    }
    if (gameId) {
      gameLogger.logStateChange(gameId, `game_${n}_playing`, summary.decided ? "match_over" : `game_${n}_over`);
    }
    broadcast(session, { match: summary, type: summary.decided ? "match_over" : "game_over" });
    return;
  }
  if (!result && announced.has(session) && !match.concededBy) {
    // A sandbox Rewind un-finished the game: the interstitial goes away client-side; forget the votes.
    announced.delete(session);
    match.continueVotes = [];
    broadcast(session, { match: matchSummary(session), type: "match_update" });
  }
}

/**
 * Concede the GAME (rule 650/651.1: the other seat wins this game). In a Bo3
 * the match goes on unless that was the deciding game; in a Bo1 it is the match.
 */
export function concedeGame(session: GameSession, gameId: string, playerId: string): MatchActionResult {
  if (!session.players.includes(playerId)) {
    return fail("Not a seated player", "NOT_SEATED");
  }
  if (ensureMatch(session).concededBy || matchSummary(session).decided) {
    return fail("The match is already over", "MATCH_OVER");
  }
  if (session.pregame) {
    return fail("This game has not started yet — concede the match, or leave", "GAME_NOT_STARTED");
  }
  if (session.engine.getState().status !== "playing") {
    return fail("This game is already over", "GAME_OVER");
  }
  const r = applySessionMove(session, playerId, "concede", { playerId });
  if (!r.success) {
    return fail(r.error ?? "Cannot concede right now", "CONCEDE_REJECTED");
  }
  gameLogger.logMove(gameId, "concede", playerId, { playerId, scope: "game" }, { success: true });
  session.seq++;
  broadcastState(session, { moveId: "concede", playerId });
  noteGameState(session, gameId);
  return { ok: true };
}

/**
 * Concede the MATCH: ends everything now, whatever the score. A game in
 * progress is conceded too (so its board reads Game Over); between games the
 * pending pregame is dropped.
 */
export function concedeMatch(session: GameSession, gameId: string, playerId: string): MatchActionResult {
  if (!session.players.includes(playerId)) {
    return fail("Not a seated player", "NOT_SEATED");
  }
  const match = ensureMatch(session);
  if (match.concededBy || matchSummary(session).decided) {
    return fail("The match is already over", "MATCH_OVER");
  }
  const wasPlaying = !session.pregame && session.engine.getState().status === "playing";
  if (wasPlaying) {
    const r = applySessionMove(session, playerId, "concede", { playerId });
    if (!r.success) {
      return fail(r.error ?? "Cannot concede right now", "CONCEDE_REJECTED");
    }
    gameLogger.logMove(gameId, "concede", playerId, { playerId, scope: "match" }, { success: true });
  }
  match.concededBy = playerId;
  match.continueVotes = [];
  const droppedPregame = Boolean(session.pregame);
  delete session.pregame;
  announced.add(session);
  session.log.push(makeLogEntry(`${actorName(playerId, session.playerNames)} conceded the match.`));
  const summary = matchSummary(session);
  if (match.format === "bo3" && summary.winner) {
    session.log.push(makeLogEntry(`${actorName(summary.winner, session.playerNames)} wins the match (${scoreLine(session, summary.score)}).`));
  }
  gameLogger.logStateChange(gameId, droppedPregame ? `game_${summary.gameNumber}_pregame` : `game_${summary.gameNumber}`, "match_conceded");
  session.seq++;
  if (wasPlaying) {
    broadcastState(session, { moveId: "concede", playerId });
  } else {
    broadcastSync(session);
  }
  broadcast(session, { match: summary, type: "match_over" });
  return { ok: true };
}

/** Seats whose vote is needed: every seat in a two-human game; any one in a sandbox (bot seat / hot seat). */
function votesSatisfied(session: GameSession, votes: readonly string[]): boolean {
  if (session.sandbox) {
    return votes.length > 0;
  }
  return session.players.every((p) => votes.includes(p));
}

/** "Continue" on the game-over interstitial. When every needed seat has continued, game N+1's pregame starts. */
export function voteContinue(session: GameSession, gameId: string, playerId: string): MatchActionResult {
  if (!session.players.includes(playerId)) {
    return fail("Not a seated player", "NOT_SEATED");
  }
  const summary = matchSummary(session);
  if (session.pregame || !summary.current.finished) {
    return fail("This game is not over yet", "GAME_NOT_OVER");
  }
  if (summary.decided) {
    return fail("The match is over — start a rematch or go back to the menu", "MATCH_OVER");
  }
  const match = ensureMatch(session);
  if (!match.continueVotes.includes(playerId)) {
    match.continueVotes.push(playerId);
  }
  if (votesSatisfied(session, match.continueVotes)) {
    startNextGame(session, gameId, { rematch: false });
  } else {
    broadcast(session, { match: matchSummary(session), type: "match_update" });
  }
  return { ok: true };
}

/** "Rematch" on the post-match screen: a brand-new match (game 1, registered decks, fresh score) in the same session. */
export function voteRematch(session: GameSession, gameId: string, playerId: string): MatchActionResult {
  if (!session.players.includes(playerId)) {
    return fail("Not a seated player", "NOT_SEATED");
  }
  const summary = matchSummary(session);
  if (!summary.decided) {
    return fail("The match is not over", "MATCH_NOT_OVER");
  }
  const match = ensureMatch(session);
  if (!match.rematchVotes.includes(playerId)) {
    match.rematchVotes.push(playerId);
  }
  if (votesSatisfied(session, match.rematchVotes)) {
    startNextGame(session, gameId, { rematch: true });
  } else {
    broadcast(session, { match: matchSummary(session), type: "match_update" });
  }
  return { ok: true };
}

/**
 * Build the next game IN PLACE: commit the finished game to the match record
 * (rule 486.5: its battlefields become unavailable when somebody won), then
 * replace engine / pregame / log with a fresh `createGameFromDecks` build —
 * post-sideboard decks, game number N+1 (which opens the sideboard window),
 * remaining battlefields only, and the previous loser choosing who goes first.
 * `rematch` instead resets the match: game 1, registered decks, a fresh roll.
 */
export function startNextGame(session: GameSession, gameId: string | undefined, opts: { rematch: boolean }): void {
  let match = ensureMatch(session);
  const [P1, P2] = session.players;
  const registered: Record<string, DeckConfig> = session.registeredDecks ?? session.decks ?? {};
  const prevNumber = Math.max(1, session.gameNumber ?? 1);
  let loser: string | undefined;

  if (opts.rematch) {
    match = newMatchState(session.gameMode);
    session.match = match;
  } else {
    const result = currentGameResult(session);
    if (result && !match.games.some((g) => g.gameNumber === prevNumber)) {
      match.games.push({ gameNumber: prevNumber, ...result });
      if (result.winner) {
        // rule 486.5 — both seats' battlefields from a game somebody won are out for the rest of the match.
        const engineBfs = session.engine.getState().battlefields ?? {};
        for (const pid of session.players) {
          const used = Object.keys(engineBfs)
            .filter((cardId) => cardId.startsWith(`${pid}-bf-`))
            .map((cardId) => cardId.slice(`${pid}-bf-`.length));
          match.usedBattlefields[pid] = [...new Set([...(match.usedBattlefields[pid] ?? []), ...used])];
        }
        loser = session.players.find((p) => p !== result.winner);
      }
    }
  }
  match.continueVotes = [];
  match.rematchVotes = [];

  const nextNumber = opts.rematch ? 1 : prevNumber + 1;
  const deckFor = (pid: string): DeckConfig =>
    (opts.rematch ? registered[pid] : (session.postSideboardDecks?.[pid] ?? session.decks?.[pid] ?? registered[pid])) as DeckConfig;
  const d1 = deckFor(P1);
  const d2 = deckFor(P2);
  const fresh = createGameFromDecks(d1, d2, undefined, {
    excludedBattlefields: opts.rematch ? {} : match.usedBattlefields,
    gameMode: session.gameMode ?? (match.format === "bo3" ? "match" : "duel"),
    gameNumber: nextNumber,
    hotSeat: session.hotSeat === true,
    // Previous game's loser chooses who goes first; nobody lost (or a rematch) ⇒ roll for it.
    initiative: loser ? { afterGame: prevNumber, chooser: loser, kind: "loser_chooses" } : { kind: "roll" },
    names: session.playerNames,
    sandbox: session.sandbox,
    sideboardBeforeGame1: session.sideboardBeforeGame1 === true,
  });

  const score = matchScore(session, false);
  const header = match.format === "bo3"
    ? [makeLogEntry(`— Game ${nextNumber} of the match · ${scoreLine(session, score)} —`)]
    : opts.rematch ? [makeLogEntry("— Rematch —")] : [];

  session.engine = fresh.engine;
  session.pregame = fresh.pregame;
  session.log = [...header, ...fresh.log];
  session.gameNumber = nextNumber;
  session.registeredDecks = registered;
  session.decks = { [P1]: d1, [P2]: d2 };
  delete session.postSideboardDecks;
  announced.delete(session);
  session.seq++;
  if (gameId) {
    gameLogger.logStateChange(gameId, opts.rematch ? "match_over" : `game_${prevNumber}_over`, `game_${nextNumber}_pregame`);
  }
  broadcastPregameUpdate(session);
  // The bot seat (Goldfish / Claude) owes its battlefield / lock-in / first-player choice for this game too.
  void runBotPregame(session, gameId ? { gameId } : {});
}

/**
 * Match-level WebSocket messages: `concede_game`, `concede_match`,
 * `match_continue`, `match_rematch`. Returns true when the message was one of
 * these (handled, possibly with an error frame back to the sender).
 */
export function handleMatchMessage(
  ws: ServerWebSocket<WsData>,
  msg: Record<string, unknown>,
  session: GameSession,
  gameId: string,
  playerId: string,
): boolean {
  let r: MatchActionResult;
  switch (msg.type) {
    case "concede_game": {
      r = concedeGame(session, gameId, playerId);
      break;
    }
    case "concede_match": {
      r = concedeMatch(session, gameId, playerId);
      break;
    }
    case "match_continue": {
      r = voteContinue(session, gameId, playerId);
      break;
    }
    case "match_rematch": {
      r = voteRematch(session, gameId, playerId);
      break;
    }
    default: {
      return false;
    }
  }
  if (!r.ok) {
    try {
      ws.send(JSON.stringify({ error: r.error, errorCode: r.errorCode, requestId: msg.requestId, type: "error" }));
    } catch { /* disconnected */ }
  }
  return true;
}
