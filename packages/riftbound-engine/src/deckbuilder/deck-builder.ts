/**
 * Deck Builder
 *
 * Interactive deck construction with automatic constraint enforcement.
 * Mirrors the workflow of community deck builders like Piltover Archive:
 *
 * 1. Choose a Legend → locks domain identity, filters card pool
 * 2. Choose a Champion → must match legend's tag, added to main deck
 * 3. Add main deck cards → auto-filtered by domain, 3-copy limit enforced
 * 4. Add rune deck → auto-filtered by domain, exactly 12 required
 * 5. Choose battlefields → auto-filtered by domain, count per mode
 * 6. Validate → returns errors or confirms deck is legal
 *
 * The builder tracks state and provides:
 * - getAvailableCards() → cards you can still add (filtered, legal)
 * - getLegalChampions() → champion units matching your legend
 * - getManaCurve() → energy cost distribution
 * - getDeckStats() → card type breakdown, domain spread
 * - validate() → full rule check
 */

import type {
  BattlefieldCard,
  Card,
  LegendCard,
  RuneCard,
  UnitCard,
} from "@tcg/riftbound-types/cards";
import { validateDeck } from "../validators/deck-validators";
import type { DeckValidationResult } from "../validators/deck-validators";
import type { CardFilterCriteria, FilterableCard } from "./card-filters";
import { filterCards, matchesDomainIdentity, sortCards } from "./card-filters";
import type { CardSortField } from "./card-filters";

// ============================================================================
// Types
// ============================================================================

/**
 * Current state of the deck being built.
 */
export interface DeckState {
  /** Selected legend (null if not yet chosen) */
  legend: LegendCard | null;
  /** Selected champion (null if not yet chosen) */
  chosenChampion: UnitCard | null;
  /** Main deck cards (not including champion) */
  mainDeck: Card[];
  /** Rune deck cards */
  runeDeck: RuneCard[];
  /** Selected battlefields */
  battlefields: BattlefieldCard[];
  /** Game mode */
  mode: "duel" | "match" | "ffa3" | "ffa4" | "magmaChamber";
}

/**
 * Statistics about the current deck.
 */
export interface DeckStats {
  /** Total main deck card count (including champion) */
  mainDeckCount: number;
  /** Rune deck count */
  runeDeckCount: number;
  /** Battlefield count */
  battlefieldCount: number;
  /** Cards by type */
  byType: Record<string, number>;
  /** Cards by domain */
  byDomain: Record<string, number>;
  /** Cards by rarity */
  byRarity: Record<string, number>;
  /** Energy cost curve (cost → count) */
  manaCurve: Record<number, number>;
  /** Copy counts (card name → count) */
  copies: Record<string, number>;
  /** Domain identity from legend */
  domainIdentity: string[];
  /** Required battlefields for mode */
  requiredBattlefields: number;
  /** Is deck complete? */
  isComplete: boolean;
}

/**
 * Reason a card can't be added.
 */
export interface AddCardError {
  readonly code: string;
  readonly message: string;
}

/**
 * Result of attempting to add a card.
 */
export type AddCardResult = { success: true } | { success: false; error: AddCardError };

// ============================================================================
// Constants
// ============================================================================

const MAX_COPIES = 3;
const MIN_MAIN_DECK = 40;
const RUNE_DECK_SIZE = 12;

/**
 * Each player always provides 3 battlefields in their deck (rule 644.4.a).
 */
const DECK_BATTLEFIELD_COUNT = 3;

// ============================================================================
// Deck Builder Class
// ============================================================================

export class DeckBuilder {
  private state: DeckState;
  private cardPool: Card[];

  constructor(cardPool: Card[], mode: DeckState["mode"] = "duel") {
    this.cardPool = cardPool;
    this.state = {
      battlefields: [],
      chosenChampion: null,
      legend: null,
      mainDeck: [],
      mode,
      runeDeck: [],
    };
  }

  // ==========================================================================
  // Legend Selection
  // ==========================================================================

  /**
   * Get all available legends from the card pool.
   */
  getAvailableLegends(): LegendCard[] {
    return this.cardPool.filter((c): c is LegendCard => c.cardType === "legend");
  }

  /**
   * Set the legend. Resets the deck if legend changes.
   */
  setLegend(legend: LegendCard): void {
    // If legend changed, reset everything
    if (this.state.legend && this.state.legend.id !== legend.id) {
      this.state.chosenChampion = null;
      this.state.mainDeck = [];
      this.state.runeDeck = [];
      this.state.battlefields = [];
    }
    this.state.legend = legend;
  }

