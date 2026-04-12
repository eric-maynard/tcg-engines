/**
 * Parser tests for banish effects
 *
 * Tests for parsing abilities that banish units, gear, or cards.
 */

import { describe, expect, it } from "bun:test";
import { parseAbilities } from "../../index";

describe("Effect: Banish", () => {
  describe("banish target unit", () => {
    it("should parse 'Banish a unit.'", () => {
      const result = parseAbilities("Banish a unit.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({ type: "unit" }),
            type: "banish",
          }),
        }),
      );
    });

    it("should parse 'Banish an enemy unit.'", () => {
      const result = parseAbilities("Banish an enemy unit.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              controller: "enemy",
              type: "unit",
            }),
            type: "banish",
          }),
        }),
      );
    });

    it("should parse 'Banish a friendly unit.'", () => {
      const result = parseAbilities("Banish a friendly unit.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              controller: "friendly",
              type: "unit",
            }),
            type: "banish",
          }),
        }),
      );
    });

    it("should parse 'Banish a friendly unit at a battlefield.'", () => {
      const result = parseAbilities("Banish a friendly unit at a battlefield.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              controller: "friendly",
              location: "battlefield",
            }),
            type: "banish",
          }),
        }),
      );
    });

    it("should parse 'Banish all damaged units.'", () => {
      const result = parseAbilities("Banish all damaged units.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              filter: "damaged",
              quantity: "all",
            }),
            type: "banish",
          }),
        }),
      );
    });
  });

  describe("banish self", () => {
    it("should parse 'Banish me.'", () => {
      const result = parseAbilities("Banish me.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: "self",
            type: "banish",
          }),
        }),
      );
    });

    it("should parse 'Banish this.'", () => {
      const result = parseAbilities("Banish this.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: "self",
            type: "banish",
          }),
        }),
      );
    });

    it("should parse 'Banish it.' (trigger source)", () => {
      const result = parseAbilities("Banish it.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            type: "banish",
          }),
        }),
      );
    });
  });

  describe("banish from trash", () => {
    it("should parse 'Banish a card from your trash.'", () => {
      const result = parseAbilities("Banish a card from your trash.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({ location: "trash" }),
            type: "banish",
          }),
        }),
      );
    });

    it("should parse 'Banish all units from your trash.'", () => {
      const result = parseAbilities("Banish all units from your trash.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              location: "trash",
              quantity: "all",
              type: "unit",
            }),
            type: "banish",
          }),
        }),
      );
    });
  });
});
