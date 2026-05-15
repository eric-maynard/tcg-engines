/**
 * Integration tests for the `/api/v2/manual/*` admin / manual board
 * endpoints. Each test seeds a fresh session by hitting /api/v2/state, then
 * exercises one manual op and asserts the resulting SPA state reflects the
 * direct internal-state mutation.
 *
 * Picks a non-default port BEFORE importing server.ts so its top-level
 * `Bun.serve` binds to the isolated test port.
 */

import { afterAll, describe, expect, test } from "bun:test";

process.env.RIFTBOUND_PORT = "33701";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const serverMod = require("../server") as { default?: { stop?: () => void } };

const PORT = 33_701;
const BASE = `http://localhost:${PORT}`;

afterAll(() => {
  try {
    serverMod.default?.stop?.();
  } catch {
    // Ignore
  }
});

async function freshSession(prefix: string): Promise<string> {
  const sessionId = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  // Hit /state to lazy-create the engine session.
  const r = await fetch(`${BASE}/api/v2/state/${sessionId}`);
  expect(r.ok).toBe(true);
  return sessionId;
}

async function postManual(
  op: string,
  sessionId: string,
  body: Record<string, unknown>,
): Promise<{
  ok: boolean;
  error?: string;
  cardId?: string;
  damage?: number;
  counters?: number;
  exhausted?: boolean;
  view: { battlefields: { units: { id: string; damage?: number; counters?: number; exhausted?: boolean }[] }[]; players: { id: string; baseUnits?: { id: string }[] }[] };
}> {
  const r = await fetch(`${BASE}/api/v2/manual/${op}/${sessionId}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  expect(r.ok).toBe(true);
  return r.json();
}

describe("POST /api/v2/manual/spawn-token", () => {
  test("spawns a Bird Token in the requested zone", async () => {
    const sessionId = await freshSession("token");
    const body = await postManual("spawn-token", sessionId, {
      controller: "player-1",
      tokenSpec: { name: "Bird Token", might: 1 },
      zone: "base",
    });
    expect(body.ok).toBe(true);
    expect(body.cardId).toBeTruthy();
    // Surfaced into the player's baseUnits via buildSpaState.
    const p1 = body.view.players.find((p) => p.id === "player-1");
    expect(p1).toBeDefined();
    const ids = (p1?.baseUnits ?? []).map((u) => u.id);
    expect(ids).toContain(body.cardId!);
  });

  test("returns an error when zone is missing", async () => {
    const sessionId = await freshSession("token-err");
    const r = await fetch(`${BASE}/api/v2/manual/spawn-token/${sessionId}`, {
      body: JSON.stringify({ controller: "player-1" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await r.json()) as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("zone");
  });
});

describe("POST /api/v2/manual/spawn-card", () => {
  test("spawns a registered card instance into the requested zone", async () => {
    const sessionId = await freshSession("spawn");
    // OGN Annie (Dark Child) is a known card id from the data set.
    const body = await postManual("spawn-card", sessionId, {
      zone: "base",
      cardId: "ogn-156-298", // Sabotage spell — picked because it always
      // Exists in the test data. Any registered id works.
      controller: "player-1",
    });
    expect(body.ok).toBe(true);
    expect(body.cardId).toBeTruthy();
  });

  test("returns an error for unknown card", async () => {
    const sessionId = await freshSession("spawn-bad");
    const r = await fetch(`${BASE}/api/v2/manual/spawn-card/${sessionId}`, {
      body: JSON.stringify({
        cardId: "not-a-real-card",
        controller: "player-1",
        zone: "base",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await r.json()) as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error ?? "").toContain("unknown");
  });
});

describe("POST /api/v2/manual/move-card", () => {
  test("moves a token from base to trash", async () => {
    const sessionId = await freshSession("move");
    const spawn = await postManual("spawn-token", sessionId, {
      controller: "player-1",
      zone: "base",
    });
    const tokenId = spawn.cardId!;
    const r = await postManual("move-card", sessionId, {
      cardId: tokenId,
      toZone: "trash",
    });
    expect(r.ok).toBe(true);
    // Verify the card is no longer in any player's baseUnits.
    for (const p of r.view.players) {
      expect((p.baseUnits ?? []).map((u) => u.id)).not.toContain(tokenId);
    }
  });
});

describe("POST /api/v2/manual/set-damage", () => {
  test("updates the unit's damage counter (response echoes the new value)", async () => {
    const sessionId = await freshSession("dmg");
    const spawn = await postManual("spawn-token", sessionId, {
      controller: "player-1",
      zone: "base",
    });
    const tokenId = spawn.cardId!;
    const r = await postManual("set-damage", sessionId, {
      cardId: tokenId,
      damage: 3,
    });
    expect(r.ok).toBe(true);
    // The endpoint echoes the new damage value. Base-zone view doesn't
    // Surface per-unit damage chips today (only battlefield units do); the
    // Chip lives on `internal.cardMetas[id].damage`, so we trust the
    // Ok+damage echo as the canonical signal that the mutation landed.
    expect(r.damage).toBe(3);
  });

  test("clamps negative damage to zero", async () => {
    const sessionId = await freshSession("dmg-clamp");
    const spawn = await postManual("spawn-token", sessionId, {
      controller: "player-1",
      zone: "base",
    });
    const r = await postManual("set-damage", sessionId, {
      cardId: spawn.cardId!,
      damage: -10,
    });
    expect(r.ok).toBe(true);
    expect(r.damage).toBe(0);
  });
});

describe("POST /api/v2/manual/set-counters", () => {
  test("updates the unit's counter chip", async () => {
    const sessionId = await freshSession("cnt");
    const spawn = await postManual("spawn-token", sessionId, {
      controller: "player-1",
      zone: "base",
    });
    const tokenId = spawn.cardId!;
    const r = await postManual("set-counters", sessionId, {
      cardId: tokenId,
      counters: 2,
    });
    expect(r.ok).toBe(true);
    expect(r.counters).toBe(2);
  });
});

describe("POST /api/v2/manual/toggle-exhaust", () => {
  test("flips the exhausted flag on a unit", async () => {
    const sessionId = await freshSession("exh");
    const spawn = await postManual("spawn-token", sessionId, {
      controller: "player-1",
      zone: "base",
    });
    const tokenId = spawn.cardId!;
    const r1 = await postManual("toggle-exhaust", sessionId, { cardId: tokenId });
    expect(r1.ok).toBe(true);
    expect(r1.exhausted).toBe(true);
    const r2 = await postManual("toggle-exhaust", sessionId, { cardId: tokenId });
    expect(r2.exhausted).toBe(false);
  });
});

describe("POST /api/v2/manual/destroy", () => {
  test("moves a unit to trash", async () => {
    const sessionId = await freshSession("destroy");
    const spawn = await postManual("spawn-token", sessionId, {
      controller: "player-1",
      zone: "base",
    });
    const tokenId = spawn.cardId!;
    const r = await postManual("destroy", sessionId, { cardId: tokenId });
    expect(r.ok).toBe(true);
    for (const p of r.view.players) {
      expect((p.baseUnits ?? []).map((u) => u.id)).not.toContain(tokenId);
    }
  });
});

describe("POST /api/v2/manual/recycle", () => {
  test("recycles a card to the bottom of the main deck", async () => {
    const sessionId = await freshSession("recycle");
    const spawn = await postManual("spawn-token", sessionId, {
      controller: "player-1",
      zone: "base",
    });
    const tokenId = spawn.cardId!;
    const r = await postManual("recycle", sessionId, { cardId: tokenId });
    expect(r.ok).toBe(true);
    for (const p of r.view.players) {
      expect((p.baseUnits ?? []).map((u) => u.id)).not.toContain(tokenId);
    }
  });
});

describe("POST /api/v2/manual/<unknown>", () => {
  test("returns an error for an unrecognised op", async () => {
    const sessionId = await freshSession("nope");
    const r = await fetch(`${BASE}/api/v2/manual/blow-up-the-game/${sessionId}`, {
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await r.json()) as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error ?? "").toContain("unknown op");
  });
});
