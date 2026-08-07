// Effect handler: "predict"
import type { PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, resolveAmount } from "./_helpers";

export function handle_predict(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // rule-id: unl-131-219-predict-look-optional-recycle — "Look at the top
  // card of your Main Deck. You may recycle it." / Predict N: "look at the
  // top N … Recycle any of them". This is a player decision, not an
  // auto-recycle: surface the looked-at cards as an optional
  // reveal-and-pick (recycle the pick, leave the rest on top). For N > 1
  // the pick chains a Predict over the remaining cards so any subset can be
  // recycled one at a time; declining ends the Predict.
  const existing = ctx.draft.pendingChoice as { type?: string; then?: unknown } | undefined;
  if (existing && existing.type === "reveal-and-pick") {
    // Same deferral as `look`: never clobber an unresolved pick.
    const prevThen = existing.then;
    ctx.draft.pendingChoice = {
      ...(existing as NonNullable<typeof ctx.draft.pendingChoice>),
      then: prevThen ? { effects: [prevThen, effect], type: "sequence" } : effect,
    } as NonNullable<typeof ctx.draft.pendingChoice>;
    return;
  }
  const rawPredictCount = effect.amount ?? 1;
  const predictCount =
    typeof rawPredictCount === "number" ? rawPredictCount : resolveAmount(rawPredictCount, ctx);
  const deckCards = ctx.zones.getCardsInZone(
    "mainDeck" as CoreZoneId,
    ctx.playerId as CorePlayerId,
  );
  const topN = deckCards.slice(0, Math.max(0, predictCount)).map((c) => c as string);
  if (topN.length === 0) {
    return;
  }
  const remaining = topN.length - 1;
  ctx.draft.pendingChoice = {
    // rule 386.2 (unl-062-219): "…and put the rest back in any order" — the
    // looked-at cards that were NOT recycled go back on top in an order their
    // controller picks. Declining the recycle ends the Predict, so the
    // arrangement has to be raised from the decline path too; `order-top`
    // no-ops when fewer than two cards are left to arrange.
    onDecline: { amount: topN.length, type: "order-top" },
    onPicked: "recycle",
    optional: true,
    prompter: ctx.playerId,
    revealed: topN,
    revealer: ctx.playerId,
    sourceCardId: ctx.sourceCardId,
    ...(remaining > 0 ? { then: { amount: remaining, type: "predict" } } : {}),
    type: "reveal-and-pick",
  };
}
