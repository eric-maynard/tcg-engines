/**
 * Card pools: where the harness gets card definitions from.
 *
 * The engine package cannot depend on @tcg/riftbound-cards (that package
 * dev-depends on the engine), so the real pool is loaded lazily by relative
 * dynamic import — the same trick the playtest tracer uses — and callers may
 * always inject their own.
 */

import type { CardDefinitionLookup } from "../operations/card-lookup";
import type { CardDefLike, CardPool } from "./types";

export function createCardPool(defs: readonly CardDefLike[]): CardPool {
  const byId = new Map<string, CardDefLike>();
  for (const def of defs) {
    if (def.id) {
      byId.set(def.id, def);
    }
  }
  return {
    all: () => defs,
    get: (id) => byId.get(id),
    size: byId.size,
  };
}

let defaultPool: CardPool | undefined;
let defaultPoolPromise: Promise<CardPool> | undefined;

/** Override the pool `scenario()` / `Game.fromDecks()` use when none is passed. */
export function setDefaultCardPool(pool: CardPool | undefined): void {
  defaultPool = pool;
  defaultPoolPromise = pool ? Promise.resolve(pool) : undefined;
}

/**
 * The full Riftbound card set (`getAllCards()` from riftbound-cards), loaded
 * once. Falls back to an empty pool when the cards package is unavailable.
 */
export function loadDefaultCardPool(): Promise<CardPool> {
  if (defaultPool) {
    return Promise.resolve(defaultPool);
  }
  if (!defaultPoolPromise) {
    defaultPoolPromise = import("../../../riftbound-cards/src/data/all-cards")
      .then((mod) => {
        const getAllCards = (mod as unknown as { getAllCards: () => readonly CardDefLike[] }).getAllCards;
        defaultPool = createCardPool(getAllCards());
        return defaultPool;
      })
      .catch(() => {
        defaultPool = createCardPool([]);
        return defaultPool;
      });
  }
  return defaultPoolPromise;
}

/** Synchronous access after `loadDefaultCardPool()` resolved (undefined before). */
export function peekDefaultCardPool(): CardPool | undefined {
  return defaultPool;
}

/** Inert vanilla filler unit used to pad decks/hands in scenarios. */
export const FILLER_UNIT_DEF: CardDefLike = {
  abilities: [],
  cardType: "unit",
  domain: "fury",
  energyCost: 2,
  id: "harness-filler-unit",
  keywords: [],
  might: 2,
  name: "Filler Recruit",
  rulesText: "",
};

const RUNE_NAMES: Record<string, string> = {
  body: "Body Rune",
  calm: "Calm Rune",
  chaos: "Chaos Rune",
  fury: "Fury Rune",
  mind: "Mind Rune",
  order: "Order Rune",
};

/** A basic rune definition for `domain` — the real OGN rune when the pool has it. */
export function basicRuneDef(pool: CardPool | undefined, domain: string): CardDefLike {
  const name = RUNE_NAMES[domain] ?? `${domain} Rune`;
  const real = pool?.all().find((c) => c.cardType === "rune" && c.name === name);
  if (real) {
    return real;
  }
  return {
    abilities: [],
    cardType: "rune",
    domain,
    id: `harness-rune-${domain}`,
    name,
  };
}

/**
 * Convert a loose definition into the registry payload the engine reads.
 * Mirrors testing/playtest/game-setup.ts makeLookupPayload but tolerates
 * inline test defs (no id / name).
 */
export function toLookupPayload(
  def: CardDefLike,
  instanceId: string,
  overrides?: { cardType?: string; energyCost?: number; name?: string },
): CardDefinitionLookup {
  const domain = def.domain;
  return {
    abilities: (def.abilities ?? []) as CardDefinitionLookup["abilities"],
    cardType: overrides?.cardType ?? def.cardType,
    copyAttachedUnitText: def.copyAttachedUnitText as boolean | undefined,
    domain: Array.isArray(domain) ? [...domain] : (domain as string | undefined),
    energyCost: overrides?.energyCost ?? def.energyCost,
    id: instanceId,
    inheritExhaustAbilities: def.inheritExhaustAbilities as boolean | undefined,
    interactiveCostReduction: def.interactiveCostReduction as "target-might" | undefined,
    isChampion: def.isChampion,
    keywords: def.keywords ? [...def.keywords] : undefined,
    might: def.might,
    mightBonus: def.mightBonus,
    moveEscalation: def.moveEscalation as boolean | undefined,
    name: overrides?.name ?? def.name ?? def.id ?? instanceId,
    powerCost: def.powerCost ? [...def.powerCost] : undefined,
    tags: def.tags,
    timing: def.timing,
    tracksExiledCards: def.tracksExiledCards as boolean | undefined,
  };
}

export function domainsOf(def: CardDefLike | undefined): string[] {
  if (!def?.domain) {
    return [];
  }
  return Array.isArray(def.domain) ? [...(def.domain as readonly string[])] : [def.domain as string];
}
