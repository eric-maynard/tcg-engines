// Effect handler: "spend-xp"
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, resolveAmount } from "./_helpers";

export function handle_spendXp(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const xpAmount = resolveAmount(effect.amount ?? 1, ctx);
  const player = ctx.draft.players[ctx.playerId];
  if (player && player.xp >= xpAmount) {
    player.xp -= xpAmount;
  }
}
