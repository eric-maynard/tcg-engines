/**
 * Riftbound Move Types
 *
 * Type definitions for all manual moves in the Riftbound tabletop simulator.
 * These moves handle card movement, counters/tokens, and phase tracking
 * without rule validation (players enforce rules themselves).
 */

/**
 * Player identifier type
 */
export type PlayerId = string;

/**
 * Card identifier type
 */
export type CardId = string;

/**
 * Zone identifier type
 */
export type ZoneId = string;

/**
 * Location identifier - can be a player's base or a battlefield
 */
export type LocationId = ZoneId;

/**
 * Domain types for Riftbound's six domains
 */
export type Domain = "fury" | "calm" | "mind" | "body" | "chaos" | "order";

/**
 * Domain power - partial record of domain to amount
 */
export type DomainPower = Partial<Record<Domain, number>>;

/**
 * Scoring method for victory points
 */
export type ScoringMethod = "conquer" | "hold";

/**
 * All Riftbound move parameter types
 *
 * This type defines the parameters for every move in the game.
 * Each key is a move name, and the value is the parameter type for that move.
 */
export interface RiftboundMoves {
  // ============================================
  // Setup Moves (Pregame Sequence)
  // ============================================

  /** Roll d20 for turn order determination (rule 115) */
  rollForFirst: { playerId: PlayerId };

  /** Roll winner chooses who goes first */
  chooseFirstPlayer: { playerId: PlayerId; firstPlayerId: PlayerId };

  /** Select 1 battlefield from 3 options (rule 644.5) */
  selectBattlefield: { playerId: PlayerId; battlefieldId: CardId; discardIds: CardId[] };

  /** Place Champion Legend in Legend Zone */
  placeLegend: { playerId: PlayerId; legendId: CardId };

  /** Place Chosen Champion in Champion Zone */
  placeChampion: { playerId: PlayerId; championId: CardId };

  /** Place battlefields in play */
  placeBattlefields: { battlefieldIds: CardId[] };

  /** Create main deck with cards */
  initializeMainDeck: { playerId: PlayerId; cardIds: CardId[] };

  /** Create rune deck */
  initializeRuneDeck: { playerId: PlayerId; runeIds: CardId[] };

  /** Shuffle both decks */
  shuffleDecks: { playerId: PlayerId };

  /** Draw starting hand (4 cards per rule 116) */
  drawInitialHand: { playerId: PlayerId };

  /** Mulligan: choose up to 2 cards to set aside and redraw (rule 117) */
  mulligan: { playerId: PlayerId; keepCards?: CardId[] };

  // ============================================
  // Chain & Showdown Moves
  // ============================================

  /** Pass priority during a chain (rule 540.4) */
  passChainPriority: { playerId: PlayerId };

  /** Resolve the top item on the chain (rule 543) */
  resolveChain: Record<string, never>;

  /** Pass focus during a showdown (rule 553.4) */
  passShowdownFocus: { playerId: PlayerId };

  /** Start a showdown at a battlefield (rule 548) */
  startShowdown: { playerId: PlayerId; battlefieldId: CardId };

  /** End a showdown (all players passed, rule 553.4.a) */
  endShowdown: Record<string, never>;

  /** Transition from setup to main game */
  transitionToPlay: Record<string, never>;

  // ============================================
  // Turn Structure Moves
  // ============================================

  /** Move to next phase */
  advancePhase: { playerId: PlayerId };

  /** End current turn */
  endTurn: { playerId: PlayerId };

  /** Forfeit the game */
  concede: { playerId: PlayerId };

  /** Ready all game objects (Awaken phase) */
  readyAll: { playerId: PlayerId };

  /** Clear rune pool resources */
  emptyRunePool: { playerId: PlayerId };

  // ============================================
  // Card Play Moves
  // ============================================

  /** Play unit to Base or Battlefield */
  playUnit: { playerId: PlayerId; cardId: CardId; location: LocationId };

  /**
   * Play gear to Base.
   *
   * `chosenTargetId` is required for equipment whose cost is reduced
   * interactively by the Might of a chosen target (e.g., Hextech
   * Gauntlets). Ignored for equipment without `interactiveCostReduction`.
   */
  playGear: { playerId: PlayerId; cardId: CardId; chosenTargetId?: CardId };

  /**
   * Play spell (goes to trash after).
   *
   * `xAmount` is required for spells with a variable X-cost (e.g.,
   * Bullet Time). It specifies the value the player chose to pay for X
   * and determines both the additional cost deducted from the rune pool
   * and the value exposed to the effect via `{ variable: "x" }`. Ignored
   * for spells without an X-cost.
   */
  playSpell: {
    playerId: PlayerId;
    cardId: CardId;
    targets?: CardId[];
    xAmount?: number;
    /**
     * Number of EXTRA times to repeat the spell's effect for spells with
     * the `[Repeat]` keyword. Each repeat pays the spell's `repeat` cost
     * (energy) in addition to the base cost. A value of 0 (default) means
     * the spell resolves exactly once. A value of N means the effect
     * resolves (1 + N) times.
     *
     * For spells without a `repeat` cost defined, this parameter is
     * ignored (and the spell always resolves once).
     */
    repeatCount?: number;
  };

