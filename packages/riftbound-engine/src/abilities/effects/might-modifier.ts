/**
 * Shared write path for turn-scoped Might modifiers (`meta.mightModifier`).
 *
 * Every effect that hands a unit a Might modifier goes through here so that a
 * DECREASE can be intercepted by a replacement effect (rules 366-372) — e.g.
 * ven-181-166 Gangplank, Naval: "[Empowered] If a spell or ability that chooses
 * me would … give me -[Might] …, give me +3 [Might] instead."
 */
import type { CardId as CoreCardId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { executeEffect } from "../effect-executor";
import { checkReplacement, markReplacementConsumed } from "../replacement-effects";
import { getEffectiveMight, checkBecomesMighty } from "./_helpers";

/** rule 366-372: does this matched replacement's gating condition hold right now? */
function replacementConditionHolds(
  condition: unknown,
  sourceCardId: string,
  ctx: EffectContext,
): boolean {
  if (!condition || typeof condition !== "object") {
    return true;
  }
  const { type } = condition as { type?: string };
  if (type === "while-empowered") {
    const meta = ctx.cards.getCardMeta?.(sourceCardId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    return meta?.empowered === true;
  }
  // Unknown gating conditions are treated as unmet — a replacement must never
  // fire on a condition the engine cannot evaluate.
  return false;
}

/**
 * Add `delta` to a unit's `meta.mightModifier`, consulting "might-decrease"
 * replacements first when `delta` is negative. Fires become-mighty.
 *
 * Returns true when a replacement took over (the raw delta was NOT applied).
 */
/**
 * rule 359.3.f (ogn-060-298 Mask of Foresight x ogn-169-298 Gust) — a card that
 * left the board before the effect resolved is gone as far as that effect is
 * concerned: the new object in hand / trash / the deck must not carry the
 * modifier the whiffed trigger meant for the unit that used to be there.
 */
const OFF_BOARD_ZONES = new Set([
  "hand",
  "mainDeck",
  "runeDeck",
  "trash",
  "banishment",
  "championZone",
]);

export function applyMightModifierDelta(
  cardId: string,
  delta: number,
  ctx: EffectContext,
  opts?: { chosen?: boolean },
): boolean {
  const zone = ctx.zones.getCardZone?.(cardId as CoreCardId) as string | undefined;
  if (zone !== undefined && OFF_BOARD_ZONES.has(zone)) {
    return false;
  }
  const mightBefore = getEffectiveMight(cardId, ctx);

  // rule 366-372 (ven-181-166) — the replacement only reads "a spell or ability
  // that CHOOSES me"; a board-wide sweep ("give enemy units -3") chooses nobody.
  if (delta < 0 && opts?.chosen !== false) {
    const owner = ctx.cards.getCardOwner?.(cardId as CoreCardId) ?? "";
    const replacementCtx = {
      cards: {
        getCardMeta: ctx.cards.getCardMeta ?? (() => undefined),
        getCardOwner: ctx.cards.getCardOwner,
      },
      draft: ctx.draft,
      zones: { getCardsInZone: ctx.zones.getCardsInZone },
    };
    const match = checkReplacement(
      { amount: -delta, cardId, owner, type: "might-decrease" },
      replacementCtx as Parameters<typeof checkReplacement>[1],
    );
    if (match && replacementConditionHolds(match.condition, match.sourceCardId, ctx)) {
      if (match.replacement !== "prevent" && match.replacement) {
        // The replacement is printed on the affected card, so it resolves with
        // that card as its source ("give ME +3 Might instead").
        executeEffect(match.replacement as ExecutableEffect, {
          ...ctx,
          boundTargets: undefined,
          sourceCardId: match.sourceCardId,
        });
      }
      markReplacementConsumed(ctx.draft, match);
      checkBecomesMighty(cardId, mightBefore, ctx);
      return true;
    }
  }

  const meta = ctx.cards.getCardMeta?.(cardId as CoreCardId) as
    | Partial<RiftboundCardMeta>
    | undefined;
  ctx.cards.updateCardMeta?.(cardId as CoreCardId, {
    mightModifier: (meta?.mightModifier ?? 0) + delta,
  } as unknown as Record<string, unknown>);
  checkBecomesMighty(cardId, mightBefore, ctx);
  return false;
}
