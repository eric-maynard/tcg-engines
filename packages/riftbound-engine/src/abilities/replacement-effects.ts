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
    | "deals-bonus-damage"
    // rule 433.1.b / 366-372 — a spell or ability would give a unit a negative
    // Might modifier (ven-181-166 Gangplank, Naval).
    | "might-decrease"
    | "play-token"
    // rule 369.1 / 370.1 (sfd-018-221) — a player would reveal cards from a deck.
    | "reveal"
    // rule 740.3.a — a combat that ends with units of both players still at
    // the battlefield (ogn-227-298 "recall ALL units instead").
    | "combat-tie";
  /** The card being affected (if applicable) */
  readonly cardId?: string;
  /** The player being affected (if applicable) */
  readonly playerId?: string;
  /** The owner of the card being affected */
  readonly owner?: string;
  /** Amount (for damage/draw) */
  readonly amount?: number;
  /**
   * rule 443.1.a — how a `score` event is being produced ("conquer" | "hold").
   * A replacement that declares its own `method` only applies to matching events.
   */
  readonly method?: string;
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
  /** Optional gating condition from the ability; callers evaluate per event. */
  readonly condition?: unknown;
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


interface BoardCardEntry {
  id: string;
  owner: string;
  zone: string;
}

/** Base + battlefield units/gear that can carry a board replacement ability. */
function collectBoardCards(ctx: ReplacementContext): BoardCardEntry[] {
  const boardCards: BoardCardEntry[] = [];
  for (const playerId of Object.keys(ctx.draft.players)) {
    const baseCards = ctx.zones.getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId);
    for (const cardId of baseCards) {
      boardCards.push({ id: cardId as string, owner: playerId, zone: "base" });
    }
  }
  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    const zone = `battlefield-${bfId}`;
    const bfCards = ctx.zones.getCardsInZone(zone as CoreZoneId);
    for (const cardId of bfCards) {
      const owner = ctx.cards.getCardOwner(cardId) ?? "";
      boardCards.push({ id: cardId as string, owner, zone });
    }
  }
  return boardCards;
}

function boardEffectiveMight(cardId: string, ctx: ReplacementContext): number {
  const registry = getGlobalCardRegistry();
  const base = registry.get(cardId)?.might ?? 0;
  const meta = ctx.cards.getCardMeta(cardId as CoreCardId);
  let equip = 0;
  for (const equipId of meta?.equippedWith ?? []) {
    equip += registry.getMightBonus(equipId as string);
  }
  return Math.max(
    0,
    base +
      (meta?.buffed ? 1 : 0) +
      (meta?.extraBuffs ?? 0) +
      (meta?.mightModifier ?? 0) +
      (meta?.staticMightBonus ?? 0) +
      equip,
  );
}

/**
 * Does a board replacement's `target` / `condition` cover this event?
 * Honours controller friendly/enemy, `excludeSelf` ("another unit"),
 * `location: "here"` (same zone as the source; a source in base only covers
 * its owner's base) and `condition: {type: "less-might-than-source"}`
 * (rule-id: sfd-173-221 "if it has less Might than me").
 */
function replacementApplies(
  ability: unknown,
  card: BoardCardEntry,
  event: ReplacementEvent,
  eventCard: BoardCardEntry | undefined,
  ctx: ReplacementContext,
): boolean {
  const { target, condition, method } = ability as {
    target?: {
      attachedToSource?: boolean;
      controller?: string;
      excludeSelf?: boolean;
      location?: string;
      self?: boolean;
      type?: string;
    };
    condition?: { type?: string };
    method?: string;
  };
  // rule 369.2 — "if … would … ME": a self-scoped replacement only ever sees
  // events affecting its own source (ven-181-166 Gangplank, Naval).
  if (target?.self === true && event.cardId !== card.id) {
    return false;
  }
  // rule 369.2 — "if the EQUIPPED unit would die" (sfd-051-221 Guardian Angel):
  // the replacement only sees the death of the unit its source is attached to.
  if (target?.attachedToSource === true) {
    const attachedTo = ctx.cards.getCardMeta(card.id as CoreCardId)?.attachedTo;
    if (attachedTo === undefined || attachedTo !== event.cardId) {
      return false;
    }
  }
  // rule 443.1.a — a method-scoped skip ("skip the next point they would gain
  // from CONQUERING") is not a generic score replacement: it never applies to a
  // point gained by a different method (a Hold), and so is not consumed by one.
  // Fail closed when the caller could not name the method: a conquer-scoped skip
  // must never be applied to (or consumed by) a point gained some other way.
  if (method !== undefined && method !== event.method) {
    return false;
  }
  // rule 369.2 — the replacement only sees events matching its own target
  // description: "If a friendly UNIT would die" never applies to a gear or a
  // rune (ogn-077-298 must not replace its own "kill this instead").
  if ((target?.type === "unit" || target?.type === "gear") && event.cardId !== undefined) {
    // Unknown/synthetic ids (no registry entry) are not filtered out.
    const eventType = getGlobalCardRegistry().getCardType(event.cardId);
    if (eventType !== undefined && eventType !== target.type) {
      return false;
    }
  }
  if (target?.controller === "friendly") {
    if (event.owner && event.owner !== card.owner) {
      return false;
    }
  } else if (target?.controller === "enemy") {
    if (event.owner && event.owner === card.owner) {
      return false;
    }
  }
  if (target?.excludeSelf && event.cardId !== undefined && event.cardId === card.id) {
    return false;
  }
  if (target?.location === "here" && event.cardId !== undefined) {
    if (!eventCard || eventCard.zone !== card.zone) {
      return false;
    }
    if (card.zone === "base" && eventCard.owner !== card.owner) {
      return false;
    }
  }
  if (condition?.type === "less-might-than-source" && event.cardId !== undefined) {
    if (!(boardEffectiveMight(event.cardId, ctx) < boardEffectiveMight(card.id, ctx))) {
      return false;
    }
  }
  return true;
}

