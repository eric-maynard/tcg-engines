/**
 * Slice 5 (UX affordances) — ping tests.
 *
 * Covers the `POST /api/v2/ping/:sessionId` endpoint:
 *   - 404 on unknown session
 *   - 400 on missing required fields / invalid targetType
 *   - 200 + ok:true on a well-formed body
 *   - SSE broadcast: a connected `/api/v2/stream` subscriber receives a
 *     `ping` event (not just `state`)
 *
 * Shares the port-33701 server fixture pattern with the other scenario
 * tests so bun's per-file alphabetical ordering doesn't fight the
 * require-cache (see undo.test.ts header for the long explanation).
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

describe("POST /api/v2/ping — validation", () => {
  test("returns 404 for unknown session", async () => {
    const r = await fetch(`${BASE}/api/v2/ping/this-session-does-not-exist`, {
      body: JSON.stringify({
        playerId: "player-1",
        targetId: "any",
        targetType: "card",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(r.status).toBe(404);
  });

  test("returns 400 on missing required fields", async () => {
    const sessionId = `ping-validate-${Date.now()}`;
    await fetch(`${BASE}/api/v2/state/${sessionId}`);
    const r = await fetch(`${BASE}/api/v2/ping/${sessionId}`, {
      body: JSON.stringify({ playerId: "player-1" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error?: string };
    expect(body.error).toBeDefined();
  });

  test("returns 400 on invalid targetType", async () => {
    const sessionId = `ping-invalid-type-${Date.now()}`;
    await fetch(`${BASE}/api/v2/state/${sessionId}`);
    const r = await fetch(`${BASE}/api/v2/ping/${sessionId}`, {
      body: JSON.stringify({
        playerId: "player-1",
        targetId: "any",
        targetType: "wrong",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(r.status).toBe(400);
  });
});

describe("POST /api/v2/ping — happy path", () => {
  test("accepts a well-formed card ping", async () => {
    const sessionId = `ping-ok-card-${Date.now()}`;
    await fetch(`${BASE}/api/v2/state/${sessionId}`);
    const r = await fetch(`${BASE}/api/v2/ping/${sessionId}`, {
      body: JSON.stringify({
        playerId: "player-1",
        targetId: "some-card-id",
        targetType: "card",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      ok: boolean;
      ping?: { targetType: string; targetId: string; playerId: string };
    };
    expect(body.ok).toBe(true);
    expect(body.ping?.targetType).toBe("card");
    expect(body.ping?.targetId).toBe("some-card-id");
    expect(body.ping?.playerId).toBe("player-1");
  });

  test("accepts a zone ping with optional coords", async () => {
    const sessionId = `ping-ok-zone-${Date.now()}`;
    await fetch(`${BASE}/api/v2/state/${sessionId}`);
    const r = await fetch(`${BASE}/api/v2/ping/${sessionId}`, {
      body: JSON.stringify({
        playerId: "player-2",
        targetId: "player-1-deck",
        targetType: "zone",
        x: 120,
        y: 240,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      ok: boolean;
      ping?: { targetType: string; x?: number; y?: number };
    };
    expect(body.ok).toBe(true);
    expect(body.ping?.targetType).toBe("zone");
    expect(body.ping?.x).toBe(120);
    expect(body.ping?.y).toBe(240);
  });
});

describe("POST /api/v2/ping — SSE broadcast", () => {
  test("a connected SSE subscriber receives a `ping` event after a ping", async () => {
    const sessionId = `ping-sse-${Date.now()}`;
    await fetch(`${BASE}/api/v2/state/${sessionId}`);

    const ctrl = new AbortController();
    const sseR = await fetch(`${BASE}/api/v2/stream/${sessionId}`, {
      signal: ctrl.signal,
    });
    expect(sseR.ok).toBe(true);
    const reader = sseR.body!.getReader();
    const decoder = new TextDecoder();
    const events: string[] = [];

    const readPromise = (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {break;}
          const chunk = decoder.decode(value);
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event:")) {events.push(line.slice(6).trim());}
          }
        }
      } catch {
        // Aborted — fine
      }
    })();

    // Initial state event
    await new Promise((r) => setTimeout(r, 50));

    // Fire a ping
    await fetch(`${BASE}/api/v2/ping/${sessionId}`, {
      body: JSON.stringify({
        playerId: "player-1",
        targetId: "broadcast-target",
        targetType: "card",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    // Let the broadcast deliver
    await new Promise((r) => setTimeout(r, 100));

    ctrl.abort();
    await readPromise;

    expect(events).toContain("ping");
  });
});
