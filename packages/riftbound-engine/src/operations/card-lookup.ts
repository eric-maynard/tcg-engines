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
  /**
   * Interactive cost reduction flag. When a card declares
   * `interactiveCostReduction: "target-might"`, play-move validation
   * reduces the card's energy cost by the Might of a chosen target
   * (`chosenTargetId`) provided in the move parameters. Used by
   * Hextech Gauntlets and similar equipment whose costs scale with
   * their attachment target.
   */
  readonly interactiveCostReduction?: "target-might";
  /**
   * Move-escalation flag. When a card with this flag is on the board
   * and enemy-controlled, each unit the opponent moves beyond the first
   * in a single turn costs an additional 1 rainbow (energy) per move.
   * Used by Mageseeker Investigator.
   */
  readonly moveEscalation?: boolean;
  /**
   * Heimerdinger-style marker: when set, this card exposes every
   * exhaust-cost activated ability on friendly legends, units, and gear as
   * if it were its own. The inherited ability's cost is paid on THIS card
   * (the "host"), but the ability's effect comes from the source card.
   * Used by Heimerdinger, Inventor.
   */
  readonly inheritExhaustAbilities?: boolean;
  /**
   * Svellsongur-style marker: when this equipment card is attached to a
   * unit via `equipCard`, the unit's card instance ID is recorded on the
   * equipment's `copiedFromCardId` meta so the unit's abilities are exposed
   * on the equipment. Used by Svellsongur.
   */
  readonly copyAttachedUnitText?: boolean;
  /**
   * The Zero Drive marker: when set, the card's banish effect records
   * every banished target in `exiledByThis` meta instead of only moving it
   * to trash, and when the card leaves the board those cards return.
   * Used by The Zero Drive.
   */
  readonly tracksExiledCards?: boolean;
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
    /** Timing for activated/spell abilities (action/reaction) */
    readonly timing?: string;
    /**
     * Repeat cost for spells with the `[Repeat]` keyword. When present,
     * the player may pay this cost additional times at play time to
     * replay the spell's effect multiple times. Rule: [Repeat] — pay
     * :cost: to repeat the effect.
     */
    readonly repeat?: { energy?: number; power?: string[] };
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
   * Get the numeric value attached to a keyword on this card, if any.
   *
   * Some keywords are "valued" — e.g. `[Hunt N]`, `[Assault N]`,
   * `[Deflect N]`, `[Shield N]`, `[Level N]`. The value is carried on a
   * `{ type: "keyword", keyword, value }` ability entry. Multiple
   * instances of the same valued keyword stack additively (rule 802 —
   * keyword instances are independent).
   *
   * Returns `undefined` when the card has no instance of the keyword;
   * returns the summed value (an undecorated keyword counts as 1) when at
   * least one instance is present. Callers that only want the
   * "has-keyword" boolean should use `hasKeyword`.
   *
   * @param cardId - Card instance id
   * @param keyword - Keyword name (case-sensitive, e.g. "Hunt")
   */
  getKeywordValue(cardId: string, keyword: string): number | undefined {
    const def = this.definitions.get(cardId);
    if (!def) {
      return undefined;
    }
    let total = 0;
    let found = false;
    for (const ability of def.abilities ?? []) {
      if (ability.type === "keyword" && ability.keyword === keyword) {
        found = true;
        total += ability.value ?? 1;
      }
    }
    // A keyword may also appear only on the bare `keywords` list with no
    // Valued ability entry (e.g. `keywords: ["Hunt"]`). Treat that as 1.
    if (!found && def.keywords?.includes(keyword)) {
      return 1;
    }
    return found ? total : undefined;
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
   * Get a spell's Repeat cost, if any. Returns the additional cost a
   * player pays per Repeat to resolve the spell's effect an additional
   * time. Returns `undefined` if the card is not a spell or has no
   * Repeat cost defined.
   */
  getSpellRepeatCost(cardId: string): { energy: number; power: readonly string[] } | undefined {
    const def = this.definitions.get(cardId);
    if (!def?.abilities) {
      return undefined;
    }
    for (const ab of def.abilities) {
      if (ab.type === "spell" && ab.repeat) {
        return {
          energy: ab.repeat.energy ?? 0,
          power: ab.repeat.power ?? [],
        };
      }
    }
    return undefined;
  }

  /**
   * Get a card's interactive cost reduction flag, if any.
   * Used by equipment like Hextech Gauntlets whose cost depends on
   * the Might of a player-chosen target at play time.
   */
  getInteractiveCostReduction(cardId: string): "target-might" | undefined {
    return this.definitions.get(cardId)?.interactiveCostReduction;
  }

  /**
   * Check if a card declares move escalation.
   * Cards like Mageseeker Investigator charge opponents extra power
   * for moving additional units past the first in a single turn.
   */
  hasMoveEscalation(cardId: string): boolean {
    return this.definitions.get(cardId)?.moveEscalation === true;
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

/**
 * Minimal shape of the per-card runtime metadata fields that affect Might.
 * Kept loose to avoid importing the full `RiftboundCardMeta` type here.
 */
interface MightAffectingMeta {
  buffed?: boolean;
  mightModifier?: number;
  combatMightModifier?: number;
  staticMightBonus?: number;
  equippedWith?: readonly string[];
}

/**
 * Compute a unit's *effective* Might (rule 140.x): base Might from the card
 * definition plus every modifier currently in effect — the `[+1]` buff
 * counter, runtime `mightModifier` deltas, `staticMightBonus` from static
 * abilities, and the Might bonus of any attached equipment.
 *
 * Returns 0 for non-units (base Might 0). Never returns a negative value
 * (rule 141: Might can't be reduced below 0).
 *
 * This is the single source of truth for the rule-520 death check and other
 * Might-sensitive code paths — don't re-derive Might inline.
 */
export function computeEffectiveMight(
  cardId: string,
  getCardMeta?: (cardId: string) => MightAffectingMeta | undefined,
  registry: CardDefinitionRegistry = getGlobalCardRegistry(),
): number {
  const baseMight = registry.getMight(cardId);
  if (baseMight === 0) {
    return 0;
  }
  const meta = getCardMeta?.(cardId);
  const buffBonus = meta?.buffed ? 1 : 0;
  const mightMod = meta?.mightModifier ?? 0;
  const combatMightMod = meta?.combatMightModifier ?? 0;
  const staticBonus = meta?.staticMightBonus ?? 0;
  let equipBonus = 0;
  for (const equipId of meta?.equippedWith ?? []) {
    equipBonus += registry.getMightBonus(equipId);
  }
  return Math.max(
    0,
    baseMight + buffBonus + mightMod + combatMightMod + staticBonus + equipBonus,
  );
}
