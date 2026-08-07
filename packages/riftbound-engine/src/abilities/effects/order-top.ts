// Effect handler: "order-top"
import type { PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, resolveAmount } from "./_helpers";

/**
 * rule 386.2 (unl-062-219 Dramatic Visionary): after a [Predict] the cards
 * that were looked at and NOT recycled go "back in any order" — a real player
 * decision. Park an `order-cards` prompt over the top `amount` cards; fewer
 * than two cards have only one possible arrangement, so no prompt is raised.
 */
export function handle_orderTop(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  if (ctx.draft.pendingChoice) {
    return;
  }
  const raw = effect.amount ?? 0;
  const count = typeof raw === "number" ? raw : resolveAmount(raw, ctx);
  if (count < 2) {
    return;
  }
  const deckCards = ctx.zones.getCardsInZone("mainDeck" as CoreZoneId, ctx.playerId as CorePlayerId);
  const top = deckCards.slice(0, count).map((c) => c as string);
  if (top.length < 2) {
    return;
  }
  ctx.draft.pendingChoice = {
    cards: top,
    prompter: ctx.playerId,
    sourceCardId: ctx.sourceCardId,
    type: "order-cards",
  } as NonNullable<typeof ctx.draft.pendingChoice>;
}
