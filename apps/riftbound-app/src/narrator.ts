/**
 * Narrator — Rift Atlas-style match log narration.
 *
 * Produces structured {@link LogEntry} objects with real-time timestamps and
 * optional rewind markers, used by the match log panel in the gameplay UI.
 *
 * The match log is a list of narrated plain-language descriptions of every
 * meaningful state transition that has happened in a game session. Entries
 * are modelled after play.riftatlas.com's verbosity — every roll, lock,
 * mulligan, play, move, equip, exhaust, focus pass, and turn end gets its
 * own line so a player can reconstruct what happened without replaying the
 * game state.
 *
 * Entries are plain data objects so they can be sent over the wire in the
 * game snapshot without any serialization concerns.
 */

/** A single narrated match-log entry. */
export interface LogEntry {
  /** The human-readable narration line. */
  text: string;
  /** Real-time timestamp formatted as `HH:MM` in the server's local zone. */
  timestamp: string;
  /**
   * Whether this entry represents a player-driven action that can be
   * rewound to. The renderer shows a clickable `↺` marker for rewindable
   * entries; the wiring to the rewind system lands in Workstream 8.
   */
  rewindable: boolean;
  /**
   * Optional stable key for deduping entries when the snapshot is
   * rebuilt (e.g. replay history index). Not required for rendering.
   */
  key?: string;
}

/**
 * Format a timestamp (in ms since epoch, or the current time if omitted)
 * as `HH:MM` in 24-hour local time.
 */
export function formatTimestamp(ms?: number): string {
  const date = typeof ms === "number" ? new Date(ms) : new Date();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** Options for constructing a {@link LogEntry}. */
export interface MakeLogEntryOptions {
  /** Explicit timestamp in ms. Defaults to now. */
  timestampMs?: number;
  /** Whether the entry should show a clickable rewind marker. */
  rewindable?: boolean;
  /** Stable key (e.g. replay history index). */
  key?: string;
}

/** Build a {@link LogEntry} for the given narration text. */
export function makeLogEntry(
  text: string,
  opts?: MakeLogEntryOptions,
): LogEntry {
  return {
    key: opts?.key,
    rewindable: opts?.rewindable ?? false,
    text,
    timestamp: formatTimestamp(opts?.timestampMs),
  };
}

/**
 * Given a player ID and the mapping of display names, return a
 * possessive-ready actor label. Defaults to the literal player ID
 * if no name is available.
 */
export function actorName(
  playerId: string,
  playerNames: Record<string, string>,
): string {
  return playerNames[playerId] ?? playerId;
}
