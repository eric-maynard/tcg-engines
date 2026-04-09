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
