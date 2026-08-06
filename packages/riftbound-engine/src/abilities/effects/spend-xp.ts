// Effect handler: "spend-xp"
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, resolveAmount } from "./_helpers";

// rule-id: unl-119-219 — "spend N XP" is a cost; callers gate the remaining
// steps / opt-in prompt on whether it can be paid.
export function canSpendXp(effect: ExecutableEffect, ctx: EffectContext): boolean {
  const xpAmount = resolveAmount(effect.amount ?? 1, ctx);
  const player = ctx.draft.players[ctx.playerId];
  return !!player && (player.xp ?? 0) >= xpAmount;
}

export function handle_spendXp(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const xpAmount = resolveAmount(effect.amount ?? 1, ctx);
  const player = ctx.draft.players[ctx.playerId];
  if (player && player.xp >= xpAmount) {
    player.xp -= xpAmount;
  }
}
