/**
 * Real-deck wiring for the random-monkey harness.
 *
 * Phase B batch 17 FF — extends the monkey to fuzz with REAL cards from
 * `@tcg/riftbound-cards` instead of the synthetic 6-variant pool. This is
 * a self-contained copy of the deck-builder logic in
 * `apps/riftbound-app/lib/real-decks.ts` (we can't reach into the app's lib
 * from a scripts package — different workspace lane), so the public-API
 * shape mirrors that file: `getPrebuiltDecks()` returns two 40-card decks
 * + 12 runes + 2 battlefields, and `registerDeckCardsWithEngine` populates
 * the engine's global registry with `CardDefinitionLookup` payloads keyed
 * by per-deck-instance IDs.
 *
 * Generic — filters by domain + cardType, never by individual id.
 */
import { getAllCards, getCardRegistry } from "../../packages/riftbound-cards/src/index";
import type { Card } from "../../packages/riftbound-types/src/cards/index";
import {
  CardDefinitionRegistry,
  setGlobalCardRegistry,
} from "../../packages/riftbound-engine/src/operations/card-lookup";

export interface PrebuiltDeck {
  readonly playerId: string;
  readonly label: string;
  readonly mainDeckCardIds: string[];
  readonly runeDeckCardIds: string[];
  readonly battlefieldIds: string[];
}

function matchesAnyDomain(card: Pick<Card, "domain">, domains: string[]): boolean {
  if (!card.domain) {return false;}
  if (Array.isArray(card.domain)) {
    return card.domain.some((d) => domains.includes(d));
  }
  return domains.includes(card.domain);
}

