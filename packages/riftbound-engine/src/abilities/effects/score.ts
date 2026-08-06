// Effect handler: "score"
import { hasPlayerWon } from "../../game-definition/win-conditions/victory";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, resolveAmount } from "./_helpers";

export function handle_score(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const amount = resolveAmount(effect.amount ?? 1, ctx);
  const player = ctx.draft.players[ctx.playerId];
  if (player) {
    player.victoryPoints += amount;
    if (hasPlayerWon(ctx.draft, ctx.playerId)) {
      ctx.draft.status = "finished";
      ctx.draft.winner = ctx.playerId;
    }
  }
}
