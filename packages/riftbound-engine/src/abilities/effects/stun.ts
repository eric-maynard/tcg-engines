// Effect handler: "stun"
import type { CardId as CoreCardId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_stun(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  const stunned = targets.length === 0 ? [ctx.sourceCardId] : targets;
  for (const targetId of stunned) {
    ctx.counters.setFlag(targetId as CoreCardId, "stunned", true);
    // rule-id: unl-055-219 — emit the stun event so "When you [Stun] an enemy
    // unit at a battlefield" triggers (Vex, Mocking) can match.
    const zone = ctx.zones.getCardZone(targetId as CoreCardId);
    ctx.fireTriggers?.({
      cardId: targetId,
      owner: ctx.cards.getCardOwner(targetId as CoreCardId),
      stunnedBy: ctx.playerId,
      type: "stun",
      ...(zone?.startsWith("battlefield-")
        ? { battlefieldId: zone.replace(/^battlefield-/, "") }
        : {}),
    });
  }
}