function buildDeck(
  allCards: readonly Card[],
  domains: string[],
  label: string,
  playerId: string,
): PrebuiltDeck {
  const filterDomain = (c: Card) => matchesAnyDomain(c, domains);
  const units = allCards
    .filter((c) => c.cardType === "unit" && !("isChampion" in c && c.isChampion) && filterDomain(c))
    .toSorted((a, b) => (a.energyCost ?? 99) - (b.energyCost ?? 99));
  const spells = allCards
    .filter((c) => c.cardType === "spell" && filterDomain(c))
    .toSorted((a, b) => (a.energyCost ?? 99) - (b.energyCost ?? 99));

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
  // Batch 19 LL: share `counts` across passes so unit IDs already saturated
  // At 2 copies are skipped on the spell pass — guarantees ~12 spells make
  // It into the deck (previously: 0 spells because the unit pool always
  // Won the second pass).
  addUpTo(units, 28);
  addUpTo(spells, 40);
  addUpTo([...units, ...spells], 40);

  if (mainDeckCardIds.length < 40) {
    const filler = allCards.filter(
      (c) =>
        (c.cardType === "unit" ||
          c.cardType === "spell" ||
          c.cardType === "gear" ||
          c.cardType === "equipment") &&
        filterDomain(c) &&
        !("isChampion" in c && c.isChampion),
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

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const runeDeckCardIds: string[] = [];
  for (const domain of domains) {
    const rune = allCards.find((c) => c.cardType === "rune" && c.name === `${capitalize(domain)} Rune`);
    if (rune) {
      const copies = Math.floor(12 / domains.length);
      for (let i = 0; i < copies; i++) {runeDeckCardIds.push(rune.id);}
    }
  }
  while (runeDeckCardIds.length < 12) {
    const rune = allCards.find((c) => c.cardType === "rune" && matchesAnyDomain(c, domains));
    if (!rune) {break;}
    runeDeckCardIds.push(rune.id);
  }

  return {
    battlefieldIds: [],
    label,
    mainDeckCardIds,
    playerId,
    runeDeckCardIds,
  };
}

export interface DeckOptions {
  /**
   * Swap P1 and P2's domain assignments. Used by batch 19 LL's first-player-
   * bias experiment: if P1 still wins ~90% with the decks swapped, the bias
   * is tempo/picker, not deck imbalance.
   */
  swapDecks?: boolean;
  /**
   * Batch 19-LL: deterministic numeric seed for a deck shuffle. If provided,
   * each deck's main-deck card-id list is shuffled with a mulberry32 RNG
   * derived from this seed (one stream per player). This breaks the previous
   * deterministic "low-cost units → spells last" curve where 50 seeds never
   * triggered playSpell because spells were always buried beneath 28 units.
   *
   * When undefined, decks come out in the historical order (low-cost units
   * first, then spells). Keep that behaviour as the default to avoid breaking
   * existing snapshots / parity tests.
   */
  shuffleSeed?: number;
}

function shuffleSeededLocal<T>(arr: T[], seed: number): T[] {
  // Mulberry32 for determinism — same generator the monkey uses elsewhere.
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

export function getPrebuiltDecks(opts: DeckOptions = {}): readonly [PrebuiltDeck, PrebuiltDeck] {
  const allCards = getAllCards();
  const battlefields = allCards.filter((c) => c.cardType === "battlefield");
  const battlefieldIds = battlefields.slice(0, 2).map((bf) => bf.id);

  // P1 gets the first domain pair; P2 gets the second. Swapping inverts that.
  const p1Domains = opts.swapDecks ? ["calm", "mind"] : ["fury", "chaos"];
  const p2Domains = opts.swapDecks ? ["fury", "chaos"] : ["calm", "mind"];
  const p1Label = opts.swapDecks ? "Calm / Mind" : "Fury / Chaos";
  const p2Label = opts.swapDecks ? "Fury / Chaos" : "Calm / Mind";

  let deck1 = buildDeck(allCards, p1Domains, p1Label, "player-1");
  let deck2 = buildDeck(allCards, p2Domains, p2Label, "player-2");

  if (opts.shuffleSeed !== undefined) {
    // Use distinct sub-streams per player so the two decks aren't shuffled
    // Identically (which would just rotate the curve in lockstep).
    deck1 = { ...deck1, mainDeckCardIds: shuffleSeededLocal(deck1.mainDeckCardIds, opts.shuffleSeed ^ 0xA5A5A5A5) };
    deck2 = { ...deck2, mainDeckCardIds: shuffleSeededLocal(deck2.mainDeckCardIds, opts.shuffleSeed ^ 0x5A5A5A5A) };
  }

  return [
    { ...deck1, battlefieldIds },
    { ...deck2, battlefieldIds },
  ];
}

function makeLookupPayload(def: Card, instanceId: string): Parameters<CardDefinitionRegistry["register"]>[1] {
  const r = def as unknown as Record<string, unknown>;
  return {
    abilities: r.abilities as unknown as Parameters<CardDefinitionRegistry["register"]>[1]["abilities"],
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

export interface RegisteredDeck {
  mainDeckInstanceIds: string[];
  runeDeckInstanceIds: string[];
  battlefieldInstanceIds: string[];
}

/**
 * Seed a fresh global card registry containing per-instance lookups for both
 * decks. Returns the instance IDs to feed into initializeMainDeck /
 * initializeRuneDeck / placeBattlefields.
 */
export function seedRealDeckRegistry(decks: readonly [PrebuiltDeck, PrebuiltDeck]): {
  cardReg: CardDefinitionRegistry;
  byPlayer: Record<string, RegisteredDeck>;
  battlefieldInstanceIds: string[];
} {
  const cardReg = new CardDefinitionRegistry();
  const cardRegistry = getCardRegistry();

  const byPlayer: Record<string, RegisteredDeck> = {};
  const battlefieldInstanceIds: string[] = [];

  for (const deck of decks) {
    const reg: RegisteredDeck = {
      battlefieldInstanceIds: [],
      mainDeckInstanceIds: [],
      runeDeckInstanceIds: [],
    };
    for (let i = 0; i < deck.mainDeckCardIds.length; i++) {
      const defId = deck.mainDeckCardIds[i]!;
      const def = cardRegistry.get(defId);
      if (!def) {continue;}
      const instanceId = `${deck.playerId}-main-${i}-${defId}`;
      reg.mainDeckInstanceIds.push(instanceId);
      cardReg.register(instanceId, makeLookupPayload(def, instanceId));
    }
    for (let i = 0; i < deck.runeDeckCardIds.length; i++) {
      const defId = deck.runeDeckCardIds[i]!;
      const def = cardRegistry.get(defId);
      if (!def) {continue;}
      const instanceId = `${deck.playerId}-rune-${i}-${defId}`;
      reg.runeDeckInstanceIds.push(instanceId);
      cardReg.register(instanceId, makeLookupPayload(def, instanceId));
    }
    byPlayer[deck.playerId] = reg;
  }

  // Battlefields use stable IDs (`bf-1`, `bf-2`). We register both the
  // Stable IDs AND keep them shared across players.
  const sharedBattlefields = decks[0].battlefieldIds;
  for (let i = 0; i < sharedBattlefields.length; i++) {
    const defId = sharedBattlefields[i]!;
    const def = cardRegistry.get(defId);
    if (!def) {continue;}
    const stableId = `bf-${i + 1}`;
    cardReg.register(stableId, makeLookupPayload(def, stableId));
    battlefieldInstanceIds.push(stableId);
  }

  setGlobalCardRegistry(cardReg);
  return { battlefieldInstanceIds, byPlayer, cardReg };
}
