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

  /**
   * rule 428.5.c: who dealt the most recent spell/ability damage to this
   * unit (and whether the source was a spell), so a lethal-damage cleanup
   * kill can be attributed; rule 428.5.c.2: "combat" = killed by combat
   * damage, attributed to the opposing combatant's controller. Cleared when
   * the unit dies.
   */
  lastDamagedBy?: PlayerId;
  lastDamageSource?: "spell" | "ability" | "combat";

  /** Whether the card has a buff counter */
  buffed: boolean;

  /**
   * rule 702.3 (ogn-078-298): buffs beyond the first, only for a unit whose
   * ability lifts the one-buff cap ("I can have any number of buffs"). Each is
   * +1 Might (rule 703); `buffed` stays the first buff.
   */
  extraBuffs?: number;

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

  /** Turn number on which the card was hidden (rule 723.1.b — reveal only on a later turn) */
  hiddenOnTurn?: number;

  /** Domain of the card (for runes) */
  domain?: Domain;

  /** Card ID of the unit this equipment is attached to (equipment only) */
  attachedTo?: CardId;

  /** Card IDs of equipment attached to this unit (unit only) */
  equippedWith?: CardId[];

  /** Keywords temporarily granted to this card (with duration tracking) */
  grantedKeywords?: GrantedKeyword[];

  /**
   * rule-id: ven-142-166 — activated abilities granted to this card by another
   * card's effect ("give it '[rainbow][rainbow]: Ready me' this turn"). Each
   * entry points at `registry.getAbilities(sourceCardId)[abilityIndex]`; the
   * host pays the cost and is `self` for the effect (Svellsongur convention).
   */
  grantedAbilities?: GrantedAbility[];

  /** Temporary Might modifier from effects (added to base Might; reset per duration) */
  mightModifier?: number;

  /**
   * rule-id: sfd-110-221 (rule 466.7.c) — the portion of `mightModifier` that
   * was applied "this combat" and must be reverted at Combat Cleanup.
   */
  combatMightModifier?: number;

  /** Rule 827: whether this permanent is Empowered (gates `[Empowered]>` abilities) */
  empowered?: boolean;

  /** Might bonus from static/passive abilities (recalculated each pass) */
  staticMightBonus?: number;

  /** Cost modifier from effects (negative = reduction, positive = increase) */
  costModifier?: number;

  /** Active restrictions on this card */
  restrictions?: string[];

  /**
   * Card name chosen by this card's controller via a "name a card" effect
   * (rule 762). Linked abilities read this to enforce "cards with that
   * name" restrictions (e.g. Fallen Feline).
   */
  namedCard?: string;

  /**
   * Rule 355.8 (unl-182-219): mode indexes already picked from a "choose one
   * you haven't already chosen" effect on this card. Read by the `choice`
   * executor to hide already-taken options on subsequent Repeat casts.
   */
  modesChosenThisTurn?: number[];

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

  /**
   * rule-id: sfd-109-221 (Akshan) — layered control-changing effects on this
   * permanent, oldest first. The latest entry whose source is still on the
   * board (or that has no source, i.e. permanent) wins; with none left the
   * card reverts to its owner. Re-evaluated by state-based cleanup.
   */
  controlEffects?: { controllerId: string; sourceCardId?: CardId }[];

  /**
   * Optional free-form label attached to the card by a sandbox/meta action.
   *
   * Purely cosmetic — surfaced in the UI so players can mark a card with a
   * short note (e.g., "Turn 3", "scry target") during sandbox play. Not
   * read by rules logic.
   */
  label?: string;

  /**
   * Toughness modifier from sandbox meta actions (e.g., Apply Buff +1/+1).
   *
   * Riftbound does not have a toughness stat in the rules — combat damage
   * is threshold-compared against Might. We track this field so the UI can
   * render a +N/+M style buff badge, but the engine doesn't consume it.
   */
  toughnessModifier?: number;
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
 * rule-id: ven-142-166 — an activated ability granted to a card by an effect.
 * Resolved via `registry.getAbilities(sourceCardId)[abilityIndex]`.
 */
