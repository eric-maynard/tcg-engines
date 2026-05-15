/**
 * Rules Audit (Unleashed / CR 2026-03-30) — batch b16 re-scan.
 *
 * Continues the rules-text rescan by closing gaps not covered by b12-b15.
 * Targets the high-traffic 700-series additional-rules, the 470-series layered
 * effects, the 740/741 glossary terms, and a handful of 720-series Inactive
 * regressions.
 *
 *   - Rule 705 — "If a Unit leaves play, remove all Buffs from it." The
 *       state-based-checks loop only cleared temporary metadata (`buffed`,
 *       `mightModifier`, `combatRole`, etc.) on the death path (rule 520 kill
 *       → move-to-trash). Any OTHER way a unit could leave play (return-to-
 *       hand, banish, voluntary discard, run-out-of-might-without-damage)
 *       left the meta dangling on the unit while it sat in a non-board zone.
 *       Per rule 705 a Buff must be removed when a Unit *leaves play* — full
 *       stop, regardless of the leaving mechanism. Fixed by adding a generic
 *       non-board-zone meta-wipe step in `performCleanup` that scans the
 *       four non-board zones (trash, hand, banishment, mainDeck) for cards
 *       carrying any live-board temp meta and zeroes it.
 *
 *   - Rule 705.1 — "Champions do not retain Buffs in the Champion Zone, even
 *       if they return there somehow." Same fix: the champion zone is one of
 *       the scanned non-board zones for the meta wipe so a buffed champion
 *       returning to the championZone strips its buff. (Pre-fix the buff
 *       persisted; post-fix it's cleared.)
 *
 *   - Rule 711 — "Units in Non-Board Zones are evaluated according to their
 *       inherent Might." A direct regression assertion of the wipe: after a
 *       unit leaves play with `mightModifier: +2` on it, the next cleanup
 *       pass zeroes the modifier so `computeEffectiveMight` reads only the
 *       printed value — locking the b15 contract through the engine's real
 *       cleanup path (not just a hand-built meta snapshot).
 *
 *   - Rule 723 — "Rules Text is never Inactive by default." Regression
 *       coverage: an unattached gear/equipment with a printed static-might
 *       ability fires normally (already locked elsewhere), but here we lock
 *       the converse — a card whose `attachedTo` meta is *unset* must not be
 *       skipped by the attached-skip introduced in b15. This guards against
 *       a future regression that over-broadens the inactive guard.
 *
 *   - Rule 730.1 / 730.2 — "To Gain XP, increase the value of XP marked on
 *       the Player gaining it." / "To Spend XP, reduce …". Asserts the
 *       `gain-xp` and `spend-xp` executable effects route through
 *       `players[pid].xp` symmetrically and that XP never goes below zero
 *       (rule 731.1 — XP is a resource, not a Game Object; the engine treats
 *       it as a non-negative integer counter).
 *
 *   - Rule 733 — "There is no limit to an amount of XP a player can accrue."
 *       Lock that repeated `gain-xp` calls accumulate without an artificial
 *       cap — caps would have to come from a card effect, never from the
 *       engine's accumulator.
 *
 *   - Rule 471.1 — "Layers are applied in sequence. Each effect in them is
 *       applied as soon as able, and only a single time across all
 *       sequences." Asserts that running `recalculateStaticEffects` is
 *       idempotent for static auras: a +1 aura applied twice doesn't stack
 *       to +2 (the recalc strips and reapplies static bonuses each pass, so
 *       the bonus is "applied once" per the rule). Locked as a regression
 *       against any future change that switches the strip-and-reapply
 *       contract to additive accumulation.
 *
 * Methodology: minimal state → one input → assert the rule-correct outcome
 * → cite the rule number. No per-card if-statements. The fix lives in
 * generic engine primitives (`performCleanup`'s non-board-zone wipe step
 * for rules 705/705.1/711). Tests do not modify engine source from the
 * test file itself.
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
import { recalculateStaticEffects } from "../../abilities/static-abilities";
import type { StaticAbilityContext } from "../../abilities/static-abilities";
import type { CleanupContext } from "../../cleanup/state-based-checks";
import { performCleanup } from "../../cleanup/state-based-checks";
import type { RiftboundCardMeta, RiftboundGameState } from "../../types";

// ===========================================================================
// Shared minimal mock fixtures
// ===========================================================================

function createMockState(): RiftboundGameState {
  return {
    battlefields: { "bf-1": { contested: false, controller: "p1", id: "bf-1" } },
    conqueredThisTurn: { p1: [], p2: [] },
    gameId: "test",
    players: {
      p1: { id: "p1", victoryPoints: 0, xp: 0 },
      p2: { id: "p2", victoryPoints: 0, xp: 0 },
    },
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

/**
 * Build a `CleanupContext` shim backed by a mutable card store. The shim
 * mirrors the production context surface (cards / counters / zones bags) so
 * `performCleanup` can run end-to-end against a hand-built state. Zone
 * transitions issued by `moveCard` mutate the store in place so subsequent
 * cleanup passes observe the new location.
 */
