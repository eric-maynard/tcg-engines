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

// ============================================================================
// Malzahar, Fanatic — sacrifice (kill) cost on activated ability
// ============================================================================

describe("Malzahar, Fanatic (ogn-113-298): sacrifice cost", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
    registry.register("malzahar-1", {
      abilities: [
        {
          cost: { exhaust: true, kill: { controller: "friendly", type: "permanent" } },
          effect: { amount: 2, resource: "rainbow", type: "add-resource" },
          type: "activated",
        },
      ],
      cardType: "unit",
      id: "malzahar-1",
      might: 3,
      name: "Malzahar, Fanatic",
    });
    registry.register("fodder-1", {
      abilities: [],
      cardType: "unit",
      id: "fodder-1",
      might: 1,
      name: "Voidling",
    });
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  const emptyMeta = {
    buffed: false,
    combatRole: null,
    damage: 0,
    exhausted: false,
    hidden: false,
    stunned: false,
  };

  test("not enumerated when there is no other friendly permanent to sacrifice", () => {
    const state = createMockState();
    const harness = createHarness({
      "malzahar-1": { meta: { ...emptyMeta }, owner: "p1", zone: "base" },
    });
    const context = {
      cards: harness.cards,
      counters: harness.counters,
      playerId: "p1" as CorePlayerId,
      zones: harness.zones,
    };

    const enumerator = chainMoves.activateAbility!.enumerator!;
    const results = enumerator(state, context as unknown as Parameters<typeof enumerator>[1]);

    // The host card cannot pay its own kill cost, so with no other friendly
    // permanent on the board the ability must not be enumerated at all.
    const malzaharEntries = results.filter((r) => r.cardId === "malzahar-1");
    expect(malzaharEntries.length).toBe(0);
  });

  test("enumerates one option per friendly permanent and reducer trashes the pick", () => {
    const state = createMockState();
    const harness = createHarness({
      "fodder-1": { meta: { ...emptyMeta }, owner: "p1", zone: "base" },
      "malzahar-1": { meta: { ...emptyMeta }, owner: "p1", zone: "base" },
    });
    const enumCtx = {
      cards: harness.cards,
      counters: harness.counters,
      playerId: "p1" as CorePlayerId,
      zones: harness.zones,
    };

    const enumerator = chainMoves.activateAbility!.enumerator!;
    const results = enumerator(state, enumCtx as unknown as Parameters<typeof enumerator>[1]);

    const malzaharEntries = results.filter((r) => r.cardId === "malzahar-1");
    expect(malzaharEntries.length).toBe(1);
    expect(malzaharEntries[0]!.sacrificeId).toBe("fodder-1");

    // Activate, choosing the fodder unit as the sacrifice.
    const reducer = chainMoves.activateAbility!.reducer!;
    const reducerCtx = {
      cards: harness.cards,
      counters: harness.counters,
      params: {
        abilityIndex: 0,
        cardId: "malzahar-1",
        playerId: "p1",
        sacrificeId: "fodder-1",
      },
      zones: harness.zones,
    };
    reducer(state, reducerCtx as unknown as Parameters<typeof reducer>[1]);

    expect(harness.cardStore.get("fodder-1")!.zone).toBe("trash");
    expect(harness.cardStore.get("malzahar-1")!.meta.exhausted).toBe(true);
  });
});

// ============================================================================
// Sudden Storm (sfd-017-221): "deal 4 instead" replaces, never stacks
// ============================================================================

// rule-id: sfd-017-221
describe("Sudden Storm (sfd-017-221): target-attacking conditional damage", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  const stormEffect = {
    condition: { type: "target-attacking" },
    else: { amount: 2, target: { location: "battlefield", type: "unit" }, type: "damage" },
    target: { location: "battlefield", type: "unit" },
    then: { amount: 4, target: { location: "battlefield", type: "unit" }, type: "damage" },
    type: "conditional",
  } as unknown as ExecutableEffect;

  function run(combatRole: "attacker" | null): number {
    registry.register("storm-1", { cardType: "spell", id: "storm-1", name: "Sudden Storm" });
    registry.register("victim-1", { cardType: "unit", id: "victim-1", might: 5, name: "Victim" });
    const state = createMockState();
    const harness = createHarness({
      "victim-1": {
        meta: { buffed: false, combatRole, damage: 0, exhausted: false, hidden: false, stunned: false },
        owner: "p2",
        zone: "battlefield-bf-1",
      },
    });
    const effectCtx: EffectContext = {
      boundTargets: ["victim-1"],
      cards: harness.cards as unknown as EffectContext["cards"],
      counters: harness.counters,
      draft: state,
      playerId: "p1",
      sourceCardId: "storm-1",
      sourceZone: "trash",
      zones: harness.zones as unknown as EffectContext["zones"],
    } as EffectContext;
    executeEffect(stormEffect, effectCtx);
    return harness.cardStore.get("victim-1")!.meta.damage ?? 0;
  }

  test("non-attacking target takes exactly 2", () => {
    expect(run(null)).toBe(2);
  });

  test("attacking target takes exactly 4", () => {
    expect(run("attacker")).toBe(4);
  });
});

