/**
 * Shared helpers for per-effect handler modules.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { TargetDescriptor } from "../target-resolver";
import { boundBattlefieldZone, resolveTarget } from "../target-resolver";
import type { EffectContext, ExecutableEffect } from "../effect-executor";

export interface EffectHelpers {
  readonly executeEffect: (effect: ExecutableEffect, ctx: EffectContext) => void;
  readonly getTargetIds: typeof getTargetIds;
  readonly getEffectiveMight: typeof getEffectiveMight;
  readonly resolveAmount: typeof resolveAmount;
  readonly checkBecomesMighty: typeof checkBecomesMighty;
  readonly evaluateEffectCondition: typeof evaluateEffectCondition;
  readonly tokenEntersReadyFromStaticGrant: typeof tokenEntersReadyFromStaticGrant;
}

export type EffectHandler = (
  effect: ExecutableEffect,
  ctx: EffectContext,
  h: EffectHelpers,
) => void;

/**
 * Resolve targets for an effect using the target resolver.
 */
export function getTargetIds(effect: ExecutableEffect, ctx: EffectContext): string[] {
  // rule-id: ogs-002-024 — "all enemy units at A battlefield": a bound
  // battlefield id names the chosen LOCATION, not the affected cards; resolve
  // the descriptor pinned to that battlefield's unit zone.
  const battlefieldZone = boundBattlefieldZone(effect.target, ctx.boundTargets, ctx.draft);
  // rule-id: ogn-056-298 — "me"/"this" always names the source, never a
  // chosen target threaded through an enclosing conditional/sequence.
  const tgt = effect.target as unknown;
  const isSelf = tgt === "self" || (typeof tgt === "object" && tgt !== null && (tgt as { type?: string }).type === "self");
  // rule-id: ogn-200-298 — "… and 1 to ALL OTHER enemy units here": the step
  // names every card the earlier chosen target did NOT, so it must re-resolve
  // from the board and drop the bound ids instead of inheriting them.
  const excludeBound =
    typeof tgt === "object" && tgt !== null && (tgt as { excludeBound?: boolean }).excludeBound === true;
  if (ctx.boundTargets && battlefieldZone === undefined && !isSelf && !excludeBound) {
    return [...ctx.boundTargets];
  }
  const resolved = resolveTarget(effect.target, {
    battlefieldZone,
    cards: ctx.cards,
    draft: ctx.draft,
    playerId: ctx.playerId,
    sameZone: ctx.sameZone,
    sourceCardId: ctx.sourceCardId,
    sourceZone: ctx.sourceZone,
    triggerSourceId: ctx.triggerSourceId,
    zones: ctx.zones,
  });
  return excludeBound && ctx.boundTargets
    ? resolved.filter((id) => !ctx.boundTargets?.includes(id))
    : resolved;
}

/** Mighty threshold — units with Might >= 5 are "Mighty" */
export const MIGHTY_THRESHOLD = 5;

/**
 * Calculate a unit's effective Might from its definition and metadata.
 */
export function getEffectiveMight(cardId: string, ctx: EffectContext): number {
  const registry = getGlobalCardRegistry();
  const def = registry.get(cardId);
  const baseMight = def?.might ?? 0;
  if (baseMight === 0) {
    return 0;
  } // Not a unit

  const meta = ctx.cards.getCardMeta?.(cardId as CoreCardId) as
    | Partial<RiftboundCardMeta>
    | undefined;
  const buffBonus = (meta?.buffed ? 1 : 0) + (meta?.extraBuffs ?? 0);
  const mightMod = meta?.mightModifier ?? 0;
  const staticBonus = meta?.staticMightBonus ?? 0;

  let equipBonus = 0;
  for (const equipId of meta?.equippedWith ?? []) {
    equipBonus += registry.getMightBonus(equipId);
  }

  return Math.max(0, baseMight + buffBonus + mightMod + staticBonus + equipBonus);
}

/**
 * Sum every instance of a numeric keyword on a card (rule 807.2, 807.3):
 * printed instances (flat `keywords` or `keyword` abilities) plus every granted
 * instance on meta. A valueless instance counts as 1 (rule 807.1.b.3).
 */
