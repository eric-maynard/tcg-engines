/**
 * Riftbound Cost Type Definitions
 *
 * Types for defining costs that must be paid to play cards or activate abilities.
 * Riftbound uses two resource types: Energy (numeric) and Power (domain-based).
 */

import type { Target } from "../targeting";

// ============================================================================
// Domain Types
// ============================================================================

/**
 * The six domains in Riftbound, plus rainbow (universal)
 */
export type Domain =
  | "fury" // Red - aggressive, damage
  | "calm" // Green - growth, healing
  | "mind" // Blue - control, draw
  | "body" // Orange - strength, defense
  | "chaos" // Purple - unpredictable, discard
  | "order" // Yellow - structure, tokens
  | "rainbow"; // Universal - can pay any domain

// ============================================================================
// Cost Structure
// ============================================================================

/**
 * Complete cost structure for cards and abilities
 *
 * @example Energy only: { energy: 3 }
 * @example Energy + Power: { energy: 2, power: ["fury", "mind"] }
 * @example Exhaust: { exhaust: true }
 * @example Complex: { energy: 1, exhaust: true, discard: 1 }
 */
export interface Cost {
  /** Energy cost (numeric) */
  readonly energy?: number;

  /** Power cost (domain-based) - array allows multiple domains */
  readonly power?: Domain[];

  /** Requires exhausting the source */
  readonly exhaust?: boolean;

  /** Requires killing a target */
  readonly kill?: Target | "self";

  /** Requires discarding cards */
  readonly discard?: number;

  /** Requires recycling cards from trash */
  readonly recycle?: number | RecycleCost;

  /** Requires spending a buff */
  readonly spend?: "buff" | SpendCost;

  /** Requires returning something to hand */
  readonly returnToHand?: Target;

  /**
   * Requires spending experience points (XP).
   *
   * Used by UNL-set activated abilities like "Spend 2 XP, [Exhaust]: ..." and
   * by additional play costs like "You may spend 5 XP as an additional cost
   * to play this." When combined with `optional: true` on an additional cost,
   * the player chooses whether to pay.
   */
  readonly xp?: number;

  /**
   * Variable-amount "X" cost. When present, the player chooses a
   * non-negative integer X at the moment of play, and the engine deducts
   * that many of the specified resource from the rune pool. The bound
   * X value is then exposed to the effect executor via
   * `EffectContext.variables.x` so that effects can reference it via
   * `{ variable: "x" }` amount expressions.
   *
   * @example "Pay any amount of rainbow to deal that much damage..."
   * { x: { resource: "rainbow-energy" } }
   */
  readonly x?: XCost;
}

/**
 * Variable-X cost specification.
 *
 * `resource` identifies what kind of resource is being paid per point of X.
 * `"power"` / `"rainbow-energy"` — each X point consumes 1 Power of any Domain
 * (rule 135.2.e.5.a: a [rainbow] cost is paid with any Domain's Power).
 * `"energy"` — each X point consumes 1 Energy from the rune pool.
 */
export interface XCost {
  readonly resource: "energy" | "power" | "rainbow-energy";
}

/**
 * Recycle cost with optional target specification.
 *
 * `from` identifies where the recycled card(s) come from:
 * - `"trash"`   — default for "Recycle N from your trash" costs
 * - `"hand"`    — "Recycle N from your hand"
 * - `"board"`   — "Recycle this" on self-recycling permanents (basic runes)
 */
export interface RecycleCost {
  readonly amount: number;
  readonly from?: "trash" | "board" | "hand";
  readonly target?: Target;
}

/**
 * Spend cost for buffs or other resources
 */
export interface SpendCost {
  readonly type: "buff" | "rune";
  readonly amount?: number;
  readonly target?: Target;
}

// ============================================================================
// Additional Cost Types
// ============================================================================

/**
 * rule 356 — one component of a card's Total Cost: resources (Energy, Power
 * pips — `"rainbow"` = Power of any Domain, rule 135.2.e.5 — XP) and/or
 * non-standard object payments (rule 357.2: kill / discard / exhaust / recycle
 * / spend a buff / return to hand / banish), each naming what may pay it.
 */
export interface CostComponent {
  readonly energy?: number;
  readonly power?: readonly (Domain | string)[];
  readonly xp?: number;
  /** [Exhaust] on the source itself (activated abilities). */
  readonly exhaustSelf?: true;
  /** Exhaust another permanent matching the descriptor (`{type:"legend"}` = your legend). */
  readonly exhaust?: Target | { readonly type: string };
  readonly kill?: Target | "self" | { readonly anyNumber: true; readonly target?: Target };
  /** N cards from hand, or a descriptor of what may be discarded. */
  readonly discard?: number | Target;
  readonly recycle?: { readonly from: "trash" | "board" | "hand"; readonly target?: Target; readonly amount: number } | "self";
  readonly spendBuff?: Target | { readonly anyNumber: true };
  readonly returnToHand?: Target | { readonly type?: string; readonly controller?: string };
  readonly banish?: Target | "self";
}