  /**
   * Get the domain identity from the current legend.
   */
  getDomainIdentity(): string[] {
    if (!this.state.legend) {
      return [];
    }
    const d = this.state.legend.domain;
    if (typeof d === "string") {
      return [d];
    }
    return [...d];
  }

  // ==========================================================================
  // Champion Selection
  // ==========================================================================

  /**
   * Get champion units that match the current legend's tag.
   */
  getLegalChampions(): UnitCard[] {
    if (!this.state.legend) {
      return [];
    }
    const legendTag = this.state.legend.championTag;
    if (!legendTag) {
      return [];
    }

    return this.cardPool.filter(
      (c): c is UnitCard =>
        c.cardType === "unit" && c.isChampion === true && (c.tags?.includes(legendTag) ?? false),
    );
  }

  /**
   * Set the chosen champion.
   */
  setChampion(champion: UnitCard): AddCardResult {
    if (!this.state.legend) {
      return { error: { code: "NO_LEGEND", message: "Select a legend first" }, success: false };
    }

    if (!champion.isChampion) {
      return {
        error: { code: "NOT_CHAMPION", message: `${champion.name} is not a champion unit` },
        success: false,
      };
    }

    const legendTag = this.state.legend.championTag;
    if (legendTag && !(champion.tags?.includes(legendTag) ?? false)) {
      return {
        error: {
          code: "TAG_MISMATCH",
          message: `${champion.name} doesn't have tag "${legendTag}" matching your legend`,
        },
        success: false,
      };
    }

    this.state.chosenChampion = champion;
    return { success: true };
  }

  // ==========================================================================
  // Main Deck
  // ==========================================================================

  /**
   * Get cards that can legally be added to the main deck.
   * Auto-filtered by domain identity, 3-copy limit, and card type.
   */
  getAvailableMainDeckCards(extraCriteria?: CardFilterCriteria): Card[] {
    const identity = this.getDomainIdentity();
    const copies = this.getCopyCounts();

    // Base filter: main deck card types, domain identity
    let available = this.cardPool.filter((c) => {
      // Must be a main deck card type
      if (!["unit", "spell", "gear", "equipment"].includes(c.cardType)) {
        return false;
      }
      // Exclude tokens
      if ("isToken" in c && c.isToken) {
        return false;
      }
      // Must match domain identity
      if (identity.length > 0 && !matchesDomainIdentity(c as FilterableCard, identity)) {
        return false;
      }
      // Must not exceed 3 copies
      if ((copies[c.name] ?? 0) >= MAX_COPIES) {
        return false;
      }
      return true;
    });

    // Apply extra criteria if provided
    if (extraCriteria) {
      available = filterCards(available as FilterableCard[], extraCriteria) as Card[];
    }

    return available;
  }

  /**
   * Add a card to the main deck.
   */
  addToMainDeck(card: Card): AddCardResult {
    if (!this.state.legend) {
      return { error: { code: "NO_LEGEND", message: "Select a legend first" }, success: false };
    }

    // Check card type
    if (!["unit", "spell", "gear", "equipment"].includes(card.cardType)) {
      return {
        error: { code: "WRONG_TYPE", message: `${card.cardType} cards can't go in the main deck` },
        success: false,
      };
    }

    // Check domain identity
    const identity = this.getDomainIdentity();
    if (identity.length > 0 && !matchesDomainIdentity(card as FilterableCard, identity)) {
      return {
        error: { code: "DOMAIN_MISMATCH", message: `${card.name} doesn't match domain identity` },
        success: false,
      };
    }

    // Check copy limit
    const copies = this.getCopyCounts();
    if ((copies[card.name] ?? 0) >= MAX_COPIES) {
      return {
        error: { code: "MAX_COPIES", message: `Already have ${MAX_COPIES} copies of ${card.name}` },
        success: false,
      };
    }

    this.state.mainDeck.push(card);
    return { success: true };
  }

  /**
   * Remove a card from the main deck by index.
   */
  removeFromMainDeck(index: number): boolean {
    if (index < 0 || index >= this.state.mainDeck.length) {
      return false;
    }
    this.state.mainDeck.splice(index, 1);
    return true;
  }

