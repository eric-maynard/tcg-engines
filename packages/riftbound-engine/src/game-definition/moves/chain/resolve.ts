/**
 * Chain resolution: executeResolvedItem + passChainPriority / resolveChain moves (split from chain-moves.ts).
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import type { ChainItem } from "../../../chain";
import {
  allPlayersPassed,
  passPriority as passPriorityState,
  resolveTopItem,
} from "../../../chain";
import type { EffectContext, ExecutableEffect } from "../../../abilities/effect-executor";
import { executeEffect } from "../../../abilities/effect-executor";
import { findSpendableBuff } from "../../../abilities/effects/spend-buff";
import { canSpendXp } from "../../../abilities/effects/spend-xp";
import type { TargetDescriptor } from "../../../abilities/target-resolver";
import {
  isAllAtOneBattlefield,
  isProtectedFromEnemyChoice,
  isUntargetable,
  resolveTarget,
} from "../../../abilities/target-resolver";
import { fireTriggers } from "../../../abilities/trigger-runner";
import { withChainItemResolution } from "../../../chain/resolution-guard";
import { cleanupAndFireDeaths } from "../../../cleanup/post-move-cleanup";
import { checkVictory } from "../../../operations/points";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { getCardEffectiveMight, getDeflectSurcharge, xCostIsPower } from "../play/cost";
import {
  collectSequenceTargetSlots,
  findAmountReferenceTarget,
  findSequenceLeadTarget,
  hiddenChoiceIsPulledIn,
  isLegalMultiTargetSet,
  type SpellEffectTargetShape,
} from "../play/targeting";
import { deductAbilityCost } from "./activate-ability";
import { buildEffectContext } from "./effect-context";
import { openPendingContestedShowdown } from "./showdown";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * rule 319.5 / 323.1: an item leaving the Chain makes a Cleanup outstanding,
 * and the Cleanup's first task is the victory check. Effects that changed
 * scores mid-resolution deliberately skipped it (rule 321), so it happens here,
 * comparing every player exactly once against the final post-resolution scores.
 */
function runPostResolutionVictoryCheck(draft: RiftboundGameState): void {
  checkVictory(draft);
}

/**
 * Total pooled Power a player has across every Domain — rule 809.1.c.1: a
 * Deflect surcharge is Power of ANY Domain, so only the total matters.
 */
function totalPooledPower(state: RiftboundGameState, playerId: string): number {
  const pool = state.runePools[playerId];
  if (!pool) {
    return 0;
  }
  return Object.values(pool.power as Partial<Record<string, number>>).reduce(
    (a: number, b) => a + (b ?? 0),
    0,
  );
}

/**
 * Pay `amount` Power of any Domain, draining the most-stocked Domain first.
 * Pays nothing and returns false when the player is short (rule 404.2).
 */
export function payAnyDomainPower(
  draft: RiftboundGameState,
  playerId: string,
  amount: number,
): boolean {
  if (amount <= 0) {
    return true;
  }
  const pool = draft.runePools[playerId];
  if (!pool || totalPooledPower(draft, playerId) < amount) {
    return false;
  }
  const anyPool = pool.power as Partial<Record<string, number>>;
  for (let i = 0; i < amount; i++) {
    const key = Object.entries(anyPool)
      .filter(([, v]) => (v ?? 0) > 0)
      .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))[0]?.[0];
    if (key === undefined) {
      return false;
    }
    anyPool[key] = (anyPool[key] ?? 0) - 1;
  }
  return true;
}

/**
 * Replace every `{ variable: "<name>" }` amount expression inside an effect
 * tree with its bound numeric value. Used for variables whose value is known
 * only from the triggering event (rule 626.1.d.2 "that much"), so the number
 * travels with the effect through a resolution-time prompt.
 */
function bindNamedAmounts<T>(effect: T, variables: Record<string, number>): T {
  if (effect === null || typeof effect !== "object") {
    return effect;
  }
  if (Array.isArray(effect)) {
    return effect.map((e) => bindNamedAmounts(e, variables)) as unknown as T;
  }
  const out: Record<string, unknown> = { ...(effect as Record<string, unknown>) };
  for (const [key, value] of Object.entries(out)) {
    if (value === null || typeof value !== "object") {
      continue;
    }
    const name = (value as { variable?: unknown }).variable;
    if (typeof name === "string" && variables[name] !== undefined) {
      out[key] = variables[name];
      continue;
    }
    out[key] = bindNamedAmounts(value, variables);
  }
  return out as T;
}

/**
 * rule 811.1 (unl-042-219 Back Off) — "If you played this from your hand" is
 * FALSE for a card played from Hidden. The gate is folded into the effect tree
 * before resolution because a resolution-time target prompt re-executes the
 * stored effect from a fresh context, which no longer knows the card came from
 * facedown. `{ type: "noop" }` keeps sequence step indices (and their bound
 * target slots) intact while executing nothing.
 */
function resolvePlayedFromHandGates<T>(effect: T, playedFromHand: boolean): T {
  if (effect === null || typeof effect !== "object") {
    return effect;
  }
  if (Array.isArray(effect)) {
    return effect.map((e) => resolvePlayedFromHandGates(e, playedFromHand)) as unknown as T;
  }
  const node = effect as Record<string, unknown>;
  if (
    node.type === "conditional" &&
    (node.condition as { type?: unknown } | undefined)?.type === "played-from-hand"
  ) {
    const branch = playedFromHand ? node.then : node.else;
    return (branch === undefined
      ? { type: "noop" }
      : resolvePlayedFromHandGates(branch, playedFromHand)) as unknown as T;
  }
  const out: Record<string, unknown> = { ...node };
  for (const [key, value] of Object.entries(out)) {
    if (value !== null && typeof value === "object") {
      out[key] = resolvePlayedFromHandGates(value, playedFromHand);
    }
  }
  return out as T;
}

/** rule 420.1 — a permanent is on the board while it sits in a base or at a battlefield. */
function sourceStillOnBoard(
  cardId: string,
  context: Parameters<typeof buildEffectContext>[3],
): boolean {
  const zone = context.zones.getCardZone(cardId as CoreCardId) as string | undefined;
  return typeof zone === "string" && (zone === "base" || zone.startsWith("battlefield-"));
}

/**
 * rule 383.3.a / 402.4 — whether a "you may …" triggered item can be performed
 * at all: an unpayable leading cost (no buff to spend, too little XP, too few
 * cards to discard) or an unambiguously empty candidate set means the
 * controller is never asked. Shared by the finalization dialog and the
 * legacy resolution-time opt-in.
 */