/**
 * rule 356.2 — an additional cost of playing a card (or finalizing a trigger):
 * MANDATORY (356.2.a: "as an additional cost, kill …", Deflect) or optional
 * (356.2.b: "you may … as an additional cost"; Accelerate; each Repeat tier).
 * `id` is stable per card so "if you paid THIS cost" is answerable
 * (`additionalCostsPaid[cardId]` lists paid ids).
 *
 * @example Accelerate: { id: "accelerate", mandatory: false, cost: { energy: 1, power: ["fury"] }, effect: "enter-ready" }
 */
export interface AdditionalCost {
  readonly id: string;
  readonly mandatory: boolean;
  readonly cost: CostComponent;
  /** "for each X paid this way, reduce my cost by …" (kill-any-number / spend-any-buffs). */
  readonly perUnit?: { readonly reduces: CostComponent };
  /** "If you do, …" rider: an effect, `"enter-ready"`, `"ignore-cost"`, or a cost-reduction. */
  readonly ifPaid?: unknown;
  /** rule 364.3.a — the OFFER may itself be gated ("if you've played a spell this turn, you may pay …"). */
  readonly condition?: unknown;
  /** rule 809 — Deflect: the component is owed once per chosen opposing target. */
  readonly perTarget?: boolean;
  /** @deprecated legacy shape — use `mandatory`. */
  readonly optional?: boolean;
  /** @deprecated legacy shape — use `ifPaid`. */
  readonly effect?: string;
}

/** rule 356.1.a — "play me for [Cost]" replaces the Base Cost (Flow, alt cost, Hidden-for-0, self trash play). */
export interface PlayCostAlternative {
  readonly id: string;
  readonly cost: CostComponent;
  /** Zones the card must be played from for this alternative (e.g. `["trash"]` for Flow). */
  readonly from?: readonly string[];
  readonly condition?: unknown;
}

/**
 * rule 356 — everything that determines a card's Total Cost, derived once
 * from its abilities/keywords plus board statics: printed base, alternatives,
 * additional costs (mandatory + optional, several independent ones per card),
 * Repeat tiers and an X component.
 */
export interface PlayCostModel {
  readonly base: CostComponent;
  readonly alternatives: readonly PlayCostAlternative[];
  readonly additional: readonly AdditionalCost[];
  /** rule 820 — nth extra resolution pays `repeat[min(n, len-1)]`. */
  readonly repeat?: readonly CostComponent[];
  readonly x?: { readonly resource: "energy" | "power" };
}

/**
 * The cost choices a player makes in step 2 of a play (rule 355.1): which
 * alternative cost, and which optional additional costs are paid — each with
 * the objects chosen to pay it (rule 357.2) and/or a count / elected shape.
 */
export interface PlayCostSelection {
  readonly alternativeId?: string;
  readonly paid?: Readonly<
    Record<
      string,
      | true
      | {
          readonly objects?: readonly string[];
          readonly count?: number;
          /** rule 356.4.c.1 — the discounted shape the payer elects for a flexible "[1] or [A] less". */
          readonly spec?: { readonly energy?: number; readonly power?: readonly string[]; readonly xp?: number };
        }
    >
  >;
}

/**
 * Cost modifier - reduces or increases costs
 */
export interface CostModifier {
  readonly type: "reduce" | "increase";
  readonly energy?: number;
  readonly power?: number;
  readonly minimum?: Cost;
  readonly condition?: string;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if cost has energy component
 */
export function hasEnergyCost(cost: Cost): boolean {
  return cost.energy !== undefined && cost.energy > 0;
}

/**
 * Check if cost has power component
 */
export function hasPowerCost(cost: Cost): boolean {
  return cost.power !== undefined && cost.power.length > 0;
}

/**
 * Check if cost requires exhausting
 */
export function requiresExhaust(cost: Cost): boolean {
  return cost.exhaust === true;
}

/**
 * Check if cost is empty (no cost)
 */
export function isFreeCost(cost: Cost): boolean {
  return (
    !(hasEnergyCost(cost) || hasPowerCost(cost) || requiresExhaust(cost)) &&
    cost.kill === undefined &&
    cost.discard === undefined &&
    cost.recycle === undefined &&
    cost.spend === undefined &&
    cost.returnToHand === undefined &&
    cost.xp === undefined
  );
}

/**
 * Get total power cost count
 */
export function getPowerCostCount(cost: Cost): number {
  return cost.power?.length ?? 0;
}
