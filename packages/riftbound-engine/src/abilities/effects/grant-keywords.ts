// Effect handler: "grant-keywords"
import type { CardId as CoreCardId } from "@tcg/core";
import type { GrantedKeyword, RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_grantKeywords(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const kws = effect.keywords;
  if (!kws || kws.length === 0) {
    return;
  }
  const targets = getTargetIds(effect, ctx);
  const kwTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
  const duration = (effect.duration ?? "turn") as "turn" | "permanent" | "combat";
  for (const targetId of kwTargets) {
    const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    const existing = meta?.grantedKeywords ?? [];
    const entries: GrantedKeyword[] = kws.map((k) => ({ duration, keyword: k }));
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      {
        grantedKeywords: [...existing, ...entries],
      } as unknown as Record<string, unknown>,
    );
  }
}