export function optInIsPerformable(
  resolved: ChainItem,
  draft: RiftboundGameState,
  context: Parameters<typeof buildEffectContext>[3],
): boolean {
  {
    // rule-id: ogn-147-298 — "you may spend a buff to …": when no friendly
    // buff can be spent the cost is unpayable, so don't offer the opt-in
    // prompt at all — the trigger simply has no effect.
    const optEffect = resolved.effect as ExecutableEffect | undefined;
    const leadEffect =
      optEffect?.type === "sequence"
        ? (optEffect as { effects?: ExecutableEffect[] }).effects?.[0]
        : optEffect;
    if (
      leadEffect?.type === "spend-buff" &&
      !findSpendableBuff(
        leadEffect,
        buildEffectContext(draft, resolved.controller, resolved.cardId, context),
      )
    ) {
      return false;
    }
    // rule-id: unl-119-219 — "you may spend 3 XP to …": an unpayable XP cost
    // likewise suppresses the opt-in prompt.
    if (
      leadEffect?.type === "spend-xp" &&
      !canSpendXp(leadEffect, buildEffectContext(draft, resolved.controller, resolved.cardId, context))
    ) {
      return false;
    }
    // rule 422.3 (ogn-252-298): "you may discard N to …" with fewer than N
    // cards in hand is an unpayable cost — no opt-in prompt at all.
    const optDiscard = (resolved.optInCost as { discard?: unknown } | undefined)?.discard;
    if (typeof optDiscard === "number" && optDiscard > 0) {
      const hand = context.zones.getCardsInZone(
        "hand" as CoreZoneId,
        resolved.controller as CorePlayerId,
      );
      if (hand.length < optDiscard) {
        return false;
      }
    }
    // rule 355.8 — an ability that must choose a Game Object with no legal
    // candidate does nothing, so a "you may" version offers no prompt either.
    // rule-id: unl-205-219 (Abandoned Hall) — "they may give a unit they
    // control here +1": the spell's player may control no unit at the Hall.
    // Effects that gather their candidates from a private zone ("play a unit
    // from your trash") describe them with the same `target` shape but the
    // board resolver can't see them — never judge those legal/illegal here.
    const optTarget =
      leadEffect?.type === "play" ||
      (leadEffect as { from?: unknown } | undefined)?.from !== undefined
        ? undefined
        : (leadEffect as { target?: TargetDescriptor } | undefined)?.target;
    if (
      optTarget !== undefined &&
      typeof optTarget.type === "string" &&
      // Kept deliberately narrow: only "a unit YOU control …" descriptors, where
      // an empty candidate set is unambiguous and cannot depend on board state
      // the resolver reads differently at resolution time — plus "an enemy unit
      // HERE", whose candidate set is empty whenever the source has left the
      // board (rule-id: unl-166-219 — Sinister Poro killed as an additional
      // cost while its own attack trigger is still on the chain).
      (optTarget.controller === "friendly" ||
        (optTarget.controller === "enemy" &&
          optTarget.location === "here" &&
          // rule 383.3.a (unl-105-219) — while the source is still on the board
          // "here" is a real place, so the controller is still asked whether to
          // use the ability; only a source that already left has no "here" at all.
          !sourceStillOnBoard(resolved.cardId, context))) &&
      optTarget.type !== "self" &&
      optTarget.type !== "trigger-source" &&
      optTarget.type !== "player" &&
      optTarget.type !== "battlefield" &&
      optTarget.quantity === undefined
    ) {
      const optCtx = buildEffectContext(draft, resolved.controller, resolved.cardId, context);
      const optCandidates = resolveTarget({ ...optTarget, quantity: "all" }, {
        ...optCtx,
        choosing: true,
      } as Parameters<typeof resolveTarget>[1]);
      if (optCandidates.length === 0) {
        return false;
      }
    }
  }
  return true;
}

/** The effect node (the effect itself or a nested sequence step) whose `target` is `target`. */
function stepOwningTarget(effect: unknown, target: unknown): unknown {
  if (!effect || typeof effect !== "object") {
    return undefined;
  }
  const node = effect as { target?: unknown; defender?: unknown; effects?: unknown[] };
  if (node.target === target || node.defender === target) {
    return node;
  }
  for (const sub of Array.isArray(node.effects) ? node.effects : []) {
    const hit = stepOwningTarget(sub, target);
    if (hit !== undefined) {
      return hit;
    }
  }
  return undefined;
}

/**
 * rule 402.2 — outcome of running the choice-planning half of
 * `executeResolvedItem` for a Pending Item (`finalizeOnly`): `remove` when no
 * legal choice exists (402.4) or a mandatory surcharge is unpayable (404.2);
 * otherwise the Game Objects bound without a prompt (undefined = the effect
 * has no caster-chosen single slot). A raised prompt is left on
 * `draft.pendingChoice`, tagged with the item id.
 */
export interface FinalizeOutcome {
  readonly remove?: true;
  readonly targets?: readonly string[];
}

/**
 * Execute a resolved chain item's effect.
 * Skips execution if the item was countered (rule 543).
 *
 * With `opts.finalizeOnly` the item is a Pending trigger being FINALIZED
 * (rule 402.2): only the caster-chosen target planning runs — prompts are bound
 * to the chain item instead of executing — and nothing resolves.
 */
