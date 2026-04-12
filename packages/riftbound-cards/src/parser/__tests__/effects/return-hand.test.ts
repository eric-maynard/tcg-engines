/**
 * Parser tests for return to hand effects
 *
 * Tests for parsing abilities that return cards to hand.
 */

import { describe, expect, it } from "bun:test";
import { parseAbilities } from "../../index";
import { Effects } from "../helpers";

describe("Effect: Return to Hand", () => {
  describe("return unit", () => {
    it("should parse 'Return a unit at a battlefield to its owner's hand.'", () => {
      const result = parseAbilities("Return a unit at a battlefield to its owner's hand.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            type: "return-to-hand",
          }),
          type: "spell",
        }),
      );
    });

    it("should parse 'Return me to my owner's hand.'", () => {
      const result = parseAbilities("Return me to my owner's hand.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
    });
  });

  describe("return gear", () => {
    it("should parse 'Return a gear to its owner's hand.'", () => {
      const result = parseAbilities("Return a gear to its owner's hand.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
    });
  });

  describe("return from trash", () => {
    it("should parse 'Return a unit from your trash to your hand.'", () => {
      const result = parseAbilities("Return a unit from your trash to your hand.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
    });
  });

  describe("return with conditions", () => {
    it("should parse 'Return a unit at a battlefield with 3 :rb_might: or less to its owner's hand.'", () => {
      const result = parseAbilities(
        "Return a unit at a battlefield with 3 :rb_might: or less to its owner's hand.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
    });
  });

  describe("additional return-to-hand patterns", () => {
    it("should parse 'Return me to my owner's hand.' as self target", () => {
      const result = parseAbilities("Return me to my owner's hand.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: "self",
            type: "return-to-hand",
          }),
        }),
      );
    });

    it("should parse 'Return a spell from your trash to your hand.'", () => {
      const result = parseAbilities("Return a spell from your trash to your hand.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              location: "trash",
              type: "spell",
            }),
            type: "return-to-hand",
          }),
        }),
      );
    });

    it("should parse 'Return a unit or gear from your trash to your hand.'", () => {
      const result = parseAbilities(
        "Return a unit or gear from your trash to your hand.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              location: "trash",
              type: "permanent",
            }),
            type: "return-to-hand",
          }),
        }),
      );
    });

    it("should parse tag-list 'Return a Bird, Cat, Dog, or Poro from your trash to your hand.'", () => {
      const result = parseAbilities(
        "Return a Bird, Cat, Dog, or Poro from your trash to your hand.",
      );

      expect(result.success).toBe(true);
      const {target} = (
        result.abilities?.[0] as {
          effect: { target: { filter: { tag: string }[] } };
        }
      ).effect;
      expect(target.filter).toEqual([
        { tag: "Bird" },
        { tag: "Cat" },
        { tag: "Dog" },
        { tag: "Poro" },
      ]);
    });

    it("should parse 'Return all units with 2 :rb_might: or less to their owners' hands.'", () => {
      const result = parseAbilities(
        "Return all units with 2 :rb_might: or less to their owners' hands.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              filter: { might: { lte: 2 } },
              quantity: "all",
              type: "unit",
            }),
            type: "return-to-hand",
          }),
        }),
      );
    });

    it("should parse 'Return all units and gear to their owners' hands.'", () => {
      const result = parseAbilities("Return all units and gear to their owners' hands.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              quantity: "all",
              type: "permanent",
            }),
            type: "return-to-hand",
          }),
        }),
      );
    });

    it("should parse compound 'Return another friendly unit and an enemy unit to their owners' hands.' as sequence", () => {
      const result = parseAbilities(
        "Return another friendly unit and an enemy unit to their owners' hands.",
      );

      expect(result.success).toBe(true);
      const {effect} = (
        result.abilities?.[0] as {
          effect: { type: string; effects?: unknown[] };
        }
      );
      expect(effect.type).toBe("sequence");
      expect(effect.effects).toHaveLength(2);
    });

    it("should parse 'pay [1] to return me to my owner's hand.' inside trigger context", () => {
      const result = parseAbilities(
        "When I conquer, you may pay [1] to return me to my owner's hand.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: "self",
            type: "return-to-hand",
          }),
          type: "triggered",
        }),
      );
    });
  });
});
