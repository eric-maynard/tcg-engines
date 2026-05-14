/**
 * Typed fetch client for the slice 2 matchmaking-room API.
 *
 * The room endpoints are auth'd via the `rb_token` cookie — callers should
 * already have a user from `useAuth`. All POSTs send JSON and `credentials:
 * "include"` so the cookie flows on same-origin (Vite dev proxy / Bun prod).
 */

export interface RoomPlayerView {
  userId: string;
  displayName: string;
  deckId: string | null;
  hasDeck: boolean;
}

export interface RoomView {
  code: string;
  status: "waiting" | "ready" | "in-progress";
  host: RoomPlayerView;
  guest: RoomPlayerView | null;
  sessionId: string | null;
  createdAt: number;
}

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

export async function createRoom(): Promise<RoomView> {
  return asJson(
    await fetch("/api/lobby/room/create", {
      ...opts,
      body: "{}",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
}

export async function fetchRoom(code: string): Promise<RoomView> {
  return asJson(await fetch(`/api/lobby/room/${encodeURIComponent(code)}`, opts));
}

export async function joinRoom(code: string): Promise<RoomView> {
  return asJson(
    await fetch(`/api/lobby/room/${encodeURIComponent(code)}/join`, {
      ...opts,
      body: "{}",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
}

export async function pickDeck(code: string, deckId: string): Promise<RoomView> {
  return asJson(
    await fetch(`/api/lobby/room/${encodeURIComponent(code)}/pick-deck`, {
      ...opts,
      body: JSON.stringify({ deckId }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
}

export async function startGame(code: string): Promise<RoomView> {
  return asJson(
    await fetch(`/api/lobby/room/${encodeURIComponent(code)}/start`, {
      ...opts,
      body: "{}",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
}

export async function leaveRoom(code: string): Promise<{ ok: boolean; destroyed?: boolean }> {
  return asJson(
    await fetch(`/api/lobby/room/${encodeURIComponent(code)}/leave`, {
      ...opts,
      body: "{}",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
}

// Active deck (slice 2 step 1).
export interface ActiveDeckResponse {
  deck: {
    id: string;
    name: string;
    legendId: string;
    championId: string;
  } | null;
}

export async function fetchActiveDeck(): Promise<ActiveDeckResponse> {
  return asJson(await fetch("/api/users/me/active-deck", opts));
}

export async function setActiveDeck(deckId: string | null): Promise<{ ok: boolean; deckId: string | null }> {
  return asJson(
    await fetch("/api/users/me/active-deck", {
      ...opts,
      body: JSON.stringify({ deckId }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
}
