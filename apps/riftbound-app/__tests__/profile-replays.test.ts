/**
 * Slice 7 — Profile + replays HTTP integration tests.
 *
 * Verifies:
 *   - POST /api/v2/scenario/game-over inserts a `games` row (recorded via the
 *     game-end hook) so the replay viewer can find it
 *   - GET  /api/replays/:gameId returns the full move log
 *   - GET  /api/users/me/profile returns deck count + W/L/D + recent games
 *   - GET  /api/users/me/replays mirrors the recent games list
 *
 * Mirrors the port-33701 server-fixture pattern used by goldfish/sealed/undo.
 */

import { afterAll, describe, expect, test } from "bun:test";

process.env.RIFTBOUND_PORT = "33701";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const serverMod = require("../server") as { default?: { stop?: () => void } };

const PORT = 33_701;
const BASE = `http://localhost:${PORT}`;

afterAll(() => {
  try { serverMod.default?.stop?.(); } catch { /* */ }
});

interface AuthResp {
  token: string;
  user: { id: string; username: string; displayName: string | null };
}

async function registerUser(name: string): Promise<{ token: string; userId: string; cookie: string }> {
  const r = await fetch(`${BASE}/api/auth/register`, {
    body: JSON.stringify({ displayName: name, password: "test1234", username: name }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (r.status === 409) {
    // Already taken from a prior run — log in instead.
    const login = await fetch(`${BASE}/api/auth/login`, {
      body: JSON.stringify({ password: "test1234", username: name }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await login.json()) as AuthResp;
    return {
      cookie: login.headers.get("set-cookie")?.split(";")[0] ?? `rb_token=${body.token}`,
      token: body.token,
      userId: body.user.id,
    };
  }
  const body = (await r.json()) as AuthResp;
  return {
    cookie: r.headers.get("set-cookie")?.split(";")[0] ?? `rb_token=${body.token}`,
    token: body.token,
    userId: body.user.id,
  };
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

describe("Slice 7 — game-end recording + replays", () => {
  test("scenario game-over inserts a games row via the end hook", async () => {
    const sessionId = `slice7-${crypto.randomUUID()}`;
    const r = await fetch(`${BASE}/api/v2/scenario/game-over/${sessionId}`, {
      body: JSON.stringify({ winner: "player-1" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(r.ok).toBe(true);
    const body = (await r.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    // The hook ran during the POST; the games table now has one matching row.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const games = require("../src/db/games-repo") as typeof import("../src/db/games-repo");
    const row = games.findGameBySessionId(sessionId);
    expect(row).not.toBeNull();
    expect(row?.sessionId).toBe(sessionId);
    expect(row?.result).toBe("win");
  });

  test("GET /api/replays/:gameId returns move log + summary", async () => {
    const sessionId = `slice7-${crypto.randomUUID()}`;
    await fetch(`${BASE}/api/v2/scenario/game-over/${sessionId}`, {
      body: JSON.stringify({ winner: "player-2" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const games = require("../src/db/games-repo") as typeof import("../src/db/games-repo");
    const summary = games.findGameBySessionId(sessionId);
    const r = await fetch(`${BASE}/api/replays/${summary!.id}`);
    expect(r.ok).toBe(true);
    const body = (await r.json()) as {
      id: string;
      sessionId: string;
      moveLog: unknown[];
    };
    expect(body.id).toBe(summary!.id);
    expect(body.sessionId).toBe(sessionId);
    expect(Array.isArray(body.moveLog)).toBe(true);
  });

  test("GET /api/replays/:gameId 404s for an unknown gameId", async () => {
    const r = await fetch(`${BASE}/api/replays/does-not-exist`);
    expect(r.status).toBe(404);
  });
});

describe("Slice 7 — /api/users/me/profile", () => {
  test("401s without auth", async () => {
    const r = await fetch(`${BASE}/api/users/me/profile`);
    expect(r.status).toBe(401);
  });

  test("returns profile envelope for a signed-in user", async () => {
    const u = await registerUser(`slice7-prof-${crypto.randomUUID().slice(0, 8)}`);
    const r = await fetch(`${BASE}/api/users/me/profile`, {
      headers: bearer(u.token),
    });
    expect(r.ok).toBe(true);
    const body = (await r.json()) as {
      user: { id: string };
      deckCount: number;
      gameCount: number;
      winCount: number;
      lossCount: number;
      drawCount: number;
      recentGames: unknown[];
      friends: unknown[];
    };
    expect(body.user.id).toBe(u.userId);
    expect(typeof body.deckCount).toBe("number");
    expect(typeof body.gameCount).toBe("number");
    expect(typeof body.winCount).toBe("number");
    expect(typeof body.lossCount).toBe("number");
    expect(typeof body.drawCount).toBe("number");
    expect(Array.isArray(body.recentGames)).toBe(true);
    expect(Array.isArray(body.friends)).toBe(true);
  });

  test("GET /api/users/me/replays lists the user's games", async () => {
    const u = await registerUser(`slice7-rep-${crypto.randomUUID().slice(0, 8)}`);
    const r = await fetch(`${BASE}/api/users/me/replays`, {
      headers: bearer(u.token),
    });
    expect(r.ok).toBe(true);
    const body = (await r.json()) as { games: unknown[] };
    expect(Array.isArray(body.games)).toBe(true);
  });
});
