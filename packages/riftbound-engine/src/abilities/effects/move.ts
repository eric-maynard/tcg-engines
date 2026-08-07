// Effect handler: "move"
import type { CardId as CoreCardId, ZoneId as CoreZoneId } from "@tcg/core";
import type { RiftboundGameState } from "../../types";
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds, getEffectiveMight } from "./_helpers";
import { isBlockedByTwoOtherPlayers } from "../../game-definition/moves/movement/helpers";

/**
 * rule-id: unl-144-219 — Rule 450 / 190.3.a: a unit arriving (by any means,
 * including an ability's move effect) at a battlefield its controller does
 * not control applies Contested. Cleanup (323.13) then stages the showdown /
 * combat via the `startShowdown` move once the chain closes.
 */
export function markContestedOnArrival(
  draft: RiftboundGameState,
  targetZoneId: string,
  playerId: string,
): void {
  if (!targetZoneId.startsWith("battlefield-")) {
    return;
  }
  const bf = draft.battlefields[targetZoneId.slice("battlefield-".length)];
  if (!bf || bf.controller === playerId || bf.contested) {
    return;
  }
  bf.contested = true;
  bf.contestedBy = playerId;
  bf.showdownComplete = false;
}

/**
 * rule 450: Contested is attributed to the CONTROLLER of the unit that arrived,
 * never to the player who chose the move (ogn-043-298 Charm moves an ENEMY unit).
 */
function arrivingController(ctx: EffectContext, cardId: string): string {
  return (
    ctx.cards.getCardController?.(cardId as CoreCardId) ??
    ctx.cards.getCardOwner(cardId as CoreCardId) ??
    ctx.playerId
  );
}

/**
 * rule-id: unl-112-219 (Irresistible Faefolk) — rules 319.8 / 323.9 / 464.2.c:
 * cleanup after an effect-driven move stages combat when opposing units now
 * share a contested battlefield. The attacker is the player whose unit applied
 * Contested (464.2.c.1), not whoever moved the unit; every other occupant
 * defends (464.2.c.2). Idempotent — re-running on an already-staged combat is
 * a no-op.
 */
export function stageCombatOnArrival(ctx: EffectContext, targetZoneId: string): void {
  if (!targetZoneId.startsWith("battlefield-")) {
    return;
  }
  const bfId = targetZoneId.slice("battlefield-".length);
  const bf = ctx.draft.battlefields?.[bfId];
  const attackingPlayer = bf?.contested === true ? bf.contestedBy : undefined;
  if (!bf || typeof attackingPlayer !== "string") {
    return;
  }
  const occupants = ctx.zones.getCardsInZone(targetZoneId as CoreZoneId).map((id) => id as string);
  const ownerOf = (id: string): string | undefined =>
    (ctx.cards.getCardController?.(id as CoreCardId) ??
      ctx.cards.getCardOwner(id as CoreCardId)) as string | undefined;
  const attackers = occupants.filter((id) => ownerOf(id) === attackingPlayer);
  const defenders = occupants.filter((id) => {
    const owner = ownerOf(id);
    return owner !== undefined && owner !== attackingPlayer;
  });
  if (attackers.length === 0 || defenders.length === 0) {
    return;
  }
  // rule 464.2.c.3.a — a unit already carrying the Defender designation keeps
  // it; only newly-present units gain it (and fire "when I defend") here.
  const wasDefender = new Map<string, boolean>(
    defenders.map((id) => [
      id,
      (ctx.cards.getCardMeta?.(id as CoreCardId) as { combatRole?: string } | undefined)?.combatRole === "defender",
    ]),
  );
  const alreadyStaged = defenders.every((id) => wasDefender.get(id) === true);
  const defendingPlayer = ownerOf(defenders[0] as string) as string;
  bf.showdownComplete = false;
  for (const id of attackers) {
    ctx.cards.updateCardMeta?.(id as CoreCardId, { combatRole: "attacker" });
  }
  for (const id of defenders) {
    ctx.cards.updateCardMeta?.(id as CoreCardId, { combatRole: "defender" });
  }
  // Reopen the battlefield's showdown as a combat showdown with the attacker
  // holding Focus (rule 625.1.c). An in-flight showdown here is upgraded in
  // place rather than stacked.
  const interaction = ctx.draft.interaction;
  const stack = interaction?.showdownStack;
  if (stack && stack.length > 0) {
    const top = stack[stack.length - 1] as {
      battlefieldId?: string;
      isCombatShowdown?: boolean;
      attackingPlayer?: string;
      defendingPlayer?: string;
      focusPlayer?: string;
      passedPlayers?: string[];
      relevantPlayers?: string[];
      active?: boolean;
    };
    if (top.battlefieldId === bfId) {
      top.active = true;
      top.isCombatShowdown = true;
      top.attackingPlayer = attackingPlayer;
      top.defendingPlayer = defendingPlayer;
      top.relevantPlayers = [...new Set([attackingPlayer, defendingPlayer])];
      if (!alreadyStaged) {
        top.focusPlayer = attackingPlayer;
        top.passedPlayers = [];
      }
    }
  }
  if (alreadyStaged) {
    return;
  }
  for (const id of attackers) {
    ctx.fireTriggers?.({ battlefieldId: bfId, cardId: id, owner: attackingPlayer, type: "attack" });
  }
  // rule 383.4.f.2.a (sfd-126-221) — a player who already holds the Defender
  // designation in this combat does not "defend" a second time when another of
  // their units joins, so those later events carry a non-zero `batchIndex` and
  // only unit-scoped ("when I defend") triggers see them.
  const priorDefendingPlayers = new Set(
    defenders.filter((id) => wasDefender.get(id) === true).map((id) => ownerOf(id) as string),
  );
  const defendCount = new Map<string, number>();
  for (const id of defenders) {
    if (wasDefender.get(id) === true) {
      continue;
    }
    const owner = ownerOf(id) as string;
    const seen = defendCount.get(owner) ?? 0;
    defendCount.set(owner, seen + 1);
    ctx.fireTriggers?.({
      batchIndex: seen + (priorDefendingPlayers.has(owner) ? 1 : 0),
      battlefieldId: bfId,
      cardId: id,
      owner,
      type: "defend",
    });
  }
}