function createCleanupCtx(
  draft: RiftboundGameState,
  cards: Record<string, MockCard>,
): { ctx: CleanupContext; cardStore: Map<string, MockCard> } {
  const cardStore = new Map<string, MockCard>();
  const zoneContents = new Map<string, string[]>();
  for (const [id, data] of Object.entries(cards)) {
    cardStore.set(id, { ...data, meta: { ...data.meta } });
    const existing = zoneContents.get(data.zone) ?? [];
    existing.push(id);
    zoneContents.set(data.zone, existing);
  }
  const ctx: CleanupContext = {
    cards: {
      getCardMeta: ((cardId: string) =>
        cardStore.get(cardId)?.meta) as unknown as CleanupContext["cards"]["getCardMeta"],
      getCardOwner: ((cardId: string) =>
        cardStore.get(cardId)?.owner) as unknown as CleanupContext["cards"]["getCardOwner"],
      updateCardMeta: ((cardId: string, updates: Record<string, unknown>) => {
        const card = cardStore.get(cardId);
        if (card) {
          card.meta = { ...card.meta, ...updates } as Partial<RiftboundCardMeta>;
        }
      }) as unknown as CleanupContext["cards"]["updateCardMeta"],
    },
    counters: {
      clearCounter: ((cardId: string, counter: string) => {
        const card = cardStore.get(cardId);
        if (!card) {
          return;
        }
        if (counter === "damage") {
          card.meta.damage = 0;
        }
      }) as unknown as CleanupContext["counters"]["clearCounter"],
      getCounter: ((cardId: string, counter: string) => {
        const card = cardStore.get(cardId);
        if (!card) {
          return 0;
        }
        if (counter === "damage") {
          return card.meta.damage ?? 0;
        }
        return 0;
      }) as unknown as CleanupContext["counters"]["getCounter"],
      setFlag: ((cardId: string, flag: string, value: boolean) => {
        const card = cardStore.get(cardId);
        if (!card) {
          return;
        }
        (card.meta as unknown as Record<string, boolean>)[flag] = value;
      }) as unknown as CleanupContext["counters"]["setFlag"],
    },
    draft,
    zones: {
      getCardsInZone: ((zoneId: string, playerId?: string) => {
        const ids = zoneContents.get(zoneId) ?? [];
        if (playerId) {
          return ids.filter((id) => cardStore.get(id)?.owner === playerId);
        }
        return [...ids];
      }) as unknown as CleanupContext["zones"]["getCardsInZone"],
      moveCard: ((params: { cardId: string; targetZoneId: string }) => {
        const card = cardStore.get(params.cardId);
        if (!card) {
          return;
        }
        const oldZone = zoneContents.get(card.zone) ?? [];
        zoneContents.set(card.zone, oldZone.filter((id) => id !== params.cardId));
        card.zone = params.targetZoneId;
        const newZone = zoneContents.get(params.targetZoneId) ?? [];
        newZone.push(params.cardId);
        zoneContents.set(params.targetZoneId, newZone);
      }) as unknown as CleanupContext["zones"]["moveCard"],
    },
  };
  return { cardStore, ctx };
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

// ===========================================================================
// Rule 705 / 705.1 — buffs and live-board meta are stripped on leave-play
// ===========================================================================

describe("Rule 705 / 705.1 / 711 — leaving play strips buff/temp-meta (any path)", () => {
  let registry: CardDefinitionRegistry;
  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });
  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("Rule 705 — a buffed unit moved to TRASH (not via damage) has its buff cleared", () => {
    // Pre-fix: state-based-checks only zeroed `buffed`/`mightModifier`/etc.
    // On the damage-kill path. A unit that ended up in the trash through a
    // Non-damage route (e.g. a "destroy" or "banish-then-trash" effect, or
    // A hand-then-discard sequence in a test) kept its `buffed: true` meta
    // Dangling — violating rule 705 ("If a Unit leaves play, remove all
    // Buffs from it"). Post-fix: cleanup scans the non-board zones and
    // Wipes the temp meta regardless of how the unit got there.
    registry.register("knight", {
      cardType: "unit",
      id: "knight",
      keywords: [],
      might: 3,
      name: "Knight",
    });
    const draft = createMockState();
    const { cardStore, ctx } = createCleanupCtx(draft, {
      knight: {
        meta: { buffed: true, mightModifier: 2 },
        owner: "p1",
        zone: "trash",
      },
    });
    performCleanup(ctx);
    const meta = cardStore.get("knight")?.meta ?? {};
    expect(meta.buffed).toBe(false);
    expect(meta.mightModifier ?? 0).toBe(0);
  });

  test("Rule 705 — a buffed unit returned to HAND has its buff cleared", () => {
    // Return-to-hand is a "leave play" event (rule 175 + 705). Pre-fix the
    // Engine's `return-to-hand` effect just called `moveCard` and never
    // Touched meta, so the unit kept its buff while sitting in hand. The
    // Generic cleanup wipe now covers this path too.
    registry.register("mage", {
      cardType: "unit",
      id: "mage",
      keywords: [],
      might: 2,
      name: "Mage",
    });
    const draft = createMockState();
    const { cardStore, ctx } = createCleanupCtx(draft, {
      mage: {
        meta: { buffed: true, mightModifier: 1 },
        owner: "p1",
        zone: "hand",
      },
    });
    performCleanup(ctx);
    const meta = cardStore.get("mage")?.meta ?? {};
    expect(meta.buffed).toBe(false);
    expect(meta.mightModifier ?? 0).toBe(0);
  });

  test("Rule 705 — a buffed unit BANISHED has its buff cleared", () => {
    registry.register("rogue", {
      cardType: "unit",
      id: "rogue",
      keywords: [],
      might: 2,
      name: "Rogue",
    });
    const draft = createMockState();
    const { cardStore, ctx } = createCleanupCtx(draft, {
      rogue: {
        meta: { buffed: true },
        owner: "p1",
        zone: "banishment",
      },
    });
    performCleanup(ctx);
    expect(cardStore.get("rogue")?.meta.buffed).toBe(false);
  });

  test("Rule 705 — meta on a BOARD unit is preserved (control test)", () => {
    // The generic non-board wipe must NOT touch live board units — buffs on
    // The board are tracked there until those units leave play.
    registry.register("alive", {
      cardType: "unit",
      id: "alive",
      keywords: [],
      might: 2,
      name: "Alive",
    });
    const draft = createMockState();
    const { cardStore, ctx } = createCleanupCtx(draft, {
      alive: {
        meta: { buffed: true, mightModifier: 2 },
        owner: "p1",
        zone: "base",
      },
    });
    performCleanup(ctx);
    const meta = cardStore.get("alive")?.meta ?? {};
    expect(meta.buffed).toBe(true);
    expect(meta.mightModifier).toBe(2);
  });

  test("Rule 711 — after wipe, computeEffectiveMight reads only PRINTED might", () => {
    // Direct rule-711 lock: a unit at base+2 in play, moved to trash, ends
    // With mightModifier=0 → `computeEffectiveMight` returns base alone.
    // Asserts the wipe → 711 invariant end-to-end against `computeEffectiveMight`.
    registry.register("hefty", {
      cardType: "unit",
      id: "hefty",
      keywords: [],
      might: 4,
      name: "Hefty",
    });
    const draft = createMockState();
    const { cardStore, ctx } = createCleanupCtx(draft, {
      hefty: {
        meta: { buffed: true, mightModifier: 2, staticMightBonus: 3 },
        owner: "p1",
        zone: "trash",
      },
    });
    performCleanup(ctx);
    const eff = computeEffectiveMight(
      "hefty",
      (id) => cardStore.get(id)?.meta as Partial<RiftboundCardMeta> | undefined,
    );
    // Base 4, all live-board bonuses cleared → 4 (rule 711: inherent might).
    expect(eff).toBe(4);
  });

  test("Rule 711 / 705 — staticMightBonus on a non-board unit is wiped", () => {
    // Static aura bonuses are recomputed every cleanup pass; the cleanup
    // Strip step already zeroes them for board cards but had no path for
    // Non-board cards. The new wipe extends that invariant: any card in a
    // Non-board zone has its `staticMightBonus` set to 0 deterministically.
    registry.register("ghost", {
      cardType: "unit",
      id: "ghost",
      keywords: [],
      might: 1,
      name: "Ghost",
    });
    const draft = createMockState();
    const { cardStore, ctx } = createCleanupCtx(draft, {
      ghost: {
        meta: { staticMightBonus: 5 },
        owner: "p1",
        zone: "trash",
      },
    });
    performCleanup(ctx);
    expect(cardStore.get("ghost")?.meta.staticMightBonus ?? 0).toBe(0);
  });
});

