/**
 * Rules Audit: Prevent — rule 437 (new in Unleashed, Core Rules 2026-03-30).
 *
 * Preventing damage reduces the damage a set of game objects would take.
 * A Prevent action records a Prevent Value on a Unit; the next damage that
 * would be dealt to it is reduced by that value (never below 0), and the
 * tracked value is reduced by the prevented amount. `"all"` is an infinite
 * Prevent Value. In combat (rule 437.5), damage can still be *assigned* to a
 * unit affected by Prevent, but it must be assigned up to a value that would
 * be lethal accounting for the Prevent Value (437.5.a); no amount is lethal
 * when the Prevent Value is `"all"` (437.5.b).
 *
 * Rules covered:
 *   437.1     Prevent records a Prevent Value on a unit
 *   437.2     dealt damage is reduced by the Prevent Value (never below 0)
 *   437.2.a   reduced damage can be 0 (= not dealing damage)
 *   437.3     the Prevent Value is then reduced by the prevented amount
 *   437.3.a   when the Prevent Value reaches 0, the effect expires
 *   437.3.c   `"all"` stays `"all"` and never expires
 *   437.5.a   in combat, lethal-assignment threshold = Might − marked + Prevent
 *   437.5.b   no damage is ever lethal when the Prevent Value is `"all"`
 */

import { describe, expect, it } from "bun:test";
import {
  applyPrevent,
  combinePreventValues,
  lethalAssignmentThreshold,
} from "../../operations/prevent-damage";
import type { CombatUnit } from "../../combat";
import { resolveCombat } from "../../combat";
import type { EffectContext, ExecutableEffect } from "../../abilities/effect-executor";
import { executeEffect } from "../../abilities/effect-executor";

function unit(
  id: string,
  might: number,
  opts: Partial<CombatUnit> = {},
): CombatUnit {
  return {
    baseMight: might,
    currentDamage: opts.currentDamage ?? 0,
    id,
    keywordValues: opts.keywordValues,
    keywords: opts.keywords ?? [],
    owner: opts.owner ?? "p1",
    preventValue: opts.preventValue,
  };
}

// ---------------------------------------------------------------------------
// Pure Prevent helpers (rule 437.2 / 437.3)
// ---------------------------------------------------------------------------

describe("Rule 437.2/.3: Prevent reduces dealt damage then shrinks the Prevent Value", () => {
  it("437.2: 5 damage with Prevent 3 deals 2", () => {
    const r = applyPrevent(5, 3);
    expect(r.dealt).toBe(2);
  });

  it("437.3: after preventing 3, the tracked value becomes 0 → expires (437.3.a)", () => {
    const r = applyPrevent(5, 3);
    expect(r.remaining).toBeUndefined();
  });

  it("437.3: a Prevent Value larger than the incoming damage shrinks but survives", () => {
    const r = applyPrevent(2, 5);
    expect(r.dealt).toBe(0); // 437.2.a — can be 0 (= not dealing damage)
    expect(r.remaining).toBe(3);
  });

  it("437.2.a: damage fully prevented is not considered dealt (dealt === 0)", () => {
    expect(applyPrevent(4, 4).dealt).toBe(0);
  });

  it("437.3.c: `all` stays `all` and absorbs everything", () => {
    const r = applyPrevent(99, "all");
    expect(r.dealt).toBe(0);
    expect(r.remaining).toBe("all");
  });

  it("no Prevent Value → damage passes through unchanged", () => {
    const r = applyPrevent(3, undefined);
    expect(r.dealt).toBe(3);
    expect(r.remaining).toBeUndefined();
  });

  it("multiple Prevent actions sum; numeric + `all` resolves to `all` (rule 437)", () => {
    expect(combinePreventValues(2, 3)).toBe(5);
    expect(combinePreventValues(2, "all")).toBe("all");
    expect(combinePreventValues("all", 4)).toBe("all");
    expect(combinePreventValues(undefined, 3)).toBe(3);
  });
});

