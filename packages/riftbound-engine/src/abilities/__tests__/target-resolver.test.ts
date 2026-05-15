/**
 * Target Resolver Tests
 *
 * Verifies that resolveTarget correctly identifies valid targets on the board
 * and excludes cards in non-board zones like the champion zone.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import {
  CardDefinitionRegistry,
  clearGlobalCardRegistry,
  setGlobalCardRegistry,
} from "../../operations/card-lookup";
import type { RiftboundGameState } from "../../types";
import { resolveTarget } from "../target-resolver";
import type { TargetDescriptor, TargetResolverContext } from "../target-resolver";

// ============================================================================
// Test Helpers
// ============================================================================

const P1 = "player-1";
const P2 = "player-2";

let registry: CardDefinitionRegistry;

/**
 * Register a unit card definition in the global registry.
 */
function registerUnit(id: string, might: number = 1): void {
  registry.register(id, {
    cardType: "unit",
    id,
    might,
    name: `Unit ${id}`,
  });
}

/**
 * Register a champion unit card definition in the global registry.
 */
function registerChampion(id: string, might: number = 3): void {
  registry.register(id, {
    cardType: "unit",
    id,
    isChampion: true,
    might,
    name: `Champion ${id}`,
  });
}

/**
 * Create a minimal mock game state.
 */
function createMockState(): RiftboundGameState {
  return {
    battlefields: {},
    conqueredThisTurn: { [P1]: [], [P2]: [] },
    gameId: "test-target",
    players: {
      [P1]: { id: P1, turnsTaken: 0, victoryPoints: 0, xp: 0 },
      [P2]: { id: P2, turnsTaken: 0, victoryPoints: 0, xp: 0 },
    },
    runePools: {
      [P1]: { energy: 0, power: {} },
      [P2]: { energy: 0, power: {} },
    },
    scoredThisTurn: { [P1]: [], [P2]: [] },
    status: "playing",
    turn: { activePlayer: P1, number: 1, phase: "main" },
    victoryScore: 8,
    xpGainedThisTurn: {},
  } as unknown as RiftboundGameState;
}

/**
 * Build a TargetResolverContext from a zone map.
 *
 * The zoneMap maps zone names to arrays of { cardId, owner } objects.
 * E.g. { "base": [{ cardId: "u1", owner: "player-1" }], "championZone": [...] }
 */