// ============================================================================
// Noxian Guillotine (ogn-254-298): [Legion] — kill it now instead
// ============================================================================

// rule-id: ogn-254-298
describe("Noxian Guillotine (ogn-254-298): legion conditional kill", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  const guillotineEffect = {
    condition: { type: "legion" },
    else: {
      duration: "next",
      replacement: { target: { type: "unit" }, type: "kill" },
      replaces: "take-damage",
      type: "replacement",
    },
    target: { type: "unit" },
    then: { target: { type: "unit" }, type: "kill" },
    type: "conditional",
  } as unknown as ExecutableEffect;

  function run(cardsPlayedByP1: number): { zone: string; replacements: number } {
    registry.register("ng-1", { cardType: "spell", id: "ng-1", name: "Noxian Guillotine" });
    registry.register("victim-1", { cardType: "unit", id: "victim-1", might: 5, name: "Victim" });
    const state = createMockState({ cardsPlayedThisTurn: { p1: cardsPlayedByP1, p2: 0 } });
    const harness = createHarness({
      "ng-1": {
        meta: { buffed: false, combatRole: null, damage: 0, exhausted: false, hidden: false, stunned: false },
        owner: "p1",
        zone: "chain",
      },
      "victim-1": {
        meta: { buffed: false, combatRole: null, damage: 0, exhausted: false, hidden: false, stunned: false },
        owner: "p2",
        zone: "battlefield-bf-1",
      },
    });
    const effectCtx: EffectContext = {
      boundTargets: ["victim-1"],
      cards: harness.cards as unknown as EffectContext["cards"],
      counters: harness.counters,
      draft: state,
      playerId: "p1",
      sourceCardId: "ng-1",
      sourceZone: "chain",
      zones: harness.zones as unknown as EffectContext["zones"],
    } as EffectContext;
    executeEffect(guillotineEffect, effectCtx);
    return {
      replacements: (state.activeReplacements ?? []).length,
      zone: harness.cardStore.get("victim-1")!.zone,
    };
  }

  test("only this spell played this turn: installs replacement, no kill", () => {
    const r = run(1);
    expect(r.zone).toBe("battlefield-bf-1");
    expect(r.replacements).toBe(1);
  });

  test("another card played earlier this turn: kills it now", () => {
    const r = run(2);
    expect(r.zone).toBe("trash");
    expect(r.replacements).toBe(0);
  });
});

// ============================================================================
// Crescent Strike (unl-072-219): 4 to chosen enemy unit, 1 to each OTHER
// enemy unit at that battlefield only
// ============================================================================

// rule-id: unl-072-219
describe("Crescent Strike (unl-072-219): splashOthers damage", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("chosen unit takes 4; other enemy units there take 1; elsewhere/friendly untouched", () => {
    registry.register("strike-1", { cardType: "spell", id: "strike-1", name: "Crescent Strike" });
    for (const id of ["e-main", "e-other", "e-elsewhere", "e-base", "f-here"]) {
      registry.register(id, { cardType: "unit", id, might: 6, name: id });
    }
    const state = createMockState({
      battlefields: {
        "bf-1": { contested: false, controller: "p1", id: "bf-1" },
        "bf-2": { contested: false, controller: "p2", id: "bf-2" },
      } as RiftboundGameState["battlefields"],
    });
    const blank = { buffed: false, damage: 0, exhausted: false, hidden: false, stunned: false };
    const harness = createHarness({
      "e-base": { meta: { ...blank }, owner: "p2", zone: "base" },
      "e-elsewhere": { meta: { ...blank }, owner: "p2", zone: "battlefield-bf-2" },
      "e-main": { meta: { ...blank }, owner: "p2", zone: "battlefield-bf-1" },
      "e-other": { meta: { ...blank }, owner: "p2", zone: "battlefield-bf-1" },
      "f-here": { meta: { ...blank }, owner: "p1", zone: "battlefield-bf-1" },
    });
    const effect = {
      amount: 4,
      splashOthers: 1,
      target: { controller: "enemy", location: "battlefield", type: "unit" },
      type: "damage",
    } as unknown as ExecutableEffect;
    const effectCtx: EffectContext = {
      boundTargets: ["e-main"],
      cards: harness.cards as unknown as EffectContext["cards"],
      counters: harness.counters,
      draft: state,
      playerId: "p1",
      sourceCardId: "strike-1",
      sourceZone: "trash",
      zones: harness.zones as unknown as EffectContext["zones"],
    } as EffectContext;
    executeEffect(effect, effectCtx);
    const dmg = (id: string) => harness.cardStore.get(id)!.meta.damage ?? 0;
    expect(dmg("e-main")).toBe(4);
    expect(dmg("e-other")).toBe(1);
    expect(dmg("e-elsewhere")).toBe(0);
    expect(dmg("e-base")).toBe(0);
    expect(dmg("f-here")).toBe(0);
  });
});

