// Effect handler: "cost-increase"
import type { CardId as CoreCardId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds, resolveAmount } from "./_helpers";

export function handle_costIncrease(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const shape = effect as unknown as { amount?: unknown; by?: unknown; duration?: string; scope?: string; target?: unknown };
  const amount = resolveAmount((effect.amount ?? shape.by ?? 0) as never, ctx);
  // rule 356.3 (rule-id: unl-219-219) — "your … cost [N] more to play this
  // turn" surcharges FUTURE plays, so it is installed as a runtime rider on
  // the player rather than written onto objects already on the board. Stored
  // beside the other play-cost riders so it expires with the turn (517.2).
  if (shape.scope === "play") {
    const draft = ctx.draft as unknown as { activeReplacements?: unknown[] };
    draft.activeReplacements = draft.activeReplacements ?? [];
    draft.activeReplacements.push({
      amount,
      duration: shape.duration ?? "turn",
      owner: ctx.playerId,
      replaces: "play-cost-increase",
      sourceCardId: ctx.sourceCardId,
      target: shape.target,
    });
    return;
  }
  const targets = getTargetIds(effect, ctx);
  const costTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
  for (const targetId of costTargets) {
    const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    const current = meta?.costModifier ?? 0;
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      { costModifier: current + amount } as unknown as Record<string, unknown>,
    );
  }
}
