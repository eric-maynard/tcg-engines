/**
 * rule 465.2.c — the combat damage ORDERED LANE (public/js/gameplay/combat-assign.js)
 * derives the allocation from the order the player arranges the receiving units
 * in: greedy lethal fill, excess on the last unit reached, Tank first / Backline
 * last. The helpers are pure and cross-checked against the engine's own
 * `isLegalDamageAssignment` so the lane can never offer a map the move refuses.
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { enumerateDamageAssignments, isLegalDamageAssignment } from "../../../../packages/riftbound-engine/src/combat/combat-resolver";

type CA = {
  FLEX: number;
  greedyFill: (order: string[], need: Record<string, number>, total: number) => Record<string, number>;
  checkOrder: (order: string[], tier: Record<string, number>) => { ok: boolean; offender?: string; reason?: string };
  normalizeOrder: (order: string[], tier: Record<string, number>) => string[];
  moveTo: (order: string[], id: string, to: number) => string[];
  checkAllocation: (plan: { options: string[]; total: number; lethalNeed: Record<string, number>; tier: Record<string, number> }, alloc: Record<string, number>) => { ok: boolean; reason?: string };
  canonical: (alloc: Record<string, number>) => Record<string, number>;
};
let CA: CA;

beforeAll(async () => {
  await import("../../public/js/gameplay/combat-assign.js");
  CA = (globalThis as unknown as { CombatAssign: CA }).CombatAssign;
});

describe("combat-assign greedyFill (465.2.c.3–.4)", () => {
  test("8 over lethal [3,3,5] → 3,3,2 (third unit reached but survives)", () => {
    expect(CA.greedyFill(["a", "b", "c"], { a: 3, b: 3, c: 5 }, 8)).toEqual({ a: 3, b: 3, c: 2 });
  });
  test("reordering changes who dies: [c,a,b] → 5,3,0", () => {
    expect(CA.greedyFill(["c", "a", "b"], { a: 3, b: 3, c: 5 }, 8)).toEqual({ a: 3, b: 0, c: 5 });
  });
  test("excess only after everyone is lethal, piled on the LAST unit reached", () => {
    expect(CA.greedyFill(["a", "b"], { a: 2, b: 1 }, 4)).toEqual({ a: 2, b: 2 });
    expect(CA.greedyFill(["b", "a"], { a: 2, b: 1 }, 4)).toEqual({ a: 3, b: 1 });
  });
  test("damage below the first unit's lethal → all on the first, rest 0", () => {
    expect(CA.greedyFill(["a", "b", "c"], { a: 4, b: 1, c: 1 }, 2)).toEqual({ a: 2, b: 0, c: 0 });
  });
  test("single unit takes everything", () => {
    expect(CA.greedyFill(["a"], { a: 3 }, 8)).toEqual({ a: 8 });
  });
  test("stunned / shielded unit: uses the engine-provided lethalNeed, not Might", () => {
    // a stunned 2-Might unit with 1 damage still needs full lethal per the payload (say 4 via Shield):
    expect(CA.greedyFill(["s", "b"], { b: 2, s: 4 }, 5)).toEqual({ b: 1, s: 4 });
  });
  test("zero total → all zeros", () => {
    expect(CA.greedyFill(["a", "b"], { a: 1, b: 1 }, 0)).toEqual({ a: 0, b: 0 });
  });
});

describe("combat-assign order constraints (815 Tank first · 826 Backline last · 465.2.c.8 both)", () => {
  const tier = { bk: 2, p1: 1, p2: 1, tk: 0, tb: -1 };
  test("Tank pinned to the front", () => {
    expect(CA.checkOrder(["tk", "p1", "p2", "bk"], tier).ok).toBe(true);
    const bad = CA.checkOrder(["p1", "tk", "p2"], tier);
    expect(bad.ok).toBe(false);
    expect(bad.offender).toBe("tk");
    expect(bad.reason).toBe("tank-behind");
  });
  test("Backline pinned to the back", () => {
    const bad = CA.checkOrder(["tk", "bk", "p1"], tier);
    expect(bad.ok).toBe(false);
    expect(bad.offender).toBe("p1");
  });
  test("Tank+Backline unit may go first or last but not in the middle", () => {
    expect(CA.checkOrder(["tb", "tk", "p1"], tier).ok).toBe(true);
    expect(CA.checkOrder(["tk", "tb", "p1"], tier).ok).toBe(true); // still inside the Tank block
    expect(CA.checkOrder(["tk", "p1", "tb"], tier).ok).toBe(true);
    expect(CA.checkOrder(["tk", "p1", "tb", "p2"], tier).ok).toBe(false);
  });
  test("normalizeOrder repairs an illegal payload order stably", () => {
    expect(CA.normalizeOrder(["p1", "bk", "tk", "p2"], tier)).toEqual(["tk", "p1", "p2", "bk"]);
    expect(CA.normalizeOrder(["tk", "p2", "p1"], tier)).toEqual(["tk", "p2", "p1"]);
  });
  test("moveTo clamps", () => {
    expect(CA.moveTo(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(CA.moveTo(["a", "b", "c"], "a", 99)).toEqual(["b", "c", "a"]);
    expect(CA.moveTo(["a", "b", "c"], "b", -5)).toEqual(["b", "a", "c"]);
  });
});

describe("combat-assign agrees with the engine validator", () => {
  const plans = [
    { lethalNeed: { a: 3, b: 3, c: 5 }, options: ["a", "b", "c"], tier: { a: 1, b: 1, c: 1 }, total: 8 },
    { lethalNeed: { a: 2, b: 1, t: 3 }, options: ["t", "a", "b"], tier: { a: 1, b: 1, t: 0 }, total: 5 },
    { lethalNeed: { a: 2, k: 2, t: 3 }, options: ["t", "a", "k"], tier: { a: 1, k: 2, t: 0 }, total: 9 },
    { lethalNeed: { a: 2, b: 2, f: 1 }, options: ["f", "a", "b"], tier: { a: 1, b: 1, f: -1 }, total: 3 },
    { lethalNeed: { a: 4, b: 1 }, options: ["a", "b"], tier: {}, total: 2 },
  ];
  const enginePlan = (p: (typeof plans)[number]) => ({ defaultAllocation: {}, hasChoice: true, need: p.lethalNeed, order: p.options, tier: p.tier as Record<string, number>, total: p.total });
  const perms = (xs: string[]): string[][] => xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r]));

  test("every LEGAL lane order greedy-fills to an engine-legal allocation", () => {
    for (const p of plans) {
      for (const order of perms(p.options)) {
        if (!CA.checkOrder(order, p.tier).ok) {
          continue;
        }
        const alloc = CA.canonical(CA.greedyFill(order, p.lethalNeed, p.total));
        expect({ alloc, legal: isLegalDamageAssignment(enginePlan(p), alloc), order }).toEqual({ alloc, legal: true, order });
        expect(CA.checkAllocation(p, alloc).ok).toBe(true);
      }
    }
  });
  test("checkAllocation matches isLegalDamageAssignment on every engine-enumerated map and on perturbed ones", () => {
    for (const p of plans) {
      const legal = enumerateDamageAssignments(enginePlan(p));
      expect(legal.length).toBeGreaterThan(0);
      for (const alloc of legal) {
        expect(CA.checkAllocation(p, alloc)).toEqual({ ok: true });
        // shift one point between two buckets → whatever the engine says, the client agrees
        for (const from of p.options) {
          for (const to of p.options) {
            if (from === to || !(alloc[from] > 0)) {
              continue;
            }
            const bumped = CA.canonical({ ...alloc, [from]: (alloc[from] ?? 0) - 1, [to]: (alloc[to] ?? 0) + 1 });
            expect({ bumped, ok: CA.checkAllocation(p, bumped).ok }).toEqual({ bumped, ok: isLegalDamageAssignment(enginePlan(p), bumped) });
          }
        }
      }
      expect(CA.checkAllocation(p, { [p.options[0] as string]: p.total + 1 }).ok).toBe(false);
    }
  });
});
