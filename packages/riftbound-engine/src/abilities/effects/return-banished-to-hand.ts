// Effect handler: "return-banished-to-hand"
import type { CardId as CoreCardId, ZoneId as CoreZoneId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import type { EffectHelpers } from "./_helpers";

/**
 * rule-id: unl-169-219 (Ashe, Focused) — "When they hold, return it to their
 * hand (even if I'm no longer on the board)." rule 392: the delayed ability is
 * independent of its source, so it names the banished card by id and puts it
 * back in its OWNER's hand. A card that already left banishment is left alone.
 */
export function handle_returnBanishedToHand(
  effect: ExecutableEffect,
  ctx: EffectContext,
  _h: EffectHelpers,
): void {
  const cardId = (effect as unknown as { cardId?: string }).cardId;
  if (cardId === undefined) {
    return;
  }
  if (ctx.zones.getCardZone?.(cardId as CoreCardId) !== "banishment") {
    return;
  }
  ctx.zones.moveCard({
    cardId: cardId as CoreCardId,
    targetZoneId: "hand" as CoreZoneId,
  });
}
