/**
 * Chain resolution: executeResolvedItem + passChainPriority / resolveChain moves (split from chain-moves.ts).
 */

import type { CardId as CoreCardId, ZoneId as CoreZoneId, GameMoveDefinitions } from "@tcg/core";
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
import { isAllAtOneBattlefield, resolveTarget } from "../../../abilities/target-resolver";
import { fireTriggers } from "../../../abilities/trigger-runner";
import { cleanupAndFireDeaths } from "../../../cleanup/post-move-cleanup";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { getCardEffectiveMight } from "../play/cost";
import {
  findSequenceLeadTarget,
  isLegalMultiTargetSet,
  type SpellEffectTargetShape,
} from "../play/targeting";
import { buildEffectContext } from "./effect-context";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * Execute a resolved chain item's effect.
 * Skips execution if the item was countered (rule 543).
 */
export function executeResolvedItem(
  resolved: ChainItem,
  draft: RiftboundGameState,
  context: Parameters<typeof buildEffectContext>[3],
): void {
  // Countered items don't execute their effects
  if (resolved.countered) {
    return;
  }

  // Rule 583 (unl-021-219): a "you may …" trigger reaches resolution but its
  // effect runs only if the controller opts in. Pause via an `opt-in` pending
  // choice; on accept the reducer re-enters here with `optional` cleared.
  if (resolved.optional) {
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
      return;
    }
    // rule-id: unl-119-219 — "you may spend 3 XP to …": an unpayable XP cost
    // likewise suppresses the opt-in prompt.
    if (
      leadEffect?.type === "spend-xp" &&
      !canSpendXp(leadEffect, buildEffectContext(draft, resolved.controller, resolved.cardId, context))
    ) {
      return;
    }
    draft.pendingChoice = {
      type: "opt-in",
      playerId: resolved.controller,
      sourceCardId: resolved.cardId,
      resolved: { ...resolved, optional: false },
    };
    return;
  }

  const rawEffect = resolved.effect as
    | (ExecutableEffect & { _variables?: Record<string, number> })
    | undefined;
  if (!rawEffect) {
    // No stored effect — try to look up from card registry (fallback for spells)
    const registry = getGlobalCardRegistry();
    const abilities = registry.getAbilities(resolved.cardId) ?? [];
    const spellAbility = abilities.find((a) => a.type === "spell");
    if (spellAbility?.effect) {
      const baseCtx = buildEffectContext(draft, resolved.controller, resolved.cardId, context);
      const effectCtx: EffectContext = resolved.targets
        ? { ...baseCtx, boundTargets: resolved.targets }
        : baseCtx;
      executeEffect(spellAbility.effect as ExecutableEffect, effectCtx);
    }
    return;
  }

  // Strip any bound variables (e.g., X-cost value) before executing — they
  // Are threaded into the EffectContext so `{ variable: "x" }` expressions
  // Can resolve to the chosen X amount during spell resolution.
  const { _variables, ...effectRest } = rawEffect;
  const effect = effectRest as ExecutableEffect;

  const baseCtx = buildEffectContext(draft, resolved.controller, resolved.cardId, context);

  // rule-id: ven-021-166 — expose the firing event's from/to zones so
  // `location: "move-to-or-from"` targets resolve against only the
  // battlefields the triggering move touched.
  const trigEvt = resolved.triggerEvent as
    | { from?: string; to?: string; cardId?: string; fromHiddenAt?: string }
    | undefined;
  const triggerZones = trigEvt
    ? [trigEvt.from, trigEvt.to].filter((z): z is string => typeof z === "string")
    : undefined;
  // rule-id: unl-133-219 — the firing event's subject card ("…[Stun] it").
  const triggerSourceId = typeof trigEvt?.cardId === "string" ? trigEvt.cardId : undefined;
  // rule-id: ogn-097-298 — Rule 723.1.d (811.1.d.2): a card played from Hidden
  // may only choose targets at the battlefield it was facedown at.
  const hiddenZone =
    typeof trigEvt?.fromHiddenAt === "string" ? `battlefield-${trigEvt.fromHiddenAt}` : undefined;

  // Rule 355.10: for a resolved effect that targets a caster-chosen single
  // card ("give a unit X"), the controller picks which card. When targets
  // were not bound at chain-placement time and more than one legal option
  // exists, pause and ask via a `choose-target` pending choice; the effect
  // runs from `resolvePendingChoice` once the pick is made.
  let boundTargets = resolved.targets;
  // rule-id: unl-119-219 (rule 355.10) — a `sequence` ("spend 3 XP, then deal
  // damage to an enemy unit here") carries its caster-chosen target on a
  // sub-step; lift the single lead descriptor so the controller is prompted
  // instead of the step auto-picking the first candidate.
  const target = (effect.target ??
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
    target.quantity !== "all"
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
    if (hiddenZone) {
      options = options.filter(
        (id) => baseCtx.zones.getCardZone(id as CoreCardId) === hiddenZone,
      );
    }
    // rule-id: ogn-256-298 (rule 355.13) — "any number of <units>": the
    // controller picks 0..n (declining is legal even with one candidate), so
    // prompt whenever any candidate exists; candidates that alone breach the
    // descriptor's aggregate cap (`totalMight`) are never legal.
    const anyNumber = (target as { quantity?: unknown }).quantity === "any";
    if (anyNumber) {
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
          picked: [],
        };
        return;
      }
      boundTargets = [];
    } else if (options.length >= 2) {
      draft.pendingChoice = {
        type: "choose-target",
        playerId: resolved.controller,
        sourceCardId: resolved.cardId,
        effect,
        options,
        remaining: 1,
      };
      return;
    } else {
      boundTargets = options;
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
      };
      return;
    }
    if (withMatches.length === 1) {
      boundTargets = [withMatches[0] as string];
    }
  }

  const effectCtx: EffectContext = {
    ...baseCtx,
    ...(_variables ? { variables: _variables } : {}),
    ...(boundTargets ? { boundTargets } : {}),
    ...(triggerSourceId ? { triggerSourceId } : {}),
  };
  // Rule 359.2: "when you choose me" triggers fire when a spell/ability's
  // controller picks a card as a target.
  // rule-id: sfd-142-221 (383.4.b.2) / sfd-052-221 (355.14.b) — play-time
  // targets (spell or activated ability) already fired `choose` at
  // finalization; only fire here for targets picked at resolution.
  const choseAtFinalize = !resolved.triggered && !!resolved.targets;
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
  executeEffect(effect, effectCtx);
  const postLen = draft.interaction?.chain?.items.length ?? 0;

  // Rule 419.4.a: abilities that trigger on playing a card fire when that
  // act is completed by resolution — not when the card is placed on the
  // chain, and never if the card was countered (425.1.b).
  if (resolved.type === "spell") {
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
      items.push(...pendingPlays);
    }
  }
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
): void {
  if (resolved.type !== "spell") {
    return;
  }
  if (context.zones.getCardZone(resolved.cardId as CoreCardId) !== ("chain" as CoreZoneId)) {
    return;
  }
  context.zones.moveCard({
    cardId: resolved.cardId as CoreCardId,
    targetZoneId: (resolved.resolveTo ?? "trash") as CoreZoneId,
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
        executeResolvedItem(resolved, draft, context);
        settleResolvedSpellCard(resolved, context);

        // Run state-based checks after resolution (rule 543.3/518).
        // rule-id: ogn-246-298 — units reaped here must emit `die` so
        // "when a friendly unit dies" / Deathknell triggers fire.
        cleanupAndFireDeaths(draft, context);
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
      executeResolvedItem(resolved, draft, context);
      settleResolvedSpellCard(resolved, context);

      // rule-id: ogn-246-298 — SBA deaths after resolution emit `die`.
      cleanupAndFireDeaths(draft, context);
    }
  },
};
