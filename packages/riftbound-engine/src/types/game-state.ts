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
   * rule 477.1.b.1: for a token that "becomes a copy" of a card, the copied
   * card's instance id. The token keeps its shared `token-def-<slug>`
   * definitionId (literal 0-Might token stats), so readers that resolve a card
   * through its definition — the app snapshot's name/art — must follow this to
   * the copied card's definition instead.
   */
  copyOfCardId?: string;

  /**
   * rule 428.5.c: who dealt the most recent spell/ability damage to this
   * unit (and whether the source was a spell), so a lethal-damage cleanup
   * kill can be attributed; rule 428.5.c.2: "combat" = killed by combat
   * damage, attributed to the opposing combatant's controller. Cleared when
   * the unit dies.
   */
  lastDamagedBy?: PlayerId;
  lastDamageSource?: "spell" | "ability" | "combat";

  /**
   * rule 520 — whether damage has been DEALT to this unit at any point in the
   * current turn. Marked damage is healed by combat cleanup (rule 466.1.a.1)
   * and at the Ending Step, so "has been dealt damage this turn" gates cannot
   * read `damage`; this flag survives the heals and is cleared with them at
   * end of turn.
   */
  dealtDamageThisTurn?: boolean;

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
   * rule-id: ven-113-166 (rule 829.1.b / 206) — [Flow] granted to this card by
   * an effect ("give a spell in your trash [Flow] equal to its cost this
   * turn"). Read alongside the printed Flow keyword when a play from the trash
   * is offered and priced; turn-scoped grants expire at end of turn (517.2.b).
   */
  grantedFlow?: { energy: number; power: string[]; duration: "turn" | "permanent" };

  /**
   * rule-id: ven-142-166 — activated abilities granted to this card by another
   * card's effect ("give it '[rainbow][rainbow]: Ready me' this turn"). Each
   * entry points at `registry.getAbilities(sourceCardId)[abilityIndex]`; the
   * host pays the cost and is `self` for the effect (Svellsongur convention).
   */
  grantedAbilities?: GrantedAbility[];

  /**
   * rule-id: unl-095-219 (rule 364.3) — triggered abilities installed on this
   * card by an effect ("When it wins a combat this turn, gain 2 XP"). Read by
   * `getBoardCards`; turn-scoped entries expire at the Ending Step (517.2.b).
   */
  delayedTriggers?: DelayedTrigger[];

  /** Temporary Might modifier from effects (added to base Might; reset per duration) */
  mightModifier?: number;

  /**
   * rule 323.5 (ven-116-166 Dragon Form) — "its base Might becomes N": replaces
   * the PRINTED base every effective-Might reader starts from. Buffs, this-turn
   * modifiers, statics and equipment still layer on top. Turn-scoped entries are
   * cleared at the Ending Step (rule 517.2.b).
   */
  baseMightOverride?: number;

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
   * Tag chosen by this card's controller via a "name a tag" effect
   * (rule 762). Target filters `{ tag: "named" }` resolve through this.
   */
  namedTag?: string;

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
   * rule-id: ven-066-166 — board zone this card was banished from ("base" or
   * "battlefield-<id>"). Read by a "play it to the same location" effect
   * (rule 355.2) so the replay destination is the zone it just left.
   */
  banishedFrom?: string;

  /**
   * rule-id: sfd-109-221 (Akshan) — layered control-changing effects on this
   * permanent, oldest first. The latest entry whose source is still on the
   * board (or that has no source, i.e. permanent) wins; with none left the
   * card reverts to its owner. Re-evaluated by state-based cleanup.
   */
  controlEffects?: {
    controllerId: string;
    sourceCardId?: CardId;
    /** rule 317.1 — expires in the Ending Step of the turn it was created. */
    duration?: "end-of-turn";
    /** rule 455 (sfd-202-221) — on expiry the permanent is also recalled. */
    recallOnExpiry?: boolean;
  }[];

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
  /**
   * rule 364 (unl-213-219) — "static" is a continuous grant from a static
   * ability: stripped and re-applied on every static recalculation, so it
   * lasts exactly as long as the unit matches the granting descriptor.
   */
  duration: "turn" | "permanent" | "static";
}

/**
 * rule-id: unl-095-219 — a triggered ability granted to a card for a duration.
 */
export interface DelayedTrigger {
  sourceCardId: CardId;
  trigger: { event: string; on?: string; afterAttack?: boolean };
  effect: unknown;
  duration: "turn" | "permanent";
  /** rule 355.13 (sfd-184-221) — granted "you may …" triggers prompt on firing. */
  optional?: boolean;
  /**
   * rule 392 — the player who installed the delayed ability controls it, even
   * when it hangs on a card someone else controls ("Deal 3 to an enemy unit.
   * When it dies this turn, play a Gold gear token exhausted.").
   */
  controllerId?: string;
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
   * rule 190.4.a / 323.6 — set once a Cleanup has seen the current controller's
   * own Units here. The vacancy check (lose control of a Battlefield with none
   * of your Units in an Open State) only applies to control a Unit actually
   * held, so control that never rested on a Unit is not wiped by it.
   */
  controllerOccupied?: boolean;

