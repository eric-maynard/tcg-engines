// Effect handler: "enter-ready"
import type { CardId as CoreCardId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_enterReady(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  const enterTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
  for (const targetId of enterTargets) {
    ctx.counters.setFlag(targetId as CoreCardId, "exhausted", false);
    // rule 805.2.b — the unit is ready, whichever representation carried the
    // exhausted state: seeded positions and effect-driven plays write the
    // legacy top-level `exhausted` meta, which the counter flag alone leaves
    // set (mirrors `effects/ready.ts`).
    const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as { exhausted?: boolean } | undefined;
    if (meta?.exhausted === true) {
      ctx.cards.updateCardMeta?.(targetId as CoreCardId, { exhausted: false } as Record<string, unknown>);
    }
  }
}
