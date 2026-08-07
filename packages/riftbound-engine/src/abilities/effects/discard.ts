// Effect handler: "discard"
import type { PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { removeFromBoard } from "../../operations/leave-board";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, resolveAmount } from "./_helpers";

/**
 * rule 422 — discard `cardIds` from `ctx.playerId`'s hand as ONE instruction:
 * the choke point moves them and emits one `discard` event per card tagged
 * with its batch position (ogn-202-298 "one or more" fires once).
 */
export function discardCards(cardIds: readonly string[], ctx: EffectContext): void {
  if (cardIds.length === 0) {
    return;
  }
  removeFromBoard(
    ctx,
    cardIds,
    "trash",
    { by: ctx.playerId, kind: "discard", source: ctx.sourceCardId },
    ctx.fireTriggers,
  );
}

export function handle_discard(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  // Rule unl-121-219: "They discard 1" — player:"opponent" must resolve
  // against the opponent's hand (and the opponent picks), not the controller.
  if (effect.player === "opponent") {
    const oppId = Object.keys(ctx.draft.players).find((p) => p !== ctx.playerId);
    if (!oppId) return;
    ctx = { ...ctx, playerId: oppId };
  }
  // Rule ogn-201-298: "Each player discards their hand, then draws N" — fan
  // out per player, discard the whole hand (no choice needed), then run the
  // `then` effect for that same player even if their hand was empty.
  const wholeHand = (effect.amount as unknown) === "hand";
  if (effect.player === "each" || wholeHand) {
    const playerIds = effect.player === "each" ? Object.keys(ctx.draft.players) : [ctx.playerId];
    const rawThen = (effect as { then?: ExecutableEffect }).then;
    // `then` already runs once per player here, so `player: "each"` on it
    // means "that same player" — strip it so draw doesn't fan out again.
    const then = rawThen?.player === "each" ? { ...rawThen, player: "self" } : rawThen;
    for (const pid of playerIds) {
      const pctx: EffectContext = { ...ctx, playerId: pid };
      const phand = ctx.zones
        .getCardsInZone("hand" as CoreZoneId, pid as CorePlayerId)
        .map((id) => id as string);
      const n = wholeHand ? phand.length : resolveAmount(effect.amount ?? 1, pctx);
      discardCards(phand.slice(0, Math.min(n, phand.length)), pctx);
      if (then) h.executeEffect(then, pctx);
    }
    return;
  }
  const count = resolveAmount(effect.amount ?? 1, ctx);
  const hand = ctx.zones
    .getCardsInZone("hand" as CoreZoneId, ctx.playerId as CorePlayerId)
    .map((id) => id as string);
  if (hand.length === 0) {
    // rule 422.4 / 359.3.e.11 (ogn-185-298): an impossible discard is simply
    // ignored — the rest of the effect ("…, then draw 1") still happens.
    const emptyThen = (effect as { then?: ExecutableEffect }).then;
    if (emptyThen) h.executeEffect(emptyThen, ctx);
    return;
  }
  // rule 422.1.a: the discarding player chooses which card(s). Use
  // pendingChoice so play pauses until they pick (goldfish auto-resolves via
  // pickDefaultForChoice); "discard N" re-prompts via `remaining` (ogn-030-298).
  const n = Math.min(count, hand.length);
  if (count === 1 || n < hand.length) {
    ctx.draft.pendingChoice = {
      onPicked: "discard",
      prompter: ctx.playerId,
      revealed: hand,
      revealer: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
      then: (effect as { then?: unknown }).then,
      // rule 355.8 (ogn-008-298): carry the caster's play-time pick so the
      // `then` clause damages the chosen unit, not the first one on the board.
      ...(ctx.boundTargets ? { thenBoundTargets: ctx.boundTargets } : {}),
      type: "reveal-and-pick",
      ...(n > 1 ? { remaining: n } : {}),
    };
  } else {
    // No choice to make (discarding at least the whole hand): rule 422.2 —
    // discard as many as possible.
    // Rule ogn-006-298: emit the discard event for auto-discarded cards.
    // Rule ogn-202-298: batch positions so "one or more" fires once.
    discardCards(hand.slice(0, n), ctx);
    const then = (effect as { then?: ExecutableEffect }).then;
    if (then) h.executeEffect(then, ctx);
  }
}
