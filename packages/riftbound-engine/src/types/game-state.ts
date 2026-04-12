/**
 * Riftbound Game State Types
 *
 * Core state types for the Riftbound tabletop simulator.
 * Includes card metadata, battlefield state, and resource pools.
 */

import type { Domain, DomainPower } from "./moves";

// Re-export Domain types for convenience
export type { Domain, DomainPower } from "./moves";

/**
 * Player identifier type
 * Using string for simplicity in the tabletop simulator
 */
export type PlayerId = string;

/**
 * Card identifier type
 * Using string for simplicity in the tabletop simulator
 */
export type CardId = string;

/**
 * Game phase type - follows Riftbound turn structure
 */
export type GamePhase =
  | "setup"
  | "awaken"
  | "beginning"
  | "channel"
  | "draw"
  | "main"
  | "ending"
  | "cleanup";

/**
 * Game status type
 */
export type GameStatus = "setup" | "playing" | "finished";

/**
 * Combat role for units in combat
 */
export type CombatRole = "attacker" | "defender" | null;

/**
 * Card metadata for Riftbound cards
 *
 * Tracks dynamic state like damage, exhaustion, and combat roles.
 * This is stored separately from the card definition.
 */
export interface RiftboundCardMeta {
  /** Damage counters on the card */
  damage: number;

  /** Whether the card has a buff counter */
  buffed: boolean;

  /** Whether the card is stunned */
  stunned: boolean;

  /** Whether the card is exhausted (tapped) */
  exhausted: boolean;

  /** Combat role during combat (attacker/defender) */
  combatRole: CombatRole;

  /** Whether the card is hidden (facedown) */
  hidden: boolean;

  /** Battlefield ID where the card is hidden (if hidden) */
  hiddenAt?: CardId;

  /** Domain of the card (for runes) */
  domain?: Domain;

  /** Card ID of the unit this equipment is attached to (equipment only) */
  attachedTo?: CardId;

  /** Card IDs of equipment attached to this unit (unit only) */
  equippedWith?: CardId[];

  /** Keywords temporarily granted to this card (with duration tracking) */
  grantedKeywords?: GrantedKeyword[];

  /** Temporary Might modifier from effects (added to base Might; reset per duration) */
  mightModifier?: number;

  /** Might bonus from static/passive abilities (recalculated each pass) */
  staticMightBonus?: number;

  /** Cost modifier from effects (negative = reduction, positive = increase) */
  costModifier?: number;

  /** Active restrictions on this card */
  restrictions?: string[];

  /**
   * Card instance ID whose abilities/text are copied onto this card while
   * this card is attached/bound to it. Used by Svellsongur to copy the unit's
   * text to the equipment for as long as it's attached.
   */
  copiedFromCardId?: CardId;

  /**
   * Card instance IDs that have been exiled/banished "with" this card.
   * Used by The Zero Drive: when the equipment leaves the board, these cards
   * return. Populated by the card's activated effect; cleared when this card
   * leaves the board.
   */
  exiledByThis?: CardId[];
}

/**
 * A keyword temporarily granted to a card by an effect.
 */
export interface GrantedKeyword {
  /** The keyword name (e.g., "Assault", "Tank") */
  keyword: string;
  /** Optional numeric value (e.g., Assault 2) */
  value?: number;
  /** When this keyword expires: "static" = recalculated each pass from passive abilities */
  duration: "turn" | "permanent" | "combat" | "static";
}

/**
 * Default card metadata values
 */
export const DEFAULT_CARD_META: RiftboundCardMeta = {
  buffed: false,
  combatRole: null,
  damage: 0,
  exhausted: false,
  hidden: false,
  stunned: false,
};

/**
 * Rune pool state - tracks available energy and power
 */
export interface RunePool {
  /** Available energy (numeric resource) */
  energy: number;

  /** Available power by domain */
  power: DomainPower;
}

