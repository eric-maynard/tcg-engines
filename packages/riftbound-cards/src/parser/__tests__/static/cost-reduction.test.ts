/**
 * Parser tests for cost reduction static abilities
 *
 * Tests for parsing static abilities that reduce costs.
 */

import { describe, expect, it } from "bun:test";
import { parseAbilities } from "../../index";
import { Abilities } from "../helpers";

describe("Static: Cost Reduction", () => {
  describe("self cost reduction", () => {
    it("should parse 'I cost :rb_energy_2: less for each of your [Mighty] units.'", () => {
      const result = parseAbilities(
        "I cost :rb_energy_2: less for each of your [Mighty] units. (A unit is Mighty while it has 5+ :rb_might:.)",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          type: "static",
        }),
      );
    });

    it("should parse 'I cost :rb_energy_2::rb_rune_calm: less for each point you scored from holding this turn.'", () => {
      const result = parseAbilities(
        "I cost :rb_energy_2::rb_rune_calm: less for each point you scored from holding this turn.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
    });

    it("should parse 'I cost :rb_energy_2: less to play from anywhere other than your hand.'", () => {
      const result = parseAbilities(
        "I cost :rb_energy_2: less to play from anywhere other than your hand.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
    });
  });

  describe("spell cost reduction", () => {
    it("should parse 'This spell's Energy cost is reduced by the highest Might among units you control.'", () => {
      const result = parseAbilities(
        "This spell's Energy cost is reduced by the highest Might among units you control.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
    });
  });

  describe("other cards cost reduction", () => {
    it("should parse 'While you control this battlefield, friendly [Repeat] costs cost :rb_energy_1: less.'", () => {
      const result = parseAbilities(
        "While you control this battlefield, friendly [Repeat] costs cost :rb_energy_1: less.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          condition: expect.objectContaining({
            type: "control-battlefield",
          }),
          type: "static",
        }),
      );
    });
  });

  describe("conditional cost reduction", () => {
    it("should parse 'If an enemy unit has died this turn, this costs :rb_energy_2: less.'", () => {
      const result = parseAbilities(
        "If an enemy unit has died this turn, this costs :rb_energy_2: less.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
    });
  });

  describe("minimum normalization (batch 14 — S's gap)", () => {
    // The text pipeline encodes "[1]" as ":rb_energy_1:". The parser must
    // Normalize a single-energy minimum token to its numeric value so the
    // Engine can clamp on it without re-parsing the symbol at play time.
    it("normalizes Slugger-style scope minimum to a numeric `minimum`", () => {
      const result = parseAbilities(
        "I cost :rb_energy_1: less for each card you've played this turn, to a minimum of :rb_energy_1:.",
      );
      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      const ability = result.abilities?.[0] as {
        effect?: {
          reduction?: number | string;
          scope?: string;
          minimum?: number | string;
          type?: string;
        };
      };
      expect(ability?.effect?.type).toBe("cost-reduction");
      expect(ability?.effect?.reduction).toBe(1);
      expect(ability?.effect?.minimum).toBe(1);
      // The clause must be stripped from the scope so it reads cleanly.
      expect(ability?.effect?.scope).toBe("for each card you've played this turn");
    });

    it("normalizes Eager-Apprentice-style 'reduced by N, to a minimum of M' minimum", () => {
      const result = parseAbilities(
        "While I'm at a battlefield, the Energy costs for spells you play is reduced by :rb_energy_1:, to a minimum of :rb_energy_1:.",
      );
      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      const ability = result.abilities?.[0] as {
        effect?: { by?: number | string; minimum?: number | string; type?: string };
      };
      expect(ability?.effect?.type).toBe("cost-reduction");
      expect(ability?.effect?.by).toBe(1);
      expect(ability?.effect?.minimum).toBe(1);
    });

    it("self cost-reduction without a minimum: `reduction` is still numeric", () => {
      const result = parseAbilities(
        "I cost :rb_energy_2: less for each of your [Mighty] units.",
      );
      expect(result.success).toBe(true);
      const ability = result.abilities?.[0] as {
        effect?: { reduction?: number | string; type?: string };
      };
      expect(ability?.effect?.type).toBe("cost-reduction");
      // Was previously ":rb_energy_2:"; now numeric.
      expect(ability?.effect?.reduction).toBe(2);
    });

    it("multi-resource reductions (energy + power) stay as strings — only single-energy tokens normalize", () => {
      // ":rb_energy_2::rb_rune_calm:" is a structured cost, not a numeric
      // Minimum; the engine reads it as a cost object. We MUST NOT collapse
      // It to a number — that would lose the power-rune requirement.
      const result = parseAbilities(
        "I cost :rb_energy_2::rb_rune_calm: less for each point you scored from holding this turn.",
      );
      expect(result.success).toBe(true);
      const ability = result.abilities?.[0] as {
        effect?: { reduction?: number | string; type?: string };
      };
      expect(ability?.effect?.type).toBe("cost-reduction");
      // String, unchanged.
      expect(typeof ability?.effect?.reduction).toBe("string");
      expect(ability?.effect?.reduction).toBe(":rb_energy_2::rb_rune_calm:");
    });
  });
});
