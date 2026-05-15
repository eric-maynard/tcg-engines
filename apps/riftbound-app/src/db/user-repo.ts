/**
 * User Repository — simple auth using bun:sqlite + Bun crypto.
 */

import { getDb } from "./schema";

export interface User {
  id: string;
  username: string;
  displayName: string | null;
  createdAt: string;
}

function hashPassword(password: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(password + "riftbound-salt-v1");
  return hasher.digest("hex");
}

export function createUser(username: string, password: string, displayName?: string): User {
  const db = getDb();
  const id = crypto.randomUUID();
  const passwordHash = hashPassword(password);

  // Cap display name to 32 chars; fall back to username prefix if not provided
  const name = (displayName || username).slice(0, 32);

  db.run(
    "INSERT INTO users (id, username, display_name, password_hash) VALUES (?, ?, ?, ?)",
    [id, username, name, passwordHash],
  );

  return { createdAt: new Date().toISOString(), displayName: name, id, username };
}

export function authenticateUser(username: string, password: string): User | null {
  const db = getDb();
  const row = db.query(
    `SELECT id, username, display_name as displayName, password_hash as passwordHash, created_at as createdAt
     FROM users WHERE username = ?`,
  ).get(username) as (User & { passwordHash: string }) | null;

  if (!row) {return null;}
  if (hashPassword(password) !== row.passwordHash) {return null;}

  return { createdAt: row.createdAt, displayName: row.displayName, id: row.id, username: row.username };
}

export function getUserById(userId: string): User | null {
  const db = getDb();
  const row = db.query(
    "SELECT id, username, display_name as displayName, created_at as createdAt FROM users WHERE id = ?",
  ).get(userId) as User | null;
  return row ?? null;
}

/**
 * Active-deck helpers — added in schema v4.
 *
 * `selected_deck` is the deck the user wants to use by default when
 * creating/joining matchmaking lobbies. We don't FK-cascade it (so deleting
 * a deck doesn't crash the user row) — instead the setter validates that the
 * deck exists + is owned by the caller, and the getter returns null if the
 * underlying deck has since been deleted.
 */
export function getActiveDeckId(userId: string): string | null {
  const db = getDb();
  const row = db.query(
    "SELECT selected_deck as selectedDeck FROM users WHERE id = ?",
  ).get(userId) as { selectedDeck: string | null } | null;
  if (!row?.selectedDeck) {return null;}

  // Verify the deck still exists and is owned by this user. Stale references
  // (deck was deleted) return null so callers can prompt the user to pick again.
  const ownership = db.query(
    "SELECT user_id as userId FROM decks WHERE id = ?",
  ).get(row.selectedDeck) as { userId: string } | null;
  if (!ownership || ownership.userId !== userId) {return null;}

  return row.selectedDeck;
}

export function setActiveDeck(userId: string, deckId: string | null): boolean {
  const db = getDb();

  if (deckId !== null) {
    const ownership = db.query(
      "SELECT user_id as userId FROM decks WHERE id = ?",
    ).get(deckId) as { userId: string } | null;
    if (!ownership || ownership.userId !== userId) {return false;}
  }

  db.run("UPDATE users SET selected_deck = ?, updated_at = datetime('now') WHERE id = ?", [deckId, userId]);
  return true;
}
