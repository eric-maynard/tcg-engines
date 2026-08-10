// Effect handler: "set-base-might"
import type { CardId as CoreCardId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import type { EffectHelpers } from "./_helpers";
import { getTargetIds, withMightWatch } from "./_helpers";

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
  // rule 709 / 710 — a SET base Might can carry the unit across the Mighty
  // threshold just like a pump, so the change goes through the Might watch.
  const targetIds = getTargetIds(effect, ctx);
  withMightWatch(targetIds, ctx, () => {
    for (const cardId of targetIds) {
      ctx.cards.updateCardMeta?.(cardId as CoreCardId, {
        baseMightOverride: amount,
      } as unknown as Record<string, unknown>);
    }
  });
}
