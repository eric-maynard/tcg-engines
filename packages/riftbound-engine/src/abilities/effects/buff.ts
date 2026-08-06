// Effect handler: "buff"
import type { CardId as CoreCardId } from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds, getEffectiveMight, checkBecomesMighty } from "./_helpers";

/**
 * rule 702.3 / 426.1.b.2 (ogn-078-298): "I can have any number of buffs" —
 * a printed static `{ type: "unlimited-buffs" }` lifts the one-buff cap.
 */
export function canHoldUnlimitedBuffs(cardId: string): boolean {
  const abilities = getGlobalCardRegistry().getAbilities(cardId) ?? [];
  return abilities.some(
    (a) =>
      a?.type === "static" &&
      (a as { effect?: { type?: string } }).effect?.type === "unlimited-buffs",
  );
}

export function handle_buff(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  const buffTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
  for (const targetId of buffTargets) {
    // Enforce max 1 buff per unit (rule)
    const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    if (meta?.buffed) {
      // rule 702.3: a further buff only lands on a unit whose cap is lifted;
      // it is tracked in `extraBuffs` (+1 Might each, rule 703).
      if (!canHoldUnlimitedBuffs(targetId)) {
        continue; // Already buffed — skip
      }
      const before = getEffectiveMight(targetId, ctx);
      ctx.cards.updateCardMeta?.(
        targetId as CoreCardId,
        { extraBuffs: (meta.extraBuffs ?? 0) + 1 } as unknown as Record<string, unknown>,
      );
      checkBecomesMighty(targetId, before, ctx);
      ctx.fireTriggers?.({ cardId: targetId, playerId: ctx.playerId, type: "buff" });
      continue;
    }
    const mightBefore = getEffectiveMight(targetId, ctx);
    ctx.counters.setFlag(targetId as CoreCardId, "buffed", true);
    // rule-id: unl-043-219 — setFlag writes meta.__flags.buffed but every Might
    // reader (getEffectiveMight, static-abilities, cards.ts) checks top-level
    // meta.buffed; mirror it there so the +1 Might buff is actually observed.
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      { buffed: true } as unknown as Record<string, unknown>,
    );
    checkBecomesMighty(targetId, mightBefore, ctx);
    // rule-id: ogn-152-298 — "When you buff a friendly unit" listeners
    // (Mistfall) need a buff event; playerId is the buffing player so
    // `controller: "friendly"` descriptors can resolve the subject owner.
    ctx.fireTriggers?.({ cardId: targetId, playerId: ctx.playerId, type: "buff" });
  }
}
