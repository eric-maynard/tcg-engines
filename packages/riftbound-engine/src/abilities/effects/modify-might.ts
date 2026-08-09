// Effect handler: "modify-might"
import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { type EffectHelpers, getTargetIds, getEffectiveMightInRole, resolveAmount } from "./_helpers";
import { applyMightModifierDelta } from "./might-modifier";

/**
 * rule-id: sfd-001-221 — "+N Might for each enemy unit THERE": the tally is
 * anchored at the AFFECTED unit's battlefield, not at the source's zone. A
 * spell resolves from the chain, so `location: "here"` has no anchor of its own.
 */
function countAnchoredAtTarget(amount: unknown): boolean {
  if (typeof amount !== "object" || amount === null || !("count" in amount)) {
    return false;
  }
  const location = (amount as { count?: { location?: string } }).count?.location;
  return location === "here" || location === "same";
}

/**
 * rule-id: ven-069-166 (Mel, Newly Awakened) — "If a spell or ability you control
 * would give -[Might] to a unit it chooses, it gives an additional -1 [Might]."
 * The bonus penalty is added BEFORE the effect's own "to a minimum of N" floor,
 * so that clamp still governs the total. Only boards controlled by the player
 * resolving the effect are scanned, and `while-empowered` statics count only
 * while their host is Empowered right now (827).
 */
function additionalMightReduction(ctx: EffectContext): number {
  const registry = getGlobalCardRegistry();
  const candidates: string[] = [
    ...Object.keys(ctx.draft.players).flatMap((p) => [
      ...ctx.zones.getCardsInZone("base" as CoreZoneId, p as CorePlayerId),
      ...ctx.zones.getCardsInZone("legendZone" as CoreZoneId, p as CorePlayerId),
    ]),
    ...Object.keys(ctx.draft.battlefields ?? {}).flatMap((bf) =>
      ctx.zones.getCardsInZone(`battlefield-${bf}` as CoreZoneId),
    ),
  ].map((id) => id as string);
  let extra = 0;
  for (const cardId of candidates) {
    const controller = ctx.cards.getCardController?.(cardId as CoreCardId) ?? ctx.cards.getCardOwner(cardId as CoreCardId);
    if (controller !== ctx.playerId) {
      continue;
    }
    for (const ability of registry.getAbilities(cardId) ?? []) {
      const a = ability as {
        type?: string;
        condition?: { type?: string };
        effect?: { type?: string; amount?: number; controller?: string };
      };
      if (a.type !== "static" || a.effect?.type !== "additional-might-reduction") {
        continue;
      }
      if (a.effect.controller === "friendly" && controller !== ctx.playerId) {
        continue;
      }
      if (a.condition?.type === "while-empowered") {
        const meta = ctx.cards.getCardMeta?.(cardId as CoreCardId) as { empowered?: boolean } | undefined;
        if (meta?.empowered !== true) {
          continue;
        }
      }
      extra += typeof a.effect.amount === "number" ? a.effect.amount : 1;
    }
  }
  return extra;
}

/** Only a penalty handed to a unit the effect CHOOSES is boosted — not a board-wide sweep. */
function isChosenUnitTarget(effect: ExecutableEffect): boolean {
  const target = effect.target as { type?: string; quantity?: unknown } | undefined;
  if (target === undefined || typeof target !== "object") {
    return false;
  }
  return target.type === "unit" && target.quantity !== "all";
}

export function handle_modifyMight(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // rule 355.10 (sfd-163-221) — "give +[Might] … to ANOTHER friendly unit" is a
  // resolution-time choice by the controller: it is not the spell's declared
  // target (that slot named the victim), so ask when several units qualify.
  if ((effect as { chooseTarget?: boolean }).chooseTarget === true && !ctx.draft.pendingChoice) {
    const target = effect.target as Record<string, unknown>;
    // The pool is every legal candidate, not the resolver's default single pick.
    const options = getTargetIds({ ...effect, target: { ...target, quantity: "all" } }, ctx);
    if (options.length > 1) {
      ctx.draft.pendingChoice = {
        // The re-run binds exactly the picked id, so the "another" exclusion
        // (which re-scans the board) must not drop it again.
        effect: { ...effect, chooseTarget: false, target: { ...target, excludeBound: false } },
        options,
        playerId: ctx.playerId,
        remaining: 1,
        sourceCardId: ctx.sourceCardId,
        type: "choose-target",
      } as typeof ctx.draft.pendingChoice;
      return;
    }
  }
  const targets = getTargetIds(effect, ctx);
  const perTargetCount = countAnchoredAtTarget(effect.amount);
  const baseAmount = perTargetCount ? 0 : resolveAmount(effect.amount ?? 0, ctx);
  const minimum = (effect as { minimum?: number }).minimum;
  // rule-id: ven-069-166 — boost only applies to a penalty aimed at a chosen unit.
  const extraReduction =
    isChosenUnitTarget(effect) && (perTargetCount || baseAmount < 0) ? additionalMightReduction(ctx) : 0;
  for (const targetId of targets) {
    const amountCtx = perTargetCount
      ? {
          ...ctx,
          sameZone: ctx.zones.getCardZone(targetId as CoreCardId) ?? ctx.sameZone,
          sourceZone: ctx.zones.getCardZone(targetId as CoreCardId) ?? ctx.sourceZone,
        }
      : ctx;
    const resolvedAmount = perTargetCount
      ? resolveAmount(effect.amount ?? 0, amountCtx)
      : baseAmount;
    // rule 807.1.c — the floor is measured against CURRENT Might, which
    // includes Assault while attacking / Shield while defending.
    const mightBefore = getEffectiveMightInRole(targetId, ctx);
    // rule-id: ogn-097-298 — "to a minimum of N Might": a penalty can't
    // reduce the unit's Might below the floor (and never raises it).
    let amount = resolvedAmount < 0 ? resolvedAmount - extraReduction : resolvedAmount;
    if (typeof minimum === "number" && amount < 0) {
      amount = Math.max(amount, Math.min(0, minimum - mightBefore));
    }
    // rules 366-372 (ven-181-166 Gangplank, Naval) — a Might DECREASE handed
    // out by a spell or ability can be replaced; the shared write path is the
    // only one that consults "might-decrease" replacements.
    applyMightModifierDelta(targetId, amount, ctx);
  }
}