export interface GrantedAbility {
  sourceCardId: CardId;
  abilityIndex: number;
  duration: "turn" | "permanent";
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
   * Set when the mandatory Combat Showdown at this battlefield has completed
   * (all Relevant Players passed). Rule 625.1 / 516.4.f: the Showdown is a
   * required sub-phase of Combat — `resolveFullCombat` may not run until it
   * has. Cleared whenever `contested` becomes true.
   */
  showdownComplete?: boolean;

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
export interface RevealAndPickChoice {
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
   * sends it to the owner's trash, `"draw"` puts it in the prompter's hand.
   * rule-id: ogn-062-298-look-banish-play — `"play"` banishes the pick and
   * adds it to the chain as a play, charging its cost less
   * `playEnergyReduction`.
   */
  readonly onPicked: "recycle" | "banish" | "discard" | "draw" | "play";

  /** Energy discount applied when `onPicked === "play"`. */
  readonly playEnergyReduction?: number;

  /**
   * rule 356.1.b.1 (ogn-025-298 Blind Fury): "play it, ignoring its cost" —
   * the play charges nothing at all, energy and power alike.
   */
  readonly playIgnoreCost?: boolean;

  /**
   * rule 356.1.b.1 (ogn-115-298 Promising Future): "playing it, ignoring its
   * Energy cost" — Power pips are still paid in full.
   */
  readonly playIgnoreEnergy?: boolean;

  /**
   * rule 355.8 (ogn-008-298 Get Excited!): play-time targets chosen for the
   * originating effect, handed to `then` so the follow-up acts on the card the
   * caster chose rather than re-scanning the board.
   */
  readonly thenBoundTargets?: readonly CardId[];

  /**
   * Rule 729 (ogn-235-298): "You may recycle it" — when set the prompter
   * may decline the pick entirely, leaving the revealed card(s) in place.
   */
  readonly optional?: boolean;

  /**
   * What to do with the revealed cards that were NOT picked. Used by
   * look/Vision effects (Rule 435) that put one card in hand and recycle
   * the rest. Omit to leave the unpicked cards where they are.
   */
  readonly onRest?: "recycle";

  /** Card that produced the effect (used as the follow-up effect's source). */
  readonly sourceCardId?: CardId;

  /**
   * Follow-up effect to run once the pick has been applied. Carries the
   * originating effect's `then` clause so sequenced effects like
   * `discard 1, then draw 1` resume after the player has chosen.
   */
  readonly then?: unknown;