export function executeResolvedItem(
  resolved: ChainItem,
  draft: RiftboundGameState,
  context: Parameters<typeof buildEffectContext>[3],
  opts: { readonly finalizeOnly?: boolean } = {},
): FinalizeOutcome | undefined {
  const finalizeOnly = opts.finalizeOnly === true;
  const bindTag = finalizeOnly ? { bindToChainItemId: resolved.id } : {};
  // Countered items don't execute their effects
  if (resolved.countered) {
    return undefined;
  }

  // Rule 583 (unl-021-219): a "you may …" trigger reaches resolution but its
  // effect runs only if the controller opts in. Pause via an `opt-in` pending
  // choice; on accept the reducer re-enters here with `optional` cleared.
  // (Finalized triggers already answered this at finalization — rule 402.1.)
  if (resolved.optional && !finalizeOnly) {
    if (!optInIsPerformable(resolved, draft, context)) {
      return undefined;
    }
    draft.pendingChoice = {
      type: "opt-in",
      playerId: resolved.controller,
      sourceCardId: resolved.cardId,
      resolved: { ...resolved, optional: false },
    };
    return undefined;
  }

  // rule 204.3.b (ogn-268-298): "Pay any amount of [rainbow] to …" is a
  // cost paid WITHIN the instructions, i.e. on resolution — after the
  // opponents' reaction window (359.3.c) and never as a play cost. Pause and
  // ask the controller how much Power to pay; the reducer binds `x` and
  // re-enters here.
  const xStore = resolved.effect as
    | { _variables?: Record<string, number>; _xPledged?: boolean }
    | undefined;
  // rule 204.3.b / 444.1: an X pledged when the spell was played is paid HERE,
  // out of Power, capped by what the pool actually holds now.
  let pledgePaid: number | undefined;
  if (!finalizeOnly && xCostIsPower(resolved.cardId) && xStore?._xPledged === true) {
    const power = draft.runePools[resolved.controller]?.power ?? {};
    const available = Object.values(power).reduce<number>((a, b) => a + (b ?? 0), 0);
    pledgePaid = Math.min(Math.max(0, xStore._variables?.x ?? 0), available);
    if (pledgePaid > 0) {
      deductAbilityCost(
        draft,
        resolved.controller,
        { power: Array.from({ length: pledgePaid }, () => "rainbow") },
        context.zones,
        context.counters,
      );
    }
  }
  if (
    !finalizeOnly &&
    pledgePaid === undefined &&
    xCostIsPower(resolved.cardId) &&
    xStore?._variables?.x === undefined
  ) {
    const pool = draft.runePools[resolved.controller];
    // rule 444.2: paying 0 is always legal, so `max` only bounds the offer.
    const max = Object.values(pool?.power ?? {}).reduce<number>((a, b) => a + (b ?? 0), 0);
    draft.pendingChoice = {
      max,
      playerId: resolved.controller,
      resolved,
      sourceCardId: resolved.cardId,
      type: "pay-x",
    };
    return undefined;
  }

  const rawEffect = resolved.effect as
    | (ExecutableEffect & { _variables?: Record<string, number> })
    | undefined;
  if (!rawEffect) {
    if (finalizeOnly) {
      return {};
    }
    // No stored effect — try to look up from card registry (fallback for spells)
    const registry = getGlobalCardRegistry();
    const abilities = registry.getAbilities(resolved.cardId) ?? [];
    const spellAbility = abilities.find((a) => a.type === "spell");
    const fallbackPreLen = draft.interaction?.chain?.items.length ?? 0;
    if (spellAbility?.effect) {
      const baseCtx = buildEffectContext(draft, resolved.controller, resolved.cardId, context);
      const effectCtx: EffectContext = resolved.targets
        ? { ...baseCtx, boundTargets: resolved.targets }
        : baseCtx;
      executeEffect(spellAbility.effect as ExecutableEffect, effectCtx);
    }
    // rule 419.4.a: a spell with no stored chain effect (vanilla/registry
    // lookup) still completes the act of being played — its play triggers
    // must fire exactly as on the normal path.
    firePlayedCardTriggers(resolved, draft, context, fallbackPreLen);
    return undefined;
  }

  // Strip any bound variables (e.g., X-cost value) before executing — they
  // Are threaded into the EffectContext so `{ variable: "x" }` expressions
  // Can resolve to the chosen X amount during spell resolution.
  const { _variables: storedVariables, _xPledged: _pledgeFlag, ...effectRest } = rawEffect as
    typeof rawEffect & { _xPledged?: boolean };
  const _variables =
    pledgePaid === undefined ? storedVariables : { ...(storedVariables ?? {}), x: pledgePaid };
  let effect = effectRest as ExecutableEffect;

  const baseCtx = buildEffectContext(draft, resolved.controller, resolved.cardId, context);

  // rule-id: ven-021-166 — expose the firing event's from/to zones so
  // `location: "move-to-or-from"` targets resolve against only the
  // battlefields the triggering move touched.
  const trigEvt = resolved.triggerEvent as
    | {
      from?: string;
      to?: string;
      cardId?: string;
      fromHiddenAt?: string;
      diedAt?: string;
      battlefieldId?: string;
      excessDamage?: number;
    }
    | undefined;
  // rule 626.1.d.2 (rule-id: sfd-120-221, ogn-034-298) — "deal that much": the
  // conquer event carries the excess damage the attackers assigned, and
  // `{ variable: "excess-damage" }` amounts read it. The value is substituted
  // into the effect itself (not just the context) because the amount must
  // survive a resolution-time target prompt, which re-executes the stored
  // effect from `pending-choice.ts` with a fresh context.
  const mergedVariables: Record<string, number> | undefined =
    _variables !== undefined || typeof trigEvt?.excessDamage === "number"
      ? {
        ...(_variables ?? {}),
        ...(typeof trigEvt?.excessDamage === "number"
          ? { "excess-damage": trigEvt.excessDamage }
          : {}),
      }
      : undefined;
  if (typeof trigEvt?.excessDamage === "number") {
    effect = bindNamedAmounts(effect, { "excess-damage": trigEvt.excessDamage });
  }
  // rule 428.1.a.1.b — a dies-trigger sees the board as it was: "here" / "at my
  // battlefield" mean where the unit died, not the trash it now sits in.
  if (typeof trigEvt?.diedAt === "string" && trigEvt.cardId === resolved.cardId) {
    (baseCtx as { sourceZone?: string }).sourceZone = trigEvt.diedAt;
  }
  // rule 359.3.f.3 (unl-082-219, the rule's own example) — "when I move from a
  // location, … there": "there" is the ORIGIN, snapshotted when the move
  // happened. Expose it so `location: "origin"` effects ignore where the mover
  // ended up (or that it was bounced away in response).
  if (typeof trigEvt?.from === "string") {
    (baseCtx as { triggerFrom?: string }).triggerFrom = trigEvt.from;
  }
  const triggerZones = trigEvt
    ? [trigEvt.from, trigEvt.to].filter((z): z is string => typeof z === "string")
    : undefined;
  // rule-id: unl-133-219 — the firing event's subject card ("…[Stun] it").
  const triggerSourceId = typeof trigEvt?.cardId === "string" ? trigEvt.cardId : undefined;
  // rule-id: ogn-097-298 — Rule 723.1.d (811.1.d.2): a card played from Hidden
  // may only choose targets at the battlefield it was facedown at.
  const hiddenZone =
    typeof trigEvt?.fromHiddenAt === "string" ? `battlefield-${trigEvt.fromHiddenAt}` : undefined;
  // rule 811.1 (unl-042-219) — played from Hidden, not from hand: collapse any
  // "if you played this from your hand" gate to its `else` branch now.
  if (hiddenZone !== undefined) {
    effect = resolvePlayedFromHandGates(effect, false);
  }

  // Rule 355.10: for a resolved effect that targets a caster-chosen single
  // card ("give a unit X"), the controller picks which card. When targets
  // were not bound at chain-placement time and more than one legal option
  // exists, pause and ask via a `choose-target` pending choice; the effect
  // runs from `resolvePendingChoice` once the pick is made.
  let boundTargets = resolved.targets;
  // rule 758.1 / 758.2.a (unl-057-219 × ogn-172-298): a target that became
  // untargetable for this controller AFTER being chosen is an illegal target on
  // resolution. Drop it; if nothing legal is left the item still resolves but
  // does nothing (rule 359.3.e.5).
  let mistargeted = false;
  if (boundTargets && boundTargets.length > 0) {
    const resolverCtx = {
      cards: baseCtx.cards,
      draft,
      playerId: resolved.controller,
      sourceCardId: resolved.cardId,
      sourceZone: baseCtx.sourceZone,
      zones: baseCtx.zones,
    };
    const controllerOf = (id: string): string =>
      baseCtx.cards.getCardController?.(id as CoreCardId) ??
      baseCtx.cards.getCardOwner(id as CoreCardId) ??
      "";
    // rule 359.3.e.5 (ogn-169-298): a chosen target that has LEFT the board
    // before the item resolves (bounced to hand, recycled to a deck) is no
    // longer legal — the item resolves but does nothing to it. Effects that
    // deliberately reach into a private zone (playing a card from hand/trash)
    // keep their targets.
    const targetLocation = (effect.target as { location?: unknown } | undefined)?.location;
    const reachesPrivateZones =
      effect.type === "play" ||
      (typeof targetLocation === "string" &&
        ["hand", "deck", "trash", "anywhere"].includes(targetLocation));
    // Runes live in the rune pool / rune deck and are still legal targets for
    // "ready a rune"-style effects, so only the hand and Main Deck count as
    // having left play here.
    const OFF_BOARD_ZONES = ["hand", "mainDeck"];
    const stillOnBoard = (id: string): boolean => {
      if (reachesPrivateZones) {
        return true;
      }
      const zone = baseCtx.zones.getCardZone(id as CoreCardId);
      return typeof zone !== "string" || !OFF_BOARD_ZONES.includes(zone);
    };
    // rule 359.3.e.5 (ogn-213-298 × ogs-011-024): a target chosen at play time
    // that no longer satisfies the descriptor's LOCATION when the item resolves
    // (a "unit at a battlefield" recalled to base) is an illegal target.
    const lockedTarget = (effect.target ??
      findSequenceLeadTarget(effect as unknown as SpellEffectTargetShape)) as
      | { location?: unknown }
      | string
      | undefined;
    const lockedLocation =
      typeof lockedTarget === "object" && lockedTarget !== null
        ? (lockedTarget as { location?: unknown }).location
        : undefined;
    // rule-id: ogn-250-298 — a Might-reference unit locked alongside the
    // damage step's own target has its OWN location ("a friendly unit in your
    // base"); judge it against that descriptor, not the damage step's.
    const refDesc = findAmountReferenceTarget(effect as unknown as SpellEffectTargetShape);
    const refLocation =
      typeof refDesc === "object" && refDesc !== null
        ? (refDesc as { location?: unknown }).location
        : undefined;
    const locationStillMatches = (id: string): boolean => {
      if (lockedLocation !== "battlefield" && lockedLocation !== "base") {
        return true;
      }
      if (refLocation !== undefined && refLocation !== lockedLocation) {
        const zone = baseCtx.zones.getCardZone(id as CoreCardId);
        if (refLocation === "base" ? zone === "base" : String(zone).startsWith("battlefield-")) {
          return true;
        }
      }
      // A bound battlefield id ("all enemy units at a battlefield") is a place,
      // not a card in a zone — the location check does not apply to it.
      if (draft.battlefields?.[id] !== undefined) {
        return true;
      }
      const zone = baseCtx.zones.getCardZone(id as CoreCardId);
      return lockedLocation === "base"
        ? zone === "base"
        : typeof zone === "string" && zone.startsWith("battlefield-");
    };
    // rule 359.3.e.4 / 355.9.b (sfd-162-221) — a Might-restricted target
    // ("a unit with 2 [Might] or less") is judged on its CURRENT Might when
    // the item resolves, so a target pumped out of range in response is no
    // longer legal.
    const lockedMight =
      typeof lockedTarget === "object" && lockedTarget !== null
        ? ((lockedTarget as { filter?: { might?: unknown } }).filter?.might as
            | { lte?: number; gte?: number; eq?: number }
            | undefined)
        : undefined;
    const mightStillMatches = (id: string): boolean => {
      if (lockedMight === undefined || draft.battlefields?.[id] !== undefined) {
        return true;
      }
      const might = getCardEffectiveMight(
        id,
        (m) => baseCtx.cards.getCardMeta?.(m) as Partial<RiftboundCardMeta> | undefined,
      );
      if (lockedMight.lte !== undefined && might > lockedMight.lte) return false;
      if (lockedMight.gte !== undefined && might < lockedMight.gte) return false;
      if (lockedMight.eq !== undefined && might !== lockedMight.eq) return false;
      return true;
    };
    // rule 359.3.e.4–5 / 359.3.f.2 — a trigger finalized through the dialog
    // chose its Game Objects against the descriptor as it read THEN; on
    // resolution each one must still satisfy that descriptor as it reads NOW
    // ("an enemy unit here" after the source or the target moved, "with less
    // Might than me" after a pump). Illegal ones are dropped, never replaced.
    const finalizedTrigger = resolved.triggered === true && resolved.status === "finalized";
    const fightDefenderDesc =
      effect.type === "fight" && typeof (effect as { attacker?: unknown }).attacker === "string"
        ? ((effect as { defender?: unknown }).defender as TargetDescriptor | undefined)
        : undefined;
    const slotDescriptors: TargetDescriptor[] = !finalizedTrigger || reachesPrivateZones
      ? []
      : typeof (effect.target ?? fightDefenderDesc) === "object"
        ? [(effect.target ?? fightDefenderDesc) as TargetDescriptor]
        : ((collectSequenceTargetSlots(effect as unknown as SpellEffectTargetShape) ??
            []) as TargetDescriptor[]);
    const slotPools = slotDescriptors
      .filter((d) => typeof d.type === "string" && d.type !== "self" && d.type !== "trigger-source")
      .map((d) => {
        let pool = resolveTarget({ ...d, quantity: "all" }, {
          ...resolverCtx,
          choosing: true,
          triggerSourceId,
          triggerZones,
        } as Parameters<typeof resolveTarget>[1]) as string[];
        // rule 811.1.d.2 — chosen from a facedown battlefield: must still be there.
        if (hiddenZone && !hiddenChoiceIsPulledIn(effect as SpellEffectTargetShape)) {
          pool = pool.filter((x) => baseCtx.zones.getCardZone(x as CoreCardId) === hiddenZone);
        }
        return pool;
      });
    const stillChoosable = (id: string): boolean =>
      slotPools.length === 0 ||
      draft.battlefields?.[id] !== undefined ||
      slotPools.some((pool) => pool.includes(id));
    const legal = boundTargets.filter(
      (id) =>
        stillOnBoard(id) &&
        locationStillMatches(id) &&
        mightStillMatches(id) &&
        stillChoosable(id) &&
        !(
          controllerOf(id) !== resolved.controller &&
          (isUntargetable(id, resolverCtx) || isProtectedFromEnemyChoice(id, resolverCtx))
        ),
    );
    if (legal.length !== boundTargets.length) {
      // rule 359.3.e.5 (unl-110-219) — "choose two units. They deal damage
      // equal to their Mights to each other" links both choices: if either
      // chosen unit has left the board the whole instruction does nothing and
      // no bystander is substituted for the missing one.
      const linkedFight =
        effect.type === "fight" &&
        typeof (effect as { attacker?: unknown }).attacker === "object" &&
        typeof (effect as { defender?: unknown }).defender === "object";
      boundTargets = legal;
      mistargeted = legal.length === 0 || linkedFight;
    }
  }
  // rule-id: unl-119-219 (rule 355.10) — a `sequence` ("spend 3 XP, then deal
  // damage to an enemy unit here") carries its caster-chosen target on a
  // sub-step; lift the single lead descriptor so the controller is prompted
  // instead of the step auto-picking the first candidate.
  // rule-id: ogn-149-298 (rule 355.10) — "choose an enemy unit at a
  // battlefield. We deal damage equal to our Mights to each other": a `fight`
  // with a fixed attacker ("self") lets the controller choose only the
  // defender, so lift that descriptor into the choose-target prompt.
  const fightDefender =
    effect.type === "fight" && typeof (effect as { attacker?: unknown }).attacker === "string"
      ? ((effect as { defender?: unknown }).defender as TargetDescriptor | undefined)
      : undefined;
  const target = (effect.target ??
    fightDefender ??
    findSequenceLeadTarget(effect as unknown as SpellEffectTargetShape)) as
    | TargetDescriptor
    | string
    | undefined;
  if (
    !boundTargets &&
    target &&
    // ogn-122-298: bare-string target ("self" / instanceId) is already fully
    // specified — never route through the choose-target prompt.
    typeof target !== "string" &&
    target.type !== "self" &&
    // rule-id: unl-133-219 — "it" (trigger-source) is a fixed referent, not a choice.
    target.type !== "trigger-source" &&
    target.type !== "player" &&
    target.type !== "battlefield" &&
    target.quantity !== "all" &&
    // rule-id: ogn-107-298 / ogn-226-298 — "play a card … from your hand /
    // your trash": neither zone is a board zone the resolver scans, so a
    // board-wide prompt here would offer the wrong cards. The play handler
    // gathers candidates from that private zone itself (rule 355.10).
    !(
      effect.type === "play" &&
      ((effect as { from?: unknown }).from === "hand" || (effect as { from?: unknown }).from === "trash")
    ) &&
    // rule 355.14 (ogn-041-298): split damage picks its targets together with
    // the distribution in the damage handler, not as a single-target prompt.
    !(effect.type === "damage" && (effect as { split?: boolean }).split === true) &&
    // rule 422.1.a (unl-174-219) — "each opponent must kill one of THEIR
    // units" is a per-player instruction: every chooser is asked by the kill
    // handler about their OWN units, never the source's controller here.
    !(effect.type === "kill" && (effect as { player?: unknown }).player === "each")
  ) {
    let options = resolveTarget(
      { ...target, quantity: "all" },
      {
        cards: baseCtx.cards,
        // rule-id: ven-031-166 — choose-target pool honours "can't be chosen".
        choosing: true,
        draft,
        playerId: resolved.controller,
        sourceCardId: resolved.cardId,
        sourceZone: baseCtx.sourceZone,
        triggerSourceId,
        triggerZones,
        zones: baseCtx.zones,
      },
    );
    // rule-id: ogn-097-298 — Rule 723.1.d (811.1.d.2): played-from-Hidden
    // targets must be at the associated battlefield.
    // rule 811.1.d.2.a (ven-034-166) — except when the spell PULLS its chosen
    // object into that battlefield: the battlefield is then the destination and
    // the object is chosen freely from anywhere.
    if (hiddenZone && !hiddenChoiceIsPulledIn(effect as SpellEffectTargetShape)) {
      options = options.filter(
        (id) => baseCtx.zones.getCardZone(id as CoreCardId) === hiddenZone,
      );
    }
    // rule 355.4.a (unl-112-219) — a choice must be able to do something: a
    // unit already standing AT the destination cannot "move to" that
    // battlefield, so it is never offered for a move whose destination is
    // already fixed ("to that battlefield" / an explicit battlefield).
    let fixedMoveDest: string | undefined;
    if (effect.type === "move") {
      const to = (effect as { to?: unknown }).to;
      const destZone =
        to === "same"
          ? typeof trigEvt?.to === "string"
            ? trigEvt.to
            : undefined
          : typeof to === "string" && to.startsWith("battlefield-")
            ? to
            : undefined;
      if (typeof destZone === "string" && destZone.startsWith("battlefield-")) {
        fixedMoveDest = destZone;
        options = options.filter(
          (id) => baseCtx.zones.getCardZone(id as CoreCardId) !== destZone,
        );
      }
    }
    // rule 809.1.c / 809.1.d (721.1.c): Deflect taxes ABILITIES as well as
    // spells — an opponent choosing a Deflect card with a triggered or
    // activated ability owes a mandatory additional cost of Power of any
    // Domain (rule 809.1.c.1), incurred when the target is chosen. A target
    // whose surcharge the controller cannot pay is not a legal choice; when
    // none remain the pending ability is removed without resolving
    // (rule 404.2 — removed, NOT countered). The auto-bound single candidate
    // is charged here; a prompted multi-candidate pick carries `deflectTax` on
    // the prompt and is charged at pick time in `pending-choice.ts`.
    let deflectTax = false;
    if (resolved.type !== "spell" && options.length > 0) {
      const surchargeOf = (id: string): number =>
        getDeflectSurcharge(draft, resolved.controller, [id], baseCtx.cards);
      const available = totalPooledPower(draft, resolved.controller);
      deflectTax = options.some((id) => surchargeOf(id) > 0);
      if (deflectTax) {
        const payable = options.filter((id) => surchargeOf(id) <= available);
        if (payable.length === 0) {
          return finalizeOnly ? { remove: true } : undefined;
        }
        options = payable;
      }
    }
    // rule-id: ogn-256-298 (rule 355.13) — "any number of <units>": the
    // controller picks 0..n (declining is legal even with one candidate), so
    // prompt whenever any candidate exists; candidates that alone breach the
    // descriptor's aggregate cap (`totalMight`) are never legal.
    const quantity = (target as { quantity?: unknown }).quantity;
    const anyNumber = quantity === "any";
    // rule 355.13 (ogn-073-298): "up to N <things>" — the controller picks
    // 0..N distinct targets; picks accumulate like "any number" capped at N.
    const upTo =
      typeof quantity === "object" && quantity !== null && typeof (quantity as { upTo?: unknown }).upTo === "number"
        ? ((quantity as { upTo: number }).upTo as number)
        : undefined;
    if (upTo !== undefined && upTo > 1 && options.length >= 2) {
      // Multi-pick shapes ("up to N" / "any number of") keep their
      // accumulate-until-declined prompt at resolution for now.
      if (finalizeOnly) {
        return {};
      }
      draft.pendingChoice = {
        type: "choose-target",
        playerId: resolved.controller,
        sourceCardId: resolved.cardId,
        effect,
        options,
        remaining: Math.min(upTo, options.length),
        anyNumber: true,
        maxPicks: upTo,
        picked: [],
        ...(deflectTax ? { deflectTax: true as const } : {}),
      };
      return undefined;
    }
    if (anyNumber) {
      if (finalizeOnly) {
        return {};
      }
      const legal = options.filter((id) =>
        isLegalMultiTargetSet(target as Parameters<typeof isLegalMultiTargetSet>[0], [id], {
          getCardZone: (c) => baseCtx.zones.getCardZone(c as CoreCardId),
          getMight: (c) =>
            getCardEffectiveMight(c, (m) =>
              baseCtx.cards.getCardMeta?.(m) as Partial<RiftboundCardMeta> | undefined,
            ),
        }),
      );
      if (legal.length >= 1) {
        draft.pendingChoice = {
          type: "choose-target",
          playerId: resolved.controller,
          sourceCardId: resolved.cardId,
          effect,
          options: legal,
          remaining: legal.length,
          anyNumber: true,
          // rule-id: sfd-079-221 (rule 355.13 / 449) — "move any number of your
          // units to an open battlefield" is ONE simultaneous choice followed by
          // ONE move, so the chooser names the whole set in a single answer
          // instead of accumulating one unit per prompt.
          ...(effect?.type === "move" ? { answerAsSet: true } : {}),
          picked: [],
          ...(deflectTax ? { deflectTax: true as const } : {}),
        };
        return undefined;
      }
      boundTargets = [];
    } else if (
      options.length >= 2 ||
      (fixedMoveDest !== undefined && options.length === 1) ||
      // rule 383.3.b.1 (rule-id: ven-082-166) — paying a cost is the
      // controller's own deliberate choice, so it is prompted even when only
      // one legal payment exists.
      ((target as { promptWhenSingle?: boolean }).promptWhenSingle === true &&
        options.length === 1)
    ) {
      // rule 355.10 (unl-112-219) — dragging a unit to a destination the
      // trigger already fixed is still the controller's public choice, so it is
      // prompted even when 355.4.a leaves exactly one legal candidate.
      draft.pendingChoice = {
        type: "choose-target",
        playerId: resolved.controller,
        sourceCardId: resolved.cardId,
        effect,
        options,
        remaining: 1,
        // rule 402.2 — while finalizing, the pick is bound onto the item.
        ...bindTag,
        // rule 359.3.f.3 (unl-112-219) — "move an enemy unit to THAT
        // battlefield": the destination is fixed by the triggering move, so it
        // must survive the target prompt.
        ...(typeof trigEvt?.to === "string" ? { triggerToZone: trigEvt.to } : {}),
        // rule 809.1.c.1 — the surcharge for choosing a [Deflect] card is owed
        // at PICK time; the prompt carries the obligation to `pending-choice.ts`.
        ...(deflectTax ? { deflectTax: true as const } : {}),
      };
      return undefined;
    } else {
      // rule 402.4 — a Pending trigger with no legal option for a choice it
      // must make is removed from the Chain (never finalized, not countered).
      // "Up to one …" may legally choose nothing (rule 355.13), so it stays.
      // Only an unambiguous BOARD choice counts: descriptors reaching a private
      // zone or owned by a `play`/"from …" step gather their own candidates at
      // resolution and are left to it.
      if (finalizeOnly && options.length === 0) {
        const owner = stepOwningTarget(effect, target) as
          | { type?: string; from?: unknown; player?: unknown }
          | undefined;
        const loc = (target as { location?: unknown }).location;
        const boardChoice =
          upTo === undefined &&
          (target as { optional?: boolean }).optional !== true &&
          !(typeof loc === "string" && ["hand", "deck", "trash", "anywhere", "banishment"].includes(loc)) &&
          owner?.type !== "play" &&
          owner?.from === undefined &&
          owner?.player === undefined;
        return boardChoice ? { remove: true } : {};
      }
      boundTargets = options;
      if (deflectTax && boundTargets.length > 0) {
        payAnyDomainPower(
          draft,
          resolved.controller,
          getDeflectSurcharge(draft, resolved.controller, [...boundTargets], baseCtx.cards),
        );
      }
    }
  }

  // rule-id: ogs-002-024 (rule 355.8) — "all enemy units at A battlefield"
  // with no battlefield locked at play time: the controller picks one now.
  // Only battlefields where the descriptor matches ≥1 card are meaningful
  // options; with a single such battlefield it is auto-picked.
  if (!boundTargets && isAllAtOneBattlefield(effect.target)) {
    const bfIds = Object.keys(draft.battlefields ?? {});
    const withMatches = bfIds.filter(
      (bfId) =>
        resolveTarget(effect.target as TargetDescriptor, {
          battlefieldZone: `battlefield-${bfId}`,
          cards: baseCtx.cards,
          draft,
          playerId: resolved.controller,
          sourceCardId: resolved.cardId,
          sourceZone: baseCtx.sourceZone,
          zones: baseCtx.zones,
        }).length > 0,
    );
    if (withMatches.length >= 2) {
      draft.pendingChoice = {
        type: "choose-target",
        playerId: resolved.controller,
        sourceCardId: resolved.cardId,
        effect,
        options: withMatches,
        remaining: 1,
        ...bindTag,
      };
      return undefined;
    }
    if (withMatches.length === 1) {
      boundTargets = [withMatches[0] as string];
    }
  }
  // rule 402.2 / 337.4 — finalization stops here: the bound Game Objects ride
  // on the item and the effect itself waits for resolution.
  if (finalizeOnly) {
    return boundTargets ? { targets: boundTargets } : {};
  }

  const effectCtx: EffectContext = {
    ...baseCtx,
    ...(mergedVariables ? { variables: mergedVariables } : {}),
    ...(boundTargets ? { boundTargets } : {}),
    ...(triggerSourceId ? { triggerSourceId } : {}),
    // rule-id: ogn-177-298 — where the triggering move went ("with it").
    ...(typeof trigEvt?.to === "string" ? { triggerToZone: trigEvt.to } : {}),
    // rule 359.3.f.3 (sfd-126-221) — the battlefield the firing event names
    // ("when you defend at a battlefield … move me there").
    ...(typeof trigEvt?.battlefieldId === "string"
      ? { triggerBattlefieldZone: `battlefield-${trigEvt.battlefieldId}` }
      : {}),
    // rule 811.1.d.3: units played by a from-Hidden card go to that battlefield.
    ...(hiddenZone ? { hiddenZone } : {}),
    // rule 560 (unl-164-219) — a play-self trigger's "if you paid my additional
    // cost" reads the paid flag carried by the firing event.
    ...((trigEvt as { paidAdditionalCost?: boolean } | undefined)?.paidAdditionalCost === true
      ? { paidAdditionalCost: true }
      : {}),
  } as EffectContext;
  // Rule 359.2: "when you choose me" triggers fire when a spell/ability's
  // controller picks a card as a target.
  // rule-id: sfd-142-221 (383.4.b.2) / sfd-052-221 (355.14.b) — play-time
  // targets (spell or activated ability) already fired `choose` at
  // finalization; only fire here for targets picked at resolution.
  // rule 402.2 — a trigger finalized through the dialog chose (and fired
  // `choose` for) its targets then, too.
  const choseAtFinalize =
    !!resolved.targets && (!resolved.triggered || resolved.status === "finalized");
  if (!choseAtFinalize && boundTargets && boundTargets.length > 0) {
    const trigCtx = { cards: context.cards, counters: context.counters, draft, zones: context.zones };
    // rule-id: sfd-142-221 — carry the source kind so "choose me with a
    // spell" triggers don't fire on gear/unit ability choices.
    const sourceType = resolved.type === "spell" ? "spell" : "ability";
    for (const targetId of boundTargets) {
      fireTriggers(
        { cardId: targetId, chooserId: resolved.controller, sourceType, type: "choose" },
        trigCtx,
      );
    }
  }
  const preLen = draft.interaction?.chain?.items.length ?? 0;
  // rule 359.3.e.5 (ogn-242-298) — illegality is judged per INSTRUCTION: a
  // sequence whose lead step lost its only target ("Kill a friendly unit.
  // Look at the top 5 cards…") still performs its remaining instructions.
  // A single-instruction effect resolves but does nothing.
  // rule 359.3.e.4 (sfd-162-221) — when the sequence itself owns the target
  // ("Kill a unit …. If it was an enemy unit, …"), every instruction depends on
  // that one choice, so an illegal target means the whole item does nothing.
  // rule 359.3.e.5 / 359.3.e.8 (unl-072-219) — "…and 1 to each other enemy unit
  // there" is its own instruction, aimed at the battlefield chosen when the
  // spell was played. Losing the primary unit mistargets only that instruction;
  // the splash still resolves on the units left behind.
  // rule 359.3.e.5 / 359.3.e.12 (unl-200-219) — "Choose a unit. Play a ready
  // Reflection token. It becomes a copy of that unit": the token is played by an
  // instruction that names no target, so losing the chosen unit skips only the
  // copy step. `create-token` reads its target purely as the copy source.
  const splashRider =
    mistargeted &&
    typeof (effect as { splashOthers?: unknown }).splashOthers === "number" &&
    typeof (effect as { _splashZone?: unknown })._splashZone === "string";
  if (splashRider) {
    executeEffect({ ...(effect as object), _splashOnly: true } as ExecutableEffect, effectCtx);
  } else if (
    !mistargeted ||
    effect.type === "create-token" ||
    (effect.type === "sequence" && effect.target === undefined)
  ) {
    executeEffect(effect, effectCtx);
  }
  firePlayedCardTriggers(resolved, draft, context, preLen);
}

