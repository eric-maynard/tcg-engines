// Effect handler: "modify-might"
import type { CardId as CoreCardId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds, getEffectiveMight, resolveAmount, checkBecomesMighty } from "./_helpers";

/**
 * rule-id: sfd-001-221 — "+N Might for each enemy unit THERE": the tally is
 * anchored at the AFFECTED unit's battlefield, not at the source's zone. A
 * spell resolves from the chain, so `location: "here"` has no anchor of its own.
 */
function countAnchoredAtTarget(amount: unknown): boolean {
  if (typeof amount !== "object" || amount === null || !("count" in amount)) {
    return false;
  }
  const location = (amount as { count?: { location?: string } }).count?.location;
  return location === "here" || location === "same";
}

export function handle_modifyMight(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  const perTargetCount = countAnchoredAtTarget(effect.amount);
  const baseAmount = perTargetCount ? 0 : resolveAmount(effect.amount ?? 0, ctx);
  const minimum = (effect as { minimum?: number }).minimum;
  for (const targetId of targets) {
    const amountCtx = perTargetCount
      ? {
          ...ctx,
          sameZone: ctx.zones.getCardZone(targetId as CoreCardId) ?? ctx.sameZone,
          sourceZone: ctx.zones.getCardZone(targetId as CoreCardId) ?? ctx.sourceZone,
        }
      : ctx;
    const resolvedAmount = perTargetCount
      ? resolveAmount(effect.amount ?? 0, amountCtx)
      : baseAmount;
    const mightBefore = getEffectiveMight(targetId, ctx);
    // rule-id: ogn-097-298 — "to a minimum of N Might": a penalty can't
    // reduce the unit's Might below the floor (and never raises it).
    let amount = resolvedAmount;
    if (typeof minimum === "number" && amount < 0) {
      amount = Math.max(amount, Math.min(0, minimum - mightBefore));
    }
    const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    const currentMod = meta?.mightModifier ?? 0;
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      {
        mightModifier: currentMod + amount,
      } as unknown as Record<string, unknown>,
    );
    checkBecomesMighty(targetId, mightBefore, ctx);
  }
}
