// Effect handler: "score"
import { hasPlayerWon } from "../../game-definition/win-conditions/victory";
import { pointGainDenied } from "../../operations/scoring-rules";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, resolveAmount } from "./_helpers";

export function handle_score(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const amount = resolveAmount(effect.amount ?? 1, ctx);
  const player = ctx.draft.players[ctx.playerId];
  if (!player) {
    return;
  }
  // rule 054.1 / 055: while an opposing "can't gain points" static is on the
  // board, gaining points is impossible, so the instruction is simply skipped.
  // Losing points (a negative amount) is not a gain and still applies.
  if (amount > 0 && pointGainDenied(ctx.draft, ctx.playerId, ctx)) {
    return;
  }
  player.victoryPoints += amount;
  if (hasPlayerWon(ctx.draft, ctx.playerId)) {
    ctx.draft.status = "finished";
    ctx.draft.winner = ctx.playerId;
  }
}
