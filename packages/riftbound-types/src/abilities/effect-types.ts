/**
 * Riftbound Effect Type Definitions
 *
 * Types for defining effects that abilities can produce.
 * Effects are the "what happens" part of abilities.
 */

import type { AnyTarget, Location, Target } from "../targeting";
import type { Condition } from "./condition-types";
import type { Cost, Domain } from "./cost-types";

// ============================================================================
// Card Manipulation Effects
// ============================================================================

/**
 * Draw cards effect
 */
export interface DrawEffect {
  readonly type: "draw";
  readonly amount: number | AmountExpression;
  readonly player?: "self" | "opponent" | "each";
}

/**
 * Discard cards effect
 */
export interface DiscardEffect {
  readonly type: "discard";
  readonly amount: number | AmountExpression;
  readonly player?: "self" | "opponent" | "each";
  readonly then?: Effect; // Effect after discarding (e.g., "discard 1, then draw 2")
}

/**
 * Recycle cards (put cards on the bottom of their owner's deck).
 *
 * Recycle can source cards from:
 * - `"trash"` (graveyard) — e.g., "Recycle 3 from your trash"
 * - `"hand"` — e.g., "Recycle 2 from your hand"
 * - `"board"` — e.g., "Recycle a rune" (recycle a permanent to deck)
 * - `"self"` — e.g., "Recycle this" / "Recycle me"
 */
export interface RecycleEffect {
  readonly type: "recycle";
  readonly target?: Target;
  readonly amount?: number;
  readonly from?: "trash" | "board" | "hand" | "self";
  /**
   * Whose zone the counted form draws from. `"any"` (ogn-212-298 "recycle up
   * to 4 cards from trashes") pools every player's copy of `from`.
   */
  readonly owner?: "any";
  /**
   * "Recycle **up to** N" — the chooser may pick fewer, including none, so the
   * prompt is declinable.
   */
  readonly upTo?: boolean;
  /**
   * Where in the owner's Main Deck the card lands. Defaults to `"bottom"`.
   * `"owner-choice"` (unl-204-219 Keeper's Verdict) prompts the card's OWNER
   * to pick top or bottom via a `choose-destination` pending choice.
   */
  readonly position?: "bottom" | "owner-choice";
  /**
   * "Each player chooses N …; recycle the rest" (ogn-244-298) — every player
   * keeps up to N of each listed category and recycles the remainder.
   */
  readonly keep?: number;
  /** Categories a `keep` recycle walks, in prompt order. */
  readonly categories?: readonly ("unit" | "gear" | "rune" | "hand")[];
}

/**
 * Return to hand effect
 */
export interface ReturnToHandEffect {
  readonly type: "return-to-hand";
  readonly target: AnyTarget;
}

/**
 * rule 103.2.a.3 / 419.1.a (ogn-281-298 Hallowed Tomb) — return the player's
 * Chosen Champion from their trash to their (empty) Champion Zone. The
 * champion is identified by the Legend's `championTag`; a non-empty Champion
 * Zone makes this a no-op.
 */
export interface ReturnToChampionZoneEffect {
  readonly type: "return-to-champion-zone";
  readonly from?: "trash";
  /** "if it is empty" — defaults to true; the zone gate is always applied. */
  readonly ifZoneEmpty?: boolean;
}

/**
 * Play a card effect
 */
export interface PlayEffect {
  readonly type: "play";
  readonly target: Target;
  readonly from?: "hand" | "trash" | "deck";
  readonly ignoreCost?: boolean | "energy" | "power";
  readonly reduceCost?: Cost;
  readonly toLocation?: Location;
}

/**
 * Banish effect (remove from game)
 */
export interface BanishEffect {
  readonly type: "banish";
  readonly target: AnyTarget;
}

/**
 * Look at cards effect
 */
export interface LookEffect {
  readonly type: "look";
  readonly amount: number;
  readonly from: "deck" | "rune-deck" | "opponent-hand";
  readonly then?: LookThenEffect;
  /** Restricts which looked-at card may be picked (e.g. "a unit from among them"). */
  readonly filter?: {
    readonly excludeCardTypes?: readonly string[];
    /** Card types that ARE valid picks ("reveal a gear from among them"). */
    readonly cardTypes?: readonly string[];
    /**
     * rule 206 (unl-064-219 Fate Weaver) — "a spell with Energy cost [4] or
     * more": the pick's printed Energy cost floor (Power pips are not Energy).
     */
    readonly minEnergyCost?: number;
  };
  /** "You may …" — the pick is declinable. */
  readonly optional?: boolean;
  /**
   * rule-id: ogn-062-298-look-banish-play — what happens to the picked card.
   * `"play"` banishes it then plays it (optionally at `reduceCost` less).
   */
  readonly onPicked?: "recycle" | "banish" | "discard" | "draw" | "play";
  /**
   * rule 416.1 — where the looked-at cards that were NOT picked go.
   * Defaults to `"recycle"` (bottom of the Main Deck); `"trash"` is
   * ven-156-166 Lightning Rush's "Put the rest into your trash".
   */
  readonly onRest?: "recycle" | "draw" | "trash";
  readonly reduceCost?: Cost;
  /**
   * rule-id: ven-089-166-look-then-empower — effect run once the pick has
   * been applied ("Then you may do this: Empower it"). A `trigger-source`
   * target inside it resolves to the picked card.
   */
  readonly followUp?: Effect;
}

