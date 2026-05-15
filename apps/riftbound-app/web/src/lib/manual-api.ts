/**
 * Typed client for the `/api/v2/manual/*` admin / manual board endpoints.
 *
 * Manual mode is a power-user override that lets a player directly
 * manipulate zones and cards (spawn tokens, move units, set damage, etc.)
 * when an automatic effect doesn't fire correctly. It bypasses normal move
 * legality so the server is permissive — the SPA is responsible for only
 * surfacing these affordances when the user has explicitly enabled
 * manual mode.
 */
import type { MoveResponse } from "./api";

const BASE = "/api/v2/manual";

async function post<T extends Record<string, unknown>>(
  op: string,
  sessionId: string,
  body: T,
): Promise<MoveResponse & { error?: string }> {
  const res = await fetch(`${BASE}/${op}/${encodeURIComponent(sessionId)}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!res.ok) {
    return {
      error: `manual/${op} failed: ${res.status} ${res.statusText}`,
      ok: false,
    } as unknown as MoveResponse;
  }
  return (await res.json()) as MoveResponse & { error?: string };
}

export interface SpawnTokenSpec {
  /** Display name (default "Bird Token"). */
  readonly name?: string;
  /** Might value (default 1). */
  readonly might?: number;
}

export function spawnToken(
  sessionId: string,
  args: {
    zone: string;
    controller: string;
    tokenSpec?: SpawnTokenSpec;
  },
): Promise<MoveResponse & { cardId?: string; name?: string; error?: string }> {
  return post("spawn-token", sessionId, args);
}

export function spawnCard(
  sessionId: string,
  args: { zone: string; cardId: string; controller: string },
): Promise<MoveResponse & { cardId?: string; error?: string }> {
  return post("spawn-card", sessionId, args);
}

export function moveCard(
  sessionId: string,
  args: { cardId: string; toZone: string },
): Promise<MoveResponse & { error?: string }> {
  return post("move-card", sessionId, args);
}

export function setDamage(
  sessionId: string,
  args: { cardId: string; damage: number },
): Promise<MoveResponse & { error?: string }> {
  return post("set-damage", sessionId, args);
}

export function setCounters(
  sessionId: string,
  args: { cardId: string; counters: number },
): Promise<MoveResponse & { error?: string }> {
  return post("set-counters", sessionId, args);
}

export function toggleExhaust(
  sessionId: string,
  args: { cardId: string },
): Promise<MoveResponse & { exhausted?: boolean; error?: string }> {
  return post("toggle-exhaust", sessionId, args);
}

export function destroyCard(
  sessionId: string,
  args: { cardId: string },
): Promise<MoveResponse & { error?: string }> {
  return post("destroy", sessionId, args);
}

export function recycleCard(
  sessionId: string,
  args: { cardId: string },
): Promise<MoveResponse & { error?: string }> {
  return post("recycle", sessionId, args);
}