/**
 * sfd-014-221 — true when the unit carries the `NoMoveToBase` marker keyword
 * (printed or granted by a static aura).
 */
function hasNoMoveToBase(ctx: EffectContext, cardId: string): boolean {
  const meta = (
    ctx.cards as { getCardMeta?: (id: CoreCardId) => { grantedKeywords?: { keyword: string }[] } | undefined }
  ).getCardMeta?.(cardId as CoreCardId);
  return meta?.grantedKeywords?.some((gk) => gk.keyword === "NoMoveToBase") === true;
}

/**
 * rule-id: unl-133-219 — an effect-driven move is still a move: move a board
 * card and emit the `move` event (with the unit's controller as `owner` and
 * the effect's controller as `movedBy`) so "When I move" / "When you move an
 * enemy unit" triggers fire. Non-board origins (hand, trash, …) are not moves.
 */
export function moveCardWithEvent(
  ctx: EffectContext,
  cardId: string,
  targetZoneId: string,
): string {
  const from = ctx.zones.getCardZone(cardId as CoreCardId) ?? "";
  // rule 144.4.b / sfd-014-221 (Minotaur Reckoner): "Units can't move to base"
  // binds effect-driven moves too (a Recall is not a Move — rule 455 — and goes
  // through effects/recall.ts, which never calls this).
  if (targetZoneId === "base" && from.startsWith("battlefield-") && hasNoMoveToBase(ctx, cardId)) {
    return from;
  }
  // rule 449.2 / 447.2.c / 456.1 — a battlefield already holding units of two
  // OTHER players cannot be entered by any means; the forced Move instead
  // becomes a Recall to base, and a Recall is not a Move (no move triggers).
  if (
    targetZoneId.startsWith("battlefield-") &&
    isBlockedByTwoOtherPlayers(
      targetZoneId,
      arrivingController(ctx, cardId),
      (zoneId) => ctx.zones.getCardsInZone(zoneId),
      (id) =>
        (ctx.cards.getCardController?.(id as CoreCardId) ??
          ctx.cards.getCardOwner(id as CoreCardId)) as string | undefined,
    )
  ) {
    if (from !== "base") {
      ctx.zones.moveCard({ cardId: cardId as CoreCardId, targetZoneId: "base" as CoreZoneId });
    }
    return "base";
  }
  ctx.zones.moveCard({ cardId: cardId as CoreCardId, targetZoneId: targetZoneId as CoreZoneId });
  const onBoard = (z: string) => z === "base" || z.startsWith("battlefield-");
  if (from === targetZoneId || !onBoard(from) || !onBoard(targetZoneId)) {
    return targetZoneId;
  }
  const owner =
    ctx.cards.getCardController?.(cardId as CoreCardId) ??
    ctx.cards.getCardOwner(cardId as CoreCardId) ??
    undefined;
  ctx.fireTriggers?.({
    cardId,
    from,
    movedBy: ctx.playerId,
    owner,
    to: targetZoneId,
    type: "move",
  });
  return targetZoneId;
}