/**
 * What to do after looking at cards
 */
export interface LookThenEffect {
  readonly draw?: number | "chosen";
  readonly recycle?: number | "rest";
  readonly play?: boolean;
  readonly reveal?: boolean;
}

/**
 * Reveal cards effect
 */
export interface RevealEffect {
  readonly type: "reveal";
  readonly amount: number;
  readonly from: "deck" | "hand";
  readonly until?: "unit" | "gear" | "spell" | Target;
  readonly then?: Effect;
}

/**
 * Reveal-hand-and-pick effect.
 *
 * Used by cards like Sabotage, Mindsplitter, and Ashe Focused that require
 * an opponent to reveal their hand so the active player can pick a card
 * from it. The engine places a `pendingChoice` on the game state; play is
 * paused until the active player issues a `resolvePendingChoice` move.
 *
 * - `target` identifies the revealer (usually `{ type: "player",
 *   controller: "enemy" }`).
 * - `filter.excludeCardTypes` narrows valid picks (e.g., `["unit"]` for
 *   "choose a non-unit card").
 * - `onPicked` controls what happens to the picked card:
 *   - `"recycle"` — bottom of owner's main deck (default).
 *   - `"banish"` — sent to banishment.
 *   - `"discard"` — sent to owner's trash.
 */
export interface RevealHandEffect {
  readonly type: "reveal-hand";
  readonly target: AnyTarget;
  readonly filter?: {
    readonly excludeCardTypes?: readonly string[];
    /** Card types that ARE valid picks ("choose a unit from it"). */
    readonly cardTypes?: readonly string[];
    /**
     * rule 135.2 (ven-085-166) — "choose a Mind card from it": a DOMAIN
     * allow-list. A multi-domain card matches when any of its domains is here.
     */
    readonly domains?: readonly string[];
  };
  readonly onPicked?: "recycle" | "banish" | "discard" | "play";
  /**
   * rule 419.3 (unl-139-219 Bone Skewer): "Choose a battlefield. … They play
   * that unit to that battlefield" — the effect's controller picks the
   * destination battlefield before the hand is revealed.
   */
  readonly battlefield?: "choose";
  /** rule 356.1.b.1 — the forced play ignores any and all costs. */
  readonly playIgnoreCost?: boolean;
  /** rule 423 — the played card arrives stunned. */
  readonly playStun?: boolean;
  /** "You MAY choose a card from it" — the pick is declinable (rule 729). */
  readonly optional?: boolean;
}

/**
 * Name-a-card effect (rule 762 / 383.2.b).
 *
 * The controller names a card of the given `cardType`. The engine places a
 * `pendingChoice` on the game state; play is paused until the controller
 * issues a `resolvePendingChoice` move with `pickedName`. The chosen name is
 * recorded on the source card's `namedCard` meta so linked abilities (e.g.
 * Fallen Feline's "opponents can't play spells with that name") can read it.
 */
export interface NameCardEffect {
  readonly type: "name-card";
  /** rule 762: "name a tag" names a tag instead of a card name. */
  readonly cardType: "spell" | "unit" | "gear" | "tag";
}

// ============================================================================
// Combat Effects
// ============================================================================

/**
 * Deal damage effect
 */
export interface DamageEffect {
  readonly type: "damage";
  readonly amount: number | AmountExpression;
  readonly target: AnyTarget;
  readonly split?: boolean; // Can split among multiple targets
  /**
   * rule-id: unl-072-219 (Crescent Strike) — "Deal N to that unit and M to
   * each other enemy unit there": after damaging the chosen target, deal this
   * amount to every OTHER enemy unit sharing the target's battlefield.
   */
  readonly splashOthers?: number;
}

/**
 * Heal effect (remove damage)
 */
export interface HealEffect {
  readonly type: "heal";
  readonly amount: number | AmountExpression | "all";
  readonly target: AnyTarget;
}

/**
 * Kill effect (destroy)
 */
export interface KillEffect {
  readonly type: "kill";
  readonly target?: AnyTarget;
  readonly player?: "self" | "opponent" | "each";
  /**
   * rule 355.16 — "starting with the next player, each other player chooses …":
   * the caster chooses nothing; each opponent picks in turn order from the pool
   * `target` describes relative to the CASTER, and no card may be picked twice.
   */
  readonly chooser?: "each-other-player";
  /**
   * The pool those other players pick from, described relative to the CASTER.
   * Separate from `target` because nothing is chosen when the spell is played.
   */
  readonly chooserTarget?: AnyTarget;
}

