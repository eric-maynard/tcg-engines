/**
 * Real-deck wiring for EngineSession.
 *
 * Batch 14 V (paired with the `placeBattlefields` zone-creation fix).
 *
 * Background: until now, EngineSession built two synthetic 40-card decks
 * with placeholder card IDs (`player-1-card-0`, …). No card definition is
 * ever registered for those IDs, so the engine's move-enumeration treats
 * everything in hand as an unplayable opaque blob and the bot-vs-bot smoke
 * test ends up cycling resource moves (`exhaustRune`, `endTurn`) without
 * ever invoking `standardMove` / `playUnit` on a real card. U flagged this
 * as the blocker for real-game coverage (ENGINE_GAPS_FROM_BINDING.md).
 *
 * This module:
 *   - exports `getPrebuiltDecks()` returning two 40-card decks with 12 runes
 *     each and 2 battlefields, drawn from the existing `@tcg/riftbound-cards`
 *     data (Origins set).
 *   - exports `registerDeckCardsWithEngine(...)`, which uses the
 *     `registerCard` / `makeLookupPayload` pattern from `server.ts` to
 *     materialise each deck instance into the engine's internal card store
 *     AND register its CardDefinitionLookup payload in the global registry
 *     so move-enumeration (and therefore the bot) can play real cards.
 *
 * The decks are GENERIC: they are filtered by domain and card-type, never
 * by individual card-id. No per-card if-statements.
 */

import { getAllCards, getCardRegistry } from "@tcg/riftbound-cards";
import type { Card } from "@tcg/riftbound-types/cards";
import { getGlobalCardRegistry } from "@tcg/riftbound";
import type { RiftboundCardMeta } from "@tcg/riftbound";
import type { RiftboundEngine } from "./engine-session";
import { getInternalSnapshot } from "./engine-session";

/** A single prebuilt deck config — what `EngineSession` needs to seed a game. */
export interface PrebuiltDeck {
  readonly playerId: string;
  /** Display label, e.g. "Fury / Chaos". */
  readonly label: string;
  /** Card definition IDs for the 40-card main deck. */
  readonly mainDeckCardIds: string[];
  /** Card definition IDs for the 12-card rune deck. */
  readonly runeDeckCardIds: string[];
  /** Battlefield card definition IDs (shared across the game, 2 total). */
  readonly battlefieldIds: string[];
}

/** Internal: domain matcher that works with `string | string[]` shape. */
function matchesAnyDomain(card: Pick<Card, "domain">, domains: string[]): boolean {
  if (!card.domain) {return false;}
  if (Array.isArray(card.domain)) {
    return card.domain.some((d) => domains.includes(d));
  }
  return domains.includes(card.domain);
}

/** Build a deck from the global card pool, filtered by the given domains. */
function buildDeck(
  allCards: readonly Card[],
  domains: string[],
  label: string,
  playerId: string,
): PrebuiltDeck {
  // 1. Pick non-champion units & spells in the chosen domains, sorted by
  //    Energy cost ascending so the deck has a sane curve.
  const filterDomain = (c: Card) => matchesAnyDomain(c, domains);
  const units = allCards
    .filter((c) => c.cardType === "unit" && !("isChampion" in c && c.isChampion) && filterDomain(c))
    .toSorted((a, b) => (a.energyCost ?? 99) - (b.energyCost ?? 99));
  const spells = allCards
    .filter((c) => c.cardType === "spell" && filterDomain(c))
    .toSorted((a, b) => (a.energyCost ?? 99) - (b.energyCost ?? 99));

  // 2. Build a 40-card main deck — up to 2 copies of each per rule (rule 124),
  //    Favour low-cost units first so the goldfish can actually play them
  //    Against an empty rune pool.
  const mainDeckCardIds: string[] = [];
  const counts = new Map<string, number>();
  const addUpTo = (pool: Card[], target: number) => {
    for (const card of pool) {
      if (mainDeckCardIds.length >= target) {break;}
      const have = counts.get(card.id) ?? 0;
      if (have < 2) {
        mainDeckCardIds.push(card.id);
        counts.set(card.id, have + 1);
      }
    }
  };
  // Batch 19 LL: previously `addUpTo` had its own local `counts` map per
  // Call, which meant the second pass `addUpTo([...units, ...spells], 40)`
  // Re-iterated units (with a fresh counts=0) and re-added them up to 2x
  // Again — so spells NEVER made it into the deck. The Fury/Chaos pool has
  // 84 units, so spells never won the iteration race. Result: 50 monkey
  // Seeds → 0 `playSpell` calls because no spell was ever in the deck.
  //
  // Fix: share the `counts` map across calls so already-saturated unit IDs
  // Are skipped on the spell pass. Also reserve ~10 slots for spells
  // Explicitly (28 units + 12 spells curve).
  addUpTo(units, 28);
  addUpTo(spells, 40);
  // Fallback if domain spell pool is too small — top up with whatever
  // Playable cards remain (units / gear / equipment), still respecting
  // The global 2-copy rule via the shared `counts` map.
  addUpTo([...units, ...spells], 40);

  // 3. Fill remaining slots — if the chosen domains have a tiny pool, fall
  //    Back to anything in those domains.
  if (mainDeckCardIds.length < 40) {
    const filler = allCards.filter((c) =>
      (c.cardType === "unit" || c.cardType === "spell" || c.cardType === "gear" || c.cardType === "equipment")
      && filterDomain(c)
      && !("isChampion" in c && c.isChampion),
    );
    for (const card of filler) {
      if (mainDeckCardIds.length >= 40) {break;}
      const have = counts.get(card.id) ?? 0;
      if (have < 2) {
        mainDeckCardIds.push(card.id);
        counts.set(card.id, have + 1);
      }
    }
  }

  // 4. Build a 12-card rune deck — 6 of each domain rune. Find the rune
  //    Cards by their canonical name `"<Domain> Rune"`.
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const runeDeckCardIds: string[] = [];
  for (const domain of domains) {
    const rune = allCards.find((c) => c.cardType === "rune" && c.name === `${capitalize(domain)} Rune`);
    if (rune) {
      const copies = Math.floor(12 / domains.length);
      for (let i = 0; i < copies; i++) {runeDeckCardIds.push(rune.id);}
    }
  }
  // Top up to 12 with the first available rune in the chosen domains.
  while (runeDeckCardIds.length < 12) {
    const rune = allCards.find((c) => c.cardType === "rune" && matchesAnyDomain(c, domains));
    if (!rune) {break;}
    runeDeckCardIds.push(rune.id);
  }

  // 5. Pick 2 shared battlefields (same for the game). We pull them at the
  //    Caller level via `getPrebuiltDecks` to keep them consistent.
  return {
    battlefieldIds: [],
    label,
    mainDeckCardIds,
    playerId,
    runeDeckCardIds,
  };
}

