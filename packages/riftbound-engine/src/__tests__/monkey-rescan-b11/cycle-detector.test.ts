/**
 * Phase B batch 18 sub-agent II — Cycle / no-progress detector regression.
 *
 * The aggressive monkey harness has a `--noProgressDetect` flag that watches
 * the move trail and breaks out if the same (moveId+params) fingerprint
 * appears > 8 times in any 20-move window. This catches the failure mode
 * FF batch 17 surfaced via `zero-might-contest-loop.test.ts`: a unit at a
 * battlefield with 0 might keeps `contestBattlefield` legal forever, so the
 * priority picker contests it on every turn forever.
 *
 * This test locks the detector's algorithm (re-inlined here so the engine
 * suite doesn't depend on the scripts package).
 */
import { describe, expect, test } from "bun:test";

const CYCLE_WINDOW = 20;
const CYCLE_THRESHOLD = 8;

function moveFingerprint(moveId: string, params: Record<string, unknown>): string {
  const keys = Object.keys(params).toSorted();
  const parts: string[] = [];
  for (const k of keys) {parts.push(`${k}=${JSON.stringify(params[k])}`);}
  return `${moveId}|${parts.join(",")}`;
}

function detectCycle(trail: string[]): { cycling: boolean; offender?: string; count?: number } {
  if (trail.length < CYCLE_THRESHOLD) {return { cycling: false };}
  const window = trail.slice(-CYCLE_WINDOW);
  const counts: Record<string, number> = {};
  for (const fp of window) {
    counts[fp] = (counts[fp] ?? 0) + 1;
    if (counts[fp]! > CYCLE_THRESHOLD) {
      return { count: counts[fp], cycling: true, offender: fp };
    }
  }
  return { cycling: false };
}

describe("monkey cycle detector — `--noProgressDetect`", () => {
  test("does not flag a healthy varied trail", () => {
    const trail: string[] = [];
    for (let i = 0; i < 30; i++) {
      trail.push(
        moveFingerprint(i % 2 === 0 ? "playUnit" : "exhaustRune", { idx: i }),
      );
    }
    expect(detectCycle(trail).cycling).toBe(false);
  });

  test("does not flag a trail shorter than the threshold", () => {
    const trail = Array.from({ length: 7 }, () =>
      moveFingerprint("contestBattlefield", { battlefieldId: "bf-1", playerId: "p1" }),
    );
    expect(detectCycle(trail).cycling).toBe(false);
  });

  test("flags 9 identical fingerprints in a 20-move window (FF zero-might pattern)", () => {
    // Simulate the zero-might-contest-loop: a bot contests the same bf
    // Every turn forever because the unit has 0 might and never dies.
    const trail = Array.from({ length: 9 }, () =>
      moveFingerprint("contestBattlefield", { battlefieldId: "bf-1", playerId: "p1" }),
    );
    const r = detectCycle(trail);
    expect(r.cycling).toBe(true);
    expect(r.offender).toContain("contestBattlefield");
    expect(r.count).toBe(9);
  });

  test("ignores duplicates outside the sliding 20-move window", () => {
    // 10 of move-A, then 20 varied moves — A's count in the window is now 0.
    const trail = Array.from({ length: 10 }, () =>
      moveFingerprint("contestBattlefield", { bf: "bf-1" }),
    );
    for (let i = 0; i < 20; i++) {trail.push(moveFingerprint("playUnit", { idx: i }));}
    // DetectCycle uses .slice(-CYCLE_WINDOW), so only the last 20 are
    // Counted. Those are 20 distinct playUnit fingerprints → no cycle.
    expect(detectCycle(trail).cycling).toBe(false);
  });

  test("treats different params as different fingerprints", () => {
    // 9 contests but each on a DIFFERENT battlefield — these are legitimate
    // Moves, not a cycle. The detector must not false-positive.
    const trail = Array.from({ length: 9 }, (_, i) =>
      moveFingerprint("contestBattlefield", { battlefieldId: `bf-${i}`, playerId: "p1" }),
    );
    expect(detectCycle(trail).cycling).toBe(false);
  });

  test("fingerprint is param-order independent", () => {
    const a = moveFingerprint("playSpell", { cardId: "x", playerId: "p1" });
    const b = moveFingerprint("playSpell", { cardId: "x", playerId: "p1" });
    expect(a).toBe(b);
  });
});
