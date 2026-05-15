/**
 * Typed fetch clients for the slice 7 profile / replays / friends endpoints.
 */

const opts: RequestInit = { credentials: "include" };

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) {msg = body.error;}
    } catch { /* Not json */ }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export interface RecentGame {
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
  youWon: boolean;
  opponent: { id: string; username: string; displayName: string | null } | null;
}

export interface FriendEntry {
  userId: string;
  username: string;
  displayName: string | null;
  status: "pending" | "accepted" | "blocked";
  direction: "outgoing" | "incoming";
  since: string;
  online?: boolean;
}

export interface ProfileResponse {
  user: { id: string; username: string; displayName: string | null };
  deckCount: number;
  gameCount: number;
  winCount: number;
  lossCount: number;
  drawCount: number;
  recentGames: RecentGame[];
  friends: FriendEntry[];
}

export async function getProfile(): Promise<ProfileResponse> {
  return asJson<ProfileResponse>(await fetch("/api/users/me/profile", opts));
}

export interface ReplayStep {
  seq: number;
  playerId: string;
  moveId: string;
  params: Record<string, unknown>;
  success: boolean;
  error?: string;
  undone?: boolean;
}

export interface ReplayResponse {
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
  moveLog: ReplayStep[];
}

export async function getReplay(gameId: string): Promise<ReplayResponse> {
  return asJson<ReplayResponse>(await fetch(`/api/replays/${encodeURIComponent(gameId)}`, opts));
}

export async function sendFriendRequest(username: string): Promise<void> {
  await asJson(
    await fetch("/api/friends/request", {
      ...opts,
      body: JSON.stringify({ username }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
}

export async function acceptFriendRequest(userId: string): Promise<void> {
  await asJson(
    await fetch(`/api/friends/accept/${encodeURIComponent(userId)}`, {
      ...opts,
      method: "POST",
    }),
  );
}

export interface FriendsListResponse {
  friends: FriendEntry[];
}

export async function listFriends(): Promise<FriendEntry[]> {
  const r = await asJson<FriendsListResponse>(
    await fetch("/api/users/me/friends", opts),
  );
  return r.friends;
}

export async function sendLobbyInvite(
  friendUserId: string,
  roomCode: string,
): Promise<void> {
  await asJson(
    await fetch("/api/invites/send", {
      ...opts,
      body: JSON.stringify({ friendUserId, roomCode }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
}
