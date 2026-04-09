/**
 * GameLogger — Structured game event logging with JSONL file persistence.
 *
 * Logs to both console (for development) and per-game JSONL files (for
 * persistence, replay, and debugging). Also maintains a summary file
 * with game start/end entries.
 *
 * File layout:
 *   logs/games/{gameId}.jsonl   — per-game event stream
 *   logs/games/summary.jsonl    — game_created + game_completed entries
 *   logs/archive/{date}/        — archived old logs
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface GameLogEntry {
  timestamp: string;
  gameId: string;
  type:
    | "game_created"
    | "move_executed"
    | "move_rejected"
    | "state_change"
    | "player_connected"
    | "player_disconnected"
    | "game_completed"
    | "error";
  data: Record<string, unknown>;
}

/** In-memory tracking for game start times (used to compute duration). */
const gameStartTimes = new Map<string, number>();

export class GameLogger {
  private readonly gamesDir: string;
  private readonly archiveDir: string;
  private readonly summaryPath: string;

  constructor(baseDir: string) {
    this.gamesDir = path.join(baseDir, "logs", "games");
    this.archiveDir = path.join(baseDir, "logs", "archive");
    this.summaryPath = path.join(this.gamesDir, "summary.jsonl");
    this.ensureDirectories();
  }

  /** Create log directories if they do not exist. */
  private ensureDirectories(): void {
    fs.mkdirSync(this.gamesDir, { recursive: true });
    fs.mkdirSync(this.archiveDir, { recursive: true });
  }

  // ------------------------------------------------------------------
  // Public logging methods
  // ------------------------------------------------------------------

  logGameCreated(
    gameId: string,
    players: string[],
    mode: string,
    seed: string,
    extra?: Record<string, unknown>,
  ): void {
    gameStartTimes.set(gameId, Date.now());
    const entry = this.buildEntry(gameId, "game_created", {
      mode,
      players,
      seed,
      ...extra,
    });
    this.writeToGame(gameId, entry);
    this.writeToSummary(entry);
    console.log(
      `[GameLogger] Game created: ${gameId} mode=${mode} players=${players.join(",")}`,
    );
  }

  logMove(
    gameId: string,
    moveType: string,
    playerId: string,
    params: Record<string, unknown>,
    result: { success: boolean; error?: string },
  ): void {
    const entry = this.buildEntry(gameId, "move_executed", {
      moveType,
      params: this.sanitizeParams(params),
      playerId,
      success: result.success,
    });
    this.writeToGame(gameId, entry);
  }

  logMoveRejected(
    gameId: string,
    moveType: string,
    playerId: string,
    params: Record<string, unknown>,
    reason: string,
  ): void {
    const entry = this.buildEntry(gameId, "move_rejected", {
      moveType,
      params: this.sanitizeParams(params),
      playerId,
      reason,
    });
    this.writeToGame(gameId, entry);
    console.warn(
      `[GameLogger] Move rejected in ${gameId}: ${moveType} by ${playerId} — ${reason}`,
    );
  }

  logStateChange(gameId: string, from: string, to: string): void {
    const entry = this.buildEntry(gameId, "state_change", { from, to });
    this.writeToGame(gameId, entry);
    console.log(`[GameLogger] State change in ${gameId}: ${from} -> ${to}`);
  }

  logPlayerConnected(gameId: string, playerId: string, connId?: string): void {
    const entry = this.buildEntry(gameId, "player_connected", {
      connId,
      playerId,
    });
    this.writeToGame(gameId, entry);
  }

  logPlayerDisconnected(
    gameId: string,
    playerId: string,
    connId?: string,
    reason?: string,
  ): void {
    const entry = this.buildEntry(gameId, "player_disconnected", {
      connId,
      playerId,
      reason,
    });
    this.writeToGame(gameId, entry);
  }

  logGameCompleted(
    gameId: string,
    winner: string | null,
    scores: Record<string, unknown>,
    moveCount: number,
    durationMs: number,
  ): void {
    const entry = this.buildEntry(gameId, "game_completed", {
      durationFormatted: this.formatDuration(durationMs),
      durationMs,
      moveCount,
      scores,
      winner,
    });
    this.writeToGame(gameId, entry);
    this.writeToSummary(entry);
    gameStartTimes.delete(gameId);
    console.log(
      `[GameLogger] Game completed: ${gameId} winner=${winner ?? "none"} moves=${moveCount} duration=${this.formatDuration(durationMs)}`,
    );
  }

