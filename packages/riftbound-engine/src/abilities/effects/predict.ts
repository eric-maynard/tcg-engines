// Effect handler: "predict"
import type { PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, resolveAmount } from "./_helpers";
import { asYouLookAbility } from "./look";

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
  const deck = deckCards.map((c) => c as string);
  // rule 354.3 / 370.1 (ogn-062-298 × ogn-194-298) — once a looked-at card has
  // removed itself with its own "as you look at me" replacement, the Predict
  // still ranges over the cards it looked at that are still there: it never
  // pulls a fresh card up behind the one that left.
  const carriedLookedAt = (effect as { lookedAtIds?: readonly string[] }).lookedAtIds;
  const topN = carriedLookedAt
    ? carriedLookedAt.filter((id) => deck.includes(id))
    : deck.slice(0, Math.max(0, predictCount));
  if (topN.length === 0) {
    return;
  }
  // rule 436.1 / 369.1 / 370.1 (ogn-194-298 Nocturne) — [Predict] LOOKS at the
  // top cards, so a card's own "as you look at or reveal me from the top of
  // your deck, you may …" replacement is offered before the recycle choice,
  // while the card is still in the deck. Cards already offered for this Predict
  // are remembered so a decline is not re-offered forever.
  const offered = ((effect as { revealOffered?: readonly string[] }).revealOffered ??
    []) as readonly string[];
  for (const lookedAtId of topN) {
    if (offered.includes(lookedAtId)) {
      continue;
    }
    const asYouLook = asYouLookAbility(lookedAtId);
    if (!asYouLook) {
      continue;
    }
    ctx.draft.pendingChoice = {
      boundTargets: [lookedAtId],
      effect: asYouLook,
      playerId: ctx.playerId,
      sourceCardId: lookedAtId,
      // The Predict itself resumes after the answer either way — under its own
      // source, not the card that answered.
      then: {
        ...(effect as object),
        lookedAtIds: topN,
        revealOffered: [...offered, lookedAtId],
      },
      thenSourceCardId: ctx.sourceCardId,
      type: "confirm",
      // biome-ignore lint/suspicious/noExplicitAny: branded id types
    } as any;
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
    // rule 128.4 / 424.1 — [Predict] LOOKS at the top cards; nothing is
    // revealed, so the cards and the recycle choice stay hidden from everyone
    // else (the opponent sees only that a choice is being made).
    private: true,
    prompter: ctx.playerId,
    revealed: topN,
    revealer: ctx.playerId,
    sourceCardId: ctx.sourceCardId,
    // The already-offered look replacements ride along so the chained Predict
    // over the rest does not ask about the same card again.
    ...(remaining > 0
      ? { then: { amount: remaining, revealOffered: offered, type: "predict" } }
      : {}),
    type: "reveal-and-pick",
  };
}
