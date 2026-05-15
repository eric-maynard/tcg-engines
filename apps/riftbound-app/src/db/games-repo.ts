/**
 * Games + Replays Repository — slice 7.
 *
 * One row per completed game. We persist:
 *   - The two participants (nullable for goldfish / unauthenticated games)
 *   - The winner (nullable for draws)
 *   - The full move log (JSON array) so the replay viewer can walk steps
 *   - Timestamps for "recent games" sort
 *
 * Replay storage is a TEXT column on the games row rather than a separate
 * table — keeps the read query for `/api/replays/:gameId` a single SELECT
 * and avoids a join when listing the user's recent games on their profile.
 *
 * The `move_log` field is opaque to this repo: callers shape it to whatever
 * structure they want (we use the engine's `SessionStep` shape minus the
 * `viewAfter` snapshot, since that would blow up the row size).
 */

import { getDb } from "./schema";

export interface GameSummary {
  id: string;
  hostUserId: string | null;
  guestUserId: string | null;
  winnerUserId: string | null;
  sessionId: string | null;
  roomCode: string | null;
  moveCount: number;
  result: "win" | "draw" | "abort";
  startedAt: string;
  endedAt: string;
}

export interface GameWithLog extends GameSummary {
  moveLog: ReplayStep[];
}

/** One serialized step in the replay log. */
export interface ReplayStep {
  seq: number;
  playerId: string;
  moveId: string;
  params: Record<string, unknown>;
  success: boolean;
  error?: string;
  label?: string;
  undone?: boolean;
}

export interface CreateGameInput {
  hostUserId: string | null;
  guestUserId: string | null;
  winnerUserId: string | null;
  sessionId: string | null;
  roomCode: string | null;
  moveCount: number;
  result?: "win" | "draw" | "abort";
  moveLog: ReplayStep[];
  startedAt?: string;
}

export function createGame(input: CreateGameInput): GameSummary {
  const db = getDb();
  const id = crypto.randomUUID();
  const result = input.result ?? (input.winnerUserId ? "win" : "draw");
  const startedAt = input.startedAt ?? new Date().toISOString();

  db.run(
    `INSERT INTO games
      (id, host_user_id, guest_user_id, winner_user_id, session_id, room_code,
       move_count, move_log, result, started_at, ended_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      id,
      input.hostUserId,
      input.guestUserId,
      input.winnerUserId,
      input.sessionId,
      input.roomCode,
      input.moveCount,
      JSON.stringify(input.moveLog ?? []),
      result,
      startedAt,
    ],
  );

  return getGameSummary(id)!;
}

/**
 * Look up an in-flight game by sessionId — used by the server's game-end
 * detection hook to dedupe (don't insert a second row if a winner-flag
 * arrives via SSE more than once).
 */
export function findGameBySessionId(sessionId: string): GameSummary | null {
  const db = getDb();
  const row = db.query(
    `SELECT id, host_user_id as hostUserId, guest_user_id as guestUserId,
            winner_user_id as winnerUserId, session_id as sessionId, room_code as roomCode,
            move_count as moveCount, result, started_at as startedAt, ended_at as endedAt
     FROM games WHERE session_id = ? ORDER BY ended_at DESC LIMIT 1`,
  ).get(sessionId) as GameSummary | null;
  return row ?? null;
}

export function getGameSummary(gameId: string): GameSummary | null {
  const db = getDb();
  const row = db.query(
    `SELECT id, host_user_id as hostUserId, guest_user_id as guestUserId,
            winner_user_id as winnerUserId, session_id as sessionId, room_code as roomCode,
            move_count as moveCount, result, started_at as startedAt, ended_at as endedAt
     FROM games WHERE id = ?`,
  ).get(gameId) as GameSummary | null;
  return row ?? null;
}

export function getGameWithLog(gameId: string): GameWithLog | null {
  const db = getDb();
  const row = db.query(
    `SELECT id, host_user_id as hostUserId, guest_user_id as guestUserId,
            winner_user_id as winnerUserId, session_id as sessionId, room_code as roomCode,
            move_count as moveCount, move_log as moveLog, result,
            started_at as startedAt, ended_at as endedAt
     FROM games WHERE id = ?`,
  ).get(gameId) as (GameSummary & { moveLog: string }) | null;
  if (!row) {return null;}

  let parsed: ReplayStep[] = [];
  try { parsed = JSON.parse(row.moveLog || "[]") as ReplayStep[]; } catch { parsed = []; }

  return { ...row, moveLog: parsed };
}

export function listGamesForUser(userId: string, limit = 25): GameSummary[] {
  const db = getDb();
  return db.query(
    `SELECT id, host_user_id as hostUserId, guest_user_id as guestUserId,
            winner_user_id as winnerUserId, session_id as sessionId, room_code as roomCode,
            move_count as moveCount, result, started_at as startedAt, ended_at as endedAt
     FROM games
     WHERE host_user_id = ? OR guest_user_id = ?
     ORDER BY ended_at DESC
     LIMIT ?`,
  ).all(userId, userId, limit) as GameSummary[];
}

export interface UserGameStats {
  gameCount: number;
  winCount: number;
  lossCount: number;
  drawCount: number;
}

export function getStatsForUser(userId: string): UserGameStats {
  const db = getDb();
  const games = db.query(
    `SELECT host_user_id as hostUserId, guest_user_id as guestUserId,
            winner_user_id as winnerUserId, result
     FROM games
     WHERE host_user_id = ? OR guest_user_id = ?`,
  ).all(userId, userId) as {
    hostUserId: string | null;
    guestUserId: string | null;
    winnerUserId: string | null;
    result: string;
  }[];

  let winCount = 0;
  let lossCount = 0;
  let drawCount = 0;
  for (const g of games) {
    if (g.result === "draw") {
      drawCount += 1;
      continue;
    }
    if (g.winnerUserId === userId) {
      winCount += 1;
    } else if (g.winnerUserId !== null) {
      lossCount += 1;
    } else {
      drawCount += 1;
    }
  }

  return { drawCount, gameCount: games.length, lossCount, winCount };
}
