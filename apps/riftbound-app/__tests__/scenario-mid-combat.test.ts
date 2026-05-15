/**
 * Iter 12: integration test for `POST /api/v2/scenario/mid-combat/:sessionId`.
 *
 * The endpoint seeds a known mid-combat state directly into the engine
 * session (units on a battlefield, contested=true, showdownStack push,
 * attacker tagged). This lets the SPA's headless-screenshot harness capture
 * the active-combat affordances (showdown beam, role badges, breadcrumb)
 * without driving a real bot game into combat.
 *
 * We spin up the server on an isolated port via `RIFTBOUND_PORT` to avoid
 * colliding with a running dev server on :3000, POST to the scenario
 * endpoint, and assert that the resulting SPA state carries a non-empty
 * `view.combat.attackers` list.
 */

import { afterAll, describe, expect, test } from "bun:test";

// Pick a non-default port BEFORE importing server.ts so its top-level
// `Bun.serve` binds to the isolated test port.
process.env.RIFTBOUND_PORT = "33701";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const serverMod = require("../server") as { default?: { stop?: () => void } };

const PORT = 33_701;
const BASE = `http://localhost:${PORT}`;

afterAll(() => {
  // Best-effort: Bun.serve returns a handle stored at module scope; if the
  // Module exported it we'd stop here. Otherwise the process exits when the
  // Test runner finishes, so this is a no-op for now.
  try {
    serverMod.default?.stop?.();
  } catch {
    // Ignore
  }
});

describe("POST /api/v2/scenario/mid-combat/:sessionId", () => {
  test("seeds a combat state with attackers in the SPA view", async () => {
    const sessionId = `combat-test-${Date.now()}`;
    const r = await fetch(`${BASE}/api/v2/scenario/mid-combat/${sessionId}`, {
      body: JSON.stringify({ playerId: "player-1" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(r.ok).toBe(true);
    const body = (await r.json()) as {
      ok: boolean;
      seed: { seeded: boolean; battlefieldId?: string; attackerUnitId?: string };
      view: { combat?: { attackers?: unknown[]; battlefieldId?: string } };
    };
    expect(body.ok).toBe(true);
    expect(body.seed.seeded).toBe(true);
    expect(body.seed.battlefieldId).toBeTruthy();
    expect(body.view.combat).toBeDefined();
    expect(Array.isArray(body.view.combat?.attackers)).toBe(true);
    expect((body.view.combat?.attackers ?? []).length).toBeGreaterThan(0);
  });
});
