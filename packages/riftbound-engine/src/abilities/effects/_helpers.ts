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
import { recordPublicReveal } from "../../operations/public-reveal";
import { randomizedRecycleOrder } from "../../operations/recycle-order";
import { additionalCostWasPaid } from "../../operations/additional-costs-paid";
import { playedIdsThisTurn } from "../../operations/plays-this-turn";
import { effectiveTags } from "../card-tags";
import { scoreWithinConditionMet } from "../../operations/score-within";
import type { TargetDescriptor } from "../target-resolver";
import { boundBattlefieldZone, combatRoleMightBonus, resolveTarget } from "../target-resolver";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { findAllReplacements } from "../replacement-effects";
import { legalBoundIds } from "../target-slots";
import type { SpellEffectTargetShape } from "../../game-definition/moves/play/targeting";
import { hiddenChoiceIsPulledIn } from "../../game-definition/moves/play/targeting";

/**
 * rule 370.1.a.1 — a death that a replacement effect replaces never happens,
 * so the spell that dealt the lethal damage did NOT kill the unit. The
 * "this kills it" test runs while the effect is still resolving (before the
 * rule 520 state-based kill), so it has to consult the board's `die`
 * replacements itself. A replacement gated on a "you may pay …" cost may be
 * declined, so it is not treated as a certainty.
 */
export function dieWouldBeReplaced(cardId: string, ctx: EffectContext): boolean {
  const replacementCtx = {
    cards: {
      getCardMeta: ctx.cards.getCardMeta ?? (() => undefined),
      getCardOwner: ctx.cards.getCardOwner,
    },
    draft: ctx.draft,
    zones: { getCardsInZone: ctx.zones.getCardsInZone },
  };
  const matches = findAllReplacements(
    { cardId, owner: ctx.cards.getCardOwner?.(cardId as CoreCardId), type: "die" },
    replacementCtx as Parameters<typeof findAllReplacements>[1],
  );
  return matches.some((m) => (m.condition as { type?: string } | undefined)?.type !== "pay-cost");
}

/** On the board = in a base or at a battlefield (trash/banished/hand are not). */
export function unitIsOnBoard(cardId: string, ctx: EffectContext): boolean {
  const zone = ctx.zones.getCardZone(cardId as CoreCardId) ?? "";
  return zone === "base" || zone.startsWith("battlefield-");
}

/**
 * rule 520 / rule-id: ogn-005-298 — the bound targets the just-resolved damage
 * step left with lethal damage, i.e. the units this effect is about to kill.
 * A death a CERTAIN replacement will replace never happens (370.1.a.1), so
 * those are excluded here; an optional ("you may pay …") one is only known
 * once it has been answered, which is why the reflexive item re-checks.
 *
 * rule 373 — a replacement is only a CERTAINTY for a lone death: a single-use
 * shield (Zhonya's Hourglass) facing several simultaneous deaths saves exactly
 * one of them, and which one is its controller's choice at the Cleanup. Callers
 * that defer the verdict to a queued item (`includeReplaced`) must therefore
 * take every lethally damaged target and let that item's re-check decide.
 */
export function lethallyDamagedBoundIds(
  ctx: EffectContext,
  opts?: { readonly includeReplaced?: boolean },
): readonly string[] {
  return (ctx.boundTargets ?? []).filter((id) => {
    if (!unitIsOnBoard(id, ctx)) return false;
    const might = getEffectiveMight(id, ctx);
    if (might <= 0) return false;
    const dmg =
      (ctx.cards.getCardMeta?.(id as CoreCardId) as Partial<RiftboundCardMeta> | undefined)
        ?.damage ?? 0;
    if (dmg < might) return false;
    return opts?.includeReplaced === true || !dieWouldBeReplaced(id, ctx);
  });
}

/**
 * rule 424.1 — a reveal presents the card to ALL players. The recorder lives in
 * `operations/public-reveal` so zone-change code (rule 421.4) can write the same
 * record without importing the effect-handler graph; re-exported here because
 * effect handlers import it from the helpers.
 */
export { recordPublicReveal };

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
/**
 * rule 811.1.d.2 / 811.1.d.2.a — the battlefield a from-Hidden play scopes its
 * choices to, or `undefined` when the effect pulls its object in from anywhere.
 */
