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
}

/**
 * Return to hand effect
 */
export interface ReturnToHandEffect {
  readonly type: "return-to-hand";
  readonly target: AnyTarget;
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
  };
  readonly onPicked?: "recycle" | "banish" | "discard";
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
  readonly target: AnyTarget;
  readonly player?: "self" | "opponent" | "each";
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

// ============================================================================
// Movement Effects
// ============================================================================

/**
 * Move effect
 */
export interface MoveEffect {
  readonly type: "move";
  readonly target: AnyTarget;
  readonly to: Location;
  readonly from?: Location;
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
}

/**
 * Channel runes effect
 */
export interface ChannelEffect {
  readonly type: "channel";
  readonly amount: number;
  readonly exhausted?: boolean;
}

/**
 * Ready effect (un-exhaust)
 */
export interface ReadyEffect {
  readonly type: "ready";
  readonly target: AnyTarget;
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
}

/**
 * Create token effect
 */
export interface CreateTokenEffect {
  readonly type: "create-token";
  readonly token: TokenDefinition;
  readonly location?: "base" | "here" | "battlefield" | Location;
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
 * Prevent damage effect
 */
export interface PreventDamageEffect {
  readonly type: "prevent-damage";
  readonly target?: AnyTarget;
  readonly amount?: number | "all";
  readonly duration?: "turn" | "next";
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
  | { readonly damage: AnyTarget } // Damage on a target
  | { readonly cost: AnyTarget } // Cost of a target
  | { readonly score: "self" | "opponent" } // Player's score
  | { readonly cardsInHand: "self" | "opponent" } // Cards in hand
  | { readonly cardsInTrash: "self" | "opponent" } // Cards in trash
  | { readonly runeCount: "self" | "opponent" } // Runes channeled
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
  | PlayEffect
  | BanishEffect
  | LookEffect
  | RevealEffect
  | RevealHandEffect

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

  // Control flow
  | SequenceEffect
  | ChoiceEffect
  | ConditionalEffect
  | OptionalEffect
  | ForEachEffect
  | RepeatEffect
  | DoTimesEffect

  // Special
  | ScoreEffect
  | CounterEffect
  | TakeControlEffect
  | PreventDamageEffect
  | AttachEffect
  | DetachEffect
  | GainControlOfSpellEffect
  | ExtraTurnEffect
  | WinGameEffect
  | IncreaseVictoryScoreEffect
  | IncreaseHiddenCapacityEffect
  | PreventScoreEffect

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
  | IncreaseVictoryScoreEffect
  | IncreaseHiddenCapacityEffect
  | PreventScoreEffect;

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
  | DoTimesEffect {
  return (
    effect.type === "sequence" ||
    effect.type === "choice" ||
    effect.type === "conditional" ||
    effect.type === "optional" ||
    effect.type === "for-each" ||
    effect.type === "repeat" ||
    effect.type === "do-times"
  );
}

/**
 * Check if effect modifies stats
 */
export function isStatModifyingEffect(
  effect: Effect,
): effect is ModifyMightEffect | BuffEffect | DoubleMightEffect | SwapMightEffect {
  return (
    effect.type === "modify-might" ||
    effect.type === "buff" ||
    effect.type === "double-might" ||
    effect.type === "swap-might"
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