/**
 * Default rune pool values
 */
export const DEFAULT_RUNE_POOL: RunePool = {
  energy: 0,
  power: {},
};

/**
 * Battlefield state - tracks control and contested status
 */
export interface BattlefieldState {
  /** Battlefield card ID */
  id: CardId;

  /** Player who controls this battlefield (null if uncontrolled) */
  controller: PlayerId | null;

  /** Whether the battlefield is contested */
  contested: boolean;

  /** Player who contested the battlefield (if contested) */
  contestedBy?: PlayerId;

  /**
   * Bonus to the number of cards a player may hide at this battlefield.
   *
   * Default hidden-capacity is 1 per player. Battlefields like Bandle Tree
   * increase this. Applied once during setup from battlefield static
   * abilities of type `increase-hidden-capacity`.
   */
  hiddenCapacityBonus?: number;
}

/**
 * Player state
 */
export interface PlayerState {
  /** Player identifier */
  readonly id: PlayerId;

  /** Victory points */
  victoryPoints: number;

  /** Experience points (XP) - introduced by Unleashed (UNL) set */
  xp: number;

  /**
   * Number of main-phase turns this player has taken.
   *
   * Incremented at the start of each of the player's turns. Used by
   * battlefields like Forgotten Monument that gate scoring on a minimum
   * turn count. A player's first turn is `turnsTaken === 1`.
   */
  turnsTaken: number;

  /**
   * Modifier to the victory score needed to win for this player.
   *
   * Effective threshold = `state.victoryScore + victoryScoreModifier`.
   * Used by battlefields like Aspirant's Climb that increase the points
   * needed to win. Defaults to 0.
   */
  victoryScoreModifier?: number;
}

/**
 * Turn state
 */
export interface TurnState {
  /** Current turn number (1-indexed) */
  readonly number: number;

  /** Active player ID */
  readonly activePlayer: PlayerId;

  /** Current phase */
  readonly phase: GamePhase;
}

/**
 * Setup step tracking for the pregame sequence.
 */
export type SetupStep =
  | "rollForFirst"
  | "chooseFirst"
  | "placeLegends"
  | "placeChampions"
  | "selectBattlefields"
  | "shuffleDecks"
  | "drawHands"
  | "mulligan"
  | "ready";

/**
 * Setup state — tracks progress through the pregame sequence.
 */
export interface SetupState {
  readonly step: SetupStep;
  readonly rolls: Record<string, number>;
  readonly rollWinner?: PlayerId;
  readonly firstPlayer?: PlayerId;
  readonly secondPlayer?: PlayerId;
  readonly completedBy: PlayerId[];
  readonly pendingMulligan: PlayerId[];
}

/**
 * A pending player decision that blocks all other moves until resolved.
 *
 * Used for effects like Sabotage/Mindsplitter/Ashe Focused that require
 * an opponent to reveal their hand so the active player can pick a card
 * from it. While a pending choice exists, only `resolvePendingChoice` is
 * a legal move.
 */
export interface PendingChoice {
  /** The kind of choice that is pending. */
  readonly type: "reveal-and-pick";

  /** Player who triggered the choice (picks the card). */
  readonly prompter: PlayerId;

  /** Player whose hand was revealed (the target opponent). */
  readonly revealer: PlayerId;

  /** Snapshot of card IDs that were revealed (usually the revealer's full hand). */
  readonly revealed: CardId[];

  /**
   * Optional filter on which revealed card may be picked.
   * - `excludeCardTypes`: card types that are NOT valid picks (e.g., ["unit"]).
   */
  readonly filter?: {
    readonly excludeCardTypes?: readonly string[];
  };

  /**
   * What to do with the picked card. `"recycle"` sends it to the bottom of
   * its owner's main deck, `"banish"` sends it to banishment, `"discard"`
   * sends it to the owner's trash.
   */
  readonly onPicked: "recycle" | "banish" | "discard";
}