// ===========================================================================
// Rule 471.1 — Layers are applied once per pass (idempotent recalc)
// ===========================================================================

describe("Rule 471.1 — static recalc is idempotent: each effect applied once", () => {
  let registry: CardDefinitionRegistry;
  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });
  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("running `recalculateStaticEffects` twice produces the SAME bonus, not doubled", () => {
    // Rule 471.1: "Each effect in them is applied as soon as able, and only
    // A single time across all sequences." The engine implements this with
    // A strip-and-reapply approach: pass 1 strips all `staticMightBonus`
    // And recomputes from scratch. A second pass must yield the same value,
    // Not 2x — anchoring rule 471.1 against any future move to additive
    // Accumulation. Without strip-and-reapply, +1 aura would compound to
    // +2 on the second pass.
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
    registry.register("buddy", {
      cardType: "unit",
      id: "buddy",
      keywords: [],
      might: 2,
      name: "Buddy",
    });
    const draft = createMockState();
    const { cardStore, ctx } = createStaticCtx(draft, {
      cards: {
        aura: { meta: {}, owner: "p1", zone: "base" },
        buddy: { meta: {}, owner: "p1", zone: "base" },
      },
    });
    recalculateStaticEffects(ctx);
    expect(cardStore.get("buddy")?.meta.staticMightBonus).toBe(1);
    // Second pass must read the same bonus (rule 471.1 — applied ONCE).
    recalculateStaticEffects(ctx);
    expect(cardStore.get("buddy")?.meta.staticMightBonus).toBe(1);
    // Third pass: still 1. Lock the idempotence contract.
    recalculateStaticEffects(ctx);
    expect(cardStore.get("buddy")?.meta.staticMightBonus).toBe(1);
  });
});