describe("Rule 437.5.a/.b: combat lethal-assignment threshold accounts for Prevent", () => {
  it("437.5.a: a 2-Might unit with Prevent 3 needs 5 assigned for lethal", () => {
    expect(lethalAssignmentThreshold(2, 3)).toBe(5);
  });

  it("437.5.a: marked damage lowers the threshold normally; Prevent re-raises it", () => {
    // EffectiveHealth = Might − marked. 4 Might, 1 marked → 3; +Prevent 2 → 5.
    expect(lethalAssignmentThreshold(3, 2)).toBe(5);
  });

  it("437.5.b: a Prevent Value of `all` makes no amount lethal (Infinity)", () => {
    expect(lethalAssignmentThreshold(3, "all")).toBe(Number.POSITIVE_INFINITY);
  });
});

// ---------------------------------------------------------------------------
// Prevent in combat damage resolution (rule 437.5 + 460.2.c / 461.3)
// ---------------------------------------------------------------------------

describe("Rule 437.5: Prevent in the Combat Damage Step", () => {
  it("a defender with enough Prevent survives lethal-looking combat damage", () => {
    // Attacker Might 3 vs a 3-Might defender with Prevent 5: attacker assigns
    // Up to its 3 Might (less than the 3+5=8 needed for lethal), Prevent
    // Reduces it to 0 dealt → defender survives and holds.
    const result = resolveCombat(
      [unit("atk", 3, { owner: "p1" })],
      [unit("def", 3, { owner: "p2", preventValue: 5 })],
    );
    expect(result.killed).not.toContain("def");
    // Prevent absorbed 3 → tracked value drops to 2.
    expect(result.preventRemaining.def).toBe(2);
    // No combat damage was actually dealt to the defender.
    expect(result.damageAssignment.def ?? 0).toBe(0);
  });

  it("Prevent that runs out lets the unit die to the overflow", () => {
    // 5-Might attacker vs 3-Might defender with Prevent 1: defender needs
    // 3+1=4 assigned for lethal; attacker has 5, assigns 4 (per 460.2.c.4 it
    // May exceed lethal only if no other unit remains — here none does, so it
    // Dumps the remaining 1 too → 5 assigned). Prevent 1 reduces dealt to 4,
    // Which is ≥ 3 Might → dead.
    const result = resolveCombat(
      [unit("atk", 5, { owner: "p1" })],
      [unit("def", 3, { owner: "p2", preventValue: 1 })],
    );
    expect(result.killed).toContain("def");
  });

  it("437.5.b: a unit with Prevent `all` is never killed by combat damage", () => {
    const result = resolveCombat(
      [unit("atk", 100, { owner: "p1" })],
      [unit("def", 3, { owner: "p2", preventValue: "all" })],
    );
    expect(result.killed).not.toContain("def");
    expect(result.preventRemaining.def).toBe(undefined); // Unchanged → not surfaced
    // Combat continues — both sides still have units → defender holds after
    // The cleanup recalls surviving attackers.
    expect(result.winner).toBe("defender");
  });

  it("Prevent on an attacker reduces the combat damage dealt back to it", () => {
    // 4-Might defender deals 4 to a 3-Might attacker with Prevent 2 → 2 dealt,
    // Which is < 3 Might → attacker survives. Tracked Prevent drops to 0.
    const result = resolveCombat(
      [unit("atk", 3, { owner: "p1", preventValue: 2 })],
      [unit("def", 4, { owner: "p2" })],
    );
    expect(result.killed).not.toContain("atk");
    expect(result.preventRemaining.atk).toBeUndefined(); // 2 − 2 = 0 → expired
  });
});

// ---------------------------------------------------------------------------
// `prevent-damage` and `damage` effect-executor wiring (rule 437.1/.2/.3)
// ---------------------------------------------------------------------------

