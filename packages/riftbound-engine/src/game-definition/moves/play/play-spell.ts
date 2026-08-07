/**
 * playSpell move (split from cards.ts).
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import {
  isAllAtOneBattlefield,
  isUntargetable,
  resolveTarget,
} from "../../../abilities/target-resolver";
import { playIsForbidden } from "../../../abilities/play-restrictions";
import { fireTriggers } from "../../../abilities/trigger-runner";
import {
  addToChain,
  createInteractionState,
  getTurnState,
  hasChainPriorityPermission,
  hasShowdownPermission,
  isLegalTiming,
} from "../../../chain";
import type { TimingClass } from "../../../chain";
import { isLegalCounterTarget } from "../../../chain/counter-target";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import { removeFromBoard } from "../../../operations/leave-board";
import { executeEffect } from "../../../abilities/effect-executor";
import type { CostExtras } from "./cost";
import {
  getOptionalPlayCost,
  createMetaAccessor,
  getCardEffectiveMight,
  getPotentialRuneEnergy,
  canAffordCard,
  deductCost,
  getEffectiveSpellRepeatCost,
  getFlowCostForPlay,
  xCostIsPower,
} from "./cost";
import type { SpellEffectTargetShape } from "./targeting";
import {
  chosenMoveDestinations,
  collectIndependentTargetSlots,
  collectSequenceTargetSlots,
  findAllAtOneBattlefieldTarget,
  findAmountReferenceDamageTarget,
  findAmountReferenceTarget,
  findReplacementChosenTarget,
  findSequenceLeadTarget,
  findSplitDamageEffect,
  enumerateSubsetsUpTo,
  offBoardPlayIsCasterChosen,
  offBoardPlayZone,
  spellEffectHasLegalTargets,
} from "./targeting";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * rule 356.2 — ogn-048-298: legal choices for a spell's optional "you may
 * exhaust a friendly X" additional cost: matching permanents that are ready
 * (an exhausted permanent cannot pay an exhaust cost). The chosen one rides
 * as `targets[0]` of the paid variant and is stripped before the spell's own
 * targets are locked on the chain.
 */
function exhaustCostCandidates(
  state: RiftboundGameState,
  context: {
    cards: unknown;
    zones: Parameters<typeof resolveTarget>[1]["zones"];
    counters: { getFlag: (cardId: CoreCardId, flag: string) => boolean | undefined };
  },
  playerId: string,
  cardId: string,
  descriptor: unknown,
): string[] {
  const ids = resolveTarget(
    { ...(descriptor as Record<string, unknown>), quantity: "all" } as Parameters<
      typeof resolveTarget
    >[0],
    {
      cards: context.cards as Parameters<typeof resolveTarget>[1]["cards"],
      draft: state,
      playerId,
      sourceCardId: cardId,
      zones: context.zones,
    },
  ) as string[];
  return ids.filter((id) => !context.counters.getFlag(id as CoreCardId, "exhausted"));
}

/**
 * rule-id: unl-131-219 (rule 355.8) — the counter effect a spell leads with,
 * whether it is the whole spell ("Counter a spell") or the first step of a
 * sequence ("Counter a spell… [Predict]"). Either way the spell to counter is
 * a caster-chosen target locked at play time, so both shapes take the
 * chain-item targeting branch instead of falling through to "no targets".
 */
function leadCounterEffect(effect: unknown): { target?: unknown } | undefined {
  const e = effect as { type?: string; effects?: unknown[] } | undefined;
  if (e?.type === "counter") {
    return e as { target?: unknown };
  }
  if (e?.type === "sequence" && Array.isArray(e.effects)) {
    const first = e.effects[0] as { type?: string } | undefined;
    if (first?.type === "counter") {
      return first as { target?: unknown };
    }
  }
  return undefined;
}

/**
 * The counter whose chain-item target the caster locks at play time. A spell
 * that is only a counter always qualifies; a sequence qualifies when the
 * counter is its lead step and no LATER step names a board target of its own
 * (sfd-206-221 Riposte's "…give a friendly unit +Might" owns the play-time
 * pick, so its counter keeps the resolution-time topmost-spell rule).
 */
function counterChainTarget(effect: unknown): { target?: unknown } | undefined {
  const spec = leadCounterEffect(effect);
  if (spec === undefined) {
    return undefined;
  }
  if ((effect as { type?: string } | undefined)?.type === "counter") {
    return spec;
  }
  return findSequenceLeadTarget(effect as SpellEffectTargetShape | undefined) === undefined
    ? spec
    : undefined;
}

/**
 * rule 356.2.b / 702.2.b (ogn-146-298 Wallop) — friendly units carrying a buff
 * counter, any one of which can be spent as an optional additional cost.
 */
function spendBuffCandidates(
  state: RiftboundGameState,
  context: {
    cards: unknown;
    zones: Parameters<typeof resolveTarget>[1]["zones"];
    counters: { getFlag: (cardId: CoreCardId, flag: string) => boolean | undefined };
  },
  playerId: string,
  cardId: string,
): string[] {
  const ids = resolveTarget(
    { controller: "friendly", quantity: "all", type: "unit" } as Parameters<
      typeof resolveTarget
    >[0],
    {
      cards: context.cards as Parameters<typeof resolveTarget>[1]["cards"],
      draft: state,
      playerId,
      sourceCardId: cardId,
      zones: context.zones,
    },
  ) as string[];
  const meta = context.cards as {
    getCardMeta?: (cardId: CoreCardId) => { buffed?: boolean } | undefined;
  };
  return ids.filter(
    (id) =>
      meta.getCardMeta?.(id as CoreCardId)?.buffed === true ||
      context.counters.getFlag(id as CoreCardId, "buffed") === true,
  );
}

/**
 * rule 356.2.a.1 / 204.2 (unl-173-219 Sacrifice) — a spell's MANDATORY
 * "as an additional cost to play this, kill a friendly [Mighty] unit":
 * the descriptor when the played spell has one, else undefined.
 */
function mandatoryKillCost(cardId: string): unknown | undefined {
  const cost = getOptionalPlayCost(cardId);
  return cost?.kind === "kill" && cost.mandatory ? cost.kill : undefined;
}

/** Legal sacrifices for that cost. Rule 357.2: with none, the spell is unplayable. */
function mandatoryKillCandidates(
  state: RiftboundGameState,
  context: { cards: unknown; zones: Parameters<typeof resolveTarget>[1]["zones"] },
  playerId: string,
  cardId: string,
  descriptor: unknown,
): string[] {
  return resolveTarget(
    { ...(descriptor as Record<string, unknown>), quantity: "all" } as Parameters<
      typeof resolveTarget
    >[0],
    {
      cards: context.cards as Parameters<typeof resolveTarget>[1]["cards"],
      draft: state,
      playerId,
      sourceCardId: cardId,
      zones: context.zones,
    },
  ) as string[];
}

/**
 * Play a spell (rule 146-151)
 */