/**
 * Stun effect (doesn't deal combat damage this turn)
 */
export interface StunEffect {
  readonly type: "stun";
  readonly target: AnyTarget;
}

/**
 * Fight effect (two units deal damage to each other)
 */
export interface FightEffect {
  readonly type: "fight";
  readonly attacker: AnyTarget;
  readonly defender: AnyTarget;
  /**
   * rule-id: ven-083-166 — optional effect applied to the chosen attacker
   * (bound as its sole target) before damage is exchanged, e.g. Rampage's
   * conditional "+2 Might this turn if you paid the additional cost".
   */
  readonly onAttacker?: Effect;
}

// ============================================================================
// Stat Modification Effects
// ============================================================================

/**
 * Modify Might effect
 */
export interface ModifyMightEffect {
  readonly type: "modify-might";
  readonly amount: number | AmountExpression;
  readonly target: AnyTarget;
  readonly duration?: "turn" | "permanent" | "combat";
  readonly minimum?: number; // Minimum Might (usually 1)
}

/**
 * Buff effect (give a +1 Might buff marker)
 */
export interface BuffEffect {
  readonly type: "buff";
  readonly target: AnyTarget;
}

/**
 * Spend buff effect
 */
export interface SpendBuffEffect {
  readonly type: "spend-buff";
  readonly target?: AnyTarget;
  readonly then?: Effect;
}

/**
 * Double Might effect
 */
export interface DoubleMightEffect {
  readonly type: "double-might";
  readonly target: AnyTarget;
  readonly duration?: "turn" | "permanent" | "combat";
}

/**
 * Swap Might effect
 */
export interface SwapMightEffect {
  readonly type: "swap-might";
  readonly target1: AnyTarget;
  readonly target2: AnyTarget;
  readonly duration?: "turn" | "permanent";
}

/**
 * rule 477.3.b (ogn-108-298): "increase its Might to the Might of another
 * unit" — a one-way snapshot: target1 is raised to target2's current Might and
 * never lowered; target2 is untouched.
 */
export interface IncreaseMightToEffect {
  readonly type: "increase-might-to";
  readonly target1: AnyTarget;
  readonly target2: AnyTarget;
  readonly duration?: "turn" | "permanent";
}

/**
 * rule 323.5 / 142.4.b (ven-116-166 Dragon Form): "Its base Might becomes N" —
 * a SET of the base value, not a modifier. Buffs, "+N this turn" modifiers and
 * static bonuses still layer on top of the new base, and lethal damage is
 * re-evaluated against it.
 */
export interface SetBaseMightEffect {
  readonly type: "set-base-might";
  readonly amount: number;
  readonly target?: AnyTarget;
  readonly duration?: "turn" | "permanent";
}

/**
 * rule 364.3 (ogn-053-298 Stand United): a spell/ability-created continuous
 * effect that behaves like a static ability for the rest of the turn — it is
 * re-evaluated on every static pass, so it also reaches units that start
 * matching later ("Buffs give an additional +1 [Might] to friendly units this turn").
 */
export interface TurnStaticEffect {
  readonly type: "turn-static";
  readonly effect: ModifyMightEffect | GrantKeywordEffect | GrantKeywordsEffect;
}

/**
 * rule 419.1 (ven-132-166 Fallen Feline): a static that forbids PLAYING cards
 * — putting them on the chain. Items already on the chain are unaffected.
 */
export interface RestrictPlayEffect {
  readonly type: "restrict-play";
  /** Whose plays are forbidden, relative to the source's controller. */
  readonly who: "opponents" | "all";
  /** Restricted card type; omit or "card" for every type. */
  readonly cardType?: "spell" | "unit" | "gear" | "rune" | "card";
  /** Only cards whose name matches the source's recorded `namedCard` meta. */
  readonly matchesNamedCard?: boolean;
}

// ============================================================================
// Movement Effects
// ============================================================================

/**
 * Move effect
 */
export interface MoveEffect {
  readonly type: "move";
  readonly target: AnyTarget;
  /**
   * Destination. `"choose"` when the rules text names no destination
   * (rule 355.4 — the unit's controller chooses base or a battlefield).
   */
  /**
   * rule-id: ogn-262-298 — `"target-battlefield"`: "move a friendly unit to
   * THAT enemy unit's battlefield" — the destination is the battlefield of an
   * earlier sequence step's chosen target, not a free choice.
   */
  readonly to: Location | "choose" | "target-battlefield";
  readonly from?: Location;
  /**
   * rule-id: ogn-199-298 — "Move me to its location and it to my original
   * location": the source and the chosen `partner` trade locations.
   */
  readonly swap?: boolean;
  readonly partner?: AnyTarget;
  /**
   * rule-id: sfd-050-221 (rule 716) — after a swap, "if it's equipped, you may
   * attach one of its Equipment to me".
   */
  readonly mayAttachPartnerEquipment?: boolean;
  /**
   * rule-id: ogn-262-298 (rule 355.13) — "You may move …": the instruction
   * imposes no play-legality gate and does nothing without a legal unit.
   */
  readonly optional?: boolean;
  /**
   * rule 387 (ogn-258-298, unl-101-219) — a follow-up anchored at the
   * destination: it runs only once the move's landing zone is known, with the
   * moved unit bound and that zone threaded as "same".
   */
  readonly then?: Effect;
  /**
   * rule-id: unl-101-219 (rule 355.10) — "choose an opponent. They move a unit
   * they control to the same battlefield": the OPPONENT, not the caster, picks
   * which of their units answers.
   */
  readonly chosenBy?: "opponent";
}