function mockCtx(): EffectContext & { meta: Map<string, Record<string, unknown>> } {
  const meta = new Map<string, Record<string, unknown>>();
  return {
    cards: {
      getCardMeta: (id: string) => meta.get(id),
      getCardOwner: () => "player-1",
      updateCardMeta: (id: string, updates: Record<string, unknown>) => {
        meta.set(id, { ...meta.get(id), ...updates });
      },
    },
    counters: {
      addCounter: (id: string, counter: string, amount: number) => {
        const m = meta.get(id) ?? {};
        m[counter] = ((m[counter] as number) ?? 0) + amount;
        meta.set(id, m);
      },
      clearCounter: () => {},
      removeCounter: () => {},
      setFlag: () => {},
    },
    draft: {
      battlefields: {},
      gameId: "g",
      players: { "player-1": { id: "player-1" }, "player-2": { id: "player-2" } },
    } as unknown as EffectContext["draft"],
    meta,
    playerId: "player-1",
    sourceCardId: "src",
    zones: {
      drawCards: () => {},
      getCardZone: () => undefined,
      getCardsInZone: () => [],
      moveCard: () => {},
    },
  };
}

describe("Rule 437.1: `prevent-damage` effect records a Prevent Value on a unit", () => {
  it("`Prevent the next 3 damage` → preventDamage 3 on the target", () => {
    const ctx = mockCtx();
    const effect: ExecutableEffect = {
      amount: 3,
      target: { type: "self" } as ExecutableEffect["target"],
      type: "prevent-damage",
    };
    executeEffect(effect, ctx);
    expect(ctx.meta.get("src")?.preventDamage).toBe(3);
  });

  it("`Prevent all` → preventDamage `all`", () => {
    const ctx = mockCtx();
    executeEffect(
      { amount: "all" as unknown as number, target: { type: "self" } as ExecutableEffect["target"], type: "prevent-damage" },
      ctx,
    );
    expect(ctx.meta.get("src")?.preventDamage).toBe("all");
  });

  it("a second Prevent action on the same unit accumulates (rule 437)", () => {
    const ctx = mockCtx();
    const t = { type: "self" } as ExecutableEffect["target"];
    executeEffect({ amount: 2, target: t, type: "prevent-damage" }, ctx);
    executeEffect({ amount: 4, target: t, type: "prevent-damage" }, ctx);
    expect(ctx.meta.get("src")?.preventDamage).toBe(6);
  });
});

describe("Rule 437.2/.3: the `damage` effect consumes the tracked Prevent Value", () => {
  it("5 damage against Prevent 3 → 2 marked damage, Prevent expires (437.3.a)", () => {
    const ctx = mockCtx();
    ctx.meta.set("src", { preventDamage: 3 });
    executeEffect(
      { amount: 5, target: { type: "self" } as ExecutableEffect["target"], type: "damage" },
      ctx,
    );
    expect(ctx.meta.get("src")?.damage).toBe(2);
    expect(ctx.meta.get("src")?.preventDamage).toBeUndefined();
  });

  it("2 damage against Prevent 5 → 0 marked damage (437.2.a), Prevent drops to 3", () => {
    const ctx = mockCtx();
    ctx.meta.set("src", { preventDamage: 5 });
    executeEffect(
      { amount: 2, target: { type: "self" } as ExecutableEffect["target"], type: "damage" },
      ctx,
    );
    expect(ctx.meta.get("src")?.damage ?? 0).toBe(0);
    expect(ctx.meta.get("src")?.preventDamage).toBe(3);
  });

  it("damage against Prevent `all` → 0 marked damage, stays `all` (437.3.c)", () => {
    const ctx = mockCtx();
    ctx.meta.set("src", { preventDamage: "all" });
    executeEffect(
      { amount: 99, target: { type: "self" } as ExecutableEffect["target"], type: "damage" },
      ctx,
    );
    expect(ctx.meta.get("src")?.damage ?? 0).toBe(0);
    expect(ctx.meta.get("src")?.preventDamage).toBe("all");
  });
});
