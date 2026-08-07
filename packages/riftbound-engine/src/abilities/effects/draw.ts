// Effect handler: "draw"
import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { refillDeckOrBurnOut } from "../../operations/points";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, resolveAmount } from "./_helpers";

export function handle_draw(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // rule-id: ogn-071-298 — "you and that player each draw 1" / "each player
  // draws N": `player: "each"` fans the draw out to every player's own deck.
  if (effect.player === "each") {
    for (const pid of Object.keys(ctx.draft.players)) {
      handle_draw({ ...effect, player: "self" }, { ...ctx, playerId: pid }, _h);
    }
    return;
  }
  // rule 359.3.e.14.a (ogn-213-298 Hidden Blade) — "Its controller draws 2":
  // the drawer is the controller of the unit this effect acted on, not the
  // caster. With nothing bound (the linked instruction did nothing) no one draws.
  // rule-id: unl-135-219 — "they … draw 1": `player: "opponent"` (what the
  // parser emits for "they draw N") draws from the OPPONENT's deck into their
  // hand, not the controller's. Without this case it fell through to the
  // controller below.
  if (effect.player === "opponent") {
    const oppId = Object.keys(ctx.draft.players).find((p) => p !== ctx.playerId);
    if (oppId === undefined) {
      return;
    }
    handle_draw({ ...effect, player: "self" }, { ...ctx, playerId: oppId }, _h);
    return;
  }
  if (effect.player === "target-controller") {
    const targetId = ctx.boundTargets?.[0];
    if (targetId === undefined) {
      return;
    }
    const pid =
      ctx.cards.getCardController?.(targetId as CoreCardId) ??
      ctx.cards.getCardOwner(targetId as CoreCardId);
    if (pid === undefined) {
      return;
    }
    handle_draw({ ...effect, player: "self" }, { ...ctx, playerId: pid }, _h);
    return;
  }
  const rawDrawCount = effect.amount ?? 1;
  const drawCount =
    typeof rawDrawCount === "number" ? rawDrawCount : resolveAmount(rawDrawCount, ctx);
  for (let i = 0; i < drawCount; i++) {
    // rule 431: an empty Main Deck burns out (trash shuffled in, an opponent
    // gains 1 point through awardPoints; repeats per 431.3 while the deck stays
    // empty). No card can be drawn if the deck is still empty or the game ended.
    if (!refillDeckOrBurnOut(ctx.draft, ctx.playerId, ctx)) {
      break;
    }
    // Draw 1 card
    ctx.zones.drawCards({
      count: 1,
      from: "mainDeck" as CoreZoneId,
      playerId: ctx.playerId as CorePlayerId,
      to: "hand" as CoreZoneId,
    });
    // rule 745 — a draw is one card moved from the top of your Main Deck to
    // your hand, so "Draw N" is N separate draw events ("when you draw your
    // second card each turn" must see each one).
    ctx.fireTriggers?.({ playerId: ctx.playerId, type: "draw" });
  }
}
