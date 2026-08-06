// Effect handler: "grant-keyword"
import type { CardId as CoreCardId } from "@tcg/core";
import type { GrantedKeyword, RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_grantKeyword(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const kw = effect.keyword;
  if (!kw) {
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
    const entry: GrantedKeyword = { duration, keyword: kw, value: effect.value };
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      {
        grantedKeywords: [...existing, entry],
      } as unknown as Record<string, unknown>,
    );
  }
}