/**
 * Recall effect (move to base, not a move)
 */
export interface RecallEffect {
  readonly type: "recall";
  readonly target: AnyTarget;
  readonly exhausted?: boolean;
}

// ============================================================================
// Resource Effects
// ============================================================================

/**
 * Add resource effect
 */
export interface AddResourceEffect {
  readonly type: "add-resource";
  readonly energy?: number;
  readonly power?: Domain[];
  /**
   * rule 429.1 — how many times the listed `power` pips are added. Defaults to
   * 1; "[Add] that much [rainbow]" passes a `{ variable: "x" }` expression.
   */
  readonly amount?: number | { readonly variable: string };
  /**
   * rule 190.6.a — whose Rune Pools receive the resources. Absent, the
   * ability's controller does ("[Add] [1]"). Text that names other players
   * ("the attacker and defender each [Add] [1]") lists those roles here; they
   * are resolved against the showdown running as the effect resolves.
   */
  readonly players?: readonly ("controller" | "attacker" | "defender" | "opponent")[];
}

/**
 * Channel runes effect
 */
export interface ChannelEffect {
  readonly type: "channel";
  readonly amount: number;
  readonly exhausted?: boolean;
  readonly player?: "self" | "opponent" | "each";
}

/**
 * Ready effect (un-exhaust)
 */
export interface ReadyEffect {
  readonly type: "ready";
  readonly target: AnyTarget;
  /**
   * rule 435 (sfd-221-221 Veiled Temple) — "ready a friendly gear. If it's an
   * Equipment, you may detach it." Only this step knows which gear was chosen,
   * so the conditional follow-up rides on the ready effect: it is offered as a
   * yes/no once the chosen gear turns out to be an attached Equipment.
   */
  readonly mayDetachEquipment?: DetachEffect;
}

/**
 * Exhaust effect
 */
export interface ExhaustEffect {
  readonly type: "exhaust";
  readonly target: AnyTarget;
}

// ============================================================================
// Token Effects
// ============================================================================

/**
 * Token definition
 */
export interface TokenDefinition {
  readonly name: string;
  readonly type: "unit" | "gear";
  readonly might?: number;
  readonly keywords?: string[];
  // rule 187.1: a named unit token carries its name as a tag (a Recruit token
  // has the Recruit tag). Override here when the printed token differs.
  readonly tags?: string[];
}

/**
 * Create token effect
 */
export interface CreateTokenEffect {
  readonly type: "create-token";
  readonly token: TokenDefinition;
  // rule 359.3.f.3 — "there" on a move trigger is the ORIGIN of the move,
  // snapshotted when it happened (`"origin"`), not where the source is now.
  readonly location?: "base" | "here" | "battlefield" | "origin" | Location;
  readonly ready?: boolean;
  readonly amount?: number;
}

/**
 * Common token presets
 */
export const TOKEN_PRESETS = {
  GOLD: { name: "Gold", type: "gear" } as const,
  MECH: { might: 3, name: "Mech", type: "unit" } as const,
  RECRUIT: { might: 1, name: "Recruit", type: "unit" } as const,
  SAND_SOLDIER: { might: 2, name: "Sand Soldier", type: "unit" } as const,
  SPRITE: {
    keywords: ["Temporary"],
    might: 3,
    name: "Sprite",
    type: "unit",
  } as const,
} as const;

// ============================================================================
// Keyword Effects
// ============================================================================

/**
 * Grant keyword effect
 */
export interface GrantKeywordEffect {
  readonly type: "grant-keyword";
  readonly keyword: string;
  readonly value?: number;
  readonly target: AnyTarget;
  readonly duration?: "turn" | "permanent";
  /**
   * rule-id: unl-146-219 — cost attached to a cost-bearing granted keyword
   * (e.g. "your spells have [Repeat] [2][chaos]", rule 820).
   */
  readonly cost?: Cost;
  /**
   * rule 809 (ogn-063-298) — "… have [Keyword] if they didn't already": the
   * grant is skipped entirely for a card that already has the keyword, so
   * nothing stacks on top of the printed one.
   */
  readonly ifMissing?: boolean;
}

/**
 * Grant an activated ability (rule 135.4.b — granted text is real text).
 *
 * The text lives on the GRANTING card at `abilityIndex`; each target gains it
 * as its own (the target pays the cost and is `self` for the effect).
 * `duration: "static"` is a continuous grant, recomputed on every static
 * recalculation (unl-213-219 "Units here have …").
 */
