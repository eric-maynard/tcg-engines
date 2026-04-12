/**
 * Parser tests for the UNL XP / Hunt / Level / Predict mechanic family.
 *
 * Covers Agent 3 (Wave 3) scope:
 *   - Gain/Spend XP effects
 *   - [Hunt N] keyword with auto-expansion to conquer/hold triggers
 *   - [Level N][>] static/ability gating
 *   - [Predict N] effects
 */

import { describe, expect, it } from "bun:test";
import { parseAbilities } from "../../index";

describe("UNL: Gain XP effect", () => {
  it("parses 'Gain 2 XP.'", () => {
    const r = parseAbilities("When you play me, gain 2 XP.");
    expect(r.success).toBe(true);
    const ab = r.abilities?.[0] as { effect: { type: string; amount: number } };
    expect(ab.effect.type).toBe("gain-xp");
    expect(ab.effect.amount).toBe(2);
  });

  it("parses 'Gain N XP for each TARGET.'", () => {
    const r = parseAbilities("When you play me, gain 1 XP for each friendly unit.");
    expect(r.success).toBe(true);
    const ab = r.abilities?.[0] as {
      effect: { type: string; amount: { count: unknown; multiplier?: number } };
    };
    expect(ab.effect.type).toBe("gain-xp");
    expect(ab.effect.amount.count).toBeDefined();
    // Multiplier omitted when 1
    expect(ab.effect.amount.multiplier).toBeUndefined();
  });

  it("parses 'Gain N XP for each TARGET.' with N>1 (multiplier)", () => {
    const r = parseAbilities("When you play me, gain 2 XP for each friendly unit.");
    expect(r.success).toBe(true);
    const ab = r.abilities?.[0] as {
      effect: { type: string; amount: { count: unknown; multiplier?: number } };
    };
    expect(ab.effect.type).toBe("gain-xp");
    expect(ab.effect.amount.count).toBeDefined();
    expect(ab.effect.amount.multiplier).toBe(2);
  });
});

describe("UNL: Hunt keyword expansion", () => {
  it("expands [Hunt N] into Hunt keyword plus two triggered gain-xp abilities", () => {
    const r = parseAbilities("[Hunt 2]");
    expect(r.success).toBe(true);
    const abs = r.abilities ?? [];
    // Keyword + two triggers (conquer, hold)
    expect(abs.length).toBe(3);
    expect(abs[0]).toMatchObject({ keyword: "Hunt", type: "keyword", value: 2 });
    expect(abs[1]).toMatchObject({
      effect: { amount: 2, type: "gain-xp" },
      trigger: { event: "conquer", on: "self" },
      type: "triggered",
    });
    expect(abs[2]).toMatchObject({
      effect: { amount: 2, type: "gain-xp" },
      trigger: { event: "hold", on: "self" },
      type: "triggered",
    });
  });

  it("bare [Hunt] defaults to value 1", () => {
    const r = parseAbilities("[Hunt] When you play me, gain 2 XP.");
    expect(r.success).toBe(true);
    const abs = r.abilities ?? [];
    expect(abs[0]).toMatchObject({ keyword: "Hunt", type: "keyword", value: 1 });
  });
});

describe("UNL: Level-gated abilities", () => {
  it("attaches a 'while-level' condition to abilities inside [Level N][>]", () => {
    const r = parseAbilities("[Level 3][>] I have +1 [Might] and enter ready.");
    expect(r.success).toBe(true);
    const abs = r.abilities ?? [];
    expect(abs.length).toBeGreaterThanOrEqual(1);
    const firstLevelAbility = abs.find(
      (a) => (a as { condition?: { type?: string } }).condition?.type === "while-level",
    );
    expect(firstLevelAbility).toBeDefined();
    const cond = (firstLevelAbility as { condition: { threshold: number; type: string } })
      .condition;
    expect(cond.threshold).toBe(3);
  });

  it("splits multiple [Level N] chunks and gates each independently", () => {
    const r = parseAbilities(
      "[Level 3][>] I cost [2][calm] less. [Level 6][>] I cost [4][calm][calm] less instead.",
    );
    expect(r.success).toBe(true);
    const abs = r.abilities ?? [];
    const thresholds = abs
      .map((a) => (a as { condition?: { threshold?: number } }).condition?.threshold)
      .filter((t): t is number => typeof t === "number");
    expect(thresholds).toContain(3);
    expect(thresholds).toContain(6);
  });

  it("parses [Hunt 2] + [Level 3] static together", () => {
    const r = parseAbilities("[Hunt 2] [Level 3][>] I have +1 [Might] and enter ready.");
    expect(r.success).toBe(true);
    const abs = r.abilities ?? [];
    // Hunt keyword + 2 hunt triggers + level-gated static
    expect(abs.length).toBeGreaterThanOrEqual(4);
    const huntKw = abs.find(
      (a) => (a as { keyword?: string }).keyword === "Hunt",
    );
    expect(huntKw).toBeDefined();
    const levelAbility = abs.find(
      (a) => (a as { condition?: { type?: string } }).condition?.type === "while-level",
    );
    expect(levelAbility).toBeDefined();
  });
});

describe("UNL: Predict effect", () => {
  it("parses [Predict N] as a predict effect", () => {
    const r = parseAbilities("[Predict 2].");
    expect(r.success).toBe(true);
    const ab = r.abilities?.[0] as { effect: { type: string; amount: number } };
    expect(ab.effect.type).toBe("predict");
    expect(ab.effect.amount).toBe(2);
  });

  it("recognizes [Predict N] as the effect inside a [Deathknell] keyword", () => {
    const r = parseAbilities("[Deathknell] [Predict 2].");
    expect(r.success).toBe(true);
    const abs = r.abilities ?? [];
    expect(abs[0]).toMatchObject({
      effect: { amount: 2, type: "predict" },
      keyword: "Deathknell",
      type: "keyword",
    });
  });
});

describe("UNL: Spend XP compound effects", () => {
  it("parses 'Spend N XP to EFFECT.' as a sequence", () => {
    const r = parseAbilities("Spend 3 XP to deal 5 to an enemy unit.");
    expect(r.success).toBe(true);
    const ab = r.abilities?.[0] as {
      effect: { type: string; effects: { type: string }[] };
    };
    expect(ab.effect.type).toBe("sequence");
    expect(ab.effect.effects[0].type).toBe("spend-xp");
    expect(ab.effect.effects[1].type).toBe("damage");
  });

  it("parses Kha'Zix, Evolving Hunter triggered ability", () => {
    const r = parseAbilities(
      "[Hunt] When I attack, you may spend 3 XP to deal damage equal to my Might to an enemy unit here.",
    );
    expect(r.success).toBe(true);
    const abs = r.abilities ?? [];
    // Should contain: Hunt keyword, conquer trigger, hold trigger, attack trigger
    const attackTrigger = abs.find(
      (a) =>
        (a as { trigger?: { event?: string } }).trigger?.event === "attack",
    );
    expect(attackTrigger).toBeDefined();
    const {effect} = (attackTrigger as { effect: { type: string } });
    expect(effect.type).toBe("sequence");
  });
});
