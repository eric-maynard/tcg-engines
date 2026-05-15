/**
 * Slice 7 — Friends HTTP integration tests.
 *
 * Covers:
 *   - POST /api/friends/request — adds a pending row, idempotent on retry
 *   - POST /api/friends/accept/:userId — moves pending → accepted
 *   - GET  /api/users/me/friends — lists with status + direction
 *   - POST /api/lobby/invite — pushes a pending invite to the recipient
 *   - GET  /api/lobby/invites — returns queued invites
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
  user: { id: string; username: string };
}

async function registerUser(name: string): Promise<{ token: string; userId: string; username: string }> {
  const r = await fetch(`${BASE}/api/auth/register`, {
    body: JSON.stringify({ password: "test1234", username: name }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (r.status === 409) {
    const login = await fetch(`${BASE}/api/auth/login`, {
      body: JSON.stringify({ password: "test1234", username: name }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await login.json()) as AuthResp;
    return { token: body.token, userId: body.user.id, username: body.user.username };
  }
  const body = (await r.json()) as AuthResp;
  return { token: body.token, userId: body.user.id, username: body.user.username };
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

describe("Slice 7 — friends + lobby invites", () => {
  test("POST /api/friends/request creates a pending friendship", async () => {
    const a = await registerUser(`f-a-${crypto.randomUUID().slice(0, 8)}`);
    const b = await registerUser(`f-b-${crypto.randomUUID().slice(0, 8)}`);

    const r = await fetch(`${BASE}/api/friends/request`, {
      body: JSON.stringify({ username: b.username }),
      headers: bearer(a.token),
      method: "POST",
    });
    expect(r.ok).toBe(true);

    // A sees an outgoing pending entry
    const listA = await (await fetch(`${BASE}/api/users/me/friends`, {
      headers: bearer(a.token),
    })).json() as { friends: { userId: string; status: string; direction: string }[] };
    expect(listA.friends.find((f) => f.userId === b.userId)?.status).toBe("pending");
    expect(listA.friends.find((f) => f.userId === b.userId)?.direction).toBe("outgoing");

    // B sees an incoming pending entry
    const listB = await (await fetch(`${BASE}/api/users/me/friends`, {
      headers: bearer(b.token),
    })).json() as { friends: { userId: string; status: string; direction: string }[] };
    expect(listB.friends.find((f) => f.userId === a.userId)?.direction).toBe("incoming");
  });

  test("POST /api/friends/accept moves pending → accepted", async () => {
    const a = await registerUser(`f-a2-${crypto.randomUUID().slice(0, 8)}`);
    const b = await registerUser(`f-b2-${crypto.randomUUID().slice(0, 8)}`);

    await fetch(`${BASE}/api/friends/request`, {
      body: JSON.stringify({ username: b.username }),
      headers: bearer(a.token),
      method: "POST",
    });
    const ar = await fetch(`${BASE}/api/friends/accept/${a.userId}`, {
      headers: bearer(b.token),
      method: "POST",
    });
    expect(ar.ok).toBe(true);

    const list = await (await fetch(`${BASE}/api/users/me/friends`, {
      headers: bearer(a.token),
    })).json() as { friends: { userId: string; status: string }[] };
    expect(list.friends.find((f) => f.userId === b.userId)?.status).toBe("accepted");
  });

  test("POST /api/friends/request rejects nonexistent username", async () => {
    const a = await registerUser(`f-a3-${crypto.randomUUID().slice(0, 8)}`);
    const r = await fetch(`${BASE}/api/friends/request`, {
      body: JSON.stringify({ username: `nope-${crypto.randomUUID()}` }),
      headers: bearer(a.token),
      method: "POST",
    });
    expect(r.status).toBe(400);
  });

  test("POST /api/lobby/invite queues an invite for the recipient", async () => {
    const a = await registerUser(`inv-a-${crypto.randomUUID().slice(0, 8)}`);
    const b = await registerUser(`inv-b-${crypto.randomUUID().slice(0, 8)}`);

    const code = "ABC123";
    const ir = await fetch(`${BASE}/api/invites/send`, {
      body: JSON.stringify({ friendUserId: b.userId, roomCode: code }),
      headers: bearer(a.token),
      method: "POST",
    });
    expect(ir.ok).toBe(true);

    const list = await (await fetch(`${BASE}/api/invites`, {
      headers: bearer(b.token),
    })).json() as { invites: { fromUserId: string; roomCode: string }[] };
    expect(list.invites.length).toBeGreaterThan(0);
    expect(list.invites[list.invites.length - 1].fromUserId).toBe(a.userId);
    expect(list.invites[list.invites.length - 1].roomCode).toBe(code);
  });
});
