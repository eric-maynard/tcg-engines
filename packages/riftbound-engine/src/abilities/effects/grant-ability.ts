// Effect handler: "grant-ability"
import type { CardId as CoreCardId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_grantAbility(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // rule-id: ven-142-166 — "give it '<cost>: <effect>' this turn": expose
  // `registry.getAbilities(sourceCardId)[abilityIndex]` as an activated
  // ability of the target (host pays, host is `self`) until it expires.
  const ga = effect as unknown as { abilityIndex?: number; duration?: string };
  if (typeof ga.abilityIndex !== "number") {
    return;
  }
  const targets = getTargetIds(effect, ctx);
  const duration = (ga.duration ?? "turn") as "turn" | "permanent";
  for (const targetId of targets) {
    const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    const existing = meta?.grantedAbilities ?? [];
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      {
        grantedAbilities: [
          ...existing,
          { abilityIndex: ga.abilityIndex, duration, sourceCardId: ctx.sourceCardId },
        ],
      } as unknown as Record<string, unknown>,
    );
  }
}