  /**
   * Set when the mandatory Combat Showdown at this battlefield has completed
   * (all Relevant Players passed). Rule 625.1 / 516.4.f: the Showdown is a
   * required sub-phase of Combat — `resolveFullCombat` may not run until it
   * has. Cleared whenever `contested` becomes true.
   */
  showdownComplete?: boolean;

  /**
   * rule 466.2: the Combat Damage Step ran and put items on the chain (death
   * triggers such as Deathknell). Those must resolve BEFORE the combat result
   * is determined, so `resolveFullCombat` returns and re-runs once the chain
   * drains, skipping straight to the Resolution Step.
   */
  combatDamageDone?: boolean;

  /** rule-id: ogn-034-298 — excess damage carried into the deferred conquer event. */
  combatExcessDamage?: number;

  /**
   * rule 323.13 (unl-202-219) — the player whose action staged the Combat here,
   * which is not always the attacker (a spell may drag an ENEMY unit in). The
   * Cleanup begins a staged Combat on that player's own turn.
   */
  stagedBy?: PlayerId;

  /**
   * rule 344.2 — the Showdown / Combat staged here came from a player's own
   * Discretionary Action (Standard / Ganking Move, playing a card there), not
   * from an effect's resolution. The Cleanup that begins it (which may be a
   * later one, after the mover's own triggers resolved — 401.1 / 323.13) does
   * not mark it `autoBegun`. Cleared when the Showdown begins.
   */
  stagedByAction?: boolean;

  /**
   * rule 466.1.a.2: no defending unit was left here when the Combat Cleanup
   * ran, so the surviving attackers were never recalled. Carried across the
   * deferred Resolution Step (466.2) — a unit that a pending trigger puts here
   * afterwards makes the combat a No Result (466.3.d), not a defender win.
   */
  combatNoDefendersAtCleanup?: boolean;
  /** rules 371.2/372/373 — the Combat Cleanup parked a die-replacement prompt; the result step re-reads the board on re-run. */
  combatCleanupSuspended?: boolean;

  /**
   * rule 465.2.c.3 — the attacking player's chosen assignment of its combat
   * damage onto the defenders here, recorded by the `combat-damage` prompt and
   * consumed by the next `resolveFullCombat` pass.
   */
  combatDamageAllocation?: Record<string, number>;

  /**
   * rule 465.2.c.3 — the DEFENDING player's chosen assignment of its combat
   * damage onto the attackers here. Both sides assign simultaneously, so each
   * answer needs its own slot (sharing one re-opens the prompt forever).
   */
  combatDefenderDamageAllocation?: Record<string, number>;

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

  /**
   * rule 117 — players mulligan "in turn order", so this records who has
   * already taken their mulligan; a player may not go before the players
   * ahead of them in turn order have.
   */
  mulliganedBy?: PlayerId[];

  /**
   * Battlefield kept by each player during setup, keyed by player id.
   * rule 485.4.a: each player selects exactly one — "only 1 will be used".
   * rule 485.5: the selections are placed simultaneously, so a choice stays
   * hidden from the other players until everyone has locked one in.
   */
  readonly battlefieldChoices?: Record<string, string>;
}

/** Outcome of one game of a Match (rule 486.5). */
export interface MatchGameResult {
  /** Winner of that game; absent when the game was drawn. */
  readonly winner?: PlayerId;
  /** rule 486.5.a — a drawn game does not count as used. */
  readonly drawn?: boolean;
}

/**
 * Match (best-of-three) record — rule 486.5 / 486.6.
 *
 * A Match is several games played with the same decks. The battlefields that
 * were in play during a DECISIVE game are removed for the rest of the match
 * (486.6), so each player's pool of three shrinks game by game and game 3 is
 * forced onto the battlefield nobody has used yet. A drawn game re-presents the
 * same battlefields instead (486.5.a).
 */
export interface MatchState {
  /** 1-based number of the game currently being played. */
  gameNumber: number;
  /** Battlefield card ids that may no longer be selected this match (486.6). */
  usedBattlefields: string[];
  /** One entry per completed game, in order. */
  results: MatchGameResult[];
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

  /**
   * rule 386.2 (unl-062-219 Predict) — effect to run when the prompter
   * declines the optional pick, instead of simply ending the instruction.
   */
  readonly onDecline?: unknown;

  /**
   * rule 416.1.a / rule-id: sfd-169-221 — "put a card from your hand on the
   * TOP or BOTTOM of your Main Deck": the picked card's owner still chooses
   * which end, so the pick parks a `choose-destination` instead of the
   * default bottom-of-deck recycle.
   */
  readonly position?: "owner-choice";

  /** Player who triggered the choice (picks the card). */
  readonly prompter: PlayerId;

  /** Player whose hand was revealed (the target opponent). */
  readonly revealer: PlayerId;

