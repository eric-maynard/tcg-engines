// Effect handler: "swap-might"
import type { CardId as CoreCardId } from "@tcg/core";
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getActualMightInRole } from "./_helpers";
import { applyMightModifierDelta } from "./might-modifier";
import { isBattlefieldZone } from "../../zones/zone-configs";

/**
 * rule 359.3.e.5 — re-check on resolution that the two locked-in units still
 * satisfy the descriptors they were chosen under: `target1.location:
 * "battlefield"` means it must still be at a battlefield, and
 * `target2.location: "same"` means the SAME battlefield as the first.
 */
function stillSwappable(
  a: string,
  b: string,
  swap: { target1?: TargetDescriptor; target2?: TargetDescriptor },
  ctx: EffectContext,
): boolean {
  const aZone = ctx.zones.getCardZone(a as CoreCardId) as string | undefined;
  const bZone = ctx.zones.getCardZone(b as CoreCardId) as string | undefined;
  if (!aZone || !bZone) return false;
  if (swap.target1?.location === "battlefield" && !isBattlefieldZone(aZone)) return false;
  if (swap.target2?.location === "same" && aZone !== bZone) return false;
  if (swap.target2?.location === "battlefield" && !isBattlefieldZone(bZone)) return false;
  return true;
}

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
  // rule 359.3.e.5 / 359.3.e.12 / 433.1.b — a swap is ONE calculation over both
  // Mights: if either chosen unit no longer meets the effect's own targeting
  // restriction on resolution (e.g. moved to base, so they are no longer "at
  // the same battlefield") its Might reads null and the whole calculation is
  // ignored — neither side changes, no "half swap".
  if (!stillSwappable(a, b, swap, ctx)) return;
  // rule 433 / 807.1.c — the swap reads CURRENT Might, which includes the
  // Assault / Shield bonus of a unit that holds a combat role right now
  // (ruling 6ca8dbf1edd07e15).
  // rule 143.2.b.1 — the difference is sized from the ACTUAL Mights: a unit at
  // a negative Might is only TREATED as 0 when its Might is referenced, never
  // when an effect calculates an increase/decrease from it.
  const aBefore = getActualMightInRole(a, ctx);
  const bBefore = getActualMightInRole(b, ctx);
  // rule 433.1.a/433.1.b — a swap is ONE difference turned into TWO independent
  // modifiers; replacing one side never recalculates the other.
  applyMightModifierDelta(a, bBefore - aBefore, ctx);
  applyMightModifierDelta(b, aBefore - bBefore, ctx);
}
