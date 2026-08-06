// Effect handler: "predict"
import type { PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, resolveAmount } from "./_helpers";

export function handle_predict(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // Rule: Look at the top N cards of your Main Deck; you may recycle
  // Any of them (put on bottom of deck). For headless/goldfish play,
  // We auto-recycle every card we peeked at. This is observable
  // Behavior: after Predict N on an ordered deck [A,B,C,D,...],
  // The top N cards land at the bottom. Tests can assert on deck
  // Order after Predict.
  //
  // A full interactive implementation would pause for a player
  // Choice (look → optional recycle → resume) via pendingChoice.
  const rawPredictCount = effect.amount ?? 1;
  const predictCount =
    typeof rawPredictCount === "number" ? rawPredictCount : resolveAmount(rawPredictCount, ctx);
  const deckCards = ctx.zones.getCardsInZone(
    "mainDeck" as CoreZoneId,
    ctx.playerId as CorePlayerId,
  );
  const topN = deckCards.slice(0, Math.max(0, predictCount));
  for (const cardId of topN) {
    ctx.zones.moveCard({
      cardId,
      position: "bottom",
      targetZoneId: "mainDeck" as CoreZoneId,
    });
  }
}