  /** Snapshot of card IDs that were revealed (usually the revealer's full hand). */
  readonly revealed: CardId[];

  /**
   * Optional filter on which revealed card may be picked.
   * - `excludeCardTypes`: card types that are NOT valid picks (e.g., ["unit"]).
   * - `maxMight`: rule-id ogn-242-298 — "a unit … that has Might up to 1 more
   *   than the killed unit"; picks with printed Might above this are illegal.
   */
  readonly filter?: {
    readonly excludeCardTypes?: readonly string[];
    /** rule-id: unl-139-219 — "choose a unit from it": allowed card types. */
    readonly cardTypes?: readonly string[];
    /**
     * rule 135.2 (ven-085-166 Decree of Strength) — "choose a Mind card from
     * it": the pick filter is a DOMAIN, not a card type. A multi-domain card
     * matches when ANY of its domains is listed.
     */
    readonly domains?: readonly string[];
    readonly maxMight?: number;
    /**
     * rule 206 (unl-064-219 Fate Weaver) — "a spell with Energy cost [4] or
     * more": picks whose printed Energy cost is below this are illegal.
     */
    readonly minEnergyCost?: number;
  };

  /**
   * rule 419.3 / 811.1.c.1 (unl-139-219 Bone Skewer): "They play that unit to
   * that battlefield, ignoring any and all costs" — the pick is played by its
   * OWNER into this fixed zone (so control stays with them), and hiding it
   * instead is never offered.
   */
  readonly playTo?: string;

