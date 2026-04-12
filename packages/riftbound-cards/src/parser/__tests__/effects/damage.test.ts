/**
 * Parser tests for damage effects
 *
 * Tests for parsing abilities that deal damage.
 */

import { describe, expect, it } from "bun:test";
import { parseAbilities } from "../../index";
import { Effects } from "../helpers";

describe("Effect: Damage", () => {
  describe("fixed damage", () => {
    it("should parse 'Deal 2 to a unit.'", () => {
      const result = parseAbilities("Deal 2 to a unit.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 2,
            type: "damage",
          }),
          type: "spell",
        }),
      );
    });

    it("should parse 'Deal 3 to a unit at a battlefield.'", () => {
      const result = parseAbilities("Deal 3 to a unit at a battlefield.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
    });
  });

  describe("split damage", () => {
    it("should parse 'Deal 5 damage split among any number of enemy units here.'", () => {
      const result = parseAbilities("Deal 5 damage split among any number of enemy units here.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 5,
            split: true,
            type: "damage",
          }),
          type: "spell",
        }),
      );
    });
  });

  describe("damage to all", () => {
    it("should parse 'Deal 1 to all units at battlefields.'", () => {
      const result = parseAbilities("Deal 1 to all units at battlefields.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
    });

    it("should parse 'Deal 4 to all units at my battlefield.'", () => {
      const result = parseAbilities("Deal 4 to all units at my battlefield.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
    });
  });

  describe("damage equal to might", () => {
    it("should parse 'Deal damage equal to my Might to an enemy unit.'", () => {
      const result = parseAbilities("Deal damage equal to my Might to an enemy unit.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: { might: "self" },
            type: "damage",
          }),
          type: "spell",
        }),
      );
    });

    it("should parse 'deal damage equal to my Might to an enemy unit here.'", () => {
      const result = parseAbilities("deal damage equal to my Might to an enemy unit here.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: { might: "self" },
            target: expect.objectContaining({
              controller: "enemy",
              location: "here",
              type: "unit",
            }),
            type: "damage",
          }),
        }),
      );
    });

    it("should parse 'Deal damage equal to my Might to an enemy unit in a base.'", () => {
      const result = parseAbilities("Deal damage equal to my Might to an enemy unit in a base.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: { might: "self" },
            target: expect.objectContaining({
              controller: "enemy",
              location: "base",
              type: "unit",
            }),
            type: "damage",
          }),
        }),
      );
    });

    it("should parse 'Deal damage equal to its Might to an enemy unit.'", () => {
      const result = parseAbilities("Deal damage equal to its Might to an enemy unit.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: { might: "self" },
            type: "damage",
          }),
        }),
      );
    });

    it("should parse 'deal damage equal to my [Assault] to an enemy unit here.'", () => {
      const result = parseAbilities("deal damage equal to my [Assault] to an enemy unit here.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: { might: "self" },
            target: expect.objectContaining({
              controller: "enemy",
              location: "here",
              type: "unit",
            }),
            type: "damage",
          }),
        }),
      );
    });
  });

  describe("damage to an enemy unit", () => {
    it("should parse 'Deal 4 to an enemy unit.'", () => {
      const result = parseAbilities("Deal 4 to an enemy unit.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 4,
            target: expect.objectContaining({
              controller: "enemy",
              type: "unit",
            }),
            type: "damage",
          }),
        }),
      );
    });

    it("should parse 'Deal 2 to a unit at a battlefield.'", () => {
      const result = parseAbilities("Deal 2 to a unit at a battlefield.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 2,
            target: expect.objectContaining({
              location: "battlefield",
              type: "unit",
            }),
            type: "damage",
          }),
        }),
      );
    });
  });

  describe("damage with quantity", () => {
    it("should parse 'Deal 1 to up to three units at the same location.'", () => {
      const result = parseAbilities("Deal 1 to up to three units at the same location.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 1,
            target: expect.objectContaining({
              quantity: { upTo: 3 },
              type: "unit",
            }),
            type: "damage",
          }),
        }),
      );
    });

    it("should parse 'Deal 3 to a unit.'", () => {
      const result = parseAbilities("Deal 3 to a unit.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 3,
            type: "damage",
          }),
        }),
      );
    });
  });

  describe("damage to all enemy units", () => {
    it("should parse 'Deal 12 to ALL units at battlefields.'", () => {
      const result = parseAbilities("Deal 12 to ALL units at battlefields.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 12,
            target: expect.objectContaining({
              location: "battlefield",
              quantity: "all",
              type: "unit",
            }),
            type: "damage",
          }),
        }),
      );
    });

    it("should parse 'Deal damage equal to its Might to all enemy units at a battlefield.'", () => {
      const result = parseAbilities(
        "Deal damage equal to its Might to all enemy units at a battlefield.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: { might: "self" },
            target: expect.objectContaining({
              controller: "enemy",
              location: "battlefield",
              quantity: "all",
              type: "unit",
            }),
            type: "damage",
          }),
        }),
      );
    });
  });

  describe("damage to all enemy units at location", () => {
    it("should parse 'Deal 3 to all enemy units at a battlefield.'", () => {
      const result = parseAbilities("Deal 3 to all enemy units at a battlefield.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 3,
            target: expect.objectContaining({
              controller: "enemy",
              location: "battlefield",
              quantity: "all",
              type: "unit",
            }),
            type: "damage",
          }),
        }),
      );
    });

    it("should parse 'deal 3 to all enemy units here.'", () => {
      const result = parseAbilities("deal 3 to all enemy units here.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 3,
            target: expect.objectContaining({
              controller: "enemy",
              location: "here",
              quantity: "all",
              type: "unit",
            }),
            type: "damage",
          }),
        }),
      );
    });

    it("should parse 'Deal 4 to all units at my battlefield.'", () => {
      const result = parseAbilities("Deal 4 to all units at my battlefield.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 4,
            target: expect.objectContaining({
              location: "battlefield",
              quantity: "all",
              type: "unit",
            }),
            type: "damage",
          }),
        }),
      );
    });
  });

  describe("damage with 'each of' phrasing", () => {
    it("should parse 'Deal 6 to each of up to two units.'", () => {
      const result = parseAbilities("Deal 6 to each of up to two units.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 6,
            target: expect.objectContaining({
              quantity: { upTo: 2 },
              type: "unit",
            }),
            type: "damage",
          }),
        }),
      );
    });
  });

  describe("kill all damaged enemy units", () => {
    it("should parse 'kill all damaged enemy units here.' as a kill effect", () => {
      const result = parseAbilities("kill all damaged enemy units here.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              controller: "enemy",
              filter: "damaged",
              location: "here",
              quantity: "all",
              type: "unit",
            }),
            type: "kill",
          }),
        }),
      );
    });
  });
});
