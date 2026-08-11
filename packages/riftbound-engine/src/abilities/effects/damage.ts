// Effect handler: "damage"
import type { CardId as CoreCardId } from "@tcg/core";
import type { RiftboundGameState } from "../../types";
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import {
  type DamagePreview,
  type DamageRequest,
  type DamageSource,
  dealDamageBatch,
} from "../../operations/deal-damage";
import { getBonusDamage } from "../bonus-damage";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { legalBoundIds } from "../target-slots";
import {
  type EffectHelpers,
  getTargetIds,
  getEffectiveMight,
  resolveAmount,
} from "./_helpers";

/**
 * rule 417.6.b.3 — when the instruction names a UNIT as the dealer ("It deals
 * damage equal to its Might"), that unit is the source, not the spell/ability.
 * The named unit is exactly the `amount.might` referent: the sequence's pending
 * value ("It" = the unit an earlier step acted on) or the caster-chosen
 * reference locked at boundTargets[0] (see `_helpers.resolveAmount`).
 */
function mightReferenceUnit(effect: ExecutableEffect, ctx: EffectContext): string | undefined {
  // rule 417.6.b.2 (rule-id: ogn-250-298 Stormbringer) — "Deal damage equal to
  // ITS Might" has no unit subject: the referenced unit only supplies the
  // NUMBER, the resolving spell/ability is still the source (and so the damage
  // is spell/ability damage for prevention). `dealer: "source"` marks that
  // phrasing apart from "IT deals damage equal to its Might" (417.6.b.3).
  if ((effect as unknown as { dealer?: string }).dealer === "source") {
    return undefined;
  }
  const raw = (effect.amount as { might?: unknown } | undefined)?.might;
  const pending = (ctx as { pendingSequenceValue?: readonly string[] }).pendingSequenceValue?.[0];
  if (raw === "pending-value") {
    return pending;
  }
  if (typeof raw === "object" && raw !== null) {
    return pending ?? ctx.boundTargets?.[0];
  }
  return undefined;
}

/**
 * rule 417.6.a / 417.6.b.2 — the resolving spell or ability (and its
 * controller) is the source; rule 417.6.b.3 / 417.6.b.4 — unless the effect
 * names a unit as the dealer, in which case that unit is the source and its
 * controller is the responsible player.
 */
function damageSourceOf(ctx: EffectContext, unitId?: string): DamageSource {
  if (unitId !== undefined) {
    return {
      cardId: unitId,
      kind: "unit",
      player:
        (ctx.cards.getCardController?.(unitId as CoreCardId) as string | undefined) ??
        (ctx.cards.getCardOwner(unitId as CoreCardId) as string | undefined) ??
        ctx.playerId,
    };
  }
  return {
    cardId: ctx.sourceCardId,
    kind: getGlobalCardRegistry().getCardType(ctx.sourceCardId) === "spell" ? "spell" : "ability",
    player: ctx.playerId,
  };
}

/**
 * rule 372 — park the "order your damage replacements" question for the
 * damaged unit's controller; the answer re-executes this effect with the same
 * bound targets (`pending-choice.ts` resume `damage-order`). Only when no
 * other prompt is open — otherwise the deterministic order stands.
 */
function parkDamageOrderPrompt(effect: ExecutableEffect, ctx: EffectContext, boundTargets: readonly string[] | undefined) {
  return (preview: DamagePreview): boolean => {
    if (ctx.draft.pendingChoice !== undefined || !preview.needsOrder) {
      return false;
    }
    ctx.draft.pendingChoice = {
      items: preview.needsOrder.items,
      playerId: preview.needsOrder.chooser,
      prompt: "Order the replacement effects that apply to this damage (first = applied first)",
      resume: {
        ...(boundTargets ? { boundTargets: [...boundTargets] } : {}),
        effect,
        kind: "damage-order",
        playerId: ctx.playerId,
        sourceCardId: ctx.sourceCardId,
        targetCardId: preview.target,
      },
      sourceCardId: preview.target,
      suspendsSequence: true,
      type: "order",
    } as unknown as RiftboundGameState["pendingChoice"];
    return true;
  };
}

