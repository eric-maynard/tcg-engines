// Effect handler: "move"
import type { CardId as CoreCardId, ZoneId as CoreZoneId } from "@tcg/core";
import type { RiftboundGameState } from "../../types";
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds, getEffectiveMight } from "./_helpers";

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
 * rule-id: unl-133-219 — an effect-driven move is still a move: move a board
 * card and emit the `move` event (with the unit's controller as `owner` and
 * the effect's controller as `movedBy`) so "When I move" / "When you move an
 * enemy unit" triggers fire. Non-board origins (hand, trash, …) are not moves.
 */
export function moveCardWithEvent(ctx: EffectContext, cardId: string, targetZoneId: string): void {
  const from = ctx.zones.getCardZone(cardId as CoreCardId) ?? "";
  ctx.zones.moveCard({ cardId: cardId as CoreCardId, targetZoneId: targetZoneId as CoreZoneId });
  const onBoard = (z: string) => z === "base" || z.startsWith("battlefield-");
  if (from === targetZoneId || !onBoard(from) || !onBoard(targetZoneId)) {
    return;
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
  moveCardWithEvent(ctx, selfId, partnerZone);
  markContestedOnArrival(ctx.draft, partnerZone, ctx.playerId);
  moveCardWithEvent(ctx, partner, selfZone);
  markContestedOnArrival(ctx.draft, selfZone, ctx.playerId);
}

export function handle_move(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
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
        .filter(([, bf]) => {
          switch (which) {
            case "controlled":
              return bf.controller === ctx.playerId;
            case "enemy":
              return bf.controller !== null && bf.controller !== ctx.playerId;
            case "open":
              return bf.controller === null;
            case "contested":
              return bf.contested === true;
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
        moveCardWithEvent(ctx, cardId, options[0] as string);
        // rule-id: unl-144-219 — Rule 450: arriving at a non-controlled
        // battlefield applies Contested so combat is staged.
        markContestedOnArrival(ctx.draft, options[0] as string, ctx.playerId);
        continue;
      }
      ctx.draft.pendingChoice = {
        cardId,
        options,
        playerId: ctx.playerId,
        type: "choose-destination",
      };
    }
    return;
  }
  const dest = rawDest as string | undefined;

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
    const options = [
      "base",
      ...Object.entries(ctx.draft.battlefields)
        .filter(([, bf]) => !enteringPlay || bf.controller === ctx.playerId)
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

  let targetZone: string;
  // rule-id: ogn-177-298 — "I may be moved WITH IT": follow the triggering
  // move to its destination. No such event → nothing to follow.
  if (dest === "same") {
    if (!ctx.triggerToZone) {
      return;
    }
    targetZone = ctx.triggerToZone;
  } else if (dest === "here" && ctx.sourceZone) {
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
    moveCardWithEvent(ctx, targetId, targetZone);
  }

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
      _h.executeEffect(thenIfEnemyAlone, rest);
    }
  }
}
