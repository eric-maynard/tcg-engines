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
  readonly type: "die" | "take-damage" | "move" | "draw" | "discard" | "score";
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
 * Check if any replacement effects apply to a game action.
 *
 * Scans all cards on the board for replacement abilities that match
 * the given event. Returns the first matching replacement, or null.
 *
 * Per rule 575: if multiple replacements apply, the owner of the
 * affected object chooses order. For simplicity, we return the first match.
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

      const { replacement } = ability as unknown as { replacement: unknown };
      const { duration } = ability as unknown as { duration?: string };

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
