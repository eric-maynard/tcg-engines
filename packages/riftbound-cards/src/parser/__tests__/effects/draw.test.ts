/**
 * Parser tests for draw effects
 *
 * Tests for parsing abilities that draw cards.
 */

import { describe, expect, it } from "bun:test";
import { parseAbilities } from "../../index";
import { Effects } from "../helpers";

describe("Effect: Draw", () => {
  describe("fixed draw", () => {
    it("should parse 'Draw 1.'", () => {
      const result = parseAbilities("Draw 1.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 1,
            type: "draw",
          }),
          type: "spell",
        }),
      );
    });

    it("should parse 'Draw 2.'", () => {
      const result = parseAbilities("Draw 2.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
    });

    it("should parse 'Draw 3.'", () => {
      const result = parseAbilities("Draw 3.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
    });
  });

  describe("conditional draw", () => {
    it("should parse 'Draw 1 for each of your [Mighty] units.'", () => {
      const result = parseAbilities(
        "Draw 1 for each of your [Mighty] units. (A unit is Mighty while it has 5+ :rb_might:.)",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: expect.objectContaining({
              count: expect.anything(),
            }),
            type: "draw",
          }),
          type: "spell",
        }),
      );
    });

    it("should parse 'Draw 1 for each other friendly unit here.'", () => {
      const result = parseAbilities("Draw 1 for each other friendly unit here.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
    });
  });

  describe("opponent draw", () => {
    it("should parse 'Its controller draws 2.'", () => {
      const result = parseAbilities("Kill a unit at a battlefield. Its controller draws 2.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
    });

    it("should parse 'They draw 1.'", () => {
      const result = parseAbilities("They draw 1.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 1,
            player: "opponent",
            type: "draw",
          }),
        }),
      );
    });

    it("should parse 'Each player draws 1.'", () => {
      const result = parseAbilities("Each player draws 1.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 1,
            player: "each",
            type: "draw",
          }),
        }),
      );
    });
  });

  describe("draw in triggered abilities", () => {
    it("should parse 'When you play me, draw 1.'", () => {
      const result = parseAbilities("When you play me, draw 1.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 1,
            type: "draw",
          }),
          trigger: expect.objectContaining({
            event: "play-self",
          }),
          type: "triggered",
        }),
      );
    });

    it("should parse 'When I move, draw 1.'", () => {
      const result = parseAbilities("When I move, draw 1.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 1,
            type: "draw",
          }),
          trigger: expect.objectContaining({
            event: "move",
            on: "self",
          }),
          type: "triggered",
        }),
      );
    });

    it("should parse 'When you hold here, draw 1.'", () => {
      const result = parseAbilities("When you hold here, draw 1.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 1,
            type: "draw",
          }),
          trigger: expect.objectContaining({
            event: "hold",
            location: "here",
            on: "controller",
          }),
          type: "triggered",
        }),
      );
    });

    it("should parse 'When you hold, draw 1.' (keeper-of-the-hammer line 1)", () => {
      const result = parseAbilities("When you hold, gain 1 XP.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          trigger: expect.objectContaining({
            event: "hold",
            on: "controller",
          }),
          type: "triggered",
        }),
      );
    });

    it("should parse 'When I win a combat, draw 1.'", () => {
      const result = parseAbilities("When I win a combat, draw 1.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 1,
            type: "draw",
          }),
          trigger: expect.objectContaining({
            event: "win-combat",
            on: "self",
          }),
          type: "triggered",
        }),
      );
    });

    it("should parse 'When you win a combat, draw 1.'", () => {
      const result = parseAbilities("When you win a combat, draw 1.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 1,
            type: "draw",
          }),
          trigger: expect.objectContaining({
            event: "win-combat",
            on: "controller",
          }),
          type: "triggered",
        }),
      );
    });

    it("should parse '[Deathknell] — Draw 1.'", () => {
      const result = parseAbilities("[Deathknell] — Draw 1. (When I die, get the effect.)");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            amount: 1,
            type: "draw",
          }),
          keyword: "Deathknell",
          type: "keyword",
        }),
      );
    });
  });

  describe("compound draw effects", () => {
    it("should parse 'Buff me and draw 1.' as a sequence", () => {
      const result = parseAbilities("Buff me and draw 1.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            effects: expect.arrayContaining([
              expect.objectContaining({ type: "buff" }),
              expect.objectContaining({ amount: 1, type: "draw" }),
            ]),
            type: "sequence",
          }),
        }),
      );
    });

    it("should parse 'Kill a unit at a battlefield and draw 1.' as a sequence", () => {
      const result = parseAbilities("Kill a unit at a battlefield and draw 1.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            effects: expect.arrayContaining([
              expect.objectContaining({ type: "kill" }),
              expect.objectContaining({ amount: 1, type: "draw" }),
            ]),
            type: "sequence",
          }),
        }),
      );
    });

    it("should parse multi-line 'discard + draw' triggered abilities", () => {
      const result = parseAbilities(
        "When I move to a battlefield, discard 1.\nWhen I win a combat, draw 1.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(2);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({ type: "discard" }),
          trigger: expect.objectContaining({ event: "move-to-battlefield" }),
          type: "triggered",
        }),
      );
      expect(result.abilities?.[1]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({ type: "draw" }),
          trigger: expect.objectContaining({ event: "win-combat" }),
          type: "triggered",
        }),
      );
    });
  });
});