  /** rule 423 (unl-139-219): the forced play arrives stunned. */
  readonly playStun?: boolean;

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
   * rule 392 (unl-169-219 Ashe, Focused) — "…and banish it. When they hold,
   * return it to their hand (even if I'm no longer on the board)": the banish
   * installs a permanent delayed trigger on the picking player.
   */
  readonly returnOnHold?: boolean;

  /**
   * rule 355.2.b (sfd-170-221 Rek'Sai, Swarm Queen): "If it is a unit, you may
   * play it HERE" — the instructing card's own battlefield becomes a valid
   * location for the play even when the controller does not control it.
   */
  readonly playHere?: string;

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
   * rule 337.1.b / 337.2 (ogn-242-298 Baited Hook): "banish a unit from among
   * them … and play it" — the play is part of THIS instruction, so it
   * finalizes as soon as the ability finishes resolving (the player picks a
   * location and the unit enters the board) instead of waiting on the chain.
   */
  readonly playImmediate?: boolean;

  /**
   * rule 594 (ogn-112-298 Kai'Sa, Evolutionary): "play a spell from your trash
   * … Then recycle it" — the spell goes to the bottom of its owner's Main Deck
   * when it leaves the chain instead of back to the trash.
   */
  readonly playRecycleAfter?: boolean;

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
   * rule-id: sfd-188-221 (Void Rush) — `"draw"` puts them in the prompter's
   * hand instead ("Draw any you didn't banish").
   */
  readonly onRest?: "recycle" | "draw" | "trash";

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
  /**
   * rule 356.1 / rule-id: unl-135-219 — "They reveal their hand. You may pay
   * 2 XP to choose a card from their hand": the REVEAL is free and
   * unconditional, only the pick costs. Charged when the prompter picks;
   * declining costs nothing, and a prompter who cannot pay may only decline.
   */
  readonly pickCost?: {
    readonly energy?: number;
    readonly power?: readonly string[];
    readonly xp?: number;
  };
}

/**
 * rule 386.2 (unl-062-219 Predict): "put the rest back in any order" — the
 * looked-at cards that stayed on top are arranged by their controller. The
 * answer is the desired order, index 0 ending up on top of the Main Deck.
 */
export interface OrderCardsChoice {
  readonly type: "order-cards";
  /** Player who arranges the cards. */
  readonly prompter: PlayerId;
  /** Card whose effect asked for the arrangement. */
  readonly sourceCardId: CardId;
  /** Cards to arrange, in their current order (index 0 = topmost). */
  readonly cards: readonly CardId[];
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
  /** Card type the named card must have; "tag" names a tag instead. */
  readonly cardType: "spell" | "unit" | "gear" | "tag";
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
   * rule 355.5 / 811.1.b (ogn-213-298): a target chosen while the item is being
   * PLAYED, not while it resolves. The pick is written onto the named chain
   * item's `targets` instead of executing the effect immediately.
   */
  readonly bindToChainItemId?: string;
  /**
   * rule 402.2 (sfd-132-221) — a pending trigger naming several caster-chosen
   * Game Objects asks one slot at a time; the pick fills slot N of the item's
   * `targets` (earlier slots are kept) instead of replacing the whole list.
   */
  readonly bindSlotIndex?: number;
  /**
   * rule 355.8 / 820.2 (unl-182-219): the pick is the target of the mode
   * locked in for the Nth `choice` node of that chain item's effect (nodes in
   * execution order), so it is written onto that node, not onto the item.
   */
  readonly choiceNodeIndex?: number;
  /**
   * rule 820.2 (unl-182-219): set when this prompt was parked by a mode that
   * was chosen at play time — it suspends the remaining [Repeat] executions
   * exactly as a resolution-time mode prompt would.
   */
  readonly fromChosenMode?: boolean;
  /**
   * rule 359.3.f.3 (unl-112-219): the destination zone of the move that fired
   * the trigger — "…to THAT battlefield". Carried across the prompt so the
   * effect still knows it when it re-executes with the chosen target.
   */
  readonly triggerToZone?: string;
  /**
   * rule 355.4 (unl-198-219): a zone the parked effect had already chosen
   * ("Choose a battlefield … move a unit to THAT battlefield"), carried
   * across the prompt so "here"/"there" still resolve to it afterwards.
   */
  readonly sourceZone?: string;
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
  /**
   * rule 809.1.c.1: at least one option carries [Deflect] against this chooser,
   * so the surcharge is owed when the pick is made (charged in
   * `pending-choice.ts`, not when the prompt was raised).
   */
  readonly deflectTax?: true;
  /**
   * rule 355.9 (ogn-080-298 Mystic Reversal) — "You may make new choices for
   * it": the pick RE-TARGETS this chain item instead of executing anything.
   */
  readonly retargetChainItemId?: string;
  /**
   * rule 355.13 — the prompt may be declined (`accept:false`), leaving the
   * effect's existing choices untouched. Set for "you MAY make new choices".
   */
  readonly optional?: true;
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
  /**
   * rule-id: ogn-258-298 (rule 387) — "Move an enemy unit. Then do this: …"
   * follow-up whose subject is the moved unit at its (only now known)
   * destination. Executed after the move with the moved unit bound and
   * `sameZone` set to the chosen zone.
   */
  readonly then?: unknown;
  /** Source card of `then` (the spell/ability that moved the unit). */
  readonly sourceCardId?: CardId;
  /**
   * rule-id: ogn-262-298 (rule 355.13) — "You MAY move a friendly unit to that
   * enemy unit's battlefield": the mover may decline (`accept: false`), so the
   * prompt stands even when only one destination is legal.
   */
  readonly optional?: true;
  /**
   * rule 355.4 — a Move Destination chosen while the card is PLAYED / the
   * ability FINALIZED (before anyone gets priority): the answer is recorded on
   * the chain item's move instruction (`destinationNodeIndex`-th caster-chosen
   * move node of the item's effect, see `play/play-time-destinations.ts`)
   * instead of moving anything now.
   */
  readonly bindToChainItemId?: string;
  readonly destinationNodeIndex?: number;
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
  /**
   * rule 820.2 (unl-182-219) — remaining steps of the sequence that parked this
   * prompt (the later [Repeat] executions); run after the picked mode resolves.
   */
  readonly then?: unknown;
  /**
   * rule 820.2 (unl-182-219) — set when the mode is being chosen while the
   * spell is PLAYED: the pick is baked into this chain item's stored effect
   * instead of resolving now.
   */
  readonly bindToChainItemId?: string;
  /** Index of the modal step inside a [Repeat] sequence (undefined = the whole effect). */
  readonly modeSlot?: number;
  /** Modes already locked for earlier executions (rule 355.8 narrows the menu). */
  readonly chosenModes?: readonly number[];
  /**
   * rule 752.1 (ven-152-166 Rebuttal / ogn-080-298) — "you may make new choices
   * for it": the mode menu of a chain item whose control just changed. The
   * pick REPLACES the locked mode (and clears the item's locked targets so the
   * new controller re-chooses them); declining keeps every earlier choice.
   */
  readonly reChoose?: true;
  /**
   * rule 355.13 — the prompt may be declined (`accept:false`), leaving the
   * item's existing choices untouched.
   */
  readonly optional?: true;
}

/**
 * rule 355.13 (ogn-153-298): a plain "you may …" instruction inside a
 * resolving effect. The chooser answers yes/no; `effect` runs only on yes,
 * and `then` (the remainder of a suspended sequence) runs either way.
 */
export interface ConfirmChoice {
  readonly type: "confirm";
  /** Player who accepts or declines (the effect's controller). */
  readonly playerId: PlayerId;
  /** Card that produced the effect. */
  readonly sourceCardId: CardId;
  /** Executed with `boundTargets` when the answer is yes. */
  readonly effect: unknown;
  /** Targets bound to `effect` on accept. */
  readonly boundTargets?: readonly CardId[];
  /** Rest of the suspended sequence; runs after either answer. */
  readonly then?: unknown;
  /** Human-readable prompt text. */
  readonly prompt?: string;
}

/**
 * rule-id: unl-130-219 (rules 182–185, 411.4) — "choose an opponent. THEY play
 * a … token": with two or more opponents the chooser names the seat, and the
 * stored effect then resolves with that seat as the token's owner/controller.
 */
export interface ChoosePlayerChoice {
  readonly type: "choose-player";
  /** Player who names a seat (the effect's controller). */
  readonly playerId: PlayerId;
  /** Seats that may be named. */
  readonly options: readonly PlayerId[];
  /** Executed once a seat is named, with `ownerId` set to that seat. */
  readonly effect: unknown;
  /** Card that produced the effect. */
  readonly sourceCardId?: CardId;
  /** Human-readable prompt text. */
  readonly prompt?: string;
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
   * rule 383.3.a.2 / 402.1.a: set when the prompt is the FINALIZATION question
   * for a "you may" trigger — the id of its chain item. Accepting clears the
   * item's `optional` flag; declining removes it from the chain entirely.
   */
  readonly finalizationChainItemId?: string;
  /**
   * rule 372 (ogn-023-298): an optional "you may pay … instead" death
   * replacement is awaiting its controller's answer for this unit; state-based
   * checks leave its lethal damage in place until the prompt resolves
   * (accept → the replacement heals/recalls it; decline → it dies).
   */
  readonly suspendedDeathCardId?: CardId;
  /**
   * rule 356.1.b.3 / 805.1.a (ogn-226-298 × ogn-010-298) — a unit being played
   * from the trash whose [Accelerate] additional cost its controller may still
   * pay. Accept → the cost is charged and the unit enters ready (rule 805.2.b);
   * decline → it enters exhausted (rule 143.4).
   */
  /**
   * rule 158.1 (sfd-136-221) — "Counter a spell unless its controller pays
   * [N]": the ransom prompt goes to the targeted spell's controller. Accepting
   * charges the cost and the counter does nothing; declining runs `effect`
   * (the same counter with the `unless` clause stripped).
   */
  readonly counterRansom?: {
    readonly effect: unknown;
    readonly sourcePlayerId: PlayerId;
    readonly boundTargets?: readonly string[];
  };
  /**
   * rule 356.1 / rule-id: ven-152-166 (Rebuttal) — "You may pay [rainbow]. If
   * you do, …. Otherwise, …": a cost offered WITHIN a resolving effect. Accept
   * charges `resolved.optInCost` and runs `then`; decline (or an unpayable
   * cost, which never prompts) runs `else`.
   */
  readonly payChoice?: {
    readonly then?: unknown;
    readonly else?: unknown;
    readonly sourcePlayerId: PlayerId;
    readonly boundTargets?: readonly string[];
  };
  /**
   * rule 356.5.a / 356.4.f.1 (unl-139-219 Bone Skewer) — a card being played
   * to a fixed battlefield "ignoring any and all costs" whose optional
   * additional cost its player may still DECLARE. The amount is 0 either way;
   * accepting only records that the cost counts as paid, so "if you paid the
   * additional cost" riders fire. The play finalizes on either answer.
   */
  readonly instructedPlay?: {
    readonly cardId: CardId;
    /** rule 419.1 — the zone the card is played from (it waits in `chain` limbo meanwhile — 354.2). */
    readonly playFrom?: string;
    readonly playTo: string;
    readonly playStun: boolean;
    /** Fallback controller when the card has no recorded owner. */
    readonly revealer: PlayerId;
    /** rule 323.13 — the caster whose effect forces this play (stages the arrival). */
    readonly stagedBy?: PlayerId;
  };
  readonly acceleratePlay?: {
    readonly cardId: CardId;
    readonly cost?: { readonly energy?: number; readonly power?: readonly string[] };
    /**
     * The unit already entered the board (a play finalized via
     * choose-destination): accepting only flips it to ready.
     */
    readonly readyOnly?: boolean;
  };
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

/**
 * rule 465.2.c.3 / 465.2.c.7 — the player dealing combat damage chooses which
 * opposing unit receives lethal damage first whenever more than one legal
 * assignment exists. The prompt is raised by `resolveFullCombat` and answered
 * with one `allocation` covering every point of that side's damage.
 */
export interface CombatDamageChoice {
  readonly type: "combat-damage";
  /** The assigning player. */
  readonly playerId: PlayerId;
  /** Which side of the combat this answer assigns for (465.2.c.3). */
  readonly side?: "attacker" | "defender";
  readonly battlefieldId: string;
  /** Assignable target ids, in Tank → plain → Backline priority order. */
  readonly options: readonly CardId[];
  readonly total: number;
  /** Damage each option still needs to be lethal (465.2.c.4). */
  readonly lethalNeed: Readonly<Record<string, number>>;
  /** 0 = Tank (815.1.b), 1 = plain, 2 = Backline (826.4.b). */
  readonly tier: Readonly<Record<string, number>>;
  /** The forced/greedy assignment — a legal answer, used when settling. */
  readonly defaultAllocation: Readonly<Record<string, number>>;
}

/**
 * What to do once a generic `order` / `pick-many` prompt is answered. Pure
 * data (no closures) so the state stays serializable; dispatched by
 * `resumePending` in `moves/pending-choice.ts`.
 */
export type PendingResume =
  /** rule 372 — the answer orders the die replacements applying to this card's death. */
  | { readonly kind: "die-order"; readonly dyingCardId: CardId }
  /** rule 373 — the answer names the death a single-use replacement is applied to first. */
  | { readonly kind: "die-assign"; readonly replacementId: string }
  /** rule 383.3.d — the answer orders these (already appended) trigger items on the Chain. */
  | { readonly kind: "trigger-batch"; readonly itemIds: readonly string[] }
  /**
   * rule 355.11.b — the answer is the subset of the ORIGINAL targets the
   * effect affects; `effect` re-executes with them bound.
   */
  | {
      readonly kind: "subset-repick";
      readonly effect: unknown;
      readonly playerId: PlayerId;
      readonly sourceCardId: CardId;
    }
  /** No follow-up (tests / producers that read the answer off `lastPendingAnswer`). */
  | { readonly kind: "none"; readonly tag?: string };

/** One entry of an `order` / `pick-many` prompt. */
export interface PendingItem {
  readonly key: string;
  readonly label?: string;
  readonly cardId?: CardId;
}

/**
 * rule 372 / 383.3.d / 416.5.a — "put these in an order of your choosing".
 * Answered with `orderedKeys` (a permutation of `items[].key`; index 0 =
 * first applied / first appended to the Chain). An absent or empty answer
 * keeps the listed order when `defaultable`.
 */
export interface OrderChoice {
  readonly type: "order";
  readonly playerId: PlayerId;
  readonly sourceCardId?: CardId;
  readonly items: readonly PendingItem[];
  readonly prompt?: string;
  readonly defaultable?: boolean;
  readonly resume: PendingResume;
}

/**
 * rule 355.13 / 373 / 355.11.b — choose between `min` and `max` distinct
 * options in one answer (`pickedKeys`). `semantics` tells consumers what the
 * keys mean; `constraint` is re-validated on the answer (355.11.b subsets).
 */
export interface PickManyChoice {
  readonly type: "pick-many";
  readonly playerId: PlayerId;
  readonly sourceCardId?: CardId;
  readonly options: readonly PendingItem[];
  readonly min: number;
  readonly max: number;
  readonly semantics: "target" | "drop" | "replacement-assign" | "subset";
  readonly prompt?: string;
  readonly constraint?: {
    readonly totalMightAtMost?: number;
    // rule 355.11.b — every picked card must share one location.
    readonly sameLocation?: boolean;
  };
  readonly resume: PendingResume;
  /**
   * rule 355.13 (ogn-153-298) — set when this prompt interrupts a resolving
   * sequence: the remaining steps are parked on `then` and run after the
   * answer, whatever was picked.
   */
  readonly suspendsSequence?: boolean;
  readonly then?: unknown;
  readonly thenIsSequenceRest?: boolean;
}

export type PendingChoice =
  | CombatDamageChoice
  | RevealAndPickChoice
  | OrderCardsChoice
  | NameCardChoice
  | ChooseTargetChoice
  | ChooseDestinationChoice
  | ChooseModeChoice
  | ChoosePlayerChoice
  | ConfirmChoice
  | OptInChoice
  | OrderChoice
  | PickManyChoice
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

