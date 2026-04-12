/**
 * Parser tests for recycle effects.
 *
 * Covers self-recycle ("Recycle this"/"Recycle me"), targeted board recycle
 * ("Recycle a rune"), quantified zone recycles ("Recycle 2 from your hand"),
 * and recycle-as-cost on activated abilities.
 */

import { describe, expect, it } from "bun:test";
import { parseAbilities } from "../../index";

describe("Effect: Recycle", () => {
  describe("self-recycle", () => {
    it("should parse 'Recycle me.'", () => {
      const result = parseAbilities("Recycle me.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            from: "self",
            target: "self",
            type: "recycle",
          }),
        }),
      );
    });

    it("should parse 'Recycle this.'", () => {
      const result = parseAbilities("Recycle this.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            from: "self",
            target: "self",
            type: "recycle",
          }),
        }),
      );
    });
  });

  describe("targeted board recycle", () => {
    it("should parse 'Recycle a rune.'", () => {
      const result = parseAbilities("Recycle a rune.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            from: "board",
            target: expect.objectContaining({ type: "rune" }),
            type: "recycle",
          }),
        }),
      );
    });

    it("should parse 'Recycle a unit.'", () => {
      const result = parseAbilities("Recycle a unit.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            from: "board",
            target: expect.objectContaining({ type: "unit" }),
            type: "recycle",
          }),
        }),
      );
    });

    it("should parse 'Recycle a gear.'", () => {
      const result = parseAbilities("Recycle a gear.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            from: "board",
            target: expect.objectContaining({ type: "gear" }),
            type: "recycle",
          }),
        }),
      );
    });

    it("should parse 'Recycle a card.' (defaults to trash source)", () => {
      const result = parseAbilities("Recycle a card.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            from: "trash",
            target: expect.objectContaining({ type: "card" }),
            type: "recycle",
          }),
        }),
      );
    });
  });

  describe("quantified zone recycle (effect)", () => {
    it("should parse 'Recycle 2 from your hand.'", () => {
      const result = parseAbilities("Recycle 2 from your hand.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 2,
            from: "hand",
            type: "recycle",
          }),
        }),
      );
    });

    it("should parse 'Recycle 3 from your trash.'", () => {
      const result = parseAbilities("Recycle 3 from your trash.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 3,
            from: "trash",
            type: "recycle",
          }),
        }),
      );
    });

    it("should parse 'Recycle up to 4 cards from your trash.'", () => {
      const result = parseAbilities("Recycle up to 4 cards from your trash.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 4,
            from: "trash",
            type: "recycle",
          }),
        }),
      );
    });
  });

  describe("recycle as activation cost", () => {
    it("should parse '[1], [Exhaust]: Recycle a rune.' as activated (rune-target recycle effect)", () => {
      const result = parseAbilities("[1], [Exhaust]: Recycle a rune.");

      expect(result.success).toBe(true);
      const ability = result.abilities?.[0];
      expect(ability?.type).toBe("activated");
      expect(ability).toEqual(
        expect.objectContaining({
          cost: expect.objectContaining({ energy: 1, exhaust: true }),
          effect: expect.objectContaining({
            from: "board",
            target: expect.objectContaining({ type: "rune" }),
            type: "recycle",
          }),
        }),
      );
    });

    it("should parse 'Recycle 3 from your trash: Draw 1.' as activated", () => {
      const result = parseAbilities("Recycle 3 from your trash: Draw 1.");

      expect(result.success).toBe(true);
      const ability = result.abilities?.[0];
      expect(ability?.type).toBe("activated");
      expect(ability).toEqual(
        expect.objectContaining({
          cost: expect.objectContaining({ recycle: 3 }),
          effect: expect.objectContaining({ amount: 1, type: "draw" }),
        }),
      );
    });

    it("should parse 'Recycle this: [Add] [rainbow].' (self-recycle cost + add-resource effect)", () => {
      const result = parseAbilities("Recycle this: [Add] [rainbow].");

      expect(result.success).toBe(true);
      const ability = result.abilities?.[0];
      expect(ability?.type).toBe("activated");
      expect(ability).toEqual(
        expect.objectContaining({
          cost: expect.objectContaining({
            recycle: expect.objectContaining({ amount: 1, from: "board" }),
          }),
          effect: expect.objectContaining({
            power: ["rainbow"],
            type: "add-resource",
          }),
        }),
      );
    });
  });
});