export function getKeywordTotalValue(cardId: string, keyword: string, ctx: EffectContext): number {
  const wanted = keyword.toLowerCase();
  const def = getGlobalCardRegistry().get(cardId);
  let total = 0;
  for (const ability of def?.abilities ?? []) {
    if (ability.type === "keyword" && (ability.keyword as string).toLowerCase() === wanted) {
      total += (ability as { value?: number }).value ?? 1;
    }
  }
  if (total === 0) {
    total += (def?.keywords ?? []).filter((k) => String(k).toLowerCase() === wanted).length;
  }
  const meta = ctx.cards.getCardMeta?.(cardId as CoreCardId) as
    | Partial<RiftboundCardMeta>
    | undefined;
  for (const granted of meta?.grantedKeywords ?? []) {
    if (String(granted.keyword).toLowerCase() === wanted) {
      total += granted.value ?? 1;
    }
  }
  return total;
}

/**
 * Resolve an AmountExpression to a numeric value.
 *
 * Handles dynamic amounts like "equal to this unit's Might",
 * "number of cards in hand", "number of cards in trash", or "count of matching targets".
 */
export function resolveAmount(
  amount: number | string | Record<string, unknown> | undefined | null,
  ctx: EffectContext,
): number {
  if (typeof amount === "number") {
    return amount;
  }
  if (amount == null) {
    return 0;
  }
  if (typeof amount === "string") {
    // Card parser emits amount:"all" for heal-all / prevent-all-damage effects.
    return amount === "all" ? Number.MAX_SAFE_INTEGER : 0;
  }

  // Handle AmountExpression objects
  if ("keywordValue" in amount) {
    return getKeywordTotalValue(ctx.sourceCardId, String(amount.keywordValue), ctx);
  }
  if ("might" in amount) {
    const mightRef = amount.might;
    if (mightRef === "self") {
      return getEffectiveMight(ctx.sourceCardId, ctx);
    }
    // rule-id: ogn-260-298 (rule 355.14.a) — "Ready a friendly unit. It deals
    // damage equal to ITS Might": "its" names the unit an EARLIER sequence step
    // acted on (the sequence's `pendingValue`), never this step's damage target.
    // rule 359.3.f.2 (sfd-163-221) — "+[Might] equal to ITS Might" after "Kill a
    // friendly unit": the victim's Might as it was killed, buffs included. The
    // kill step snapshots it (last-known information — the unit is gone now).
    if (mightRef === "killed") {
      return ctx.draft.lastKilledUnitMight ?? 0;
    }
    if (mightRef === "pending-value") {
      const pendingId = (ctx as { pendingSequenceValue?: readonly string[] })
        .pendingSequenceValue?.[0];
      return pendingId ? getEffectiveMight(pendingId, ctx) : 0;
    }
    // Rule 355.14.a: "damage equal to <a friendly unit>'s Might" — the amount
    // reference is a caster-chosen standard target. Prefer the bound choice
    // (locked at finalization per 355.15); otherwise fall back to the first
    // legal match so the expression never silently collapses to 0.
    if (typeof mightRef === "object" && mightRef !== null) {
      const pool = resolveTarget(
        { ...(mightRef as TargetDescriptor), quantity: "all" },
        {
          cards: ctx.cards,
          draft: ctx.draft,
          playerId: ctx.playerId,
          sourceCardId: ctx.sourceCardId,
          sourceZone: ctx.sourceZone,
          zones: ctx.zones,
        },
      );
      // rule-id: sfd-107-221 — the reference unit is locked at play time and
      // travels either as this sequence's pending value (when the step's own
      // bound target is the DAMAGED unit) or as the first bound target.
      const chosen =
        (ctx as { pendingSequenceValue?: readonly string[] }).pendingSequenceValue?.[0] ??
        ctx.boundTargets?.[0];
      // rule 359.3.e.12 / 359.3.f.2 — the Might is read on resolution: a
      // chosen reference that no longer matches the descriptor (it stopped
      // being equipped, left the board, …) has a null referent → no damage.
      if (chosen !== undefined) {
        return pool.includes(chosen) ? getEffectiveMight(chosen, ctx) : 0;
      }
      const refId = pool[0];
      return refId ? getEffectiveMight(refId, ctx) : 0;
    }
  }
  if ("cardsInHand" in amount) {
    const whose = amount.cardsInHand as string;
    const pid =
      whose === "opponent"
        ? (Object.keys(ctx.draft.players).find((p) => p !== ctx.playerId) ?? ctx.playerId)
        : ctx.playerId;
    return ctx.zones.getCardsInZone("hand" as CoreZoneId, pid as CorePlayerId).length;
  }
  if ("cardsInTrash" in amount) {
    const whose = amount.cardsInTrash as string;
    const pid =
      whose === "opponent"
        ? (Object.keys(ctx.draft.players).find((p) => p !== ctx.playerId) ?? ctx.playerId)
        : ctx.playerId;
    return ctx.zones.getCardsInZone("trash" as CoreZoneId, pid as CorePlayerId).length;
  }
  if ("count" in amount) {
    // Count matching targets
    const target = amount.count as TargetDescriptor;
    // rule-id: sfd-001-221 — "for each enemy unit there" is a tally, not a
    // choice: enumerate every match unless the descriptor pins its own quantity
    // (an unpinned descriptor otherwise defaults to the FIRST match, i.e. 1).
    const counted = resolveTarget(
      target?.quantity === undefined ? { ...target, quantity: "all" } : target,
      {
        cards: ctx.cards,
        draft: ctx.draft,
        playerId: ctx.playerId,
        sameZone: ctx.sameZone,
        sourceCardId: ctx.sourceCardId,
        sourceZone: ctx.sourceZone,
        zones: ctx.zones,
      },
    ).length;
    // "+2 Might for EACH enemy unit there": the count variant carries a
    // per-match multiplier (rule 466 — the amount is N × the tally).
    const multiplier = typeof amount.multiplier === "number" ? amount.multiplier : 1;
    return counted * multiplier;
  }
  if ("distinctTags" in amount) {
    // rule-id: unl-046-219 (Friendship) — "+1 for each of the following tags
    // among your units": count how many listed tags appear on at least one
    // matched unit (OR across tags, distinct), not units carrying every tag.
    const wanted = new Set((amount.distinctTags as readonly string[]).map((t) => t.toLowerCase()));
    const among = { ...(amount.among as TargetDescriptor), quantity: "all" as const };
    const ids = resolveTarget(among, {
      cards: ctx.cards,
      draft: ctx.draft,
      playerId: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
      sourceZone: ctx.sourceZone,
      zones: ctx.zones,
    });
    const registry = getGlobalCardRegistry();
    const present = new Set<string>();
    for (const id of ids) {
      const tags = (registry.get(id) as { tags?: readonly string[] } | undefined)?.tags ?? [];
      for (const t of tags) {
        const key = t.toLowerCase();
        if (wanted.has(key)) present.add(key);
      }
    }
    return present.size;
  }
  if ("revealTop" in amount) {
    // rule-id: ogn-121-298 (Teemo, Strategist) — reveal the top N of your Main
    // Deck, count cards with the keyword, then recycle every revealed card.
    const n = (amount.revealTop as number) ?? 0;
    const keyword = amount.withKeyword as string;
    const registry = getGlobalCardRegistry();
    const topN = ctx.zones
      .getCardsInZone("mainDeck" as CoreZoneId, ctx.playerId as CorePlayerId)
      .slice(0, n)
      .map((c) => c as string);
    const hits = topN.filter((id) => registry.hasKeyword(id, keyword)).length;
    if ((amount.then ?? "recycle") === "recycle") {
      for (const id of topN) {
        ctx.zones.moveCard({
          cardId: id as CoreCardId,
          position: "bottom",
          targetZoneId: "mainDeck" as CoreZoneId,
        });
      }
      // rule-id: ogn-235-298 — revealed cards were recycled to your Main Deck.
      if (topN.length > 0) {
        ctx.fireTriggers?.({ cardIds: topN, playerId: ctx.playerId, type: "recycle" });
      }
    }
    return hits;
  }
  if ("variable" in amount) {
    // Named variable bound at effect entry — e.g., X-cost spells
    // Store the chosen X value in ctx.variables.x and reference it here
    const name = amount.variable as string;
    return ctx.variables?.[name] ?? 0;
  }
  if ("cost" in amount) {
    const costRef = amount.cost as TargetDescriptor | string | undefined;
    const registry = getGlobalCardRegistry();
    // rule-id: sfd-206-221 (Riposte) — "+Might equal to that spell's Energy
    // cost": the referenced spell is the chain item directly beneath this one
    // (the counter target), which stays on the chain until it resolves/fizzles.
    if (costRef === "spell" || (typeof costRef === "object" && costRef?.type === "spell")) {
      // rule-id: ogn-064-298 (rule 425.1.a) — a countered spell is cleared
      // from the chain at once, so prefer the id the counter step recorded.
      if (ctx.draft.lastCounterTargetId) {
        return registry.getEnergyCost(ctx.draft.lastCounterTargetId);
      }
      const items = ctx.draft.interaction?.chain?.items ?? [];
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (item && item.cardId !== ctx.sourceCardId && item.type === "spell") {
          return registry.getEnergyCost(item.cardId);
        }
      }
      return 0;
    }
    // rule 206 / rule-id: ogn-008-298 (Get Excited!) — "Deal its Energy cost as
    // damage": "it" is the card the effect just acted on (the discarded card),
    // never the damage target bound on this context.
    if (typeof costRef === "object" && costRef?.type === "trigger-source") {
      return ctx.triggerSourceId ? registry.getEnergyCost(ctx.triggerSourceId) : 0;
    }
    if (typeof costRef === "object" && costRef !== null) {
      const refId =
        ctx.boundTargets?.[0] ??
        resolveTarget(costRef, {
          cards: ctx.cards,
          draft: ctx.draft,
          playerId: ctx.playerId,
          sourceCardId: ctx.sourceCardId,
          sourceZone: ctx.sourceZone,
          zones: ctx.zones,
        })[0];
      return refId ? registry.getEnergyCost(refId) : 0;
    }
    return 0;
  }
  return 0;
}

