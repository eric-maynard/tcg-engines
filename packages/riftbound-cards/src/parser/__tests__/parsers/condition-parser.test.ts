/**
 * Parser tests for the extended condition parser.
 *
 * Covers "if you control ...", "if you have ...", score-within conditions,
 * and the leading/trailing-if helpers used by triggered-ability parsing.
 */

import { describe, expect, it } from "bun:test";
import {
  parseConditionFromText,
  parseLeadingIfCondition,
  parseTrailingIfCondition,
} from "../../parsers/condition-parser";
import { parseAbilities } from "../../index";

describe("Condition Parser: extended", () => {
  describe("parseConditionFromText — leading condition phrases", () => {
    it("parses 'If an opponent's score is within 3 points of the Victory Score'", () => {
      const result = parseConditionFromText(
        "If an opponent's score is within 3 points of the Victory Score,",
      );
      expect(result?.condition).toEqual({
        points: 3,
        type: "score-within",
        whose: "opponent",
      });
    });

    it("parses 'While your score is within 3 points of the Victory Score'", () => {
      const result = parseConditionFromText(
        "While your score is within 3 points of the Victory Score,",
      );
      expect(result?.condition).toEqual({
        points: 3,
        type: "score-within",
        whose: "your",
      });
    });

    it("parses 'While I'm in combat' as an in-combat condition", () => {
      const result = parseConditionFromText("While I'm in combat,");
      expect(result?.condition).toEqual({ type: "in-combat" });
    });
  });

  describe("parseLeadingIfCondition — controller / count clauses", () => {
    it("parses 'if you control a Poro, draw 1.'", () => {
      const result = parseLeadingIfCondition("if you control a Poro, draw 1.");
      expect(result?.condition).toEqual({
        target: {
          controller: "friendly",
          filter: { tag: "Poro" },
          type: "unit",
        },
        type: "control",
      });
      expect(result?.effectText).toBe("draw 1.");
    });

    it("parses 'if you control two or more gear, ready me.'", () => {
      const result = parseLeadingIfCondition("if you control two or more gear, ready me.");
      expect(result?.condition).toEqual({
        target: {
          controller: "friendly",
          quantity: { atLeast: 2 },
          type: "gear",
        },
        type: "control",
      });
      expect(result?.effectText).toBe("ready me.");
    });

    it("parses 'if you control a facedown card at a battlefield, draw 1.'", () => {
      const result = parseLeadingIfCondition(
        "if you control a facedown card at a battlefield, draw 1.",
      );
      expect(result?.condition).toEqual({
        target: {
          controller: "friendly",
          filter: "facedown",
          location: "battlefield",
          type: "card",
        },
        type: "control",
      });
    });

    it("parses 'if you assigned 3 or more excess damage, do X.'", () => {
      const result = parseLeadingIfCondition("if you assigned 3 or more excess damage, do X.");
      expect(result?.condition).toEqual({
        amount: 3,
        type: "excess-damage-assigned",
      });
    });

    it("parses 'if you paid the additional cost, draw 1.'", () => {
      const result = parseLeadingIfCondition("if you paid the additional cost, draw 1.");
      expect(result?.condition).toEqual({ type: "paid-additional-cost" });
      expect(result?.effectText).toBe("draw 1.");
    });
  });

  describe("parseTrailingIfCondition", () => {
    it("parses 'draw 1 if you have one or fewer cards in your hand.'", () => {
      const result = parseTrailingIfCondition(
        "draw 1 if you have one or fewer cards in your hand.",
      );
      // Word-form counts ("one or fewer") are now resolved into a
      // Structured `has-at-most` condition.
      expect(result?.condition).toEqual({
        count: 1,
        target: {
          controller: "friendly",
          location: "hand",
          type: "card",
        },
        type: "has-at-most",
      });
      expect(result?.effectText).toBe("draw 1");
    });

    it("parses 'draw 1 if you control a Poro.'", () => {
      const result = parseTrailingIfCondition("draw 1 if you control a Poro.");
      expect(result?.condition).toEqual({
        target: {
          controller: "friendly",
          filter: { tag: "Poro" },
          type: "unit",
        },
        type: "control",
      });
      expect(result?.effectText).toBe("draw 1");
    });
  });

  describe("end-to-end card-text parses", () => {
    it("parses Poro Herder: 'When you play me, if you control a Poro, buff me and draw 1.'", () => {
      const result = parseAbilities(
        "When you play me, if you control a Poro, buff me and draw 1.",
      );
      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      const ability = result.abilities?.[0];
      expect(ability).toEqual(
        expect.objectContaining({
          condition: expect.objectContaining({ type: "control" }),
          type: "triggered",
        }),
      );
    });

    it("parses Mushroom Pouch: 'At the start of your Beginning Phase, if you control a facedown card at a battlefield, draw 1.'", () => {
      const result = parseAbilities(
        "At the start of your Beginning Phase, if you control a facedown card at a battlefield, draw 1.",
      );
      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          condition: expect.objectContaining({
            target: expect.objectContaining({ filter: "facedown" }),
            type: "control",
          }),
          type: "triggered",
        }),
      );
    });

    it("parses Dropboarder: 'When you play me, if you control two or more gear, ready me.'", () => {
      const result = parseAbilities(
        "When you play me, if you control two or more gear, ready me.",
      );
      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          condition: expect.objectContaining({
            target: expect.objectContaining({ quantity: { atLeast: 2 } }),
            type: "control",
          }),
        }),
      );
    });
  });
});