  /**
   * Remove a card from the main deck by ID (removes first match).
   */
  removeFromMainDeckById(cardId: string): boolean {
    const idx = this.state.mainDeck.findIndex((c) => c.id === cardId);
    if (idx === -1) {
      return false;
    }
    this.state.mainDeck.splice(idx, 1);
    return true;
  }

  // ==========================================================================
  // Rune Deck
  // ==========================================================================

  /**
   * Get rune cards that match the domain identity.
   */
  getAvailableRunes(): RuneCard[] {
    const identity = this.getDomainIdentity();

    return this.cardPool.filter(
      (c): c is RuneCard =>
        c.cardType === "rune" &&
        (identity.length === 0 || identity.includes(typeof c.domain === "string" ? c.domain : "")),
    ) as RuneCard[];
  }

  /**
   * Add a rune to the rune deck.
   */
  addToRuneDeck(rune: RuneCard): AddCardResult {
    if (this.state.runeDeck.length >= RUNE_DECK_SIZE) {
      return {
        error: { code: "RUNE_DECK_FULL", message: `Rune deck already has ${RUNE_DECK_SIZE} cards` },
        success: false,
      };
    }

    const identity = this.getDomainIdentity();
    const runeDomain = typeof rune.domain === "string" ? rune.domain : "";
    if (identity.length > 0 && !identity.includes(runeDomain)) {
      return {
        error: { code: "RUNE_DOMAIN", message: `${rune.name} doesn't match domain identity` },
        success: false,
      };
    }

    this.state.runeDeck.push(rune);
    return { success: true };
  }

  /**
   * Remove a rune from the rune deck.
   */
  removeFromRuneDeck(index: number): boolean {
    if (index < 0 || index >= this.state.runeDeck.length) {
      return false;
    }
    this.state.runeDeck.splice(index, 1);
    return true;
  }

  /**
   * Auto-fill the rune deck with available runes (evenly distributed by domain).
   */
  autoFillRuneDeck(): void {
    const available = this.getAvailableRunes();
    if (available.length === 0) {
      return;
    }

    // Clear existing runes
    this.state.runeDeck = [];

    // Fill evenly across available rune domains
    const identity = this.getDomainIdentity();
    const runesByDomain = new Map<string, RuneCard>();
    for (const rune of available) {
      const d = typeof rune.domain === "string" ? rune.domain : "";
      if (!runesByDomain.has(d)) {
        runesByDomain.set(d, rune);
      }
    }

    const domains = [...runesByDomain.keys()].filter(
      (d) => identity.length === 0 || identity.includes(d),
    );
    if (domains.length === 0) {
      return;
    }

    let i = 0;
    while (this.state.runeDeck.length < RUNE_DECK_SIZE && domains.length > 0) {
      const domain = domains[i % domains.length];
      const rune = runesByDomain.get(domain);
      if (rune) {
        this.state.runeDeck.push(rune);
      }
      i++;
    }
  }

  // ==========================================================================
  // Battlefields
  // ==========================================================================

  /**
   * Get battlefields that match the domain identity.
   */
  getAvailableBattlefields(): BattlefieldCard[] {
    const identity = this.getDomainIdentity();

    return this.cardPool.filter(
      (c): c is BattlefieldCard =>
        c.cardType === "battlefield" &&
        (identity.length === 0 || matchesDomainIdentity(c as FilterableCard, identity)),
    ) as BattlefieldCard[];
  }

  /**
   * Get how many battlefields you need to provide (3 for duel, pick 1 at game start).
   */
  getRequiredBattlefieldCount(): number {
    return 3; // All modes: bring 3, use 1
  }

  /**
   * Add a battlefield.
   */
  addBattlefield(bf: BattlefieldCard): AddCardResult {
    if (this.state.battlefields.length >= 3) {
      return { error: { code: "BF_FULL", message: "Already have 3 battlefields" }, success: false };
    }

    // Check domain identity
    const identity = this.getDomainIdentity();
    if (identity.length > 0 && !matchesDomainIdentity(bf as FilterableCard, identity)) {
      return {
        error: { code: "BF_DOMAIN", message: `${bf.name} doesn't match domain identity` },
        success: false,
      };
    }

    // Check for duplicates
    if (this.state.battlefields.some((b) => b.name === bf.name)) {
      return {
        error: { code: "BF_DUPLICATE", message: `Already have ${bf.name}` },
        success: false,
      };
    }

    this.state.battlefields.push(bf);
    return { success: true };
  }

