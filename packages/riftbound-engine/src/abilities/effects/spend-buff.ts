// Effect handler: "spend-buff"
import type { CardId as CoreCardId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import type { EffectHelpers } from "./_helpers";

/**
 * rule-id: ogn-147-298 — "spend a buff to X": remove a buff from a friendly
 * unit as a cost, then resolve the nested `then` effect. If no friendly unit
 * has a buff the cost can't be paid and `then` does not resolve.
 */
export function findSpendableBuff(effect: ExecutableEffect, ctx: EffectContext): string | undefined {
  const descriptor: TargetDescriptor =
    (effect.target as TargetDescriptor | undefined) ??
    ({ controller: "friendly", filter: "buffed", quantity: "all", type: "unit" } as TargetDescriptor);
  // resolveTarget excludes the source; a unit may spend its own buff.
  const candidates = [
    ...resolveTarget(descriptor, {
      cards: ctx.cards,
      draft: ctx.draft,
      playerId: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
      sourceZone: ctx.sourceZone,
      zones: ctx.zones,
    }),
    ctx.sourceCardId,
  ].filter((id) => {
    const meta = ctx.cards.getCardMeta?.(id as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    return meta?.buffed === true;
  });
  return candidates[0];
}

export function handle_spendBuff(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  const spent = findSpendableBuff(effect, ctx);
  if (!spent) {
    return;
  }
  ctx.counters.setFlag(spent as CoreCardId, "buffed", false);
  // Mirror handle_buff: Might readers check top-level meta.buffed.
  ctx.cards.updateCardMeta?.(
    spent as CoreCardId,
    { buffed: false } as unknown as Record<string, unknown>,
  );
  const then = (effect as { then?: ExecutableEffect }).then;
  if (then) {
    h.executeEffect(then, ctx);
  }
}
