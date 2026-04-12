/**
 * Target Resolver
 *
 * Resolves abstract target descriptions ("a friendly unit", "an enemy unit here",
 * "all units") into actual card IDs on the board.
 *
 * Target types from the parser:
 * - { type: "self" }           → the source card
 * - { type: "unit" }           → any unit on the board
 * - { type: "unit", controller: "friendly" }  → a friendly unit
 * - { type: "unit", controller: "enemy" }     → an enemy unit
 * - { type: "gear" }           → any gear
 * - { type: "card" }           → any card
 * - { type: "player" }         → a player (for effects like "each player")
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import type { RiftboundGameState } from "../types";

/**
 * Simplified target descriptor (from parser output).
 */
export interface TargetDescriptor {
  readonly type: string;
  readonly controller?: "friendly" | "enemy" | "any";
  readonly location?: string;
  readonly filter?: Record<string, unknown>;
  readonly quantity?: number | "all";
}

/**
 * Context for resolving targets.
 */
export interface TargetResolverContext {
  readonly playerId: string;
  readonly sourceCardId: string;
  readonly sourceZone?: string;
  readonly draft: RiftboundGameState;
  readonly zones: {
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
    getCardZone: (cardId: CoreCardId) => string | undefined;
  };
  readonly cards: {
    getCardOwner: (cardId: CoreCardId) => string | undefined;
  };
}

/**
 * Resolve a target descriptor to actual card IDs.
 *
 * @param target - The target descriptor from the parsed ability
 * @param ctx - Resolution context
 * @returns Array of resolved card IDs (may be empty if no valid targets)
 */
export function resolveTarget(
  target: TargetDescriptor | undefined,
  ctx: TargetResolverContext,
): string[] {
  if (!target) {
    return [];
  }

  // Self target
  if (target.type === "self") {
    return [ctx.sourceCardId];
  }

  // Collect candidate cards from the board
  const candidates = getBoardCardIds(ctx);

  // Filter by card type
  const registry = getGlobalCardRegistry();
  let filtered = candidates;

  if (target.type === "unit") {
    filtered = filtered.filter((id) => {
      const def = registry.get(id);
      return def?.cardType === "unit";
    });
  } else if (target.type === "gear" || target.type === "equipment") {
    filtered = filtered.filter((id) => {
      const def = registry.get(id);
      return def?.cardType === "gear" || def?.cardType === "equipment";
    });
  } else if (target.type === "permanent") {
    filtered = filtered.filter((id) => {
      const def = registry.get(id);
      return def?.cardType === "unit" || def?.cardType === "gear" || def?.cardType === "equipment";
    });
  }

  // Filter by controller
  if (target.controller === "friendly") {
    filtered = filtered.filter((id) => {
      const owner = ctx.cards.getCardOwner(id as CoreCardId) ?? "";
      return owner === ctx.playerId;
    });
  } else if (target.controller === "enemy") {
    filtered = filtered.filter((id) => {
      const owner = ctx.cards.getCardOwner(id as CoreCardId) ?? "";
      return owner !== ctx.playerId && owner !== "";
    });
  }

  // Filter by location
  if (target.location === "here" && ctx.sourceZone) {
    filtered = filtered.filter((id) => {
      const zone = ctx.zones.getCardZone(id as CoreCardId);
      return zone === ctx.sourceZone;
    });
  } else if (target.location === "base") {
    filtered = filtered.filter((id) => {
      const zone = ctx.zones.getCardZone(id as CoreCardId);
      return zone === "base";
    });
  } else if (target.location?.startsWith("battlefield")) {
    filtered = filtered.filter((id) => {
      const zone = ctx.zones.getCardZone(id as CoreCardId) ?? "";
      return zone.startsWith("battlefield");
    });
  }

  // Exclude self (unless explicitly targeting self)
  if (target.type !== "self") {
    filtered = filtered.filter((id) => id !== ctx.sourceCardId);
  }

  // Apply quantity limit
  if (target.quantity === "all") {
    return filtered;
  }

  const count = typeof target.quantity === "number" ? target.quantity : 1;
  return filtered.slice(0, count);
}

/**
 * Get all card IDs currently on the board (base + battlefields).
 */
function getBoardCardIds(ctx: TargetResolverContext): string[] {
  const ids: string[] = [];

  // Base cards for all players
  for (const playerId of Object.keys(ctx.draft.players)) {
    const baseCards = ctx.zones.getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId);
    ids.push(...baseCards.map((c) => c as string));
  }

  // Battlefield cards
  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    const bfCards = ctx.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId);
    ids.push(...bfCards.map((c) => c as string));
  }

  // Battlefield row cards (battlefield cards themselves)
  const battlefieldRowCards = ctx.zones.getCardsInZone("battlefieldRow" as CoreZoneId);
  ids.push(...battlefieldRowCards.map((c) => c as string));

  // NOTE: Champion zone is intentionally excluded. Cards in the champion zone
  // Have not been played to the board and are not valid targets for board-
  // Targeting effects. Champions must be played (paid for) from the champion
  // Zone to the base before they become targetable.

  return ids;
}