// ============================================================================
// Facebreaker (ogn-220-298): "Stun a friendly unit and an enemy unit at the
// same battlefield" — the enemy stun is pinned to the friendly's battlefield.
// ============================================================================

// rule-id: ogn-220-298
describe("Facebreaker (ogn-220-298): location 'same' pins to lead's battlefield", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  const facebreakerEffect = {
    effects: [
      { target: { controller: "friendly", location: "battlefield", type: "unit" }, type: "stun" },
      { target: { controller: "enemy", location: "same", type: "unit" }, type: "stun" },
    ],
    type: "sequence",
  } as unknown as ExecutableEffect;

  function setup(cards: Record<string, { owner: string; zone: string }>) {
    registry.register("fb-1", { cardType: "spell", id: "fb-1", name: "Facebreaker" });
    for (const id of Object.keys(cards)) {
      registry.register(id, { cardType: "unit", id, might: 3, name: id });
    }
    const state = createMockState({
      battlefields: {
        "bf-1": { contested: false, controller: "p1", id: "bf-1" },
        "bf-2": { contested: false, controller: "p2", id: "bf-2" },
      } as RiftboundGameState["battlefields"],
    });
    const blank = { buffed: false, damage: 0, exhausted: false, hidden: false, stunned: false };
    const harness = createHarness(
      Object.fromEntries(
        Object.entries(cards).map(([id, c]) => [id, { meta: { ...blank }, owner: c.owner, zone: c.zone }]),
      ),
    );
    const ctx = (bound?: string[]): EffectContext =>
      ({
        ...(bound ? { boundTargets: bound } : {}),
        cards: harness.cards as unknown as EffectContext["cards"],
        counters: harness.counters,
        draft: state,
        playerId: "p1",
        sourceCardId: "fb-1",
        sourceZone: "chain",
        zones: harness.zones as unknown as EffectContext["zones"],
      }) as EffectContext;
    const stunned = (id: string) => harness.cardStore.get(id)!.meta.stunned === true;
    return { ctx, stunned };
  }

  test("enemy at a different battlefield / base is never stunned", () => {
    const { ctx, stunned } = setup({
      "e-base": { owner: "p2", zone: "base" },
      "e-bf2": { owner: "p2", zone: "battlefield-bf-2" },
      "e-bf1": { owner: "p2", zone: "battlefield-bf-1" },
      "f-bf1": { owner: "p1", zone: "battlefield-bf-1" },
    });
    executeEffect(facebreakerEffect, ctx(["f-bf1"]));
    expect(stunned("f-bf1")).toBe(true);
    expect(stunned("e-bf1")).toBe(true);
    expect(stunned("e-bf2")).toBe(false);
    expect(stunned("e-base")).toBe(false);
  });

  test("unbound lead prefers a friendly unit whose battlefield has an enemy", () => {
    const { ctx, stunned } = setup({
      "e-bf2": { owner: "p2", zone: "battlefield-bf-2" },
      "f-alone": { owner: "p1", zone: "battlefield-bf-1" },
      "f-bf2": { owner: "p1", zone: "battlefield-bf-2" },
    });
    executeEffect(facebreakerEffect, ctx());
    expect(stunned("f-bf2")).toBe(true);
    expect(stunned("e-bf2")).toBe(true);
    expect(stunned("f-alone")).toBe(false);
  });

  test("no enemy at the lead's battlefield: enemy elsewhere is not stunned", () => {
    const { ctx, stunned } = setup({
      "e-bf2": { owner: "p2", zone: "battlefield-bf-2" },
      "f-bf1": { owner: "p1", zone: "battlefield-bf-1" },
    });
    executeEffect(facebreakerEffect, ctx(["f-bf1"]));
    expect(stunned("f-bf1")).toBe(true);
    expect(stunned("e-bf2")).toBe(false);
  });
});