  /** Place Hidden card facedown */
  hideCard: { playerId: PlayerId; cardId: CardId; battlefieldId: CardId };

  /** Reveal and play hidden card */
  revealHidden: { playerId: PlayerId; cardId: CardId };

  /** Play Chosen Champion from Champion Zone */
  playFromChampionZone: { playerId: PlayerId; location: LocationId };

  // ============================================
  // Movement Moves
  // ============================================

  /** Exhaust unit(s) to move */
  standardMove: {
    playerId: PlayerId;
    unitIds: CardId[];
    destination: LocationId;
  };

  /** Move between battlefields (Ganking) */
  gankingMove: { playerId: PlayerId; unitId: CardId; toBattlefield: CardId };

  /** Return unit to base (non-move) */
  recallUnit: { playerId: PlayerId; unitId: CardId };

  /** Return gear to base */
  recallGear: { playerId: PlayerId; gearId: CardId };

  // ============================================
  // Resource Moves
  // ============================================

  /** Channel runes from deck */
  channelRunes: { playerId: PlayerId; count: number };

  /** Tap rune for energy */
  exhaustRune: { playerId: PlayerId; runeId: CardId };

  /** Recycle rune for power */
  recycleRune: { playerId: PlayerId; runeId: CardId; domain: Domain };

  /** Add energy/power to pool */
  addResources: { playerId: PlayerId; energy?: number; power?: DomainPower };

  /** Spend from rune pool */
  spendResources: { playerId: PlayerId; energy?: number; power?: DomainPower };

  // ============================================
  // Combat Moves
  // ============================================

  /** Mark battlefield as contested */
  contestBattlefield: { playerId: PlayerId; battlefieldId: CardId };

  /** Designate unit as attacker */
  assignAttacker: { playerId: PlayerId; unitId: CardId };

  /** Designate unit as defender */
  assignDefender: { playerId: PlayerId; unitId: CardId };

  /** Assign combat damage to unit */
  assignDamage: { playerId: PlayerId; targetId: CardId; amount: number };

  /** End combat, determine outcome */
  resolveCombat: { battlefieldId: CardId };

  /** Resolve full combat using the combat resolver (automated damage, kills, outcome) */
  resolveFullCombat: { battlefieldId: CardId };

  /** Take control of battlefield */
  conquerBattlefield: { playerId: PlayerId; battlefieldId: CardId };

  /** Award victory point */
  scorePoint: { playerId: PlayerId; method: ScoringMethod; battlefieldId: CardId };

  /** Reset combat designations */
  clearCombatState: { battlefieldId: CardId };

  // ============================================
  // Counter/Token Moves
  // ============================================

  /** Mark card as exhausted */
  exhaustCard: { cardId: CardId };

  /** Mark card as ready */
  readyCard: { cardId: CardId };

  /** Add damage to unit */
  addDamage: { cardId: CardId; amount: number };

  /** Remove damage from unit */
  removeDamage: { cardId: CardId; amount: number };

  /** Clear all damage from unit */
  clearDamage: { cardId: CardId };

  /** Add buff counter to unit */
  addBuff: { cardId: CardId };

  /** Remove buff counter */
  removeBuff: { cardId: CardId };

  /** Mark unit as stunned */
  stunUnit: { cardId: CardId };

  /** Remove stunned status */
  unstunUnit: { cardId: CardId };

  // ============================================
  // Discard/Trash Moves
  // ============================================

  /** Discard from hand */
  discardCard: { playerId: PlayerId; cardId: CardId };

  /** Send unit to trash */
  killUnit: { cardId: CardId };

  /** Send card to banishment */
  banishCard: { cardId: CardId };

  /** Return card to deck bottom */
  recycleCard: { cardId: CardId };

  // ============================================
  // XP Moves
  // ============================================

  /** Gain XP for a player */
  gainXp: { playerId: PlayerId; amount: number };

  /** Spend XP from a player's total */
  spendXp: { playerId: PlayerId; amount: number };

  // ============================================
  // Ability Moves
  // ============================================

  /**
   * Activate an ability on a card.
   *
   * `sourceCardId` is an optional override used for ability-inheritance
   * cards (e.g., Heimerdinger inheriting exhaust abilities from friendly
   * permanents, or Svellsongur copying an attached unit's abilities). When
   * present, the ability is looked up from `sourceCardId` at `abilityIndex`,
   * but the cost (including exhaust) is paid on `cardId` (the "host"). When
   * absent, the ability is looked up from `cardId` directly.
   */
  activateAbility: {
    playerId: PlayerId;
    cardId: CardId;
    abilityIndex: number;
    sourceCardId?: CardId;
  };

  // ============================================
  // Equipment Moves
  // ============================================

  /** Attach equipment to a unit */
  equipCard: { playerId: PlayerId; equipmentId: CardId; unitId: CardId };

  /** Detach equipment from a unit (returns equipment to base) */
  unequipCard: { playerId: PlayerId; equipmentId: CardId };

