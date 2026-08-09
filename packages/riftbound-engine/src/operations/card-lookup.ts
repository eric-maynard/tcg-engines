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
  /** Card tags (Mech, Poro, champion names, …) — used by target filters. */
  readonly tags?: readonly string[];
  readonly timing?: string;
  readonly isChampion?: boolean;
  /** Legend only — the champion tag naming this legend's Chosen Champion (rule 103.2.a.3). */
  readonly championTag?: string;
  /**
   * rule 186 — a Token (printed token card such as Recruit / Sprite / Gold, or
   * one minted by an effect). Tokens exist only on the board or the chain:
   * put anywhere else they cease to exist (186.1). Read via `isToken(id)`.
   */
  readonly isToken?: boolean;
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
   * Atakhan-style marker (rule 356.4): a paid "kill a friendly unit"
   * additional cost discounts this card by the killed unit's printed cost —
   * [1] per Energy and one `powerDomain` pip per Power pip.
   */
  readonly sacrificeCostDiscount?: { readonly powerDomain: string };
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
   * Shady Spectacles-style marker (ven-137-166): "As this is attached to a
   * unit, choose another friendly unit. The equipped unit becomes a copy of
   * that unit for as long as this is attached to it." rule 477.1.b — the copy
   * replaces the HOLDER's traits (not the equipment's text, which is
   * `copyAttachedUnitText`).
   */
  readonly copyChosenUnitToHolder?: boolean;
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
    readonly effectText?: boolean;
    readonly keyword?: string;
    readonly value?: number;
    readonly cost?: unknown;
    /** rule 204.3.b: X paid in [rainbow] Power rather than Energy. */
    readonly xCost?: string;
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
    readonly repeat?:
      | { energy?: number; power?: readonly string[]; discard?: number }
      | readonly { energy?: number; power?: readonly string[]; discard?: number }[];
  }[];
}

/**
 * Card definition registry — maps card instance IDs to their definitions.
 */
/**
 * One entry of the format-legal card pool (rule 762). Only the fields a
 * naming prompt needs — the pool is a catalog of printed cards, not of the
 * card instances in this game.
 */
export interface NameCatalogEntry {
  readonly name?: string;
  readonly cardType?: string;
  readonly tags?: readonly string[];
}

export class CardDefinitionRegistry {
  private readonly definitions = new Map<string, CardDefinitionLookup>();
  /** Pre-copy definitions of instances currently copying another card (rule 477.1.b). */
  private readonly copyOriginals = new Map<string, CardDefinitionLookup>();
  /** Instance being copied, per copying instance (rule 477.1.b) — lets snapshots render the copy. */
  private readonly copySources = new Map<string, string>();
  /** rule 762 — the format-legal card pool used to enumerate nameable cards/tags. */
  private nameCatalog: NameCatalogEntry[] | null = null;

  /**
   * rule 477.1.b: `holderId` becomes a copy of `sourceId` — its traits (name,
   * Might, keywords, abilities) are replaced for as long as the copy lasts.
   * Separately granted keywords live on card meta and are untouched (477.2.a).
   */
  becomeCopyOf(holderId: string, sourceId: string): void {
    const source = this.definitions.get(sourceId);
    const current = this.definitions.get(holderId);
    if (!source || !current) {
      return;
    }
    if (!this.copyOriginals.has(holderId)) {
      this.copyOriginals.set(holderId, current);
    }
    this.definitions.set(holderId, { ...source, id: holderId });
    this.copySources.set(holderId, sourceId);
  }

  /**
   * rule 477.1.b: the instance `holderId` is currently copying, if any. Read by
   * the app snapshot so the copy's name/Might/rules text reach the client.
   */
  copySourceOf(holderId: string): string | undefined {
    return this.copySources.get(holderId);
  }

  /** End a `becomeCopyOf` copy, restoring the instance's printed definition. */
  revertCopy(holderId: string): void {
    const original = this.copyOriginals.get(holderId);
    if (!original) {
      return;
    }
    this.copyOriginals.delete(holderId);
    this.copySources.delete(holderId);
    this.definitions.set(holderId, original);
  }

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
   * rule 186 — the ONE token test: the definition says so (`isToken`, set on
   * printed token cards and on every effect-minted `token-def-*` / instance
   * registration), or the id is an engine-minted `token-…` instance.
   */
  isToken(cardId: string): boolean {
    if (cardId.startsWith("token-")) {
      return true;
    }
    const def = this.definitions.get(cardId);
    return def?.isToken === true || (def?.id ?? "").startsWith("token-def-");
  }