export interface GrantAbilityEffect {
  readonly type: "grant-ability";
  readonly abilityIndex: number;
  readonly target: AnyTarget;
  readonly duration?: "turn" | "permanent" | "static";
}

/**
 * Grant multiple keywords effect
 */
export interface GrantKeywordsEffect {
  readonly type: "grant-keywords";
  readonly keywords: string[];
  readonly target: AnyTarget;
  readonly duration?: "turn" | "permanent";
}

// ============================================================================
// Control Flow Effects
// ============================================================================

/**
 * Pending value reference — how a later step in a `SequenceEffect` can refer
 * to "the thing the earlier step produced" (e.g., "banish a card, then play it"
 * needs `play` to target the card banished one step earlier).
 *
 * The engine evaluates steps left-to-right and, when a step's effect produces
 * a concrete card id (banish, reveal, choose, etc.), stores it under the
 * optional `name` for later steps to reference via `{ type: "pending-value" }`
 * targets.
 */
export interface PendingValueBinding {
  /** Optional label for the pending value (defaults to "chosen") */
  readonly name?: string;
  /** Index of the step in `effects` that produces the value */
  readonly source: number;
}

/**
 * Sequence effect - execute effects in order.
 *
 * When the sequence contains `pendingValue` bindings, the engine stores the
 * card id produced by step `source` and makes it available to subsequent
 * steps via a `{ type: "pending-value", name?: "chosen" }` target.
 *
 * @example "Banish a card, then play it."
 * {
 *   type: "sequence",
 *   effects: [
 *     { type: "banish", target: { type: "card", from: "revealed" } },
 *     { type: "play", target: { type: "pending-value" }, ignoreCost: true }
 *   ],
 *   pendingValue: { source: 0 }
 * }
 */
export interface SequenceEffect {
  readonly type: "sequence";
  readonly effects: Effect[];
  readonly pendingValue?: PendingValueBinding;
}

/**
 * Choice option
 */
export interface ChoiceOption {
  readonly label?: string;
  readonly effect: Effect;
  readonly condition?: Condition;
}

/**
 * Choice effect - player chooses one option
 */
export interface ChoiceEffect {
  readonly type: "choice";
  readonly options: ChoiceOption[];
  readonly notChosenThisTurn?: boolean; // "Choose one you've not chosen this turn"
  /**
   * Who picks the mode (rule 355.10.e: "each other player chooses"). Default: the controller.
   * `target-controller` — the controller of the chosen target decides
   * ("Deal 6 to it unless its controller has you draw 2", rule 355.10.e).
   */
  readonly player?: "self" | "opponent" | "target-controller";
  /** Caster-chosen target locked at play time and shared by every mode. */
  readonly target?: Target;
}

/**
 * Conditional effect - apply effect if condition is met
 */
export interface ConditionalEffect {
  readonly type: "conditional";
  readonly condition: Condition;
  readonly then: Effect;
  readonly else?: Effect;
}

/**
 * Optional effect - player may choose to apply
 */
export interface OptionalEffect {
  readonly type: "optional";
  readonly effect: Effect;
}

/**
 * For each effect - repeat for each matching target
 */
export interface ForEachEffect {
  readonly type: "for-each";
  readonly target: Target;
  readonly effect: Effect;
}

/**
 * Repeat effect (for [Repeat] keyword)
 */
export interface RepeatEffect {
  readonly type: "repeat";
  readonly cost: Cost;
  readonly effect: Effect;
  readonly differentChoices?: boolean;
}

/**
 * Do X times effect
 */
export interface DoTimesEffect {
  readonly type: "do-times";
  readonly times: number;
  readonly effect: Effect;
}

/**
 * rule 387 / 388 — Reflexive Trigger: "[Then] [you may] do this[ N times]: …".
 * When the instruction it follows resolves, `effect` is not executed inline:
 * a separate triggered Chain Item carrying it is created (N of them for
 * "N times", 387.1.a) — finalized like any trigger, and opponents receive
 * Priority before it resolves.
 */
export interface ReflexiveEffect {
  readonly type: "reflexive";
  readonly effect: Effect;
  /** 387.1.a — "do this N times" (default 1). */
  readonly times?: number;
  /** "you MAY do this" — the item's controller opts in when it is finalized (402.1). */
  readonly optional?: boolean;
}

// ============================================================================
// Special Effects
// ============================================================================

/**
 * Score points effect
 */
export interface ScoreEffect {
  readonly type: "score";
  readonly amount: number;
  readonly player?: "self" | "opponent";
}

/**
 * Counter spell effect
 */
export interface CounterEffect {
  readonly type: "counter";
  readonly target?: "spell" | Target;
  readonly unless?: Cost; // Counter unless they pay
  /** rule-id: unl-131-219 — where the countered spell goes instead of trash */
  readonly destination?: "hand";
}

/**
 * Take control effect
 */