/**
 * Batch 19-LL: shuffle-seed option lets callers pre-shuffle a deck before
 * `initializeMainDeck` so opening hands aren't always the same low-cost
 * units. The monkey + B11 spell-coverage regression test rely on this to
 * surface playSpell paths that were never reached when spells were buried
 * at the bottom of the deck.
 */
export interface DeckOptions {
  /** Seed for deterministic main-deck shuffle. If undefined, no shuffle. */
  shuffleSeed?: number;
}

function shuffleSeededLocal<T>(arr: T[], seed: number): T[] {
  // Mulberry32 — matches the monkey harness's RNG so seeds are portable.
  let s = seed >>> 0;
  const rng = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Build the two prebuilt decks used by `EngineSession({ realDecks: true })`.
 *
 * Player 1 plays Fury / Chaos (aggro). Player 2 plays Calm / Mind (tempo).
 * Two Origins battlefields are shared.
 *
 * Pass `{ shuffleSeed }` to randomise opening-hand contents — without this,
 * the deck always opens with the cheapest units (units sorted ascending by
 * energyCost) and never delivers spells to the first hand.
 */
export function getPrebuiltDecks(opts: DeckOptions = {}): readonly [PrebuiltDeck, PrebuiltDeck] {
  const allCards = getAllCards();

  // Battlefields — pick the first two that exist in the data. They are
  // Global, not per-player.
  const battlefields = allCards.filter((c) => c.cardType === "battlefield");
  const battlefieldIds = battlefields.slice(0, 2).map((bf) => bf.id);

  let deck1 = buildDeck(allCards, ["fury", "chaos"], "Fury / Chaos", "player-1");
  let deck2 = buildDeck(allCards, ["calm", "mind"], "Calm / Mind", "player-2");

  if (opts.shuffleSeed !== undefined) {
    deck1 = { ...deck1, mainDeckCardIds: shuffleSeededLocal(deck1.mainDeckCardIds, opts.shuffleSeed ^ 0xA5A5A5A5) };
    deck2 = { ...deck2, mainDeckCardIds: shuffleSeededLocal(deck2.mainDeckCardIds, opts.shuffleSeed ^ 0x5a_5a_5a_5a) };
  }

  return [
    { ...deck1, battlefieldIds },
    { ...deck2, battlefieldIds },
  ];
}

/**
 * `makeLookupPayload` — adapted from `server.ts` so this module is the only
 * place EngineSession needs to know about the riftbound-cards → engine
 * registry payload shape.
 */
function makeLookupPayload(def: Card, instanceId: string): Parameters<ReturnType<typeof getGlobalCardRegistry>["register"]>[1] {
  const r = def as unknown as Record<string, unknown>;
  return {
    abilities: r.abilities as unknown as Parameters<ReturnType<typeof getGlobalCardRegistry>["register"]>[1]["abilities"],
    cardType: def.cardType as string,
    copyAttachedUnitText: r.copyAttachedUnitText as boolean | undefined,
    domain: r.domain as string | string[] | undefined,
    energyCost: r.energyCost as number | undefined,
    id: instanceId,
    inheritExhaustAbilities: r.inheritExhaustAbilities as boolean | undefined,
    interactiveCostReduction: r.interactiveCostReduction as "target-might" | undefined,
    keywords: r.keywords as string[] | undefined,
    might: r.might as number | undefined,
    mightBonus: r.mightBonus as number | undefined,
    moveEscalation: r.moveEscalation as boolean | undefined,
    name: def.name,
    powerCost: r.powerCost as string[] | undefined,
    timing: r.timing as string | undefined,
    tracksExiledCards: r.tracksExiledCards as boolean | undefined,
  };
}

/** Internal-state shape needed for registerCard. */
interface InternalCardStore {
  cards: Record<string, { definitionId: string; owner: string; controller: string; zone: string; position?: number }>;
  cardMetas: Record<string, RiftboundCardMeta>;
}

function registerCardInstance(
  internal: InternalCardStore,
  cardId: string,
  definitionId: string,
  owner: string,
  zone: string,
) {
  internal.cards[cardId] = { controller: owner, definitionId, owner, position: undefined, zone };
  internal.cardMetas[cardId] = {
    buffed: false,
    combatRole: null,
    damage: 0,
    exhausted: false,
    hidden: false,
    stunned: false,
  };
}

/**
 * Register a deck's worth of cards on the engine — creates one card instance
 * per copy in the deck and registers its CardDefinitionLookup in the global
 * registry. This is the production pattern from `server.ts`'s
 * `createGameFromDecks`.
 *
 * Returns the instance IDs that were created so callers can pass them to
 * `initializeMainDeck` / `initializeRuneDeck`.
 */
export function registerDeckCardsWithEngine(
  engine: RiftboundEngine,
  deck: PrebuiltDeck,
): {
  mainDeckInstanceIds: string[];
  runeDeckInstanceIds: string[];
  battlefieldInstanceIds: string[];
} {
  const cardReg = getGlobalCardRegistry();
  const cardRegistry = getCardRegistry();
  const internal = getInternalSnapshot(engine) as unknown as InternalCardStore;

  const mainDeckInstanceIds: string[] = [];
  const runeDeckInstanceIds: string[] = [];
  const battlefieldInstanceIds: string[] = [];

  for (let i = 0; i < deck.mainDeckCardIds.length; i++) {
    const defId = deck.mainDeckCardIds[i];
    const def = cardRegistry.get(defId);
    if (!def) {continue;}
    const instanceId = `${deck.playerId}-main-${i}-${defId}`;
    mainDeckInstanceIds.push(instanceId);
    cardReg.register(instanceId, makeLookupPayload(def, instanceId));
    // Pre-register the card in internalState so initializeMainDeck's
    // CreateCardInZone path is a no-op overwrite. NOTE: initializeMainDeck
    // Already calls createCardInZone, which writes the same fields — we
    // Call this only AFTER the engine has the zone in place. Order matters,
    // So callers run this in the same sequence used by `EngineSession`.
    void internal; // (kept for parity with server.ts pattern; instance fields are populated by initializeMainDeck)
  }

  for (let i = 0; i < deck.runeDeckCardIds.length; i++) {
    const defId = deck.runeDeckCardIds[i];
    const def = cardRegistry.get(defId);
    if (!def) {continue;}
    const instanceId = `${deck.playerId}-rune-${i}-${defId}`;
    runeDeckInstanceIds.push(instanceId);
    cardReg.register(instanceId, makeLookupPayload(def, instanceId));
  }

  for (let i = 0; i < deck.battlefieldIds.length; i++) {
    const defId = deck.battlefieldIds[i];
    const def = cardRegistry.get(defId);
    if (!def) {continue;}
    // Battlefields use stable IDs (`bf-1`, `bf-2`) — but here we map them to
    // Their real card-definition IDs so the engine can read their domains and
    // Abilities. EngineSession will still call placeBattlefields with the
    // Stable IDs, and we also register THOSE as definition lookups so the
    // PlaceBattlefields → applyBattlefieldPermanentEffects pipeline finds the
    // Right ability set on bf-1 / bf-2 (matching the definition).
    const stableId = `bf-${i + 1}`;
    cardReg.register(stableId, makeLookupPayload(def, stableId));
    battlefieldInstanceIds.push(stableId);
    // Pre-place the battlefield card on the engine so battlefieldRow has the
    // Matching card record — placeBattlefields will move it.
    registerCardInstance(internal, stableId, defId, "player-1", "battlefieldRow");
    // Ensure the battlefieldRow zone contains the card so moveCard can find it.
    const internalWithZones = (engine as unknown as {
      internalState: { zones: Record<string, { cardIds: string[] } | undefined> };
    }).internalState;
    const row = internalWithZones.zones.battlefieldRow;
    if (row && !row.cardIds.includes(stableId)) {
      row.cardIds.push(stableId);
    }
  }

  return { battlefieldInstanceIds, mainDeckInstanceIds, runeDeckInstanceIds };
}
