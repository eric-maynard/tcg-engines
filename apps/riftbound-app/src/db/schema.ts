/**
 * Database Schema & Migrations
 *
 * Uses Bun's built-in SQLite (bun:sqlite). Persists at data/riftbound.db.
 * Standard SQL — swappable to Postgres/RDS later.
 */

import { Database } from "bun:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";

const DB_DIR = path.join(import.meta.dir, "../../data");
const DB_PATH = path.join(DB_DIR, "riftbound.db");

let _db: Database | null = null;

export function getDb(): Database {
  if (!_db) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    _db = new Database(DB_PATH);
    _db.run("PRAGMA journal_mode = WAL");
    _db.run("PRAGMA foreign_keys = ON");
    runMigrations(_db);
  }
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

function runMigrations(db: Database): void {
  db.run(`CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const row = db.query("SELECT MAX(version) as v FROM schema_version").get() as { v: number | null };
  const version = row?.v ?? 0;

  if (version < 1) {
    db.run(`CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE decks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      format TEXT NOT NULL DEFAULT 'duel',
      legend_id TEXT NOT NULL,
      champion_id TEXT NOT NULL,
      is_public INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.run("CREATE INDEX idx_decks_user ON decks(user_id)");

    db.run(`CREATE TABLE deck_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      card_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity >= 1 AND quantity <= 12),
      zone TEXT NOT NULL DEFAULT 'main' CHECK(zone IN ('main', 'sideboard', 'rune', 'battlefield'))
    )`);
    db.run("CREATE INDEX idx_deck_cards_deck ON deck_cards(deck_id)");
    db.run("CREATE UNIQUE INDEX idx_deck_cards_unique ON deck_cards(deck_id, card_id, zone)");

    db.run(`CREATE TABLE deck_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      snapshot TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.run("CREATE INDEX idx_deck_versions_deck ON deck_versions(deck_id)");

    db.run("INSERT INTO schema_version (version) VALUES (1)");
    console.log("Database migrated to version 1");
  }

  if (version < 2) {
    db.run("ALTER TABLE decks ADD COLUMN is_valid INTEGER NOT NULL DEFAULT 1");
    db.run("ALTER TABLE decks ADD COLUMN validation_errors TEXT DEFAULT '[]'");
    db.run("INSERT INTO schema_version (version) VALUES (2)");
    console.log("Database migrated to version 2");
  }

  if (version < 3) {
    db.run("ALTER TABLE decks ADD COLUMN game_version TEXT NOT NULL DEFAULT 'standard'");
    db.run("INSERT INTO schema_version (version) VALUES (3)");
    console.log("Database migrated to version 3");
  }

  if (version < 4) {
    // Selected_deck — the user's currently-active deck for matchmaking.
    // Nullable; we don't use REFERENCES decks(id) here so that deleting a
    // Deck doesn't blow up users' rows. The endpoint validates the FK.
    db.run("ALTER TABLE users ADD COLUMN selected_deck TEXT");
    db.run("INSERT INTO schema_version (version) VALUES (4)");
    console.log("Database migrated to version 4");
  }

  if (version < 5) {
    // Slice 7 — completed games + replays. One row per finished game; the
    // Move_log JSON is the engine's full trail (each entry has seq, playerId,
    // MoveId, params, success, label) which the replay viewer walks step by
    // Step. winner_user_id is nullable for draws/aborts.
    db.run(`CREATE TABLE games (
      id TEXT PRIMARY KEY,
      host_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      guest_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      winner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      session_id TEXT,
      room_code TEXT,
      move_count INTEGER NOT NULL DEFAULT 0,
      move_log TEXT NOT NULL DEFAULT '[]',
      result TEXT NOT NULL DEFAULT 'win',
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.run("CREATE INDEX idx_games_host ON games(host_user_id)");
    db.run("CREATE INDEX idx_games_guest ON games(guest_user_id)");
    db.run("CREATE INDEX idx_games_session ON games(session_id)");

    db.run("INSERT INTO schema_version (version) VALUES (5)");
    console.log("Database migrated to version 5");
  }

  if (version < 6) {
    // Slice 7 — friendships. Status is `pending` (requester sent invite, not
    // Yet accepted) or `accepted`. Bidirectional friendship is encoded as the
    // Pair (requester_id, addressee_id); the read query checks either column.
    db.run(`CREATE TABLE friendships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      addressee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'blocked')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.run("CREATE INDEX idx_friendships_req ON friendships(requester_id)");
    db.run("CREATE INDEX idx_friendships_addr ON friendships(addressee_id)");
    db.run("CREATE UNIQUE INDEX idx_friendships_pair ON friendships(requester_id, addressee_id)");

    db.run("INSERT INTO schema_version (version) VALUES (6)");
    console.log("Database migrated to version 6");
  }
}
