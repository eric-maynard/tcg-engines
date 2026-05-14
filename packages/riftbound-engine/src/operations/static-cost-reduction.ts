/**
 * Static cost-reduction at deduction-time (rule 466 — cost modification).
 *
 * Some permanents grant a CONTINUOUS cost-reduction to cards the controller
 * plays — e.g. Eager Apprentice's
 *     "While I'm at a battlefield, the Energy costs for spells you play is
 *      reduced by [1], to a minimum of [1]."
 * or Slugger / Noxus Hopeful's static "I cost [N] less" reductions, or
 * Forgotten-Monument-style "your spells cost less while …" auras.
 *
 * These don't run through triggers — they're STATIC abilities that modify
 * cost AT PLAY TIME. The cost-deduction path in `cards.ts#deductCost` /
 * `cards.ts#canAffordCard` must scan the player's permanents for such
 * statics and apply the matching reductions BEFORE checking affordability.
 *
 * The implementation is generic: NO per-card if-statements. Any permanent
 * whose registry abilities contain a `{type:"static", effect:{type:
 * "cost-reduction", target:{...}, by|reduction|amount, minimum?}}` opts in
 * by virtue of being on the board.
 *
 * Minimum clamping: per-rule, each cost-reduction static may carry its own
 * `minimum` floor. When multiple reductions apply, the final effective
 * cost is clamped to `max(printedCost - totalReduction, max(minimums))`.
 * Reductions whose minimum > effective cost contribute nothing further but
 * cannot raise the cost above the printed value.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState } from "../types";
import { getGlobalCardRegistry } from "./card-lookup";
import { evaluateCondition } from "../abilities/static-abilities";

/**
 * Minimal context for the static cost-reduction scan. A subset of what
 * `static-abilities.ts` already uses — we reuse its condition evaluator so
 * gating like `while-at-battlefield` / `while-mighty` / `control-battlefield`
 * Just Works without duplicating logic.
 */
export interface CostReductionContext {
  readonly draft: RiftboundGameState;
  readonly zones: {
    getCardsInZone: (
      zoneId: CoreZoneId,
      playerId?: CorePlayerId,
    ) => readonly CoreCardId[];
  };
  readonly cards: {
    getCardMeta: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined;
    getCardOwner: (cardId: CoreCardId) => string | undefined;
    getCardController?: (cardId: CoreCardId) => string | undefined;
    updateCardMeta: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void;
  };
}

/**
 * Returned shape: the total energy reduction the player's permanents apply
 * to a single play of `playedCardId`, plus the binding floor (max of all
 * matching statics' `minimum` values).
 *
 * Callers apply: `effective = max(printed - reduction, max(minimum, 0))`,
 * BUT must also never go below zero (energy costs can't be negative).
 */
export interface StaticCostReduction {
  readonly reduction: number;
  readonly minimum: number;
}

const PLAYER_BOARD_ZONES: readonly string[] = [
  "base",
  "legendZone",
  "championZone",
];

/**
 * Compute the cumulative static cost-reduction (and floor) the player's
 * permanents apply when `playedCardId` is played.
 *
 * Scans every permanent the controller has on the board (base + legendZone
 * + championZone + every battlefield-* zone), filters for static abilities
 * whose `effect.type === "cost-reduction"` AND whose target shape matches
 * the played card, then sums the reductions and tracks the max minimum.
 *
 * Self-targeted statics (`target:"self"` or `target.controller:"self"`)
 * fire too, but ONLY when the SCANNED PERMANENT is the played card itself
 * — i.e. a static "I cost N less" already self-applies. (In practice these
 * are read directly off the played card's abilities, not via this scan;
 * we keep the path closed by ignoring `self`-shaped reductions emitted by
 * OTHER permanents.)
 */