  /**
   * rule 422.1.a (ogn-030-298 "discard 2"): picks still owed. When >1 the
   * prompt re-parks after each pick (revealed minus the pick) and `then`
   * only runs after the last one; `resolvePendingChoice.pickedCardIds` may
   * answer several at once. Omitted = exactly one pick.
   */
  readonly remaining?: number;
  /** Picks already taken for this prompt (batchIndex for "one or more" triggers). */
  readonly taken?: number;
}

/**
 * Rule 762: the controller must name a legal card. The chosen name is
 * recorded on `sourceCardId`'s `namedCard` meta so linked abilities can
 * read it (e.g. Fallen Feline).
 */
export interface NameCardChoice {
  readonly type: "name-card";
  /** Player who names the card. */
  readonly prompter: PlayerId;
  /** Card whose meta receives the chosen name. */
  readonly sourceCardId: CardId;
  /** Card type the named card must have. */
  readonly cardType: "spell" | "unit" | "gear";
  /** Legal card names of `cardType` known to the current game's registry. */
  readonly options: readonly string[];
}

/**
 * Rule 355.10: when a triggered/resolved ability says "give a unit X" and
 * more than one legal target exists, the ability's controller chooses which
 * one. The chosen card ID is passed back via `resolvePendingChoice` and the
 * stored `effect` is then executed with that card bound as its target.
 */
export interface ChooseTargetChoice {
  readonly type: "choose-target";
  /** Player who chooses the target (the ability's controller). */
  readonly playerId: PlayerId;
  /** Card that produced the effect (used as the effect's source). */
  readonly sourceCardId: CardId;
  /** The effect to execute once a target is chosen. */
  readonly effect: unknown;
  /** Legal target card IDs the player may choose from. */
  readonly options: readonly CardId[];
  /** Number of targets still to choose (currently always 1). */
  readonly remaining: number;
  /**
   * Rule 355.14.h (unl-192-219): when set, the pick is a target to DROP —
   * the stored effect is re-executed with this list minus the picked id as
   * its bound targets, preserving the reference unit at index 0.
   */
  readonly boundTargets?: readonly CardId[];
  /**
   * Rule 355.14.e/f/g (unl-192-219): when true the pick is a resolution-time
   * split-damage ASSIGNMENT — the picked id is APPENDED to `boundTargets`
   * (one extra occurrence = one extra point of damage) rather than removed.
   */
  readonly assign?: true;
  /**
   * rule 355.14.c/e/f (ogn-041-298): with `assign`, a fixed damage TOTAL the
   * chooser splits over `options` in one `allocation` answer (any number of
   * targets ≤ total, each ≥1, summing to total; zero targets is legal).
   */
  readonly total?: number;
  /**
   * rule-id: ogn-256-298 (rule 355.13) — "any number of <units>": picks
   * accumulate in `picked` until the chooser declines (`accept:false`) or no
   * legal option remains; `options` is re-pruned after each pick against the
   * effect target's aggregate constraints (one battlefield, `totalMight`).
   */
  readonly anyNumber?: true;
  readonly picked?: readonly CardId[];
  /** rule 355.13 (ogn-073-298): "up to N" — stop prompting once N are picked. */
  readonly maxPicks?: number;
  /**
   * rule 372: this prompt orders two replacement effects that both apply to
   * the death of this card. The pick names the replacement's SOURCE card and
   * is recorded on `replacementOrderChoices`; no effect is executed here.
   */
  readonly replacementOrderFor?: CardId;
}

/**
 * Rule 355.4: a `move` effect with no stated destination lets the unit's
 * controller choose base or any battlefield. The chosen zone ID is passed
 * back via `resolvePendingChoice` and the stored `cardId` is moved there.
 */
export interface ChooseDestinationChoice {
  readonly type: "choose-destination";
  /** Player who chooses the destination (the ability's controller). */
  readonly playerId: PlayerId;
  /** Unit to move once a destination is chosen. */
  readonly cardId: CardId;
  /** Legal destination zone IDs (base + battlefields, excluding current). */
  readonly options: readonly string[];
  /**
   * rule-id: ogs-015-024 (rule 439.2.b.1) — a just-created token choosing
   * where it enters the board. Placement is not a move, so no `move` event
   * fires; `queue` holds further created tokens to prompt for in turn.
   */
  readonly created?: true;
  readonly queue?: readonly CardId[];
}

/**
 * Rule 355.8 (unl-182-219): a modal ("Choose one —") spell/ability lets its
 * controller pick which option resolves. `options` are the option indexes the
 * controller may still pick; when `notChosenThisTurn` is set the reducer
 * records the picked index on `sourceCardId`'s meta so Repeat casts of the
 * same effect exclude it.
 */
export interface ChooseModeChoice {
  readonly type: "choose-mode";
  /** Player who chooses the mode (the ability's controller unless `controllerId` is set). */
  readonly playerId: PlayerId;
  /**
   * rule-id: ogn-071-298 (rule 355.10.e) — when another player picks the mode,
   * the picked effect still resolves for the spell's controller ("you").
   */
  readonly controllerId?: PlayerId;
  /** Card that produced the effect (used as the effect's source). */
  readonly sourceCardId: CardId;
  /** The full choice effect (carries `options[]` so the reducer can execute the pick). */
  readonly effect: unknown;
  /** Legal option indexes the player may choose from. */
  readonly options: readonly number[];
  /** When true, the picked index is recorded on `sourceCardId`'s `modesChosenThisTurn`. */
  readonly notChosenThisTurn?: boolean;
  /** rule-id: sfd-091-221 — targets bound at chain placement, re-threaded into the picked mode. */
  readonly boundTargets?: readonly string[];
}

/**
 * Rule 583 (unl-021-219): a "you may …" triggered ability has resolved off the
 * chain and its controller must accept or decline before the effect runs.
 */
export interface OptInChoice {
  readonly type: "opt-in";
  /** Player who accepts or declines (the ability's controller). */
  readonly playerId: PlayerId;
  /** Card that produced the trigger. */
  readonly sourceCardId: CardId;
  /** The resolved chain item to execute if the player accepts. */
  readonly resolved: unknown;
  /**
   * rule 372 (ogn-023-298): an optional "you may pay … instead" death
   * replacement is awaiting its controller's answer for this unit; state-based
   * checks leave its lethal damage in place until the prompt resolves
   * (accept → the replacement heals/recalls it; decline → it dies).
   */
  readonly suspendedDeathCardId?: CardId;
}

/**
 * rule-id: ven-041-166-weaponmaster-on-play-equip
 * Weaponmaster — "When you play me, you may Equip one of your Equipment to
 * me for [rainbow] less, even if it's already attached." Surfaced as a
 * pendingChoice by playUnit; the controller picks an equipment or declines.
 */
export interface WeaponmasterEquipChoice {
  readonly type: "weaponmaster-equip";
  /** Controller of the just-played Weaponmaster unit. */
  readonly playerId: PlayerId;
  /** The Weaponmaster unit to attach the picked equipment to. */
  readonly unitId: CardId;
  /** Friendly equipment IDs on board (attached or unattached). */
  readonly options: readonly CardId[];
}

export type PendingChoice =
  | RevealAndPickChoice
  | NameCardChoice
  | ChooseTargetChoice
  | ChooseDestinationChoice
  | ChooseModeChoice
  | OptInChoice
  | WeaponmasterEquipChoice;

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

