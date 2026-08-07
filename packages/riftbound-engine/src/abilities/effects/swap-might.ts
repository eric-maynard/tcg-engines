// Effect handler: "swap-might"
import type { CardId as CoreCardId } from "@tcg/core";
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getEffectiveMight } from "./_helpers";
import { applyMightModifierDelta } from "./might-modifier";

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
    const aZone = a ? (ctx.zones.getCardZone(a as CoreCardId) as string) : undefined;
    // rule-id: ogn-220-298 — `location: "same"` on target2 filters via sameZone.
    const second = swap.target2
      ? resolveTarget(
          { ...swap.target2, quantity: "all" },
          { ...resolverCtx, sameZone: aZone, sourceZone: aZone ?? ctx.sourceZone },
        ).filter((id) => id !== a)
      : [];
    b ??= second[0];
  }
  if (!a || !b) return;
  const aBefore = getEffectiveMight(a, ctx);
  const bBefore = getEffectiveMight(b, ctx);
  // rule 433.1.a/433.1.b — a swap is ONE difference turned into TWO independent
  // modifiers; replacing one side never recalculates the other.
  applyMightModifierDelta(a, bBefore - aBefore, ctx);
  applyMightModifierDelta(b, aBefore - bBefore, ctx);
}
