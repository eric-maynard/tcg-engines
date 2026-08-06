// Effect handler: "discard"
import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, resolveAmount } from "./_helpers";

export function handle_discard(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const count = resolveAmount(effect.amount ?? 1, ctx);
  const hand = ctx.zones
    .getCardsInZone("hand" as CoreZoneId, ctx.playerId as CorePlayerId)
    .map((id) => id as string);
  if (hand.length === 0) return;
  // The discarding player chooses which card. Use pendingChoice so play
  // pauses until they pick (goldfish auto-resolves via pickDefaultForChoice).
  // count>1 falls back to auto-discard for now — extend PendingChoice with
  // a `remaining` counter to support multi-pick properly.
  if (count === 1) {
    ctx.draft.pendingChoice = {
      onPicked: "discard",
      prompter: ctx.playerId,
      revealed: hand,
      revealer: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
      then: (effect as { then?: unknown }).then,
      type: "reveal-and-pick",
    };
  } else {
    for (let i = 0; i < Math.min(count, hand.length); i++) {
      ctx.zones.moveCard({ cardId: hand[i] as CoreCardId, targetZoneId: "trash" as CoreZoneId });
      // Rule ogn-006-298: emit the discard event for auto-discarded cards.
      ctx.fireTriggers?.({ cardId: hand[i], playerId: ctx.playerId, type: "discard" });
    }
  }
}