export interface TakeControlEffect {
  readonly type: "take-control";
  readonly target: AnyTarget;
  readonly duration?: "turn" | "permanent" | "until-leaves";
}

/**
 * rule 317.1 / 455 (sfd-202-221) — "Lose control of that unit and recall it at
 * end of turn": marks the control change installed by an earlier `take-control`
 * step so the Ending Step expires it.
 */
export interface DelayedLoseControlEffect {
  readonly type: "delayed-lose-control";
  readonly target?: AnyTarget;
  /** Also recall the permanent to its controller's base when control reverts. */
  readonly recall?: boolean;
}

/**
 * Prevent damage effect
 */
export interface PreventDamageEffect {
  readonly type: "prevent-damage";
  readonly target?: AnyTarget;
  readonly amount?: number | "all";
  readonly duration?: "turn" | "next";
  /**
   * rule 437.5.b — "prevent the next damage that would be dealt to it": the
   * shield's Prevent Value is All for exactly one damage instance, so no
   * amount is ever lethal to the unit while it is armed.
   */
  readonly instance?: boolean;
}

/**
 * Attach equipment effect
 */
export interface AttachEffect {
  readonly type: "attach";
  readonly equipment: AnyTarget;
  readonly to: AnyTarget;
}

/**
 * Attach-or-detach effect (rules 434 / 435).
 *
 * "Choose a unit and an Equipment with the same controller. Attach that
 * Equipment to that unit or detach that Equipment from that unit." The chosen
 * pair selects the half that applies.
 */
export interface AttachOrDetachEffect {
  readonly type: "attach-or-detach";
  readonly equipment: AnyTarget;
  readonly to: AnyTarget;
}

/**
 * Detach equipment effect
 */
export interface DetachEffect {
  readonly type: "detach";
  readonly equipment: AnyTarget;
}

/**
 * Gain control of spell effect
 */
export interface GainControlOfSpellEffect {
  readonly type: "gain-control-of-spell";
  readonly newChoices?: boolean;
}

/**
 * Take extra turn effect
 */
export interface ExtraTurnEffect {
  readonly type: "extra-turn";
}

/**
 * Win the game effect
 */
export interface WinGameEffect {
  readonly type: "win-game";
}

/**
 * Increase the effective victory score threshold.
 *
 * Applied at game setup from battlefield static abilities. Bumps every
 * player's `victoryScoreModifier` by `amount`, so the effective number of
 * points needed to win is `state.victoryScore + amount`. Used by
 * Aspirant's Climb ("Increase the points needed to win the game by 1.").
 *
 * @example "Increase the points needed to win the game by 1."
 * { type: "increase-victory-score", amount: 1 }
 */
export interface IncreaseVictoryScoreEffect {
  readonly type: "increase-victory-score";
  readonly amount: number;
}

/**
 * Increase the hidden-card capacity of the source battlefield.
 *
 * Applied at game setup from battlefield static abilities. Bumps the
 * source battlefield's `hiddenCapacityBonus` by `amount`, so each player
 * may hide `1 + bonus` cards at that battlefield. Used by Bandle Tree
 * ("You may hide an additional card here.").
 *
 * @example "You may hide an additional card here."
 * { type: "increase-hidden-capacity", amount: 1 }
 */
export interface IncreaseHiddenCapacityEffect {
  readonly type: "increase-hidden-capacity";
  readonly amount: number;
}

/**
 * Prevent scoring at the source battlefield.
 *
 * Checked at scoring time against the card's `condition`. If the condition
 * evaluates `false` for a given player (i.e. the gating is not yet
 * cleared), that player cannot score at this battlefield. Used by
 * Forgotten Monument ("Players can't score here until their third turn.")
 * in combination with a `turn-count-at-least` condition.
 *
 * @example "Players can't score here until their third turn."
 * { type: "prevent-score" }
 */
export interface PreventScoreEffect {
  readonly type: "prevent-score";
}

/**
 * Lift the one-buff-per-unit cap on the source unit.
 *
 * rule 702.3 / 426.1.b.2: a unit can normally hold at most one buff; a
 * static ability may allow more. Read by the buff effect handler, which
 * tracks the extra buffs beyond the first (each +1 Might, rule 703).
 *
 * @example "I can have any number of buffs."
 * { type: "unlimited-buffs" }
 */
export interface UnlimitedBuffsEffect {
  readonly type: "unlimited-buffs";
}

/**
 * Lower the lethal-damage value of the described units for damage dealt by
 * this card's controller.
 *
 * rule 142.4.b/142.4.c: lethal damage is normally non-zero damage at least
 * equal to a unit's Might; a static ability may set a smaller value. With
 * `value: 1` any amount of the controller's damage kills the units matched by
 * `target` (Elder Dragon, unl-118-219 — the rules' own example).
 *
 * @example "Any amount of your damage is enough to kill enemy units."
 * { type: "lethal-damage-modifier", value: 1, target: { type: "unit", controller: "enemy" } }
 */
