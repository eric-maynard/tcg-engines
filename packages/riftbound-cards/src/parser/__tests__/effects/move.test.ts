/**
 * Parser tests for move effects
 *
 * Tests for parsing abilities that move units.
 */

import { describe, expect, it } from "bun:test";
import { parseAbilities } from "../../index";
import { Effects } from "../helpers";

describe("Effect: Move", () => {
  describe("move friendly unit", () => {
    it("should parse 'Move a friendly unit.'", () => {
      const result = parseAbilities("Move a friendly unit.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            type: "move",
          }),
          type: "spell",
        }),
      );
    });

    it("should parse 'Move a friendly unit and ready it.'", () => {
      const result = parseAbilities("Move a friendly unit and ready it.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
    });
  });

  describe("move to specific location", () => {
    it("should parse 'Move a unit from a battlefield to its base.'", () => {
      const result = parseAbilities("Move a unit from a battlefield to its base.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            from: "battlefield",
            to: "base",
            type: "move",
          }),
          type: "spell",
        }),
      );
    });

    it("should parse 'Move up to 2 friendly units to base.'", () => {
      const result = parseAbilities("Move up to 2 friendly units to base.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
    });
  });

  describe("move enemy unit", () => {
    it("should parse 'Move an enemy unit to here.'", () => {
      const result = parseAbilities("Move an enemy unit to here.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
    });

    it("should parse 'Move an enemy unit to a location where there's a unit with the same controller.'", () => {
      const result = parseAbilities(
        "Move an enemy unit to a location where there's a unit with the same controller.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
    });
  });

  describe("additional move patterns", () => {
    it("should parse swap 'Move me to its location and it to my original location.'", () => {
      const result = parseAbilities(
        "Move me to its location and it to my original location.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: "self",
            to: "here",
            type: "move",
          }),
        }),
      );
    });

    it("should parse 'Move a unit at a battlefield to its base.' (no controller)", () => {
      const result = parseAbilities("Move a unit at a battlefield to its base.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            to: "base",
            type: "move",
          }),
        }),
      );
    });

    it("should parse 'Move another friendly unit to a battlefield.'", () => {
      const result = parseAbilities("Move another friendly unit to a battlefield.");

      expect(result.success).toBe(true);
      expect((result.abilities?.[0] as { effect: { target: { excludeSelf: boolean } } }).effect.target.excludeSelf).toBe(true);
    });

    it("should parse 'Move a friendly unit to its base.' (possessive)", () => {
      const result = parseAbilities("Move a friendly unit to its base.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            to: "base",
            type: "move",
          }),
        }),
      );
    });

    it("should parse 'Move a friendly unit at a battlefield to its base.'", () => {
      const result = parseAbilities("Move a friendly unit at a battlefield to its base.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            to: "base",
            type: "move",
          }),
        }),
      );
    });

    it("should parse 'Move up to one enemy unit from here to its base.'", () => {
      const result = parseAbilities("Move up to one enemy unit from here to its base.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            from: "here",
            to: "base",
            type: "move",
          }),
        }),
      );
    });
  });
});
