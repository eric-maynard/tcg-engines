// Effect handler: "swap-might"
import type { CardId as CoreCardId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getEffectiveMight, checkBecomesMighty } from "./_helpers";

export function handle_swapMight(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const swap = effect as unknown as {
    target1?: TargetDescriptor;
    target2?: TargetDescriptor;
  };
  const resolverCtx = {
    cards: ctx.cards,
    draft: ctx.draft,
    playerId: ctx.playerId,
    sourceCardId: ctx.sourceCardId,
    sourceZone: ctx.sourceZone,
    zones: ctx.zones,
  };
  let a = ctx.boundTargets?.[0];
  let b = ctx.boundTargets?.[1];
  if (!a || !b) {
    const first = resolveTarget(swap.target1, resolverCtx);
    a ??= first[0];
    const second = resolveTarget(swap.target2, {
      ...resolverCtx,
      sourceZone: a ? (ctx.zones.getCardZone(a as CoreCardId) as string) : ctx.sourceZone,
    }).filter((id) => id !== a);
    b ??= second[0];
  }
  if (!a || !b) return;
  const aBefore = getEffectiveMight(a, ctx);
  const bBefore = getEffectiveMight(b, ctx);
  const aMeta = ctx.cards.getCardMeta?.(a as CoreCardId) as
    | Partial<RiftboundCardMeta>
    | undefined;
  const bMeta = ctx.cards.getCardMeta?.(b as CoreCardId) as
    | Partial<RiftboundCardMeta>
    | undefined;
  ctx.cards.updateCardMeta?.(
    a as CoreCardId,
    { mightModifier: (aMeta?.mightModifier ?? 0) + (bBefore - aBefore) } as unknown as Record<
      string,
      unknown
    >,
  );
  ctx.cards.updateCardMeta?.(
    b as CoreCardId,
    { mightModifier: (bMeta?.mightModifier ?? 0) + (aBefore - bBefore) } as unknown as Record<
      string,
      unknown
    >,
  );
  checkBecomesMighty(a, aBefore, ctx);
  checkBecomesMighty(b, bBefore, ctx);
}
