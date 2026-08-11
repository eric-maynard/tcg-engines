/**
 * Match bookkeeping (Bo1 duel / Bo3 match) — the leaf module: types, the
 * per-session `MatchState`, and the public summary every seat may see. No
 * imports from pregame/ws (server/match.ts drives the flow on top of this).
 *
 * rule 486.6 — Match (Bo3): the winner of a game earns one Game Win; players
 * reset the game state, remove the battlefields in play, choose new ones from
 * those set aside and play again; first to two Game Wins wins the match.
 * rule 485.6 — Duel (Bo1): the first game decides the match.
 * rule 486.5 — after a game somebody won, the battlefields used in it are
 * removed and may not be selected again this match (486.5.a: a game nobody
 * won leaves them available).
 */

import type { GameSession } from "./state";

/** One finished game of the match. `winner` null = nobody won (rule 486.5.a). */
export interface MatchGameRecord {
  gameNumber: number;
  winner: string | null;
  /** Engine end reason ("victory_points", "concede", …) or "points" when only state.winner is known. */
  reason: string;
  /** Seat that conceded this game, when it ended by concession (rule 650). */
  concededBy?: string;
}

export interface MatchState {
  format: "bo1" | "bo3";
  /** Game wins that take the match: 1 (Bo1) / 2 (Bo3). */
  winsNeeded: number;
  /** Games already left behind (the CURRENT game is derived live from the engine). */
  games: MatchGameRecord[];
  /** rule 486.5 — per seat, battlefield definition ids used in a game somebody won. */
  usedBattlefields: Record<string, string[]>;
  /** Seat that conceded the MATCH (ends it regardless of score). */
  concededBy?: string;
  /** Seats that pressed Continue on the game-over interstitial. */
  continueVotes: string[];
  /** Seats that asked for a rematch on the post-match screen. */
  rematchVotes: string[];
}

/** What every seat is told about the match (public — no hidden information). */
export interface MatchSummary {
  format: "bo1" | "bo3";
  winsNeeded: number;
  /** 1-based number of the game in progress / just finished. */
  gameNumber: number;
  games: MatchGameRecord[];
  /** The current game's result once the engine says it is over (provisional until Continue: a sandbox Rewind can still take it back). */
  current: { finished: boolean; winner?: string | null; reason?: string; concededBy?: string };
  /** Game wins per seat, the current finished game included. */
  score: Record<string, number>;
  decided: boolean;
  /** Match winner once decided (by wins or by the other seat conceding the match). */
  winner?: string;
  concededBy?: string;
  continueVotes: string[];
  rematchVotes: string[];
  usedBattlefields: Record<string, string[]>;
}

export function newMatchState(gameMode: "duel" | "match" | undefined): MatchState {
  const bo3 = gameMode === "match";
  return {
    continueVotes: [],
    format: bo3 ? "bo3" : "bo1",
    games: [],
    rematchVotes: [],
    usedBattlefields: {},
    winsNeeded: bo3 ? 2 : 1,
  };
}

/** The session's match state, created on first use from `session.gameMode`. */
export function ensureMatch(session: GameSession): MatchState {
  if (!session.match) {
    session.match = newMatchState(session.gameMode ?? session.pregame?.gameMode);
  }
  return session.match;
}

/**
 * The current game's result straight from the engine: `null` while it is not
 * over. Reason comes from the engine's end record (concede / victory_points…);
 * a finished state without one (patched / legacy) reads as a points win.
 */
export function currentGameResult(session: GameSession): { winner: string | null; reason: string; concededBy?: string } | null {
  const state = session.engine.getState();
  if (state.status !== "finished") {
    return null;
  }
  const end = session.engine.getGameEndResult?.();
  const winner = (end?.winner as string | undefined) ?? (state.winner as string | undefined) ?? null;
  const reason = end?.reason ?? (winner ? "points" : "none");
  const concededBy = (end?.metadata as { concededBy?: string } | undefined)?.concededBy;
  return { ...(concededBy ? { concededBy } : {}), reason, winner };
}

export function matchScore(session: GameSession, includeCurrent = true): Record<string, number> {
  const match = ensureMatch(session);
  const score: Record<string, number> = Object.fromEntries(session.players.map((p) => [p, 0]));
  for (const g of match.games) {
    if (g.winner && g.winner in score) {score[g.winner] = (score[g.winner] ?? 0) + 1;}
  }
  if (includeCurrent) {
    const cur = currentGameResult(session);
    if (cur?.winner && cur.winner in score) {score[cur.winner] = (score[cur.winner] ?? 0) + 1;}
  }
  return score;
}

export function matchSummary(session: GameSession): MatchSummary {
  const match = ensureMatch(session);
  const cur = currentGameResult(session);
  const score = matchScore(session, true);
  let winner: string | undefined;
  if (match.concededBy) {
    winner = session.players.find((p) => p !== match.concededBy);
  } else {
    winner = session.players.find((p) => (score[p] ?? 0) >= match.winsNeeded);
  }
  return {
    ...(match.concededBy ? { concededBy: match.concededBy } : {}),
    continueVotes: [...match.continueVotes],
    current: cur ? { finished: true, ...cur } : { finished: false },
    decided: Boolean(winner),
    format: match.format,
    gameNumber: Math.max(1, session.gameNumber ?? 1),
    games: match.games.map((g) => ({ ...g })),
    rematchVotes: [...match.rematchVotes],
    score,
    usedBattlefields: Object.fromEntries(Object.entries(match.usedBattlefields).map(([k, v]) => [k, [...v]])),
    ...(winner ? { winner } : {}),
    winsNeeded: match.winsNeeded,
  };
}

/** "Alice 1 – 0 Goldfish" for log lines. */
export function scoreLine(session: GameSession, score: Record<string, number> = matchScore(session)): string {
  const [a, b] = session.players;
  return `${session.playerNames[a] ?? a} ${score[a] ?? 0} – ${score[b] ?? 0} ${session.playerNames[b] ?? b}`;
}
