/**
 * Smoke test: the Unleashed (Set 3 / Core Rules 2026-03-30) keyword forms
 * carried in real UNL card `rulesText` parse into the right structured
 * abilities — they don't crash the parser and they surface so the engine
 * can act on them.
 *
 * Rules: §822 Ambush, §823 Hunt, §824 Level (dependent keyword via `[>]`),
 * §809 Deflect.
 */

import { describe, expect, test } from "bun:test";
import { getAllCards } from "../data";
import { parseAbilities } from "../parser";

const UNL = () => getAllCards().filter((c) => c.setId === "UNL" && c.rulesText);

describe("UNL keyword smoke (rules 822/823/824/809)", () => {
  test("822: every [Ambush] card parses and yields an Ambush keyword ability", () => {
    const cards = UNL().filter((c) => c.rulesText!.includes("[Ambush]"));
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      const r = parseAbilities(card.rulesText!);
      expect(r.success).toBe(true);
      const hasAmbush = r.abilities?.some(
        (a) => (a as { keyword?: string }).keyword === "Ambush",
      );
      expect(hasAmbush, `${card.name} should expose an Ambush keyword ability`).toBe(true);
    }
  });

  test("823: every [Hunt] card parses and expands to a Hunt keyword + conquer/hold gain-xp triggers", () => {
    const cards = UNL().filter((c) => /\[Hunt(?:\s+\d+)?\]/.test(c.rulesText!));
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      const r = parseAbilities(card.rulesText!);
      expect(r.success).toBe(true);
      const abs = r.abilities ?? [];
      expect(
        abs.some((a) => (a as { keyword?: string }).keyword === "Hunt"),
        `${card.name} should expose a Hunt keyword ability`,
      ).toBe(true);
      const gainXpTriggers = abs.filter(
        (a) =>
          (a as { type?: string }).type === "triggered" &&
          (a as { effect?: { type?: string } }).effect?.type === "gain-xp" &&
          ["conquer", "hold"].includes(
            (a as { trigger?: { event?: string } }).trigger?.event ?? "",
          ),
      );
      expect(
        gainXpTriggers.length,
        `${card.name} should expand Hunt into conquer + hold gain-xp triggers`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  test("824: every [Level N][>] card parses and tags at least one ability with a while-level condition", () => {
    const cards = UNL().filter((c) => /\[Level\s+\d+\]/.test(c.rulesText!));
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      const r = parseAbilities(card.rulesText!);
      expect(r.success, `${card.name} parse`).toBe(true);
      const leveled = r.abilities?.some(
        (a) => (a as { condition?: { type?: string } }).condition?.type === "while-level",
      );
      expect(leveled, `${card.name} should have a while-level-gated ability`).toBe(true);
    }
  });

  test("809: every [Deflect] card parses and yields a Deflect keyword ability", () => {
    const cards = UNL().filter((c) => /\[Deflect(?:\s+\d+)?\]/.test(c.rulesText!));
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      const r = parseAbilities(card.rulesText!);
      expect(r.success, `${card.name} parse`).toBe(true);
      // Deflect may also appear as a granted keyword inside an effect; only
      // Require the keyword ability when [Deflect] starts the line.
      if (/^\[Deflect(?:\s+\d+)?\]/.test(card.rulesText!.trimStart())) {
        const hasDeflect = r.abilities?.some(
          (a) => (a as { keyword?: string }).keyword === "Deflect",
        );
        expect(hasDeflect, `${card.name} should expose a Deflect keyword ability`).toBe(true);
      }
    }
  });
});