/**
 * Complete Riftbound game state
 *
 * This is the game-specific state that moves operate on.
 * Zone state and card metadata are managed by the core engine.
 */
export interface RiftboundGameState {
  /** Unique game identifier */
  readonly gameId: string;

  /** Player states indexed by player ID */
  readonly players: Record<string, PlayerState>;

  /** Victory score needed to win (8 for 1v1) */
  readonly victoryScore: number;

  /** Battlefield states indexed by battlefield card ID */
  readonly battlefields: Record<string, BattlefieldState>;

  /** Rune pools indexed by player ID */
  readonly runePools: Record<string, RunePool>;

  /** Battlefields conquered this turn (for scoring restrictions) */
  readonly conqueredThisTurn: Record<string, CardId[]>;

  /** Battlefields scored this turn (max once per battlefield per turn) */
  readonly scoredThisTurn: Record<string, CardId[]>;

  /** XP gained this turn per player (reset at end of turn) */
  readonly xpGainedThisTurn: Record<string, number>;

  /** Turn state */
  readonly turn: TurnState;

  /** Game status */
  readonly status: GameStatus;

  /** Winner player ID (if game is finished) */
  readonly winner?: PlayerId;

  /** Setup state (only present during setup phase) */
  readonly setup?: SetupState;

  /** Chain & showdown interaction state */
  readonly interaction?: import("../chain/chain-state").TurnInteractionState;

  /** Whether the second player gets an extra rune on first channel (rule 644.7) */
  readonly secondPlayerExtraRune?: boolean;

  /** Turn number of each player's first turn (for first-turn-process rules) */
  readonly firstTurnNumber?: Record<string, number>;

  /** Additional costs paid for the current card being played */
  readonly additionalCostsPaid?: Record<string, boolean>;

  /**
   * Number of units each player has moved this turn.
   *
   * Used by move-escalation effects (e.g., Mageseeker Investigator) that
   * charge an opponent extra power for each unit moved beyond the first
   * during a single turn. Reset at the start of each turn.
   */
  readonly unitsMovedThisTurn?: Record<string, number>;

  /** Events that occurred this turn, for condition checking */
  readonly turnEvents?: Record<string, string[]>;

  /**
   * Keys of `"next"`-duration replacements that have already fired this turn.
   *
   * Replacement abilities with `duration: "next"` (e.g., Tactical Retreat,
   * Highlander) fire once for the next matching game action and are then
   * consumed. The engine marks them as consumed by inserting
   * `${sourceCardId}|${abilityIndex}` into this set; subsequent calls to
   * `checkReplacement` skip any ability whose key is present.
   *
   * The set is cleared at end of turn along with other turn-scoped state.
   */
  readonly consumedNextReplacements?: Record<string, true>;

  /**
   * A pending player decision that blocks all other moves until resolved.
   *
   * When set, only the `resolvePendingChoice` move is legal. Produced by
   * effects such as `reveal-hand` (Sabotage, Mindsplitter, Ashe Focused)
   * that require the active player to pick a card from the revealed hand
   * before play can continue.
   */
  pendingChoice?: PendingChoice;
}

/**
 * Type alias for backward compatibility
 * @deprecated Use RiftboundGameState instead
 */
export type RiftboundState = RiftboundGameState;

/**
 * Create initial player state
 */
export function createPlayerState(playerId: PlayerId): PlayerState {
  return {
    id: playerId,
    turnsTaken: 0,
    victoryPoints: 0,
    victoryScoreModifier: 0,
    xp: 0,
  };
}

/**
 * Create initial battlefield state
 */
export function createBattlefieldState(battlefieldId: CardId): BattlefieldState {
  return {
    contested: false,
    controller: null,
    id: battlefieldId,
  };
}

/**
 * Create initial rune pool
 */
export function createRunePool(): RunePool {
  return { ...DEFAULT_RUNE_POOL };
}
