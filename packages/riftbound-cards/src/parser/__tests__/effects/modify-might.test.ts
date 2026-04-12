/**
 * Parser tests for modify-might effects
 *
 * Tests for parsing abilities that modify unit Might values.
 * Covers both triggered and activated ability contexts.
 */

import { describe, expect, it } from "bun:test";
import { parseAbilities } from "../../index";

describe("Effect: Modify Might", () => {
  describe("basic modify-might patterns", () => {
    it("should parse 'Give a unit +3 [Might] this turn.'", () => {
      const result = parseAbilities("Give a unit +3 [Might] this turn.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 3,
            duration: "turn",
            type: "modify-might",
          }),
          type: "spell",
        }),
      );
    });

    it("should parse 'Give a unit -1 [Might] this turn, to a minimum of 1 [Might].'", () => {
      const result = parseAbilities(
        "Give a unit -1 [Might] this turn, to a minimum of 1 [Might].",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: -1,
            duration: "turn",
            minimum: 1,
            type: "modify-might",
          }),
        }),
      );
    });
  });

  describe("activated ability with [Exhaust] cost", () => {
    it("should parse '[Exhaust]: Give a unit +3 [Might] this turn.'", () => {
      const result = parseAbilities("[Exhaust]: Give a unit +3 [Might] this turn.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          cost: expect.objectContaining({ exhaust: true }),
          effect: expect.objectContaining({
            amount: 3,
            duration: "turn",
            type: "modify-might",
          }),
          type: "activated",
        }),
      );
    });

    it("should parse '[Exhaust]: Give a unit -1 [Might] this turn, to a minimum of 1 [Might].'", () => {
      const result = parseAbilities(
        "[Exhaust]: Give a unit -1 [Might] this turn, to a minimum of 1 [Might].",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          cost: expect.objectContaining({ exhaust: true }),
          effect: expect.objectContaining({
            amount: -1,
            minimum: 1,
            type: "modify-might",
          }),
          type: "activated",
        }),
      );
    });

    it("should parse '[1], [Exhaust]: Buff a friendly unit.'", () => {
      const result = parseAbilities("[1], [Exhaust]: Buff a friendly unit.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          cost: expect.objectContaining({ energy: 1, exhaust: true }),
          effect: expect.objectContaining({ type: "buff" }),
          type: "activated",
        }),
      );
    });
  });

  describe("triggered modify-might patterns", () => {
    it("should parse 'When I attack or defend, give an enemy unit here -2 [Might] this turn, to a minimum of 1 [Might].'", () => {
      const result = parseAbilities(
        "When I attack or defend, give an enemy unit here -2 [Might] this turn, to a minimum of 1 [Might].",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: -2,
            minimum: 1,
            type: "modify-might",
          }),
          trigger: expect.objectContaining({
            event: "attack-or-defend",
          }),
          type: "triggered",
        }),
      );
    });

    it("should parse 'When you ready a friendly unit, give it +1 [Might] this turn.'", () => {
      const result = parseAbilities(
        "When you ready a friendly unit, give it +1 [Might] this turn.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 1,
            duration: "turn",
            type: "modify-might",
          }),
          trigger: expect.objectContaining({
            event: "ready",
          }),
          type: "triggered",
        }),
      );
    });

    it("should parse 'When you play a card from [Hidden], give me +2 [Might] this turn.'", () => {
      const result = parseAbilities(
        "When you play a card from [Hidden], give me +2 [Might] this turn.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 2,
            target: "self",
            type: "modify-might",
          }),
          trigger: expect.objectContaining({
            event: "play-from-hidden",
          }),
          type: "triggered",
        }),
      );
    });

    it("should parse 'When I move from a battlefield, give me +2 [Might] this turn.'", () => {
      const result = parseAbilities(
        "When I move from a battlefield, give me +2 [Might] this turn.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 2,
            target: "self",
            type: "modify-might",
          }),
          trigger: expect.objectContaining({
            event: "move-from-battlefield",
            on: "self",
          }),
          type: "triggered",
        }),
      );
    });

    it("should parse 'When you play a unit, give a unit +1 [Might] this turn.'", () => {
      const result = parseAbilities(
        "When you play a unit, give a unit +1 [Might] this turn.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 1,
            type: "modify-might",
          }),
          trigger: expect.objectContaining({
            event: "play-unit",
          }),
          type: "triggered",
        }),
      );
    });
  });

  describe("compound modify-might + other effects", () => {
    it("should parse 'give me +2 [Might] this turn and ready me.'", () => {
      const result = parseAbilities("give me +2 [Might] this turn and ready me.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            effects: expect.arrayContaining([
              expect.objectContaining({ amount: 2, type: "modify-might" }),
              expect.objectContaining({ type: "ready" }),
            ]),
            type: "sequence",
          }),
        }),
      );
    });

    it("should parse triggered 'When you play your second card in a turn, give me +2 [Might] this turn and ready me.'", () => {
      const result = parseAbilities(
        "When you play your second card in a turn, give me +2 [Might] this turn and ready me.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            type: "sequence",
          }),
          trigger: expect.objectContaining({
            event: "play-card",
          }),
          type: "triggered",
        }),
      );
    });

    it("should parse triggered 'When you stun an enemy unit, ready me and give me +1 [Might] this turn.'", () => {
      const result = parseAbilities(
        "When you stun an enemy unit, ready me and give me +1 [Might] this turn.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            type: "sequence",
          }),
          trigger: expect.objectContaining({
            event: "stun",
          }),
          type: "triggered",
        }),
      );
    });
  });

  describe("buff with filters", () => {
    it("should parse '[Exhaust]: Buff an exhausted friendly unit.'", () => {
      const result = parseAbilities("[Exhaust]: Buff an exhausted friendly unit.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          cost: expect.objectContaining({ exhaust: true }),
          effect: expect.objectContaining({
            target: expect.objectContaining({
              controller: "friendly",
              filter: "exhausted",
              type: "unit",
            }),
            type: "buff",
          }),
          type: "activated",
        }),
      );
    });

    it("should parse 'When a buffed friendly unit dies, buff another friendly unit.'", () => {
      const result = parseAbilities(
        "When a buffed friendly unit dies, buff another friendly unit.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              controller: "friendly",
              excludeSelf: true,
              type: "unit",
            }),
            type: "buff",
          }),
          trigger: expect.objectContaining({
            event: "die",
          }),
          type: "triggered",
        }),
      );
    });
  });

  describe("spend-based activated abilities", () => {
    it("should parse 'Spend 2 XP: Buff me.'", () => {
      const result = parseAbilities("Spend 2 XP: Buff me.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({ target: "self", type: "buff" }),
          type: "activated",
        }),
      );
    });

    it("should parse 'Spend my buff: Give me +4 [Might] this turn.'", () => {
      const result = parseAbilities("Spend my buff: Give me +4 [Might] this turn.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 4,
            duration: "turn",
            target: "self",
            type: "modify-might",
          }),
          type: "activated",
        }),
      );
    });
  });

  describe("static might modifier patterns", () => {
    it("should parse 'I have +2 [Might] while I'm attacking with another unit.'", () => {
      const result = parseAbilities(
        "I have +2 [Might] while I'm attacking with another unit.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          condition: expect.objectContaining({ type: "custom" }),
          effect: expect.objectContaining({
            amount: 2,
            target: "self",
            type: "modify-might",
          }),
          type: "static",
        }),
      );
    });

    it("should parse 'If you've gained XP this turn, I have +1 [Might] and [Ganking].'", () => {
      const result = parseAbilities(
        "If you've gained XP this turn, I have +1 [Might] and [Ganking].",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          condition: expect.anything(),
          effect: expect.anything(),
          type: "static",
        }),
      );
    });
  });

  describe("multi-line cards with modify-might", () => {
    it(String.raw`should parse 'I enter ready.\n[Exhaust]: Give a unit +3 [Might] this turn.'`, () => {
      const result = parseAbilities(
        "I enter ready.\n[Exhaust]: Give a unit +3 [Might] this turn.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(2);
      // First ability: static enter ready
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          type: "static",
        }),
      );
      // Second ability: activated modify-might
      expect(result.abilities?.[1]).toEqual(
        expect.objectContaining({
          cost: expect.objectContaining({ exhaust: true }),
          effect: expect.objectContaining({
            amount: 3,
            type: "modify-might",
          }),
          type: "activated",
        }),
      );
    });
  });

  describe("token normalization", () => {
    it("should normalize [Exhaust] to :rb_exhaust: for cost parsing", () => {
      const result = parseAbilities("[Exhaust]: Draw 1.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          cost: expect.objectContaining({ exhaust: true }),
          type: "activated",
        }),
      );
    });

    it("should normalize [N] to :rb_energy_N: for cost parsing", () => {
      const result = parseAbilities("[2], [Exhaust]: Draw 1.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          cost: expect.objectContaining({ energy: 2, exhaust: true }),
          type: "activated",
        }),
      );
    });

    it("should normalize [fury] to :rb_rune_fury: for cost parsing", () => {
      const result = parseAbilities("[fury], [Exhaust]: Draw 1.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          cost: expect.objectContaining({ exhaust: true }),
          type: "activated",
        }),
      );
    });
  });
});