  /**
   * Main-deck cards (unit/spell/gear/equipment) the player has played this
   * turn. Reset to 0 at the start of each turn. Consulted by rule 724
   * (Legion) conditions to determine whether "you have played another card
   * this turn" is satisfied. Optional for backward-compatibility with
   * test harnesses that construct state literally; the engine's setup
   * path always initializes it.
   */
  readonly cardsPlayedThisTurn?: Record<string, number>;

  /**
   * rule 430.3 — runes actually channeled per player by the most recent
   * `channel` effect. Read by the `channeled-fewer-than` condition
   * ("If you couldn't channel 2 runes this way, draw 1").
   */
  readonly lastChanneledCount?: Record<string, number>;

  /** Turn state */
  readonly turn: TurnState;

  /** Game status */
  readonly status: GameStatus;

  /** Winner player ID (if game is finished) */
  readonly winner?: PlayerId;

  /**
   * Players that have been removed from the game (rule 651/652).
   *
   * A removed player has conceded, burned out repeatedly, or otherwise
   * been removed from play. Their permanents are banished, their
   * battlefields redistributed to uncontrolled, and any chain items
   * they controlled are countered. In a 1v1 game the remaining player
   * wins immediately; in 3+ player games the game continues with the
   * removed player excluded from turn rotation and priority cycling.
   */
  readonly removedPlayers?: readonly PlayerId[];

  /**
   * Team membership mapping for team-based modes (rule 648).
   *
   * Maps each player ID to a team ID (0 or 1 for 2v2 Magma Chamber).
   * Only populated when the game mode is team-based. Used by "friendly"
   * target resolution (rule 648.8.d), team-mode conquer disqualification
   * (rule 630.1.a), and gating for teammate-only moves (648.8.a-c).
   *
   * For solo modes (Duel, Match, FFA3, FFA4) this field is either
   * unset or an empty record.
   */
  readonly teams?: Readonly<Record<PlayerId, number>>;

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
   * rule-id: ogn-064-298 / sfd-206-221 — card id the most recent `counter`
   * effect targeted. A countered spell leaves the chain immediately (rule
   * 425.1.a), so "that spell's Energy cost" is read from here afterwards.
   */
  lastCounterTargetId?: string;

  /**
   * rule-id: unl-186-219 — effective Might of the unit most recently killed by
   * a `kill` effect, snapshotted as it left the board so "if it had N [Might]
   * or less" reads last-known information rather than the trash copy.
   */
  lastKilledUnitMight?: number;

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
   * rule-id: ogn-118-298 — per-turn tally of fired game events, keyed by
   * `type`, `type|p:<player>` and `type|c:<card>` (see `turnEventCountKeys`).
   * Backs "The first time … each turn" trigger restrictions. Reset every turn.
   */
  turnEventCounts?: Record<string, number>;

  /**
   * rule-id: ogn-026-298 — players who can't play cards for the rest of this
   * turn ("opponents can't play cards this turn"). Cleared at end of turn.
   */
  cannotPlayCardsThisTurn?: Record<string, true>;

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
   * rule 372: dying card id → source card id of the replacement effect its
   * controller chose to apply when more than one applied to that death.
   * Consumed (and cleared) by the next state-based check for that card.
   */
  readonly replacementOrderChoices?: Record<string, string>;

  /**
   * Replacement effects installed at runtime by an activated/triggered ability
   * (rule 571) rather than declared statically on a card definition. Consumers
   * of `checkReplacement` may consult this alongside board-card abilities.
   */
  activeReplacements?: unknown[];

  /**
   * rule 364.3 (ogn-053-298): spell/ability-created continuous effects that
   * act as static abilities until end of turn. Re-applied on every
   * `recalculateStaticEffects` pass (so units that start matching later are
   * covered) and cleared at Ending Step (rule 517.2.b).
   */
  turnStatics?: { controllerId: PlayerId; sourceCardId: CardId; effect: unknown }[];

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