  /**
   * rule 429.4 (ogs-014-024 Lux, Crownguard): Energy added by an ability that
   * says "Use only to play spells / gear" is earmarked. Per player, how much of
   * the current Energy pool may only pay for that card type; other plays must
   * ignore it. Emptied with the pools at end of turn.
   */
  readonly restrictedEnergy?: Record<string, Partial<Record<string, number>>>;

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
   * rule 356.4 — the card ids behind `cardsPlayedThisTurn`, in play order.
   * A cost modifier scoped to "the first friendly non-token gear played each
   * turn" needs the shape of the earlier plays, not just their count.
   */
  readonly cardsPlayedIdsThisTurn?: Record<string, readonly string[]>;

  /**
   * rule 419.4.a (rule-id: ven-044-166) — a spell's play is tallied when it
   * goes on the chain, but its `play-card` trigger only fires when it RESOLVES.
   * Keyed by card id, this records which card of its controller's turn each
   * pending spell was, so "when you play your first card each turn" reads the
   * ordinal the spell had at play time. Cleared at end of turn.
   */
  readonly spellPlayOrdinals?: Record<string, number>;

  /**
   * rule-id: unl-089-219 — the largest Energy amount this player has spent to
   * play a single spell this turn. Written when a spell's cost is paid
   * (`deductCost`) and reset at the start of each turn; read by alternate
   * play costs ("If you've spent [4] or more to play a spell this turn …").
   */
  readonly spellEnergySpentThisTurn?: Record<string, number>;

