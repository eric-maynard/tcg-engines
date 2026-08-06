// Effect handler: "return-to-hand"
import type { CardId as CoreCardId, ZoneId as CoreZoneId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

/**
 * rule-id: ogn-172-298 — a unit bounced to hand leaves the board, so its
 * board-only state (exhausted, damage, buffs, stun, …) must not persist.
 * moveCard only changes zone; clear the meta explicitly like the kill path.
 */
function bounceToHand(cardId: string, ctx: EffectContext): void {
  ctx.zones.moveCard({
    cardId: cardId as CoreCardId,
    targetZoneId: "hand" as CoreZoneId,
  });
  ctx.counters.setFlag(cardId as CoreCardId, "exhausted", false);
  ctx.counters.setFlag(cardId as CoreCardId, "stunned", false);
  ctx.counters.setFlag(cardId as CoreCardId, "buffed", false);
  ctx.cards.updateCardMeta?.(cardId as CoreCardId, {
    buffed: false,
    combatRole: null,
    damage: 0,
    exhausted: false,
    grantedKeywords: undefined,
    mightModifier: 0,
    stunned: false,
  } as Partial<RiftboundCardMeta> as Record<string, unknown>);
}

export function handle_returnToHand(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  // Only fall back to the source card when the ability has NO target
  // descriptor (i.e. "return me to hand"). A targeted return that finds
  // no legal targets fizzles — otherwise Windsinger's on-play "return an
  // enemy unit" bounces itself when the board is empty.
  const hasTargetSpec = "target" in effect && effect.target != null;
  if (targets.length === 0 && !hasTargetSpec) {
    bounceToHand(ctx.sourceCardId, ctx);
  } else {
    for (const targetId of targets) {
      bounceToHand(targetId, ctx);
    }
  }
}