export interface LethalDamageModifierEffect {
  readonly type: "lethal-damage-modifier";
  /** Lethal-damage value applied instead of the unit's Might. */
  readonly value: number;
  /** Which units this applies to (relative to the source's controller). */
  readonly target?: Target;
}

// ============================================================================
// XP / Progression Effects (Unleashed set)
// ============================================================================

/**
 * Gain experience points (XP).
 *
 * Introduced in the Unleashed (UNL) set. XP is a per-player counter that
 * persists across turns and unlocks `[Level N][>]` abilities once a threshold
 * is reached. Often granted by `[Hunt]` triggers or "Gain N XP" effects.
 *
 * @example "Gain 2 XP."
 * { type: "gain-xp", amount: 2 }
 */
export interface GainXpEffect {
  readonly type: "gain-xp";
  readonly amount: number | AmountExpression;
}

/**
 * Spend experience points (XP) — used as an activated-ability cost or
 * additional cost. Fails silently if the player lacks the required XP.
 *
 * @example "Spend 3 XP, [Exhaust]: Draw 1."
 * { type: "spend-xp", amount: 3 }
 */
export interface SpendXpEffect {
  readonly type: "spend-xp";
  readonly amount: number;
}

/**
 * Predict effect (UNL keyword-as-effect).
 *
 * Look at the top `amount` cards of the player's main deck. The player
 * may recycle any of them (put on the bottom of the deck) and put the
 * rest back on top in any order.
 *
 * `[Predict]` with no value defaults to `amount: 1`.
 *
 * @example "[Predict 2]."
 * { type: "predict", amount: 2 }
 */
export interface PredictEffect {
  readonly type: "predict";
  readonly amount: number;
}

// ============================================================================
// Amount Expressions
// ============================================================================

/**
 * Dynamic amount based on game state
 */
export type AmountExpression =
  | { readonly count: Target; readonly multiplier?: number } // Count of matching targets, optionally times N
  | { readonly might: AnyTarget } // Might of a target
  // rule 807.2/807.3 — summed value of a keyword ("my [Assault]"), printed + granted
  | { readonly keywordValue: string; readonly of: "self" }
  | { readonly damage: AnyTarget } // Damage on a target
  | { readonly cost: AnyTarget } // Cost of a target
  | { readonly score: "self" | "opponent" } // Player's score
  | { readonly cardsInHand: "self" | "opponent" } // Cards in hand
  // Cards in trash; `named` narrows to one card name ("self" = the source card's
  // own name, rule 715.1 ven-010-166), `base` is a flat amount added to the tally
  | {
      readonly cardsInTrash: "self" | "opponent";
      readonly named?: string;
      readonly base?: number;
    }
  | { readonly runeCount: "self" | "opponent" } // Runes channeled
  // rule-id: ogn-121-298 — reveal top N of your Main Deck, count those with
  // `withKeyword`, then recycle all revealed cards.
  | { readonly revealTop: number; readonly withKeyword: string; readonly then?: "recycle" }
  // rule-id: unl-046-219 — number of the listed tags carried by at least one
  // unit matching `among` (distinct tags, not units).
  | { readonly distinctTags: readonly string[]; readonly among: Target }
  | { readonly variable: string }; // Named variable from context

// ============================================================================
// Union Type
// ============================================================================

/**
 * All effect types
 */
export type Effect =
  // Card manipulation
  | DrawEffect
  | DiscardEffect
  | RecycleEffect
  | ReturnToHandEffect
  | ReturnToChampionZoneEffect
  | PlayEffect
  | BanishEffect
  | LookEffect
  | RevealEffect
  | RevealHandEffect
  | NameCardEffect

  // Combat
  | DamageEffect
  | HealEffect
  | KillEffect
  | StunEffect
  | FightEffect

  // Stat modification
  | ModifyMightEffect
  | BuffEffect
  | SpendBuffEffect
  | DoubleMightEffect
  | SwapMightEffect
  | IncreaseMightToEffect
  | SetBaseMightEffect
  | TurnStaticEffect

  // Movement
  | MoveEffect
  | RecallEffect

  // Resources
  | AddResourceEffect
  | ChannelEffect
  | ReadyEffect
  | ExhaustEffect

  // Tokens
  | CreateTokenEffect

  // Keywords
  | GrantKeywordEffect
  | GrantKeywordsEffect
  | GrantAbilityEffect

  // Control flow
  | SequenceEffect
  | ChoiceEffect
  | ConditionalEffect
  | OptionalEffect
  | ForEachEffect
  | RepeatEffect
  | DoTimesEffect
  | ReflexiveEffect

  // Special
  | ScoreEffect
  | CounterEffect
  | TakeControlEffect
  | DelayedLoseControlEffect
  | PreventDamageEffect
  | AttachEffect
  | AttachOrDetachEffect
  | DetachEffect
  | GainControlOfSpellEffect
  | ExtraTurnEffect
  | WinGameEffect
  | IncreaseVictoryScoreEffect
  | IncreaseHiddenCapacityEffect
  | PreventScoreEffect
  | UnlimitedBuffsEffect
  | LethalDamageModifierEffect

  // XP / progression (UNL set)
  | GainXpEffect
  | SpendXpEffect
  | PredictEffect;