function hiddenScopeFor(effect: ExecutableEffect, ctx: EffectContext): string | undefined {
  const hiddenZone = (ctx as unknown as { hiddenZone?: string }).hiddenZone;
  if (hiddenZone === undefined) {
    return undefined;
  }
  return hiddenChoiceIsPulledIn(effect as unknown as SpellEffectTargetShape)
    ? undefined
    : hiddenZone;
}

/**
 * rule 359.3.e.5 — a target locked in when the card was played still has to MEET
 * the effect's requirements when the effect resolves. An ABSOLUTE location
 * requirement ("a unit AT A BATTLEFIELD", "a unit in a base") is re-checked
 * against the object's current zone: a unit Flashed home in response is no
 * longer "a unit at a battlefield", so that instruction is skipped while the
 * spell's other targets are unaffected. Relative locations ("here", "same",
 * "move-to-or-from") depend on resolution context the resolver owns and are
 * left alone.
 */
function filterBoundByLocation(bound: string[], tgt: unknown, ctx: EffectContext): string[] {
  const location = typeof tgt === "object" && tgt !== null ? (tgt as { location?: string }).location : undefined;
  // rule 359.3.e.2 / 359.3.e.4 (ven-103-166 Shadows of the Past × unl-103-219
  // Disposal Order) — a NAMED non-board zone is just as absolute: a card
  // chosen "from trashes" that was recycled out of its trash in response is a
  // new object in a different zone, so it is an illegal target and unaffected.
  const NAMED_ZONES: Record<string, readonly string[]> = {
    deck: ["mainDeck"],
    hand: ["hand"],
    trash: ["trash"],
  };
  const namedZones = typeof location === "string" ? NAMED_ZONES[location] : undefined;
  if (namedZones !== undefined) {
    return bound.filter((id) => {
      const zone = ctx.zones.getCardZone(id as CoreCardId);
      return zone === undefined || namedZones.includes(zone);
    });
  }
  // rule 359.3.e.5 (ruling c6e237431d023952 — Star-Crossed × Leona, Determined)
  // — "here" is read off the SOURCE when the item resolves: a source that left
  // the board is nowhere, so nothing is "here" and its bound target is illegal.
  if (location === "here") {
    const OFF_BOARD: readonly string[] = ["hand", "mainDeck", "trash", "banishment"];
    if (!(typeof ctx.sourceZone === "string" && OFF_BOARD.includes(ctx.sourceZone))) {
      return bound;
    }
    // rule 359.3.f.3 / 811.1.d.2 (ven-099-166 Tornado Warrior × Gust) — a card
    // played from face down anchors "here" at the battlefield it was FACE DOWN
    // at, and a triggered ability is independent of its source (383.3), so
    // bouncing the source in response does not empty that scope: the object
    // locked at finalization (402.2) stays legal while it still stands there.
    const anchor = ctx.hiddenZone ?? ctx.triggerBattlefieldZone;
    if (typeof anchor === "string" && anchor.startsWith("battlefield-")) {
      return bound.filter((id) => ctx.zones.getCardZone(id as CoreCardId) === anchor);
    }
    return [];
  }
  if (location !== "battlefield" && location !== "base") {
    // rule 359.3.e.2 (unl-134-219 Existential Dread × [Repeat]) — an object
    // returned to a hand or deck is a NEW object, so a descriptor naming board
    // objects ("an attacking enemy unit") stops matching it even when it named
    // no explicit location. Other zones (facedown, champion, banishment, runes)
    // are reachable by effects that name no location, so they are left alone.
    const targetType =
      typeof tgt === "object" && tgt !== null ? (tgt as { type?: string }).type : undefined;
    if (
      location === undefined &&
      (targetType === "unit" || targetType === "gear" || targetType === "permanent")
    ) {
      return bound.filter((id) => {
        const zone = ctx.zones.getCardZone(id as CoreCardId);
        return zone !== "hand" && zone !== "mainDeck";
      });
    }
    return bound;
  }
  return bound.filter((id) => {
    const zone = ctx.zones.getCardZone(id as CoreCardId);
    if (zone === undefined) {
      return true;
    }
    return location === "base" ? zone === "base" : zone.startsWith("battlefield");
  });
}

