// Effect handler: "draw"
import type { PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { hasPlayerWon } from "../../game-definition/win-conditions/victory";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, resolveAmount } from "./_helpers";

export function handle_draw(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const rawDrawCount = effect.amount ?? 1;
  const drawCount =
    typeof rawDrawCount === "number" ? rawDrawCount : resolveAmount(rawDrawCount, ctx);
  for (let i = 0; i < drawCount; i++) {
    // Check if deck is empty → Burn Out (rule 518)
    const deckCards = ctx.zones.getCardsInZone(
      "mainDeck" as CoreZoneId,
      ctx.playerId as CorePlayerId,
    );
    if (deckCards.length === 0) {
      // Move trash to deck
      const trashCards = ctx.zones.getCardsInZone(
        "trash" as CoreZoneId,
        ctx.playerId as CorePlayerId,
      );
      for (const cardId of trashCards) {
        ctx.zones.moveCard({
          cardId,
          targetZoneId: "mainDeck" as CoreZoneId,
        });
      }
      // Opponent scores 1 point
      for (const opponentId of Object.keys(ctx.draft.players)) {
        if (opponentId !== ctx.playerId) {
          const opponent = ctx.draft.players[opponentId];
          if (opponent) {
            opponent.victoryPoints += 1;
            if (hasPlayerWon(ctx.draft, opponentId)) {
              ctx.draft.status = "finished";
              ctx.draft.winner = opponentId;
            }
          }
        }
      }
      // If deck is still empty after burn out, can't draw
      const refreshedDeck = ctx.zones.getCardsInZone(
        "mainDeck" as CoreZoneId,
        ctx.playerId as CorePlayerId,
      );
      if (refreshedDeck.length === 0) {
        break;
      }
    }
    // Draw 1 card
    ctx.zones.drawCards({
      count: 1,
      from: "mainDeck" as CoreZoneId,
      playerId: ctx.playerId as CorePlayerId,
      to: "hand" as CoreZoneId,
    });
  }
}