function buildContext(
  zoneMap: Record<string, { cardId: string; owner: string }[]>,
  sourceCardId: string,
  playerId: string = P1,
  state?: RiftboundGameState,
): TargetResolverContext {
  // Flatten all cards for owner lookup and zone lookup
  const cardOwners = new Map<string, string>();
  const cardZones = new Map<string, string>();
  for (const [zone, cards] of Object.entries(zoneMap)) {
    for (const { cardId, owner } of cards) {
      cardOwners.set(cardId, owner);
      cardZones.set(cardId, zone);
    }
  }

  return {
    cards: {
      getCardOwner: (id: CoreCardId) => cardOwners.get(id as string),
    },
    draft: state ?? createMockState(),
    playerId,
    sourceCardId,
    zones: {
      getCardZone: (id: CoreCardId) => cardZones.get(id as string),
      getCardsInZone: (zoneId: CoreZoneId, pId?: CorePlayerId) => {
        // If playerId is provided, use "zone" key as-is and filter by owner
        // If not, try direct zone match
        const entries = zoneMap[zoneId as string] ?? [];
        if (pId) {
          return entries
            .filter((e) => e.owner === (pId as string))
            .map((e) => e.cardId as CoreCardId);
        }
        return entries.map((e) => e.cardId as CoreCardId);
      },
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  registry = new CardDefinitionRegistry();
  setGlobalCardRegistry(registry);
});

afterEach(() => {
  clearGlobalCardRegistry();
});

describe("resolveTarget", () => {
  describe("champion zone exclusion", () => {
    test("spell targeting a friendly unit returns NO targets when only a champion is in the champion zone", () => {
      registerChampion("champ-1", 3);

      const target: TargetDescriptor = {
        controller: "friendly",
        type: "unit",
      };

      const ctx = buildContext(
        {
          championZone: [{ cardId: "champ-1", owner: P1 }],
        },
        "spell-1", // Source card (the spell itself)
        P1,
      );

      const result = resolveTarget(target, ctx);
      expect(result).toEqual([]);
    });

    test("spell targeting a unit returns targets when a unit is in base", () => {
      registerUnit("u1", 2);

      const target: TargetDescriptor = {
        controller: "friendly",
        type: "unit",
      };

      const ctx = buildContext(
        {
          base: [{ cardId: "u1", owner: P1 }],
        },
        "spell-1",
        P1,
      );

      const result = resolveTarget(target, ctx);
      expect(result).toEqual(["u1"]);
    });

    test("champion played from champion zone to base IS targetable", () => {
      // Simulate a champion that has been played to the base zone
      registerChampion("champ-1", 3);

      const target: TargetDescriptor = {
        controller: "friendly",
        type: "unit",
      };

      const ctx = buildContext(
        {
          base: [{ cardId: "champ-1", owner: P1 }],
        },
        "spell-1",
        P1,
      );

      const result = resolveTarget(target, ctx);
      expect(result).toEqual(["champ-1"]);
    });

    test("champion in champion zone is excluded even when other units in base are valid", () => {
      registerChampion("champ-1", 3);
      registerUnit("u1", 2);

      const target: TargetDescriptor = {
        controller: "friendly",
        quantity: "all",
        type: "unit",
      };

      const ctx = buildContext(
        {
          base: [{ cardId: "u1", owner: P1 }],
          championZone: [{ cardId: "champ-1", owner: P1 }],
        },
        "spell-1",
        P1,
      );

      const result = resolveTarget(target, ctx);
      expect(result).toEqual(["u1"]);
      expect(result).not.toContain("champ-1");
    });

    test("enemy champion in champion zone is NOT targetable by enemy-targeting spells", () => {
      registerChampion("enemy-champ", 4);

      const target: TargetDescriptor = {
        controller: "enemy",
        type: "unit",
      };

      const ctx = buildContext(
        {
          championZone: [{ cardId: "enemy-champ", owner: P2 }],
        },
        "spell-1",
        P1,
      );

      const result = resolveTarget(target, ctx);
      expect(result).toEqual([]);
    });
  });

  describe("base and battlefield targeting", () => {
    test("units on battlefields are valid targets", () => {
      registerUnit("bf-unit", 2);

      const state = createMockState();
      (state as { battlefields: unknown }).battlefields = { bf1: { controller: P1 } } as Record<
        string,
        unknown
      > as typeof state.battlefields;

      const target: TargetDescriptor = {
        controller: "friendly",
        quantity: "all",
        type: "unit",
      };

      const ctx = buildContext(
        {
          "battlefield-bf1": [{ cardId: "bf-unit", owner: P1 }],
        },
        "spell-1",
        P1,
        state,
      );

      const result = resolveTarget(target, ctx);
      expect(result).toContain("bf-unit");
    });
  });

  // -------------------------------------------------------------------------
  // Multi-target quantity shapes — `{ upTo: N }` (parser emits this for "up
  // To N", e.g. "Deal 2 to up to 2 enemy units") and `{ atLeast: N }`.
  // The parser's target-parser produces these shapes; previously the
  // Resolver's `typeof target.quantity === "number"` check fell through to
  // The default of 1 for both, so "up to 3 units" silently targeted 1.
  // -------------------------------------------------------------------------
  describe("quantity { upTo: N } — up-to-N multi-target", () => {
    test("up-to-2 with 3 candidates returns 2 (max allowed)", () => {
      registerUnit("u1", 1);
      registerUnit("u2", 1);
      registerUnit("u3", 1);
      const target: TargetDescriptor = {
        controller: "friendly",
        quantity: { upTo: 2 },
        type: "unit",
      };
      const ctx = buildContext(
        {
          base: [
            { cardId: "u1", owner: P1 },
            { cardId: "u2", owner: P1 },
            { cardId: "u3", owner: P1 },
          ],
        },
        "spell-1",
        P1,
      );
      expect(resolveTarget(target, ctx)).toHaveLength(2);
    });

    test("up-to-3 with only 1 candidate returns 1", () => {
      registerUnit("u1", 1);
      const target: TargetDescriptor = {
        controller: "friendly",
        quantity: { upTo: 3 },
        type: "unit",
      };
      const ctx = buildContext(
        { base: [{ cardId: "u1", owner: P1 }] },
        "spell-1",
        P1,
      );
      expect(resolveTarget(target, ctx)).toEqual(["u1"]);
    });

    test("up-to-0 returns 0 candidates (edge case)", () => {
      registerUnit("u1", 1);
      const target: TargetDescriptor = {
        controller: "friendly",
        quantity: { upTo: 0 },
        type: "unit",
      };
      const ctx = buildContext(
        { base: [{ cardId: "u1", owner: P1 }] },
        "spell-1",
        P1,
      );
      expect(resolveTarget(target, ctx)).toEqual([]);
    });

    test("up-to-2 with negative/zero remaining is clamped", () => {
      // Defensive: if upTo went negative, slice(0, -N) would weirdly return
      // Candidates.slice(0, candidates.length - N) — we clamp to >= 0.
      registerUnit("u1", 1);
      const target: TargetDescriptor = {
        controller: "friendly",
        quantity: { upTo: -5 },
        type: "unit",
      };
      const ctx = buildContext(
        { base: [{ cardId: "u1", owner: P1 }] },
        "spell-1",
        P1,
      );
      expect(resolveTarget(target, ctx)).toEqual([]);
    });
  });

  describe("quantity { atLeast: N } — at-least-N multi-target", () => {
    test("atLeast-1 with 3 candidates returns all 3", () => {
      registerUnit("u1", 1);
      registerUnit("u2", 1);
      registerUnit("u3", 1);
      const target: TargetDescriptor = {
        controller: "friendly",
        quantity: { atLeast: 1 },
        type: "unit",
      };
      const ctx = buildContext(
        {
          base: [
            { cardId: "u1", owner: P1 },
            { cardId: "u2", owner: P1 },
            { cardId: "u3", owner: P1 },
          ],
        },
        "spell-1",
        P1,
      );
      expect(resolveTarget(target, ctx)).toHaveLength(3);
    });
  });
});