export function computeStaticCostReduction(
  ctx: CostReductionContext,
  playerId: string,
  playedCardId: string,
): StaticCostReduction {
  const registry = getGlobalCardRegistry();
  const playedDef = registry.get(playedCardId);
  // Without a registered definition we can't match targets — bail to zero.
  if (!playedDef) {
    return { minimum: 0, reduction: 0 };
  }
  const playedCardType = playedDef.cardType;
  const playedKeywords = playedDef.keywords ?? [];

  let totalReduction = 0;
  let maxMinimum = 0;

  // Build the per-player scan zone list (base/legend/champion + every bf).
  const zonesToScan: string[] = [...PLAYER_BOARD_ZONES];
  for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
    zonesToScan.push(`battlefield-${bfId}`);
  }

  for (const zoneId of zonesToScan) {
    // Per-player zones (base/legendZone/championZone) take playerId;
    // Battlefield zones are global, so we read everyone then filter by
    // Controller below.
    const isPerPlayer = PLAYER_BOARD_ZONES.includes(zoneId);
    const ids = isPerPlayer
      ? ctx.zones.getCardsInZone(zoneId as CoreZoneId, playerId as CorePlayerId)
      : ctx.zones.getCardsInZone(zoneId as CoreZoneId);

    for (const permId of ids) {
      const controller =
        ctx.cards.getCardController?.(permId as CoreCardId) ??
        ctx.cards.getCardOwner(permId as CoreCardId);
      if (controller !== playerId) {
        continue;
      }
      // Skip the played card itself — the self-cost-reduction path on its
      // OWN printed cost is handled by the meta `costModifier` machinery
      // And/or the card's own static auras applying separately. Including
      // The played card here would double-apply if it sits on the board
      // (e.g. Ambush re-plays).
      if ((permId as string) === playedCardId) {
        continue;
      }
      const abilities = registry.getAbilities(permId as string) ?? [];
      for (const ability of abilities) {
        if ((ability as { type?: string }).type !== "static") {
          continue;
        }
        const {effect} = (ability as { effect?: Record<string, unknown> });
        if (
          !effect ||
          (effect as { type?: string }).type !== "cost-reduction"
        ) {
          continue;
        }

        // Target-match filter: only count auras whose `target` matches the
        // Played card. `self` / no-target shapes do not match an external
        // Played card.
        const {target} = (effect as { target?: unknown });
        if (!matchesPlayedCard(target, playedCardType, playedKeywords)) {
          continue;
        }

        // Optional condition gate (reuse the static-abilities evaluator —
        // It knows `while-at-battlefield`, `control-battlefield`, etc.).
        const cond = (ability as { condition?: Record<string, unknown> })
          .condition;
        if (cond) {
          // Find the permanent's current zone so the evaluator's zone-aware
          // Conditions (while-at-battlefield, while-alone) read true.
          const sourceZone = findPermanentZone(ctx, permId as string) ?? zoneId;
          const passes = evaluateCondition(cond, {
            id: permId as string,
            owner: playerId,
            zone: sourceZone,
          }, {
            cards: {
              getCardMeta: ctx.cards.getCardMeta,
              getCardOwner: ctx.cards.getCardOwner,
              updateCardMeta: ctx.cards.updateCardMeta,
            },
            draft: ctx.draft,
            zones: ctx.zones as unknown as Parameters<typeof evaluateCondition>[2]["zones"],
          });
          if (!passes) {
            continue;
          }
        }

        // Pull the reduction amount from any of the parser's emitted keys.
        // Parser uses `by` / `reduction` / `amount` depending on phrasing.
        // Multi-resource (`":rb_energy_2::rb_rune_calm:"`) is preserved as
        // A string and contributes ZERO here (we only handle pure-energy
        // Reductions in the play-cost path; the power-rune side is the
        // Caller's responsibility).
        const rawAmt =
          (effect as { by?: unknown }).by ??
          (effect as { reduction?: unknown }).reduction ??
          (effect as { amount?: unknown }).amount;
        const amt = typeof rawAmt === "number" ? rawAmt : 0;
        if (amt <= 0) {
          continue;
        }
        totalReduction += amt;

        // Track the max minimum across all matching reductions.
        const {minimum} = (effect as { minimum?: unknown });
        if (typeof minimum === "number" && minimum > maxMinimum) {
          maxMinimum = minimum;
        }
      }
    }
  }

  return { minimum: maxMinimum, reduction: totalReduction };
}

/**
 * Apply a static-cost-reduction result to a printed energy cost. Pure
 * arithmetic — clamps to `max(min, 0)` to honor each aura's minimum and
 * non-negative energy.
 */
export function applyStaticCostReduction(
  printedEnergy: number,
  reduction: StaticCostReduction,
): number {
  const after = printedEnergy - reduction.reduction;
  const floor = Math.max(reduction.minimum, 0);
  return Math.max(after, floor);
}

/**
 * Does this `target` shape match the played card? Generic, NO per-card ifs.
 *
 * Recognized shapes (parser-emitted):
 *  - `target.type` ∈ `"spell"` | `"unit"` | `"gear"` | `"equipment"` matches
 *    the played card's `cardType`.
 *  - `target.keyword` (string) requires the played card to have that
 *    printed keyword.
 *  - `target.controller` is informational — at this point we've already
 *    filtered by `controller === playerId` upstream, so `"friendly"` /
 *    `"self"` reads through; `"enemy"` blocks (a friendly aura that's
 *    declared as targeting enemies wouldn't reduce cost for the owner).
 *
 * Unknown / malformed → no match.
 */
function matchesPlayedCard(
  target: unknown,
  playedCardType: string | undefined,
  playedKeywords: readonly string[],
): boolean {
  if (target === undefined || target === null) {
    return false;
  }
  if (typeof target === "string") {
    // "self" / "card" — these self-target only; not a friendly aura.
    return false;
  }
  if (typeof target !== "object") {
    return false;
  }
  const t = target as {
    type?: string;
    keyword?: string;
    controller?: string;
  };
  // Enemy-targeted reductions don't apply to your own plays.
  if (t.controller === "enemy") {
    return false;
  }
  // Type filter (when present).
  if (t.type) {
    // `equipment` and `gear` are sometimes used interchangeably; treat
    // `equipment` as matching gear too (and vice-versa).
    if (t.type === "spell" && playedCardType !== "spell") {return false;}
    if (t.type === "unit" && playedCardType !== "unit") {return false;}
    if (
      (t.type === "gear" || t.type === "equipment") &&
      playedCardType !== "gear" &&
      playedCardType !== "equipment"
    ) {
      return false;
    }
  }
  // Keyword filter (when present).
  if (t.keyword && !playedKeywords.includes(t.keyword)) {
    return false;
  }
  return true;
}

/**
 * Locate the zone a permanent currently lives in. Used to feed
 * `while-at-battlefield`-style conditions. Returns the first match across
 * base / legendZone / championZone / battlefield-* (rule 463 — statics fire
 * from the board).
 */
function findPermanentZone(
  ctx: CostReductionContext,
  cardId: string,
): string | undefined {
  for (const playerId of Object.keys(ctx.draft.players ?? {})) {
    for (const zoneId of PLAYER_BOARD_ZONES) {
      const ids = ctx.zones.getCardsInZone(
        zoneId as CoreZoneId,
        playerId as CorePlayerId,
      );
      if (ids.includes(cardId as CoreCardId)) {
        return zoneId;
      }
    }
  }
  for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
    const bfZoneId = `battlefield-${bfId}`;
    const ids = ctx.zones.getCardsInZone(bfZoneId as CoreZoneId);
    if (ids.includes(cardId as CoreCardId)) {
      return bfZoneId;
    }
  }
  return undefined;
}
