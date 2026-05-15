/**
 * Parser tests for the Legion "...instead." dependent-keyword form — a
 * replacement-style modification of the host spell/ability's own printed
 * effect (Core Rules 2026-03-30 §812, §724).
 *
 * Example: Noxian Guillotine (OGN-254) reads:
 *   "[Action] (...)
 *    Choose a unit. Kill it the next time it takes damage this turn.
 *    [Legion] — Kill it now instead. (...)"
 *
 * Before this fix the `[Legion]` line was *silently dropped* — `parseAbilities`
 * returned only the `[Action]` spell ability and the Legion alternate effect
 * vanished. Now the parser emits a second ability:
 *   { type: "keyword", keyword: "Legion", effect: <killEffect>, replacesSpellEffect: true }
 * The `replacesSpellEffect` flag is set because the carried text ends in
 * "instead" — the engine substitutes this effect for the printed one when the
 * Legion condition (you played another card this turn, §724) holds.
 */

import { describe, expect, it } from "bun:test";
import { parseAbilities } from "../../index";

describe("Legion replacement-style alternate effect (rules 812 / 724)", () => {
  it("812: '[Legion] — Kill it now instead.' parses to a Legion keyword ability carrying a kill effect with replacesSpellEffect:true", () => {
    const r = parseAbilities("[Legion] — Kill it now instead.");
    expect(r.success).toBe(true);
    expect(r.abilities).toHaveLength(1);
    expect(r.abilities?.[0]).toEqual(
      expect.objectContaining({
        effect: { target: { type: "unit" }, type: "kill" },
        keyword: "Legion",
        replacesSpellEffect: true,
        type: "keyword",
      }),
    );
  });

  it("812: Noxian Guillotine's full text emits BOTH the [Action] spell AND the Legion alternate (no longer dropped)", () => {
    const text =
      "[Action] (Play on your turn or in showdowns.)\n" +
      "Choose a unit. Kill it the next time it takes damage this turn.\n" +
      "[Legion] — Kill it now instead. (Get the effect if you've played another card this turn.)";
    const r = parseAbilities(text);
    expect(r.success).toBe(true);
    // The printed [Action] spell effect: a "next time it takes damage" replacement.
    const spell = r.abilities?.find((a) => a.type === "spell") as
      | { timing?: string; effect?: { type?: string; replaces?: string } }
      | undefined;
    expect(spell).toBeDefined();
    expect(spell?.timing).toBe("action");
    expect(spell?.effect?.type).toBe("replacement");
    expect(spell?.effect?.replaces).toBe("take-damage");
    // The Legion alternate: replaces the spell's printed effect.
    const legion = r.abilities?.find(
      (a) => (a as { keyword?: string }).keyword === "Legion",
    ) as { effect?: { type?: string }; replacesSpellEffect?: boolean } | undefined;
    expect(legion).toBeDefined();
    expect(legion?.replacesSpellEffect).toBe(true);
    expect(legion?.effect?.type).toBe("kill");
  });

  it("812: a Legion line WITHOUT 'instead' (additive, not a replacement) does not get the replacesSpellEffect flag", () => {
    const r = parseAbilities("[Legion] — Draw 1.");
    expect(r.success).toBe(true);
    const legion = r.abilities?.[0] as { keyword?: string; replacesSpellEffect?: boolean };
    expect(legion.keyword).toBe("Legion");
    expect(legion.replacesSpellEffect).toBeUndefined();
  });

  it("812: 'Kill a friendly unit.' / 'Kill an enemy unit.' carry the controller filter", () => {
    const friendly = parseAbilities("[Legion] — Kill a friendly unit.");
    expect((friendly.abilities?.[0] as { effect?: unknown }).effect).toEqual({
      target: { controller: "friendly", type: "unit" },
      type: "kill",
    });
    const enemy = parseAbilities("[Legion] — Kill an enemy unit.");
    expect((enemy.abilities?.[0] as { effect?: unknown }).effect).toEqual({
      target: { controller: "enemy", type: "unit" },
      type: "kill",
    });
  });

  it("254: the real Noxian Guillotine card definition parses without dropping the Legion line", () => {
    const text =
      "[Action] (Play on your turn or in showdowns.)\n" +
      "Choose a unit. Kill it the next time it takes damage this turn.\n" +
      "[Legion] — Kill it now instead. (Get the effect if you've played another card this turn.)";
    const r = parseAbilities(text);
    expect(r.success).toBe(true);
    expect(r.abilities?.length).toBeGreaterThanOrEqual(2);
  });
});