  /**
   * Remove a battlefield.
   */
  removeBattlefield(index: number): boolean {
    if (index < 0 || index >= this.state.battlefields.length) {
      return false;
    }
    this.state.battlefields.splice(index, 1);
    return true;
  }

  // ==========================================================================
  // Statistics & Validation
  // ==========================================================================

  /**
   * Get copy counts of all cards by name (main deck + champion).
   */
  getCopyCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    if (this.state.chosenChampion) {
      counts[this.state.chosenChampion.name] = 1;
    }
    for (const card of this.state.mainDeck) {
      counts[card.name] = (counts[card.name] ?? 0) + 1;
    }
    return counts;
  }

  /**
   * Get deck statistics.
   */
  getStats(): DeckStats {
    const allMainDeck = this.state.chosenChampion
      ? [this.state.chosenChampion as Card, ...this.state.mainDeck]
      : [...this.state.mainDeck];

    const byType: Record<string, number> = {};
    const byDomain: Record<string, number> = {};
    const byRarity: Record<string, number> = {};
    const manaCurve: Record<number, number> = {};

    for (const card of allMainDeck) {
      // Type
      byType[card.cardType] = (byType[card.cardType] ?? 0) + 1;

      // Domain
      const domains = card.domain
        ? (typeof card.domain === "string"
          ? [card.domain]
          : card.domain)
        : [];
      for (const d of domains) {
        byDomain[d] = (byDomain[d] ?? 0) + 1;
      }

      // Rarity
      if (card.rarity) {
        byRarity[card.rarity] = (byRarity[card.rarity] ?? 0) + 1;
      }

      // Mana curve
      const cost = card.energyCost ?? 0;
      manaCurve[cost] = (manaCurve[cost] ?? 0) + 1;
    }

    const identity = this.getDomainIdentity();
    const reqBf = DECK_BATTLEFIELD_COUNT;

    return {
      battlefieldCount: this.state.battlefields.length,
      byDomain,
      byRarity,
      byType,
      copies: this.getCopyCounts(),
      domainIdentity: identity,
      isComplete:
        allMainDeck.length >= MIN_MAIN_DECK &&
        this.state.runeDeck.length === RUNE_DECK_SIZE &&
        this.state.battlefields.length >= DECK_BATTLEFIELD_COUNT &&
        this.state.legend !== null &&
        this.state.chosenChampion !== null,
      mainDeckCount: allMainDeck.length,
      manaCurve,
      requiredBattlefields: reqBf,
      runeDeckCount: this.state.runeDeck.length,
    };
  }

  /**
   * Validate the current deck against all rules.
   */
  validate(): DeckValidationResult {
    if (!this.state.legend) {
      return { errors: [{ code: "NO_LEGEND", message: "No legend selected" }], valid: false };
    }
    if (!this.state.chosenChampion) {
      return { errors: [{ code: "NO_CHAMPION", message: "No champion selected" }], valid: false };
    }

    return validateDeck({
      battlefields: this.state.battlefields,
      chosenChampion: this.state.chosenChampion,
      legend: this.state.legend,
      mainDeck: [this.state.chosenChampion as Card, ...this.state.mainDeck],
      mode: this.state.mode,
      runeDeck: this.state.runeDeck,
    });
  }

  /**
   * Get the current deck state (for serialization/display).
   */
  getState(): Readonly<DeckState> {
    return this.state;
  }

  /**
   * Load a deck state (for importing).
   */
  loadState(state: DeckState): void {
    this.state = { ...state };
  }

  /**
   * Clear the entire deck.
   */
  clear(): void {
    this.state = {
      battlefields: [],
      chosenChampion: null,
      legend: null,
      mainDeck: [],
      mode: this.state.mode,
      runeDeck: [],
    };
  }

  /**
   * Export deck as a simple list of card IDs (for sharing/saving).
   */
  export(): {
    legendId: string;
    championId: string;
    mainDeckIds: string[];
    runeIds: string[];
    battlefieldIds: string[];
  } | null {
    if (!this.state.legend || !this.state.chosenChampion) {
      return null;
    }
    return {
      battlefieldIds: this.state.battlefields.map((c) => c.id),
      championId: this.state.chosenChampion.id,
      legendId: this.state.legend.id,
      mainDeckIds: this.state.mainDeck.map((c) => c.id),
      runeIds: this.state.runeDeck.map((c) => c.id),
    };
  }
}
