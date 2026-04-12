/**
 * Parser tests for exhaust-target effects
 *
 * Tests for parsing abilities that exhaust units or other permanents.
 * Note: This tests "Exhaust TARGET" as an effect, not the :rb_exhaust: activation cost.
 */

import { describe, expect, it } from "bun:test";
import { parseAbilities } from "../../index";

describe("Effect: Exhaust Target", () => {
  describe("exhaust self", () => {
    it("should parse 'Exhaust me.'", () => {
      const result = parseAbilities("Exhaust me.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: "self",
            type: "exhaust",
          }),
          type: "spell",
        }),
      );
    });
  });

  describe("exhaust basic targets", () => {
    it("should parse 'Exhaust a unit.'", () => {
      const result = parseAbilities("Exhaust a unit.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({ type: "unit" }),
            type: "exhaust",
          }),
        }),
      );
    });

    it("should parse 'Exhaust an enemy unit.'", () => {
      const result = parseAbilities("Exhaust an enemy unit.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({ controller: "enemy", type: "unit" }),
            type: "exhaust",
          }),
        }),
      );
    });

    it("should parse 'Exhaust a legend.'", () => {
      const result = parseAbilities("Exhaust a legend.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({ type: "legend" }),
            type: "exhaust",
          }),
        }),
      );
    });

    it("should parse 'Exhaust an enemy gear.'", () => {
      const result = parseAbilities("Exhaust an enemy gear.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({ controller: "enemy", type: "gear" }),
            type: "exhaust",
          }),
        }),
      );
    });

    it("should parse 'Exhaust a friendly rune.'", () => {
      const result = parseAbilities("Exhaust a friendly rune.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({ controller: "friendly", type: "rune" }),
            type: "exhaust",
          }),
        }),
      );
    });

    it("should parse 'Exhaust a friendly unit here.'", () => {
      const result = parseAbilities("Exhaust a friendly unit here.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              controller: "friendly",
              location: "here",
              type: "unit",
            }),
            type: "exhaust",
          }),
        }),
      );
    });

    it("should parse 'Exhaust an enemy legend.'", () => {
      const result = parseAbilities("Exhaust an enemy legend.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({ controller: "enemy", type: "legend" }),
            type: "exhaust",
          }),
        }),
      );
    });
  });

  describe("exhaust with 'all' quantity", () => {
    it("should parse 'Exhaust all enemy units here.'", () => {
      const result = parseAbilities("Exhaust all enemy units here.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              controller: "enemy",
              location: "here",
              quantity: "all",
              type: "unit",
            }),
            type: "exhaust",
          }),
        }),
      );
    });

    it("should parse 'Exhaust all friendly units.'", () => {
      const result = parseAbilities("Exhaust all friendly units.");

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
            type: "exhaust",
          }),
        }),
      );
    });

    it("should parse 'Exhaust all units here.'", () => {
      const result = parseAbilities("Exhaust all units here.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              location: "here",
              quantity: "all",
              type: "unit",
            }),
            type: "exhaust",
          }),
        }),
      );
    });

    it("should parse 'Exhaust all enemy gear.'", () => {
      const result = parseAbilities("Exhaust all enemy gear.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              controller: "enemy",
              quantity: "all",
              type: "gear",
            }),
            type: "exhaust",
          }),
        }),
      );
    });
  });

  describe("exhaust with 'you control'", () => {
    it("should parse 'Exhaust a unit you control.'", () => {
      const result = parseAbilities("Exhaust a unit you control.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              controller: "friendly",
              type: "unit",
            }),
            type: "exhaust",
          }),
        }),
      );
    });
  });

  describe("exhaust with 'another' (excludeSelf)", () => {
    it("should parse 'Exhaust another unit.'", () => {
      const result = parseAbilities("Exhaust another unit.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              excludeSelf: true,
              type: "unit",
            }),
            type: "exhaust",
          }),
        }),
      );
    });
  });
});
