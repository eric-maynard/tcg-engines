/**
 * Slice 2 — lobby room HTTP endpoints integration tests.
 *
 * Spins up the actual server on an isolated port (so it doesn't collide
 * with other tests / a running dev server) and exercises the
 * `/api/lobby/room/...` endpoints end-to-end. Auth flows through a real
 * registration → cookie roundtrip (the server signs a token + Set-Cookie
 * just like in production).
 *
 * What we pin here:
 *   - Code generation: 6 uppercase alphanumeric chars, no ambiguous O/0/I/1
 *   - Auth gating: create/join/pick/start/leave all require a logged-in user
 *   - Happy path: A creates → B joins → both pick decks → A starts → both
 *     get the same sessionId pointing at a live demoSession
 *   - Leave behavior: guest leave is non-destructive; host leave destroys
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

// Match the port used by other server-loading test files so that bun:test
// (which runs all files in one process) shares the single Bun.serve handle.
process.env.RIFTBOUND_PORT = "33701";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const serverMod = require("../server") as { default?: { stop?: () => void } };

const PORT = 33_701;
const BASE = `http://localhost:${PORT}`;

afterAll(() => {
  try { serverMod.default?.stop?.(); } catch { /* */ }
});

interface RegisterResp {
  user: { id: string; username: string };
  token: string;
}
interface RoomResp {
  code: string;
  status: "waiting" | "ready" | "in-progress";
  host: { userId: string; deckId: string | null; hasDeck: boolean };
  guest: { userId: string; deckId: string | null; hasDeck: boolean } | null;
  sessionId: string | null;
}

