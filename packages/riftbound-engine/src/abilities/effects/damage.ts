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
import { type EffectHelpers, getTargetIds, getEffectiveMight, resolveAmount } from "./_helpers";

/** rule 417.6.a / 417.6.b.2 — the resolving spell or ability (and its controller) is the source. */
function damageSourceOf(ctx: EffectContext): DamageSource {
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
  opts?: { noSourceBonus?: boolean },
): { dealtTo: string[]; suspended: boolean } {
  const source = damageSourceOf(ctx);
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

export function handle_damage(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  const executeEffect = h.executeEffect;
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
    const splitHits: { targetId: string; amount: number }[] = [];
    for (const targetId of splitTargets) {
      splitHits.push({ amount: assigned[targetId] + surplus, targetId });
      surplus = 0;
    }
    dealHits(effect, ctx, splitHits, ctx.boundTargets, { noSourceBonus: true });
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
  // action ("Deal 2 to a unit. ITS controller may …") runs once the damage has
  // actually been dealt, with the damaged units bound as its referent. Damage
  // that was fully prevented never happened, so the rider never runs.
  const then = (effect as { then?: ExecutableEffect }).then;
  if (then !== undefined && dealtTo.length > 0 && !ctx.draft.pendingChoice) {
    executeEffect(then, { ...ctx, boundTargets: dealtTo });
  }
}
