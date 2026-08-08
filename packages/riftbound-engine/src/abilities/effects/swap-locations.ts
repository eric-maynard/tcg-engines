// Effect handler: "swap-locations"
import type { CardId as CoreCardId } from "@tcg/core";
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import type { EffectHelpers } from "./_helpers";
import { hasKeyword } from "../../game-definition/moves/movement/helpers";
import { arriveByEffect, moveCardWithEvent } from "./move";

/**
 * rule-id: unl-083-219 (Smoke and Mirrors) — rule 355.8 / 433: "Choose a unit
 * you control and another unit you control at a different location. If at
 * least one of them has [Temporary], move each to the other's location."
 *
 * Two caster-chosen units (`target1`/`target2`, locked at play time by the
 * playSpell enumerator, which only pairs units at DIFFERENT locations) trade
 * zones. `requireKeywordOnEither` gates only the movement — rule 359.3.e: the
 * rest of the instruction (`then`) runs either way.
 */
export function handle_swapLocations(
  effect: ExecutableEffect,
  ctx: EffectContext,
  h: EffectHelpers,
): void {
  const spec = effect as unknown as {
    target1?: TargetDescriptor;
    target2?: TargetDescriptor;
    requireKeywordOnEither?: string;
    then?: ExecutableEffect;
  };
  const resolverCtx = {
    cards: ctx.cards,
    draft: ctx.draft,
    playerId: ctx.playerId,
    sourceCardId: ctx.sourceCardId,
    sourceZone: ctx.sourceZone,
    zones: ctx.zones,
  } as Parameters<typeof resolveTarget>[1];

  let a = ctx.boundTargets?.[0];
  let b = ctx.boundTargets?.[1];
  if ((!a || !b) && spec.target1 && spec.target2) {
    const firsts = resolveTarget({ ...spec.target1, quantity: "all" }, resolverCtx);
    a ??= firsts[0];
    const aZone = a ? (ctx.zones.getCardZone(a as CoreCardId) as string | undefined) : undefined;
    const seconds = resolveTarget({ ...spec.target2, quantity: "all" }, resolverCtx).filter(
      (id) => id !== a && ctx.zones.getCardZone(id as CoreCardId) !== aZone,
    );
    b ??= seconds[0];
  }

  const zoneA = a ? (ctx.zones.getCardZone(a as CoreCardId) as string | undefined) : undefined;
  const zoneB = b ? (ctx.zones.getCardZone(b as CoreCardId) as string | undefined) : undefined;
  const keyword = spec.requireKeywordOnEither;
  const getMeta = ((id: CoreCardId) => ctx.cards.getCardMeta?.(id)) as Parameters<
    typeof hasKeyword
  >[2];
  const gateMet =
    keyword === undefined ||
    (a !== undefined && hasKeyword(a, keyword, getMeta)) ||
    (b !== undefined && hasKeyword(b, keyword, getMeta));

  // rule 450: Contested is attributed to the CONTROLLER of the arriving unit
  // (the shared arrival helper reads it); both land before either is staged.
  if (a && b && zoneA && zoneB && zoneA !== zoneB && gateMet) {
    const aLanded = moveCardWithEvent(ctx, a, zoneB);
    const bLanded = moveCardWithEvent(ctx, b, zoneA);
    arriveByEffect(ctx, [a], aLanded);
    arriveByEffect(ctx, [b], bLanded);
  }

  if (spec.then) {
    h.executeEffect(spec.then, ctx);
  }
}