/**
 * Static effects (subset for static abilities)
 */
export type StaticEffect =
  | ModifyMightEffect
  | GrantKeywordEffect
  | GrantKeywordsEffect
  | GrantAbilityEffect
  | IncreaseVictoryScoreEffect
  | IncreaseHiddenCapacityEffect
  | PreventScoreEffect
  | RestrictPlayEffect
  | UnlimitedBuffsEffect
  | LethalDamageModifierEffect;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if effect is a control flow effect
 */
export function isControlFlowEffect(
  effect: Effect,
): effect is
  | SequenceEffect
  | ChoiceEffect
  | ConditionalEffect
  | OptionalEffect
  | ForEachEffect
  | RepeatEffect
  | DoTimesEffect
  | ReflexiveEffect {
  return (
    effect.type === "sequence" ||
    effect.type === "choice" ||
    effect.type === "conditional" ||
    effect.type === "optional" ||
    effect.type === "for-each" ||
    effect.type === "repeat" ||
    effect.type === "do-times" ||
    effect.type === "reflexive"
  );
}

/**
 * Check if effect modifies stats
 */
export function isStatModifyingEffect(
  effect: Effect,
): effect is
  | ModifyMightEffect
  | BuffEffect
  | DoubleMightEffect
  | SwapMightEffect
  | IncreaseMightToEffect {
  return (
    effect.type === "modify-might" ||
    effect.type === "buff" ||
    effect.type === "double-might" ||
    effect.type === "swap-might" ||
    effect.type === "increase-might-to"
  );
}

/**
 * Check if effect is combat-related
 */
export function isCombatEffect(
  effect: Effect,
): effect is DamageEffect | HealEffect | KillEffect | StunEffect | FightEffect {
  return (
    effect.type === "damage" ||
    effect.type === "heal" ||
    effect.type === "kill" ||
    effect.type === "stun" ||
    effect.type === "fight"
  );
}

/**
 * Check if amount is an expression
 */
export function isAmountExpression(amount: number | AmountExpression): amount is AmountExpression {
  return typeof amount === "object";
}

// ============================================================================
// Builder Functions
// ============================================================================

/**
 * Create a draw effect
 */
export function draw(
  amount: number | AmountExpression,
  player?: "self" | "opponent" | "each",
): DrawEffect {
  return player ? { amount, player, type: "draw" } : { amount, type: "draw" };
}

/**
 * Create a damage effect
 */
export function damage(amount: number | AmountExpression, target: AnyTarget): DamageEffect {
  return { amount, target, type: "damage" };
}

/**
 * Create a kill effect
 */
export function kill(target: AnyTarget, player?: "self" | "opponent" | "each"): KillEffect {
  return player ? { player, target, type: "kill" } : { target, type: "kill" };
}

/**
 * Create a buff effect
 */
export function buff(target: AnyTarget): BuffEffect {
  return { target, type: "buff" };
}

/**
 * Create a modify might effect
 */
export function modifyMight(
  amount: number | AmountExpression,
  target: AnyTarget,
  duration?: "turn" | "permanent" | "combat",
): ModifyMightEffect {
  return duration
    ? { amount, duration, target, type: "modify-might" }
    : { amount, target, type: "modify-might" };
}

/**
 * Create a move effect
 */
export function move(target: AnyTarget, to: Location): MoveEffect {
  return { target, to, type: "move" };
}

/**
 * Create a ready effect
 */
export function ready(target: AnyTarget): ReadyEffect {
  return { target, type: "ready" };
}

/**
 * Create a channel effect
 */
export function channel(amount: number, exhausted?: boolean): ChannelEffect {
  return exhausted ? { amount, exhausted, type: "channel" } : { amount, type: "channel" };
}

/**
 * Create a create token effect
 */
export function createToken(
  token: TokenDefinition,
  location?: "base" | "here" | "battlefield" | Location,
  options?: { ready?: boolean; amount?: number },
): CreateTokenEffect {
  return {
    location,
    token,
    type: "create-token",
    ...options,
  };
}

/**
 * Create a sequence of effects
 */
export function sequence(...effects: Effect[]): SequenceEffect {
  return { effects, type: "sequence" };
}

/**
 * Create a choice effect
 */
export function choice(...options: ChoiceOption[]): ChoiceEffect {
  return { options, type: "choice" };
}

/**
 * Create an optional effect
 */
export function optional(effect: Effect): OptionalEffect {
  return { effect, type: "optional" };
}

/**
 * Create a conditional effect
 */
export function conditional(
  condition: Condition,
  then: Effect,
  elseEffect?: Effect,
): ConditionalEffect {
  return elseEffect
    ? { condition, else: elseEffect, then, type: "conditional" }
    : { condition, then, type: "conditional" };
}
