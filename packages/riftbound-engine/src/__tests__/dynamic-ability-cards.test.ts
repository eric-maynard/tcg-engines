/**
 * Dynamic Ability Card Primitives
 *
 * Covers engine behavior for three cards whose abilities cannot be expressed
 * as plain ability definitions and instead rely on engine-level primitives:
 *
 * - Heimerdinger, Inventor (ogn-111-298): inherits every exhaust-cost
 *   activated ability from friendly legends/units/gear. The enumerator in
 *   `chain-moves.collectActivatedAbilities` scans the friendly board and
 *   surfaces those abilities as activatable on the host card.
 *
 * - Svellsongur (sfd-059-221): copies its attached unit's activated
 *   abilities while attached. The `equipCard` reducer writes the unit's
 *   instance ID into the equipment's `copiedFromCardId` meta; the same
 *   enumerator then exposes the unit's abilities on the equipment.
 *
 * - The Zero Drive (sfd-090-221): per-instance private exile zone. The
 *   `banish` effect executor records banished targets into the source's
 *   `exiledByThis` meta; `performCleanup` returns those cards when the
 *   source later leaves the board.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import { executeEffect } from "../abilities/effect-executor";
import type { EffectContext, ExecutableEffect } from "../abilities/effect-executor";
import { performCleanup } from "../cleanup";
import type { CleanupContext } from "../cleanup";
import { chainMoves } from "../game-definition/moves/chain-moves";
import {
  CardDefinitionRegistry,
  clearGlobalCardRegistry,
  setGlobalCardRegistry,
} from "../operations/card-lookup";
import type { RiftboundCardMeta, RiftboundGameState } from "../types";

// ============================================================================
// Test Harness
// ============================================================================

interface CardData {
  zone: string;
  owner: string;
  meta: Partial<RiftboundCardMeta>;
}

function createMockState(overrides?: Partial<RiftboundGameState>): RiftboundGameState {
  return {
    battlefields: {
      "bf-1": { contested: false, controller: "p1", id: "bf-1" },
    },
    conqueredThisTurn: { p1: [], p2: [] },
    gameId: "test",
    players: {
      p1: { id: "p1", turnsTaken: 1, victoryPoints: 0, victoryScoreModifier: 0, xp: 0 },
      p2: { id: "p2", turnsTaken: 1, victoryPoints: 0, victoryScoreModifier: 0, xp: 0 },
    },
    runePools: {
      p1: { energy: 10, power: { calm: 5, fury: 5, mind: 5 } },
      p2: { energy: 10, power: {} },
    },
    scoredThisTurn: { p1: [], p2: [] },
    status: "playing",
    turn: { activePlayer: "p1", number: 1, phase: "main" },
    victoryScore: 8,
    xpGainedThisTurn: { p1: 0, p2: 0 },
    ...overrides,
  } as RiftboundGameState;
}

function createHarness(cardData: Record<string, CardData>) {
  const cardStore = new Map<string, CardData>(Object.entries(cardData));
  const zoneContents = new Map<string, string[]>();

  for (const [cardId, data] of cardStore) {
    const existing = zoneContents.get(data.zone) ?? [];
    existing.push(cardId);
    zoneContents.set(data.zone, existing);
  }

  const zones = {
    drawCards: () => [],
    getCardZone: ((cardId: CoreCardId) =>
      cardStore.get(cardId as string)?.zone as string | undefined) as unknown as (
      cardId: CoreCardId,
    ) => CoreZoneId | undefined,
    getCardsInZone: ((zoneId: CoreZoneId, playerId?: CorePlayerId) => {
      const cards = zoneContents.get(zoneId as string) ?? [];
      if (playerId) {
        return cards.filter((id) => cardStore.get(id)?.owner === (playerId as string));
      }
      return [...cards];
    }) as unknown as (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[],
    moveCard: (params: { cardId: CoreCardId; targetZoneId: CoreZoneId }) => {
      const cardId = params.cardId as string;
      const targetZone = params.targetZoneId as string;
      for (const [_zone, cards] of zoneContents) {
        const idx = cards.indexOf(cardId);
        if (idx !== -1) {
          cards.splice(idx, 1);
          break;
        }
      }
      const target = zoneContents.get(targetZone) ?? [];
      target.push(cardId);
      zoneContents.set(targetZone, target);
      const card = cardStore.get(cardId);
      if (card) {
        card.zone = targetZone;
      }
    },
  };

  const cards = {
    getCardMeta: ((cardId: CoreCardId) => cardStore.get(cardId as string)?.meta) as unknown as (
      cardId: CoreCardId,
    ) => Partial<RiftboundCardMeta> | undefined,
    getCardOwner: ((cardId: CoreCardId) => cardStore.get(cardId as string)?.owner) as unknown as (
      cardId: CoreCardId,
    ) => string | undefined,
    updateCardMeta: ((cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => {
      const card = cardStore.get(cardId as string);
      if (card) {
        card.meta = { ...card.meta, ...meta };
      }
    }) as unknown as (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void,
  };

  const counters = {
    addCounter: () => {},
    clearCounter: () => {},
    removeCounter: () => {},
    setFlag: (cardId: CoreCardId, flag: string, value: boolean) => {
      const card = cardStore.get(cardId as string);
      if (card) {
        (card.meta as Record<string, unknown>)[flag] = value;
      }
    },
  };

  return { cardStore, cards, counters, zoneContents, zones };
}

// ============================================================================
// Heimerdinger, Inventor — exhaust-ability inheritance
// ============================================================================

describe("Heimerdinger, Inventor: inherits exhaust abilities", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("enumerator surfaces a friendly gear's exhaust ability on Heimerdinger", () => {
    // Heimerdinger with the inheritance marker flag.
    registry.register("heimer-1", {
      abilities: [],
      cardType: "unit",
      id: "heimer-1",
      inheritExhaustAbilities: true,
      might: 3,
      name: "Heimerdinger, Inventor",
    });

    // Friendly gear with an exhaust ability: ":exhaust:: Draw 1"
    registry.register("draw-gear", {
      abilities: [
        {
          cost: { exhaust: true },
          effect: { amount: 1, type: "draw" },
          type: "activated",
        },
      ],
      cardType: "gear",
      id: "draw-gear",
      name: "Mystery Engine",
    });

    // Friendly unit with a non-exhaust ability — should NOT be inherited.
    registry.register("energy-unit", {
      abilities: [
        {
          cost: { energy: 1 },
          effect: { amount: 1, type: "draw" },
          type: "activated",
        },
      ],
      cardType: "unit",
      id: "energy-unit",
      might: 2,
      name: "Energy Mage",
    });

    const state = createMockState();
    const harness = createHarness({
      "draw-gear": {
        meta: {
          buffed: false,
          combatRole: null,
          damage: 0,
          exhausted: false,
          hidden: false,
          stunned: false,
        },
        owner: "p1",
        zone: "base",
      },
      "energy-unit": {
        meta: {
          buffed: false,
          combatRole: null,
          damage: 0,
          exhausted: false,
          hidden: false,
          stunned: false,
        },
        owner: "p1",
        zone: "base",
      },
      "heimer-1": {
        meta: {
          buffed: false,
          combatRole: null,
          damage: 0,
          exhausted: false,
          hidden: false,
          stunned: false,
        },
        owner: "p1",
        zone: "base",
      },
    });

    const context = {
      cards: harness.cards,
      counters: harness.counters,
      playerId: "p1" as CorePlayerId,
      zones: harness.zones,
    };

    const enumerator = chainMoves.activateAbility!.enumerator!;
    const results = enumerator(state, context as unknown as Parameters<typeof enumerator>[1]);

    // The enumerator should surface the draw-gear's exhaust ability on heimer-1
    // As an activation whose sourceCardId is draw-gear.
    const heimerInheritedEntries = results.filter(
      (r) => r.cardId === "heimer-1" && r.sourceCardId === "draw-gear",
    );
    expect(heimerInheritedEntries.length).toBe(1);

    // The non-exhaust energy-cost ability on the other friendly unit should
    // NOT be surfaced as an inherited ability on Heimerdinger.
    const heimerNonInherited = results.filter(
      (r) => r.cardId === "heimer-1" && r.sourceCardId === "energy-unit",
    );
    expect(heimerNonInherited.length).toBe(0);

    // The friendly gear's own ability also surfaces on itself.
    const gearOwn = results.filter((r) => r.cardId === "draw-gear" && r.sourceCardId === undefined);
    expect(gearOwn.length).toBe(1);
  });

  test("does not inherit abilities from enemy cards", () => {
    registry.register("heimer-1", {
      abilities: [],
      cardType: "unit",
      id: "heimer-1",
      inheritExhaustAbilities: true,
      might: 3,
      name: "Heimerdinger",
    });
    registry.register("enemy-gear", {
      abilities: [
        {
          cost: { exhaust: true },
          effect: { amount: 1, type: "draw" },
          type: "activated",
        },
      ],
      cardType: "gear",
      id: "enemy-gear",
      name: "Enemy Engine",
    });

    const state = createMockState();
    const harness = createHarness({
      "enemy-gear": {
        meta: {
          buffed: false,
          combatRole: null,
          damage: 0,
          exhausted: false,
          hidden: false,
          stunned: false,
        },
        owner: "p2",
        zone: "base",
      },
      "heimer-1": {
        meta: {
          buffed: false,
          combatRole: null,
          damage: 0,
          exhausted: false,
          hidden: false,
          stunned: false,
        },
        owner: "p1",
        zone: "base",
      },
    });

    const context = {
      cards: harness.cards,
      counters: harness.counters,
      playerId: "p1" as CorePlayerId,
      zones: harness.zones,
    };

    const enumerator = chainMoves.activateAbility!.enumerator!;
    const results = enumerator(state, context as unknown as Parameters<typeof enumerator>[1]);

    // No inheritance from enemy-owned gear.
    const inheritedFromEnemy = results.filter(
      (r) => r.cardId === "heimer-1" && r.sourceCardId === "enemy-gear",
    );
    expect(inheritedFromEnemy.length).toBe(0);
  });

  test("non-Heimerdinger unit does not inherit abilities", () => {
    registry.register("plain-unit", {
      abilities: [],
      cardType: "unit",
      id: "plain-unit",
      might: 3,
      name: "Plain Unit",
    });
    registry.register("draw-gear", {
      abilities: [
        {
          cost: { exhaust: true },
          effect: { amount: 1, type: "draw" },
          type: "activated",
        },
      ],
      cardType: "gear",
      id: "draw-gear",
      name: "Draw Gear",
    });

    const state = createMockState();
    const harness = createHarness({
      "draw-gear": {
        meta: {
          buffed: false,
          combatRole: null,
          damage: 0,
          exhausted: false,
          hidden: false,
          stunned: false,
        },
        owner: "p1",
        zone: "base",
      },
      "plain-unit": {
        meta: {
          buffed: false,
          combatRole: null,
          damage: 0,
          exhausted: false,
          hidden: false,
          stunned: false,
        },
        owner: "p1",
        zone: "base",
      },
    });

    const context = {
      cards: harness.cards,
      counters: harness.counters,
      playerId: "p1" as CorePlayerId,
      zones: harness.zones,
    };

    const enumerator = chainMoves.activateAbility!.enumerator!;
    const results = enumerator(state, context as unknown as Parameters<typeof enumerator>[1]);

    const plainInherited = results.filter(
      (r) => r.cardId === "plain-unit" && r.sourceCardId !== undefined,
    );
    expect(plainInherited.length).toBe(0);
  });
});

// ============================================================================
// Svellsongur — copies attached unit's abilities
// ============================================================================

describe("Svellsongur: copies attached unit's abilities", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("enumerator surfaces copied abilities when copiedFromCardId meta is set", () => {
    registry.register("svell-1", {
      abilities: [],
      cardType: "equipment",
      copyAttachedUnitText: true,
      id: "svell-1",
      mightBonus: 0,
      name: "Svellsongur",
    });

    registry.register("host-unit", {
      abilities: [
        {
          cost: { exhaust: true },
          effect: { amount: 1, type: "draw" },
          type: "activated",
        },
      ],
      cardType: "unit",
      id: "host-unit",
      might: 4,
      name: "Host Unit",
    });

    const state = createMockState();
    // Attached: svell-1.copiedFromCardId points to host-unit.
    const harness = createHarness({
      "host-unit": {
        meta: {
          buffed: false,
          combatRole: null,
          damage: 0,
          equippedWith: ["svell-1"],
          exhausted: false,
          hidden: false,
          stunned: false,
        },
        owner: "p1",
        zone: "base",
      },
      "svell-1": {
        meta: {
          attachedTo: "host-unit",
          buffed: false,
          combatRole: null,
          copiedFromCardId: "host-unit",
          damage: 0,
          exhausted: false,
          hidden: false,
          stunned: false,
        },
        owner: "p1",
        zone: "base",
      },
    });

    const context = {
      cards: harness.cards,
      counters: harness.counters,
      playerId: "p1" as CorePlayerId,
      zones: harness.zones,
    };

    const enumerator = chainMoves.activateAbility!.enumerator!;
    const results = enumerator(state, context as unknown as Parameters<typeof enumerator>[1]);

    // The host unit's exhaust ability should be exposed on svell-1 via
    // The copiedFromCardId meta — sourceCardId on the entry is "host-unit".
    const svellCopies = results.filter(
      (r) => r.cardId === "svell-1" && r.sourceCardId === "host-unit",
    );
    expect(svellCopies.length).toBe(1);
  });

  test("does not expose copied abilities when copiedFromCardId meta is unset", () => {
    registry.register("svell-1", {
      abilities: [],
      cardType: "equipment",
      copyAttachedUnitText: true,
      id: "svell-1",
      mightBonus: 0,
      name: "Svellsongur",
    });

    const state = createMockState();
    const harness = createHarness({
      "svell-1": {
        meta: {
          buffed: false,
          combatRole: null,
          damage: 0,
          exhausted: false,
          hidden: false,
          stunned: false,
        },
        owner: "p1",
        zone: "base",
      },
    });

    const context = {
      cards: harness.cards,
      counters: harness.counters,
      playerId: "p1" as CorePlayerId,
      zones: harness.zones,
    };

    const enumerator = chainMoves.activateAbility!.enumerator!;
    const results = enumerator(state, context as unknown as Parameters<typeof enumerator>[1]);

    // Unattached Svellsongur exposes no abilities (its own list is empty).
    const svellEntries = results.filter((r) => r.cardId === "svell-1");
    expect(svellEntries.length).toBe(0);
  });
});

// ============================================================================
// The Zero Drive — per-instance exile tracking
// ============================================================================

describe("The Zero Drive: per-instance exile tracking", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("banish effect records target ID on tracksExiledCards source's meta", () => {
    registry.register("zero-drive-1", {
      abilities: [],
      cardType: "equipment",
      id: "zero-drive-1",
      mightBonus: 2,
      name: "The Zero Drive",
      tracksExiledCards: true,
    });
    registry.register("victim-1", {
      cardType: "unit",
      id: "victim-1",
      might: 3,
      name: "Victim",
    });

    const state = createMockState();
    const harness = createHarness({
      "victim-1": {
        meta: {
          buffed: false,
          combatRole: null,
          damage: 0,
          exhausted: false,
          hidden: false,
          stunned: false,
        },
        owner: "p2",
        zone: "battlefield-bf-1",
      },
      "zero-drive-1": {
        meta: {
          buffed: false,
          combatRole: null,
          damage: 0,
          exhausted: false,
          hidden: false,
          stunned: false,
        },
        owner: "p1",
        zone: "base",
      },
    });

    const effectCtx: EffectContext = {
      cards: harness.cards as unknown as EffectContext["cards"],
      counters: harness.counters,
      draft: state,
      playerId: "p1",
      sourceCardId: "zero-drive-1",
      sourceZone: "base",
      zones: harness.zones as unknown as EffectContext["zones"],
    };

    const banishEffect: ExecutableEffect = {
      target: { type: "unit" },
      type: "banish",
    } as unknown as ExecutableEffect;
    // Manually wire a direct target so getTargetIds yields victim-1.
    (banishEffect as unknown as { target: unknown }).target = "victim-1";

    executeEffect(banishEffect, effectCtx);

    // Zero Drive should now track victim-1 in exiledByThis.
    const zeroMeta = harness.cardStore.get("zero-drive-1")!.meta;
    expect(zeroMeta.exiledByThis).toEqual(["victim-1"]);
    // Victim is in banishment zone.
    expect(harness.cardStore.get("victim-1")!.zone).toBe("banishment");
  });

  test("cleanup returns exiled cards when tracker leaves the board", () => {
    registry.register("zero-drive-1", {
      cardType: "equipment",
      id: "zero-drive-1",
      mightBonus: 2,
      name: "The Zero Drive",
      tracksExiledCards: true,
    });
    registry.register("exiled-1", { cardType: "unit", id: "exiled-1", might: 3, name: "Prisoner" });

    const state = createMockState();
    const harness = createHarness({
      "exiled-1": {
        meta: {
          buffed: false,
          combatRole: null,
          damage: 0,
          exhausted: false,
          hidden: false,
          stunned: false,
        },
        owner: "p1",
        zone: "banishment",
      },
      "zero-drive-1": {
        meta: {
          buffed: false,
          combatRole: null,
          damage: 0,
          exhausted: false,
          exiledByThis: ["exiled-1"],
          hidden: false,
          stunned: false,
        },
        owner: "p1",
        zone: "banishment",
      },
    });

    const cleanupCtx: CleanupContext = {
      cards: harness.cards as unknown as CleanupContext["cards"],
      counters: harness.counters as unknown as CleanupContext["counters"],
      draft: state,
      zones: harness.zones as unknown as CleanupContext["zones"],
    };

    performCleanup(cleanupCtx);

    // The exiled card should have been returned to base.
    expect(harness.cardStore.get("exiled-1")!.zone).toBe("base");
    // The tracker's exiledByThis list should be cleared.
    expect(harness.cardStore.get("zero-drive-1")!.meta.exiledByThis).toBeUndefined();
  });

  test("cleanup does not return exiled cards while tracker still on board", () => {
    registry.register("zero-drive-1", {
      cardType: "equipment",
      id: "zero-drive-1",
      mightBonus: 2,
      name: "The Zero Drive",
      tracksExiledCards: true,
    });
    registry.register("exiled-1", { cardType: "unit", id: "exiled-1", might: 3, name: "Prisoner" });

    const state = createMockState();
    const harness = createHarness({
      "exiled-1": {
        meta: {
          buffed: false,
          combatRole: null,
          damage: 0,
          exhausted: false,
          hidden: false,
          stunned: false,
        },
        owner: "p1",
        zone: "banishment",
      },
      "zero-drive-1": {
        meta: {
          buffed: false,
          combatRole: null,
          damage: 0,
          exhausted: false,
          exiledByThis: ["exiled-1"],
          hidden: false,
          stunned: false,
        },
        owner: "p1",
        zone: "base",
      },
    });

    const cleanupCtx: CleanupContext = {
      cards: harness.cards as unknown as CleanupContext["cards"],
      counters: harness.counters as unknown as CleanupContext["counters"],
      draft: state,
      zones: harness.zones as unknown as CleanupContext["zones"],
    };

    performCleanup(cleanupCtx);

    // Tracker still on board → exile list preserved, exiled card still in banishment.
    expect(harness.cardStore.get("exiled-1")!.zone).toBe("banishment");
    expect(harness.cardStore.get("zero-drive-1")!.meta.exiledByThis).toEqual(["exiled-1"]);
  });
});
