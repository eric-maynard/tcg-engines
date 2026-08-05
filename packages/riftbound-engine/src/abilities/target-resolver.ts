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
import type { RiftboundCardMeta, RiftboundGameState } from "../types";

/**
 * Simplified target descriptor (from parser output).
 */
export interface TargetDescriptor {
  readonly type: string;
  readonly controller?: "friendly" | "enemy" | "any";
  readonly location?: string;
  readonly filter?: TargetFilter | TargetFilter[];
  readonly quantity?: number | "all";
}

/** Single filter clause — string state literal or object predicate. */
export type TargetFilter = string | Record<string, unknown>;

/**
 * Context for resolving targets.
 */
export interface TargetResolverContext {
  readonly playerId: string;
  readonly sourceCardId: string;
  readonly sourceZone?: string;
  /**
   * rule-id: ven-021-166 — from/to zones of the GameEvent that fired the
   * trigger being resolved, for `location: "move-to-or-from"` filtering.
   */
  readonly triggerZones?: readonly string[];
  readonly draft: RiftboundGameState;
  readonly zones: {
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
    getCardZone: (cardId: CoreCardId) => string | undefined;
  };
  readonly cards: {
    getCardOwner: (cardId: CoreCardId) => string | undefined;
    getCardMeta?: (cardId: CoreCardId) => Record<string, unknown> | undefined;
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
  target: TargetDescriptor | string | undefined,
  ctx: TargetResolverContext,
): string[] {
  if (!target) {
    return [];
  }

  // Bare-string target: parser emits "self" for it/me/itself; any other
  // string is a pre-resolved card ID (see getTargetIds in effect-executor).
  if (typeof target === "string") {
    return target === "self" ? [ctx.sourceCardId] : [target];
  }

  // Self target
  if (target.type === "self") {
    return [ctx.sourceCardId];
  }

  // Battlefield definitions live in battlefieldRow, not the unit board.
  if (target.type === "battlefield") {
    return ctx.zones.getCardsInZone("battlefieldRow" as CoreZoneId).map((c) => c as string);
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
    // Rule 350.1 / 383.2.c: on a battlefield card's own ability, "here" means
    // the per-battlefield unit zone (battlefield-<cardId>), not battlefieldRow.
    const hereZone =
      ctx.sourceZone === "battlefieldRow" ? `battlefield-${ctx.sourceCardId}` : ctx.sourceZone;
    filtered = filtered.filter((id) => {
      const zone = ctx.zones.getCardZone(id as CoreCardId);
      return zone === hereZone;
    });
  } else if (target.location === "base") {
    filtered = filtered.filter((id) => {
      const zone = ctx.zones.getCardZone(id as CoreCardId);
      return zone === "base";
    });
  } else if (target.location === "move-to-or-from") {
    // rule-id: ven-021-166 — only battlefields the triggering move touched are
    // legal; fall back to the source's current zone (the move destination) when
    // the trigger event wasn't threaded through.
    const moveZones = (
      ctx.triggerZones ?? (ctx.sourceZone ? [ctx.sourceZone] : [])
    ).filter((z) => z.startsWith("battlefield"));
    filtered = filtered.filter((id) => {
      const zone = ctx.zones.getCardZone(id as CoreCardId) ?? "";
      return moveZones.includes(zone);
    });
  } else if (target.location?.startsWith("battlefield")) {
    filtered = filtered.filter((id) => {
      const zone = ctx.zones.getCardZone(id as CoreCardId) ?? "";
      return zone.startsWith("battlefield");
    });
  }

  // Rule 355.8: apply descriptor filters (state / might / keyword / tag).
  if (target.filter !== undefined) {
    const filters = Array.isArray(target.filter) ? target.filter : [target.filter];
    filtered = filtered.filter((id) => filters.every((f) => matchesFilter(id, f, ctx)));
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

  // NOTE: battlefieldRow (the battlefield-definition cards themselves) is
  // intentionally excluded here — those are locations, not units/permanents,
  // and are only valid when target.type === "battlefield" (handled above).

  // NOTE: Champion zone is intentionally excluded. Cards in the champion zone
  // Have not been played to the board and are not valid targets for board-
  // Targeting effects. Champions must be played (paid for) from the champion
  // Zone to the base before they become targetable.

  return ids;
}

const MIGHTY_THRESHOLD = 5;

/**
 * Evaluate a single target-descriptor filter against a card (rule 355.8).
 * Unknown filter shapes pass through (return true) so newly-emitted parser
 * filters degrade to the previous "match any" behaviour rather than silently
 * emptying the target set.
 */
function matchesFilter(cardId: string, filter: TargetFilter, ctx: TargetResolverContext): boolean {
  const registry = getGlobalCardRegistry();
  const def = registry.get(cardId);
  const meta = ctx.cards.getCardMeta?.(cardId as CoreCardId) as Partial<RiftboundCardMeta> | undefined;

  // Parser also emits `{ state: "attacking" }` — normalise to the string form.
  const state =
    typeof filter === "string"
      ? filter
      : typeof filter.state === "string"
        ? (filter.state as string)
        : undefined;

  if (state !== undefined) {
    switch (state) {
      case "attacking":
        return meta?.combatRole === "attacker";
      case "defending":
        return meta?.combatRole === "defender";
      case "mighty":
        return effectiveMight(def, meta) >= MIGHTY_THRESHOLD;
      case "damaged":
        return (meta?.damage ?? 0) > 0;
      case "stunned":
        return meta?.stunned === true;
      case "buffed":
        return meta?.buffed === true;
      case "ready":
        return meta?.exhausted !== true;
      case "exhausted":
        return meta?.exhausted === true;
      case "equipped":
        return (meta?.equippedWith?.length ?? 0) > 0;
      case "attached":
        return meta?.attachedTo !== undefined;
      case "detached":
        return meta?.attachedTo === undefined;
      case "facedown":
        return meta?.hidden === true;
      default:
        return true;
    }
  }

  if (typeof filter !== "object") {
    return true;
  }

  if ("might" in filter) {
    return matchesComparison(effectiveMight(def, meta), filter.might);
  }
  if ("keyword" in filter && typeof filter.keyword === "string") {
    if (registry.hasKeyword(cardId, filter.keyword)) {
      return true;
    }
    return meta?.grantedKeywords?.some((gk) => gk.keyword === filter.keyword) ?? false;
  }
  if ("tag" in filter && typeof filter.tag === "string") {
    const tags = (def as { tags?: string[] } | undefined)?.tags;
    return tags?.includes(filter.tag) ?? false;
  }
  if ("name" in filter && typeof filter.name === "string") {
    return def?.name === filter.name;
  }

  return true;
}

function effectiveMight(
  def: { might?: number } | undefined,
  meta: Partial<RiftboundCardMeta> | undefined,
): number {
  const base = def?.might ?? 0;
  const buff = meta?.buffed ? 1 : 0;
  return Math.max(0, base + buff + (meta?.mightModifier ?? 0) + (meta?.staticMightBonus ?? 0));
}

function matchesComparison(value: number, cmp: unknown): boolean {
  if (typeof cmp !== "object" || cmp === null) {
    return true;
  }
  const c = cmp as { eq?: number; lt?: number; lte?: number; gt?: number; gte?: number };
  if (c.eq !== undefined && value !== c.eq) return false;
  if (c.lt !== undefined && !(value < c.lt)) return false;
  if (c.lte !== undefined && !(value <= c.lte)) return false;
  if (c.gt !== undefined && !(value > c.gt)) return false;
  if (c.gte !== undefined && !(value >= c.gte)) return false;
  return true;
}