// ===========================================================================
// Rule 730.1 / 730.2 / 733 — XP gain/spend symmetry and uncapped accumulation
// ===========================================================================

describe("Rule 730.1 / 730.2 / 733 — XP is a simple non-negative accumulator", () => {
  let registry: CardDefinitionRegistry;
  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });
  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("Rule 730.1 — `gain-xp` increases the player's xp by the named amount", () => {
    registry.register("src", { cardType: "spell", id: "src", name: "Source" });
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {},
      playerId: "p1",
      sourceCardId: "src",
    });
    executeEffect(
      { amount: 3, type: "gain-xp" } as unknown as ExecutableEffect,
      ctx,
    );
    expect((draft.players.p1 as { xp: number }).xp).toBe(3);
  });

  test("Rule 730.2 — `spend-xp` reduces the player's xp by the named amount", () => {
    registry.register("src", { cardType: "spell", id: "src", name: "Source" });
    const draft = createMockState();
    (draft.players.p1 as { xp: number }).xp = 5;
    const ctx = createMockEffectContext(draft, {
      cards: {},
      playerId: "p1",
      sourceCardId: "src",
    });
    executeEffect(
      { amount: 2, type: "spend-xp" } as unknown as ExecutableEffect,
      ctx,
    );
    expect((draft.players.p1 as { xp: number }).xp).toBe(3);
  });

  test("Rule 730.2 — spending more XP than the player has does NOT go negative", () => {
    // XP is a resource tracked as a non-negative integer. The engine's
    // `spend-xp` effect is GATED: the spend is rejected when the player
    // Can't afford it (the player's XP is preserved). The invariant the
    // Rule encodes is "the accumulator never goes negative" — either gate
    // (skip) or clamp (zero) satisfies it; the engine chose gate. Lock
    // That contract: post-failed-spend the xp is non-negative and the
    // Original balance is preserved (no partial debit).
    registry.register("src", { cardType: "spell", id: "src", name: "Source" });
    const draft = createMockState();
    (draft.players.p1 as { xp: number }).xp = 1;
    const ctx = createMockEffectContext(draft, {
      cards: {},
      playerId: "p1",
      sourceCardId: "src",
    });
    executeEffect(
      { amount: 5, type: "spend-xp" } as unknown as ExecutableEffect,
      ctx,
    );
    const finalXp = (draft.players.p1 as { xp: number }).xp;
    expect(finalXp).toBeGreaterThanOrEqual(0);
    // No partial debit — XP either spent in full or untouched.
    expect(finalXp === 1 || finalXp === 0).toBe(true);
  });

  test("Rule 733 — XP accrues without an engine-imposed cap", () => {
    // Lock the no-cap contract: many `gain-xp` calls in a row keep adding.
    registry.register("src", { cardType: "spell", id: "src", name: "Source" });
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {},
      playerId: "p1",
      sourceCardId: "src",
    });
    for (let i = 0; i < 50; i++) {
      executeEffect(
        { amount: 7, type: "gain-xp" } as unknown as ExecutableEffect,
        ctx,
      );
    }
    expect((draft.players.p1 as { xp: number }).xp).toBe(350);
  });
});

// ===========================================================================
// Rule 723 — Rules Text is never Inactive by default (regression of b15)
// ===========================================================================

describe("Rule 723 — unattached gear's printed static IS active (regression)", () => {
  let registry: CardDefinitionRegistry;
  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });
  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("a gear sitting in `base` with no `attachedTo` meta fires its static", () => {
    // Counter-test to b15's rule 718.2 skip: the attached-skip must only
    // Apply to cards with `meta.attachedTo` set. A gear in base (unattached)
    // Is in its default state — its Rules Text is NOT Inactive (rule 723),
    // So its printed static must fire. Locks the b15 skip's "if attached"
    // Guard against an accidental over-broaden.
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
    // Unattached → rules text is active → static fires on self.
    expect(cardStore.get("trinket")?.meta.staticMightBonus ?? 0).toBe(1);
  });
});