/**
 * Rule 419.4.a: abilities that trigger on playing a card fire when that act is
 * completed by resolution — not when the card is placed on the chain, and
 * never if the card was countered (425.1.b). `preLen` is the chain length
 * captured before the spell's own effect ran.
 */
function firePlayedCardTriggers(
  resolved: ChainItem,
  draft: RiftboundGameState,
  context: Parameters<typeof buildEffectContext>[3],
  preLen: number,
): void {
  if (resolved.type !== "spell") {
    return;
  }
  const postLen = draft.interaction?.chain?.items.length ?? 0;
  const trigCtx = {
    cards: context.cards,
    counters: context.counters,
    draft,
    zones: context.zones,
  };
  fireTriggers(
    { cardId: resolved.cardId, playerId: resolved.controller, type: "play-spell" },
    trigCtx,
  );
  fireTriggers(
    {
      cardId: resolved.cardId,
      cardType: "spell",
      playerId: resolved.controller,
      type: "play-card",
    },
    trigCtx,
  );
  // Rule 354.2 / 383.2.c / 337.1.b: a pending play the resolving spell put on
  // the chain (Thrill of the Hunt banish→play) must finalize BEFORE any
  // trigger that becomes pending because the spell was played (Abandoned
  // Hall). Lift the effect-added items back above the just-queued triggers so
  // the replayed unit is on the board when the trigger's target is chosen.
  const chain = draft.interaction?.chain;
  if (chain && postLen > preLen && chain.items.length > postLen) {
    const items = chain.items as ChainItem[];
    const pendingPlays = items.splice(preLen, postLen - preLen);
    // rule 337.1.b — those plays were appended first, so their finalization
    // (the location prompt as they resolve) precedes the triggers' dialog.
    const blockers = pendingPlays.map((it) => it.id);
    for (let i = preLen; i < items.length; i++) {
      const it = items[i] as ChainItem;
      if (it.status === "pending") {
        items[i] = { ...it, finalizeAfter: [...(it.finalizeAfter ?? []), ...blockers] };
      }
    }
    items.push(...pendingPlays);
  }
}

