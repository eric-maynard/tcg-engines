/**
 * Parser tests for kill effects
 *
 * Tests for parsing abilities that kill units or gear.
 */

import { describe, expect, it } from "bun:test";
import { parseAbilities } from "../../index";
import { Effects } from "../helpers";

describe("Effect: Kill", () => {
  describe("kill unit", () => {
    it("should parse 'Kill a unit at a battlefield.'", () => {
      const result = parseAbilities("Kill a unit at a battlefield.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            type: "kill",
          }),
          type: "spell",
        }),
      );
    });

    it("should parse 'Kill a unit at a battlefield with 2 :rb_might: or less.'", () => {
      const result = parseAbilities("Kill a unit at a battlefield with 2 :rb_might: or less.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
    });
  });

  describe("kill gear", () => {
    it("should parse 'Kill a gear.'", () => {
      const result = parseAbilities("Kill a gear.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            type: "kill",
          }),
          type: "spell",
        }),
      );
    });

    it("should parse 'Kill all gear.'", () => {
      const result = parseAbilities("Kill all gear.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
    });
  });

  describe("kill with conditions", () => {
    it("should parse 'Kill any number of units at a battlefield with total Might 4 or less.'", () => {
      const result = parseAbilities(
        "Kill any number of units at a battlefield with total Might 4 or less.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
    });
  });

  describe("kill friendly unit", () => {
    it("should parse 'Kill a friendly unit.'", () => {
      const result = parseAbilities("Kill a friendly unit.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              controller: "friendly",
              type: "unit",
            }),
            type: "kill",
          }),
        }),
      );
    });

    it("should parse 'Kill a friendly [Mighty] unit.'", () => {
      const result = parseAbilities("Kill a friendly [Mighty] unit.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              controller: "friendly",
              filter: "mighty",
              type: "unit",
            }),
            type: "kill",
          }),
        }),
      );
    });
  });

  describe("kill self", () => {
    it("should parse 'Kill me.'", () => {
      const result = parseAbilities("Kill me.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: "self",
            type: "kill",
          }),
        }),
      );
    });

    it("should parse 'Kill this.'", () => {
      const result = parseAbilities("Kill this.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: "self",
            type: "kill",
          }),
        }),
      );
    });
  });

  describe("kill with location", () => {
    it("should parse 'Kill an enemy unit here.'", () => {
      const result = parseAbilities("Kill an enemy unit here.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              controller: "enemy",
              location: "here",
              type: "unit",
            }),
            type: "kill",
          }),
        }),
      );
    });
  });

  describe("kill with damaged filter", () => {
    it("should parse 'kill all damaged enemy units here.'", () => {
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

  describe("each player kills", () => {
    it("should parse 'Each player kills one of their units.'", () => {
      const result = parseAbilities("Each player kills one of their units.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            player: "each",
            target: expect.objectContaining({
              type: "unit",
            }),
            type: "kill",
          }),
        }),
      );
    });

    it("should parse 'Each player kills one of their gear.'", () => {
      const result = parseAbilities("Each player kills one of their gear.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            player: "each",
            target: expect.objectContaining({
              type: "gear",
            }),
            type: "kill",
          }),
        }),
      );
    });
  });

  describe("kill with quantity", () => {
    it("should parse 'kill up to one gear.'", () => {
      const result = parseAbilities("kill up to one gear.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
              quantity: { upTo: 1 },
              type: "gear",
            }),
            type: "kill",
          }),
        }),
      );
    });
  });

  describe("kill self to effect (sequence)", () => {
    it("should parse 'you may kill me to move an attacking unit to its base.'", () => {
      const result = parseAbilities("you may kill me to move an attacking unit to its base.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            effects: [
              expect.objectContaining({
                target: "self",
                type: "kill",
              }),
              expect.objectContaining({
                target: expect.objectContaining({
                  filter: { state: "attacking" },
                  type: "unit",
                }),
                to: "base",
                type: "move",
              }),
            ],
            type: "sequence",
          }),
        }),
      );
    });
  });

  describe("kill all units", () => {
    it("should parse 'Kill all units.'", () => {
      const result = parseAbilities("Kill all units.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            target: expect.objectContaining({
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
