// Effect handler: "damage"
import type { CardId as CoreCardId } from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState } from "../../types";
import { checkReplacement, markReplacementConsumed } from "../replacement-effects";
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds, getEffectiveMight, resolveAmount } from "./_helpers";

export function handle_damage(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  const executeEffect = h.executeEffect;
  // Rule 355.14.a-c / 355.15: split damage. The caster first chooses a
  // friendly reference unit as a standard target (raised via choose-target
  // when >1 candidate), then up to N enemy units as split targets where
  // N = that unit's current Might; each split target takes exactly 1.
  // Zero split targets is legal (355.14.c). All choices lock at finalization.
  if ((effect as { split?: boolean }).split === true) {
    const resolverCtx = {
      cards: ctx.cards,
      draft: ctx.draft,
      playerId: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
      sourceZone: ctx.sourceZone,
      zones: ctx.zones,
    };
    const rawMight = (effect.amount as { might?: unknown } | undefined)?.might;
    let refId: string | undefined = ctx.boundTargets?.[0];
    // Rule 359.3.e.2 / 359.3.e.12 (unl-192-219): the reference unit was
    // chosen at play time; if it left the board, changed controller, or
    // stopped being a unit before resolution it is now an illegal target
    // and its Might referent is null → deal no damage.
    if (refId !== undefined && typeof rawMight === "object" && rawMight !== null) {
      const stillLegal = resolveTarget(
        { ...(rawMight as TargetDescriptor), quantity: "all" },
        resolverCtx,
      ).includes(refId);
      if (!stillLegal) {
        return;
      }
    }
    if (refId === undefined && typeof rawMight === "object" && rawMight !== null) {
      const refOptions = resolveTarget(
        { ...(rawMight as TargetDescriptor), quantity: "all" },
        resolverCtx,
      );
      if (refOptions.length >= 2) {
        ctx.draft.pendingChoice = {
          type: "choose-target",
          playerId: ctx.playerId,
          sourceCardId: ctx.sourceCardId,
          effect,
          options: refOptions,
          remaining: 1,
        } as RiftboundGameState["pendingChoice"];
        return;
      }
      refId = refOptions[0];
    }
    const n = Math.max(
      0,
      refId ? getEffectiveMight(refId, ctx) : resolveAmount(effect.amount ?? 0, ctx),
    );
    const legalPool = effect.target
      ? resolveTarget(
          { ...(effect.target as TargetDescriptor), quantity: "all" },
          resolverCtx,
        )
      : [];
    // Rule 355.14.b/c / 355.15: split targets are caster-chosen at
    // finalization and travel in boundTargets after the reference unit
    // at index 0. Rule 359.3.e.2 drops any that became illegal.
    // Rule 355.14.e/f/g / 359.3.f.2: distribution is a RESOLUTION-time
    // caster choice — extra occurrences of a target id in boundTargets
    // encode surplus damage the caster has already assigned to it.
    let splitTargets: string[];
    const assigned: Record<string, number> = {};
    if (ctx.boundTargets && ctx.boundTargets.length > 1) {
      splitTargets = ctx.boundTargets
        .slice(1)
        .filter((id) => legalPool.includes(id));
      for (const id of splitTargets) {
        assigned[id] = (assigned[id] ?? 0) + 1;
      }
      const uniqueTargets = Object.keys(assigned);
      // Rule 355.14.h / 355.14.h.1 (unl-192-219): if the reference unit's
      // resolution-time Might is now less than the chosen split-target
      // count, the controller drops exactly (count − Might) targets — no
      // more — so every remaining target can receive its mandatory ≥1.
      if (uniqueTargets.length > n && refId !== undefined) {
        ctx.draft.pendingChoice = {
          type: "choose-target",
          playerId: ctx.playerId,
          sourceCardId: ctx.sourceCardId,
          effect,
          options: uniqueTargets,
          remaining: uniqueTargets.length - n,
          boundTargets: [refId, ...uniqueTargets],
        } as RiftboundGameState["pendingChoice"];
        return;
      }
      splitTargets = uniqueTargets;
    } else {
      splitTargets = legalPool.slice(0, n);
      for (const id of splitTargets) {
        assigned[id] = 1;
      }
    }
    const assignedTotal = Object.values(assigned).reduce((a, b) => a + b, 0);
    let surplus = Math.max(0, n - assignedTotal);
    // Rule 355.14.e/f/g (unl-192-219): the caster distributes surplus
    // damage at resolution — one choose-target pick per surplus point,
    // each appended to boundTargets so re-entry sees it as +1 assigned.
    if (surplus > 0 && splitTargets.length > 1 && refId !== undefined) {
      const encoded: string[] = [refId];
      for (const id of splitTargets) {
        for (let i = 0; i < assigned[id]; i++) encoded.push(id);
      }
      ctx.draft.pendingChoice = {
        type: "choose-target",
        playerId: ctx.playerId,
        sourceCardId: ctx.sourceCardId,
        effect,
        options: splitTargets,
        remaining: surplus,
        boundTargets: encoded,
        assign: true,
      } as RiftboundGameState["pendingChoice"];
      return;
    }
    // Rule 355.14.f/g: each chosen target takes its ≥1 mandatory point plus
    // any caster-assigned surplus; a lone target (no choice possible)
    // absorbs the whole surplus so all available damage is distributed.
    for (const targetId of splitTargets) {
      const priorDamage =
        (
          ctx.cards.getCardMeta?.(targetId as CoreCardId) as
            | Partial<RiftboundCardMeta>
            | undefined
        )?.damage ?? 0;
      const dmg = assigned[targetId] + surplus;
      surplus = 0;
      ctx.counters.addCounter(targetId as CoreCardId, "damage", dmg);
      ctx.cards.updateCardMeta?.(
        targetId as CoreCardId,
        { damage: priorDamage + dmg } as unknown as Record<string, unknown>,
      );
    }
    return;
  }
  const rawAmount = effect.amount ?? 1;
  const amount =
    typeof rawAmount === "number"
      ? rawAmount
      : resolveAmount(rawAmount as Record<string, unknown>, ctx);
  const targets = getTargetIds(effect, ctx);
  for (const targetId of targets) {
    // Check for "take-damage" replacement effects
    const owner = ctx.cards.getCardOwner(targetId as CoreCardId) ?? "";
    const replacementCtx = {
      cards: {
        getCardMeta: ctx.cards.getCardMeta ?? (() => undefined),
        getCardOwner: ctx.cards.getCardOwner,
      },
      draft: ctx.draft,
      zones: { getCardsInZone: ctx.zones.getCardsInZone },
    };
    const replacement = checkReplacement(
      { amount, cardId: targetId, owner, type: "take-damage" },
      replacementCtx as Parameters<typeof checkReplacement>[1],
    );
    if (replacement) {
      // Damage was replaced (e.g., "prevent" or alternative effect)
      if (replacement.replacement !== "prevent" && replacement.replacement) {
        executeEffect(replacement.replacement as ExecutableEffect, ctx);
      }
      // Consume single-fire "next"-duration replacements so they don't
      // Re-trigger on subsequent damage events this turn.
      markReplacementConsumed(ctx.draft, replacement);
      continue;
    }
    // Mirror to meta.damage — state-based death checks (rule 520), the
    // end-of-turn clear, and the UI all read meta.damage, not the
    // __counters bag. Without this, spell/ability damage is invisible
    // and never kills a unit. Read the prior value BEFORE addCounter so
    // callers whose counter store aliases meta.damage don't double-apply.
    const priorDamage =
      (
        ctx.cards.getCardMeta?.(targetId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined
      )?.damage ?? 0;
    ctx.counters.addCounter(targetId as CoreCardId, "damage", amount);
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      {
        damage: priorDamage + amount,
      } as unknown as Record<string, unknown>,
    );
  }
}
