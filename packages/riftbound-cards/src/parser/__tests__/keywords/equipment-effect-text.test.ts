/**
 * Equipment Effect Text (rules 136 / 150.2 / 718.3 / 719.1)
 *
 * An Equipment's rules text ([Equip] …) and its Effect Text box are parsed
 * apart; the effect-text abilities come back in the shape they have on the
 * equipped unit and flagged `effectText: true`.
 */

import { describe, expect, it } from "bun:test";
import {
  conferEffectTextAbilities,
  parseEquipmentText,
  withoutEffectText,
} from "../../equipment";
import { parseAbilities } from "../../index";

const EQUIP_FURY = "[Equip] [fury] ([fury]: Attach this to a unit you control.)";
const equipKeyword = (domain: string) => ({
  cost: { power: [domain] },
  keyword: "Equip",
  type: "keyword",
});

describe("Equipment effect text", () => {
  describe("withoutEffectText", () => {
    it("strips the trailing effect-text box from the combined printed text", () => {
      const effect = "[Assault 2] (+2 [Might] while I'm an attacker.)";
      expect(withoutEffectText(`${EQUIP_FURY}\n${effect}`, effect)).toBe(EQUIP_FURY);
    });

    it("leaves text alone when there is no effect text or it is not the tail", () => {
      expect(withoutEffectText(EQUIP_FURY, undefined)).toBe(EQUIP_FURY);
      expect(withoutEffectText(EQUIP_FURY, "When I hold, score 1 point.")).toBe(EQUIP_FURY);
    });

    it("returns empty own text when the card prints only effect text", () => {
      expect(withoutEffectText("[Tank]", "[Tank]")).toBe("");
    });
  });

  describe("keyword bars are granted to the equipped unit (static grant-keyword on self)", () => {
    it("Serrated Dirk: '[Assault 2]' → static grant Assault 2, flagged effectText", () => {
      const result = parseEquipmentText(EQUIP_FURY, "[Assault 2] (+2 [Might] while I'm an attacker.)");
      expect(result.success).toBe(true);
      expect(result.abilities).toEqual([
        equipKeyword("fury"),
        {
          effect: { keyword: "Assault", target: "self", type: "grant-keyword", value: 2 },
          effectText: true,
          type: "static",
        },
      ] as never);
    });

    it("Cloth Armor: '[Shield 2]' keeps its value; Doran's Shield '[Tank]' / Boots '[Ganking]' have none", () => {
      expect(
        parseEquipmentText("", "[Shield 2] (+2 [Might] while I'm a defender.)").abilities,
      ).toEqual([
        {
          effect: { keyword: "Shield", target: "self", type: "grant-keyword", value: 2 },
          effectText: true,
          type: "static",
        },
      ] as never);
      expect(
        parseEquipmentText("", "[Tank] (I must be assigned combat damage first.)").abilities,
      ).toEqual([
        { effect: { keyword: "Tank", target: "self", type: "grant-keyword" }, effectText: true, type: "static" },
      ] as never);
      expect(
        parseEquipmentText("", "[Ganking] (I can move from battlefield to battlefield.)").abilities,
      ).toEqual([
        { effect: { keyword: "Ganking", target: "self", type: "grant-keyword" }, effectText: true, type: "static" },
      ] as never);
    });

    it("Hexdrinker: '[Deflect]' defaults to value 1", () => {
      expect(
        parseEquipmentText("", "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)").abilities,
      ).toEqual([
        {
          effect: { keyword: "Deflect", target: "self", type: "grant-keyword", value: 1 },
          effectText: true,
          type: "static",
        },
      ] as never);
    });
  });

  describe("triggered effect text is the wearer's trigger", () => {
    it("Trinity Force: 'When I hold, score 1 point.'", () => {
      const result = parseEquipmentText("[Equip] [body] ([body]: Attach this to a unit you control.)", "When I hold, score 1 point.");
      expect(result.abilities).toEqual([
        equipKeyword("body"),
        {
          effect: { amount: 1, type: "score" },
          effectText: true,
          trigger: { event: "hold", on: "self" },
          type: "triggered",
        },
      ] as never);
    });

    it("Recurve Bow: 'When I attack or defend, deal 2 to an enemy unit here.'", () => {
      const [, bow] = parseEquipmentText(EQUIP_FURY, "When I attack or defend, deal 2 to an enemy unit here.").abilities ?? [];
      expect(bow).toEqual({
        effect: {
          amount: 2,
          target: { controller: "enemy", location: "here", type: "unit" },
          type: "damage",
        },
        effectText: true,
        trigger: { event: "attack-or-defend", on: "self" },
        type: "triggered",
      } as never);
    });

    it("trigger keywords keep only their triggered form, named after the keyword (Sacred Shears, Hunter's Machete)", () => {
      expect(
        parseEquipmentText("", "[Deathknell] — Draw 1. (When I die, get the effect.)").abilities,
      ).toEqual([
        {
          effect: { amount: 1, type: "draw" },
          effectText: true,
          name: "Deathknell",
          trigger: { event: "die", on: "self" },
          type: "triggered",
        },
      ] as never);
      expect(
        parseEquipmentText("", "[Hunt] (When I conquer or hold, gain 1 XP.)").abilities,
      ).toEqual([
        {
          effect: { amount: 1, type: "gain-xp" },
          effectText: true,
          name: "Hunt",
          trigger: { event: "conquer", on: "self" },
          type: "triggered",
        },
        {
          effect: { amount: 1, type: "gain-xp" },
          effectText: true,
          name: "Hunt",
          trigger: { event: "hold", on: "self" },
          type: "triggered",
        },
      ] as never);
    });
  });

  describe("static effect text stays a static, flagged", () => {
    it("Shurelya's Requiem: 'Your units here have [Ganking].'", () => {
      const [ability] = parseEquipmentText("", "Your units here have [Ganking]. (We can move from battlefield to battlefield.)").abilities ?? [];
      expect(ability).toMatchObject({
        effect: { keyword: "Ganking", type: "grant-keyword" },
        effectText: true,
        type: "static",
      });
    });

    it("Soul Sword: '[Level 3][>] I have an additional +1 [Might].' — 'an additional' is plain +N", () => {
      expect(
        parseEquipmentText("", "[Level 3][>] I have an additional +1 [Might]. (While you have 3+ XP, get the effect.)").abilities,
      ).toEqual([
        {
          condition: { threshold: 3, type: "while-level" },
          effect: { amount: 1, target: "self", type: "modify-might" },
          effectText: true,
          type: "static",
        },
      ] as never);
    });

    it("Hand Hammer: 'while I'm at a battlefield with exactly one other unit you control' keeps the count qualifier", () => {
      const [ability] = parseEquipmentText("", "I have +2 [Might] while I'm at a battlefield with exactly one other unit you control.").abilities ?? [];
      expect(ability).toEqual({
        condition: {
          conditions: [
            { type: "while-at-battlefield" },
            {
              target: { controller: "friendly", excludeSelf: true, quantity: { exactly: 1 }, type: "unit" },
              type: "exists-here",
            },
          ],
          type: "and",
        },
        effect: { amount: 2, target: "self", type: "modify-might" },
        effectText: true,
        type: "static",
      } as never);
    });
  });

  describe("robustness", () => {
    it("an unparseable effect sentence never hides the [Equip] cost", () => {
      const result = parseEquipmentText(EQUIP_FURY, "My hold effects are also conquer effects, and vice versa.");
      expect(result.success).toBe(true);
      expect(result.abilities).toEqual([equipKeyword("fury")] as never);
    });

    it("conferEffectTextAbilities flags every other ability kind unchanged", () => {
      const parsed = parseAbilities("If a friendly unit would die, kill this instead.").abilities ?? [];
      const conferred = conferEffectTextAbilities(parsed);
      expect(conferred).toHaveLength(parsed.length);
      for (const a of conferred) {
        expect(a).toMatchObject({ effectText: true });
      }
    });
  });
});