/**
 * rule-id: ogn-199-298 (Tideturner) — `{type:"move", swap:true, partner}`:
 * "choose a unit you control at another location. Move me to its location and
 * it to my original location." The partner pool is every matching unit whose
 * location differs from mine, and the chooser is always prompted (rule 355.10)
 * even with a single candidate. Rule 811.1.d.2: the Hidden targeting
 * restriction (a card played from facedown may only choose at that
 * battlefield) can never be satisfied by this ability, so it does not apply —
 * the partner may sit anywhere, a base included.
 */
function handleSwapLocations(effect: ExecutableEffect, ctx: EffectContext): void {
  const selfId = ctx.sourceCardId;
  const selfZone =
    (ctx.zones.getCardZone(selfId as CoreCardId) as string | undefined) ?? ctx.sourceZone;
  if (!selfZone) {
    return;
  }
  const partnerDescriptor = ((effect as unknown as { partner?: TargetDescriptor }).partner ?? {
    controller: "friendly",
    type: "unit",
  }) as TargetDescriptor;

  const partner = ctx.boundTargets?.[0];
  if (partner === undefined) {
    const options = resolveTarget({ ...partnerDescriptor, quantity: "all" }, {
      cards: ctx.cards,
      choosing: true,
      draft: ctx.draft,
      playerId: ctx.playerId,
      sourceCardId: selfId,
      sourceZone: selfZone,
      zones: ctx.zones,
    } as Parameters<typeof resolveTarget>[1]).filter(
      (id) => id !== selfId && ctx.zones.getCardZone(id as CoreCardId) !== selfZone,
    );
    if (options.length === 0) {
      return;
    }
    ctx.draft.pendingChoice = {
      effect,
      options,
      playerId: ctx.playerId,
      remaining: 1,
      sourceCardId: selfId,
      type: "choose-target",
    } as RiftboundGameState["pendingChoice"];
    return;
  }

  const partnerZone = ctx.zones.getCardZone(partner as CoreCardId) as string | undefined;
  if (!partnerZone || partnerZone === selfZone) {
    return;
  }
  const selfLanded = moveCardWithEvent(ctx, selfId, partnerZone);
  markContestedOnArrival(ctx.draft, selfLanded, arrivingController(ctx, selfId));
  const partnerLanded = moveCardWithEvent(ctx, partner, selfZone);
  markContestedOnArrival(ctx.draft, partnerLanded, arrivingController(ctx, partner));

  // rule-id: sfd-050-221 (rule 716) — "If it's equipped, you may attach one of
  // its Equipment to me": only the swap knows which unit was chosen, so the
  // optional attach rides on this effect. Offer it as an opt-in whose accepted
  // item runs an `attach` bound to the partner's Equipment.
  if ((effect as unknown as { mayAttachPartnerEquipment?: boolean }).mayAttachPartnerEquipment !== true) {
    return;
  }
  const held = ctx.cards.getCardMeta?.(partner as CoreCardId) as
    | { equippedWith?: readonly string[] }
    | undefined;
  const equipment = held?.equippedWith ?? [];
  if (equipment.length === 0) {
    return;
  }
  ctx.draft.pendingChoice = {
    playerId: ctx.playerId,
    resolved: {
      cardId: selfId,
      controller: ctx.playerId,
      effect: { equipmentCandidates: [...equipment], type: "attach" },
      type: "ability",
    },
    sourceCardId: selfId,
    type: "opt-in",
  } as RiftboundGameState["pendingChoice"];
}

