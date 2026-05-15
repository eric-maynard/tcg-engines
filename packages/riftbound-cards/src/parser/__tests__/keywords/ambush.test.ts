/**
 * Parser tests for the Ambush keyword (Core Rules 2026-03-30 §822).
 *
 * Rule §822: A unit with [Ambush] has two passive abilities:
 *   1. "I may be played to a battlefield where you control units."
 *   2. "I have [Reaction] as long as I'm being played to a battlefield
 *       where you control units."
 *
 * The parser only needs to surface [Ambush] as a keyword ability so the
 * engine (operations/keyword-effects.ts `canPlayViaAmbush`) can grant the
 * conditional play permission. We assert it parses, survives alongside the
 * reminder text and any extra triggered ability on the card, and combines
 * cleanly with other keywords.
 */

import { describe, expect, it } from "bun:test";
import { parseAbilities } from "../../index";
import { Abilities } from "../helpers";

describe("Keyword: Ambush (rule 822)", () => {
  it("822.1: parses '[Ambush]' with its reminder text into a single keyword ability", () => {
    const result = parseAbilities(
      "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)",
    );
    expect(result.success).toBe(true);
    expect(result.abilities).toHaveLength(1);
    expect(result.abilities?.[0]).toEqual(
      expect.objectContaining(Abilities.simpleKeyword("Ambush")),
    );
  });

  it("822.1: preserves [Ambush] alongside a following triggered ability (Arachnoid Horror text)", () => {
    const result = parseAbilities(
      "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)\nWhen you play me, give your other units here [Shield] this turn. (+1 [Might] while they're defenders.)",
    );
    expect(result.success).toBe(true);
    expect(result.abilities?.length).toBeGreaterThanOrEqual(2);
    expect(result.abilities?.[0]).toEqual(
      expect.objectContaining(Abilities.simpleKeyword("Ambush")),
    );
    const trig = result.abilities?.find((a) => a.type === "triggered");
    expect(trig).toBeDefined();
  });

  it("822.1: combines with another keyword on the same card", () => {
    const result = parseAbilities(
      "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)[Weaponmaster] (When you play me, you may [Equip] one of your Equipment to me for :rb_rune_rainbow: less, even if it's already attached.)",
    );
    expect(result.success).toBe(true);
    expect(result.abilities).toHaveLength(2);
    expect(result.abilities?.[0]).toEqual(
      expect.objectContaining(Abilities.simpleKeyword("Ambush")),
    );
    expect(result.abilities?.[1]).toEqual(
      expect.objectContaining(Abilities.simpleKeyword("Weaponmaster")),
    );
  });
});
