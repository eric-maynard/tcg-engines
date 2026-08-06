// Effect handler: "move"
import type { CardId as CoreCardId, ZoneId as CoreZoneId } from "@tcg/core";
import type { RiftboundGameState } from "../../types";
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds, getEffectiveMight } from "./_helpers";

export function handle_move(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
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
      ctx.zones.moveCard({ cardId: id as CoreCardId, targetZoneId: "base" as CoreZoneId });
    }
    return;
  }

  const targets = getTargetIds(effect, ctx);
  const moveTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
  const rawDest = (effect as unknown as { to?: string | { battlefield?: string } }).to;

  // rule-id: ven-034-166 — BattlefieldLocation destination ({ battlefield:
  // "controlled" | "enemy" | "open" | "contested" | "any" }): the controller
  // picks a matching battlefield other than the unit's current location.
  // Zero matches fizzles the move; a single match moves directly.
  if (rawDest && typeof rawDest === "object" && typeof rawDest.battlefield === "string") {
    const which = rawDest.battlefield;
    for (const cardId of moveTargets) {
      const currentZone = ctx.zones.getCardZone(cardId as CoreCardId);
      const options = Object.entries(ctx.draft.battlefields)
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
        ctx.zones.moveCard({
          cardId: cardId as CoreCardId,
          targetZoneId: options[0] as CoreZoneId,
        });
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
    const options = [
      "base",
      ...Object.keys(ctx.draft.battlefields).map((bfId) => `battlefield-${bfId}`),
    ].filter((z) => z !== currentZone);
    if (options.length === 0) {
      return;
    }
    ctx.draft.pendingChoice = {
      cardId,
      options,
      playerId: ctx.playerId,
      type: "choose-destination",
    };
    return;
  }

  let targetZone: string;
  if (dest === "here" && ctx.sourceZone) {
    targetZone = ctx.sourceZone;
  } else if (dest && dest !== "here") {
    targetZone = dest;
  } else {
    targetZone = "base";
  }
  for (const targetId of moveTargets) {
    ctx.zones.moveCard({
      cardId: targetId as CoreCardId,
      targetZoneId: targetZone as CoreZoneId,
    });
  }
}