  /**
   * rule 135.2 (rule-id: unl-005-219) — Energy actually paid to play each
   * individual spell, keyed by card id. Written when the cost is paid; read by
   * the `spell-energy-spent` trigger condition ("When you play a spell, if you
   * spent [4] or more …"), which measures THAT spell's payment only.
   */
  readonly spellEnergySpentByCard?: Record<string, number>;

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

  /**
   * rule 486.5 / 486.6 — Match (best-of-three) record. Absent in a single
   * game; written by the `startNextGame` move when a game of a match ends.
   */
  match?: MatchState;

  /** Chain & showdown interaction state */
  readonly interaction?: import("../chain/chain-state").TurnInteractionState;

  /** Whether the second player gets an extra rune on first channel (rule 644.7) */
  readonly secondPlayerExtraRune?: boolean;

  /** Turn number of each player's first turn (for first-turn-process rules) */
  readonly firstTurnNumber?: Record<string, number>;

  /**
   * rule 738 — how many Additional Turns have already been taken. Turn Order is
   * unaffected by them, so every player's first turn number (485.7) is shifted
   * by this offset.
   */
  additionalTurnsTaken?: number;

  /**
   * rule 487.7 / 644.7 — the player who channels the extra rune on their first
   * turn: the LAST player in Turn Order (the second player in a duel). When
   * unset every player booked in `firstTurnNumber` gets the bonus.
   */
  extraRunePlayerId?: PlayerId;