/**
 * rule 571 / rule-id: ven-022-166 — "If a card would go to your trash from
 * anywhere other than your Main Deck, banish it instead." A blanket zone-change
 * replacement owned by a permanent on the board rather than a per-event
 * `{type:"replacement"}` ability. Recognised from an explicit
 * `{type:"trash-to-banish"}` static effect or from the printed clause while the
 * card's text is still `raw`.
 */
function hasTrashToBanishReplacement(
  state: RiftboundGameState,
  context: Parameters<typeof buildEffectContext>[3],
  ownerId: string,
): boolean {
  const registry = getGlobalCardRegistry();
  const zoneIds = [
    "base",
    ...Object.keys(state.battlefields ?? {}).map((bfId) => `battlefield-${bfId}`),
  ];
  for (const zoneId of zoneIds) {
    for (const cardId of context.zones.getCardsInZone(
      zoneId as CoreZoneId,
      ownerId as CorePlayerId,
    )) {
      for (const ability of registry.getAbilities(cardId as string) ?? []) {
        const effect = (ability as { effect?: { type?: string; text?: string } })?.effect;
        if (effect?.type === "trash-to-banish") {
          return true;
        }
        if (
          typeof effect?.text === "string" &&
          /if a card would go to your trash from anywhere other than your main deck, banish it instead/i.test(
            effect.text,
          )
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * rule-id: unl-007-219 — a spell card stays in the "chain" zone while its
 * chain item is pending; once it leaves the chain (resolved or countered)
 * place it in the owner's trash (or banishment for [Flow] plays). If the
 * spell's own effect already moved the card elsewhere, leave it there.
 */
export function settleResolvedSpellCard(
  resolved: ChainItem,
  context: Parameters<typeof buildEffectContext>[3],
  draft?: RiftboundGameState,
): void {
  if (resolved.type !== "spell") {
    return;
  }
  if (context.zones.getCardZone(resolved.cardId as CoreCardId) !== ("chain" as CoreZoneId)) {
    return;
  }
  let targetZone = (resolved.resolveTo ?? "trash") as string;
  // rule 571 / rule-id: ven-022-166 — the spell leaves the CHAIN, not the Main
  // Deck, so a controller-wide "would go to your trash … banish it instead"
  // replacement redirects it to banishment.
  if (
    targetZone === "trash" &&
    draft !== undefined &&
    hasTrashToBanishReplacement(draft, context, resolved.controller as string)
  ) {
    targetZone = "banishment";
  }
  context.zones.moveCard({
    cardId: resolved.cardId as CoreCardId,
    targetZoneId: targetZone as CoreZoneId,
  });
}

/**
 * Pass priority during a chain (rule 540.4)
 *
 * The active player passes. If all relevant players pass,
 * the top item on the chain resolves and its effect executes.
 */
export const passChainPriority: Defs["passChainPriority"] = {
  condition: (state, context) => {
    if (state.pendingChoice) {
      return false;
    }
    if (!state.interaction?.chain?.active) {
      return false;
    }
    return state.interaction.chain.activePlayer === context.params.playerId;
  },
  enumerator: (state, context) => {
    if (state.pendingChoice) {
      return [];
    }
    if (!state.interaction?.chain?.active) {
      return [];
    }
    if (state.interaction.chain.activePlayer !== (context.playerId as string)) {
      return [];
    }
    return [{ playerId: context.playerId as string }];
  },
  reducer: (draft, context) => {
    if (!draft.interaction) {
      return;
    }

    draft.interaction = passPriorityState(draft.interaction);

    // If all passed, auto-resolve the top item
    if (allPlayersPassed(draft.interaction)) {
      const { resolved, newState } = resolveTopItem(draft.interaction);
      draft.interaction = newState;

      if (resolved) {
        withChainItemResolution(() => {
          executeResolvedItem(resolved, draft, context);
          settleResolvedSpellCard(resolved, context, draft);
        });
        runPostResolutionVictoryCheck(draft);

        // Run state-based checks after resolution (rule 543.3/518).
        // rule-id: ogn-246-298 — units reaped here must emit `die` so
        // "when a friendly unit dies" / Deathknell triggers fire.
        cleanupAndFireDeaths(draft, context);
        // rule-id: ogn-270-298 (rules 323.13 / 320.1) — open the showdown of a
        // battlefield an effect-moved unit contested during this resolution.
        openPendingContestedShowdown(
          draft,
          context as unknown as Parameters<typeof openPendingContestedShowdown>[1],
        );
      }
    }
  },
};

/**
 * Manually resolve the top item on the chain (rule 543)
 *
 * Called after all players have passed priority.
 */
export const resolveChain: Defs["resolveChain"] = {
  condition: (state) => {
    if (state.pendingChoice) {
      return false;
    }
    if (!state.interaction?.chain?.active) {
      return false;
    }
    return allPlayersPassed(state.interaction);
  },
  enumerator: (state) => {
    if (state.pendingChoice) {
      return [];
    }
    if (!state.interaction?.chain?.active) {
      return [];
    }
    if (!allPlayersPassed(state.interaction)) {
      return [];
    }
    return [{}];
  },
  reducer: (draft, context) => {
    if (!draft.interaction) {
      return;
    }

    const { resolved, newState } = resolveTopItem(draft.interaction);
    draft.interaction = newState;

    if (resolved) {
      withChainItemResolution(() => {
        executeResolvedItem(resolved, draft, context);
        settleResolvedSpellCard(resolved, context, draft);
      });
      runPostResolutionVictoryCheck(draft);

      // rule-id: ogn-246-298 — SBA deaths after resolution emit `die`.
      cleanupAndFireDeaths(draft, context);
      // rule-id: ogn-270-298 (rules 323.13 / 320.1) — a unit an effect moved
      // into an enemy battlefield contested it; the Cleanup after the chain
      // empties opens that showdown mandatorily.
      openPendingContestedShowdown(draft, context as unknown as Parameters<typeof openPendingContestedShowdown>[1]);
    }
  },
};
