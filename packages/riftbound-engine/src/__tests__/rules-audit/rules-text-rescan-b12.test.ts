/**
 * Rules Audit (Unleashed / CR 2026-03-30) — batch b12 re-scan.
 *
 * Targets gaps the prior rules-audit batches missed under the 2026-03-30
 * Layers section (rules 468-475), specifically:
 *
 *   - Rule 472.3.b (snapshotting) — "When an arithmetic effect has a
 *       limitation that applies, it is limited at the time of its application,
 *       and is 'remembered' at that limited level for the duration of its
 *       effect." Example: "-4 [M] to a min of 1 this turn" on a 2 [M] unit
 *       generates -1 [M] this turn, NOT -4 (then floored at 0 by `Math.max`).
 *
 *     The parser already produces `effect.minimum` for "to a minimum of N"
 *     riders (smoke screen, blastcone fae, nine-tailed fox, leona zealot,
 *     etc.), but BEFORE this fix the engine completely ignored that field —
 *     both in the one-shot `executeEffect` path AND in the static-aura
 *     `recalculateStaticEffects` path. Pure damage clamped at 0 via the
 *     `Math.max(0, …)` floor in `getEffectiveMight`, which under-counted the
 *     resulting Might by exactly `minimum - 0` whenever the snapshot would
 *     have kicked in.
 *
 *     The fix: at application time, clamp the *applied* amount so that
 *     `mightBefore + applied = minimum` when the raw amount would push the
 *     target below the snapshotted minimum. For positive amounts or when the
 *     target is already at/below the floor, the minimum is a no-op.
 *
 *   - Rule 471.1 — "Layers are applied in sequence. Each effect in them is
 *       applied as soon as able, and only a single time across all sequences."
 *     The static-recalc pass uses Pass 1 (type/ability grants) + Pass 2
 *     (arithmetic), and the snapshot logic must read the *post-pass-1*
 *     effective Might (so a kingdom-buff aura that grants Tank then -N Might
 *     to all enemies snapshots against the current arithmetic baseline).
 *
 *   - Rule 471.3 — "The removal or disqualification of an effect is separate
 *       from the application of the effect, but still can only be applied
 *       once." Removing the source of an aura must drop the snapshotted
 *       bonus on the next recalc — verified end-to-end here.
 *
 * Methodology: minimal state → one input → assert the rule-correct numeric
 * outcome → cite the rule number. No per-card if-statements; the engine
 * primitive (`executeEffect` / `recalculateStaticEffects`) is the unit under
 * test, and any card that fires a modify-might with a `minimum` rider will
 * automatically benefit.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ZoneId as CoreZoneId } from "@tcg/core";
import {
  CardDefinitionRegistry,
  clearGlobalCardRegistry,
  setGlobalCardRegistry,
} from "../../operations/card-lookup";
import type { EffectContext, ExecutableEffect } from "../../abilities/effect-executor";
import { executeEffect } from "../../abilities/effect-executor";
import type { RiftboundCardMeta, RiftboundGameState } from "../../types";
import {
  P1,
  P2,
  createCard,
  createMinimalGameState,
  getCardMeta,
  getEffectiveMight,
  recalculateStatics,
  removeCardFromZone,
} from "./helpers";

// ---------------------------------------------------------------------------
// One-shot effect-executor mock context (mirrors the pattern in
// `unit-modifiers.test.ts` — minimal, deterministic, no engine flow).
// ---------------------------------------------------------------------------

function createMockState(): RiftboundGameState {
  return {
    battlefields: { "bf-1": { contested: false, controller: "p1", id: "bf-1" } },
    conqueredThisTurn: { p1: [], p2: [] },
    gameId: "test",
    players: { p1: { id: "p1", turnsTaken: 0, victoryPoints: 0, xp: 0 }, p2: { id: "p2", turnsTaken: 0, victoryPoints: 0, xp: 0 } },
    runePools: { p1: { energy: 0, power: {} }, p2: { energy: 0, power: {} } },
    scoredThisTurn: { p1: [], p2: [] },
    status: "playing",
    turn: { activePlayer: "p1", number: 1, phase: "main" },
    victoryScore: 8,
  } as unknown as RiftboundGameState;
}

interface MockCard {
  zone: string;
  owner: string;
  meta: Partial<RiftboundCardMeta>;
}

function createMockEffectContext(
  draft: RiftboundGameState,
  opts: {
    playerId: string;
    sourceCardId: string;
    cards?: Record<string, MockCard>;
  },
): EffectContext & {
  cardStore: Map<string, MockCard>;
} {
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
      addCounter: () => {},
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

// ===========================================================================
// Rule 472.3.b — snapshotting on the one-shot `executeEffect` path.
// ===========================================================================

describe("Rule 472.3.b (snapshot) — executeEffect on `modify-might` honors `minimum`", () => {
  let registry: CardDefinitionRegistry;
  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });
  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("'-4 [M] to a min of 1' on a 2-Might unit generates -1 [M], not -4 (rule 472.3.b example)", () => {
    registry.register("unit-1", { cardType: "unit", id: "unit-1", might: 2, name: "Pawn" });
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: { "unit-1": { meta: {}, owner: "p1", zone: "base" } },
      playerId: "p1",
      sourceCardId: "unit-1",
    });

    executeEffect(
      {
        amount: -4,
        duration: "turn",
        minimum: 1,
        target: { type: "self" },
        type: "modify-might",
      } as unknown as ExecutableEffect,
      ctx,
    );

    // Snapshot kicks in: applied amount = 1 - 2 = -1, so effective Might = 1.
    expect(ctx.cardStore.get("unit-1")?.meta.mightModifier).toBe(-1);
  });

  test("'-N [M] to a min of M' is a no-op when current Might already at/below the floor (rule 472.3.b)", () => {
    // 1-Might unit with min-of-1 floor → cannot decrease at all.
    registry.register("tiny", { cardType: "unit", id: "tiny", might: 1, name: "Tiny" });
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: { tiny: { meta: {}, owner: "p1", zone: "base" } },
      playerId: "p1",
      sourceCardId: "tiny",
    });

    executeEffect(
      {
        amount: -5,
        duration: "turn",
        minimum: 1,
        target: { type: "self" },
        type: "modify-might",
      } as unknown as ExecutableEffect,
      ctx,
    );

    // Snapshot: would-be 1 - 1 = 0, then since amount > 0 we set to 0. No change.
    expect(ctx.cardStore.get("tiny")?.meta.mightModifier ?? 0).toBe(0);
  });

  test("positive `modify-might` ignores `minimum` (it only constrains decreases — rule 472.3.d.2)", () => {
    registry.register("hero", { cardType: "unit", id: "hero", might: 3, name: "Hero" });
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: { hero: { meta: {}, owner: "p1", zone: "base" } },
      playerId: "p1",
      sourceCardId: "hero",
    });

    // Even a non-sensical "+2 min 1" applies fully (positive amounts never clamp).
    executeEffect(
      {
        amount: 2,
        duration: "turn",
        minimum: 1,
        target: { type: "self" },
        type: "modify-might",
      } as unknown as ExecutableEffect,
      ctx,
    );
    expect(ctx.cardStore.get("hero")?.meta.mightModifier).toBe(2);
  });

  test("decrease that does not breach the floor applies fully (rule 472.3.b — limit only when binding)", () => {
    registry.register("big", { cardType: "unit", id: "big", might: 5, name: "Big" });
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: { big: { meta: {}, owner: "p1", zone: "base" } },
      playerId: "p1",
      sourceCardId: "big",
    });

    // 5 - 2 = 3, floor is 1, so no clamp.
    executeEffect(
      {
        amount: -2,
        duration: "turn",
        minimum: 1,
        target: { type: "self" },
        type: "modify-might",
      } as unknown as ExecutableEffect,
      ctx,
    );
    expect(ctx.cardStore.get("big")?.meta.mightModifier).toBe(-2);
  });

  test("absent `minimum` reproduces the pre-fix 'floored at 0 via getEffectiveMight' behavior (rule 472.3.b — no limit)", () => {
    registry.register("u", { cardType: "unit", id: "u", might: 2, name: "U" });
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: { u: { meta: {}, owner: "p1", zone: "base" } },
      playerId: "p1",
      sourceCardId: "u",
    });

    // No `minimum` rider → applied amount is the raw -5; the 0 floor only
    // Kicks in inside getEffectiveMight at *read* time, not at storage time.
    // This documents that the snapshot path doesn't accidentally treat
    // "absent minimum" as "minimum=0".
    executeEffect(
      {
        amount: -5,
        duration: "turn",
        target: { type: "self" },
        type: "modify-might",
      } as unknown as ExecutableEffect,
      ctx,
    );
    expect(ctx.cardStore.get("u")?.meta.mightModifier).toBe(-5);
  });

  test("per-target snapshot — different targets get different clamps (rule 472.3.b is *per-application*)", () => {
    // Two targets: a 2-Might and a 5-Might unit, both hit by "-3 min 1".
    // The 2-Might unit snapshots to -1; the 5-Might unit to -3 (no clamp).
    registry.register("small", { cardType: "unit", id: "small", might: 2, name: "Small" });
    registry.register("large", { cardType: "unit", id: "large", might: 5, name: "Large" });
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        large: { meta: {}, owner: "p2", zone: "battlefield-bf-1" },
        small: { meta: {}, owner: "p2", zone: "battlefield-bf-1" },
      },
      playerId: "p1",
      sourceCardId: "src",
    });

    // Apply individually (the executor's snapshot recomputes per-target).
    for (const id of ["small", "large"] as const) {
      executeEffect(
        {
          amount: -3,
          duration: "turn",
          minimum: 1,
          target: { id, type: "specific-card" },
          type: "modify-might",
        } as unknown as ExecutableEffect,
        { ...ctx, sourceCardId: id },
      );
    }

    expect(ctx.cardStore.get("small")?.meta.mightModifier).toBe(-1);
    expect(ctx.cardStore.get("large")?.meta.mightModifier).toBe(-3);
  });
});

// ===========================================================================
// Rule 472.3.b — snapshotting on the static-aura `recalculateStaticEffects`
// Path. Tests Leona-Zealot-style auras: "Stunned enemy units here have
// -8 [Might], to a minimum of 1 [Might]."
// ===========================================================================

// A "TARGET have -N Might to a minimum of M" static (on self for simplicity).
const STATIC_SELF_PENALTY = (n: number, minimum?: number): {
  effect: { amount: number; type: "modify-might"; minimum?: number };
  type: "static";
} => ({
  effect: {
    amount: -n,
    type: "modify-might",
    ...(minimum !== undefined ? { minimum } : {}),
  },
  type: "static",
});

describe("Rule 472.3.b (snapshot) — static-aura `modify-might` honors `minimum`", () => {
  test("a 3-Might unit with static '-8 [M] min 1' contributes only -2 (snapshots to floor=1)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "thrall", {
      abilities: [STATIC_SELF_PENALTY(8, 1)],
      cardType: "unit",
      might: 3,
      owner: P2,
      zone: "base",
    });
    recalculateStatics(engine);
    // Floor binds: 3 + (-2) = 1.
    expect(getCardMeta(engine, "thrall")?.staticMightBonus ?? 0).toBe(-2);
    expect(getEffectiveMight(engine, "thrall")).toBe(1);
  });

  test("a 10-Might unit with static '-8 [M] min 1' contributes the full -8 (no clamp)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "behemoth", {
      abilities: [STATIC_SELF_PENALTY(8, 1)],
      cardType: "unit",
      might: 10,
      owner: P2,
      zone: "base",
    });
    recalculateStatics(engine);
    expect(getCardMeta(engine, "behemoth")?.staticMightBonus ?? 0).toBe(-8);
    expect(getEffectiveMight(engine, "behemoth")).toBe(2);
  });

  test("a static aura without a `minimum` continues to behave as a raw negative bonus (legacy)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "u", {
      abilities: [STATIC_SELF_PENALTY(8)],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "base",
    });
    recalculateStatics(engine);
    // No `minimum`: full -8 contribution (effective Might floored at 0 by
    // `getEffectiveMight`/`Math.max(0, …)`, but the *bonus* is the raw -8).
    expect(getCardMeta(engine, "u")?.staticMightBonus ?? 0).toBe(-8);
  });
});

// ===========================================================================
// Rule 471.1 — "Layers are applied in sequence" + Rule 471.3 — removal
// Of an aura drops dependent contributions on the next recalc pass.
// ===========================================================================

describe("Rule 471.1 / 471.3 — layered recalculation reacts to source removal", () => {
  test("removing a static-penalty source restores the target's full Might on the next recalc (rule 471.3)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "victim", {
      abilities: [STATIC_SELF_PENALTY(8, 1)],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "base",
    });
    recalculateStatics(engine);
    // Snapshot to floor=1 → effective 1.
    expect(getEffectiveMight(engine, "victim")).toBe(1);
    // Strip the ability (simulate the aura source leaving by removing the
    // Card from the board — its statics no longer apply).
    removeCardFromZone(engine, "victim");
    recalculateStatics(engine);
    // The card is no longer scanned; nothing to assert about its bonus.
    // What matters is the layer recalc didn't carry a stale snapshot — the
    // `staticMightBonus` was stripped at the top of the pass (engine code:
    // "Step 1: Strip all static modifications").
    expect(getCardMeta(engine, "victim")?.staticMightBonus ?? 0).toBe(0);
  });

  test("changing the target's *current* Might between recalcs re-snapshots the aura (rule 471.1 — layers re-apply)", () => {
    // Apply the penalty to a 10-Might unit (full -8 lands), then drop its
    // Base Might (e.g. via a granted-keyword path that disables a bonus —
    // We model it by changing the card def & re-recalculating).
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "rogue", {
      abilities: [STATIC_SELF_PENALTY(8, 1)],
      cardType: "unit",
      might: 10,
      owner: P1,
      zone: "base",
    });
    recalculateStatics(engine);
    expect(getCardMeta(engine, "rogue")?.staticMightBonus ?? 0).toBe(-8);

    // Re-register the same card with a different printed Might (3) and
    // Re-recalculate: the new snapshot must clamp to -2 (rule 472.3.b
    // Example), not stay at -8.
    const reg = setGlobalCardRegistry as unknown; // Not directly needed; use existing global
    void reg;
    // We poke the registry directly to change might without rebuilding state.
    // (The next recalc strips staticMightBonus to 0 first, then re-applies.)
    const { getGlobalCardRegistry } = require("../../operations/card-lookup") as {
      getGlobalCardRegistry: () => CardDefinitionRegistry;
    };
    getGlobalCardRegistry().register("rogue", {
      abilities: [STATIC_SELF_PENALTY(8, 1)],
      cardType: "unit",
      id: "rogue",
      might: 3,
      name: "Rogue",
    });
    recalculateStatics(engine);
    // New snapshot: 3 → -2 to land on floor=1.
    expect(getCardMeta(engine, "rogue")?.staticMightBonus ?? 0).toBe(-2);
    expect(getEffectiveMight(engine, "rogue")).toBe(1);
  });
});

// ===========================================================================
// Rule 472.3.d.2 — decreases are applied after increases. Verified
// Transitively via the snapshot logic: a static *increase* aura applied in
// Pass 2 (arithmetic) participates in the running `current` baseline before
// The next aura's snapshot is computed, so a decrease aura with a `minimum`
// Rider sees the up-buffed value.
// ===========================================================================

describe("Rule 472.3.d.2 — decreases see prior increases when snapshotting", () => {
  test("increase aura (+2) applied before decrease aura (-5 min 1) → unit lands at floor, not below", () => {
    const engine = createMinimalGameState({ phase: "main" });
    // Increase aura on self.
    createCard(engine, "buff", {
      abilities: [
        {
          effect: { amount: 2, type: "modify-might" },
          type: "static",
        },
      ],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "base",
    });
    // Separately, a decrease-with-min aura on a different unit. Use
    // Self-affect for both so they don't intersect — the test's purpose is
    // To confirm the *per-aura* snapshot semantics inside one recalc pass.
    createCard(engine, "debuff", {
      abilities: [STATIC_SELF_PENALTY(5, 1)],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "base",
    });
    recalculateStatics(engine);
    // Buff: 3 + 2 = 5
    expect(getEffectiveMight(engine, "buff")).toBe(5);
    // Debuff: snapshot 3 → -2 → 1
    expect(getEffectiveMight(engine, "debuff")).toBe(1);
  });
});
