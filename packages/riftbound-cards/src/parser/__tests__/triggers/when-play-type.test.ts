/**
 * Parser tests for type-specific "When you play a [Type]" triggers.
 *
 * These shapes (play-unit / play-token-unit / play-gear / play-legend /
 * play-spell with various `on` subjects) are now wired into the engine's
 * trigger-matcher: a generic `play-card` event with matching `cardType`
 * fires the corresponding `play-X` trigger.  The tests here LOCK the
 * parser-emitted shapes — if the parser drifts (renames event keys,
 * changes `on` subjects), the engine listener will start missing triggers
 * silently, so this file should be the canary.
 */

import { describe, expect, it } from "bun:test";
import { parseAbilities } from "../../index";

describe("Trigger: When you play a [Type]", () => {
  it("'When you play a unit, …' emits event 'play-unit' with a friendly-unit filter", () => {
    // The parser may emit either the string form "friendly-units" or the
    // Canonical object form { controller: "friendly", type: "unit" } — the
    // Engine matcher accepts BOTH. This test locks "at least one is true".
    const result = parseAbilities("When you play a unit, draw 1.");
    expect(result.success).toBe(true);
    expect(result.abilities).toHaveLength(1);
    const ab = result.abilities?.[0] as unknown as Record<string, unknown>;
    const trig = ab.trigger as unknown as Record<string, unknown>;
    expect(trig.event).toBe("play-unit");
    const on = trig.on as unknown as Record<string, unknown> | string;
    if (typeof on === "string") {
      expect(on).toBe("friendly-units");
    } else {
      expect(on.controller).toBe("friendly");
      expect(on.type === "unit" || on.cardType === "unit").toBe(true);
    }
  });

  it("'When you play another unit, …' emits event 'play-unit' with an excludeSelf object on", () => {
    // The parser emits the object form { controller: "friendly", excludeSelf: true, type: "unit" }
    // For the "another" variant — the engine matcher honors `excludeSelf` to skip the played
    // Card itself. Lock both halves so refactors keep the contract.
    const result = parseAbilities("When you play another unit, draw 1.");
    expect(result.success).toBe(true);
    expect(result.abilities).toHaveLength(1);
    const ab = result.abilities?.[0] as unknown as Record<string, unknown>;
    const trig = ab.trigger as unknown as Record<string, unknown>;
    expect(trig.event).toBe("play-unit");
    const on = trig.on as unknown as Record<string, unknown> | string;
    if (typeof on === "string") {
      expect(on).toBe("another-friendly-units");
    } else {
      expect(on.controller).toBe("friendly");
      expect(on.excludeSelf).toBe(true);
      expect(on.type === "unit" || on.cardType === "unit").toBe(true);
    }
  });

  it("'When you play a token unit, …' emits event 'play-token-unit' on 'controller'", () => {
    const result = parseAbilities("When you play a token unit, draw 1.");
    expect(result.success).toBe(true);
    expect(result.abilities).toHaveLength(1);
    const ab = result.abilities?.[0] as unknown as Record<string, unknown>;
    expect((ab.trigger as unknown as Record<string, unknown>).event).toBe("play-token-unit");
    expect((ab.trigger as unknown as Record<string, unknown>).on).toBe("controller");
  });

  it("'When you play a spell, …' emits event 'play-spell' on 'controller'", () => {
    const result = parseAbilities("When you play a spell, draw 1.");
    expect(result.success).toBe(true);
    expect(result.abilities).toHaveLength(1);
    const ab = result.abilities?.[0] as unknown as Record<string, unknown>;
    expect((ab.trigger as unknown as Record<string, unknown>).event).toBe("play-spell");
    expect((ab.trigger as unknown as Record<string, unknown>).on).toBe("controller");
  });

  it("'When an opponent plays a spell, …' emits event 'play-spell' on 'opponent'", () => {
    const result = parseAbilities("When an opponent plays a spell, draw 1.");
    expect(result.success).toBe(true);
    expect(result.abilities).toHaveLength(1);
    const ab = result.abilities?.[0] as unknown as Record<string, unknown>;
    expect((ab.trigger as unknown as Record<string, unknown>).event).toBe("play-spell");
    expect((ab.trigger as unknown as Record<string, unknown>).on).toBe("opponent");
  });

  it("'When a player plays a unit here, …' emits event 'play-unit' on 'any-player'", () => {
    const result = parseAbilities("When a player plays a unit here, draw 1.");
    expect(result.success).toBe(true);
    expect(result.abilities).toHaveLength(1);
    const ab = result.abilities?.[0] as unknown as Record<string, unknown>;
    expect((ab.trigger as unknown as Record<string, unknown>).event).toBe("play-unit");
    expect((ab.trigger as unknown as Record<string, unknown>).on).toBe("any-player");
  });

  it("'Draw N.' inside a triggered ability still routes to the draw effect", () => {
    const result = parseAbilities("When you play a unit, draw 2.");
    expect(result.success).toBe(true);
    const ab = result.abilities?.[0] as unknown as Record<string, unknown>;
    const effect = ab.effect as unknown as Record<string, unknown>;
    expect(effect.type).toBe("draw");
    expect(effect.amount).toBe(2);
  });
});