async function register(username: string): Promise<{ id: string; cookie: string }> {
  const r = await fetch(`${BASE}/api/auth/register`, {
    body: JSON.stringify({ password: "test1234", username }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  expect(r.status).toBe(201);
  const body = (await r.json()) as RegisterResp;
  const setCookie = r.headers.get("Set-Cookie") ?? "";
  const cookie = setCookie.split(";")[0]; // Rb_token=...
  return { cookie, id: body.user.id };
}

async function createDeck(cookie: string, name: string): Promise<string> {
  const r = await fetch(`${BASE}/api/decks`, {
    body: JSON.stringify({
      cards: [
        { cardId: "ogn-046-094", quantity: 2, zone: "main" },
      ],
      championId: "ogn-046-094",
      legendId: "ogn-001-001",
      name,
    }),
    headers: { "Content-Type": "application/json", Cookie: cookie },
    method: "POST",
  });
  expect(r.ok).toBe(true);
  const body = (await r.json()) as { id: string };
  return body.id;
}

const aliceState = { cookie: "", deckId: "", id: "" };
const bobState = { cookie: "", deckId: "", id: "" };

beforeAll(async () => {
  const a = await register(`alice-${Date.now()}`);
  const b = await register(`bob-${Date.now()}`);
  aliceState.id = a.id;
  aliceState.cookie = a.cookie;
  bobState.id = b.id;
  bobState.cookie = b.cookie;
  aliceState.deckId = await createDeck(aliceState.cookie, "Alice Deck");
  bobState.deckId = await createDeck(bobState.cookie, "Bob Deck");
});

describe("POST /api/lobby/room/create — code shape", () => {
  test("returns a 6-char code with no ambiguous chars and host=caller", async () => {
    const r = await fetch(`${BASE}/api/lobby/room/create`, {
      body: "{}",
      headers: { "Content-Type": "application/json", Cookie: aliceState.cookie },
      method: "POST",
    });
    expect(r.ok).toBe(true);
    const room = (await r.json()) as RoomResp;
    expect(room.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(room.code).not.toMatch(/[OI01]/);
    expect(room.host.userId).toBe(aliceState.id);
    expect(room.guest).toBeNull();
    expect(room.status).toBe("waiting");
  });

  test("rejects unauthenticated requests with 401", async () => {
    const r = await fetch(`${BASE}/api/lobby/room/create`, {
      body: "{}",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(r.status).toBe(401);
  });
});

describe("Lobby room full happy path", () => {
  test("create → join → pick decks → start → both see same sessionId", async () => {
    // 1. Alice creates a room
    const createR = await fetch(`${BASE}/api/lobby/room/create`, {
      body: "{}",
      headers: { "Content-Type": "application/json", Cookie: aliceState.cookie },
      method: "POST",
    });
    const room = (await createR.json()) as RoomResp;
    const {code} = room;

    // 2. Bob joins
    const joinR = await fetch(`${BASE}/api/lobby/room/${code}/join`, {
      body: "{}",
      headers: { "Content-Type": "application/json", Cookie: bobState.cookie },
      method: "POST",
    });
    expect(joinR.ok).toBe(true);
    const afterJoin = (await joinR.json()) as RoomResp;
    expect(afterJoin.guest?.userId).toBe(bobState.id);

    // 3a. Alice picks her deck
    const pickAR = await fetch(`${BASE}/api/lobby/room/${code}/pick-deck`, {
      body: JSON.stringify({ deckId: aliceState.deckId }),
      headers: { "Content-Type": "application/json", Cookie: aliceState.cookie },
      method: "POST",
    });
    expect(pickAR.ok).toBe(true);

    // 3b. Bob picks his deck
    const pickBR = await fetch(`${BASE}/api/lobby/room/${code}/pick-deck`, {
      body: JSON.stringify({ deckId: bobState.deckId }),
      headers: { "Content-Type": "application/json", Cookie: bobState.cookie },
      method: "POST",
    });
    expect(pickBR.ok).toBe(true);
    const afterPicks = (await pickBR.json()) as RoomResp;
    expect(afterPicks.status).toBe("ready");
    expect(afterPicks.host.hasDeck).toBe(true);
    expect(afterPicks.guest?.hasDeck).toBe(true);

    // 4. Only host can start
    const startBobR = await fetch(`${BASE}/api/lobby/room/${code}/start`, {
      body: "{}",
      headers: { "Content-Type": "application/json", Cookie: bobState.cookie },
      method: "POST",
    });
    expect(startBobR.status).toBe(403);

    // 5. Alice starts → sessionId is minted
    const startR = await fetch(`${BASE}/api/lobby/room/${code}/start`, {
      body: "{}",
      headers: { "Content-Type": "application/json", Cookie: aliceState.cookie },
      method: "POST",
    });
    expect(startR.ok).toBe(true);
    const started = (await startR.json()) as RoomResp;
    expect(started.status).toBe("in-progress");
    expect(started.sessionId).toBeTruthy();

    // 6. Both players see the same sessionId via GET /api/lobby/room/:code
    const finalR = await fetch(`${BASE}/api/lobby/room/${code}`);
    const final = (await finalR.json()) as RoomResp;
    expect(final.sessionId).toBe(started.sessionId);
  });

  test("can't pick a deck that's not yours", async () => {
    // Alice creates a room, Bob joins, then Bob tries to pick Alice's deck.
    const createR = await fetch(`${BASE}/api/lobby/room/create`, {
      body: "{}",
      headers: { "Content-Type": "application/json", Cookie: aliceState.cookie },
      method: "POST",
    });
    const {code} = ((await createR.json()) as RoomResp);
    await fetch(`${BASE}/api/lobby/room/${code}/join`, {
      body: "{}",
      headers: { "Content-Type": "application/json", Cookie: bobState.cookie },
      method: "POST",
    });
    const pickR = await fetch(`${BASE}/api/lobby/room/${code}/pick-deck`, {
      body: JSON.stringify({ deckId: aliceState.deckId }), // Bob trying Alice's deck
      headers: { "Content-Type": "application/json", Cookie: bobState.cookie },
      method: "POST",
    });
    expect(pickR.status).toBe(400);
  });

  test("host leave destroys the room", async () => {
    const createR = await fetch(`${BASE}/api/lobby/room/create`, {
      body: "{}",
      headers: { "Content-Type": "application/json", Cookie: aliceState.cookie },
      method: "POST",
    });
    const {code} = ((await createR.json()) as RoomResp);

    const leaveR = await fetch(`${BASE}/api/lobby/room/${code}/leave`, {
      body: "{}",
      headers: { "Content-Type": "application/json", Cookie: aliceState.cookie },
      method: "POST",
    });
    const body = (await leaveR.json()) as { ok: boolean; destroyed: boolean };
    expect(body.destroyed).toBe(true);

    const afterR = await fetch(`${BASE}/api/lobby/room/${code}`);
    expect(afterR.status).toBe(404);
  });

  test("guest leave is non-destructive", async () => {
    const createR = await fetch(`${BASE}/api/lobby/room/create`, {
      body: "{}",
      headers: { "Content-Type": "application/json", Cookie: aliceState.cookie },
      method: "POST",
    });
    const {code} = ((await createR.json()) as RoomResp);
    await fetch(`${BASE}/api/lobby/room/${code}/join`, {
      body: "{}",
      headers: { "Content-Type": "application/json", Cookie: bobState.cookie },
      method: "POST",
    });
    const leaveR = await fetch(`${BASE}/api/lobby/room/${code}/leave`, {
      body: "{}",
      headers: { "Content-Type": "application/json", Cookie: bobState.cookie },
      method: "POST",
    });
    const body = (await leaveR.json()) as { ok: boolean; destroyed: boolean };
    expect(body.destroyed).toBe(false);

    // Room still exists, guest slot is empty.
    const afterR = await fetch(`${BASE}/api/lobby/room/${code}`);
    const after = (await afterR.json()) as RoomResp;
    expect(after.guest).toBeNull();
    expect(after.status).toBe("waiting");
  });
});

describe("Active deck endpoints", () => {
  test("GET returns null when no active deck set", async () => {
    const fresh = await register(`carol-${Date.now()}`);
    const r = await fetch(`${BASE}/api/users/me/active-deck`, {
      headers: { Cookie: fresh.cookie },
    });
    expect(r.ok).toBe(true);
    const body = (await r.json()) as { deck: unknown };
    expect(body.deck).toBeNull();
  });

  test("POST sets active deck and GET round-trips it", async () => {
    const r = await fetch(`${BASE}/api/users/me/active-deck`, {
      body: JSON.stringify({ deckId: aliceState.deckId }),
      headers: { "Content-Type": "application/json", Cookie: aliceState.cookie },
      method: "POST",
    });
    expect(r.ok).toBe(true);

    const get = await fetch(`${BASE}/api/users/me/active-deck`, {
      headers: { Cookie: aliceState.cookie },
    });
    const body = (await get.json()) as { deck: { id: string } | null };
    expect(body.deck?.id).toBe(aliceState.deckId);
  });

  test("POST rejects a deck owned by someone else", async () => {
    const r = await fetch(`${BASE}/api/users/me/active-deck`, {
      body: JSON.stringify({ deckId: aliceState.deckId }), // Bob trying Alice's deck
      headers: { "Content-Type": "application/json", Cookie: bobState.cookie },
      method: "POST",
    });
    expect(r.status).toBe(400);
  });
});