export function getTargetIds(effect: ExecutableEffect, ctx: EffectContext): string[] {
  // rule 355.13 / 402.2 — a variable-count set bound on THIS node when the item
  // was finalized ("up to two other friendly units"): exactly those objects,
  // less any no longer legal (359.3.e.5) — never a fresh board scan (355.15).
  const slotBound = legalBoundIds(effect, ctx);
  if (slotBound !== undefined) {
    return slotBound;
  }
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
    return filterBoundByLocation([...ctx.boundTargets], tgt, ctx);
  }
  const resolved = resolveTarget(effect.target, {
    battlefieldZone,
    cards: ctx.cards,
    // rule 355.13 (rule-id: sfd-023-221) — "one OTHER unit" drops the objects
    // an earlier slot of this instruction already chose.
    chosenTargetIds: ctx.chosenTargetIds,
    draft: ctx.draft,
    // rule 811.1.d.2 (sfd-139-221) — a card played from Hidden chooses only at
    // the battlefield it was facedown at ("attach it to a unit you control
    // (here)"); the resolver applies the scope when it is threaded through.
    // rule 811.1.d.2.a (unl-141-219) — except when the effect PULLS its chosen
    // object into that battlefield: it is then chosen freely from anywhere.
    ...(hiddenScopeFor(effect, ctx) === undefined
      ? {}
      : { hiddenZone: hiddenScopeFor(effect, ctx) }),
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
 * rule 143.2 / 187.11 — "has no Might" means NOT A UNIT (a spell, gear, rune),
 * never "printed 0": a 0-Might unit token (Shadow Clone) is a unit, so its
 * modifiers, buffs, equipment and combat-role bonuses all count. Key off the
 * card TYPE, falling back to the printed number only for definitions that
 * carry no type at all (loose inline test defs).
 */
function hasMightAsUnit(cardId: string): boolean {
  const def = getGlobalCardRegistry().get(cardId) as
    | { cardType?: string; might?: number }
    | undefined;
  if (def?.cardType !== undefined) {
    return def.cardType === "unit";
  }
  return (def?.might ?? 0) !== 0;
}

/**
 * rule 718.3 (sfd-059-221 Svellsongur) — an attached card's Effect Text abilities
 * are appended to the Rules Text of the TOP-MOST card, so "I"/"my" inside them names
 * the wearer, not the attachment. Unattached sources always mean themselves.
 */
export function selfReferenceCardId(cardId: string, ctx: EffectContext): string {
  const meta = ctx.cards.getCardMeta?.(cardId as CoreCardId) as
    | { attachedTo?: string }
    | undefined;
  return meta?.attachedTo ?? cardId;
}

/**
 * Calculate a unit's effective Might from its definition and metadata.
 */
export function getEffectiveMight(cardId: string, ctx: EffectContext): number {
  const registry = getGlobalCardRegistry();
  const def = registry.get(cardId);
  const printedMight = def?.might ?? 0;
  if (!hasMightAsUnit(cardId)) {
    return 0;
  } // Not a unit

  const meta = ctx.cards.getCardMeta?.(cardId as CoreCardId) as
    | Partial<RiftboundCardMeta>
    | undefined;
  // rule 323.5 — a set base Might replaces the printed one.
  const baseMight = meta?.baseMightOverride ?? printedMight;
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
 * rule 807.1.c — Assault (attacker) / Shield (defender) is part of the unit's
 * CURRENT Might while its combat role is stamped. Readers that compare against
 * a Might floor or threshold must use this, not the role-blind base above.
 */
export function getEffectiveMightInRole(cardId: string, ctx: EffectContext): number {
  const base = getEffectiveMight(cardId, ctx);
  // rule 807.1.c — only a NON-unit (no printed Might) has no combat Might. A
  // unit whose modifiers already floored it at 0 still carries its Assault /
  // Shield bonus, so a later "to a minimum of N" floor must count that bonus.
  if (!hasMightAsUnit(cardId)) {
    return 0;
  }
  const meta = ctx.cards.getCardMeta?.(cardId as CoreCardId) as
    | Partial<RiftboundCardMeta>
    | undefined;
  return base + combatRoleMightBonus(cardId, meta);
}

/**
 * rule 143.2.b.1 — a Might below 0 is only TREATED as 0 when it is REFERENCED;
 * an effect that CALCULATES a Might increase or decrease (a swap's difference)
 * uses the ACTUAL value. Same sum as {@link getEffectiveMight}, unclamped.
 */
export function getActualMight(cardId: string, ctx: EffectContext): number {
  const registry = getGlobalCardRegistry();
  const def = registry.get(cardId);
  const printedMight = def?.might ?? 0;
  if (!hasMightAsUnit(cardId)) {
    return 0;
  } // Not a unit
  const meta = ctx.cards.getCardMeta?.(cardId as CoreCardId) as
    | Partial<RiftboundCardMeta>
    | undefined;
  const baseMight = meta?.baseMightOverride ?? printedMight;
  const buffBonus = (meta?.buffed ? 1 : 0) + (meta?.extraBuffs ?? 0);
  const mightMod = meta?.mightModifier ?? 0;
  const staticBonus = meta?.staticMightBonus ?? 0;
  let equipBonus = 0;
  for (const equipId of meta?.equippedWith ?? []) {
    equipBonus += registry.getMightBonus(equipId);
  }
  return baseMight + buffBonus + mightMod + staticBonus + equipBonus;
}

/** rule 143.2.b.1 × 807.1.c — {@link getActualMight} plus the current combat-role bonus. */
export function getActualMightInRole(cardId: string, ctx: EffectContext): number {
  if (!hasMightAsUnit(cardId)) {
    return 0;
  }
  const meta = ctx.cards.getCardMeta?.(cardId as CoreCardId) as
    | Partial<RiftboundCardMeta>
    | undefined;
  return getActualMight(cardId, ctx) + combatRoleMightBonus(cardId, meta);
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
 * rule 394-397 (rule-id: unl-181-219) — the cards a Linked ability banished
 * "with" its source: `meta.exiledByThis` (written by `effects/banish.ts` for a
 * `trackLinked` banish) narrowed to those still in banishment.
 */
export function linkedBanishedIds(ctx: EffectContext): string[] {
  const meta = ctx.cards.getCardMeta?.(ctx.sourceCardId as CoreCardId) as
    | Partial<RiftboundCardMeta>
    | undefined;
  const tracked = (meta?.exiledByThis ?? []) as readonly string[];
  return tracked.filter(
    (id) => ctx.zones.getCardZone?.(id as CoreCardId) === "banishment",
  ) as string[];
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
  // rule 428.1 / 359.3.e (rule-id: ven-017-166) — "damage equal to the damage
  // marked on it": the tally is read ONCE, as this instruction executes, off
  // the unit the effect is acting on (the bound target); the damage this
  // instruction then deals never feeds back into the amount.
  if ("damage" in amount) {
    const damageRef = amount.damage;
    let refId: string | undefined =
      damageRef === "self" ? ctx.sourceCardId : ctx.boundTargets?.[0];
    if (refId === undefined && typeof damageRef === "object" && damageRef !== null) {
      refId = resolveTarget(
        { ...(damageRef as TargetDescriptor), quantity: "all" },
        {
          cards: ctx.cards,
          draft: ctx.draft,
          playerId: ctx.playerId,
          sourceCardId: ctx.sourceCardId,
          sourceZone: ctx.sourceZone,
          zones: ctx.zones,
        },
      )[0];
    }
    if (refId === undefined) {
      return 0;
    }
    const marked = (
      ctx.cards.getCardMeta?.(refId as CoreCardId) as { damage?: number } | undefined
    )?.damage;
    return marked ?? 0;
  }
  if ("might" in amount) {
    const mightRef = amount.might;
    if (mightRef === "self") {
      const selfId = selfReferenceCardId(ctx.sourceCardId, ctx);
      // rule 359.3.e.12 — information about a permanent that has changed to a
      // non-board zone is null, and a calculation using it is ignored: an
      // ability that outlives its source ("+[Might] equal to MY Might", 355.9.c)
      // grants nothing once the source has left the board.
      if (!unitIsOnBoard(selfId, ctx)) {
        return 0;
      }
      return getEffectiveMight(selfId, ctx);
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
    const inTrash = ctx.zones.getCardsInZone("trash" as CoreZoneId, pid as CorePlayerId);
    // rule 715.1 (ven-010-166) — "1 Bonus Damage for each card with this name in
    // your trash": `named` narrows the tally to one card name ("self" = the
    // source's own name; the resolving copy is still on the chain, not in the
    // trash), and `base` is the flat amount the bonus is added to.
    const named = amount.named as string | undefined;
    const base = typeof amount.base === "number" ? amount.base : 0;
    if (named === undefined) {
      return base + inTrash.length;
    }
    const registry = getGlobalCardRegistry();
    const wanted = (
      named === "self" ? (registry.get(ctx.sourceCardId)?.name ?? "") : named
    ).toLowerCase();
    const matches = inTrash.filter(
      (id) => (registry.get(id as string)?.name ?? "").toLowerCase() === wanted,
    ).length;
    return base + matches;
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
      // rule 135.2.b.3 — a tag gained as the unit was played counts here too.
      const tags = effectiveTags(
        (registry.get(id) as { tags?: readonly string[] } | undefined)?.tags,
        ctx.cards.getCardMeta?.(id as CoreCardId) as
          | { namedTag?: string; grantedTags?: readonly string[] }
          | undefined,
      );
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
    const deck = ctx.zones
      .getCardsInZone("mainDeck" as CoreZoneId, ctx.playerId as CorePlayerId)
      .map((c) => c as string);
    // rule 354.3 / 370.1 (ogn-194-298 Nocturne) — the cards this reveal turned
    // over are frozen on the effect by `offerRevealTopChoices`, which already
    // presented them and ran their on-reveal abilities: one that removed itself
    // drops out, and no fresh card pulled up behind it joins the count.
    const carried = amount.revealedIds as readonly string[] | undefined;
    const topN = carried ? carried.filter((id) => deck.includes(id)) : deck.slice(0, n);
    if (carried === undefined) {
      // rule 424.1 — this IS a reveal, not a private look: present the cards to
      // every player BEFORE they are recycled, or nobody can verify the count.
      recordPublicReveal(ctx, ctx.playerId as string, topN);
    }
    const hits = topN.filter((id) => registry.hasKeyword(id, keyword)).length;
    if ((amount.then ?? "recycle") === "recycle") {
      // rule 416.5 — these cards are recycled TOGETHER, so they reach the
      // bottom in a random order; watching the reveal must not tell anyone
      // the order of the bottom five.
      for (const id of randomizedRecycleOrder(topN, ctx.rng)) {
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
  // rule 441 (rule-id: ven-177-166) — "When my Might becomes N or more" is a
  // threshold-crossing trigger on effective Might from ANY source, so the raise
  // publishes both endpoints and the matcher compares thresholds. The phrasing
  // is always self-referential, so only a card printing one needs the event.
  const printsMightThreshold = (getGlobalCardRegistry().getAbilities(cardId) ?? []).some(
    (a) => a.type === "triggered" && (a as { trigger?: { event?: string } }).trigger?.event === "might-becomes",
  );
  if (printsMightThreshold && ctx.fireTriggers && mightAfter > mightBefore) {
    const owner = ctx.cards.getCardOwner(cardId as CoreCardId) ?? "";
    ctx.fireTriggers({
      cardId,
      might: mightAfter,
      owner,
      previousMight: mightBefore,
      type: "might-becomes",
    });
  }
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
 * rule 709 / 710 — ANY change to a unit's current Might can make it "become
 * [Mighty]", whatever layer moved it (buff, modifier, static, equipment, a SET
 * base Might, or a copy effect swapping the printed Might). Writers that are
 * not already a `checkBecomesMighty` call site wrap their mutation in this, so
 * the threshold is compared once from a single choke: snapshot → mutate →
 * compare, emitting become-mighty at most once per unit.
 */
export function withMightWatch<T>(cardIds: string[], ctx: EffectContext, mutate: () => T): T {
  const before = new Map<string, number>();
  for (const id of cardIds) {
    before.set(id, getEffectiveMight(id, ctx));
  }
  const result = mutate();
  for (const id of cardIds) {
    checkBecomesMighty(id, before.get(id) ?? 0, ctx);
  }
  return result;
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
    // rule 422 (unl-080-219 Hwei) — "do the following based on the discarded
    // card's type": the branch is dictated by what was discarded, never picked.
    case "discarded-card-type": {
      const want = condition.cardType as string | undefined;
      const ids =
        (ctx.draft as { lastDiscardedCardIds?: Record<string, string[]> }).lastDiscardedCardIds?.[
          ctx.playerId
        ] ?? [];
      if (ids.length === 0 || want === undefined) return false;
      const registry = getGlobalCardRegistry();
      return ids.some((id) => registry.get(id)?.cardType === want);
    }
    // rule 811.1 (unl-042-219) — "if you played this from your hand". A play
    // from Hidden collapses this gate in `chain/resolve.ts` before resolution,
    // so anything still reaching the evaluator was played from hand.
    case "played-from-hand":
      return true;
    // rule 318 (unl-172-219) — "If it's your <Phase> Phase": checked as the
    // effect executes. rule 319 — every phase belongs to the turn player, so
    // "your" additionally demands that the controller IS the turn player; the
    // opponent's Beginning Phase never satisfies it.
    case "during-phase": {
      const wanted = String(condition.phase ?? "").toLowerCase();
      const turn = ctx.draft.turn as { activePlayer?: string; phase?: string } | undefined;
      if (String(turn?.phase ?? "").toLowerCase() !== wanted) return false;
      return condition.whose === "you" ? turn?.activePlayer === ctx.playerId : true;
    }
    // rule 319 (ven-139-166 Rogue Assassin) — "If it's your turn": the effect's
    // controller must be the turn player as the instruction executes.
    case "your-turn": {
      const turn = ctx.draft.turn as { activePlayer?: string } | undefined;
      return turn?.activePlayer === ctx.playerId;
    }
    // rule 442.1.a — "if I'm [Empowered]", checked on resolution. Without an
    // explicit target it asks about the effect's own source.
    case "empowered":
    case "not-empowered": {
      const subject =
        (condition.target as { type?: string } | undefined)?.type === "self" ||
        condition.target === undefined ||
        condition.target === "self"
          ? ctx.sourceCardId
          : (ctx.boundTargets?.[0] ?? ctx.sourceCardId);
      const meta = subject
        ? (ctx.cards.getCardMeta?.(subject as CoreCardId) as { empowered?: boolean } | undefined)
        : undefined;
      return (meta?.empowered === true) === (condType === "empowered");
    }
    case "has-xp": {
      const threshold = (condition.threshold as number) ?? 1;
      const player = ctx.draft.players[ctx.playerId];
      return (player?.xp ?? 0) >= threshold;
    }
    // rule 824.1.c (unl-038-219) — "[Level N]": the dependent instruction is
    // active only while the controller has N or more XP, checked as the effect
    // executes rather than when the card was played.
    case "while-level": {
      const threshold = (condition.threshold as number) ?? 0;
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
    // rule 383.2.a.1 — same predicate as the play-cost gate and the trigger
    // gate; the parser emits `points`, older hand-authored shapes use `range`.
    case "score-within":
      return scoreWithinConditionMet(
        condition as { points?: number; range?: number; whose?: string },
        ctx.draft as never,
        ctx.playerId,
      );
    case "count": {
      const target = condition.target as TargetDescriptor | undefined;
      const cmp = condition.comparison as
        | { lte?: number; gte?: number; eq?: number }
        | undefined;
      let n: number;
      if (target && (target as { type?: string }).type === "rune") {
        n = ctx.zones.getCardsInZone("runePool" as CoreZoneId, ctx.playerId as CorePlayerId)
          .length;
      } else if (
        target &&
        (target as { location?: string }).location === "banishment" &&
        (target as { linkedToSource?: boolean }).linkedToSource === true
      ) {
        // rule 397 (rule-id: unl-181-219) — "if there are four spells banished
        // WITH ME" counts only the cards this ability banished (the source's
        // `exiledByThis` link list), never cards exiled by anything else.
        n = linkedBanishedIds(ctx).length;
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
    // rule 359 (rule-id: unl-097-219, Kinkou Initiate) — "draw 1 if your other
    // units have total Might 5 or more": the clause follows the instruction, so
    // it is read as the ability RESOLVES. Sum the current Might of the units
    // this effect's controller has across base and every battlefield; the
    // source itself is excluded for the "other" scope, enemies never count.
    case "total-might-at-least": {
      const needed = (condition.amount as number) ?? 0;
      const excludeSelf = ((condition.scope as string | undefined) ?? "other-units") !== "units";
      const registry = getGlobalCardRegistry();
      const ids: string[] = ctx.zones
        .getCardsInZone("base" as CoreZoneId, ctx.playerId as CorePlayerId)
        .map((x) => x as string);
      for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
        ids.push(
          ...ctx.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId).map((x) => x as string),
        );
      }
      let total = 0;
      for (const id of ids) {
        if (excludeSelf && id === ctx.sourceCardId) {
          continue;
        }
        const def = registry.get(id) as { cardType?: string } | undefined;
        if (def?.cardType !== undefined && def.cardType !== "unit") {
          continue;
        }
        const owner =
          ctx.cards.getCardController?.(id as CoreCardId) ??
          (ctx.cards.getCardOwner(id as CoreCardId) as string | undefined);
        if (owner !== ctx.playerId) {
          continue;
        }
        total += getEffectiveMight(id, ctx);
      }
      return total >= needed;
    }
    case "target-controller": {
      const want = condition.controller as "friendly" | "enemy" | undefined;
      const bound = ctx.boundTargets?.[0];
      if (!bound) return false;
      // rule 740.1.a (sfd-162-221) — "friendly"/"enemy" is about CONTROL, not
      // ownership: a unit I control but do not own is friendly to me.
      // rule 359.3.f — "If it WAS a friendly unit" after killing it reads
      // last-known information: control reverts to the owner as the card
      // leaves the board, so the snapshot taken by the kill wins.
      const controller =
        (ctx.draft.lastKilledUnitId === bound ? ctx.draft.lastKilledUnitController : undefined) ??
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
    case "target-empowered": {
      // rule 442.1 (ven-037-166) — "choose an enemy gear. If it's [Empowered],
      // disempower it. Otherwise, kill it": the branch reads the chosen
      // (bound) permanent's Empowered status at resolution, not the source's.
      const bound = ctx.boundTargets?.[0];
      if (!bound) return false;
      const meta = ctx.cards.getCardMeta?.(bound as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      return meta?.empowered === true;
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
      // rule 370.1.a.1 / 372 — the re-check stamped on the queued reflexive
      // item (`ids`): by the time that item resolves the rule 520 death has
      // been processed, so a unit an OPTIONAL replacement actually saved (The
      // Boss) stands on the board again and was never killed.
      const stamped = (condition as { ids?: readonly string[] }).ids;
      if (stamped !== undefined) {
        return stamped.some((id) => !unitIsOnBoard(id, ctx));
      }
      // rule-id: ogn-005-298 — "If this kills it": rule 520 death is a
      // state-based check that runs after the whole effect resolves, so the
      // bound target is still on board here; it was killed iff the preceding
      // damage step left it with lethal damage.
      // rule 373 — `deferred` marks the gate in front of a "do this:" rider:
      // its queued item re-checks the kill for real, so a death a single-use
      // shield MIGHT replace must not suppress the item up front.
      const deferred = (condition as { deferred?: boolean }).deferred === true;
      return lethallyDamagedBoundIds(ctx, { includeReplaced: deferred }).length > 0;
    }
    // rule 355.10 (unl-051-219 Ivern) — "Then if you revealed a Bird, Cat,
    // Dog, or Poro, do this: …": the linked follow-up reads the TAGS of the
    // card that was just revealed/picked (the trigger-source), as revealed.
    // No card revealed (the optional pick was declined) ⇒ false.
    case "trigger-source-tag": {
      const subject = ctx.triggerSourceId;
      if (!subject) return false;
      const wanted = ((condition.tags as string[] | undefined) ?? []).map((t) => t.toLowerCase());
      if (wanted.length === 0) return false;
      const tags = (getGlobalCardRegistry().get(subject)?.tags ?? []) as readonly string[];
      return tags.some((t) => wanted.includes(String(t).toLowerCase()));
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
      if (additionalCostWasPaid(ctx.draft, ctx.sourceCardId, (condition as { costId?: string }).costId)) return true;
      // rule 560 (unl-164-219) — a play-self trigger carries the flag on its
      // firing event; unit plays do not record it on the draft.
      if ((ctx as { paidAdditionalCost?: boolean }).paidAdditionalCost === true) return true;
      // rule-id: ogn-056-298 — "X. If you do, Y" inside a sequence: the
      // sequence handler records whether the preceding step X was performed.
      return (ctx as { ifYouDoPerformed?: boolean }).ifYouDoPerformed === true;
    }
    case "legion": {
      // rule-id: ogn-254-298 / rule 724 / 812.1.c — "if you've played another card
      // this turn", read against the CURRENT controller (rule 419.4.b): a spell
      // whose control changed on the chain (Mystic Reversal) re-keys, and the
      // thief's own plays decide it. The per-card ledger answers "another card"
      // directly; only when it is unpopulated do we fall back to the count, where
      // a spell resolving from the chain was itself already tallied by playSpell.
      const played = ctx.draft.cardsPlayedThisTurn?.[ctx.playerId] ?? 0;
      const ids = playedIdsThisTurn(ctx.draft, ctx.playerId);
      if (ids.length > 0) {
        return ids.some((id) => id !== ctx.sourceCardId);
      }
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
  tokenController?: string,
): boolean {
  // rule 365.1: only a permanent ON THE BOARD has an active passive — an
  // unplayed champion sitting in the champion zone grants nothing.
  // rule 184.1 / 740.1.a (sfd-171-221 × unl-130-219): "YOUR tokens enter ready"
  // is friendly to the token's CONTROLLER, not to the controller of the effect
  // that created it — "choose an opponent, THEY play a token" hands the token to
  // that opponent, so only their own statics can override the 185.2.d default.
  const grantee = (tokenController ?? ctx.playerId) as typeof ctx.playerId;
  const registry = getGlobalCardRegistry();
  const tokenKind = tokenType === "gear" ? "gear" : "unit";
  const boardIds: string[] = [
    ...ctx.zones.getCardsInZone("base" as CoreZoneId, grantee as CorePlayerId),
    ...ctx.zones.getCardsInZone("legendZone" as CoreZoneId, grantee as CorePlayerId),
  ] as string[];
  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    for (const id of ctx.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId)) {
      if (ctx.cards.getCardOwner(id) === grantee) {
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
/**
 * rule 355.11 / 355.11.b — a group chosen under an aggregate "total Might N or
 * less" requirement that no longer meets it as the effect resolves: its
 * controller picks a SUBSET of the ORIGINAL targets that does (never a unit
 * that was not chosen), and only that subset is affected. Raises a
 * `pick-many {semantics:"subset"}` whose answer re-enters the same handler with
 * the subset bound. Returns true when the prompt was parked.
 * Shared so every aggregate-constrained effect (kill, bounce, …) behaves alike.
 */
export function raiseTotalMightSubsetRepick(
  effect: ExecutableEffect,
  ctx: EffectContext,
  mightOf: (cardId: string) => number = (id) => getEffectiveMight(id, ctx),
): boolean {
  const cap = (effect.target as { totalMight?: { lte?: number; lt?: number } } | undefined)?.totalMight;
  const limit = cap?.lte ?? (cap?.lt !== undefined ? cap.lt - 1 : undefined);
  const bound = ctx.boundTargets;
  if (limit === undefined || !bound || bound.length === 0 || ctx.draft.pendingChoice) {
    return false;
  }
  if ((effect as { _subsetChecked?: boolean })._subsetChecked === true) {
    return false;
  }
  const total = bound.reduce((sum, id) => sum + mightOf(id), 0);
  if (total <= limit) {
    return false;
  }
  // rule 355.11.b + 358.3.a — a unit that alone breaks the cap can be in no
  // legal subset; when that leaves NO option there is no subset to ask for and
  // nothing the instruction may affect, so it is handled by doing nothing.
  // Asking anyway would raise a prompt with an empty answer set (harness
  // invariant `noEmptyPrompt`) that no seat could meaningfully answer, and
  // returning "not handled" would affect the whole over-cap group instead.
  const subsetOptions = bound.filter((id) => mightOf(id) <= limit).map((id) => ({ cardId: id, key: id }));
  if (subsetOptions.length === 0) {
    return true;
  }
  ctx.draft.pendingChoice = {
    constraint: { totalMightAtMost: limit },
    max: bound.length,
    min: 0,
    options: subsetOptions,
    playerId: ctx.playerId,
    prompt: `Choose original targets with total Might ${limit} or less to affect`,
    resume: {
      effect: { ...effect, _subsetChecked: true },
      kind: "subset-repick",
      playerId: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
    },
    semantics: "subset",
    sourceCardId: ctx.sourceCardId,
    type: "pick-many",
  };
  return true;
}
