/**
 * Parser tests for sequence-then and if-you-do effects.
 *
 * These tests cover the `splitOnThen()` preprocessor and the
 * `parseIfYouDoEffect()` helper added in Wave 3 (Agent 1 scope).
 */

import { describe, expect, it } from "bun:test";
import { parseAbilities } from "../../index";

describe("Parser: splitOnThen()", () => {
  it("splits simple 'X, then Y' sequences", () => {
    const result = parseAbilities(
      "Exhaust all friendly units, then deal 12 to ALL units at battlefields.",
    );
    expect(result.success).toBe(true);
    const effect = result.abilities?.[0] as unknown as {
      effect: { type: string; effects?: unknown[] };
    };
    expect(effect.effect.type).toBe("sequence");
    expect(effect.effect.effects).toHaveLength(2);
    expect((effect.effect.effects?.[0] as { type: string }).type).toBe("exhaust");
    expect((effect.effect.effects?.[1] as { type: string }).type).toBe("damage");
  });

  it("splits 'X, then Y' with move verbs", () => {
    const result = parseAbilities("Move a friendly unit, then move an enemy unit.");
    expect(result.success).toBe(true);
    const effect = result.abilities?.[0] as unknown as {
      effect: { type: string; effects?: { type: string }[] };
    };
    expect(effect.effect.type).toBe("sequence");
    expect(effect.effect.effects).toHaveLength(2);
    expect(effect.effect.effects?.[0]?.type).toBe("move");
    expect(effect.effect.effects?.[1]?.type).toBe("move");
  });

  it("splits inside a triggered effect text", () => {
    const result = parseAbilities("When I move, draw 1, then discard 1.");
    expect(result.success).toBe(true);
    const a = result.abilities?.[0] as unknown as {
      type: string;
      effect: { type: string; effects?: { type: string }[] };
      trigger: { event: string };
    };
    expect(a.type).toBe("triggered");
    expect(a.trigger.event).toBe("move");
    expect(a.effect.type).toBe("sequence");
    expect(a.effect.effects?.[0]?.type).toBe("draw");
    expect(a.effect.effects?.[1]?.type).toBe("discard");
  });

  it("does not split on 'and then' inside a single effect", () => {
    // "Draw 1" is a single leaf; "and then" should not invoke splitOnThen.
    const result = parseAbilities("Draw 1.");
    expect(result.success).toBe(true);
    const effect = result.abilities?.[0] as unknown as { effect: { type: string } };
    expect(effect.effect.type).toBe("draw");
  });
});

describe("Parser: parseIfYouDoEffect()", () => {
  it("parses 'As an additional cost... you may X. If you do, Y. Otherwise, Z.'", () => {
    const result = parseAbilities(
      "[Reaction] As an additional cost to play this, you may exhaust a friendly unit. If you do, draw 2. Otherwise, draw 1.",
    );
    expect(result.success).toBe(true);
    const a = result.abilities?.[0] as unknown as {
      type: string;
      effect: {
        type: string;
        effects?: unknown[];
      };
    };
    expect(a.type).toBe("spell");
    expect(a.effect.type).toBe("sequence");
    expect(a.effect.effects).toHaveLength(2);
    const opt = a.effect.effects?.[0] as { type: string };
    const cond = a.effect.effects?.[1] as {
      type: string;
      condition: { type: string };
      then: { type: string; amount?: number };
      else?: { type: string; amount?: number };
    };
    expect(opt.type).toBe("optional");
    expect(cond.type).toBe("conditional");
    expect(cond.condition.type).toBe("paid-additional-cost");
    expect(cond.then.type).toBe("draw");
    expect(cond.then.amount).toBe(2);
    expect(cond.else?.type).toBe("draw");
    expect(cond.else?.amount).toBe(1);
  });

  // rule 205 / 444.2 (sfd-020-221 Draven, unl-079-219 Diana) — "you may pay [X]. If you do, Y":
  // the pay is NOT a cost (no "[X] to [Y]" link) but a game action performed as the ability
  // resolves, so it becomes a `conditional` pay question in the effect body — never the trigger's
  // own `pay-cost` condition (that is what "you may pay [X] TO Y" becomes: the base cost, settled
  // when the item is finalized). rule 383.3.a / 402.1 — the LEADING "you may" still marks the
  // trigger `optional`: perform-or-drop is decided while the item is finalized.
  it("parses 'you may pay [rune]. If you do, Y' inside a trigger as optional (383.3.a) + a resolution-time payment (205)", () => {
    const result = parseAbilities(
      "When I attack or defend, you may pay [fury]. If you do, give me +2 [Might] this turn.",
    );
    expect(result.success).toBe(true);
    const a = result.abilities?.[0] as unknown as {
      type: string;
      optional?: boolean;
      condition?: { type: string };
      effect: { type: string; condition?: { type: string; cost?: unknown }; then?: { type: string } };
    };
    expect(a.type).toBe("triggered");
    expect(a.optional).toBe(true);
    expect(a.condition).toBeUndefined();
    expect(a.effect.type).toBe("conditional");
    expect(a.effect.condition?.type).toBe("pay-cost");
    expect(a.effect.condition?.cost).toEqual({ power: ["fury"] });
    expect(a.effect.then?.type).toBe("modify-might");
  });

  // rule 383.3.b / 204.3.a / 740.4.a.2 (ogn-282-298 Monastery of Hirana) — "you may spend a buff TO Y":
  // the spend right after the leading "you may" IS the trigger's base cost (`pay-cost.spendBuff`),
  // named and paid at finalization; Y is the whole effect.
  it("parses 'you may spend a buff to Y' inside a trigger as a spendBuff base cost", () => {
    const result = parseAbilities("When you conquer here, you may spend a buff to draw 1.");
    expect(result.success).toBe(true);
    const a = result.abilities?.[0] as unknown as {
      type: string;
      optional?: boolean;
      condition?: { type: string; cost?: unknown };
      effect: { type: string; amount?: number };
    };
    expect(a.type).toBe("triggered");
    expect(a.optional).toBe(true);
    expect(a.condition).toEqual({ cost: { spendBuff: 1 }, type: "pay-cost" });
    expect(a.effect).toEqual({ amount: 1, type: "draw" });
  });
});
