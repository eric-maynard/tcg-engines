// Effect handler: "discard"
import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, resolveAmount } from "./_helpers";

export function handle_discard(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  // Rule ogn-201-298: "Each player discards their hand, then draws N" — fan
  // out per player, discard the whole hand (no choice needed), then run the
  // `then` effect for that same player even if their hand was empty.
  const wholeHand = (effect.amount as unknown) === "hand";
  if (effect.player === "each" || wholeHand) {
    const playerIds = effect.player === "each" ? Object.keys(ctx.draft.players) : [ctx.playerId];
    const then = (effect as { then?: ExecutableEffect }).then;
    for (const pid of playerIds) {
      const pctx: EffectContext = { ...ctx, playerId: pid };
      const phand = ctx.zones
        .getCardsInZone("hand" as CoreZoneId, pid as CorePlayerId)
        .map((id) => id as string);
      const n = wholeHand ? phand.length : resolveAmount(effect.amount ?? 1, pctx);
      for (let i = 0; i < Math.min(n, phand.length); i++) {
        ctx.zones.moveCard({ cardId: phand[i] as CoreCardId, targetZoneId: "trash" as CoreZoneId });
        ctx.fireTriggers?.({ cardId: phand[i], playerId: pid, type: "discard" });
      }
      if (then) h.executeEffect(then, pctx);
    }
    return;
  }
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