/** Deal every hit of one Deal instruction as one simultaneous batch (417.1.d). */
function dealHits(
  effect: ExecutableEffect,
  ctx: EffectContext,
  hits: readonly { targetId: string; amount: number }[],
  boundTargets: readonly string[] | undefined,
  opts?: { noSourceBonus?: boolean; sourceUnitId?: string },
): { dealtTo: string[]; suspended: boolean } {
  const source = damageSourceOf(ctx, opts?.sourceUnitId ?? mightReferenceUnit(effect, ctx));
  const requests: DamageRequest[] = hits.map((h) => ({
    amount: h.amount,
    source,
    target: h.targetId,
    ...(opts?.noSourceBonus === true ? { noSourceBonus: true } : {}),
  }));
  const { results, suspended } = dealDamageBatch(ctx, requests, {
    onNeedsOrder: parkDamageOrderPrompt(effect, ctx, boundTargets),
  });
  const dealtTo: string[] = [];
  for (const r of results) {
    noteLethalDamage(ctx, r.target, r.total, r.dealt);
    if (r.dealt > 0) {
      dealtTo.push(r.target);
    }
  }
  return { dealtTo, suspended };
}

/**
 * rule 359.3.f.2 / 428.5 (unl-192-219 Alpha Strike) — "Then for each unit this
 * kills, do this": the units killed by this damage are gone from the board by
 * the time the reflexive clause resolves, so a lethal instance is recorded on
 * the resolving source as it is dealt. Only the instance that CROSSES the
 * lethal line counts, so a unit already marked lethal isn't credited twice.
 */
function noteLethalDamage(ctx: EffectContext, targetId: string, total: number, dealt: number): void {
  if (dealt <= 0) {
    return;
  }
  const might = getEffectiveMight(targetId, ctx);
  if (might <= 0 || total < might || total - dealt >= might) {
    return;
  }
  // rule 373 / 370.1.a.1 — whether a replacement actually replaces THIS death
  // is not known yet: a single-use shield facing several simultaneous deaths
  // saves exactly one, and which one is its controller's choice at the Cleanup.
  // So every lethal crossing is recorded here and the per-kill item queued from
  // this ledger carries a `this-kills-target` re-check (`for-each.ts`), which
  // reads the board once the Cleanup has settled who really died.
  const ledger = (ctx.draft.effectKills ??= {});
  const list = (ledger[ctx.sourceCardId] ??= []);
  if (!list.includes(targetId)) {
    list.push(targetId);
  }
}

/**
 * rule 355.11.b (rule-id: sfd-080-221 Bellows Breath) — "units at the same
 * location" is a GROUP requirement on the chosen targets, not a per-target one.
 * If the group no longer shares one location as the effect resolves (something
 * moved in response), its controller chooses a SUBSET of the ORIGINAL targets
 * that does, and only that subset is affected — never a unit that was not
 * chosen. Raises a `pick-many {semantics:"subset"}` whose answer re-enters this
 * handler with the subset bound. Returns true when the prompt was parked.
 */
function raiseSameLocationSubsetRepick(
  effect: ExecutableEffect,
  ctx: EffectContext,
  targets: readonly string[],
): boolean {
  const location = (effect.target as { location?: string } | undefined)?.location;
  if (
    (location !== "here" && location !== "same") ||
    targets.length < 2 ||
    ctx.draft.pendingChoice !== undefined ||
    (effect as { _subsetChecked?: boolean })._subsetChecked === true
  ) {
    return false;
  }
  const zones = new Set(targets.map((id) => ctx.zones.getCardZone(id as CoreCardId)));
  if (zones.size <= 1) {
    return false;
  }
  ctx.draft.pendingChoice = {
    constraint: { sameLocation: true },
    max: targets.length,
    min: 0,
    options: targets.map((id) => ({ cardId: id, key: id })),
    playerId: ctx.playerId,
    prompt: "Choose original targets at one location to affect",
    resume: {
      effect: { ...effect, _subsetChecked: true },
      kind: "subset-repick",
      playerId: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
    },
    semantics: "subset",
    sourceCardId: ctx.sourceCardId,
    type: "pick-many",
  } as RiftboundGameState["pendingChoice"];
  return true;
}

/**
 * rule 355.14.e–h — a split whose TARGETS were locked when the ability was
 * finalized (`_bound` on the node, 355.14.b — see `target-slots.ts`). At
 * resolution: recipients = the bound targets still legal (359.3.e.5 — a unit no
 * longer "here", or protected again, is unaffected; nobody is added, 355.15);
 * none left ⇒ the instruction does nothing (359.3.e.7); the amount is the pool
 * available NOW (a Might pumped in response, Bonus Damage once — 715.3); one
 * recipient takes it all; otherwise the controller divides it in ONE
 * `distribute` answer — each recipient ≥ 1 (355.14.f/g), or, with more
 * recipients than damage, exactly `n` of them 1 each (355.14.h.1). The answer
 * re-enters here as `boundTargets` = one occurrence per point of damage.
 * Returns true when the split was handled (dealt, parked, or nothing to do).
 */
