/**
 * Regression test: verify the compiled per-set JSON files actually carry the
 * `minimum` field on modify-might effects for cards whose rulesText says
 * "to a minimum of N [Might]" (rule 472.3.b — arithmetic snapshotting).
 *
 * Before batch 13 the parser emitted `effect.minimum` but the JSON files in
 * `src/data/sets/*.json` were stale and the field was missing — so the engine
 * (which reads the JSON, not the parser) could not honor the minimum even
 * after batch 12 wired up the engine-side enforcement. This test pins the
 * end-to-end shape so future regens cannot silently drop the field again.
 */

import { describe, expect, test } from "bun:test";

import { getAllCards } from "../data";

interface ModifyMightEffect {
  type: "modify-might";
  amount: number;
  minimum?: number;
  target?: unknown;
  duration?: string;
  [key: string]: unknown;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function* walkEffects(node: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(node)) {
    for (const child of node) {
      yield* walkEffects(child);
    }
    return;
  }
  if (!isObject(node)) {
    return;
  }
  yield node;
  for (const v of Object.values(node)) {
    yield* walkEffects(v);
  }
}

function collectModifyMight(card: unknown): ModifyMightEffect[] {
  if (!isObject(card)) {
    return [];
  }
  const result: ModifyMightEffect[] = [];
  for (const node of walkEffects(card.abilities)) {
    if (node.type === "modify-might") {
      result.push(node as ModifyMightEffect);
    }
  }
  return result;
}

describe("compiled JSON: modify-might minimum field (rule 472.3.b)", () => {
  test("at least one card carries effect.minimum on a modify-might effect", () => {
    const cards = getAllCards();
    const withMinimum = cards.filter(
      (c) => collectModifyMight(c).some((e) => typeof e.minimum === "number"),
    );
    // The compiled JSON must reflect parser output. If this drops to zero a
    // Regen has silently broken — see `scripts/reparse-abilities.ts`.
    expect(withMinimum.length).toBeGreaterThanOrEqual(6);
  });

  test("every modify-might effect whose rulesText says 'to a minimum of N [Might]' carries that minimum", () => {
    const cards = getAllCards();
    const offenders: string[] = [];

    for (const card of cards) {
      const c = card as unknown as { id: string; name: string; rulesText: string };
      if (!c.rulesText) {
        continue;
      }
      // Match "to a minimum of <N> [Might]" (case-insensitive). Capture N.
      const match = /to a minimum of (\d+)\s*\[Might\]/i.exec(c.rulesText);
      if (!match) {
        continue;
      }
      const expected = Number.parseInt(match[1], 10);
      const effects = collectModifyMight(card);
      if (effects.length === 0) {
        // RulesText says minimum-of-N-might but there's no modify-might
        // Effect at all in the compiled abilities. That's a parser miss,
        // Not a regen miss — out of scope for this test.
        continue;
      }
      const hit = effects.some((e) => e.minimum === expected);
      if (!hit) {
        offenders.push(`${c.id} (${c.name}) — expected minimum ${expected}; got: ${JSON.stringify(effects.map((e) => e.minimum))}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  test("specific real card 'Leona, Zealot' carries minimum:1 on its enemy-units modify-might effect", () => {
    const cards = getAllCards();
    const leonaZealot = cards.find(
      (c) => (c as unknown as { name: string }).name === "Leona, Zealot",
    );
    expect(leonaZealot).toBeDefined();
    const effects = collectModifyMight(leonaZealot);
    const negativeWithMinimum = effects.find((e) => e.amount < 0 && e.minimum === 1);
    expect(negativeWithMinimum).toBeDefined();
    // Sanity-pin the snapshot: -8 might, minimum 1
    expect(negativeWithMinimum?.amount).toBe(-8);
    expect(negativeWithMinimum?.minimum).toBe(1);
  });
});
