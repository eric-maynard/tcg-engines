// Effect handler: "set-base-might"
import type { CardId as CoreCardId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import type { EffectHelpers } from "./_helpers";
import { getTargetIds } from "./_helpers";

/**
 * rule 323.5 / 142.4.b (ven-116-166 Dragon Form) — "Its base Might becomes N
 * this turn": a SET of the base value. A smaller unit grows, a bigger one
 * SHRINKS, and everything layered on top of base Might (buff counters, "+N this
 * turn", statics, equipment) still applies on top of the new base. Lethal
 * damage is re-checked against the new value in the next Cleanup.
 */
export function handle_setBaseMight(
  effect: ExecutableEffect,
  ctx: EffectContext,
  _h: EffectHelpers,
): void {
  const amount = (effect as unknown as { amount?: number }).amount;
  if (typeof amount !== "number") {
    return;
  }
  for (const cardId of getTargetIds(effect, ctx)) {
    ctx.cards.updateCardMeta?.(cardId as CoreCardId, {
      baseMightOverride: amount,
    } as unknown as Record<string, unknown>);
  }
}