  /**
   * Check if a card has a specific keyword. Cards may declare keywords either
   * on the flat `keywords` array or as `abilities: [{type:"keyword", keyword:X}]`.
   */
  hasKeyword(cardId: string, keyword: string): boolean {
    const def = this.definitions.get(cardId);
    if (!def) {
      return false;
    }
    if (def.keywords?.includes(keyword)) {
      return true;
    }
    if ((def.abilities ?? []).some((a) => a.type === "keyword" && a.keyword === keyword)) {
      return true;
    }
    // rule-id: unl-120-219 — some defs encode a printed keyword as an
    // unconditional static that grants it to itself ([Ambush] on Rengar).
    // That is still a printed keyword and must read as one before the
    // static-ability recalc has stamped card meta (same rule as `cantReady`).
    return (def.abilities ?? []).some((a) => {
      const ab = a as {
        type?: string;
        condition?: unknown;
        effect?: { type?: string; keyword?: string; target?: unknown };
      };
      return (
        ab.type === "static" &&
        ab.condition === undefined &&
        ab.effect?.type === "grant-keyword" &&
        ab.effect.keyword === keyword &&
        (ab.effect.target === undefined || ab.effect.target === "self")
      );
    });
  }

  /**
   * rule-id: unl-144-219 — "I can't be readied." True when the card carries
   * the CantReady keyword: printed, granted (via `grantedKeywords` meta), or
   * self-granted by an unconditional static (so it holds even before the
   * static-ability recalc has stamped the meta).
   */
  cantReady(cardId: string, grantedKeywords?: readonly { keyword: string }[]): boolean {
    if (this.hasKeyword(cardId, "CantReady")) {
      return true;
    }
    if ((grantedKeywords ?? []).some((gk) => gk.keyword === "CantReady")) {
      return true;
    }
    return (this.getAbilities(cardId) ?? []).some((a) => {
      const ab = a as {
        type?: string;
        condition?: unknown;
        effect?: { type?: string; keyword?: string; target?: unknown };
      };
      return (
        ab.type === "static" &&
        ab.condition === undefined &&
        ab.effect?.type === "grant-keyword" &&
        ab.effect.keyword === "CantReady" &&
        (ab.effect.target === undefined || ab.effect.target === "self")
      );
    });
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
    const abilities = this.definitions.get(cardId)?.abilities ?? [];
    // rule 135.4.b (sfd-208-221) — a static grant may print the granted text
    // INLINE on the effect ("friendly legends have '[Exhaust]: …'"). Expose
    // each inline ability at the index its grant names, so the granted ability
    // is looked up exactly like a printed one. `granted-only` keeps the
    // granting card itself from activating it.
    const inline = abilities.flatMap((a) => {
      const eff = (a as { type?: string; effect?: { type?: string; ability?: unknown } }).effect;
      return (a as { type?: string }).type === "static" &&
        eff?.type === "grant-ability" &&
        eff.ability !== undefined
        ? [eff.ability]
        : [];
    });
    return inline.length > 0
      ? ([...abilities, ...inline] as CardDefinitionLookup["abilities"])
      : abilities;
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
  getSpellRepeatCost(
    cardId: string,
  ): readonly { energy: number; power: readonly string[]; discard?: number }[] | undefined {
    const def = this.definitions.get(cardId);
    if (!def?.abilities) {
      return undefined;
    }
    for (const ab of def.abilities) {
      if (ab.type === "spell" && ab.repeat) {
        // Rule 820.1.c.2 / 820.1.c.3 / 820.3: multi-tier Repeat lists one
        // additional cost per extra activation. Normalise single-cost
        // Repeat to a one-element tier list so callers handle both shapes.
        const tiers = Array.isArray(ab.repeat) ? ab.repeat : [ab.repeat];
        // rule 820.1.d (unl-017-219): a tier may be priced in cards ("[Repeat]
        // — Discard 1"), not Energy/Power; carry that through to the cost path.
        return tiers.map((t) => ({
          energy: t.energy ?? 0,
          power: t.power ?? [],
          ...((t as { discard?: number }).discard
            ? { discard: (t as { discard?: number }).discard as number }
            : {}),
        }));
      }
    }
    return undefined;
  }

  /**
   * rule-id: ven-049-166 — Get a spell's [Flow] cost, if any. Flow lets the
   * owner play the spell from their trash for this alternate cost, then
   * banish it. Returns `undefined` when the card has no Flow keyword.
   */
  getSpellFlowCost(cardId: string): { energy: number; power: readonly string[] } | undefined {
    const def = this.definitions.get(cardId);
    if (!def?.abilities) {
      return undefined;
    }
    for (const ab of def.abilities) {
      if (ab.type === "keyword" && ab.keyword === "Flow") {
        const c = ab.cost as { energy?: number; power?: readonly string[] } | undefined;
        return { energy: c?.energy ?? 0, power: c?.power ?? [] };
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
      // Rule 135.2.e.5.a: [rainbow] pips are payable with Power of any
      // Domain — check named domains first, cover rainbow from the leftover.
      let leftover = 0;
      for (const v of Object.values(pool.power)) {
        leftover += v ?? 0;
      }
      for (const [domain, count] of Object.entries(needed)) {
        if (domain === "rainbow") {
          continue;
        }
        const available = pool.power[domain as Domain] ?? 0;
        if (available < (count ?? 0)) {
          return false;
        }
        leftover -= count ?? 0;
      }
      if (leftover < (needed.rainbow ?? 0)) {
        return false;
      }
      // Rule 135.2.e.6.c (rule-id: ven-150-166): a multi-domain card's
      // printed pips are hybrid — payable only with Power of the card's own
      // Domains (or pooled [rainbow] Power, Rule 135.2.e.5.b).
      if (Array.isArray(def.domain) && def.domain.length > 1 && (needed.rainbow ?? 0) > 0) {
        const anyPool = pool.power as Partial<Record<string, number>>;
        let hybridAvailable = anyPool.rainbow ?? 0;
        for (const d of def.domain) {
          hybridAvailable += Math.max(0, (anyPool[d] ?? 0) - (needed[d] ?? 0));
        }
        if (hybridAvailable < (needed.rainbow ?? 0)) {
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

  /**
   * rule 762 — a named card is any card in the format's legal card pool, not
   * merely one that happens to be in this game. `definitions` holds one entry
   * per card INSTANCE of the two loaded decks (plus leftovers from earlier
   * games in a long-lived process), so enumerating it both omits legal names
   * and leaks the opponent's deck list. Game setup installs the real pool here.
   */
  setNameCatalog(defs: readonly NameCatalogEntry[] | undefined): void {
    this.nameCatalog = defs && defs.length > 0 ? [...defs] : null;
  }

  /**
   * List distinct card names in the format-legal pool (rule 762), optionally
   * filtered by card type. Falls back to the registered instances when no pool
   * catalog was installed.
   */
  listNames(cardType?: string): string[] {
    const names = new Set<string>();
    // Cards actually in play are legal names too (and cover ad-hoc definitions
    // the pool does not know about); the pool supplies everything else.
    const source: Iterable<{ name?: string; cardType?: string }> = [
      ...(this.nameCatalog ?? []),
      ...this.definitions.values(),
    ];
    for (const def of source) {
      if (cardType && def.cardType !== cardType) continue;
      if (def.name) names.add(def.name);
    }
    return [...names].sort();
  }

  /**
   * List distinct tags printed on cards in the format-legal pool (rule 762).
   * Falls back to the registered instances when no catalog was installed.
   */
  listTags(): string[] {
    const tags = new Set<string>();
    const source: Iterable<{ tags?: readonly string[] }> = [
      ...(this.nameCatalog ?? []),
      ...this.definitions.values(),
    ];
    for (const def of source) {
      for (const tag of def.tags ?? []) {
        if (tag) tags.add(tag);
      }
    }
    return [...tags].sort();
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