  /**
   * rule 487.7 — in multiplayer modes the first player skips their first Draw
   * Phase. Holds that player until the skip is consumed, then clears.
   */
  skipFirstDrawFor?: PlayerId;

  /**
   * rule 357.2 / 371.2 — a unit play whose object cost (a cost-kill met by an
   * OPTIONAL costed die replacement, "you may pay [fury] … instead") raised a
   * prompt mid-payment. Resources and every other cost are already paid; the
   * unit is still in its origin zone. Once the prompt chain settles the play
   * completes (`completeSuspendedPlay`) — a replaced cost still counts as paid
   * (357.2.a). Pure data so state stays serializable.
   */
  suspendedPlay?: {
    readonly kind: "playUnit";
    readonly cardId: string;
    readonly playerId: string;
    readonly location: string;
    readonly paidAccelerate: boolean;
    readonly paidAdditionalCost: boolean;
    readonly paidIds: readonly string[];
    readonly wasFocusAction: boolean;
  };

  /**
   * rule 356.2 — additional costs paid per played card: the list of paid cost
   * ids (see `moves/play/cost-model.ts`), or the legacy boolean. Read through
   * `additionalCostWasPaid(state, cardId, id?)`.
   */
  readonly additionalCostsPaid?: Record<string, boolean | readonly string[]>;

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
   * rule 359.3.f (sfd-162-221) — instance id and CONTROLLER of the unit most
   * recently killed by a `kill` effect, snapshotted as it left the board so
   * "if it was a friendly unit" reads last-known control (control reverts to
   * the owner on the way to the trash).
   */
  lastKilledUnitId?: string;

  /** @see lastKilledUnitId */
  lastKilledUnitController?: string;

  /**
   * rule 422 (unl-080-219 Hwei) — instance ids discarded by the most recent
   * discard instruction, per discarding player. Read by the
   * `discarded-card-type` condition ("based on the discarded card's type").
   */
  lastDiscardedCardIds?: Record<string, string[]>;

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
   * rule-id: sfd-078-221 (rules 206, 820.3) — per player, how many pending
   * "next spell you play this turn has [Repeat] equal to its cost" grants are
   * waiting. Consumed by the next spell they play; cleared at end of turn.
   */
  nextSpellRepeat?: Record<string, number>;

  /**
   * rule-id: unl-190-219 — players who can't play SPELLS for the rest of a
   * turn (Lilting Lullaby's linked "its controller can't play spells this
   * turn"), stamped with the turn number it was imposed on so it lapses by
   * itself once the turn advances.
   */
  cannotPlaySpellsThisTurn?: Record<string, number>;

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
   * rule 127 — information effects ("They reveal their hand. You can look at
   * their facedown cards this turn.", unl-053-219): a viewer may look into
   * another player's private zones. `zones` names zone KINDS (`"hand"`,
   * `"facedown"`). Turn-scoped grants are cleared at end of turn.
   */
  readonly visibilityGrants?: {
    readonly viewer: string;
    readonly owner: string;
    readonly zones: readonly string[];
    readonly duration?: "turn" | "permanent";
  }[];

  /**
   * rule 372: dying card id → source card id of the replacement effect its
   * controller chose to apply when more than one applied to that death.
   * Consumed (and cleared) by the next state-based check for that card.
   */
  readonly replacementOrderChoices?: Record<string, string>;

