/**
 * Parser tests for extended static aura patterns in static-parser.ts.
 *
 * Covers:
 *  - "Stunned enemy units here have -N [Might], to a minimum of M [Might]"
 *  - "Enemy units here have [Keyword]"
 *  - "While I'm buffed, I have an additional +N [Might]"
 *  - "While I'm at a battlefield, the Energy costs for spells you play is reduced by [1]"
 */

import { describe, expect, it } from "bun:test";
import { parseAbilities } from "../../index";

describe("Static Parser: aura extensions", () => {
  it("parses 'Stunned enemy units here have -8 [Might], to a minimum of 1 [Might].'", () => {
    const result = parseAbilities(
      "Stunned enemy units here have -8 [Might], to a minimum of 1 [Might].",
    );
    expect(result.success).toBe(true);
    expect(result.abilities).toHaveLength(1);
    expect(result.abilities?.[0]).toEqual(
      expect.objectContaining({
        effect: expect.objectContaining({
          amount: -8,
          minimum: 1,
          target: expect.objectContaining({
            controller: "enemy",
            filter: "stunned",
            location: "here",
            type: "unit",
          }),
          type: "modify-might",
        }),
        type: "static",
      }),
    );
  });

  it("parses 'Enemy units here have [Hidden].'", () => {
    const result = parseAbilities("Enemy units here have [Hidden].");
    expect(result.success).toBe(true);
    expect(result.abilities?.[0]).toEqual(
      expect.objectContaining({
        effect: expect.objectContaining({
          keyword: "Hidden",
          target: expect.objectContaining({
            controller: "enemy",
            location: "here",
          }),
          type: "grant-keyword",
        }),
        type: "static",
      }),
    );
  });

  it("parses 'While I'm buffed, I have an additional +1 [Might].'", () => {
    const result = parseAbilities("While I'm buffed, I have an additional +1 [Might].");
    expect(result.success).toBe(true);
    expect(result.abilities?.[0]).toEqual(
      expect.objectContaining({
        condition: { type: "while-buffed" },
        effect: expect.objectContaining({
          amount: 1,
          target: "self",
          type: "modify-might",
        }),
        type: "static",
      }),
    );
  });

  it("parses 'While I'm at a battlefield, the Energy costs for spells you play is reduced by [1].'", () => {
    const result = parseAbilities(
      "While I'm at a battlefield, the Energy costs for spells you play is reduced by [1], to a minimum of [1].",
    );
    expect(result.success).toBe(true);
    expect(result.abilities?.[0]).toEqual(
      expect.objectContaining({
        condition: { type: "while-at-battlefield" },
        effect: expect.objectContaining({
          type: "cost-reduction",
        }),
        type: "static",
      }),
    );
  });

  it(String.raw`parses Leona, Zealot: 'If an opponent's score is within 3 points of the Victory Score, I enter ready.\nStunned enemy units here have -8 [Might], to a minimum of 1 [Might].'`, () => {
    const result = parseAbilities(
      "If an opponent's score is within 3 points of the Victory Score, I enter ready.\nStunned enemy units here have -8 [Might], to a minimum of 1 [Might].",
    );
    expect(result.success).toBe(true);
    expect(result.abilities).toHaveLength(2);
    // First ability: conditional enter-ready
    expect(result.abilities?.[0]).toEqual(
      expect.objectContaining({
        condition: expect.objectContaining({
          type: "score-within",
          whose: "opponent",
        }),
        effect: expect.objectContaining({ type: "enter-ready" }),
        type: "static",
      }),
    );
    // Second ability: might penalty aura
    expect(result.abilities?.[1]).toEqual(
      expect.objectContaining({
        effect: expect.objectContaining({
          amount: -8,
          minimum: 1,
          type: "modify-might",
        }),
        type: "static",
      }),
    );
  });
});