/**
 * Check if a Might change crosses the Mighty threshold upward,
 * and fire the "become-mighty" trigger if so.
 * Returns true if the trigger fired.
 */
export function checkBecomesMighty(cardId: string, mightBefore: number, ctx: EffectContext): boolean {
  const mightAfter = getEffectiveMight(cardId, ctx);
  if (mightBefore < MIGHTY_THRESHOLD && mightAfter >= MIGHTY_THRESHOLD) {
    // Fire become-mighty trigger if fireTriggers is available
    if (ctx.fireTriggers) {
      const owner = ctx.cards.getCardOwner(cardId as CoreCardId) ?? "";
      ctx.fireTriggers({ cardId, owner, type: "become-mighty" });
    }
    return true;
  }
  return false;
}

/**
 * Evaluate a condition for conditional effects.
 */
export function evaluateEffectCondition(
  condition: Record<string, unknown>,
  ctx: EffectContext,
): boolean {
  const condType = condition.type as string;
  switch (condType) {
    // rule 430.3 — "If you couldn't channel N runes this way": true when the
    // most recent channel effect moved fewer than N runes (empty Rune Deck).
    case "channeled-fewer-than": {
      const wanted = (condition.amount as number) ?? 1;
      const channeled =
        (ctx.draft as { lastChanneledCount?: Record<string, number> }).lastChanneledCount?.[
          ctx.playerId
        ] ?? 0;
      return channeled < wanted;
    }
    case "has-xp": {
      const threshold = (condition.threshold as number) ?? 1;
      const player = ctx.draft.players[ctx.playerId];
      return (player?.xp ?? 0) >= threshold;
    }
    case "controls-unit": {
      const baseCards = ctx.zones.getCardsInZone(
        "base" as CoreZoneId,
        ctx.playerId as CorePlayerId,
      );
      return baseCards.length > 0;
    }
    case "score-within": {
      const range = (condition.range as number) ?? 0;
      const { victoryScore } = ctx.draft;
      for (const pid of Object.keys(ctx.draft.players)) {
        if (pid !== ctx.playerId) {
          const score = ctx.draft.players[pid]?.victoryPoints ?? 0;
          if (Math.abs(victoryScore - score) <= range) {
            return true;
          }
        }
      }
      return false;
    }
    case "count": {
      const target = condition.target as TargetDescriptor | undefined;
      const cmp = condition.comparison as
        | { lte?: number; gte?: number; eq?: number }
        | undefined;
      let n: number;
      if (target && (target as { type?: string }).type === "rune") {
        n = ctx.zones.getCardsInZone("runePool" as CoreZoneId, ctx.playerId as CorePlayerId)
          .length;
      } else if (target && (target as { location?: string }).location === "hand") {
        // rule-id: ogn-251-298 (Loose Cannon) / rule 383.2.a.1 — hand is not a
        // board zone, so resolveTarget can't count it; count the zone directly.
        const controller = (target as { controller?: string }).controller;
        const pids =
          controller === "enemy"
            ? Object.keys(ctx.draft.players).filter((p) => p !== ctx.playerId)
            : [ctx.playerId];
        n = pids.reduce(
          (sum, pid) =>
            sum + ctx.zones.getCardsInZone("hand" as CoreZoneId, pid as CorePlayerId).length,
          0,
        );
      } else if (target && (target as { location?: string }).location === "facedown") {
        // rule-id: unl-014-219 (rule 811.1) — a facedown card is a board object
        // its hider controls, but it lives in `facedown-<bf>`, a zone kept out
        // of getBoardCardIds so hidden cards are never ordinary targets; count
        // those zones directly.
        const controller = (target as { controller?: string }).controller;
        const pids =
          controller === "enemy"
            ? Object.keys(ctx.draft.players).filter((p) => p !== ctx.playerId)
            : [ctx.playerId];
        n = 0;
        for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
          for (const id of ctx.zones.getCardsInZone(`facedown-${bfId}` as CoreZoneId)) {
            const owner =
              ctx.cards.getCardController?.(id as CoreCardId) ??
              ctx.cards.getCardOwner(id as CoreCardId) ??
              "";
            if (pids.includes(owner)) {
              n += 1;
            }
          }
        }
      } else {
        n = resolveTarget({ quantity: "all", ...target } as TargetDescriptor, {
          cards: ctx.cards,
          draft: ctx.draft,
          playerId: ctx.playerId,
          // rule-id: ven-148-166 — "if you have exactly two units THERE" counts
          // at the anchored location, so `location: "same"` needs the anchor.
          sameZone: ctx.sameZone,
          sourceCardId: ctx.sourceCardId,
          sourceZone: ctx.sourceZone,
          zones: ctx.zones,
        }).length;
      }
      if (cmp?.lte !== undefined && n > cmp.lte) return false;
      if (cmp?.gte !== undefined && n < cmp.gte) return false;
      if (cmp?.eq !== undefined && n !== cmp.eq) return false;
      return true;
    }
    case "target-controller": {
      const want = condition.controller as "friendly" | "enemy" | undefined;
      const bound = ctx.boundTargets?.[0];
      if (!bound) return false;
      // rule 740.1.a (sfd-162-221) — "friendly"/"enemy" is about CONTROL, not
      // ownership: a unit I control but do not own is friendly to me.
      const controller =
        ctx.cards.getCardController?.(bound as CoreCardId) ??
        ctx.cards.getCardOwner(bound as CoreCardId) ??
        "";
      return want === "friendly" ? controller === ctx.playerId : controller !== ctx.playerId;
    }
    case "while-alone": {
      // rule-id: ogn-046-298 — "if it is the only unit you control there": the
      // subject is the chosen (bound) target when the condition names a
      // target, else the source; count units its controller controls in the
      // same location (base or battlefield).
      const subject = condition.target ? ctx.boundTargets?.[0] : ctx.sourceCardId;
      if (!subject) return false;
      const zone = ctx.zones.getCardZone(subject as CoreCardId) as string | undefined;
      if (!zone || !(zone === "base" || zone.startsWith("battlefield-"))) return false;
      const controllerOf = (id: string) =>
        ctx.cards.getCardController?.(id as CoreCardId) ?? ctx.cards.getCardOwner(id as CoreCardId) ?? "";
      const controller = controllerOf(subject);
      const registry = getGlobalCardRegistry();
      const here =
        zone === "base"
          ? ctx.zones.getCardsInZone("base" as CoreZoneId, controller as CorePlayerId)
          : ctx.zones.getCardsInZone(zone as CoreZoneId);
      const units = here.filter(
        (id) => registry.getCardType(id as string) === "unit" && controllerOf(id as string) === controller,
      );
      return units.length === 1;
    }
    case "target-attacking": {
      // rule-id: sfd-017-221 — "If it's attacking" inspects the chosen
      // (bound) target's combat role, not the source card.
      const bound = ctx.boundTargets?.[0];
      if (!bound) return false;
      const meta = ctx.cards.getCardMeta?.(bound as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      return meta?.combatRole === "attacker";
    }
    case "target-stunned": {
      // rule 423 (ogn-225-298) — "choose an enemy unit. If it is stunned, kill
      // it": the subject is the chosen (bound) target, not the source.
      const bound = ctx.boundTargets?.[0];
      if (!bound) return false;
      const meta = ctx.cards.getCardMeta?.(bound as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      return meta?.stunned === true;
    }
    case "target-might": {
      // rule 355.9.a.1 (ven-127-166 Lacerate) — "Choose a unit … Then kill it
      // if it has 3 Might or less": the Might test is a RESOLUTION check on
      // the chosen (bound) target, not part of the target description.
      const bound = ctx.boundTargets?.[0];
      if (!bound) return false;
      const cmp = condition.comparison as
        | { lte?: number; gte?: number; eq?: number }
        | undefined;
      const might = getEffectiveMight(bound, ctx);
      if (cmp?.lte !== undefined && might > cmp.lte) return false;
      if (cmp?.gte !== undefined && might < cmp.gte) return false;
      if (cmp?.eq !== undefined && might !== cmp.eq) return false;
      return true;
    }
    // rule 359.3.e.14.b (sfd-163-221) — "Kill a friendly unit. IF YOU DO, …":
    // the linked instruction happens only when a unit actually died; with no
    // comparison this is exactly the "a kill happened" test.
    case "killed-a-unit":
    // falls through
    case "killed-might": {
      // rule-id: unl-186-219 — "Kill a unit… Then, if it had N [Might] or
      // less": compares the last-known Might snapshotted by the `kill` step.
      const might = ctx.draft.lastKilledUnitMight;
      if (might === undefined) return false;
      const cmp = condition.comparison as { lte?: number; gte?: number; eq?: number } | undefined;
      if (cmp?.lte !== undefined && might > cmp.lte) return false;
      if (cmp?.gte !== undefined && might < cmp.gte) return false;
      if (cmp?.eq !== undefined && might !== cmp.eq) return false;
      return true;
    }
    case "this-kills-target": {
      // rule-id: ogn-005-298 — "If this kills it": rule 520 death is a
      // state-based check that runs after the whole effect resolves, so the
      // bound target is still on board here; it was killed iff the preceding
      // damage step left it with lethal damage.
      const bound = ctx.boundTargets ?? [];
      if (bound.length === 0) return false;
      return bound.some((id) => {
        const zone = ctx.zones.getCardZone(id as CoreCardId) ?? "";
        if (zone !== "base" && !zone.startsWith("battlefield-")) return false;
        const might = getEffectiveMight(id, ctx);
        if (might <= 0) return false;
        const dmg =
          (ctx.cards.getCardMeta?.(id as CoreCardId) as Partial<RiftboundCardMeta> | undefined)
            ?.damage ?? 0;
        return dmg >= might;
      });
    }
    case "while-at-battlefield": {
      // rule-id: ogn-223-298 — "if I am at a battlefield": the subject is the
      // source card; a unit in base (or off board) does not satisfy it.
      const zone = ctx.zones.getCardZone(ctx.sourceCardId as CoreCardId) as string | undefined;
      return zone?.startsWith("battlefield-") === true;
    }
    case "while-empowered": {
      // rule-id: ven-075-166 / rule 827 — "If this is [Empowered], ... instead."
      const meta = ctx.cards.getCardMeta?.(ctx.sourceCardId as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      return meta?.empowered === true;
    }
    case "did-perform":
    // rule 355.9 — "X. If you do, Y": Y happens only when the preceding
    // optional step X was actually performed. Same evidence as the
    // additional-cost flag below, which the sequence handler also sets.
    // falls through
    case "paid-additional-cost": {
      // rule-id: ven-083-166 / rule 560 — playSpell records whether the
      // caster elected the optional additional cost; absent means unpaid.
      if (ctx.draft.additionalCostsPaid?.[ctx.sourceCardId] === true) return true;
      // rule 560 (unl-164-219) — a play-self trigger carries the flag on its
      // firing event; unit plays do not record it on the draft.
      if ((ctx as { paidAdditionalCost?: boolean }).paidAdditionalCost === true) return true;
      // rule-id: ogn-056-298 — "X. If you do, Y" inside a sequence: the
      // sequence handler records whether the preceding step X was performed.
      return (ctx as { ifYouDoPerformed?: boolean }).ifYouDoPerformed === true;
    }
    case "legion": {
      // rule-id: ogn-254-298 / rule 724 — "if you've played another card this
      // turn". A spell resolving from the chain was itself already counted by
      // playSpell, so it needs one play beyond its own.
      const played = ctx.draft.cardsPlayedThisTurn?.[ctx.playerId] ?? 0;
      const onChain = ctx.zones.getCardZone(ctx.sourceCardId as CoreCardId) === "chain";
      return played >= (onChain ? 2 : 1);
    }
    default: {
      return true;
    }
  }
}

/**
 * Rule 143.4 override for tokens (sfd-171-221 Renata Glasc, ogn-011-298 Magma
 * Wurm): scan the creating player's board cards for a static grant-keyword
 * ability that grants the virtual `EntersReady` keyword to a matching unit
 * token. Static-ability recalculation only stamps `grantedKeywords` after the
 * token already exists exhausted, so create-token must consult these grants
 * up-front the same way the play-card path consults `enter-ready`.
 */
export function tokenEntersReadyFromStaticGrant(
  ctx: EffectContext,
  tokenType: string,
): boolean {
  // rule 365.1: only a permanent ON THE BOARD has an active passive — an
  // unplayed champion sitting in the champion zone grants nothing.
  const registry = getGlobalCardRegistry();
  const tokenKind = tokenType === "gear" ? "gear" : "unit";
  const boardIds: string[] = [
    ...ctx.zones.getCardsInZone("base" as CoreZoneId, ctx.playerId as CorePlayerId),
    ...ctx.zones.getCardsInZone("legendZone" as CoreZoneId, ctx.playerId as CorePlayerId),
  ] as string[];
  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    for (const id of ctx.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId)) {
      if (ctx.cards.getCardOwner(id) === ctx.playerId) {
        boardIds.push(id as string);
      }
    }
  }
  for (const sourceId of boardIds) {
    const abilities = registry.getAbilities(sourceId) ?? [];
    for (const ability of abilities) {
      if ((ability as { type?: string })?.type !== "static") {
        continue;
      }
      const eff = (ability as { effect?: Record<string, unknown> }).effect;
      if (eff?.type !== "grant-keyword" || eff.keyword !== "EntersReady") {
        continue;
      }
      if ((ability as { condition?: unknown }).condition !== undefined) {
        continue;
      }
      const target = eff.target as
        | { controller?: string; type?: string; filter?: string }
        | undefined;
      if (target?.controller && target.controller !== "friendly") {
        continue;
      }
      // rule-id: sfd-171-221 — "Your TOKENS enter ready" names every token,
      // gear included; a grant that does name a card type only covers that type.
      if (target?.type && target.type !== tokenKind) {
        continue;
      }
      if (target?.filter && target.filter !== "token") {
        continue;
      }
      return true;
    }
  }
  return false;
}