/**
 * Build the consumed-next key for a replacement ability.
 *
 * Single-fire `"next"`-duration replacements are keyed by
 * `${sourceCardId}|${abilityIndex}` in
 * `RiftboundGameState.consumedNextReplacements` so subsequent lookups skip
 * already-fired replacements.
 */
export function buildConsumedKey(sourceCardId: string, abilityIndex: number): string {
  return `${sourceCardId}|${abilityIndex}`;
}

/**
 * Find all replacement effects that apply to a game action.
 *
 * Scans all cards on the board for replacement abilities that match
 * the given event. Returns the complete list of matches so callers that
 * implement rule 575 ordering (owner/turn-player chooses resolution order)
 * can inspect every eligible replacement rather than just the first one.
 *
 * Respects `"next"` duration: replacements whose `${sourceCardId}|${abilityIndex}`
 * key has already been recorded in `draft.consumedNextReplacements` are
 * skipped.
 */
export function findAllReplacements(
  event: ReplacementEvent,
  ctx: ReplacementContext,
): MatchedReplacement[] {
  const registry = getGlobalCardRegistry();

  const boardCards = collectBoardCards(ctx);
  const eventCard =
    event.cardId === undefined ? undefined : boardCards.find((c) => c.id === event.cardId);

  const consumed = ctx.draft.consumedNextReplacements ?? {};
  const matches: MatchedReplacement[] = [];

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

      if (!replacementApplies(ability, card, event, eventCard, ctx)) {
        continue;
      }

      const { duration } = ability as unknown as { duration?: string };
      if (duration === "next" && consumed[buildConsumedKey(card.id, i)]) {
        continue;
      }

      const { replacement, condition } = ability as unknown as {
        replacement: unknown;
        condition?: unknown;
      };
      matches.push({
        abilityIndex: i,
        condition,
        duration,
        replacement,
        sourceCardId: card.id,
        sourceOwner: card.owner,
      });
    }
  }

  return matches;
}

/**
 * Order a list of eligible replacements per rule 575.
 *
 * Rule 575.1: When multiple replacement effects apply to the same event
 * affecting an object, the **owner** of the affected object chooses the
 * order in which they resolve. When the affected object is a player,
 * that player chooses.
 *
 * Rule 575.2: When the affected "object" is an uncontrolled battlefield
 * (or any object without an owner), the **turn player** chooses the
 * order.
 *
 * A selector may be passed in to let the caller (UI) pick an ordering.
 * When no selector is provided, the ordering is stable: replacements on
 * cards owned by the chooser come first (in insertion order), then the
 * rest. This default is compatible with "auto/goldfish" play where the
 * chooser has a single reasonable first pick.
 */
export function orderReplacementsByOwnerChoice(
  matches: MatchedReplacement[],
  affectedOwner: string | undefined,
  turnPlayer: string,
  selector?: (matches: MatchedReplacement[], chooser: string) => MatchedReplacement[],
): { ordered: MatchedReplacement[]; chooser: string } {
  const chooser = affectedOwner ?? turnPlayer;

  if (matches.length <= 1) {
    return { chooser, ordered: matches };
  }

  if (selector) {
    return { chooser, ordered: selector(matches, chooser) };
  }

  // Default stable ordering: chooser-owned replacements first, then others.
  const mine: MatchedReplacement[] = [];
  const other: MatchedReplacement[] = [];
  for (const m of matches) {
    if (m.sourceOwner === chooser) {
      mine.push(m);
    } else {
      other.push(m);
    }
  }
  return { chooser, ordered: [...mine, ...other] };
}

/**
 * Check if any replacement effects apply to a game action.
 *
 * Scans all cards on the board for replacement abilities that match
 * the given event. Returns the first matching replacement (after owner
 * ordering per rule 575), or null.
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

  const boardCards = collectBoardCards(ctx);
  const eventCard =
    event.cardId === undefined ? undefined : boardCards.find((c) => c.id === event.cardId);

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

      if (!replacementApplies(ability, card, event, eventCard, ctx)) {
        continue;
      }

      const { duration } = ability as unknown as { duration?: string };

      // Skip "next"-duration replacements that have already fired.
      if (duration === "next" && consumed[buildConsumedKey(card.id, i)]) {
        continue;
      }

      const { replacement, condition } = ability as unknown as {
        replacement: unknown;
        condition?: unknown;
      };

      return {
        abilityIndex: i,
        condition,
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
