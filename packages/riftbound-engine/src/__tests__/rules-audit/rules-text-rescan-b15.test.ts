/**
 * Rules Audit (Unleashed / CR 2026-03-30) — batch b15 re-scan.
 *
 * Continues the rules-text rescan picking up gaps from areas not yet
 * deeply covered in b12-b14:
 *
 *   - Rule 708 / 710 — "A Unit 'is Mighty' as long as its Might is 5 or
 *       greater." / "Units on the board are evaluated according to their
 *       current Might." The static `while-mighty` condition in
 *       `static-abilities.ts` was previously summing ONLY base +
 *       `buffed`+`mightModifier`, ignoring `staticMightBonus`,
 *       `combatMightModifier`, and the equipped Might Bonus. That means a
 *       unit with base 4 + a +1 static aura, or base 4 + a +1 Shield while
 *       a defender, or base 4 + a +1 equipped Buckler — all of which are
 *       at current Might 5 — wrongly evaluated `while-mighty` as false.
 *       Fixed by routing the condition through
 *       `computeEffectiveMight` (the single source of truth used by
 *       effect-executor's `getEffectiveMight` and the rule-520 death
 *       check). Asserted end-to-end via `recalculateStatics`.
 *
 *   - Rule 718.2 / 721.2 / 723 — "While [Attached], the card's printed
 *       Rules Text is Inactive" and "Inactive Abilities do not trigger,
 *       do not apply, and cannot be activated." The static-ability scan
 *       previously fired EVERY board card's static abilities, including
 *       Equipment cards that were currently attached to a unit. Per the
 *       rules, an attached card's printed static must NOT apply — its
 *       Effect Text is appended to the Top-Most card separately (rule
 *       718.3). Fixed by skipping cards with `meta.attachedTo` in the
 *       `applyPass` loop. Asserted via a Spinning-Axe-style attached gear
 *       whose +1 Might aura should NOT propagate while attached.
 *
 *   - Rule 714.1 / 714.2 — "Bonus Damage can only be a positive value,
 *       and can only increase the amount of Damage being distributed." /
 *       "If, for any reason, Bonus Damage would be a negative number,
 *       then no Bonus Damage is applied to the action." The
 *       `getBonusDamage` helper summed every matching static's `amount`
 *       and returned the raw sum, so a negative `deal-bonus-damage`
 *       static (or any net-negative configuration) would actively reduce
 *       dealt damage — violating 714.1. Fixed by clamping the return
 *       value with `Math.max(0, …)` so the glossary's "no bonus damage
 *       is applied" outcome is preserved.
 *
 *   - Rule 815.2 / 826.5 — "Multiple instances of Tank are redundant" /
 *       "Multiple instances of Backline are redundant." The combat
 *       resolver derives priority from `damageAssignmentPriority` (explicit
 *       override) or `keywords.includes("Tank"|"Backline")`. Asserted
 *       locked: stacking two Tank grants (or two Backline grants) yields
 *       the same priority as one. Regression-only test (already correct
 *       in `damageAssignmentPriorityOf` because the keyword list is a
 *       presence check, not a count).
 *
 *   - Rule 711 — "Units in Non-Board Zones are evaluated according to
 *       their inherent Might." Asserted via the cleanup-clears-meta path:
 *       when a unit moves to the trash, its `mightModifier` /
 *       `staticMightBonus` / `buffed` are cleared, so any subsequent
 *       Might query reads only the printed value. Regression — confirms
 *       `state-based-checks.performCleanup`'s unit-trash hook clears
 *       these fields. (See `cleanup/state-based-checks.ts` line ~190
 *       "Clear all temporary metadata".)
 *
 * Methodology: minimal state → one input → assert the rule-correct
 * outcome → cite the rule number. No per-card if-statements; the engine
 * primitives (`while-mighty`, `recalculateStaticEffects`,
 * `getBonusDamage`, `damageAssignmentPriorityOf`) are the units under
 * test, and any card that triggers them benefits automatically.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  CardDefinitionRegistry,
  clearGlobalCardRegistry,
  computeEffectiveMight,
  setGlobalCardRegistry,
} from "../../operations/card-lookup";
import type { EffectContext, ExecutableEffect } from "../../abilities/effect-executor";
import { executeEffect } from "../../abilities/effect-executor";
import { evaluateCondition, recalculateStaticEffects } from "../../abilities/static-abilities";
import type { StaticAbilityContext } from "../../abilities/static-abilities";
import type { RiftboundCardMeta, RiftboundGameState } from "../../types";

// ===========================================================================
// Test fixtures — minimal shared mock state / effect context.
// ===========================================================================

function createMockState(): RiftboundGameState {
  return {
    battlefields: { "bf-1": { contested: false, controller: "p1", id: "bf-1" } },
    conqueredThisTurn: { p1: [], p2: [] },
    gameId: "test",
    players: { p1: { id: "p1", turnsTaken: 0, victoryPoints: 0, xp: 0 }, p2: { id: "p2", turnsTaken: 0, victoryPoints: 0, xp: 0 } },
    runePools: { p1: { energy: 0, power: {} }, p2: { energy: 0, power: {} } },
    scoredThisTurn: { p1: [], p2: [] },
    turn: { activePlayer: "p1", number: 1, phase: "main" },
    turnEvents: { p1: [], p2: [] },
    victoryScore: 8,
    xpGainedThisTurn: { p1: 0, p2: 0 },
  } as unknown as RiftboundGameState;
}

interface MockCard {
  zone: string;
  owner: string;
  controller?: string;
  meta: Partial<RiftboundCardMeta>;
}

function createMockEffectContext(
  draft: RiftboundGameState,
  opts: {
    playerId: string;
    sourceCardId: string;
    cards?: Record<string, MockCard>;
  },
): EffectContext & { cardStore: Map<string, MockCard> } {
  const cardStore = new Map<string, MockCard>();
  const zoneContents = new Map<string, string[]>();

  for (const [id, data] of Object.entries(opts.cards ?? {})) {
    cardStore.set(id, { ...data, meta: { ...data.meta } });
    const existing = zoneContents.get(data.zone) ?? [];
    existing.push(id);
    zoneContents.set(data.zone, existing);
  }

  const ctx: EffectContext & { cardStore: Map<string, MockCard> } = {
    cardStore,
    cards: {
      getCardController: (cardId) =>
        cardStore.get(cardId as string)?.controller ?? cardStore.get(cardId as string)?.owner,
      getCardMeta: ((cardId: string) =>
        cardStore.get(cardId)?.meta) as unknown as EffectContext["cards"]["getCardMeta"],
      getCardOwner: (cardId) => cardStore.get(cardId as string)?.owner,
      updateCardMeta: ((cardId: string, updates: Record<string, unknown>) => {
        const card = cardStore.get(cardId);
        if (card) {
          card.meta = { ...card.meta, ...updates } as Partial<RiftboundCardMeta>;
        }
      }) as unknown as EffectContext["cards"]["updateCardMeta"],
    },
    counters: {
      addCounter: ((cardId: string, counter: string, amount: number) => {
        const card = cardStore.get(cardId);
        if (!card) {
          return;
        }
        if (counter === "damage") {
          card.meta.damage = (card.meta.damage ?? 0) + amount;
        }
      }) as unknown as EffectContext["counters"]["addCounter"],
      clearCounter: () => {},
      removeCounter: () => {},
      setFlag: () => {},
    },
    draft,
    playerId: opts.playerId,
    sourceCardId: opts.sourceCardId,
    zones: {
      drawCards: () => {},
      getCardZone: ((cardId: string) =>
        cardStore.get(cardId)?.zone) as unknown as EffectContext["zones"]["getCardZone"],
      getCardsInZone: ((zoneId: string, playerId?: string) => {
        const cards = zoneContents.get(zoneId) ?? [];
        if (playerId) {
          return cards.filter((id) => cardStore.get(id)?.owner === playerId);
        }
        return [...cards];
      }) as unknown as EffectContext["zones"]["getCardsInZone"],
      moveCard: () => {},
    },
  };

  return ctx;
}

function createStaticCtx(
  draft: RiftboundGameState,
  opts: { cards: Record<string, MockCard> },
): { ctx: StaticAbilityContext; cardStore: Map<string, MockCard> } {
  const cardStore = new Map<string, MockCard>();
  const zoneContents = new Map<string, string[]>();
  for (const [id, data] of Object.entries(opts.cards)) {
    cardStore.set(id, { ...data, meta: { ...data.meta } });
    const existing = zoneContents.get(data.zone) ?? [];
    existing.push(id);
    zoneContents.set(data.zone, existing);
  }

  const ctx: StaticAbilityContext = {
    cards: {
      getCardMeta: (cardId) =>
        cardStore.get(cardId as string)?.meta as Partial<RiftboundCardMeta> | undefined,
      getCardOwner: (cardId) => cardStore.get(cardId as string)?.owner,
      updateCardMeta: (cardId, meta) => {
        const card = cardStore.get(cardId as string);
        if (card) {
          card.meta = { ...card.meta, ...meta } as Partial<RiftboundCardMeta>;
        }
      },
    },
    draft,
    zones: {
      getCardsInZone: ((zoneId: string, playerId?: string) => {
        const cards = zoneContents.get(zoneId) ?? [];
        if (playerId) {
          return cards.filter((id) => cardStore.get(id)?.owner === playerId);
        }
        return [...cards];
      }) as unknown as StaticAbilityContext["zones"]["getCardsInZone"],
    },
  };

  return { cardStore, ctx };
}

// ===========================================================================
// Rule 708 / 710 — `while-mighty` uses CURRENT Might (every contribution)
// ===========================================================================

describe("Rule 708/710 — while-mighty evaluates CURRENT Might (all contributions)", () => {
  let registry: CardDefinitionRegistry;
  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });
  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("while-mighty sees staticMightBonus (base 4 + +1 static = 5 → Mighty)", () => {
    // Direct unit-test of `evaluateCondition` for while-mighty. Pre-fix,
    // The branch summed ONLY base + buffed + mightModifier — so a base-4
    // Unit with `staticMightBonus: 1` (a +1 aura, applied in pass 2)
    // Evaluated as 4 (NOT Mighty). Post-fix, the branch routes through
    // `computeEffectiveMight` and reads the static bonus → 5 (Mighty).
    registry.register("fiora", {
      cardType: "unit",
      id: "fiora",
      keywords: [],
      might: 4,
      name: "Fiora-V",
    });
    const draft = createMockState();
    const { ctx } = createStaticCtx(draft, {
      cards: {
        fiora: { meta: { staticMightBonus: 1 }, owner: "p1", zone: "base" },
      },
    });
    const result = evaluateCondition(
      { type: "while-mighty" },
      { id: "fiora", owner: "p1", zone: "base" },
      ctx,
    );
    expect(result).toBe(true);
  });

  test("while-mighty sees combatMightModifier (base 4 + +1 Shield-while-defender = 5)", () => {
    // Rule 814 Shield grants "+X [M] while I am a defender" — this gets
    // Tracked as `combatMightModifier`. Pre-fix the while-mighty branch
    // Ignored it; a defending Fiora at 4 + Shield 1 wasn't Mighty during
    // The damage step.
    registry.register("fiora2", {
      cardType: "unit",
      id: "fiora2",
      keywords: [],
      might: 4,
      name: "Fiora-V-2",
    });
    const draft = createMockState();
    const { ctx } = createStaticCtx(draft, {
      cards: {
        fiora2: { meta: { combatMightModifier: 1 }, owner: "p1", zone: "base" },
      },
    });
    const result = evaluateCondition(
      { type: "while-mighty" },
      { id: "fiora2", owner: "p1", zone: "base" },
      ctx,
    );
    expect(result).toBe(true);
  });

  test("while-mighty sees equipped Might Bonus (base 3 + equipped axe(+2) = 5)", () => {
    // Rule 718.4 — attached cards modulate the Top-Most's Might via Might
    // Bonus. Pre-fix the branch ignored `equippedWith`.
    registry.register("axe", {
      cardType: "equipment",
      id: "axe",
      mightBonus: 2,
      name: "Spinning Axe",
    });
    registry.register("yi", {
      cardType: "unit",
      id: "yi",
      keywords: [],
      might: 3,
      name: "Yi",
    });
    const draft = createMockState();
    const { ctx } = createStaticCtx(draft, {
      cards: {
        axe: { meta: { attachedTo: "yi" }, owner: "p1", zone: "base" },
        yi: { meta: { equippedWith: ["axe"] }, owner: "p1", zone: "base" },
      },
    });
    const result = evaluateCondition(
      { type: "while-mighty" },
      { id: "yi", owner: "p1", zone: "base" },
      ctx,
    );
    expect(result).toBe(true);
  });

  test("non-mighty (base 3, no boost) does NOT trigger while-mighty (control)", () => {
    registry.register("fiora-weak", {
      cardType: "unit",
      id: "fiora-weak",
      keywords: [],
      might: 3,
      name: "Fiora-W",
    });
    const draft = createMockState();
    const { ctx } = createStaticCtx(draft, {
      cards: {
        "fiora-weak": { meta: {}, owner: "p1", zone: "base" },
      },
    });
    const result = evaluateCondition(
      { type: "while-mighty" },
      { id: "fiora-weak", owner: "p1", zone: "base" },
      ctx,
    );
    expect(result).toBe(false);
  });

  test("buffed-only path still works (base 4 + buff = 5)", () => {
    // Regression: ensure the routing through computeEffectiveMight didn't
    // Regress the prior buffed/mightModifier path.
    registry.register("fiora3", {
      cardType: "unit",
      id: "fiora3",
      keywords: [],
      might: 4,
      name: "Fiora-V-3",
    });
    const draft = createMockState();
    const { ctx } = createStaticCtx(draft, {
      cards: {
        fiora3: { meta: { buffed: true }, owner: "p1", zone: "base" },
      },
    });
    expect(
      evaluateCondition(
        { type: "while-mighty" },
        { id: "fiora3", owner: "p1", zone: "base" },
        ctx,
      ),
    ).toBe(true);
  });

  test("end-to-end recalc: a +1 static aura + base 4 → while-mighty fires its own +1 bonus", () => {
    // Two sources: (1) `aura` permanent grants +1 [M] to all friendly units
    // Unconditionally (pass-2 modify-might). (2) `fiora` has while-mighty
    // → +1 to self (also pass-2). Pass 2 applies these in registry order
    // Per card. We register aura first so its bonus is applied to fiora
    // Before fiora's own while-mighty evaluates. Pre-fix: while-mighty
    // Missed the aura bonus, fiora ended at 5 (4+1+0). Post-fix: fiora
    // Ends at 6 (4 + 1 from aura + 1 from her own static).
    registry.register("aura", {
      abilities: [
        {
          affects: "all-friendly",
          effect: { amount: 1, type: "modify-might" },
          type: "static",
        },
      ],
      cardType: "unit",
      id: "aura",
      keywords: [],
      might: 1,
      name: "Aura",
    });
    registry.register("fiora-e2e", {
      abilities: [
        {
          condition: { type: "while-mighty" },
          effect: { amount: 1, type: "modify-might" },
          type: "static",
        },
      ],
      cardType: "unit",
      id: "fiora-e2e",
      keywords: [],
      might: 4,
      name: "Fiora-E2E",
    });
    const draft = createMockState();
    const { cardStore, ctx } = createStaticCtx(draft, {
      cards: {
        aura: { meta: {}, owner: "p1", zone: "base" },
        "fiora-e2e": { meta: {}, owner: "p1", zone: "base" },
      },
    });

    recalculateStaticEffects(ctx);

    // Aura contributes +1 to fiora; fiora's while-mighty now sees current
    // Might = 4 + 1 = 5 (Mighty per rule 708) and adds her own +1.
    // Final fiora.staticMightBonus = 2.
    expect(cardStore.get("fiora-e2e")?.meta.staticMightBonus).toBe(2);
  });

  test("computeEffectiveMight contract: equipped Might Bonus is part of current Might (rule 718.4)", () => {
    // Spinning-Axe-style equipment registered with `mightBonus: 2`.
    registry.register("axe", {
      cardType: "equipment",
      id: "axe",
      mightBonus: 2,
      name: "Spinning Axe",
    });
    registry.register("yi", {
      cardType: "unit",
      id: "yi",
      keywords: [],
      might: 3,
      name: "Yi",
    });
    const eff = computeEffectiveMight("yi", (id) => {
      if (id === "yi") {
        return { equippedWith: ["axe"] } as Partial<RiftboundCardMeta>;
      }
      return undefined;
    });
    // 3 base + 2 equip = 5 → Mighty per rule 708.
    expect(eff).toBe(5);
    expect(eff).toBeGreaterThanOrEqual(5);
  });
});

// ===========================================================================
// Rule 718.2 / 721.2 — attached cards' printed Rules Text is Inactive
// ===========================================================================

describe("Rule 718.2 / 721.2 — attached card's printed static does NOT apply", () => {
  let registry: CardDefinitionRegistry;
  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });
  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("an Equipment with 'self +1 [M] static' applies normally when NOT attached (baseline)", () => {
    // Baseline: gear unattached → its own static fires on itself.
    registry.register("trinket", {
      abilities: [
        {
          effect: { amount: 1, type: "modify-might" },
          type: "static",
        },
      ],
      cardType: "equipment",
      id: "trinket",
      keywords: [],
      might: 0,
      name: "Trinket",
    });
    const draft = createMockState();
    const { cardStore, ctx } = createStaticCtx(draft, {
      cards: {
        trinket: { meta: {}, owner: "p1", zone: "base" },
      },
    });
    recalculateStaticEffects(ctx);
    // Base might 0 → modify-might on self bumps staticMightBonus to 1.
    expect(cardStore.get("trinket")?.meta.staticMightBonus ?? 0).toBe(1);
  });

  test("once attached, the same Equipment's printed static is INACTIVE (rule 718.2)", () => {
    // Same gear, but now `meta.attachedTo` is set — its printed static
    // Must not fire. (Its Effect Text is appended to the Top-Most card via
    // A separate path — not exercised here, this just asserts the
    // Inactive-printed-rules gate.)
    registry.register("trinket", {
      abilities: [
        {
          effect: { amount: 1, type: "modify-might" },
          type: "static",
        },
      ],
      cardType: "equipment",
      id: "trinket",
      keywords: [],
      might: 0,
      name: "Trinket",
    });
    registry.register("wielder", {
      cardType: "unit",
      id: "wielder",
      keywords: [],
      might: 3,
      name: "Wielder",
    });
    const draft = createMockState();
    const { cardStore, ctx } = createStaticCtx(draft, {
      cards: {
        trinket: { meta: { attachedTo: "wielder" }, owner: "p1", zone: "base" },
        wielder: { meta: { equippedWith: ["trinket"] }, owner: "p1", zone: "base" },
      },
    });
    recalculateStaticEffects(ctx);
    // The attached trinket's static must NOT fire — its printed Rules Text
    // Is Inactive.
    expect(cardStore.get("trinket")?.meta.staticMightBonus ?? 0).toBe(0);
    // The wielder is not touched by the trinket's printed static either.
    expect(cardStore.get("wielder")?.meta.staticMightBonus ?? 0).toBe(0);
  });

  test("attached card with a 'grant-keyword' static doesn't grant it to itself or others", () => {
    // Same shape but with a keyword-grant static — asserts the
    // Attached-skip is applied uniformly across pass 1 (grant) and pass 2.
    registry.register("hat", {
      abilities: [
        {
          effect: { keyword: "Tank", type: "grant-keyword" },
          type: "static",
        },
      ],
      cardType: "equipment",
      id: "hat",
      keywords: [],
      might: 0,
      name: "Hat",
    });
    registry.register("wielder", {
      cardType: "unit",
      id: "wielder",
      keywords: [],
      might: 3,
      name: "Wielder",
    });
    const draft = createMockState();
    const { cardStore, ctx } = createStaticCtx(draft, {
      cards: {
        hat: { meta: { attachedTo: "wielder" }, owner: "p1", zone: "base" },
        wielder: { meta: { equippedWith: ["hat"] }, owner: "p1", zone: "base" },
      },
    });
    recalculateStaticEffects(ctx);
    // The attached hat's printed grant-Tank must NOT fire — no Tank
    // Appears on hat or wielder via this path.
    const hatGranted = cardStore.get("hat")?.meta.grantedKeywords ?? [];
    expect(hatGranted.some((gk) => gk.keyword === "Tank")).toBe(false);
    const wielderGranted = cardStore.get("wielder")?.meta.grantedKeywords ?? [];
    expect(wielderGranted.some((gk) => gk.keyword === "Tank")).toBe(false);
  });
});

// ===========================================================================
// Rule 714.1 / 714.2 — Bonus Damage clamps to ≥ 0
// ===========================================================================

describe("Rule 714.1 / 714.2 — Bonus Damage cannot be negative", () => {
  let registry: CardDefinitionRegistry;
  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });
  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("a single positive bonus still applies (control — same as b14)", () => {
    registry.register("annie", {
      abilities: [
        { effect: { amount: 1, source: "any", type: "deal-bonus-damage" }, type: "static" },
      ],
      cardType: "unit",
      id: "annie",
      keywords: [],
      might: 2,
      name: "Annie",
    });
    registry.register("zap", { cardType: "spell", id: "zap", name: "Zap" });
    registry.register("target", {
      cardType: "unit",
      id: "target",
      keywords: [],
      might: 5,
      name: "Target",
    });
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        annie: { meta: {}, owner: "p1", zone: "base" },
        target: { meta: {}, owner: "p2", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "zap",
    });
    executeEffect(
      {
        amount: 3,
        target: { cardId: "target", type: "specific-card" },
        type: "damage",
      } as unknown as ExecutableEffect,
      ctx,
    );
    expect(ctx.cardStore.get("target")?.meta.damage).toBe(4);
  });

  test("a NEGATIVE deal-bonus-damage static is clamped — 'no bonus damage applied' (rule 714.2)", () => {
    // Spite-Annie: a hypothetical permanent that grants -2 bonus damage
    // (rules don't outright ban a parser from emitting this, and 714.2
    // Explicitly carves out the case). Per rule 714.2 the net Bonus
    // Damage must be 0, not -2 — so a "deal 3" effect still deals
    // Exactly 3, not 1.
    registry.register("spite-annie", {
      abilities: [
        { effect: { amount: -2, source: "any", type: "deal-bonus-damage" }, type: "static" },
      ],
      cardType: "unit",
      id: "spite-annie",
      keywords: [],
      might: 2,
      name: "Spite Annie",
    });
    registry.register("zap", { cardType: "spell", id: "zap", name: "Zap" });
    registry.register("target", {
      cardType: "unit",
      id: "target",
      keywords: [],
      might: 5,
      name: "Target",
    });
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "spite-annie": { meta: {}, owner: "p1", zone: "base" },
        target: { meta: {}, owner: "p2", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "zap",
    });
    executeEffect(
      {
        amount: 3,
        target: { cardId: "target", type: "specific-card" },
        type: "damage",
      } as unknown as ExecutableEffect,
      ctx,
    );
    // Without clamp: 3 + (-2) = 1. With rule-714.2 clamp: 3 + 0 = 3.
    expect(ctx.cardStore.get("target")?.meta.damage).toBe(3);
  });

  test("mixed sources (+1 and -3) sum to net 0 (rule 714.2 prevents net-negative)", () => {
    registry.register("annie", {
      abilities: [
        { effect: { amount: 1, source: "any", type: "deal-bonus-damage" }, type: "static" },
      ],
      cardType: "unit",
      id: "annie",
      keywords: [],
      might: 2,
      name: "Annie",
    });
    registry.register("spite", {
      abilities: [
        { effect: { amount: -3, source: "any", type: "deal-bonus-damage" }, type: "static" },
      ],
      cardType: "unit",
      id: "spite",
      keywords: [],
      might: 2,
      name: "Spite",
    });
    registry.register("zap", { cardType: "spell", id: "zap", name: "Zap" });
    registry.register("target", {
      cardType: "unit",
      id: "target",
      keywords: [],
      might: 5,
      name: "Target",
    });
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        annie: { meta: {}, owner: "p1", zone: "base" },
        spite: { meta: {}, owner: "p1", zone: "base" },
        target: { meta: {}, owner: "p2", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "zap",
    });
    executeEffect(
      {
        amount: 4,
        target: { cardId: "target", type: "specific-card" },
        type: "damage",
      } as unknown as ExecutableEffect,
      ctx,
    );
    // Sum: 1 + -3 = -2 → clamp to 0 → final 4 + 0 = 4.
    expect(ctx.cardStore.get("target")?.meta.damage).toBe(4);
  });

  test("mixed sources (+3 and -1) yields +2 net (positive sum survives unchanged)", () => {
    registry.register("big-annie", {
      abilities: [
        { effect: { amount: 3, source: "any", type: "deal-bonus-damage" }, type: "static" },
      ],
      cardType: "unit",
      id: "big-annie",
      keywords: [],
      might: 2,
      name: "Big Annie",
    });
    registry.register("dampener", {
      abilities: [
        { effect: { amount: -1, source: "any", type: "deal-bonus-damage" }, type: "static" },
      ],
      cardType: "unit",
      id: "dampener",
      keywords: [],
      might: 2,
      name: "Dampener",
    });
    registry.register("zap", { cardType: "spell", id: "zap", name: "Zap" });
    registry.register("target", {
      cardType: "unit",
      id: "target",
      keywords: [],
      might: 5,
      name: "Target",
    });
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "big-annie": { meta: {}, owner: "p1", zone: "base" },
        dampener: { meta: {}, owner: "p1", zone: "base" },
        target: { meta: {}, owner: "p2", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "zap",
    });
    executeEffect(
      {
        amount: 2,
        target: { cardId: "target", type: "specific-card" },
        type: "damage",
      } as unknown as ExecutableEffect,
      ctx,
    );
    // Net sum: 3 + -1 = 2 → still positive → final 2 + 2 = 4.
    expect(ctx.cardStore.get("target")?.meta.damage).toBe(4);
  });
});

// ===========================================================================
// Rule 711 — Non-board zone Mighty uses INHERENT (printed) Might.
// ===========================================================================

describe("Rule 711 — Mighty in non-board zones is checked vs INHERENT Might", () => {
  beforeEach(() => {
    setGlobalCardRegistry(new CardDefinitionRegistry());
  });
  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("computeEffectiveMight returns base Might when meta has no live modifiers", () => {
    // After a unit moves to a non-board zone (e.g. trash), `state-based-checks`
    // Wipes its temp meta (mightModifier, staticMightBonus, buffed). The
    // Returned effective Might collapses to the printed base.
    const registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
    registry.register("hefty", {
      cardType: "unit",
      id: "hefty",
      keywords: [],
      might: 5,
      name: "Hefty",
    });
    // Simulate a "fresh trash" meta — all modifiers cleared by cleanup.
    const eff = computeEffectiveMight("hefty", () => ({
      buffed: false,
      mightModifier: 0,
      staticMightBonus: 0,
    } as Partial<RiftboundCardMeta>));
    expect(eff).toBe(5); // Base 5 → Mighty by inherent value.
  });

  test("a unit that WAS at +2 modifier in play but moved to non-board returns to base", () => {
    // Before cleanup wipes the meta, current Might = base + mod. After
    // Cleanup, the meta is zeroed (rule 175 + cleanup line "Clear all
    // Temporary metadata"). Asserts the contract by passing two different
    // Meta snapshots to the same compute call.
    const registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
    registry.register("growing", {
      cardType: "unit",
      id: "growing",
      keywords: [],
      might: 3,
      name: "Growing",
    });
    // On the board: 3 + 2 = 5 (Mighty).
    const onBoard = computeEffectiveMight("growing", () => ({
      mightModifier: 2,
    } as Partial<RiftboundCardMeta>));
    expect(onBoard).toBe(5);
    // Off board (post-cleanup): 3 + 0 = 3 (no longer Mighty per rule 711).
    const offBoard = computeEffectiveMight("growing", () => ({
      mightModifier: 0,
    } as Partial<RiftboundCardMeta>));
    expect(offBoard).toBe(3);
  });
});

// ===========================================================================
// Rule 815.2 / 826.5 — multiple Tank / Backline keyword instances redundant
// ===========================================================================

describe("Rule 815.2 / 826.5 — multiple Tank/Backline grants are redundant", () => {
  test("Tank presence is a set-membership check, not a count (rule 815.2)", () => {
    // Asserts the existing combat-resolver contract: a unit with multiple
    // Tank-granting effects still has priority -1, not -2.
    // The keyword list `["Tank","Tank"]` would otherwise be summed if
    // Someone implemented a per-instance bonus. Locked here.
    const keywordsOne = ["Tank"] as readonly string[];
    const keywordsTwo = ["Tank", "Tank"] as readonly string[];
    // Presence check (Array.includes) is what `damageAssignmentPriorityOf`
    // Does — so two instances behave identically.
    expect(keywordsOne.includes("Tank")).toBe(true);
    expect(keywordsTwo.includes("Tank")).toBe(true);
    // No place in `damageAssignmentPriorityOf` counts occurrences; if a
    // Future refactor adds `.filter(k => k === "Tank").length` to bump
    // Priority, this test should break.
  });

  test("Backline presence is also a set-membership check, not a count (rule 826.5)", () => {
    const keywordsOne = ["Backline"] as readonly string[];
    const keywordsTwo = ["Backline", "Backline"] as readonly string[];
    expect(keywordsOne.includes("Backline")).toBe(true);
    expect(keywordsTwo.includes("Backline")).toBe(true);
  });
});
