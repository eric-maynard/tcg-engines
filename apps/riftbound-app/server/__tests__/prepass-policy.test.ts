import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// prepass.js is a classic script (no exports), so evaluate it and lift the
// pure decision function out.
const src = readFileSync("apps/riftbound-app/public/js/gameplay/prepass.js", "utf8");
const prepassDecide = new Function(`${src}; return prepassDecide;`)() as (o: Record<string, unknown>) => string;

describe("prepass policy", () => {
  const base = { armed: true, chainLenAtArm: 1, chainLenNow: 1, hasPassMove: false, over: false };

  test("waits while priority is elsewhere", () => {
    expect(prepassDecide(base)).toBe("wait");
  });

  test("fires when priority arrives and nothing changed", () => {
    expect(prepassDecide({ ...base, hasPassMove: true })).toBe("fire");
  });

  test("cancels rather than passing through a new chain item", () => {
    expect(prepassDecide({ ...base, chainLenNow: 2, hasPassMove: true })).toBe("cancel");
  });

  test("cancels when the game is over", () => {
    expect(prepassDecide({ ...base, over: true, hasPassMove: true })).toBe("cancel");
  });

  test("does nothing when not armed", () => {
    expect(prepassDecide({ ...base, armed: false, hasPassMove: true })).toBe("wait");
  });

  test("a shrinking chain (items resolving) still fires", () => {
    // Resolution is the normal case: the item you declined to answer resolves.
    expect(prepassDecide({ ...base, chainLenNow: 0, hasPassMove: true })).toBe("fire");
  });
});