function resolveBoundSplit(effect: ExecutableEffect, ctx: EffectContext): boolean {
  const legal = legalBoundIds(effect, ctx);
  if (legal === undefined) {
    return false;
  }
  const base = Math.max(0, resolveAmount(effect.amount ?? 0, ctx));
  const n = base > 0 ? base + getBonusDamage(ctx) : 0;
  if (n <= 0 || legal.length === 0) {
    return true;
  }
  const exactTargets = Math.min(legal.length, n);
  // Every recipient ≥ 1 while the damage covers them all; with more recipients
  // than damage (355.14.h) `n` of them take exactly 1 and the rest take none.
  const minPer = legal.length <= n ? 1 : 0;
  const maxPer = legal.length <= n ? n - (legal.length - 1) : 1;
  // Re-entry with the controller's division (or a forced single line).
  const answered = ctx.boundTargets;
  if (answered !== undefined && answered.length > 0 && answered.every((id) => legal.includes(id))) {
    const assigned: Record<string, number> = {};
    for (const id of answered) {
      assigned[id] = (assigned[id] ?? 0) + 1;
    }
    const ids = Object.keys(assigned);
    const total = Object.values(assigned).reduce((a, b) => a + b, 0);
    const valid =
      total === n &&
      ids.length === exactTargets &&
      ids.every((id) => (assigned[id] as number) >= Math.max(1, minPer) && (assigned[id] as number) <= maxPer);
    if (valid) {
      dealHits(
        effect,
        ctx,
        ids.map((targetId) => ({ amount: assigned[targetId] as number, targetId })),
        answered,
        { noSourceBonus: true },
      );
      return true;
    }
  }
  if (legal.length === 1) {
    dealHits(effect, ctx, [{ amount: n, targetId: legal[0] as string }], [legal[0] as string], {
      noSourceBonus: true,
    });
    return true;
  }
  if (ctx.draft.pendingChoice !== undefined) {
    return true;
  }
  ctx.draft.pendingChoice = {
    assign: true,
    effect,
    exactTargets,
    maxPer,
    minPer,
    options: legal,
    playerId: ctx.playerId,
    remaining: n,
    sourceCardId: ctx.sourceCardId,
    // rule 359.3.f — "here" as this resolution reads it must survive the prompt.
    ...(typeof ctx.sourceZone === "string" ? { sourceZone: ctx.sourceZone } : {}),
    targetsPreChosen: true,
    total: n,
    type: "choose-target",
  } as RiftboundGameState["pendingChoice"];
  return true;
}

