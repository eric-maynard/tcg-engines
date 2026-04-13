/**
 * Replacement Effects (rules 571-575)
 *
 * Replacement effects intercept game actions before they happen and
 * substitute an alternative effect. Identified by "instead" in card text.
 *
 * Supported replacement events:
 * - "die": when a unit would be killed
 * - "take-damage": when a unit would take damage
 * - "draw": when a player would draw
 * - "discard": when a player would discard
 * - "enters-ready": when a unit would enter play (so it enters ready instead of exhausted)
 * - "deals-bonus-damage": when a spell or ability would deal damage (deal bonus instead)
 *
 * Usage: call `checkReplacement()` before executing a game action.
 * If it returns a replacement, execute that instead of the original action.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import type { RiftboundCardMeta, RiftboundGameState } from "../types";

/**
 * A game action that might be replaced.
 */
export interface ReplacementEvent {
  /** The type of action about to happen */
  readonly type:
    | "die"
    | "take-damage"
    | "move"
    | "draw"
    | "discard"
    | "score"
    | "enters-ready"
    | "deals-bonus-damage";
  /** The card being affected (if applicable) */
  readonly cardId?: string;
  /** The player being affected (if applicable) */
  readonly playerId?: string;
  /** The owner of the card being affected */
  readonly owner?: string;
  /** Amount (for damage/draw) */
  readonly amount?: number;
}

/**
 * A matched replacement ready to execute.
 */
export interface MatchedReplacement {
  /** The card that provides this replacement */
  readonly sourceCardId: string;
  /** The owner of the source card */
  readonly sourceOwner: string;
  /** The replacement effect to execute (or "prevent" to just block) */
  readonly replacement: unknown | "prevent";
  /** Duration — "next" replacements should be removed after firing */
  readonly duration?: string;
  /** Index of the ability on the source card (for removal tracking) */
  readonly abilityIndex: number;
}

/**
 * Context needed to scan for replacement effects.
 */
export interface ReplacementContext {
  readonly draft: RiftboundGameState;
  readonly zones: {
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
  };
  readonly cards: {
    getCardOwner: (cardId: CoreCardId) => string | undefined;
    getCardMeta: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined;
  };
}

/**
 * Build the consumed-next key for a replacement ability.
 *
 * Single-fire `"next"`-duration replacements are keyed by
 * `${sourceCardId}|${abilityIndex}` in
 * `RiftboundGameState.consumedNextReplacements` so subsequent lookups skip
 * already-fired replacements.
 */
function buildConsumedKey(sourceCardId: string, abilityIndex: number): string {
  return `${sourceCardId}|${abilityIndex}`;
}

/**
 * Check if any replacement effects apply to a game action.
 *
 * Scans all cards on the board for replacement abilities that match
 * the given event. Returns the first matching replacement, or null.
 *
 * Per rule 575: if multiple replacements apply, the owner of the
 * affected object chooses order. For simplicity, we return the first match.
 *
 * Respects `"next"` duration: replacements whose `${sourceCardId}|${abilityIndex}`
 * key has already been recorded in `draft.consumedNextReplacements` are
 * skipped. Callers should call `markReplacementConsumed()` after using a
 * matched `"next"` replacement.
 */
export function checkReplacement(
  event: ReplacementEvent,
  ctx: ReplacementContext,
): MatchedReplacement | null {
  const registry = getGlobalCardRegistry();

  // Collect all board cards
  const boardCards: { id: string; owner: string }[] = [];
  for (const playerId of Object.keys(ctx.draft.players)) {
    const baseCards = ctx.zones.getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId);
    for (const cardId of baseCards) {
      boardCards.push({ id: cardId as string, owner: playerId });
    }
  }
  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    const bfCards = ctx.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId);
    for (const cardId of bfCards) {
      const owner = ctx.cards.getCardOwner(cardId) ?? "";
      boardCards.push({ id: cardId as string, owner });
    }
  }

  const consumed = ctx.draft.consumedNextReplacements ?? {};

  // Scan for replacement abilities
  for (const card of boardCards) {
    const abilities = registry.getAbilities(card.id) ?? [];
    for (let i = 0; i < abilities.length; i++) {
      const ability = abilities[i];
      if (!ability || ability.type !== "replacement") {
        continue;
      }

      const { replaces } = ability as unknown as { replaces: string };
      if (replaces !== event.type) {
        continue;
      }

      // Check target matching
      const { target } = ability as unknown as { target?: { controller?: string } };
      if (target?.controller === "friendly") {
        // Only applies to cards owned by the same player
        if (event.owner && event.owner !== card.owner) {
          continue;
        }
      } else if (target?.controller === "enemy") {
        if (event.owner && event.owner === card.owner) {
          continue;
        }
      }

      const { duration } = ability as unknown as { duration?: string };

      // Skip "next"-duration replacements that have already fired.
      if (duration === "next" && consumed[buildConsumedKey(card.id, i)]) {
        continue;
      }

      const { replacement } = ability as unknown as { replacement: unknown };

      return {
        abilityIndex: i,
        duration,
        replacement,
        sourceCardId: card.id,
        sourceOwner: card.owner,
      };
    }
  }

  return null;
}

/**
 * Record that a `"next"`-duration replacement has fired.
 *
 * Single-fire replacements (Tactical Retreat, Highlander, Noxian Guillotine,
 * etc.) should be consumed after their replacement effect is executed. This
 * function mutates `draft` so the replacement is skipped on future
 * `checkReplacement()` calls until the markers are cleared at end of turn.
 *
 * Safe to call on non-"next" replacements — it no-ops unless the duration
 * is exactly `"next"`.
 */
export function markReplacementConsumed(
  draft: RiftboundGameState,
  matched: MatchedReplacement,
): void {
  if (matched.duration !== "next") {
    return;
  }
  if (!draft.consumedNextReplacements) {
    (
      draft as unknown as {
        consumedNextReplacements: Record<string, true>;
      }
    ).consumedNextReplacements = {};
  }
  const key = buildConsumedKey(matched.sourceCardId, matched.abilityIndex);
  (draft.consumedNextReplacements as Record<string, true>)[key] = true;
}

/**
 * Clear all `"next"`-duration replacement consumed markers. Invoked during
 * end-of-turn cleanup so that new "next-time" replacements created next
 * turn start fresh. (Turn-scoped replacements like Tactical Retreat's
 * "this turn" are expected to be read off the board by `checkReplacement()`
 * and naturally become inert when the source card is gone; clearing the
 * consumed set just prevents stale keys from blocking new instances.)
 */
export function clearConsumedReplacements(draft: RiftboundGameState): void {
  if (draft.consumedNextReplacements) {
    (
      draft as unknown as {
        consumedNextReplacements: Record<string, true>;
      }
    ).consumedNextReplacements = {};
  }
}
