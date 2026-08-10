// Effect handler: "spend-buff"
import type { CardId as CoreCardId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import type { EffectHelpers } from "./_helpers";

/**
 * rule-id: ogn-147-298 — "spend a buff to X": remove a buff from a friendly
 * unit as a cost, then resolve the nested `then` effect. If no friendly unit
 * has a buff the cost can't be paid and `then` does not resolve.
 */
export function findAllSpendableBuffs(effect: ExecutableEffect, ctx: EffectContext): string[] {
  const descriptor: TargetDescriptor =
    (effect.target as TargetDescriptor | undefined) ??
    ({ controller: "friendly", filter: "buffed", quantity: "all", type: "unit" } as TargetDescriptor);
  // resolveTarget excludes the source; a unit may spend its own buff. A
  // descriptor naming the affected object itself ("spend ITS buff" — rule-id:
  // ogn-269-298, `trigger-source`) never falls back to the source card.
  const namesSubject = (descriptor as { type?: string }).type === "trigger-source";
  const candidates = [
    // "spend any number of buffs" must see EVERY buffed candidate, so the
    // descriptor's own quantity never narrows the pool here.
    ...resolveTarget({ ...descriptor, quantity: "all" } as TargetDescriptor, {
      cards: ctx.cards,
      draft: ctx.draft,
      playerId: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
      sourceZone: ctx.sourceZone,
      ...(ctx.triggerSourceId !== undefined ? { triggerSourceId: ctx.triggerSourceId } : {}),
      zones: ctx.zones,
    }),
    ...(namesSubject ? [] : [ctx.sourceCardId]),
  ].filter((id) => buffCountOf(ctx, id) > 0);
  return [...new Set(candidates)];
}

/**
 * rule 702.2.b / 703 — every Buff on an object is its OWN counter (each +1
 * Might); the first is tracked by `meta.buffed`, the rest by `extraBuffs`.
 */
export function buffCountOf(ctx: EffectContext, id: string): number {
  const meta = ctx.cards.getCardMeta?.(id as CoreCardId) as Partial<RiftboundCardMeta> | undefined;
  return (meta?.buffed === true ? 1 : 0) + (meta?.extraBuffs ?? 0);
}

/** rule 702.2.b / 745.1 — spending a buff removes a SINGLE Buff counter. */
function removeOneBuff(ctx: EffectContext, id: string): boolean {
  const meta = ctx.cards.getCardMeta?.(id as CoreCardId) as Partial<RiftboundCardMeta> | undefined;
  const extra = meta?.extraBuffs ?? 0;
  if (extra > 0) {
    ctx.cards.updateCardMeta?.(id as CoreCardId, { extraBuffs: extra - 1 } as unknown as Record<string, unknown>);
    return true;
  }
  if (meta?.buffed !== true) {
    return false;
  }
  ctx.counters.setFlag(id as CoreCardId, "buffed", false);
  // Mirror handle_buff: Might readers check top-level meta.buffed.
  ctx.cards.updateCardMeta?.(id as CoreCardId, { buffed: false } as unknown as Record<string, unknown>);
  return true;
}

export function findSpendableBuff(effect: ExecutableEffect, ctx: EffectContext): string | undefined {
  return findAllSpendableBuffs(effect, ctx)[0];
}

export function handle_spendBuff(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  // rule 355.13 (ogn-153-298): "FOR EACH friendly unit, you may spend its buff
  // to ready it" is a per-unit choice, not one all-or-nothing yes/no — park a
  // `pick-many` subset prompt over every unit that could spend, min 0 (spend
  // none) to all. The prompt is skipped when nothing could be spent.
  // rule 702.2.b (ogn-230-298) — "spend ANY NUMBER of buffs" is likewise a
  // per-counter subset pick, not one pick per buffed unit.
  const anyNumberOfBuffs =
    ((effect as { target?: { quantity?: unknown } }).target as { quantity?: unknown } | undefined)
      ?.quantity === "any";
  if (
    ((effect as { optional?: boolean }).optional === true || anyNumberOfBuffs) &&
    !ctx.boundTargets
  ) {
    if (ctx.draft.pendingChoice) {
      return;
    }
    const spendable = findAllSpendableBuffs(effect, ctx);
    if (spendable.length === 0) {
      return;
    }
    const { optional: _optional, ...rest } = effect as ExecutableEffect & { optional?: boolean };
    // rule 702.2.b — one option per Buff COUNTER, so a unit carrying several can
    // have some (not all) of them spent.
    const options = spendable.flatMap((id) =>
      Array.from({ length: buffCountOf(ctx, id) }, (_v, i) => ({
        cardId: id,
        key: i === 0 ? id : `${id}#${i + 1}`,
      })),
    );
    ctx.draft.pendingChoice = {
      max: options.length,
      min: 0,
      options,
      playerId: ctx.playerId,
      prompt: "Spend which buffs?",
      resume: {
        effect: rest,
        kind: "subset-repick",
        playerId: ctx.playerId,
        sourceCardId: ctx.sourceCardId,
      },
      semantics: "subset",
      sourceCardId: ctx.sourceCardId,
      // The rest of the resolving sequence rides on this prompt's `then`.
      suspendsSequence: true,
      type: "pick-many",
    } as typeof ctx.draft.pendingChoice;
    return;
  }
  // rule 702.2.b (rule-id: ogn-282-298) — spending a buff is the PAYING
  // player's own action, so when two or more of their units carry one they
  // choose WHICH buff is spent instead of the engine taking the first found.
  // Only the bare "spend a buff to …" cost asks: shapes naming their own
  // subject (`trigger-source`, "spend any number of") carry a descriptor.
  if (
    !ctx.boundTargets &&
    (effect as { target?: unknown }).target === undefined &&
    !ctx.draft.pendingChoice
  ) {
    const choices = findAllSpendableBuffs(effect, ctx);
    if (choices.length >= 2) {
      ctx.draft.pendingChoice = {
        effect,
        options: choices,
        playerId: ctx.playerId,
        remaining: 1,
        sourceCardId: ctx.sourceCardId,
        type: "choose-target",
      } as typeof ctx.draft.pendingChoice;
      return;
    }
  }
  // rule-id: ogn-230-298 (rule 355.13) — "spend any number of buffs": the
  // chooser's picks arrive as boundTargets (possibly none), and the nested
  // `then` resolves once PER buff spent. Without bound targets this stays the
  // single-buff cost of ogn-147-298.
  const bound = ctx.boundTargets;
  // A card may appear once per counter it is spending (702.2.b), so the "has a
  // buff left" check is re-made inside the loop instead of filtering up front.
  const spentIds = bound
    ? bound.map((id) => id as string)
    : [findSpendableBuff(effect, ctx)].filter((id): id is string => id !== undefined);
  const then = (effect as { then?: ExecutableEffect }).then;
  for (const spent of spentIds) {
    if (!removeOneBuff(ctx, spent)) {
      continue;
    }
    // rule 702.2.b: a "spend a buff to …" instruction is a spend too — fire the
    // event once per buff removed, before the nested effect resolves.
    ctx.fireTriggers?.({
      cardId: ctx.sourceCardId,
      playerId: ctx.playerId,
      spentFrom: spent,
      type: "spend-buff",
    });
    if (then) {
      h.executeEffect(then, ctx);
    }
  }
}