export function handle_damage(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  const executeEffect = h.executeEffect;
  // rule 355.14.b/e — split targets locked at finalization: only the division
  // among the still-legal ones happens now.
  if ((effect as { split?: boolean }).split === true && resolveBoundSplit(effect, ctx)) {
    return;
  }
  // rule 417 / 437 / 715 / 372 — every hit below is dealt through the damage
  // choke point (`operations/deal-damage.ts`): Bonus Damage, the global
  // "prevent all spell and ability damage", Double / Prevent shields and their
  // ordering, immunity, kill attribution, "when it takes damage" effects and
  // the `take-damage` event all live there.
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
    // rule 715.3 — Bonus Damage is added ONCE to the amount being split (the
    // CR's own Volibear + Annie example: "6 damage split among up to 6 units"),
    // never once per chosen target. The pool grows here and each hit is dealt
    // with `noSourceBonus` so the choke point does not add it again.
    const splitBase = Math.max(
      0,
      refId ? getEffectiveMight(refId, ctx) : resolveAmount(effect.amount ?? 0, ctx),
    );
    const n = splitBase > 0 ? splitBase + getBonusDamage(ctx) : 0;
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
    // rule 355.14.c (unl-192-219): choosing ZERO split targets is legal, so
    // bound targets carrying only the reference unit are a deliberate empty
    // choice — never a cue to fall back to "every legal enemy".
    if (ctx.boundTargets) {
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
    // Rule 355.14.e/f/g (unl-192-219): with damage left over after every
    // locked recipient's mandatory point, the controller DIVIDES the whole
    // pool at resolution in ONE `distribute` answer — each recipient ≥ 1,
    // summing to the pool (the same prompt a finalization-bound split uses,
    // `resolveBoundSplit`). The answer re-enters here as one boundTargets
    // occurrence per point, behind the reference unit when there is one.
    if (surplus > 0 && splitTargets.length > 1 && (refId !== undefined || !hasRef)) {
      ctx.draft.pendingChoice = {
        type: "choose-target",
        playerId: ctx.playerId,
        sourceCardId: ctx.sourceCardId,
        effect,
        options: splitTargets,
        remaining: n,
        assign: true,
        total: n,
        minPer: 1,
        maxPer: n - (splitTargets.length - 1),
        exactTargets: splitTargets.length,
        // rule 355.14.b — the recipients were chosen (and paid for) at finalization.
        targetsPreChosen: true,
        ...(refId !== undefined ? { boundPrefix: [refId] } : {}),
        // rule 359.3.f — "here" as this resolution reads it must survive the prompt.
        ...(typeof ctx.sourceZone === "string" ? { sourceZone: ctx.sourceZone } : {}),
      } as RiftboundGameState["pendingChoice"];
      return;
    }
    // Rule 355.14.f/g: each chosen target takes its ≥1 mandatory point plus
    // any caster-assigned surplus; a lone target (no choice possible)
    // absorbs the whole surplus so all available damage is distributed.
    const splitHits: { targetId: string; amount: number }[] = [];
    for (const targetId of splitTargets) {
      splitHits.push({ amount: assigned[targetId] + surplus, targetId });
      surplus = 0;
    }
    dealHits(effect, ctx, splitHits, ctx.boundTargets, {
      noSourceBonus: true,
      // rule 417.6.b.3 — a Might-referencing split ("It deals damage equal to
      // its Might split among…") is dealt BY the reference unit.
      ...(hasRef && refId !== undefined ? { sourceUnitId: refId } : {}),
    });
    return;
  }
  const rawAmount = effect.amount ?? 1;
  const amount =
    typeof rawAmount === "number"
      ? rawAmount
      : resolveAmount(rawAmount as Record<string, unknown>, ctx);
  // rule 359.3.e.5 (unl-072-219) — the primary unit was pulled away in response:
  // only its instruction is illegal, so deal nothing to it and keep the splash.
  const splashOnly = (effect as { _splashOnly?: boolean })._splashOnly === true;
  const targets = splashOnly ? [] : getTargetIds(effect, ctx);
  if (raiseSameLocationSubsetRepick(effect, ctx, targets)) {
    return;
  }
  // rule 715.2 / 714: each instance is increased separately (inside the choke
  // point), by the dealer's own Bonus Damage plus any tied to the damaged
  // unit's location (Void Gate).
  const hits: { targetId: string; amount: number }[] = targets.map((targetId) => ({
    amount,
    targetId,
  }));
  // rule-id: unl-072-219 (Crescent Strike) — "Deal N to that unit and M to
  // each other enemy unit there": splash every OTHER enemy unit sharing the
  // chosen target's battlefield zone.
  const splashOthers = (effect as { splashOthers?: unknown }).splashOthers;
  if (typeof splashOthers === "number" && splashOthers > 0) {
    // rule 359.3.e.5 / 359.3.e.8 (unl-072-219) — "there" is the battlefield the
    // spell was aimed at when it was played, not wherever the chosen unit
    // stands at resolution: pulling the chosen unit away in response
    // mistargets only IT, and the splash still lands on the units left behind.
    const zone =
      (effect as { _splashZone?: string })._splashZone ??
      (targets[0] === undefined ? undefined : ctx.zones.getCardZone(targets[0] as CoreCardId));
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
        hits.push({ amount: splashOthers, targetId: id });
      }
    }
  }
  const { dealtTo, suspended } = dealHits(effect, ctx, hits, ctx.boundTargets ?? (targets.length > 0 ? targets : undefined));
  if (suspended) {
    return;
  }
  // rule 417 / 715.4 (rule-id: unl-020-219) — a rider hanging off the Deal
  // action ("Deal 2 to a unit. ITS controller may …") refers to the unit the
  // Deal was aimed at, with the damaged units bound as its referent. rule 437.4
  // / 417.1.e.1: fully preventing the damage means none was dealt, but the
  // chosen unit is still the referent, so the rider still runs.
  const then = (effect as { then?: ExecutableEffect }).then;
  const riderTargets = dealtTo.length > 0 ? dealtTo : hits.map((h) => h.targetId);
  if (then !== undefined && riderTargets.length > 0 && !ctx.draft.pendingChoice) {
    // rule 715.1 / 317.2.c — an escalating rider counts the times the spell has
    // actually DEALT damage, so a fully prevented instance adds no pip.
    const riderEffect =
      dealtTo.length === 0 && (then as { escalate?: boolean }).escalate === true
        ? ({ ...then, escalate: false } as ExecutableEffect)
        : then;
    executeEffect(riderEffect, { ...ctx, boundTargets: riderTargets });
  }
}
