// Effect handler: "increase-might-to"
import type { CardId as CoreCardId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getEffectiveMight, checkBecomesMighty } from "./_helpers";

/**
 * rule 477.3.b (ogn-108-298 Convergent Mutation) — "increase its Might to the
 * Might of another friendly unit": a one-way snapshot. target1 gains the
 * difference when the reference is bigger and is never lowered; the reference
 * unit (target2) is untouched.
 */
export function handle_increaseMightTo(
  effect: ExecutableEffect,
  ctx: EffectContext,
  _h: EffectHelpers,
): void {
  const spec = effect as unknown as {
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
  // rule 477.3.b (rule-id: ven-079-166) — "Increase MY Might to its Might":
  // target1 names a fixed referent (the source), so only the reference unit is
  // chosen and the single pick binds target2, not target1.
  const fixedFirst =
    spec.target1 === undefined ||
    spec.target1 === ("self" as unknown as TargetDescriptor) ||
    (spec.target1 as { type?: string }).type === "self";
  if (fixedFirst) {
    const self = ctx.sourceCardId;
    const picked = ctx.boundTargets?.[0];
    if (picked === undefined && !ctx.draft.pendingChoice) {
      const pool = resolveTarget({ ...(spec.target2 as object), quantity: "all" } as TargetDescriptor, {
        ...resolverCtx,
      }) as string[];
      if (pool.length === 0) {
        return;
      }
      ctx.draft.pendingChoice = {
        effect,
        options: pool,
        playerId: ctx.playerId,
        sourceCardId: ctx.sourceCardId,
        type: "choose-target",
      } as typeof ctx.draft.pendingChoice;
      return;
    }
    if (picked === undefined) {
      return;
    }
    // rule 477.3.c — never a decrease: a smaller (or self-)pick raises by 0.
    const selfBefore = getEffectiveMight(self, ctx);
    const refBefore = getEffectiveMight(picked, ctx);
    const gain = refBefore - selfBefore;
    if (gain <= 0) {
      return;
    }
    const selfMeta = ctx.cards.getCardMeta?.(self as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    ctx.cards.updateCardMeta?.(self as CoreCardId, {
      mightModifier: (selfMeta?.mightModifier ?? 0) + gain,
    } as unknown as Record<string, unknown>);
    checkBecomesMighty(self, selfBefore, ctx);
    return;
  }

  const a = ctx.boundTargets?.[0];
  const b = ctx.boundTargets?.[1];
  // rule 355.8 — BOTH units are chosen by the caster: the one whose Might
  // rises and the one it is raised to. Prompt for them at resolution (the
  // second pick is drawn from the same friendly pool minus the first).
  if ((!a || !b) && !ctx.draft.pendingChoice) {
    const pool = resolveTarget({ ...spec.target1, quantity: "all" } as TargetDescriptor, {
      ...resolverCtx,
    }) as string[];
    if (pool.length < 2) {
      return;
    }
    ctx.draft.pendingChoice = {
      anyNumber: true,
      effect,
      maxPicks: 2,
      options: pool,
      playerId: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
      type: "choose-target",
    } as typeof ctx.draft.pendingChoice;
    return;
  }
  if (!a || !b || a === b) {
    return;
  }
  const aBefore = getEffectiveMight(a, ctx);
  const bBefore = getEffectiveMight(b, ctx);
  const delta = bBefore - aBefore;
  if (delta <= 0) {
    return;
  }
  const aMeta = ctx.cards.getCardMeta?.(a as CoreCardId) as Partial<RiftboundCardMeta> | undefined;
  ctx.cards.updateCardMeta?.(a as CoreCardId, {
    mightModifier: (aMeta?.mightModifier ?? 0) + delta,
  } as unknown as Record<string, unknown>);
  checkBecomesMighty(a, aBefore, ctx);
}