export function handle_move(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  if ((effect as unknown as { swap?: boolean }).swap === true) {
    handleSwapLocations(effect, ctx);
    return;
  }
  // rule-id: unl-107-219 (Stare Down) — Rule 355.8 / 355.2: "Choose a
  // friendly unit and a battlefield. Move all enemy units at that
  // battlefield with less Might than the chosen unit to their base." The
  // `reference` unit travels as boundTargets[0] (bound at play time by the
  // playSpell enumerator) and the chosen battlefield card id as
  // boundTargets[1]; whichever is not yet bound is prompted via
  // choose-target at resolution. The moved set is criteria-based, so it
  // is resolved here rather than through getTargetIds/boundTargets.
  // rule-id: ogn-250-298 (Stormbringer) — "… then move your unit there": the
  // caster-chosen unit rides at boundTargets[0] and the chosen battlefield at
  // boundTargets[1] (both locked at play time, rule 355.8). Rule 359.3.e.2:
  // a unit that stopped matching the `reference` descriptor no longer moves.
  if ((effect as unknown as { to?: unknown }).to === "chosen-battlefield") {
    const unitId = ctx.boundTargets?.[0];
    const bfId = ctx.boundTargets?.[1];
    if (unitId === undefined || bfId === undefined) {
      return;
    }
    const bfKey = bfId.startsWith("battlefield-") ? bfId.slice("battlefield-".length) : bfId;
    if (!ctx.draft.battlefields?.[bfKey]) {
      return;
    }
    const ref = (effect as unknown as { reference?: TargetDescriptor }).reference;
    if (
      ref &&
      !resolveTarget({ ...ref, quantity: "all" }, {
        cards: ctx.cards,
        draft: ctx.draft,
        playerId: ctx.playerId,
        sourceCardId: ctx.sourceCardId,
        sourceZone: ctx.sourceZone,
        zones: ctx.zones,
      }).includes(unitId)
    ) {
      return;
    }
    const destZone = `battlefield-${bfKey}`;
    const landed = moveCardWithEvent(ctx, unitId, destZone);
    markContestedOnArrival(ctx.draft, landed, arrivingController(ctx, unitId));
    stageCombatOnArrival(ctx, landed);
    return;
  }
  const moveRef = (effect as unknown as { reference?: TargetDescriptor }).reference;
  if (moveRef && (effect as unknown as { from?: unknown }).from === "chosen-battlefield") {
    const resolverCtx = {
      cards: ctx.cards,
      draft: ctx.draft,
      playerId: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
      sourceZone: ctx.sourceZone,
      zones: ctx.zones,
    };
    const refPool = resolveTarget({ ...moveRef, quantity: "all" }, resolverCtx);
    let refId: string | undefined = ctx.boundTargets?.[0];
    if (refId === undefined) {
      if (refPool.length >= 2) {
        ctx.draft.pendingChoice = {
          type: "choose-target",
          playerId: ctx.playerId,
          sourceCardId: ctx.sourceCardId,
          effect,
          options: refPool,
          remaining: 1,
        } as RiftboundGameState["pendingChoice"];
        return;
      }
      refId = refPool[0];
      if (refId === undefined) {
        return;
      }
    } else if (!refPool.includes(refId)) {
      // Rule 359.3.e.2: the chosen reference left play / changed control →
      // no Might referent, nothing moves.
      return;
    }
    const bfPool = Object.keys(ctx.draft.battlefields);
    let bfId: string | undefined = ctx.boundTargets?.[1];
    if (bfId === undefined) {
      if (bfPool.length >= 2) {
        ctx.draft.pendingChoice = {
          type: "choose-target",
          playerId: ctx.playerId,
          sourceCardId: ctx.sourceCardId,
          effect,
          options: bfPool,
          remaining: 1,
          boundTargets: [refId],
          assign: true,
        } as RiftboundGameState["pendingChoice"];
        return;
      }
      bfId = bfPool[0];
      if (bfId === undefined) {
        return;
      }
    }
    const bfZone = bfId.startsWith("battlefield-") ? bfId : `battlefield-${bfId}`;
    const refMight = getEffectiveMight(refId, ctx);
    const victims = resolveTarget(
      { ...(effect.target as TargetDescriptor), quantity: "all" },
      resolverCtx,
    ).filter(
      (id) =>
        ctx.zones.getCardZone(id as CoreCardId) === bfZone &&
        getEffectiveMight(id, ctx) < refMight,
    );
    for (const id of victims) {
      moveCardWithEvent(ctx, id, "base");
    }
    return;
  }

  const targets = getTargetIds(effect, ctx);
  // rule-id: ven-091-166 — "move any number of enemy units …": zero picks /
  // zero legal candidates moves nothing; only an implicit target means "me".
  const anyNumber =
    typeof effect.target === "object" &&
    effect.target !== null &&
    (effect.target as { quantity?: unknown }).quantity === "any";
  if (anyNumber && targets.length === 0) {
    return;
  }
  // rule-id: ogn-262-298 (rule 355.13) — "You may move a friendly unit …": an
  // optional move with no legal unit does nothing; it must never fall back to
  // moving the source card.
  if (targets.length === 0 && (effect as unknown as { optional?: boolean }).optional === true) {
    return;
  }
  const moveTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
  const rawDest = (
    effect as unknown as {
      to?: string | { battlefield?: string; requireSourceMightExceedsEnemyTotal?: boolean };
    }
  ).to;

  // rule-id: ven-034-166 — BattlefieldLocation destination ({ battlefield:
  // "controlled" | "enemy" | "open" | "contested" | "any" }): the controller
  // picks a matching battlefield other than the unit's current location.
  // Zero matches fizzles the move; a single match moves directly.
  if (rawDest && typeof rawDest === "object" && typeof rawDest.battlefield === "string") {
    const which = rawDest.battlefield;
    // rule-id: unl-144-219 (Maduli the Gatekeeper) — "Move me to an occupied
    // enemy battlefield if my Might is greater than the total Might of enemy
    // units there": destination must hold >=1 enemy unit and the mover's
    // Might must strictly exceed their summed Might.
    const mightGate = rawDest.requireSourceMightExceedsEnemyTotal === true;
    const enemyUnits = mightGate
      ? resolveTarget(
          { controller: "enemy", quantity: "all", type: "unit" } as TargetDescriptor,
          {
            cards: ctx.cards,
            draft: ctx.draft,
            playerId: ctx.playerId,
            sourceCardId: ctx.sourceCardId,
            sourceZone: ctx.sourceZone,
            zones: ctx.zones,
          },
        )
      : [];
    // rule-id: ven-148-166 (rule 355.4) — "to a battlefield WHERE YOU HAVE
    // UNITS" is a presence test, not a control test: an uncontrolled or
    // contested battlefield still qualifies as long as a friendly unit stands
    // there, and a battlefield you control but have vacated does not.
    const friendlyUnits =
      which === "friendly-units"
        ? resolveTarget(
            { controller: "friendly", quantity: "all", type: "unit" } as TargetDescriptor,
            {
              cards: ctx.cards,
              draft: ctx.draft,
              playerId: ctx.playerId,
              sourceCardId: ctx.sourceCardId,
              sourceZone: ctx.sourceZone,
              zones: ctx.zones,
            },
          )
        : [];
    // rule-id: ven-148-166 (rule 387) — "Move an enemy unit to a battlefield…
    // If you have exactly two units THERE…": the rider is anchored at the
    // destination, so it can only run once the destination is known.
    const thenAtDestination = (effect as unknown as { then?: ExecutableEffect }).then;
    const runThenAt = (movedId: string, zone: string): void => {
      if (!thenAtDestination) {
        return;
      }
      h.executeEffect(thenAtDestination, { ...ctx, boundTargets: [movedId], sameZone: zone });
    };
    for (const cardId of moveTargets) {
      const currentZone = ctx.zones.getCardZone(cardId as CoreCardId);
      const moverMight = mightGate ? getEffectiveMight(cardId, ctx) : 0;
      const options = Object.entries(ctx.draft.battlefields)
        .filter(([bfId]) => {
          if (!mightGate) {
            return true;
          }
          const zone = `battlefield-${bfId}`;
          const there = enemyUnits.filter(
            (id) => ctx.zones.getCardZone(id as CoreCardId) === zone,
          );
          if (there.length === 0) {
            return false;
          }
          const total = there.reduce((sum, id) => sum + getEffectiveMight(id, ctx), 0);
          return moverMight > total;
        })
        .filter(([bfId, bf]) => {
          switch (which) {
            case "controlled":
              return bf.controller === ctx.playerId;
            case "enemy":
              return bf.controller !== null && bf.controller !== ctx.playerId;
            case "open":
              return bf.controller === null;
            case "contested":
              return bf.contested === true;
            case "friendly-units":
              return friendlyUnits.some(
                (id) => ctx.zones.getCardZone(id as CoreCardId) === `battlefield-${bfId}`,
              );
            default:
              return true;
          }
        })
        .map(([bfId]) => `battlefield-${bfId}`)
        .filter((z) => z !== currentZone);
      if (options.length === 0) {
        continue;
      }
      if (options.length === 1 || ctx.draft.pendingChoice) {
        const landed = moveCardWithEvent(ctx, cardId, options[0] as string);
        // rule-id: unl-144-219 — Rule 450: arriving at a non-controlled
        // battlefield applies Contested so combat is staged.
        markContestedOnArrival(ctx.draft, landed, arrivingController(ctx, cardId));
        runThenAt(cardId, landed);
        continue;
      }
      ctx.draft.pendingChoice = {
        cardId,
        options,
        playerId: ctx.playerId,
        sourceCardId: ctx.sourceCardId,
        ...(thenAtDestination !== undefined ? { then: thenAtDestination } : {}),
        type: "choose-destination",
      } as RiftboundGameState["pendingChoice"];
    }
    return;
  }
  const dest = rawDest as string | undefined;

  // rule-id: ogn-262-298 (rule 355.4) — "…to THAT enemy unit's battlefield":
  // the destination is fixed by an earlier chosen target's battlefield (threaded
  // as `sameZone` by the sequence handler), so it is the ONLY option offered —
  // never a free base/battlefield choice.
  if (dest === "target-battlefield") {
    const cardId = moveTargets[0];
    const destZone = ctx.sameZone;
    if (
      cardId === undefined ||
      destZone === undefined ||
      ctx.zones.getCardZone(cardId as CoreCardId) === destZone
    ) {
      return;
    }
    ctx.draft.pendingChoice = {
      cardId,
      // rule 355.13 — "You may move": declining is an answer, so the single
      // legal destination is still offered as a prompt rather than forced.
      optional: (effect as unknown as { optional?: boolean }).optional === true ? true : undefined,
      options: [destZone],
      playerId: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
      type: "choose-destination",
    } as RiftboundGameState["pendingChoice"];
    return;
  }

  // rule-id: unl-184-219 (rule 355.2.b) — "plays it to ANY battlefield": the
  // effect makes every battlefield a legal destination (controlled or not,
  // empty or not) and the base is not one of them.
  if (dest === "any-battlefield") {
    const cardId = moveTargets[0];
    if (cardId === undefined) {
      return;
    }
    const currentZone = ctx.zones.getCardZone(cardId as CoreCardId);
    const options = Object.keys(ctx.draft.battlefields)
      .map((bfId) => `battlefield-${bfId}`)
      .filter((z) => z !== currentZone);
    if (options.length === 0) {
      return;
    }
    ctx.draft.pendingChoice = {
      cardId,
      options,
      playerId: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
      then: (effect as unknown as { then?: ExecutableEffect }).then,
      type: "choose-destination",
    } as RiftboundGameState["pendingChoice"];
    return;
  }

  if (dest === "choose") {
    // Rule 355.4 — no stated destination: the controller chooses base or
    // any battlefield other than the unit's current zone. Options must be
    // ZONE ids (base / battlefield-<bfId>) so resolvePendingChoice can pass
    // them straight to zones.moveCard (rule 350.1).
    const cardId = moveTargets[0];
    const currentZone = ctx.zones.getCardZone(cardId as CoreCardId);
    // rule-id: sfd-200-221 (rule 355.2 / 341) — a card entering play from
    // off-board (a pending "play it" from banishment) may only be placed at
    // base or a battlefield its player CONTROLS; an on-board move keeps the
    // unrestricted battlefield list.
    const enteringPlay =
      currentZone !== "base" && !(currentZone ?? "").startsWith("battlefield-");
    // rule 355.2.b (sfd-170-221) — an effect may grant permission to play a
    // unit to a location that is not normally valid ("play it here"); those
    // zones join the list even when the player does not control them.
    const granted = (effect as unknown as { extraDestinations?: readonly string[] })
      .extraDestinations;
    const options = [
      "base",
      ...Object.entries(ctx.draft.battlefields)
        .filter(
          ([bfId, bf]) =>
            !enteringPlay ||
            bf.controller === ctx.playerId ||
            granted?.includes(`battlefield-${bfId}`) === true,
        )
        .map(([bfId]) => `battlefield-${bfId}`),
    ].filter((z) => z !== currentZone);
    if (options.length === 0) {
      return;
    }
    // rule-id: ogn-258-298 (rule 387) — "Move an enemy unit. Then do this:
    // …at its destination": the follow-up can only resolve once the
    // destination is picked, so it rides on the prompt.
    const thenAtDestination = (effect as unknown as { then?: ExecutableEffect }).then;
    ctx.draft.pendingChoice = {
      cardId,
      options,
      playerId: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
      then: thenAtDestination,
      type: "choose-destination",
    } as RiftboundGameState["pendingChoice"];
    return;
  }

  // rule-id: sfd-129-221 (rule 449.1) — "Move an enemy unit to a location where
  // there's a unit with the same controller": the legal destinations are the
  // places that unit's OWN controller already occupies (their base, or a
  // battlefield holding one of their units), never its current location and
  // never a place only the caster holds. With none, nothing moves (425.1.c).
  if (dest === "same-controller-unit") {
    // rule 820.2.a — a deferred second execution names its own unit here (the
    // chain item's bound list still holds both units).
    const deferred = (effect as unknown as { deferredMoverId?: string }).deferredMoverId;
    const cardId = deferred ?? moveTargets[0];
    if (cardId === undefined) {
      return;
    }
    // rule 820.2.a (sfd-129-221) — a [Repeat] runs the instruction twice in one
    // resolution: the second execution must wait for the first destination to
    // be answered instead of overwriting its prompt, so it rides on that
    // prompt's `then` with its own unit already bound.
    const openPrompt = ctx.draft.pendingChoice as { type?: string; then?: unknown } | undefined;
    if (openPrompt?.type === "choose-destination" && openPrompt.then === undefined) {
      (ctx.draft.pendingChoice as { then?: unknown }).then = {
        ...(effect as object),
        deferredMoverId: cardId,
      };
      return;
    }
    const mover = arrivingController(ctx, cardId);
    const currentZone = ctx.zones.getCardZone(cardId as CoreCardId);
    const occupiedBy = (zoneId: string): boolean =>
      ctx.zones
        .getCardsInZone(zoneId as CoreZoneId)
        .some((id) => id !== cardId && arrivingController(ctx, id as string) === mover);
    const baseHasAlly = (
      ctx.zones.getCardsInZone("base" as CoreZoneId, mover as never) as string[]
    ).some((id) => id !== cardId && arrivingController(ctx, id) === mover);
    const options = [
      ...(baseHasAlly ? ["base"] : []),
      ...Object.keys(ctx.draft.battlefields ?? {})
        .map((bfId) => `battlefield-${bfId}`)
        .filter((z) => occupiedBy(z)),
    ].filter((z) => z !== currentZone);
    if (options.length === 0) {
      return;
    }
    const thenAtDest = (effect as unknown as { then?: ExecutableEffect }).then;
    ctx.draft.pendingChoice = {
      cardId,
      options,
      playerId: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
      ...(thenAtDest !== undefined ? { then: thenAtDest } : {}),
      type: "choose-destination",
    } as RiftboundGameState["pendingChoice"];
    return;
  }

  // rule-id: sfd-079-221 (rule 170.11.c) — "move any number of your units to an
  // OPEN battlefield": open = uncontrolled AND unoccupied, so an empty
  // battlefield either side controls is not a legal destination. With no open
  // battlefield the instruction resolves doing nothing (rule 425.1.c); the
  // whole group travels to the single destination the controller picks.
  if (dest === "open-battlefield") {
    const open = Object.entries(ctx.draft.battlefields ?? {})
      .filter(
        ([bfId, bf]) =>
          bf.controller === null &&
          ctx.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId).length === 0,
      )
      .map(([bfId]) => `battlefield-${bfId}`);
    if (open.length === 0) {
      return;
    }
    if (open.length > 1 && !ctx.draft.pendingChoice) {
      const [first, ...rest] = moveTargets;
      if (first === undefined) {
        return;
      }
      ctx.draft.pendingChoice = {
        alsoMoveCardIds: rest,
        cardId: first,
        options: open,
        playerId: ctx.playerId,
        sourceCardId: ctx.sourceCardId,
        type: "choose-destination",
      } as RiftboundGameState["pendingChoice"];
      return;
    }
    const landing = open[0] as string;
    for (const cardId of moveTargets) {
      if (ctx.zones.getCardZone(cardId as CoreCardId) === landing) {
        continue;
      }
      const landed = moveCardWithEvent(ctx, cardId, landing);
      markContestedOnArrival(ctx.draft, landed, arrivingController(ctx, cardId));
    }
    stageCombatOnArrival(ctx, landing);
    return;
  }

  let targetZone: string;
  // rule-id: ogn-177-298 — "I may be moved WITH IT": follow the triggering
  // move to its destination. No such event → nothing to follow.
  if (dest === "same") {
    if (!ctx.triggerToZone) {
      return;
    }
    targetZone = ctx.triggerToZone;
  } else if (dest === "there") {
    // rule 359.3.f.3 (sfd-126-221 Loyal Pup) — "there" is the battlefield named
    // by the trigger condition ("when you defend AT A BATTLEFIELD"), never the
    // source's own location. No such battlefield on the firing event → no move.
    if (!ctx.triggerBattlefieldZone) {
      return;
    }
    targetZone = ctx.triggerBattlefieldZone;
  } else if (dest === "here" && ctx.sourceZone) {
    // rule 359.3.f.2 / 359.3.e.6 (ruling cc1dfe2325b10a8d, sfd-177-221 Azir) —
    // "here"/"this battlefield" is a referent read from the source card when the
    // instruction executes, not a target. If the source has left the board by
    // then (killed in response, banished, …) there is no such location and the
    // move instruction is ignored rather than dragging units into the trash.
    if (ctx.sourceZone !== "base" && !ctx.sourceZone.startsWith("battlefield-")) {
      return;
    }
    targetZone = ctx.sourceZone;
  } else if (dest && dest !== "here") {
    targetZone = dest;
  } else {
    targetZone = "base";
  }
  const origins: string[] = [];
  for (const targetId of moveTargets) {
    const from = ctx.zones.getCardZone(targetId as CoreCardId);
    if (from) {
      origins.push(from);
    }
    const landed = moveCardWithEvent(ctx, targetId, targetZone);
    // rule 450: a unit arriving at a battlefield its own controller does not
    // control applies Contested — including when an effect drags an ENEMY unit
    // onto the source's battlefield (unl-141-219 Evelynn, `to: "here"`).
    markContestedOnArrival(ctx.draft, landed, arrivingController(ctx, targetId));
  }
  stageCombatOnArrival(ctx, targetZone);

  // rule-id: unl-124-219 (Isolate) — "Then, if there's an enemy unit alone at
  // that battlefield, …": "that battlefield" is the moved unit's origin, which
  // is only known here, so the follow-up rides on the move effect. An enemy
  // unit is alone when it is the only unit its controller has at that zone.
  const thenIfEnemyAlone = (
    effect as unknown as { thenIfEnemyAloneAtOrigin?: ExecutableEffect }
  ).thenIfEnemyAloneAtOrigin;
  if (thenIfEnemyAlone) {
    const enemyUnits = resolveTarget(
      { controller: "enemy", quantity: "all", type: "unit" } as TargetDescriptor,
      {
        cards: ctx.cards,
        draft: ctx.draft,
        playerId: ctx.playerId,
        sourceCardId: ctx.sourceCardId,
        sourceZone: ctx.sourceZone,
        zones: ctx.zones,
      },
    );
    const met = origins.some((zone) => {
      if (!zone.startsWith("battlefield-")) {
        return false;
      }
      const byController = new Map<string, number>();
      for (const id of enemyUnits) {
        if (ctx.zones.getCardZone(id as CoreCardId) !== zone) {
          continue;
        }
        const ctrl =
          ctx.cards.getCardController?.(id as CoreCardId) ??
          ctx.cards.getCardOwner(id as CoreCardId) ??
          "";
        byController.set(ctrl, (byController.get(ctrl) ?? 0) + 1);
      }
      return [...byController.values()].some((n) => n === 1);
    });
    if (met) {
      const { boundTargets: _drop, ...rest } = ctx;
      h.executeEffect(thenIfEnemyAlone, rest);
    }
  }
}
