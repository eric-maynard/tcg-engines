/**
 * Parser tests for grant-keyword effects
 *
 * Tests for parsing abilities that grant keywords to units.
 */

import { describe, expect, it } from "bun:test";
import { parseAbilities } from "../../index";

describe("Effect: Grant Keyword", () => {
  describe("give a unit a keyword", () => {
    it("should parse 'Give a unit [Assault].' (no duration)", () => {
      const result = parseAbilities("Give a unit [Assault].");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            keyword: "Assault",
            target: expect.objectContaining({ type: "unit" }),
            type: "grant-keyword",
          }),
        }),
      );
    });

    it("should parse 'Give a friendly unit [Tank] this turn.'", () => {
      const result = parseAbilities("Give a friendly unit [Tank] this turn.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            duration: "turn",
            keyword: "Tank",
            target: expect.objectContaining({
              controller: "friendly",
              type: "unit",
            }),
            type: "grant-keyword",
          }),
        }),
      );
    });

    it("should parse 'Give a unit [Assault 3] this turn.'", () => {
      const result = parseAbilities("Give a unit [Assault 3] this turn.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            duration: "turn",
            keyword: "Assault",
            type: "grant-keyword",
            value: 3,
          }),
        }),
      );
    });

    it("should parse 'Give me [Ganking] this turn.'", () => {
      const result = parseAbilities("Give me [Ganking] this turn.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            duration: "turn",
            keyword: "Ganking",
            target: "self",
            type: "grant-keyword",
          }),
        }),
      );
    });
  });

  describe("give to groups of units", () => {
    it("should parse 'Give your other units here [Shield] this turn.'", () => {
      const result = parseAbilities("Give your other units here [Shield] this turn.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            duration: "turn",
            keyword: "Shield",
            target: expect.objectContaining({
              controller: "friendly",
              excludeSelf: true,
              location: "here",
            }),
            type: "grant-keyword",
          }),
        }),
      );
    });

    it("should parse 'Give your units here [Ganking] this turn.'", () => {
      const result = parseAbilities("Give your units here [Ganking] this turn.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            duration: "turn",
            keyword: "Ganking",
            type: "grant-keyword",
          }),
        }),
      );
    });
  });

  describe("static auras (units have)", () => {
    it("should parse 'Friendly units have [Shield].' as static grant-keyword", () => {
      const result = parseAbilities("Friendly units have [Shield].");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            keyword: "Shield",
            type: "grant-keyword",
          }),
        }),
      );
    });

    it("should parse 'Other friendly units have [Vision].' as static grant-keyword", () => {
      const result = parseAbilities("Other friendly units have [Vision].");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            keyword: "Vision",
            type: "grant-keyword",
          }),
        }),
      );
    });
  });

  describe("'it has/gains' reference", () => {
    it("should parse 'It has [Evasive].'", () => {
      const result = parseAbilities("It has [Evasive].");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            keyword: "Evasive",
            type: "grant-keyword",
          }),
        }),
      );
    });

    it("should parse 'It gains [Shield 2] this combat.'", () => {
      const result = parseAbilities("It gains [Shield 2] this combat.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            duration: "combat",
            keyword: "Shield",
            type: "grant-keyword",
            value: 2,
          }),
        }),
      );
    });
  });

  describe("compound might + keyword", () => {
    it("should parse 'Give a unit +1 :rb_might: and [Tank] this turn.'", () => {
      const result = parseAbilities("Give a unit +1 :rb_might: and [Tank] this turn.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            effects: expect.arrayContaining([
              expect.objectContaining({
                amount: 1,
                duration: "turn",
                type: "modify-might",
              }),
              expect.objectContaining({
                duration: "turn",
                keyword: "Tank",
                type: "grant-keyword",
              }),
            ]),
            type: "sequence",
          }),
        }),
      );
    });

    it("should parse 'Give a unit [Assault 2] and [Ganking] this turn.'", () => {
      const result = parseAbilities("Give a unit [Assault 2] and [Ganking] this turn.");

      expect(result.success).toBe(true);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            effects: expect.arrayContaining([
              expect.objectContaining({
                duration: "turn",
                keyword: "Assault",
                type: "grant-keyword",
                value: 2,
              }),
              expect.objectContaining({
                duration: "turn",
                keyword: "Ganking",
                type: "grant-keyword",
              }),
            ]),
            type: "sequence",
          }),
        }),
      );
    });
  });
});
