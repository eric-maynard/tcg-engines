// Effect handler: "gain-xp"
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, resolveAmount } from "./_helpers";

export function handle_gainXp(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const xpAmount = resolveAmount(effect.amount ?? 1, ctx);
  const player = ctx.draft.players[ctx.playerId];
  if (player) {
    player.xp += xpAmount;
  }
  // Track XP gained this turn
  if (ctx.draft.xpGainedThisTurn) {
    ctx.draft.xpGainedThisTurn[ctx.playerId] =
      (ctx.draft.xpGainedThisTurn[ctx.playerId] ?? 0) + xpAmount;
  }
  // Fire trigger
  if (ctx.fireTriggers) {
    ctx.fireTriggers({ amount: xpAmount, playerId: ctx.playerId, type: "gain-xp" });
  }
}
