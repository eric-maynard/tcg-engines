/**
 * Card Definition Lookup
 *
 * Provides access to card definitions (static data like cost, might, keywords)
 * during move execution. This bridges the gap between the engine's runtime
 * state and the card definitions from @tcg/riftbound-cards.
 *
 * Usage: Create a registry at game start, then query it in move conditions/reducers.
 */

import type { Domain } from "../types/moves";

/**
 * Minimal card definition interface for engine lookups.
 * Avoids importing full types from riftbound-types to keep the boundary clean.
 */
export interface CardDefinitionLookup {
  readonly id: string;
  readonly name: string;
  readonly cardType: string;
  readonly energyCost?: number;
  readonly powerCost?: string[];
  readonly might?: number;
  readonly domain?: string | string[];
  readonly keywords?: string[];
  readonly timing?: string;
  readonly isChampion?: boolean;
  /** Might bonus when equipment is attached to a unit */
  readonly mightBonus?: number;
  readonly abilities?: readonly {
    readonly type: string;
    readonly trigger?: { readonly event: string; readonly on?: string };
    readonly effect?: unknown;
    readonly condition?: unknown;
    readonly affects?: string;
    readonly optional?: boolean;
    readonly keyword?: string;
    readonly value?: number;
    readonly cost?: unknown;
    readonly replaces?: string;
    readonly replacement?: unknown;
    readonly duration?: string;
    readonly target?: unknown;
  }[];
}

/**
 * Card definition registry — maps card instance IDs to their definitions.
 */
export class CardDefinitionRegistry {
  private readonly definitions = new Map<string, CardDefinitionLookup>();

  /**
   * Register a card definition by ID.
   */
  register(id: string, definition: CardDefinitionLookup): void {
    this.definitions.set(id, definition);
  }

  /**
   * Look up a card definition by instance ID.
   */
  get(id: string): CardDefinitionLookup | undefined {
    return this.definitions.get(id);
  }

  /**
   * Check if a card has a specific keyword.
   */
  hasKeyword(cardId: string, keyword: string): boolean {
    const def = this.definitions.get(cardId);
    return def?.keywords?.includes(keyword) ?? false;
  }

  /**
   * Get a card's energy cost.
   */
  getEnergyCost(cardId: string): number {
    return this.definitions.get(cardId)?.energyCost ?? 0;
  }

  /**
   * Get a card's power cost (domain requirements).
   */
  getPowerCost(cardId: string): string[] {
    return this.definitions.get(cardId)?.powerCost ?? [];
  }

  /**
   * Get a card's base might.
   */
  getMight(cardId: string): number {
    return this.definitions.get(cardId)?.might ?? 0;
  }

  /**
   * Get a card's equipment might bonus.
   */
  getMightBonus(cardId: string): number {
    return this.definitions.get(cardId)?.mightBonus ?? 0;
  }

  /**
   * Get a card's abilities.
   */
  getAbilities(cardId: string): CardDefinitionLookup["abilities"] {
    return this.definitions.get(cardId)?.abilities ?? [];
  }

  /**
   * Get a card's type.
   */
  getCardType(cardId: string): string | undefined {
    return this.definitions.get(cardId)?.cardType;
  }

  /**
   * Get a card's spell timing (action/reaction).
   */
  getSpellTiming(cardId: string): string | undefined {
    return this.definitions.get(cardId)?.timing;
  }

  /**
   * Check if the player can afford a card's cost.
   */
  canAfford(
    cardId: string,
    pool: { energy: number; power: Partial<Record<Domain, number>> },
  ): boolean {
    const def = this.definitions.get(cardId);
    if (!def) {
      return false;
    }

    // Check energy
    if (def.energyCost && pool.energy < def.energyCost) {
      return false;
    }

    // Check power (each domain symbol in powerCost needs 1 of that domain)
    if (def.powerCost) {
      const needed: Partial<Record<string, number>> = {};
      for (const domain of def.powerCost) {
        needed[domain] = (needed[domain] ?? 0) + 1;
      }
      for (const [domain, count] of Object.entries(needed)) {
        const available = pool.power[domain as Domain] ?? 0;
        if (available < (count ?? 0)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Get the total cost to deduct when playing a card.
   */
  getCostToDeduct(cardId: string): { energy: number; power: Partial<Record<Domain, number>> } {
    const def = this.definitions.get(cardId);
    if (!def) {
      return { energy: 0, power: {} };
    }

    const power: Partial<Record<Domain, number>> = {};
    if (def.powerCost) {
      for (const domain of def.powerCost) {
        power[domain as Domain] = (power[domain as Domain] ?? 0) + 1;
      }
    }

    return { energy: def.energyCost ?? 0, power };
  }

  get size(): number {
    return this.definitions.size;
  }
}

/**
 * Global card registry instance.
 * Populated during game setup, queried during move execution.
 */
let _globalRegistry: CardDefinitionRegistry | null = null;

export function getGlobalCardRegistry(): CardDefinitionRegistry {
  if (!_globalRegistry) {
    _globalRegistry = new CardDefinitionRegistry();
  }
  return _globalRegistry;
}

export function setGlobalCardRegistry(registry: CardDefinitionRegistry): void {
  _globalRegistry = registry;
}

export function clearGlobalCardRegistry(): void {
  _globalRegistry = null;
}