  /**
   * rules 372 / 373 — decisions taken so far for the batch of simultaneous
   * deaths being processed (`abilities/replacement-effects.ts runDieBatch`).
   * Survives across the prompts it raises; cleared once the batch completes.
   */
  dieBatch?: {
    /** Dying card ids still to process, front first (373: reordered by "apply to which first"). */
    queue: string[];
    /** rule 372 — dying id → replacement ids in the order their controller chose. */
    orders: Record<string, string[]>;
    /** rule 373 — single-use replacement ids whose "which event first" was settled. */
    assigned: string[];
    /** Processed ids whose death was replaced (they never die). */
    replaced: string[];
    /** Processed ids whose death stands (killed together at the end, 373.1.a). */
    dying: string[];
    /** rule 371.2 — dying id → optional replacement ids already offered (still dying ⇒ declined). */
    asked?: Record<string, string[]>;
    /** A Kill instruction / cost / Temporary batch to finish on resume (SBA batches re-detect themselves). */
    kill?: { to: string; cause: unknown; playerId: string; sourceCardId: string };
  };

  /**
   * rule 383.3.d — simultaneous triggered items one player controls, offered
   * to that player for ordering. NOT a `pendingChoice`: every other move stays
   * legal and taking one accepts the listed (scan) order; only
   * `resolvePendingChoice { orderedKeys }` rearranges the items on the Chain.
   */
  pendingTriggerOrder?: OrderChoice;

  /** rule 383.3.d — chain item ids already offered for ordering (pruned to the live Chain). */
  triggerBatchSeen?: string[];

  /**
   * Replacement effects installed at runtime by an activated/triggered ability
   * (rule 571) rather than declared statically on a card definition. Consumers
   * of `checkReplacement` may consult this alongside board-card abilities.
   */
  activeReplacements?: unknown[];

  /**
   * rule 359.3.f.2 (unl-192-219 Alpha Strike) — units a still-resolving
   * spell/ability has dealt LETHAL damage to, keyed by that source card id.
   * A reflexive "for each unit this kills" clause runs after the killed units
   * have already left the board, so the kills are recorded as they happen and
   * consumed by the clause that counts them.
   */
  effectKills?: Record<string, string[]>;

  /**
   * rule 364.3 (ogn-053-298): spell/ability-created continuous effects that
   * act as static abilities until end of turn. Re-applied on every
   * `recalculateStaticEffects` pass (so units that start matching later are
   * covered) and cleared at Ending Step (rule 517.2.b).
   */
  turnStatics?: { controllerId: PlayerId; sourceCardId: CardId; effect: unknown }[];

  /**
   * rule 390.2 (sfd-166-221, Rally the Troops): delayed triggered abilities a
   * spell installed on a PLAYER rather than on a permanent ("When a friendly
   * unit is played this turn, buff it"). Offered to the trigger matcher as a
   * floating ability controlled by `playerId`; turn-scoped entries expire at
   * the Ending Step (rule 517.2.b).
   */
  playerDelayedTriggers?: {
    playerId: string;
    sourceCardId: string;
    trigger: { event: string; on?: string };
    effect: unknown;
    duration: "turn" | "permanent";
  }[];

  /**
   * A pending player decision that blocks all other moves until resolved.
   *
   * When set, only the `resolvePendingChoice` move is legal. Produced by
   * effects such as `reveal-hand` (Sabotage, Mindsplitter, Ashe Focused)
   * that require the active player to pick a card from the revealed hand
   * before play can continue.
   */
  pendingChoice?: PendingChoice;

  /**
   * rule 436 / 359.3.e (unl-136-219 Scryer's Bloom) — "[Predict 2], THEN draw
   * 1": the remainder of a sequence whose step parked a prompt that already
   * owns its own `then` chain. It runs once every prompt of that chain has been
   * answered and nothing else is pending.
   */
  deferredSequenceRest?: {
    effect: unknown;
    playerId: string;
    sourceCardId?: string;
  }[];

  /**
   * rule 359.3.d — a resolving spell card is placed in the trash only AFTER its
   * effect has finished executing top to bottom. When the effect suspends on a
   * prompt the card stays in the chain zone and its settle is parked here,
   * flushed once the whole prompt chain has been answered.
   */
  deferredSpellSettle?: {
    cardId: string;
    controller: string;
    resolveTo?: string;
  };

  /**
   * rule 424.1 — revealing a card presents it to ALL players. A reveal that
   * takes no decision (Diana, Lunari: "reveal the top card of your Main Deck.
   * If it's a spell, draw it") parks no prompt, so this is the only record any
   * layer — log, UI, spectator — can name the revealed card from. Newest last;
   * `recordPublicReveal` keeps only the most recent entries.
   */
  publicReveals?: {
    readonly playerId: string;
    readonly cardIds: readonly string[];
    readonly turn: number;
  }[];

  /**
   * rule-id: ogn-220-298 (rule 355.5 / 811.1.b) — open multi-slot target locks
   * for spells played from [Hidden], keyed by chain item id. A card naming two
   * caster-chosen targets is asked one prompt per slot; this keeps the picks
   * settled so far (the reveal move has no `targets` parameter to carry them).
   */
  revealSlotLocks?: Record<
    string,
    {
      playerId: PlayerId;
      cardId: CardId;
      battlefieldId: string;
      slots: readonly unknown[];
      picked: string[];
    }
  >;
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