export const playSpell: Defs["playSpell"] = {
  condition: (state, context) => {
    if (state.status !== "playing") {
      return false;
    }
    if (state.pendingChoice) {
      return false;
    }
    // rule-id: ogn-026-298 — "opponents can't play cards this turn".
    if (state.cannotPlayCardsThisTurn?.[context.params.playerId as string]) {
      return false;
    }
    // rule-id: unl-190-219 — "its controller can't play spells this turn".
    if (state.cannotPlaySpellsThisTurn?.[context.params.playerId as string]) {
      return false;
    }
    // rule 419.1 — a board static may forbid PLAYING this card (ven-132-166).
    if (
      playIsForbidden(
        { cards: context.cards, draft: state, zones: context.zones },
        context.params.playerId as string,
        context.params.cardId as string,
      )
    ) {
      return false;
    }

    const zone = context.zones.getCardZone(context.params.cardId as CoreCardId);
    // rule-id: ven-049-166 — [Flow] lets the owner play a spell from their
    // trash for its Flow cost. viaFlow is only legal from the trash zone on
    // a card that carries a Flow keyword; non-Flow plays remain hand-only.
    const viaFlow = context.params.viaFlow === true;
    if (viaFlow) {
      if (zone !== "trash") {
        return false;
      }
      // rule-id: ven-113-166 — Flow may be GRANTED for the turn, not printed.
      if (!getFlowCostForPlay(context.params.cardId, createMetaAccessor(context.cards))) {
        return false;
      }
    } else if (zone !== "hand") {
      return false;
    }

    // Rule 103 / 555: only the card's owner may play it.
    const owner = context.cards.getCardOwner(context.params.cardId as CoreCardId);
    if (owner !== context.params.playerId) {
      return false;
    }

    // rule 204.3.b (ogn-268-298): a "pay any amount of [rainbow]" X is paid
    // within the instructions on resolution — never at play time. An
    // `xAmount` given here is only a PLEDGE (the caller naming X up front);
    // it must be coverable by Power the player has, never by Energy.
    if (xCostIsPower(context.params.cardId)) {
      const x = context.params.xAmount ?? 0;
      const power = state.runePools[context.params.playerId]?.power ?? {};
      const available = Object.values(power).reduce<number>((a, b) => a + (b ?? 0), 0);
      if (x > available) {
        return false;
      }
    }

    // rule 356.2.a.1 / 357.2 (unl-173-219) — a MANDATORY kill additional cost
    // must name a legal sacrifice; a caster with nothing to kill cannot play
    // the spell at all.
    const killDescriptor = mandatoryKillCost(context.params.cardId);
    if (killDescriptor) {
      const sacrificeId = context.params.sacrificeId as string | undefined;
      if (
        !sacrificeId ||
        !mandatoryKillCandidates(
          state,
          context as never,
          context.params.playerId,
          context.params.cardId,
          killDescriptor,
        ).includes(sacrificeId)
      ) {
        return false;
      }
    }

    // Rule: Repeat cost is only valid on spells that have a defined
    // `repeat` cost on their spell ability. Reject repeatCount > 0 for
    // Spells without Repeat.
    const reqRepeatCount = Math.max(0, context.params.repeatCount ?? 0);
    if (reqRepeatCount > 0) {
      // rule-id: unl-146-219 — printed Repeat plus board-granted Repeat
      // ("While I'm in a showdown, your spells have [Repeat] [2][chaos]").
      const repeatTiers = getEffectiveSpellRepeatCost(
        state,
        context.params.playerId,
        context.params.cardId,
        { cards: context.cards, zones: context.zones },
      );
      // rule-id: sfd-122-221 — Rule 820.1.c.3 / 820.3: each Repeat instance
      // can be paid only once, so repeatCount is bounded by the number of
      // Repeat instances on the spell.
      if (!repeatTiers || reqRepeatCount > repeatTiers.length) {
        return false;
      }
    }

    // rule-id: ven-083-166 — a spell's optional "you may pay [X] as an
    // additional cost" (rule 560) is only legal when the card declares one
    // and the caster can afford base + extra.
    let spellAdditionalCost: CostExtras["additionalCost"];
    let ignoreBaseCost = false;
    if (context.params.paidAdditionalCost) {
      const optional = getOptionalPlayCost(context.params.cardId);
      if (optional?.kind === "spend-buff") {
        // rule 356.2.b — the cost is only payable with a buff on the board.
        if (
          spendBuffCandidates(state, context, context.params.playerId, context.params.cardId)
            .length === 0
        ) {
          return false;
        }
        ignoreBaseCost = optional.ignoresBaseCost === true;
      } else if (optional?.kind === "exhaust") {
        // rule 356.2 — ogn-048-298: targets[0] names the ready friendly
        // permanent exhausted to pay the optional cost.
        const chosen = context.params.targets?.[0];
        if (
          !chosen ||
          !exhaustCostCandidates(
            state,
            context,
            context.params.playerId,
            context.params.cardId,
            optional.exhaust,
          ).includes(chosen as string)
        ) {
          return false;
        }
      } else if (optional?.kind === "discard") {
        // rule 356.2.b / 204.2 (ven-008-166) — "you may discard 1 as an
        // additional cost": the named card must be another card in the
        // caster's own hand.
        const discardId = context.params.discardId as string | undefined;
        if (
          !discardId ||
          discardId === (context.params.cardId as string) ||
          context.zones.getCardZone(discardId as CoreCardId) !== "hand" ||
          context.cards.getCardOwner(discardId as CoreCardId) !== context.params.playerId
        ) {
          return false;
        }
      } else if (optional?.kind !== "pay") {
        return false;
      } else {
        // rule-id: unl-140-219 (rule 560) — "spend N XP as an additional cost":
        // the paid variant is only legal when the caster has the XP.
        const xpNeed = optional.cost?.xp ?? 0;
        if (xpNeed > 0 && (state.players[context.params.playerId]?.xp ?? 0) < xpNeed) {
          return false;
        }
        spellAdditionalCost = optional.cost ?? {};
      }
    }

    if (
      !canAffordCard(
        state,
        context.params.playerId,
        context.params.cardId,
        {
          additionalCost: spellAdditionalCost,
          // rule-id: ven-055-166 — friendly "your spells cost less" statics.
          board: { cards: context.cards, zones: context.zones },
          ignoreBaseCost,
          repeatCount: reqRepeatCount,
          targets: context.params.targets,
          viaFlow,
          xAmount: context.params.xAmount,
        },
        createMetaAccessor(context.cards),
        getPotentialRuneEnergy(context.zones, context.counters, context.params.playerId),
      )
    ) {
      return false;
    }

    const interaction = state.interaction ?? createInteractionState();
    const turnState = getTurnState(interaction);
    const registry = getGlobalCardRegistry();
    const timing = (registry.getSpellTiming(context.params.cardId) ?? "action") as TimingClass;

    if (!isLegalTiming(timing, turnState)) {
      return false;
    }

    // rule 316.5.b: in a Neutral Open State only the Turn Player may play
    // spells — [Reaction] (813.1.c) only adds Closed States, not this one.
    if (turnState === "neutral-open" && state.turn.activePlayer !== context.params.playerId) {
      return false;
    }

    // rule 312.2.c-d / 338.1.b.1: in a Closed State only the Priority holder
    // may add to the chain — [Reaction] timing is no permission to act out of
    // turn with Priority elsewhere.
    if (!hasChainPriorityPermission(interaction, context.params.playerId)) {
      return false;
    }

    // rule 313.1 / 347: in a Showdown Open State only the Focus holder may
    // play cards; everyone else waits for Focus to pass.
    if (turnState === "showdown-open" && !hasShowdownPermission(interaction, context.params.playerId)) {
      return false;
    }

    // Rule 355.8 / 419.2.a: gate on caster-chosen targets (including modal options).
    const abilities = registry.getAbilities(context.params.cardId) ?? [];
    const spellAbility = abilities.find((a: { type: string }) => a.type === "spell");
    const conditionResolverCtx = {
      cards: {
        // rule 740.1.a / 477.1.a: "friendly"/"enemy" track the CURRENT
        // controller, so a possessed unit must be visible as friendly to its
        // new controller when validating caster-chosen targets.
        getCardController: (c: CoreCardId) => context.cards.getCardController?.(c),
        getCardMeta: (c: CoreCardId) => context.cards.getCardMeta?.(c),
        getCardOwner: (c: CoreCardId) => context.cards.getCardOwner(c),
      },
      choosing: true,
      draft: state,
      playerId: context.params.playerId as string,
      sourceCardId: context.params.cardId as string,
      zones: {
        getCardZone: (c: CoreCardId) => context.zones.getCardZone(c),
        getCardsInZone: (z: CoreZoneId, p?: CorePlayerId) => context.zones.getCardsInZone(z, p),
      },
    };
    // rule-id: ven-031-166 — an explicitly supplied enemy target that "can't
    // be chosen by enemy spells and abilities" makes the play illegal.
    for (const t of context.params.targets ?? []) {
      const ctl =
        context.cards.getCardController?.(t as CoreCardId) ??
        context.cards.getCardOwner(t as CoreCardId);
      if (ctl && ctl !== context.params.playerId && isUntargetable(t, conditionResolverCtx)) {
        return false;
      }
    }
    if (
      !spellEffectHasLegalTargets(
        spellAbility?.effect as SpellEffectTargetShape | undefined,
        conditionResolverCtx,
      )
    ) {
      return false;
    }

    // rule-id: ven-040-166 (rule 355.8) — an explicitly supplied single card
    // target must itself satisfy the spell's target descriptor (controller /
    // location / filter such as "in combat with an enemy Fury unit"); the
    // ≥1-legal-target gate above only proves SOME candidate exists.
    const spellTgt = (spellAbility?.effect as SpellEffectTargetShape | undefined)?.target;
    const counterSpec = counterChainTarget(spellAbility?.effect);
    const isCounterSpell = counterSpec !== undefined;
    // rule-id: ogn-045-298 (rule 355.8) — a counter's supplied target names a
    // chain item, validated against the chain rather than the board.
    if (isCounterSpell && context.params.targets?.length) {
      const chainItems = (state.interaction ?? createInteractionState()).chain?.items ?? [];
      const t = context.params.targets;
      // rule 820.2.a (sfd-136-221) — a repeated counter makes its own choice
      // per execution, so the caster may name one chain item per execution
      // (1 + repeatCount ids, each legal, no id used twice).
      const isLegalChainTarget = (id: string): boolean =>
        chainItems.some(
          (item) =>
            (item.cardId === id || item.id === id) &&
            isLegalCounterTarget(counterSpec, item, undefined, {
              controllerOf: (cid) =>
                context.cards.getCardController?.(cid as CoreCardId) ??
                context.cards.getCardOwner(cid as CoreCardId),
              playerId: context.playerId as string,
            }),
        );
      if (
        t.length < 1 ||
        t.length > 1 + reqRepeatCount ||
        new Set(t).size !== t.length ||
        !t.every((id) => isLegalChainTarget(id as string))
      ) {
        return false;
      }
    }
    if (
      !isCounterSpell &&
      context.params.targets?.length === 1 &&
      spellTgt &&
      typeof spellTgt !== "string" &&
      !(spellAbility?.effect as SpellEffectTargetShape).player &&
      spellTgt.type !== "self" &&
      spellTgt.type !== "player" &&
      spellTgt.type !== "battlefield" &&
      spellTgt.type !== "pending-value" &&
      spellTgt.type !== "trigger-source" &&
      (spellTgt.quantity === undefined || spellTgt.quantity === 1)
    ) {
      const pool = resolveTarget(
        { ...spellTgt, quantity: "all" } as Parameters<typeof resolveTarget>[0],
        conditionResolverCtx,
      ).filter((id) => {
        // rule 355.4.a (unl-101-219) — a caster-chosen move destination must
        // differ from the unit's current location; a unit with none is not a
        // legal choice.
        const dests = chosenMoveDestinations(
          spellAbility?.effect as SpellEffectTargetShape | undefined,
          id as string,
          conditionResolverCtx,
        );
        return dests === undefined || dests.length > 0;
      });
      if (!pool.includes(context.params.targets[0] as string)) {
        return false;
      }
    }
    // rule-id: ogn-206-298 (rule 355.8) — a numeric quantity ≥ 2 ("Give TWO
    // friendly units each +2 Might") names that many DISTINCT legal targets;
    // validate the whole supplied set, not just its first member.
    if (
      !isCounterSpell &&
      spellTgt &&
      typeof spellTgt !== "string" &&
      typeof spellTgt.quantity === "number" &&
      spellTgt.quantity >= 2 &&
      context.params.targets?.length
    ) {
      const pool = resolveTarget(
        { ...spellTgt, quantity: "all" } as Parameters<typeof resolveTarget>[0],
        conditionResolverCtx,
      ) as string[];
      const supplied = context.params.targets as string[];
      // rule 820.2.a (sfd-151-221) — with [Repeat] paid, each execution names
      // its own group of that many units, so the supplied list may hold one
      // group per execution; distinctness is judged WITHIN a group.
      const perExecution = spellTgt.quantity;
      if (
        supplied.length > perExecution * (1 + reqRepeatCount) ||
        !supplied.every((id) => pool.includes(id))
      ) {
        return false;
      }
      for (let i = 0; i < supplied.length; i += perExecution) {
        const group = supplied.slice(i, i + perExecution);
        if (new Set(group).size !== group.length) {
          return false;
        }
      }
    }
    // rule-id: ogn-220-298 (rule 355.8) — "…at the same battlefield": when a
    // sequence's second slot is `location:"same"`, the supplied pair must share
    // one battlefield zone (a base unit or another battlefield is illegal).
    {
      const seqEffects = (spellAbility?.effect as { type?: string; effects?: unknown[] } | undefined)
        ?.type === "sequence"
        ? ((spellAbility?.effect as { effects?: unknown[] }).effects ?? [])
        : [];
      const hasSameSlot = seqEffects.some(
        (e) =>
          typeof (e as { target?: unknown })?.target === "object" &&
          ((e as { target: { location?: string } }).target.location === "same"),
      );
      const supplied = context.params.targets ?? [];
      if (hasSameSlot && supplied.length >= 2) {
        const zone = context.zones.getCardZone(supplied[0] as CoreCardId);
        if (
          zone?.startsWith("battlefield-") !== true ||
          context.zones.getCardZone(supplied[1] as CoreCardId) !== zone
        ) {
          return false;
        }
      }
    }
    // rule-id: sfd-145-221 (rule 355.8 / 433) — a `target1`/`target2` effect
    // (swap-might) names TWO caster-chosen targets: the
    // supplied set must be exactly two distinct cards, each legal for its own
    // descriptor, and `location:"same"` on the second means "same zone as the
    // first".
    {
      const pairEffect = spellAbility?.effect as
        | { type?: string; target1?: unknown; target2?: unknown }
        | undefined;
      // rule-id: unl-083-219 — `swap-locations` names the same two-target shape.
      const isPairEffect =
        pairEffect?.type === "swap-might" || pairEffect?.type === "swap-locations";
      const t1 = isPairEffect ? pairEffect?.target1 : undefined;
      const t2 = isPairEffect ? pairEffect?.target2 : undefined;
      const supplied = (context.params.targets ?? []) as string[];
      if (
        typeof t1 === "object" &&
        t1 !== null &&
        typeof t2 === "object" &&
        t2 !== null &&
        supplied.length > 0
      ) {
        if (supplied.length !== 2 || supplied[0] === supplied[1]) {
          return false;
        }
        const firstPool = resolveTarget(
          { ...(t1 as object), quantity: "all" } as Parameters<typeof resolveTarget>[0],
          conditionResolverCtx,
        ) as string[];
        if (!firstPool.includes(supplied[0] as string)) {
          return false;
        }
        const zone = context.zones.getCardZone(supplied[0] as CoreCardId);
        const secondPool = resolveTarget(
          { ...(t2 as object), quantity: "all" } as Parameters<typeof resolveTarget>[0],
          (t2 as { location?: string }).location === "same"
            ? { ...conditionResolverCtx, sameZone: zone as string, sourceZone: zone as string }
            : conditionResolverCtx,
        ) as string[];
        if (!secondPool.includes(supplied[1] as string)) {
          return false;
        }
        // rule-id: unl-083-219 (rule 355.8) — "…and another unit you control
        // at a DIFFERENT location": swapping locations is only a legal choice
        // for two units that are not already in the same zone.
        if (
          pairEffect?.type === "swap-locations" &&
          context.zones.getCardZone(supplied[1] as CoreCardId) === zone
        ) {
          return false;
        }
      }
    }
    // rule-id: ogs-008-024 (rule 355.8) — a `fight` spell names TWO
    // caster-chosen targets, so the supplied set must be exactly
    // [attacker, defender]: distinct, and each legal for its own descriptor.
    // Without this a raw playSpell with no targets is legal, pays only the
    // base cost (no Deflect surcharge, which is computed from the targets)
    // and lets the fight handler silently auto-pick both units at resolution.
    {
      const fightEffect = spellAbility?.effect as
        | { type?: string; attacker?: unknown; defender?: unknown }
        | undefined;
      if (
        fightEffect?.type === "fight" &&
        typeof fightEffect.attacker === "object" &&
        fightEffect.attacker !== null &&
        typeof fightEffect.defender === "object" &&
        fightEffect.defender !== null
      ) {
        const supplied = (context.params.targets ?? []) as string[];
        if (supplied.length !== 2 || supplied[0] === supplied[1]) {
          return false;
        }
        const attackers = resolveTarget(
          { ...(fightEffect.attacker as object), quantity: "all" } as Parameters<
            typeof resolveTarget
          >[0],
          conditionResolverCtx,
        ) as string[];
        const defenders = resolveTarget(
          { ...(fightEffect.defender as object), quantity: "all" } as Parameters<
            typeof resolveTarget
          >[0],
          conditionResolverCtx,
        ) as string[];
        if (!attackers.includes(supplied[0]) || !defenders.includes(supplied[1])) {
          return false;
        }
      }
    }

    // rule-id: ogs-002-024 — "all enemy units at A battlefield": supplied
    // targets name the chosen battlefield and must be exactly one real one.
    if (isAllAtOneBattlefield(spellTgt) && context.params.targets?.length) {
      const t = context.params.targets;
      if (t.length !== 1 || !state.battlefields?.[t[0] as string]) {
        return false;
      }
    }

    // rule-id: ogn-256-298 (Fox-Fire) — a `totalMight` descriptor caps the
    // SUMMED Might of the caster-chosen set, all at one battlefield; reject
    // supplied targets that exceed it rather than trusting the client.
    const totalMightCap =
      spellTgt && typeof spellTgt !== "string"
        ? (spellTgt as { totalMight?: { lte?: number } }).totalMight?.lte
        : undefined;
    if (totalMightCap !== undefined && context.params.targets?.length) {
      const chosen = context.params.targets;
      const total = chosen.reduce(
        (sum, id) => sum + getCardEffectiveMight(id, (c) => context.cards.getCardMeta?.(c)),
        0,
      );
      if (total > totalMightCap) {
        return false;
      }
      if ((spellTgt as { location?: string }).location === "battlefield") {
        const zone = context.zones.getCardZone(chosen[0] as CoreCardId);
        if (
          !zone?.startsWith("battlefield") ||
          !chosen.every((id) => context.zones.getCardZone(id as CoreCardId) === zone)
        ) {
          return false;
        }
      }
    }

    // rule-id: unl-192-219 (rule 355.14.b/c / 355.15) — split-damage targets
    // are [mightRef, ...splits]; the number of split targets may not exceed
    // the reference unit's current Might, and each must be a legal enemy
    // split candidate. Validate supplied targets rather than trusting the
    // client (the enumerator already caps at N).
    if (context.params.targets?.length) {
      const spellEffectShape = spellAbility?.effect as SpellEffectTargetShape | undefined;
      const refTgt = findAmountReferenceTarget(spellEffectShape);
      const splitEffect = refTgt ? findSplitDamageEffect(spellEffectShape) : undefined;
      const splitDesc =
        splitEffect?.target && typeof splitEffect.target !== "string"
          ? splitEffect.target
          : undefined;
      if (refTgt && splitDesc) {
        const [refId, ...splits] = context.params.targets;
        const cap = getCardEffectiveMight(refId as string, (c) => context.cards.getCardMeta?.(c));
        if (splits.length > cap) {
          return false;
        }
        if (splits.length > 0) {
          const splitPool = new Set(
            resolveTarget(
              { ...splitDesc, quantity: "all" } as Parameters<typeof resolveTarget>[0],
              conditionResolverCtx,
            ) as string[],
          );
          if (new Set(splits).size !== splits.length || !splits.every((id) => splitPool.has(id))) {
            return false;
          }
        }
      }
    }

    return true;
  },
  enumerator: (state, context) => {
    if (state.status !== "playing") {
      return [];
    }
    if (state.pendingChoice) {
      return [];
    }

    const registry = getGlobalCardRegistry();
    const interaction = state.interaction ?? createInteractionState();
    const turnState = getTurnState(interaction);
    // rule 316.5.b: Neutral Open State → only the Turn Player plays spells.
    if (turnState === "neutral-open" && state.turn.activePlayer !== (context.playerId as string)) {
      return [];
    }
    // rule 312.2.c-d: Closed State → only the Priority holder may add an item.
    if (!hasChainPriorityPermission(interaction, context.playerId as string)) {
      return [];
    }
    // rule 313.1 / 347: Showdown Open State → only the Focus holder acts.
    if (turnState === "showdown-open" && !hasShowdownPermission(interaction, context.playerId as string)) {
      return [];
    }
    const pool = state.runePools[context.playerId as string];
    if (!pool) {
      return [];
    }
    // Rule 357.1.a: credit ready runes as available energy for enumeration.
    const potential = getPotentialRuneEnergy(
      context.zones,
      context.counters,
      context.playerId as string,
    );
    // rule-id: ven-055-166 — friendly "your spells cost less" statics must be
    // visible to the enumerator, so gate on canAffordCard with board access
    // rather than the printed-cost-only registry.canAfford.
    const board = { cards: context.cards, zones: context.zones };
    const metaForAfford = createMetaAccessor(context.cards);

    const handCards = context.zones.getCardsInZone(
      "hand" as CoreZoneId,
      context.playerId as CorePlayerId,
    );

    const results: {
      playerId: string;
      cardId: string;
      targets?: string[];
      repeatCount?: number;
      viaFlow?: boolean;
      paidAdditionalCost?: boolean;
      additionalCostSpec?: { energy?: number; power?: readonly string[] };
      sacrificeId?: string;
      discardId?: string;
    }[] = [];
    for (const cardId of handCards) {
      const def = registry.get(cardId as string);
      if (!def || def.cardType !== "spell") {
        continue;
      }
      // rule 419.1 — board statics that forbid playing this card (ven-132-166).
      if (
        playIsForbidden(
          { cards: context.cards, draft: state, zones: context.zones },
          context.playerId as string,
          cardId as string,
        )
      ) {
        continue;
      }
      // rule 356.2.a.1 / 357.2 (unl-173-219) — a mandatory kill additional
      // cost: offer one variant per legal sacrifice, and nothing at all when
      // there is none to kill.
      const killDescriptor = mandatoryKillCost(cardId as string);
      const killChoices = killDescriptor
        ? mandatoryKillCandidates(
            state,
            context as never,
            context.playerId as string,
            cardId as string,
            killDescriptor,
          )
        : undefined;
      if (killChoices && killChoices.length === 0) {
        continue;
      }
      const cardResultsStart = results.length;
      // rule 356.5 (ogn-146-298) — a spell whose optional additional cost says
      // "ignore this spell's cost" is playable with no resources at all, so
      // the base-cost gate must not filter it out.
      const freeViaOptionalCost = (() => {
        const opt = getOptionalPlayCost(cardId as string);
        return (
          opt?.kind === "spend-buff" &&
          opt.ignoresBaseCost === true &&
          spendBuffCandidates(state, context, context.playerId as string, cardId as string).length >
            0
        );
      })();
      if (
        !freeViaOptionalCost &&
        !canAffordCard(
          state,
          context.playerId as string,
          cardId as string,
          // rule-id: sfd-141-221 — targets aren't chosen yet at this gate, so
          // let a "spells that choose me cost less" aura count; the move's
          // condition re-checks it against the real targets.
          { assumeChooseDiscount: true, board },
          metaForAfford,
          potential,
        )
      ) {
        continue;
      }

      // Check spell timing is legal in current turn state (rule 553)
      const timing = (registry.getSpellTiming(cardId as string) ?? "action") as TimingClass;
      if (!isLegalTiming(timing, turnState)) {
        continue;
      }

      // Rule 355.8 / 419.2.a: gate on caster-chosen targets (including modal options).
      const abilities = registry.getAbilities(cardId as string) ?? [];
      const spellAbility = abilities.find((a: { type: string }) => a.type === "spell");
      const spellEffect = spellAbility?.effect as SpellEffectTargetShape | undefined;
      const resolverCtx = {
        cards: {
          // rule 740.1.a / 477.1.a — friendliness follows current control.
          getCardController: (c: CoreCardId) => context.cards.getCardController?.(c),
          getCardMeta: (c: CoreCardId) => context.cards.getCardMeta?.(c),
          getCardOwner: (c: CoreCardId) => context.cards.getCardOwner(c),
        },
        // rule-id: ven-031-166 — enumerating caster-chosen targets.
        choosing: true,
        draft: state,
        playerId: context.playerId as string,
        sourceCardId: cardId as string,
        zones: {
          getCardZone: (c: CoreCardId) => context.zones.getCardZone(c),
          getCardsInZone: (z: CoreZoneId, p?: CorePlayerId) => context.zones.getCardsInZone(z, p),
        },
      };
      if (!spellEffectHasLegalTargets(spellEffect, resolverCtx)) {
        continue;
      }

      // Rule 355.8: targets are chosen when the spell is PLAYED. For a
      // single-card target descriptor, enumerate one legal Play per valid
      // target so the caster picks. Programmatic selections (quantity:"all"),
      // player/battlefield targets, and self are not caster-chosen.
      // Rule 355.14.a: an amount:{might:<selector>} reference is also a
      // caster-chosen play-time target (unl-192-219).
      const refTgt = findAmountReferenceTarget(spellEffect);
      // rule-id: sfd-017-221 (rule 355.8) — a `sequence` spell's caster-chosen
      // target lives on its lead sub-effect; lift it so the caster picks.
      // rule-id: sfd-200-221 (rule 355.8) — a sequence naming a SECOND
      // distinct card target ("…Deal 3 to an enemy unit") locks both at play
      // time as targets [lead, second]; the sequence handler routes each to
      // its own step.
      const seqSlots =
        spellEffect?.target === undefined && refTgt === undefined
          ? collectSequenceTargetSlots(spellEffect)
          : undefined;
      const isSinglePick = (d: { type: string; quantity?: unknown }) =>
        d.type !== "player" &&
        d.type !== "battlefield" &&
        (d.quantity === undefined || d.quantity === 1);
      // rule 355.13 (rule-id: sfd-023-221) — "…, then deal 2 to up to one
      // other unit": the second slot may be left unchosen, so it is offered
      // alongside a lead-only Play.
      const isOptionalSinglePick = (d: { type: string; quantity?: unknown }) => {
        const q = d.quantity as { upTo?: number; atLeast?: number } | undefined;
        return (
          d.type !== "player" &&
          d.type !== "battlefield" &&
          typeof q === "object" &&
          q !== null &&
          q.upTo === 1 &&
          q.atLeast === undefined
        );
      };
      const secondOptional =
        seqSlots?.length === 2 && isSinglePick(seqSlots[0]) && isOptionalSinglePick(seqSlots[1]);
      // rule-id: sfd-107-221 (rule 355.8 / 355.14.a) — "…It deals damage equal
      // to its Might to an enemy unit": the damaged unit is a second
      // caster-chosen target alongside the Might reference, so pair them.
      const secondTgt =
        refTgt !== undefined && findSplitDamageEffect(spellEffect) === undefined
          ? findAmountReferenceDamageTarget(spellEffect)
          : seqSlots?.length === 2 &&
              isSinglePick(seqSlots[0]) &&
              (isSinglePick(seqSlots[1]) || secondOptional)
            ? seqSlots[1]
            : undefined;
      const tgt =
        spellEffect?.target ??
        refTgt ??
        // rule-id: ogn-254-298 (rule 355.8) — "Choose a unit. Kill it the
        // next time it takes damage": the chosen unit lives on the nested
        // replacement; lift it so the caster picks at play time.
        findReplacementChosenTarget(spellEffect) ??
        (secondTgt ? seqSlots?.[0] : findSequenceLeadTarget(spellEffect));
      // rule-id: ogn-045-298 — a counter's target is a chain item (own branch below).
      const counterSpec = counterChainTarget(spellEffect);
      const isCardTarget =
        counterSpec === undefined &&
        // rule-id: ogn-198-298 — an off-board play's card is chosen from the
        // trash/hand as the effect resolves, never as a play-time board target.
        (offBoardPlayZone(spellEffect) === undefined ||
          offBoardPlayIsCasterChosen(spellEffect)) &&
        tgt !== undefined &&
        typeof tgt !== "string" &&
        tgt.type !== "self" &&
        tgt.type !== "player" &&
        tgt.type !== "battlefield" &&
        tgt.quantity !== "all";
      const baseVariants: { playerId: string; cardId: string; targets?: string[] }[] = [];
      // rule-id: ven-083-166 (Rampage) / rule 355.8 — "choose a friendly
      // unit and an enemy unit": a `fight` effect names TWO caster-chosen
      // targets (attacker + defender). Enumerate one Play per legal pair so
      // both are locked on the chain item as targets [attacker, defender].
      const fightAtk =
        spellEffect?.type === "fight" && typeof spellEffect.attacker === "object"
          ? spellEffect.attacker
          : undefined;
      const fightDef =
        spellEffect?.type === "fight" && typeof spellEffect.defender === "object"
          ? spellEffect.defender
          : undefined;
      // rule-id: sfd-145-221 (rule 355.8 / 433) — "Swap the Might of two units
      // at the same battlefield": a `swap-might` / `increase-might-to` effect
      // names TWO caster-chosen targets through `target1`/`target2` (Swap only —
      // `increase-might-to` picks programmatically). Enumerate
      // one Play per legal pair so both are locked on the chain item.
      // rule-id: unl-083-219 — `swap-locations` (Smoke and Mirrors) uses the
      // same two-caster-chosen-target shape.
      const isSwap =
        spellEffect?.type === "swap-might" || spellEffect?.type === "swap-locations";
      const pairFirst =
        isSwap && typeof spellEffect?.target1 === "object" && spellEffect.target1 !== null
          ? (spellEffect.target1 as { quantity?: unknown; location?: string })
          : undefined;
      const pairSecond =
        isSwap && typeof spellEffect?.target2 === "object" && spellEffect.target2 !== null
          ? (spellEffect.target2 as { quantity?: unknown; location?: string })
          : undefined;
      // rule-id: sfd-011-221 (rule 355.8 / 434 / 435) — "Choose a unit and an
      // Equipment with the same controller": an `attach-or-detach` effect names
      // TWO caster-chosen targets, so enumerate one Play per same-controller
      // [unit, equipment] pair. The effect may sit inside a sequence ("… Draw 1").
      const attachToggle = ((): { equipment: object; to: object } | undefined => {
        const subs: { type?: string }[] =
          spellEffect?.type === "sequence" && Array.isArray(spellEffect.effects)
            ? (spellEffect.effects as { type?: string }[])
            : spellEffect
              ? [spellEffect as { type?: string }]
              : [];
        const found = subs.find((e) => e?.type === "attach-or-detach") as
          | { equipment?: unknown; to?: unknown }
          | undefined;
        return found &&
          typeof found.equipment === "object" &&
          found.equipment !== null &&
          typeof found.to === "object" &&
          found.to !== null
          ? { equipment: found.equipment as object, to: found.to as object }
          : undefined;
      })();
      // rule-id: ogn-220-298 (Facebreaker) / rule 355.8 — "Stun a friendly
      // unit and an enemy unit at the same battlefield": a `sequence` whose
      // lead card target is followed by a `location:"same"` step names TWO
      // caster-chosen targets. Enumerate one Play per legal [lead, same] pair
      // sharing a battlefield so both are locked on the chain item.
      const seqSubs =
        spellEffect?.type === "sequence" && Array.isArray(spellEffect.effects)
          ? spellEffect.effects
          : undefined;
      const sameStepIdx =
        seqSubs?.findIndex(
          (e) =>
            typeof e?.target === "object" &&
            (e.target as { location?: string }).location === "same",
        ) ?? -1;
      const sameLeadIdx =
        sameStepIdx > 0
          ? (seqSubs ?? []).findIndex(
              (e, i) =>
                i < sameStepIdx &&
                typeof e?.target === "object" &&
                e.target.type !== "pending-value" &&
                (e.target as { location?: string }).location !== "same",
            )
          : -1;
      const sameLead = sameLeadIdx >= 0 ? seqSubs?.[sameLeadIdx]?.target : undefined;
      const sameDesc = sameStepIdx >= 0 ? seqSubs?.[sameStepIdx]?.target : undefined;
      // rule-id: ogn-029-298 (rule 355.8) — "Deal 3 to a unit. Deal 3 to a
      // unit.": each instruction chooses its own target INDEPENDENTLY, and the
      // same unit may be chosen for more than one of them (no "another"
      // restriction). Enumerate one Play per pick tuple; a shorter tuple
      // leaves the remaining instructions unchosen (they do nothing).
      const indepSlots = collectIndependentTargetSlots(spellEffect);
      if (indepSlots && indepSlots.length >= 2) {
        const pools = indepSlots.map(
          (s) =>
            resolveTarget(
              { ...s.target, quantity: "all" } as Parameters<typeof resolveTarget>[0],
              resolverCtx,
            ) as string[],
        );
        // Instructions naming the SAME descriptor are interchangeable, so only
        // non-decreasing picks are distinct plays.
        // rule 355.8 (sfd-196-221 Defiant Dance) — "… and ANOTHER unit …": the
        // slots share a descriptor but must resolve to different cards, and the
        // instructions are NOT interchangeable (+2 vs -2), so every ordered
        // pair of distinct candidates is its own play.
        const distinct = (spellEffect as { distinctTargets?: boolean }).distinctTargets === true;
        const uniform =
          !distinct &&
          indepSlots.every(
            (s) => JSON.stringify(s.target) === JSON.stringify(indepSlots[0].target),
          );
        // rule-id: ogn-248-298 (rule 355.8) — the guard must count the tuples
        // actually generated, not the raw product of the pools: with uniform
        // descriptors only non-decreasing picks are built (3 units × 6
        // instructions = 83 plays, not 3^6), so a product-based estimate
        // wrongly collapsed six-instruction spells to a single target.
        const TUPLE_LIMIT = 2000;
        const tuples: string[][] = [];
        let overflowed = false;
        const build = (depth: number, start: number, acc: string[]) => {
          if (depth >= pools.length || overflowed) return;
          const pool = pools[depth] ?? [];
          for (let k = uniform ? start : 0; k < pool.length; k++) {
            if (tuples.length >= TUPLE_LIMIT) {
              overflowed = true;
              return;
            }
            if (distinct && acc.includes(pool[k] as string)) continue;
            const next = [...acc, pool[k] as string];
            // rule 355.8 (sfd-196-221 Defiant Dance) — "… and ANOTHER unit …"
            // names two mandatory, distinct targets, so a partial pick is not a
            // legal play; only complete tuples are offered. Independent
            // instructions without "another" may still be left unchosen.
            if (!distinct || depth === pools.length - 1) tuples.push(next);
            build(depth + 1, k, next);
          }
        };
        build(0, 0, []);
        if (overflowed && !distinct) {
          // Guard against combinatorial blow-up on many-instruction spells.
          tuples.length = 0;
          for (const id of pools[0] ?? []) {
            tuples.push([id]);
          }
        }
        for (const t of tuples) {
          baseVariants.push({
            cardId: cardId as string,
            playerId: context.playerId as string,
            targets: t,
          });
        }
      } else if (attachToggle) {
        const units = resolveTarget(
          { ...attachToggle.to, quantity: "all" } as Parameters<typeof resolveTarget>[0],
          resolverCtx,
        ) as string[];
        const equips = resolveTarget(
          { ...attachToggle.equipment, quantity: "all" } as Parameters<typeof resolveTarget>[0],
          resolverCtx,
        ) as string[];
        const controllerOf = (id: string) =>
          context.cards.getCardController?.(id as CoreCardId) ??
          context.cards.getCardOwner(id as CoreCardId);
        for (const u of units) {
          for (const e of equips) {
            // rule 434.1: the pair must share a controller (either player's).
            if (controllerOf(u) !== controllerOf(e)) continue;
            baseVariants.push({
              cardId: cardId as string,
              playerId: context.playerId as string,
              targets: [u, e],
            });
          }
        }
      } else if (!isCardTarget && fightAtk && fightDef) {
        const attackers = resolveTarget(
          { ...fightAtk, quantity: "all" } as Parameters<typeof resolveTarget>[0],
          resolverCtx,
        );
        const defenders = resolveTarget(
          { ...fightDef, quantity: "all" } as Parameters<typeof resolveTarget>[0],
          resolverCtx,
        );
        for (const a of attackers) {
          for (const d of defenders) {
            if (a === d) continue;
            baseVariants.push({
              cardId: cardId as string,
              playerId: context.playerId as string,
              targets: [a as string, d as string],
            });
          }
        }
      } else if (
        !isCardTarget &&
        pairFirst &&
        pairSecond &&
        pairFirst.quantity !== "all" &&
        pairSecond.quantity !== "all"
      ) {
        const firsts = resolveTarget(
          { ...pairFirst, quantity: "all" } as Parameters<typeof resolveTarget>[0],
          resolverCtx,
        );
        // rule 433.1 — Swap is symmetric, so [a,b] and [b,a] are the same
        // play; a directional pair (increase-might-to) keeps both orders.
        const symmetric =
          spellEffect?.type === "swap-might" || spellEffect?.type === "swap-locations";
        // rule-id: unl-083-219 — a location swap needs two DIFFERENT locations.
        const needDifferentZones = spellEffect?.type === "swap-locations";
        const seenPairs = new Set<string>();
        for (const a of firsts) {
          const zone = context.zones.getCardZone(a as CoreCardId);
          const seconds = resolveTarget(
            { ...pairSecond, quantity: "all" } as Parameters<typeof resolveTarget>[0],
            pairSecond.location === "same"
              ? { ...resolverCtx, sameZone: zone as string, sourceZone: zone as string }
              : resolverCtx,
          );
          for (const b of seconds) {
            if (b === a) continue;
            if (needDifferentZones && context.zones.getCardZone(b as CoreCardId) === zone) {
              continue;
            }
            if (symmetric) {
              const key = [a as string, b as string].sort().join("|");
              if (seenPairs.has(key)) continue;
              seenPairs.add(key);
            }
            baseVariants.push({
              cardId: cardId as string,
              playerId: context.playerId as string,
              targets: [a as string, b as string],
            });
          }
        }
      } else if (
        !isCardTarget &&
        sameLead &&
        sameDesc &&
        typeof sameLead === "object" &&
        typeof sameDesc === "object" &&
        sameLead.quantity !== "all" &&
        sameDesc.quantity !== "all"
      ) {
        const leads = resolveTarget(
          { ...sameLead, quantity: "all" } as Parameters<typeof resolveTarget>[0],
          resolverCtx,
        );
        for (const l of leads) {
          const zone = context.zones.getCardZone(l as CoreCardId);
          if (!zone) continue;
          const others = resolveTarget(
            { ...sameDesc, quantity: "all" } as Parameters<typeof resolveTarget>[0],
            { ...resolverCtx, sameZone: zone as string },
          );
          for (const o of others) {
            if (o === l) continue;
            baseVariants.push({
              cardId: cardId as string,
              playerId: context.playerId as string,
              targets: [l as string, o as string],
            });
          }
        }
      } else if (isCardTarget) {
        // rule-id: unl-107-219 — a Might-reference descriptor carries no
        // quantity; surface EVERY legal reference so the caster picks which
        // friendly unit is compared (resolveTarget defaults to the first).
        // rule-id: unl-204-219 (rule 355.8) — same for a plain single-card
        // target: the descriptor's quantity caps how many are CHOSEN, not the
        // candidate pool, so enumerate every legal candidate.
        const validTargets = resolveTarget(
          { ...tgt, quantity: "all" } as Parameters<typeof resolveTarget>[0],
          resolverCtx,
        ).filter((id) => {
          // rule 355.4.a (unl-101-219) — only offer units that have a legal
          // destination other than where they already are.
          const dests = chosenMoveDestinations(spellEffect, id as string, resolverCtx);
          return dests === undefined || dests.length > 0;
        });
        // Rule 355.14.b/c / 355.15 (unl-192-219): when the enumerated target
        // is the might-reference of a split-damage effect, the caster ALSO
        // chooses up to N enemy split targets at finalization (N = ref's
        // current Might; zero is legal). Enumerate every subset so all
        // choices are locked on the chain item before opponents respond.
        const splitEffect = refTgt ? findSplitDamageEffect(spellEffect) : undefined;
        const splitDesc =
          splitEffect?.target && typeof splitEffect.target !== "string"
            ? splitEffect.target
            : undefined;
        // rule-id: sfd-080-221 (rule 355.13) — "up to N <units>": the caster
        // picks 0..N targets at play time, so enumerate every subset (the
        // empty one included) rather than one Play per single candidate.
        // "at the same location" (location:"here" on a spell) constrains a
        // multi-pick to units sharing one zone.
        const qty = tgt.quantity;
        // rule-id: ogn-256-298 (Fox-Fire) — "any number of units at a
        // battlefield with total Might N or less": quantity:"any" is a 0..n
        // caster pick at ONE battlefield, and `totalMight` caps the SUMMED
        // Might of the chosen set.
        const totalMightCap = (tgt as { totalMight?: { lte?: number } }).totalMight?.lte;
        const anyQty = !splitDesc && qty === "any";
        const mightOf = (id: string) =>
          getCardEffectiveMight(id, (c) => context.cards.getCardMeta?.(c));
        const subsetPool =
          totalMightCap !== undefined
            ? (validTargets as string[]).filter((id) => mightOf(id) <= totalMightCap)
            : (validTargets as string[]);
        const upToN =
          !splitDesc && typeof qty === "object" && qty.upTo !== undefined && qty.atLeast === undefined
            ? qty.upTo
            : anyQty
              ? subsetPool.length
              : undefined;
        // rule-id: ogn-206-298 (rule 355.8) — "Give TWO friendly units each
        // +2 Might": a numeric quantity ≥ 2 is a caster-chosen SET of that
        // many DISTINCT units, all locked on the chain item at play time.
        const exactN = !splitDesc && typeof qty === "number" && qty >= 2 ? qty : undefined;
        if (exactN !== undefined) {
          const size = Math.min(exactN, subsetPool.length);
          for (const subset of enumerateSubsetsUpTo(subsetPool, size)) {
            if (subset.length !== size) {
              continue;
            }
            baseVariants.push({
              cardId: cardId as string,
              playerId: context.playerId as string,
              targets: subset,
            });
          }
        } else if (upToN !== undefined) {
          const loc = (tgt as { location?: string }).location;
          const sameLocation = loc === "here" || (anyQty && loc === "battlefield");
          for (const subset of enumerateSubsetsUpTo(subsetPool, upToN)) {
            if (sameLocation && subset.length > 1) {
              const zone = context.zones.getCardZone(subset[0] as CoreCardId);
              if (!subset.every((id) => context.zones.getCardZone(id as CoreCardId) === zone)) {
                continue;
              }
            }
            if (
              totalMightCap !== undefined &&
              subset.reduce((sum, id) => sum + mightOf(id), 0) > totalMightCap
            ) {
              continue;
            }
            baseVariants.push({
              cardId: cardId as string,
              playerId: context.playerId as string,
              targets: subset,
            });
          }
        } else {
          // rule-id: ogn-250-298 (rule 355.8) — "Choose a friendly unit in your
          // base. Deal damage equal to its Might to all enemy units at a
          // battlefield": the Might reference AND the battlefield are both
          // caster-chosen, so lock them together as targets [refUnit, bfId].
          const refBattlefield =
            refTgt !== undefined && tgt === refTgt && !splitDesc
              ? findAllAtOneBattlefieldTarget(spellEffect)
              : undefined;
          for (const targetId of validTargets) {
            if (refBattlefield) {
              for (const bfId of Object.keys(state.battlefields ?? {})) {
                baseVariants.push({
                  cardId: cardId as string,
                  playerId: context.playerId as string,
                  targets: [targetId as string, bfId],
                });
              }
              continue;
            }
            if (splitDesc) {
              const n = getCardEffectiveMight(targetId as string, (c) =>
                context.cards.getCardMeta?.(c),
              );
              const splitPool = resolveTarget(
                { ...splitDesc, quantity: "all" } as Parameters<typeof resolveTarget>[0],
                resolverCtx,
              );
              for (const subset of enumerateSubsetsUpTo(splitPool, n)) {
                baseVariants.push({
                  cardId: cardId as string,
                  playerId: context.playerId as string,
                  targets: [targetId as string, ...subset],
                });
              }
            } else {
              // rule-id: sfd-200-221 (rule 355.8) — pair the lead with each
              // legal (distinct) second-slot candidate.
              // rule-id: ogn-220-298 (rule 355.8) — "…and an enemy unit at the
              // SAME battlefield": the second slot is pinned to the lead's
              // battlefield, so pair only within that zone.
              const secondIsSame =
                secondTgt !== undefined &&
                (secondTgt as { location?: string }).location === "same";
              const leadZone = context.zones.getCardZone(targetId as CoreCardId);
              const secondsCtx =
                secondIsSame && leadZone?.startsWith("battlefield-") === true
                  ? { ...resolverCtx, sameZone: leadZone }
                  : resolverCtx;
              const seconds =
                secondTgt === undefined || (secondIsSame && secondsCtx === resolverCtx)
                  ? []
                  : resolveTarget(
                      { ...secondTgt, quantity: "all" } as Parameters<typeof resolveTarget>[0],
                      secondsCtx,
                    ).filter((id) => id !== targetId);
              if (seconds.length > 0) {
                for (const secId of seconds) {
                  baseVariants.push({
                    cardId: cardId as string,
                    playerId: context.playerId as string,
                    targets: [targetId as string, secId as string],
                  });
                }
                // rule 355.13 — an "up to one" second slot may be skipped.
                if (secondOptional) {
                  baseVariants.push({
                    cardId: cardId as string,
                    playerId: context.playerId as string,
                    targets: [targetId as string],
                  });
                }
              } else if (!secondIsSame) {
                baseVariants.push({
                  cardId: cardId as string,
                  playerId: context.playerId as string,
                  targets: [targetId as string],
                });
              }
            }
          }
        }
      } else if (isAllAtOneBattlefield(tgt) && Object.keys(state.battlefields ?? {}).length > 0) {
        // rule-id: ogs-002-024 (rule 355.8) — "all enemy units at A
        // battlefield": the battlefield is the caster's play-time choice.
        // Enumerate one Play per battlefield, locking it as targets [bfId];
        // the affected units are re-derived at resolution.
        for (const bfId of Object.keys(state.battlefields)) {
          baseVariants.push({
            cardId: cardId as string,
            playerId: context.playerId as string,
            targets: [bfId],
          });
        }
      } else if (
        spellEffect?.type === "reveal-hand" &&
        ((spellEffect as { battlefield?: string }).battlefield === "choose" ||
          (spellEffect as { chooseBattlefield?: boolean }).chooseBattlefield === true) &&
        Object.keys(state.battlefields ?? {}).length > 0
      ) {
        // rule 419.3 (unl-139-219 Bone Skewer) — "Choose a battlefield. An
        // opponent reveals their hand…": the BATTLEFIELD is the caster's
        // play-time choice, locked as targets [bfId]. The hand card is never a
        // play-time target (rule 355.10.a — hand cards are never targets); it
        // is picked as the effect resolves.
        for (const bfId of Object.keys(state.battlefields)) {
          baseVariants.push({
            cardId: cardId as string,
            playerId: context.playerId as string,
            targets: [bfId],
          });
        }
      } else if (counterSpec) {
        // rule-id: ogn-064-298 (rule 355.8) — "Counter a spell": the spell to
        // counter is a caster-chosen target locked at play time. Enumerate one
        // Play per legal chain item so the caster picks when several are
        // pending (the handler reads it from boundTargets).
        // rule 425.1 (sfd-045-221) — "an ability" is singular: two pending
        // items sourced from the SAME card (a doubled Deathknell) are separate
        // objects, so each is offered on its own. The card id names the item
        // whenever it is unambiguous; further copies are named by chain-item id.
        const seen = new Set<string>();
        for (const item of interaction.chain?.items ?? []) {
          if (!isLegalCounterTarget(counterSpec, item, undefined, {
              controllerOf: (id) =>
                context.cards.getCardController?.(id as CoreCardId) ??
                context.cards.getCardOwner(id as CoreCardId),
              playerId: context.playerId as string,
            }))
            continue;
          const key = seen.has(item.cardId) ? item.id : item.cardId;
          if (seen.has(key)) continue;
          seen.add(key);
          seen.add(item.cardId);
          baseVariants.push({
            cardId: cardId as string,
            playerId: context.playerId as string,
            targets: [key],
          });
        }
      } else {
        baseVariants.push({
          cardId: cardId as string,
          playerId: context.playerId as string,
        });
      }
      // rule-id: sfd-206-221 (rule 355.8) — "Choose a friendly unit and a
      // spell": a sequence whose LEAD step counters names a chain item as well
      // as the board target the later steps own. The board pick already owns
      // the enumerated variant, so append the chain item as a second target
      // whenever more than one item is legal to counter; with a sole legal
      // item the handler's topmost-legal rule picks the same one anyway.
      const seqCounterSpec =
        counterSpec === undefined ? leadCounterEffect(spellEffect) : undefined;
      if (seqCounterSpec) {
        const counterChoices: string[] = [];
        const seenItems = new Set<string>();
        for (const item of interaction.chain?.items ?? []) {
          if (
            !isLegalCounterTarget(seqCounterSpec, item, cardId as string, {
              controllerOf: (id) =>
                context.cards.getCardController?.(id as CoreCardId) ??
                context.cards.getCardOwner(id as CoreCardId),
              playerId: context.playerId as string,
            })
          )
            continue;
          if (seenItems.has(item.cardId)) continue;
          seenItems.add(item.cardId);
          counterChoices.push(item.cardId as string);
        }
        if (counterChoices.length >= 2) {
          const expanded = baseVariants.flatMap((v) =>
            counterChoices.map((itemId) => ({
              ...v,
              targets: [...(v.targets ?? []), itemId],
            })),
          );
          baseVariants.length = 0;
          baseVariants.push(...expanded);
        }
      }
      results.push(...baseVariants);

      // rule-id: ven-083-166 / rule 560 — "you may pay [X] as an additional
      // cost": enumerate a paid variant per base play so the caster can
      // elect it; the spell's `paid-additional-cost` conditional reads the
      // outcome at resolution.
      const optionalPay = getOptionalPlayCost(cardId as string);
      // rule-id: unl-140-219 (rule 560) — an XP additional cost is only
      // offered when the caster's XP total covers it.
      const xpNeedForPay = optionalPay?.cost?.xp ?? 0;
      const xpAffordable =
        xpNeedForPay === 0 ||
        (state.players[context.playerId as string]?.xp ?? 0) >= xpNeedForPay;
      if (optionalPay?.kind === "pay" && xpAffordable) {
        const extra = optionalPay.cost ?? {};
        const metaForPay = createMetaAccessor(context.cards);
        for (const base of baseVariants) {
          if (
            canAffordCard(
              state,
              context.playerId as string,
              cardId as string,
              { additionalCost: extra, board, targets: base.targets },
              metaForPay,
              potential,
            )
          ) {
            results.push({
              ...base,
              additionalCostSpec: { energy: extra.energy ?? 0, power: extra.power ?? [] },
              paidAdditionalCost: true,
            });
          }
        }
      }
      // rule 356.2.b — ogn-146-298: "you may spend a buff as an additional
      // cost" — offer the paid variant whenever a friendly buff exists.
      if (
        optionalPay?.kind === "spend-buff" &&
        spendBuffCandidates(state, context, context.playerId as string, cardId as string).length > 0
      ) {
        for (const base of baseVariants) {
          results.push({ ...base, paidAdditionalCost: true });
        }
      }
      // rule 356.2.b / 204.2 (ven-008-166) — "you may discard N as an
      // additional cost": one paid variant per other card in hand.
      if (optionalPay?.kind === "discard" && (optionalPay.discard ?? 0) === 1) {
        for (const base of baseVariants) {
          for (const fodder of handCards) {
            if ((fodder as string) === (cardId as string)) {
              continue;
            }
            results.push({
              ...base,
              discardId: fodder as string,
              paidAdditionalCost: true,
            });
          }
        }
      }
      // rule 356.2 — ogn-048-298: "you may exhaust a friendly unit" — one paid
      // variant per ready candidate; the chosen permanent rides as targets[0].
      if (optionalPay?.kind === "exhaust") {
        const candidates = exhaustCostCandidates(
          state,
          context,
          context.playerId as string,
          cardId as string,
          optionalPay.exhaust,
        );
        for (const base of baseVariants) {
          for (const id of candidates) {
            if (base.targets?.includes(id)) {
              continue;
            }
            results.push({
              ...base,
              paidAdditionalCost: true,
              targets: [id, ...(base.targets ?? [])],
            });
          }
        }
      }

      // unl-182-219 [Repeat]: the additional cost is paid at cast time, so
      // enumerate one variant per affordable repeatCount alongside the base
      // rule 356.4.f.1 — a tier discounted all the way to [0] is still a cost
      // the payer may pay, so offer every tier even when nothing is charged;
      // n stays bounded by the number of tiers (rule 820.1.c.3).
      // rule-id: unl-146-219 — include board-granted Repeat instances.
      const repeatCost = getEffectiveSpellRepeatCost(
        state,
        context.playerId as string,
        cardId as string,
        board,
      );
      if (repeatCost && repeatCost.length > 0) {
        const meta = createMetaAccessor(context.cards);
        // rule 820.2.a (sfd-151-221) — the two executions' target GROUPS are
        // offered once per unordered pair of groups (swapping them is the same
        // play), each group in a canonical order so a caller can name it.
        const offeredGroupPairs = new Set<string>();
        for (const base of baseVariants) {
          // rule-id: sfd-122-221 — Rule 820.1.c.3: each Repeat instance is
          // paid at most once, so n never exceeds the number of instances.
          for (let n = 1; n <= repeatCost.length; n++) {
            if (
              !canAffordCard(
                state,
                context.playerId as string,
                cardId as string,
                { board, repeatCount: n, targets: base.targets },
                meta,
                potential,
              )
            ) {
              break;
            }
            results.push({ ...base, repeatCount: n });
            // rule 820.2.a — the extra execution makes its OWN choices, so the
            // caster may name a different target for each execution. Offer one
            // variant per distinct ordered target list of length n+1 (the first
            // slot stays this base variant's target).
            // rule 820.2.a (sfd-136-221) — a counter's target is a chain item,
            // not a board card, but the repeated execution picks its own just
            // the same, so offer the two-item variants here too.
            if ((isCardTarget || counterSpec !== undefined) && base.targets?.length === 1 && n === 1) {
              const first = base.targets[0] as string;
              for (const other of baseVariants) {
                const alt = other.targets?.[0];
                if (alt === undefined || alt === first) {
                  continue;
                }
                results.push({ ...base, repeatCount: n, targets: [first, alt] });
              }
            }
            // rule 820.2.a (sfd-151-221) — an instruction that names SEVERAL
            // units per execution ("Give two friendly units each +1 [Might]")
            // also chooses afresh for the repeat: offer every ordered pair of
            // distinct target GROUPS, the base variant's group going first.
            const perExecution =
              isCardTarget && typeof tgt === "object" && typeof tgt.quantity === "number"
                ? tgt.quantity
                : 0;
            if (perExecution >= 2 && base.targets?.length === perExecution && n === 1) {
              const firstGroup = [...base.targets].sort();
              for (const other of baseVariants) {
                if (other.targets?.length !== perExecution) {
                  continue;
                }
                const alt = [...other.targets].sort();
                const [lo, hi] =
                  firstGroup.join("+") <= alt.join("+") ? [firstGroup, alt] : [alt, firstGroup];
                const pairKey = `${lo.join("+")}|${hi.join("+")}`;
                if (lo.join("+") === hi.join("+") || offeredGroupPairs.has(pairKey)) {
                  continue;
                }
                offeredGroupPairs.add(pairKey);
                results.push({ ...base, repeatCount: n, targets: [...lo, ...hi] });
              }
            }
          }
        }
      }

      // rule 357.2 — the mandatory kill is paid once per play, so every
      // variant of this card is offered once per legal sacrifice.
      if (killChoices) {
        const withKill = results
          .slice(cardResultsStart)
          .flatMap((base) => killChoices.map((sacrificeId) => ({ ...base, sacrificeId })));
        results.length = cardResultsStart;
        results.push(...withKill);
      }
    }

    // rule-id: ven-049-166 — [Flow]: enumerate spells in the owner's trash
    // that carry a Flow cost keyword as playable via their alternate cost.
    const trashCards = context.zones.getCardsInZone(
      "trash" as CoreZoneId,
      context.playerId as CorePlayerId,
    );
    const meta = createMetaAccessor(context.cards);
    for (const cardId of trashCards) {
      const def = registry.get(cardId as string);
      if (!def || def.cardType !== "spell") {
        continue;
      }
      // rule-id: ven-113-166 — printed OR granted [Flow] offers the trash play.
      if (!getFlowCostForPlay(cardId as string, meta)) {
        continue;
      }
      // rule 419.1 — board statics that forbid playing this card (ven-132-166).
      if (
        playIsForbidden(
          { cards: context.cards, draft: state, zones: context.zones },
          context.playerId as string,
          cardId as string,
        )
      ) {
        continue;
      }
      if (
        !canAffordCard(state, context.playerId as string, cardId as string, { board, viaFlow: true }, meta, potential)
      ) {
        continue;
      }
      const timing = (registry.getSpellTiming(cardId as string) ?? "action") as TimingClass;
      if (!isLegalTiming(timing, turnState)) {
        continue;
      }
      // rule 316.5.b: Neutral Open State → only the Turn Player plays spells.
      if (turnState === "neutral-open" && state.turn.activePlayer !== (context.playerId as string)) {
        continue;
      }
      // rule 312.2.c-d: Closed State → only the Priority holder may add an item.
      if (!hasChainPriorityPermission(interaction, context.playerId as string)) {
        continue;
      }
      // rule 313.1 / 347: Showdown Open State → only the Focus holder acts.
      if (turnState === "showdown-open" && !hasShowdownPermission(interaction, context.playerId as string)) {
        continue;
      }
      const abilities = registry.getAbilities(cardId as string) ?? [];
      const spellAbility = abilities.find((a: { type: string }) => a.type === "spell");
      const spellEffect = spellAbility?.effect as SpellEffectTargetShape | undefined;
      const resolverCtx = {
        cards: {
          // rule 740.1.a / 477.1.a — friendliness follows current control.
          getCardController: (c: CoreCardId) => context.cards.getCardController?.(c),
          getCardMeta: (c: CoreCardId) => context.cards.getCardMeta?.(c),
          getCardOwner: (c: CoreCardId) => context.cards.getCardOwner(c),
        },
        // rule-id: ven-031-166 — enumerating caster-chosen targets.
        choosing: true,
        draft: state,
        playerId: context.playerId as string,
        sourceCardId: cardId as string,
        zones: {
          getCardZone: (c: CoreCardId) => context.zones.getCardZone(c),
          getCardsInZone: (z: CoreZoneId, p?: CorePlayerId) => context.zones.getCardsInZone(z, p),
        },
      };
      if (!spellEffectHasLegalTargets(spellEffect, resolverCtx)) {
        continue;
      }
      // rule-id: sfd-017-221 (rule 355.8) — lift a sequence's lead target.
      // rule-id: ogn-254-298 — lift a "next time it…" replacement's chosen unit.
      const tgt =
        spellEffect?.target ??
        findReplacementChosenTarget(spellEffect) ??
        findSequenceLeadTarget(spellEffect);
      const isCardTarget =
        counterChainTarget(spellEffect) === undefined &&
        // rule-id: ogn-198-298 — an off-board play's card is chosen from the
        // trash/hand as the effect resolves, never as a play-time board target.
        (offBoardPlayZone(spellEffect) === undefined ||
          offBoardPlayIsCasterChosen(spellEffect)) &&
        tgt !== undefined &&
        typeof tgt !== "string" &&
        tgt.type !== "self" &&
        tgt.type !== "player" &&
        tgt.type !== "battlefield" &&
        tgt.quantity !== "all";
      if (isCardTarget) {
        // rule-id: unl-204-219 (rule 355.8) — enumerate every legal
        // candidate, not just the first (resolveTarget defaults count to 1).
        const validTargets = resolveTarget(
          { ...tgt, quantity: "all" } as Parameters<typeof resolveTarget>[0],
          resolverCtx,
        ).filter((id) => {
          // rule 355.4.a (unl-101-219) — only offer units that have a legal
          // destination other than where they already are.
          const dests = chosenMoveDestinations(spellEffect, id as string, resolverCtx);
          return dests === undefined || dests.length > 0;
        });
        for (const targetId of validTargets) {
          results.push({
            cardId: cardId as string,
            playerId: context.playerId as string,
            targets: [targetId as string],
            viaFlow: true,
          });
        }
      } else {
        results.push({
          cardId: cardId as string,
          playerId: context.playerId as string,
          viaFlow: true,
        });
      }
    }
    return results;
  },
  reducer: (draft, context) => {
    const { cardId, playerId, xAmount, repeatCount, viaFlow, paidAdditionalCost, sacrificeId } =
      context.params;
    const discardId = context.params.discardId as string | undefined;
    let { targets } = context.params;
    const { zones } = context;

    // rule-id: ven-083-166 / rule 560 — re-derive the optional additional
    // cost from the card definition (never trust client-supplied specs) and
    // record whether it was actually paid so the spell's
    // `paid-additional-cost` conditional can read it at resolution.
    let spellAdditionalCost: CostExtras["additionalCost"];
    let exhaustCostPaid = false;
    let ignoreBaseCost = false;
    if (paidAdditionalCost) {
      const optional = getOptionalPlayCost(cardId);
      if (optional?.kind === "spend-buff") {
        // rule 702.2.b — spending a buff removes the buff counter; the Might
        // readers look at top-level meta.buffed, so mirror the flag there.
        const chosen = spendBuffCandidates(draft, context, playerId, cardId)[0];
        if (chosen) {
          context.counters.setFlag(chosen as CoreCardId, "buffed", false);
          context.cards.updateCardMeta?.(chosen as CoreCardId, {
            buffed: false,
          } as Partial<RiftboundCardMeta>);
          exhaustCostPaid = true;
          ignoreBaseCost = optional.ignoresBaseCost === true;
          // rule 702.2.b — paying with a buff is a spend: "When you spend a
          // buff" triggers fire as the cost is paid.
          fireTriggers(
            { cardId: cardId as string, playerId, spentFrom: chosen as string, type: "spend-buff" },
            { cards: context.cards, counters: context.counters, draft, zones },
          );
        }
      } else if (optional?.kind === "exhaust") {
        // rule 356.2 — ogn-048-298: exhaust the chosen ready friendly
        // permanent now (costs are paid as the spell is played, before it is
        // on the chain); it is a cost choice, not a spell target.
        const chosen = targets?.[0];
        if (
          chosen &&
          exhaustCostCandidates(draft, context, playerId, cardId, optional.exhaust).includes(
            chosen as string,
          )
        ) {
          context.counters.setFlag(chosen as CoreCardId, "exhausted", true);
          exhaustCostPaid = true;
          const rest = (targets ?? []).slice(1);
          targets = rest.length > 0 ? rest : undefined;
        }
      } else if (optional?.kind === "discard") {
        // rule 356.2.b / 204.2 (ven-008-166) — discard the declared hand card
        // now; costs are paid as the spell is played, before it hits the chain.
        if (
          discardId &&
          discardId !== cardId &&
          zones.getCardZone(discardId as CoreCardId) === "hand" &&
          context.cards.getCardOwner(discardId as CoreCardId) === playerId
        ) {
          // rule 422 — a discard paid as a cost is still a discard event.
          removeFromBoard(
            { cards: context.cards, counters: context.counters, draft, zones },
            [discardId as string],
            "trash",
            { by: playerId, kind: "discard", source: cardId as string, sourceKind: "spell" },
            (event) => fireTriggers(event, { cards: context.cards, counters: context.counters, draft, zones }),
          );
          exhaustCostPaid = true;
        }
      } else if (optional?.kind === "pay") {
        // rule-id: unl-140-219 (rule 560) — "spend N XP as an additional
        // cost": deduct the XP from the caster's total; if they lack it the
        // additional cost is not paid at all.
        const xpNeed = optional.cost?.xp ?? 0;
        const player = draft.players[playerId];
        if (xpNeed === 0) {
          spellAdditionalCost = optional.cost ?? {};
        } else if (player && (player.xp ?? 0) >= xpNeed) {
          player.xp -= xpNeed;
          spellAdditionalCost = optional.cost ?? {};
        }
      }
    }
    if (!draft.additionalCostsPaid) {
      draft.additionalCostsPaid = {};
    }
    draft.additionalCostsPaid[cardId] = spellAdditionalCost !== undefined || exhaustCostPaid;

    const repeatN = Math.max(0, repeatCount ?? 0);
    deductCost(
      draft,
      playerId,
      cardId,
      {
        additionalCost: spellAdditionalCost,
        // rule-id: ven-055-166 — friendly "your spells cost less" statics.
        board: { cards: context.cards, zones: context.zones },
        ignoreBaseCost,
        repeatCount: repeatN,
        targets,
        viaFlow: viaFlow === true,
        // rule 204.3.b (ogn-268-298): a [rainbow] X is NOT a play cost — the
        // condition proved the Power is there, but it only leaves the pool
        // when the spell resolves (chain/resolve.ts).
        xAmount: xCostIsPower(cardId) ? undefined : xAmount,
      },
      createMetaAccessor(context.cards),
      // rule 357.1.a: tap ready runes for any Energy shortfall at Pay time.
      { counters: context.counters, zones: context.zones },
    );

    // rule-id: sfd-078-221 — the grant applies to the NEXT spell only: consume
    // it here (after the cost was computed with it) so a later spell this turn
    // is offered no Repeat.
    if (draft.nextSpellRepeat?.[playerId]) {
      delete draft.nextSpellRepeat[playerId];
    }

    // Look up spell effect from card definition
    const registry = getGlobalCardRegistry();
    const abilities = registry.getAbilities(cardId) ?? [];
    const spellAbility = abilities.find((a) => a.type === "spell");
    const spellEffect = spellAbility?.effect;

    // For X-cost spells, wrap the effect so the chosen X value travels
    // With it through the chain. The effect executor reads `variables.x`
    // When resolving `{ variable: "x" }` amount expressions.
    // For Repeat spells, we wrap the effect in a `sequence` that
    // Repeats the original effect (1 + repeatCount) times. This
    // Executes during chain resolution exactly once per repeat.
    const xValue = Math.max(0, xAmount ?? 0);
    let effectToStore: unknown = spellEffect;
    if (spellEffect && repeatN > 0) {
      // rule 820.2.a (sfd-151-221) — when the caster named one GROUP of
      // targets per execution ("Give two friendly units each +1"), each copy
      // gets its own slice so execution i affects only its own group.
      const perExecution = (spellEffect as { target?: { quantity?: unknown } }).target?.quantity;
      const groupSize =
        typeof perExecution === "number" &&
        perExecution >= 2 &&
        targets?.length === perExecution * (1 + repeatN)
          ? perExecution
          : 0;
      const repeatedEffects = Array.from({ length: 1 + repeatN }, (_unused, i) =>
        groupSize > 0
          ? {
              boundTargetsOverride: (targets as string[]).slice(i * groupSize, (i + 1) * groupSize),
              effects: [spellEffect],
              type: "sequence",
            }
          : spellEffect,
      );
      effectToStore = {
        effects: repeatedEffects,
        type: "sequence",
        // rule 820.2.a — each execution makes its own choices: when the caster
        // named one target per execution, every copy owns a POSITIONAL slot so
        // execution i affects targets[i] instead of all of them hitting the first.
        ...(targets && targets.length === 1 + repeatN ? { independentTargets: true } : {}),
      };
    }
    // rule 204.3.b (ogn-268-298): an X pledged up front for a [rainbow] X spell
    // is carried to resolution and only PAID there — `_xPledged` tells
    // chain/resolve.ts to charge the Power instead of prompting.
    const pledgedPowerX = xCostIsPower(cardId) && xAmount !== undefined;
    if ((xValue > 0 || pledgedPowerX) && effectToStore) {
      effectToStore = {
        ...(effectToStore as Record<string, unknown>),
        _variables: { x: xValue },
        ...(pledgedPowerX ? { _xPledged: true } : {}),
      };
    }

    // Add spell to the chain (rule 537)
    const interaction = draft.interaction ?? createInteractionState();
    const turnOrder = Object.keys(draft.players);
    draft.interaction = addToChain(
      interaction,
      {
        cardId,
        controller: playerId,
        effect: effectToStore,
        // rule-id: ven-049-166 — a spell played via [Flow] from the trash is
        // banished instead of returning to the trash.
        resolveTo: viaFlow ? "banishment" : "trash",
        targets,
        type: "spell",
        // rule-id: ven-015-166 — carry "This can't be countered." onto the chain item.
        ...((spellAbility as { uncounterable?: boolean } | undefined)?.uncounterable
          ? { uncounterable: true }
          : {}),
      },
      turnOrder,
    );

    // Rule 419.4.a: play-spell / play-card triggers fire when the spell
    // RESOLVES (not here) — see executeResolvedItem in chain-moves.ts.
    // Firing here would trigger e.g. Abandoned Hall even on countered
    // spells (425.1.b).

    // Rule 724 (Legion) tracker: count this spell play so subsequent
    // Cards can satisfy their Legion conditions.
    if (draft.cardsPlayedThisTurn) {
      draft.cardsPlayedThisTurn[playerId] = (draft.cardsPlayedThisTurn[playerId] ?? 0) + 1;
    }

    // rule-id: unl-007-219 — the spell card physically sits on the chain
    // while pending; chain-moves places it in `resolveTo` when it leaves
    // the chain (resolved or countered), not at play time.
    zones.moveCard({
      cardId: cardId as CoreCardId,
      targetZoneId: "chain" as CoreZoneId,
    });

    // rule-id: sfd-142-221 (rule 359.2 / 383.4.b.2) — "when you choose me"
    // triggers become pending once the choosing spell is Finalized on the
    // chain (targets locked at play time), not when it later resolves.
    if (targets && targets.length > 0) {
      const trigCtx = { cards: context.cards, counters: context.counters, draft, zones };
      // rule 820.1.d / 820.2 — [Repeat] executes the instructions an additional
      // time and the choices for EVERY execution are made while playing the
      // card, so choosing the same card for each execution is a separate
      // targeting event. When one target was supplied per execution the
      // `targets` list already enumerates every targeting event (see
      // `independentTargets` above); only a target list SHARED by all
      // executions is repeated here.
      // rule 820.2.a (sfd-151-221) — one group per execution likewise
      // enumerates every targeting event exactly once.
      const perExecutionQty = (
        registry.getAbilities(cardId)?.find((a) => a.type === "spell")?.effect as
          | { target?: { quantity?: unknown } }
          | undefined
      )?.target?.quantity;
      const oneGroupPerExecution =
        typeof perExecutionQty === "number" &&
        perExecutionQty >= 2 &&
        targets.length === perExecutionQty * (1 + repeatN);
      const chooseExecutions =
        targets.length === 1 + repeatN || oneGroupPerExecution ? 1 : 1 + repeatN;
      for (let execution = 0; execution < chooseExecutions; execution++) {
        for (const targetId of targets) {
          fireTriggers(
            { cardId: targetId, chooserId: playerId, sourceType: "spell", type: "choose" },
            trigCtx,
          );
        }
      }
    }

    // rule 357.2 / 356.2.a.1 (unl-173-219) — the mandatory kill is paid while
    // the spell is played, exactly once no matter how many Repeat instances
    // are paid (135.2.b.3). rule 428.1.a.1.b / 359.3.a-b: the death happens
    // after the spell has been placed on the chain, so the victim's Deathknell
    // becomes a pending item ABOVE the spell and resolves first (340.1).
    if (sacrificeId && mandatoryKillCost(cardId)) {
      // rule 428.1 / 370.1.a.1: it is a real kill, so Deathknell fires and a
      // die-replacement (Zhonya's Hourglass) may apply; 357.2.a — the cost
      // counts as paid either way.
      executeEffect(
        { target: { type: "unit" }, type: "kill" },
        {
          boundTargets: [sacrificeId as string],
          cards: context.cards,
          counters: context.counters,
          draft,
          fireTriggers: (event) =>
            fireTriggers(event, {
              cards: context.cards,
              counters: context.counters,
              draft,
              zones: context.zones,
            }),
          playerId,
          sourceCardId: cardId,
          zones: context.zones,
        },
      );
    }
  },
};