  logError(
    gameId: string,
    error: unknown,
    context?: Record<string, unknown>,
  ): void {
    const entry = this.buildEntry(gameId, "error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      ...context,
    });
    this.writeToGame(gameId, entry);
    console.error(
      `[GameLogger] Error in ${gameId}:`,
      error instanceof Error ? error.message : error,
    );
  }

  // ------------------------------------------------------------------
  // Log retrieval
  // ------------------------------------------------------------------

  /** Read all log entries for a specific game. Returns parsed entries. */
  getGameLog(gameId: string): GameLogEntry[] {
    const filePath = path.join(this.gamesDir, `${gameId}.jsonl`);
    if (!fs.existsSync(filePath)) {return [];}

    const content = fs.readFileSync(filePath, "utf8");
    const entries: GameLogEntry[] = [];

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {continue;}
      try {
        entries.push(JSON.parse(trimmed) as GameLogEntry);
      } catch {
        // Skip malformed lines
      }
    }

    return entries;
  }

  /** Get the start time for a game (for computing duration). */
  getGameStartTime(gameId: string): number | undefined {
    return gameStartTimes.get(gameId);
  }

  // ------------------------------------------------------------------
  // Archival
  // ------------------------------------------------------------------

  /**
   * Move completed game logs older than `olderThanDays` to the archive
   * directory, organized by date.
   *
   * Returns the number of files archived.
   */
  archiveOldLogs(olderThanDays: number): number {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    let archived = 0;

    const files = fs.readdirSync(this.gamesDir);
    for (const file of files) {
      // Only archive per-game JSONL files (skip summary.jsonl)
      if (file === "summary.jsonl" || !file.endsWith(".jsonl")) {continue;}

      const filePath = path.join(this.gamesDir, file);
      const stat = fs.statSync(filePath);

      if (stat.mtimeMs < cutoff) {
        const dateStr = new Date(stat.mtimeMs).toISOString().slice(0, 10);
        const destDir = path.join(this.archiveDir, dateStr);
        fs.mkdirSync(destDir, { recursive: true });

        const destPath = path.join(destDir, file);
        fs.renameSync(filePath, destPath);
        archived++;
      }
    }

    if (archived > 0) {
      console.log(
        `[GameLogger] Archived ${archived} log file(s) older than ${olderThanDays} day(s)`,
      );
    }

    return archived;
  }

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  private buildEntry(
    gameId: string,
    type: GameLogEntry["type"],
    data: Record<string, unknown>,
  ): GameLogEntry {
    return {
      data,
      gameId,
      timestamp: new Date().toISOString(),
      type,
    };
  }

  /**
   * Write a log entry to the per-game JSONL file.
   * Uses async appendFile so logging never blocks gameplay.
   */
  private writeToGame(gameId: string, entry: GameLogEntry): void {
    const filePath = path.join(this.gamesDir, `${gameId}.jsonl`);
    const line = JSON.stringify(entry) + "\n";
    fs.promises.appendFile(filePath, line).catch((error) => {
      console.error(`[GameLogger] Failed to write game log ${gameId}:`, error);
    });
  }

  /**
   * Write a log entry to the summary JSONL file.
   * Uses async appendFile so logging never blocks gameplay.
   */
  private writeToSummary(entry: GameLogEntry): void {
    const line = JSON.stringify(entry) + "\n";
    fs.promises.appendFile(this.summaryPath, line).catch((error) => {
      console.error("[GameLogger] Failed to write summary log:", error);
    });
  }

  /**
   * Sanitize move params to avoid logging sensitive or oversized data.
   * Strips full card arrays, keeping only IDs and counts.
   */
  private sanitizeParams(
    params: Record<string, unknown>,
  ): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value) && value.length > 20) {
        // Large arrays (like full deck contents) — log count only
        sanitized[key] = `[${value.length} items]`;
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  }
}
