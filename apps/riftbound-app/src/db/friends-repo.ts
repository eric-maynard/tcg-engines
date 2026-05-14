/**
 * Friends Repository — slice 7.
 *
 * Friendships are stored as a single directed row (requester → addressee)
 * with a `pending|accepted|blocked` status. A friendship is "accepted" when
 * the addressee accepts the request; the read side queries both columns so
 * either user sees the friend in their list regardless of which side
 * initiated. We use a UNIQUE (requester_id, addressee_id) constraint so
 * duplicate requests from the same side are idempotent (we no-op on conflict).
 */

import { getDb } from "./schema";

export type FriendshipStatus = "pending" | "accepted" | "blocked";

export interface FriendRow {
  id: number;
  requesterId: string;
  addresseeId: string;
  status: FriendshipStatus;
  createdAt: string;
  updatedAt: string;
}

export interface FriendView {
  userId: string;
  username: string;
  displayName: string | null;
  status: FriendshipStatus;
  direction: "outgoing" | "incoming";
  since: string;
}

/**
 * Send a friend request. Idempotent — if a row already exists in either
 * direction, return what we have without mutating it.
 *
 * Returns `null` if the addressee doesn't exist.
 */
export function sendFriendRequest(
  requesterId: string,
  addresseeUsername: string,
): { ok: true; row: FriendRow } | { ok: false; reason: "self" | "not-found" | "already" } {
  const db = getDb();
  const addressee = db.query(
    "SELECT id FROM users WHERE username = ?",
  ).get(addresseeUsername) as { id: string } | null;
  if (!addressee) {return { ok: false, reason: "not-found" };}
  if (addressee.id === requesterId) {return { ok: false, reason: "self" };}

  // Check both directions — if either exists, we don't overwrite.
  const existing = db.query(
    `SELECT id, requester_id as requesterId, addressee_id as addresseeId,
            status, created_at as createdAt, updated_at as updatedAt
     FROM friendships
     WHERE (requester_id = ? AND addressee_id = ?)
        OR (requester_id = ? AND addressee_id = ?)`,
  ).get(requesterId, addressee.id, addressee.id, requesterId) as FriendRow | null;
  if (existing) {return { ok: false, reason: "already" };}

  db.run(
    `INSERT INTO friendships (requester_id, addressee_id, status)
     VALUES (?, ?, 'pending')`,
    [requesterId, addressee.id],
  );

  const row = db.query(
    `SELECT id, requester_id as requesterId, addressee_id as addresseeId,
            status, created_at as createdAt, updated_at as updatedAt
     FROM friendships WHERE requester_id = ? AND addressee_id = ?`,
  ).get(requesterId, addressee.id) as FriendRow;
  return { ok: true, row };
}

export function acceptFriendRequest(
  addresseeId: string,
  requesterId: string,
): boolean {
  const db = getDb();
  const result = db.run(
    `UPDATE friendships
     SET status = 'accepted', updated_at = datetime('now')
     WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'`,
    [requesterId, addresseeId],
  );
  return result.changes > 0;
}

export function listFriendsForUser(userId: string): FriendView[] {
  const db = getDb();
  const rows = db.query(
    `SELECT f.id, f.requester_id as requesterId, f.addressee_id as addresseeId,
            f.status, f.created_at as createdAt, f.updated_at as updatedAt,
            u.id as otherId, u.username, u.display_name as displayName
     FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.requester_id = ?1 THEN f.addressee_id ELSE f.requester_id END
     WHERE f.requester_id = ?1 OR f.addressee_id = ?1
     ORDER BY f.updated_at DESC`,
  ).all(userId) as {
    id: number;
    requesterId: string;
    addresseeId: string;
    status: FriendshipStatus;
    createdAt: string;
    updatedAt: string;
    otherId: string;
    username: string;
    displayName: string | null;
  }[];

  return rows.map((r) => ({
    direction: r.requesterId === userId ? "outgoing" : "incoming",
    displayName: r.displayName,
    since: r.updatedAt,
    status: r.status,
    userId: r.otherId,
    username: r.username,
  }));
}

export function getFriendUserIds(userId: string): Set<string> {
  const db = getDb();
  const rows = db.query(
    `SELECT requester_id as requesterId, addressee_id as addresseeId
     FROM friendships
     WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'`,
  ).all(userId, userId) as { requesterId: string; addresseeId: string }[];
  const friends = new Set<string>();
  for (const r of rows) {
    friends.add(r.requesterId === userId ? r.addresseeId : r.requesterId);
  }
  return friends;
}
