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
    ...resolveTarget(descriptor, {
      cards: ctx.cards,
      draft: ctx.draft,
      playerId: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
      sourceZone: ctx.sourceZone,
      ...(ctx.triggerSourceId !== undefined ? { triggerSourceId: ctx.triggerSourceId } : {}),
      zones: ctx.zones,
    }),
    ...(namesSubject ? [] : [ctx.sourceCardId]),
  ].filter((id) => {
    const meta = ctx.cards.getCardMeta?.(id as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    return meta?.buffed === true;
  });
  return [...new Set(candidates)];
}

export function findSpendableBuff(effect: ExecutableEffect, ctx: EffectContext): string | undefined {
  return findAllSpendableBuffs(effect, ctx)[0];
}

export function handle_spendBuff(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  // rule 355.13 (ogn-153-298): "FOR EACH friendly unit, you may spend its buff
  // to ready it" is a per-unit choice, not one all-or-nothing yes/no — park a
  // `pick-many` subset prompt over every unit that could spend, min 0 (spend
  // none) to all. The prompt is skipped when nothing could be spent.
  if ((effect as { optional?: boolean }).optional === true && !ctx.boundTargets) {
    if (ctx.draft.pendingChoice) {
      return;
    }
    const spendable = findAllSpendableBuffs(effect, ctx);
    if (spendable.length === 0) {
      return;
    }
    const { optional: _optional, ...rest } = effect as ExecutableEffect & { optional?: boolean };
    ctx.draft.pendingChoice = {
      max: spendable.length,
      min: 0,
      options: spendable.map((id) => ({ cardId: id, key: id })),
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
  // rule-id: ogn-230-298 (rule 355.13) — "spend any number of buffs": the
  // chooser's picks arrive as boundTargets (possibly none), and the nested
  // `then` resolves once PER buff spent. Without bound targets this stays the
  // single-buff cost of ogn-147-298.
  const bound = ctx.boundTargets;
  const hasBuff = (id: string): boolean =>
    (ctx.cards.getCardMeta?.(id as CoreCardId) as Partial<RiftboundCardMeta> | undefined)
      ?.buffed === true;
  const spentIds = bound
    ? bound.filter((id) => hasBuff(id as string)).map((id) => id as string)
    : [findSpendableBuff(effect, ctx)].filter((id): id is string => id !== undefined);
  const then = (effect as { then?: ExecutableEffect }).then;
  for (const spent of spentIds) {
    ctx.counters.setFlag(spent as CoreCardId, "buffed", false);
    // Mirror handle_buff: Might readers check top-level meta.buffed.
    ctx.cards.updateCardMeta?.(
      spent as CoreCardId,
      { buffed: false } as unknown as Record<string, unknown>,
    );
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
