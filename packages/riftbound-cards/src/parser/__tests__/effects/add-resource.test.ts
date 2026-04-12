/**
 * Parser tests for add-resource effects.
 *
 * Covers the `[Add]` effect used by Seal cards, legend runes, and various
 * effects that generate Energy or Power (domain) resources.
 */

import { describe, expect, it } from "bun:test";
import { parseAbilities } from "../../index";

describe("Effect: Add Resource", () => {
  describe("bare [Add] effects (as spell/triggered effect text)", () => {
    it("should parse '[Add] [rainbow].' as add-resource with rainbow power", () => {
      const result = parseAbilities("[Add] [rainbow].");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            power: ["rainbow"],
            type: "add-resource",
          }),
        }),
      );
    });

    it("should parse '[Add] [1].' as add-resource with 1 energy", () => {
      const result = parseAbilities("[Add] [1].");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            energy: 1,
            type: "add-resource",
          }),
        }),
      );
    });

    it("should parse '[Add] [fury].' with fury power", () => {
      const result = parseAbilities("[Add] [fury].");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            power: ["fury"],
            type: "add-resource",
          }),
        }),
      );
    });

    it("should parse '[Add] [calm].' with calm power", () => {
      const result = parseAbilities("[Add] [calm].");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            power: ["calm"],
            type: "add-resource",
          }),
        }),
      );
    });

    it("should parse '[Add] [1][rainbow].' combining energy and power", () => {
      const result = parseAbilities("[Add] [1][rainbow].");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            energy: 1,
            power: ["rainbow"],
            type: "add-resource",
          }),
        }),
      );
    });
  });

  describe("[Exhaust]: [Add] activated abilities", () => {
    it("should parse '[Exhaust]: [Add] [rainbow].' as activated add-resource", () => {
      const result = parseAbilities("[Exhaust]: [Add] [rainbow].");

      expect(result.success).toBe(true);
      const ability = result.abilities?.[0];
      expect(ability?.type).toBe("activated");
      expect(ability).toEqual(
        expect.objectContaining({
          cost: expect.objectContaining({ exhaust: true }),
          effect: expect.objectContaining({
            power: ["rainbow"],
            type: "add-resource",
          }),
        }),
      );
    });

    it("should parse Seal of Focus: '[Exhaust]: [Reaction] — [Add] [calm].'", () => {
      const result = parseAbilities("[Exhaust]: [Reaction] — [Add] [calm].");

      expect(result.success).toBe(true);
      const ability = result.abilities?.[0];
      expect(ability?.type).toBe("activated");
      expect(ability).toEqual(
        expect.objectContaining({
          cost: expect.objectContaining({ exhaust: true }),
          effect: expect.objectContaining({
            power: ["calm"],
            type: "add-resource",
          }),
          timing: "reaction",
        }),
      );
    });
  });

  describe("triggered add-resource", () => {
    it("should parse 'When I move, [Add] [1][rainbow].' as triggered add-resource", () => {
      const result = parseAbilities("When I move, [Add] [1][rainbow].");

      expect(result.success).toBe(true);
      // Find the triggered ability whose effect is an add-resource.
      const triggered = result.abilities?.find(
        (a) => (a as { type: string }).type === "triggered",
      ) as { effect: { type: string; energy?: number; power?: string[] } } | undefined;
      expect(triggered).toBeDefined();
      expect(triggered?.effect).toEqual(
        expect.objectContaining({
          energy: 1,
          power: ["rainbow"],
          type: "add-resource",
        }),
      );
    });
  });
});
