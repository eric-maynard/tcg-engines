/**
 * Parser tests for ready effects
 *
 * Tests for parsing abilities that ready units or other permanents.
 */

import { describe, expect, it } from "bun:test";
import { parseAbilities } from "../../index";

describe("Effect: Ready", () => {
  describe("ready self", () => {
    it("should parse 'Ready me.'", () => {
      const result = parseAbilities("Ready me.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: "self",
            type: "ready",
          }),
          type: "spell",
        }),
      );
    });
  });

  describe("ready basic targets", () => {
    it("should parse 'Ready a unit.'", () => {
      const result = parseAbilities("Ready a unit.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({ type: "unit" }),
            type: "ready",
          }),
        }),
      );
    });

    it("should parse 'Ready a friendly gear.'", () => {
      const result = parseAbilities("Ready a friendly gear.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({ controller: "friendly", type: "gear" }),
            type: "ready",
          }),
        }),
      );
    });

    it("should parse 'Ready it.'", () => {
      const result = parseAbilities("Ready it.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({ type: "unit" }),
            type: "ready",
          }),
        }),
      );
    });
  });

  describe("ready possessive targets", () => {
    it("should parse 'Ready your units.'", () => {
      const result = parseAbilities("Ready your units.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              controller: "friendly",
              quantity: "all",
              type: "unit",
            }),
            type: "ready",
          }),
        }),
      );
    });

    it("should parse 'Ready your runes.'", () => {
      const result = parseAbilities("Ready your runes.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              controller: "friendly",
              quantity: "all",
              type: "rune",
            }),
            type: "ready",
          }),
        }),
      );
    });

    it("should parse 'Ready your legend.'", () => {
      const result = parseAbilities("Ready your legend.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              controller: "friendly",
              type: "legend",
            }),
            type: "ready",
          }),
        }),
      );
    });
  });

  describe("ready with 'another' (excludeSelf)", () => {
    it("should parse 'Ready another unit.'", () => {
      const result = parseAbilities("Ready another unit.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              excludeSelf: true,
              type: "unit",
            }),
            type: "ready",
          }),
        }),
      );
    });

    it("should parse 'Ready another friendly Mech.'", () => {
      const result = parseAbilities("Ready another friendly Mech.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              controller: "friendly",
              excludeSelf: true,
              filter: { tag: "Mech" },
              type: "unit",
            }),
            type: "ready",
          }),
        }),
      );
    });

    it("should parse 'Ready another friendly Dragon.'", () => {
      const result = parseAbilities("Ready another friendly Dragon.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              controller: "friendly",
              excludeSelf: true,
              filter: { tag: "Dragon" },
              type: "unit",
            }),
            type: "ready",
          }),
        }),
      );
    });
  });

  describe("ready with 'up to N' quantity", () => {
    it("should parse 'Ready up to 2 runes.'", () => {
      const result = parseAbilities("Ready up to 2 runes.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              quantity: { upTo: 2 },
              type: "rune",
            }),
            type: "ready",
          }),
        }),
      );
    });

    it("should parse 'Ready up to 4 friendly runes.'", () => {
      const result = parseAbilities("Ready up to 4 friendly runes.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              controller: "friendly",
              quantity: { upTo: 4 },
              type: "rune",
            }),
            type: "ready",
          }),
        }),
      );
    });

    it("should parse 'Ready up to 3 friendly units.'", () => {
      const result = parseAbilities("Ready up to 3 friendly units.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              controller: "friendly",
              quantity: { upTo: 3 },
              type: "unit",
            }),
            type: "ready",
          }),
        }),
      );
    });

    it("should parse 'Ready up to two of them.'", () => {
      const result = parseAbilities("Ready up to two of them.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              quantity: { upTo: 2 },
              type: "unit",
            }),
            type: "ready",
          }),
        }),
      );
    });
  });

  describe("ready with 'all' quantity", () => {
    it("should parse 'Ready all friendly units here.'", () => {
      const result = parseAbilities("Ready all friendly units here.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              controller: "friendly",
              location: "here",
              quantity: "all",
              type: "unit",
            }),
            type: "ready",
          }),
        }),
      );
    });
  });

  describe("ready with tag-based targets", () => {
    it("should parse 'Ready a friendly Poro.'", () => {
      const result = parseAbilities("Ready a friendly Poro.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              controller: "friendly",
              filter: { tag: "Poro" },
              type: "unit",
            }),
            type: "ready",
          }),
        }),
      );
    });
  });

  describe("ready something else", () => {
    it("should parse 'You may ready something else that's exhausted.'", () => {
      const result = parseAbilities("You may ready something else that's exhausted.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
    });
  });

  describe("ready with additional effects", () => {
    it("should parse 'Ready a friendly unit. It deals damage equal to its Might to an enemy unit at a battlefield.'", () => {
      const result = parseAbilities(
        "Ready a friendly unit. It deals damage equal to its Might to an enemy unit at a battlefield.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
    });
  });
});
