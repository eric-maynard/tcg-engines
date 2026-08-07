/**
 * Shared gate for card-scoped replacement effects applied by effect handlers
 * (rules 366-372): match a would-be event against the board's replacement
 * abilities, run the substitute effect, and report that the original event must
 * NOT happen. Used by handlers whose action can be replaced outright —
 * ven-181-166 Gangplank, Naval: "[Empowered] If a spell or ability that chooses
 * me would stun me, … or return me to hand, give me +3 [Might] instead."
 */
import type { CardId as CoreCardId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { executeEffect } from "../effect-executor";
import {
  checkReplacement,
  markReplacementConsumed,
  type ReplacementEvent,
} from "../replacement-effects";

/** rule 366-372: does this matched replacement's gating condition hold right now? */
export function replacementConditionHolds(
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
 * Consult replacements for `event`. Returns true when one applied (its
 * substitute effect has already run and the original must be skipped).
 */
export function tryReplaceCardEvent(event: ReplacementEvent, ctx: EffectContext): boolean {
  const replacementCtx = {
    cards: {
      getCardMeta: ctx.cards.getCardMeta ?? (() => undefined),
      getCardOwner: ctx.cards.getCardOwner,
    },
    draft: ctx.draft,
    zones: { getCardsInZone: ctx.zones.getCardsInZone },
  };
  const match = checkReplacement(event, replacementCtx as Parameters<typeof checkReplacement>[1]);
  if (!match || !replacementConditionHolds(match.condition, match.sourceCardId, ctx)) {
    return false;
  }
  if (match.replacement !== "prevent" && match.replacement) {
    // The replacement is printed on the affected card, so it resolves with that
    // card as its source ("give ME +3 Might instead").
    executeEffect(match.replacement as ExecutableEffect, {
      ...ctx,
      boundTargets: undefined,
      sourceCardId: match.sourceCardId,
    });
  }
  markReplacementConsumed(ctx.draft, match);
  return true;
}
