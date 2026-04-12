/**
 * Parser tests for discard effects
 *
 * Tests for parsing abilities that discard cards.
 */

import { describe, expect, it } from "bun:test";
import { parseAbilities } from "../../index";

describe("Effect: Discard", () => {
  describe("fixed discard", () => {
    it("should parse 'Discard 1.'", () => {
      const result = parseAbilities("Discard 1.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 1,
            type: "discard",
          }),
          type: "spell",
        }),
      );
    });

    it("should parse 'Discard 2.'", () => {
      const result = parseAbilities("Discard 2.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 2,
            type: "discard",
          }),
        }),
      );
    });

    it("should parse 'discard a card.'", () => {
      const result = parseAbilities("discard a card.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 1,
            type: "discard",
          }),
        }),
      );
    });

    it("should parse lowercase 'discard 1.'", () => {
      const result = parseAbilities("discard 1.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 1,
            type: "discard",
          }),
        }),
      );
    });
  });

  describe("discard then draw", () => {
    it("should parse 'Discard 2, then draw 2.'", () => {
      const result = parseAbilities("Discard 2, then draw 2.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 2,
            then: expect.objectContaining({
              amount: 2,
              type: "draw",
            }),
            type: "discard",
          }),
        }),
      );
    });

    it("should parse 'discard 1, then draw 1.'", () => {
      const result = parseAbilities("discard 1, then draw 1.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 1,
            then: expect.objectContaining({
              amount: 1,
              type: "draw",
            }),
            type: "discard",
          }),
        }),
      );
    });

    it("should parse 'Each player discards their hand, then draws 4.'", () => {
      const result = parseAbilities("Each player discards their hand, then draws 4.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: "hand",
            player: "each",
            then: expect.objectContaining({
              amount: 4,
              player: "each",
              type: "draw",
            }),
            type: "discard",
          }),
        }),
      );
    });
  });

  describe("opponent discard", () => {
    it("should parse 'They discard 1.'", () => {
      const result = parseAbilities("They discard 1.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 1,
            player: "opponent",
            type: "discard",
          }),
        }),
      );
    });
  });

  describe("discard in triggered abilities", () => {
    it("should parse 'When you play me, discard 1.'", () => {
      const result = parseAbilities("When you play me, discard 1.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 1,
            type: "discard",
          }),
          trigger: expect.objectContaining({
            event: "play-self",
          }),
          type: "triggered",
        }),
      );
    });

    it("should parse 'When I move to a battlefield, discard 1.'", () => {
      const result = parseAbilities("When I move to a battlefield, discard 1.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 1,
            type: "discard",
          }),
          trigger: expect.objectContaining({
            event: "move-to-battlefield",
            on: "self",
          }),
          type: "triggered",
        }),
      );
    });

    it("should parse 'When you play me, discard 1, then draw 1.'", () => {
      const result = parseAbilities("When you play me, discard 1, then draw 1.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 1,
            then: expect.objectContaining({
              amount: 1,
              type: "draw",
            }),
            type: "discard",
          }),
          trigger: expect.objectContaining({
            event: "play-self",
          }),
          type: "triggered",
        }),
      );
    });

    it("should parse 'When I move, discard 1, then draw 1.'", () => {
      const result = parseAbilities("When I move, discard 1, then draw 1.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 1,
            then: expect.objectContaining({
              amount: 1,
              type: "draw",
            }),
            type: "discard",
          }),
          trigger: expect.objectContaining({
            event: "move",
            on: "self",
          }),
          type: "triggered",
        }),
      );
    });

    it("should parse '[Deathknell] - Discard 2, then draw 2.'", () => {
      const result = parseAbilities(
        "[Deathknell] — Discard 2, then draw 2. (When I die, get the effect.)",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          keyword: "Deathknell",
          type: "keyword",
        }),
      );
      // Verify the effect is a sequence with discard and draw
      const ability = result.abilities?.[0] as { effect?: { type: string; effects?: unknown[] } };
      expect(ability.effect?.type).toBe("sequence");
    });

    it("should parse 'When you discard me' trigger", () => {
      const result = parseAbilities("When you discard me, you may pay :rb_rune_fury: to play me.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          trigger: expect.objectContaining({
            event: "discard",
            on: "self",
          }),
          type: "triggered",
        }),
      );
    });

    it("should parse 'When you conquer here, discard 1, then draw 1.'", () => {
      const result = parseAbilities("When you conquer here, discard 1, then draw 1.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 1,
            then: expect.objectContaining({
              amount: 1,
              type: "draw",
            }),
            type: "discard",
          }),
          trigger: expect.objectContaining({
            event: "conquer",
            location: "here",
            on: "controller",
          }),
          type: "triggered",
        }),
      );
    });
  });

  describe("compound discard effects", () => {
    it("should parse 'discard 1 and draw 1.' as a sequence", () => {
      const result = parseAbilities("discard 1 and draw 1.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            effects: expect.arrayContaining([
              expect.objectContaining({ amount: 1, type: "discard" }),
              expect.objectContaining({ amount: 1, type: "draw" }),
            ]),
            type: "sequence",
          }),
        }),
      );
    });

    it("should parse 'When you play me, choose a player. They discard 1.'", () => {
      const result = parseAbilities("When you play me, choose a player. They discard 1.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 1,
            player: "opponent",
            type: "discard",
          }),
          trigger: expect.objectContaining({
            event: "play-self",
          }),
          type: "triggered",
        }),
      );
    });
  });
});
