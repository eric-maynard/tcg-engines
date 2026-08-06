/**
 * Structured game logger instance + /api/logs routes.
 */

import { GameLogger } from "../src/game-logger";
import { APP_DIR } from "./config";
import { json } from "./http";
import type { RouteCtx, RouteResult } from "./state";

// Initialize structured game logger
export const gameLogger = new GameLogger(APP_DIR);

export async function handleLogRoutes(req: Request, url: URL, _ctx: RouteCtx): RouteResult {
  const { pathname } = url;

  // GET /api/logs/:gameId — retrieve full move log for a game
  if (pathname.match(/^\/api\/logs\/[^/]+$/) && req.method === "GET") {
    const logGameId = pathname.split("/")[3];
    const entries = gameLogger.getGameLog(logGameId);
    if (entries.length === 0) {
      return json({ error: "No logs found for this game" }, 404);
    }
    return json({ count: entries.length, entries, gameId: logGameId });
  }

  // POST /api/archive-logs — archive game logs older than N days
  if (pathname === "/api/archive-logs" && req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { olderThanDays?: number };
    const days = body.olderThanDays ?? 7;
    if (days < 1) {
      return json({ error: "olderThanDays must be at least 1" }, 400);
    }
    const archived = gameLogger.archiveOldLogs(days);
    return json({ archived, message: `Archived ${archived} log file(s) older than ${days} day(s)` });
  }

  return null;
}
