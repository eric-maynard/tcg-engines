// Effect handler: "damage"
import type { CardId as CoreCardId } from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState } from "../../types";
import { getBonusDamage } from "../bonus-damage";
import { checkReplacement, markReplacementConsumed } from "../replacement-effects";
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { unitIgnoresDamage } from "../../operations/damage-immunity";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds, getEffectiveMight, resolveAmount } from "./_helpers";

export function handle_damage(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  const executeEffect = h.executeEffect;
  // rule-id: ogn-145-298 — a global "Prevent all spell and ability damage"
  // (rule 437) installed in activeReplacements reduces every spell/ability
  // damage instance to 0. This handler only ever deals spell/ability damage
  // (combat damage is applied by the combat moves), so nothing is dealt.
  const activeRepl = ctx.draft.activeReplacements as
    | { replaces?: string; replacement?: unknown; global?: boolean; amount?: unknown; duration?: string }[]
    | undefined;
  const globalPreventIdx =
    activeRepl?.findIndex(
      (e) =>
        e?.replaces === "take-damage" &&
        e.replacement === "prevent" &&
        e.global === true &&
        e.amount === "all",
    ) ?? -1;
  if (activeRepl && globalPreventIdx >= 0) {
    if (activeRepl[globalPreventIdx]?.duration === "next") {
      activeRepl.splice(globalPreventIdx, 1);
    }
    return;
  }
  // rule 428.5.c / 428.5.d: stamp the dealer on the damaged unit so a lethal
  // cleanup kill is attributed to this effect's controller (spell vs ability
  // by the source card's type — a spell's reflexive trigger still counts as the spell).
  const damageAttribution: Partial<RiftboundCardMeta> = {
    lastDamagedBy: ctx.playerId,
    lastDamageSource:
      getGlobalCardRegistry().getCardType(ctx.sourceCardId) === "spell" ? "spell" : "ability",
  };
  // rule 715.1: Bonus Damage the controller of this spell/ability has
  // increases EACH instance of damage it deals.
  const bonusDamage = getBonusDamage(ctx);
  // rule-id: ogn-221-298 (Imperial Decree) — "When any unit takes damage this
  // turn, kill it": a turn-wide, unbound take-damage entry in
  // activeReplacements is a criteria reaction, not a per-unit choice. After a
  // unit actually takes (unprevented) damage, apply its nested effect to it.
  const reactAnyUnitDamaged = (targetId: string): void => {
    const list = ctx.draft.activeReplacements as
      | { replaces?: string; replacement?: unknown; duration?: string; targetCardIds?: string[] }[]
      | undefined;
    for (const e of list ?? []) {
      if (
        e?.replaces === "take-damage" &&
        e.duration === "turn" &&
        !e.targetCardIds &&
        e.replacement &&
        typeof e.replacement === "object"
      ) {
        executeEffect(e.replacement as ExecutableEffect, { ...ctx, boundTargets: [targetId] });
      }
    }
  };
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
    // rule 355.14 (ogn-041-298): a fixed amount ("deal 5 damage split among…")
    // has no reference unit — every bound target is a split target. Only a
    // Might-referencing amount carries its reference unit at boundTargets[0].
    const hasRef = typeof rawMight === "object" && rawMight !== null;
    const splitFrom = hasRef ? 1 : 0;
    let refId: string | undefined = hasRef ? ctx.boundTargets?.[0] : undefined;
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
    // rule 355.14.c/e/f (ogn-041-298): a fixed amount "split among any number
    // of <units>" with nothing bound yet is ONE controller decision — which
    // units and how much each (≥1, summing to N). Raised as a `total`
    // choose-target; the answer re-enters here encoded in boundTargets.
    if (!hasRef && !ctx.boundTargets) {
      if (n > 0 && legalPool.length > 0) {
        ctx.draft.pendingChoice = {
          type: "choose-target",
          playerId: ctx.playerId,
          sourceCardId: ctx.sourceCardId,
          effect,
          options: legalPool,
          remaining: n,
          assign: true,
          total: n,
        } as RiftboundGameState["pendingChoice"];
      }
      return;
    }
    // Rule 355.14.b/c / 355.15: split targets are caster-chosen at
    // finalization and travel in boundTargets after the reference unit
    // at index 0. Rule 359.3.e.2 drops any that became illegal.
    // Rule 355.14.e/f/g / 359.3.f.2: distribution is a RESOLUTION-time
    // caster choice — extra occurrences of a target id in boundTargets
    // encode surplus damage the caster has already assigned to it.
    let splitTargets: string[];
    const assigned: Record<string, number> = {};
    if (ctx.boundTargets && (hasRef ? ctx.boundTargets.length > 1 : true)) {
      splitTargets = ctx.boundTargets
        .slice(splitFrom)
        .filter((id) => legalPool.includes(id));
      for (const id of splitTargets) {
        assigned[id] = (assigned[id] ?? 0) + 1;
      }
      const uniqueTargets = Object.keys(assigned);
      // Rule 355.14.h / 355.14.h.1 (unl-192-219): if the reference unit's
      // resolution-time Might is now less than the chosen split-target
      // count, the controller drops exactly (count − Might) targets — no
      // more — so every remaining target can receive its mandatory ≥1.
      if (uniqueTargets.length > n) {
        ctx.draft.pendingChoice = {
          type: "choose-target",
          playerId: ctx.playerId,
          sourceCardId: ctx.sourceCardId,
          effect,
          options: uniqueTargets,
          remaining: uniqueTargets.length - n,
          boundTargets: refId !== undefined ? [refId, ...uniqueTargets] : uniqueTargets,
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
    if (surplus > 0 && splitTargets.length > 1 && (refId !== undefined || !hasRef)) {
      const encoded: string[] = refId !== undefined ? [refId] : [];
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
      // rule 465.2.c.10 (ogn-189-298) — never dealt damage.
      if (unitIgnoresDamage(targetId, ctx.draft)) {
        continue;
      }
      const priorDamage =
        (
          ctx.cards.getCardMeta?.(targetId as CoreCardId) as
            | Partial<RiftboundCardMeta>
            | undefined
        )?.damage ?? 0;
      const dmg = assigned[targetId] + surplus + bonusDamage;
      surplus = 0;
      ctx.counters.addCounter(targetId as CoreCardId, "damage", dmg);
      ctx.cards.updateCardMeta?.(
        targetId as CoreCardId,
        { damage: priorDamage + dmg, ...damageAttribution } as unknown as Record<string, unknown>,
      );
      if (dmg > 0) reactAnyUnitDamaged(targetId);
    }
    return;
  }
  const rawAmount = effect.amount ?? 1;
  const amount =
    typeof rawAmount === "number"
      ? rawAmount
      : resolveAmount(rawAmount as Record<string, unknown>, ctx);
  const targets = getTargetIds(effect, ctx);
  const hits: { targetId: string; amount: number }[] = targets.map((targetId) => ({
    amount: amount > 0 ? amount + bonusDamage : amount,
    targetId,
  }));
  // rule-id: unl-072-219 (Crescent Strike) — "Deal N to that unit and M to
  // each other enemy unit there": splash every OTHER enemy unit sharing the
  // chosen target's battlefield zone.
  const splashOthers = (effect as { splashOthers?: unknown }).splashOthers;
  if (typeof splashOthers === "number" && splashOthers > 0 && targets.length > 0) {
    const zone = ctx.zones.getCardZone(targets[0] as CoreCardId);
    if (zone?.startsWith("battlefield-")) {
      const others = resolveTarget(
        { controller: "enemy", quantity: "all", type: "unit" },
        {
          cards: ctx.cards,
          draft: ctx.draft,
          playerId: ctx.playerId,
          sourceCardId: ctx.sourceCardId,
          sourceZone: ctx.sourceZone,
          zones: ctx.zones,
        },
      ).filter(
        (id) => !targets.includes(id) && ctx.zones.getCardZone(id as CoreCardId) === zone,
      );
      for (const id of others) {
        hits.push({ amount: splashOthers + bonusDamage, targetId: id });
      }
    }
  }
  for (const { targetId, amount } of hits) {
    // rule 465.2.c.10 (ogn-189-298) — a unit with an active "I don't take
    // damage" restriction is dealt nothing at all.
    if (unitIgnoresDamage(targetId, ctx.draft)) {
      continue;
    }
    // rule-id: ogn-254-298 — a runtime take-damage replacement bound to this
    // unit at play time ("Kill it the next time it takes damage") applies its
    // nested effect to that unit and, being single-fire, is spent.
    const boundRepl = ctx.draft.activeReplacements as
      | { replaces?: string; replacement?: unknown; duration?: string; targetCardIds?: string[] }[]
      | undefined;
    const boundIdx =
      boundRepl?.findIndex(
        (e) => e?.replaces === "take-damage" && e.targetCardIds?.includes(targetId) === true,
      ) ?? -1;
    if (boundRepl && boundIdx >= 0) {
      const entry = boundRepl[boundIdx];
      if (entry?.duration === "next") {
        boundRepl.splice(boundIdx, 1);
      }
      if (entry?.replacement && entry.replacement !== "prevent") {
        executeEffect(entry.replacement as ExecutableEffect, { ...ctx, boundTargets: [targetId] });
      }
      continue;
    }
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
    const priorMeta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
      | (Partial<RiftboundCardMeta> & { damagePreventionShield?: number })
      | undefined;
    const priorDamage = priorMeta?.damage ?? 0;
    // rule 437.4 / 437.7: a "prevent the next N damage" shield absorbs this
    // damage first and is spent by the amount it absorbs.
    const shield = Math.max(0, priorMeta?.damagePreventionShield ?? 0);
    const prevented = amount > 0 ? Math.min(shield, amount) : 0;
    if (prevented > 0) {
      ctx.cards.updateCardMeta?.(targetId as CoreCardId, {
        damagePreventionShield: shield - prevented,
      } as unknown as Record<string, unknown>);
    }
    const dealt = amount - prevented;
    if (prevented > 0 && dealt <= 0) {
      continue;
    }
    ctx.counters.addCounter(targetId as CoreCardId, "damage", dealt);
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      {
        damage: priorDamage + dealt,
        ...damageAttribution,
      } as unknown as Record<string, unknown>,
    );
    if (dealt > 0) reactAnyUnitDamaged(targetId);
  }
}