  // ============================================
  // Draw Moves
  // ============================================

  /** Draw from main deck */
  drawCard: { playerId: PlayerId; count?: number };

  /** Shuffle trash into deck, opponent scores */
  burnOut: { playerId: PlayerId; opponentId: PlayerId };

  // ============================================
  // Pending Choice Moves
  // ============================================

  /**
   * Resolve a pending "reveal hand and pick a card" choice.
   *
   * Used by effects like Sabotage and Mindsplitter that pause the game
   * to let the active player pick a card from an opponent's revealed hand.
   * The chosen card is recycled/banished/discarded per the stored effect.
   */
  resolvePendingChoice: { playerId: PlayerId; pickedCardId: CardId };

  // ============================================
  // Token & Sandbox Meta Moves (W10)
  // ============================================

  /**
   * Spawn a token card into a target zone.
   *
   * Mints a fresh card instance with a synthetic ID, registers it in the
   * card definition registry using the built-in token catalog, and places
   * it in the requested zone (typically `base` or a battlefield zone).
   *
   * The `count` parameter batches spawns so multi-token effects can emit
   * a single aggregate match-log entry.
   */
  addToken: {
    playerId: PlayerId;
    zoneId: ZoneId;
    tokenName: TokenName;
    count?: number;
  };

  /**
   * Generic counter +/- on a single card.
   *
   * Delegates to the core counter API. `delta` may be negative to remove
   * counters. Supported counter types are the four tracked by the
   * Riftbound tabletop tools: plus, minus, poison, and experience.
   */
  addCounter: {
    cardId: CardId;
    counterType: RiftboundCounterType;
    delta: number;
  };

  /**
   * Numeric ±/± buff on a unit.
   *
   * Unlike the flag-only `addBuff` move, this applies a persistent delta
   * to `meta.mightModifier` (and `meta.toughnessModifier` for UI display).
   * Static recalculation is triggered after the update so derived stats
   * stay consistent.
   */
  modifyBuff: {
    cardId: CardId;
    deltaMight: number;
    deltaToughness?: number;
  };

  /**
   * Duplicate an existing card into a target zone (sandbox-only).
   *
   * Uses the source card's definition to mint a fresh instance with a
   * synthetic ID. This bypasses rules validation — the caller must gate
   * the move behind a Sandbox Mode flag in the UI.
   */
  duplicateCard: {
    playerId: PlayerId;
    cardId: CardId;
    destinationZone: ZoneId;
  };

  /**
   * Attach a free-form label string to a card's metadata.
   *
   * Purely cosmetic — used by the sandbox action panel to let players
   * mark cards with short notes. Engine logic ignores the label.
   */
  labelCard: { cardId: CardId; label: string };

  /**
   * Transfer control of a card to a different player (sandbox-only).
   *
   * Mutates the `controller` field on the internal card store without
   * changing the owner. Rule-validated control transfers flow through
   * normal effects; this move is a sandbox override and must be gated
   * behind a Sandbox Mode flag in the UI.
   */
  transferControl: { cardId: CardId; newControllerId: PlayerId };

  // ============================================
  // Deck & Peek Moves (W12)
  // ============================================

  /**
   * Privately reveal the top N cards of a player's main deck.
   *
   * Stores a `peek-top` pending choice on game state so the UI can
   * surface the preview to the peeking player; the match log emits a
   * public "Looked at top N" line without revealing the actual cards.
   */
  peekTopN: { playerId: PlayerId; count: number };

  /**
   * Place a list of card IDs on top of the main deck, preserving order.
   *
   * The first ID in the array becomes the very top of the deck. Used by
   * the W12 peek dialog after the player chooses an ordering.
   */
  placeCardsOnTopOfDeckInOrder: {
    playerId: PlayerId;
    cardIds: CardId[];
  };

  /**
   * Publicly reveal the top N cards of a player's main deck to both
   * players (the cards remain on top of the deck in their current order).
   */
  revealTopToOpponent: { playerId: PlayerId; count: number };

  /**
   * Recycle multiple cards in one move.
   *
   * Thin batch wrapper around `recycleCard` that emits a single aggregate
   * match-log entry for the whole batch.
   */
  recycleMany: { playerId: PlayerId; cardIds: CardId[] };

  /**
   * Move a card from its current zone into the controlling player's hand.
   *
   * Used by the W12 peek dialog's "To hand" action and by sandbox tools
   * that pull a specific card out of any zone. Clears transient counters
   * (damage, buffs) on the way.
   */
  sendToHand: { cardId: CardId };
}

/**
 * Built-in Riftbound token names.
 *
 * Matches the six token types produced by existing card effects. New
 * tokens should be added to this union AND to {@link RIFTBOUND_TOKEN_DEFS}
 * in `moves/token.ts` so the manual `addToken` move can spawn them.
 */
export type TokenName = "Gold" | "Recruit" | "Mech" | "Sand Soldier" | "Sprite" | "Bird";

/**
 * Counter types tracked by the `addCounter` sandbox move.
 */
export type RiftboundCounterType = "plus" | "minus" | "poison" | "experience";
