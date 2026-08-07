// Effect handler: "mill" — the [Burn N] keyword action.
import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { refillDeckOrBurnOut } from "../../operations/points";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { executeEffect } from "../effect-executor";
import { type EffectHelpers, resolveAmount } from "./_helpers";

/**
 * rule 440.1 — "[Burn N]" puts the top N cards of a player's Main Deck into
 * their trash. The cards are never looked at or revealed on the way (424.1),
 * so "as you look at or reveal me" replacements never see them.
 */
export function handle_mill(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const who = (effect as { player?: string }).player ?? "self";
  if (who === "each") {
    for (const pid of Object.keys(ctx.draft.players)) {
      handle_mill({ ...effect, player: "self" }, { ...ctx, playerId: pid }, _h);
    }
    return;
  }
  if (who === "opponent") {
    for (const pid of Object.keys(ctx.draft.players)) {
      if (pid !== ctx.playerId) {
        handle_mill({ ...effect, player: "self" }, { ...ctx, playerId: pid }, _h);
      }
    }
    return;
  }
  const raw = (effect as { amount?: unknown }).amount ?? 1;
  const count = typeof raw === "number" ? raw : resolveAmount(raw, ctx);
  const burned: string[] = [];
  for (let i = 0; i < count; i++) {
    // rule 440.4 / 431.2 — burning with an empty Main Deck makes that player
    // Burn Out (trash shuffled back in, an opponent gains 1 point); the burn
    // then continues against the refilled deck.
    if (
      ctx.zones.getCardsInZone("mainDeck" as CoreZoneId, ctx.playerId as CorePlayerId).length === 0 &&
      !refillDeckOrBurnOut(ctx.draft, ctx.playerId, ctx)
    ) {
      break;
    }
    const deck = ctx.zones.getCardsInZone("mainDeck" as CoreZoneId, ctx.playerId as CorePlayerId);
    const top = deck[0];
    if (top === undefined) {
      break;
    }
    ctx.zones.moveCard({ cardId: top as CoreCardId, targetZoneId: "trash" as CoreZoneId });
    burned.push(top as string);
  }
  if (burned.length > 0) {
    ctx.fireTriggers?.({ cardIds: burned, playerId: ctx.playerId, type: "burn" } as never);
  }
  // rule 440.1.a — "When you burn a unit this way, do this: …". The follow-up is
  // reflexive (part of THIS burn, not a new trigger), fires once per burned UNIT,
  // and exposes that card's PRINTED Might as the `burnedMight` variable — the card
  // is in the trash, so no modifiers apply.
  const then = (effect as { then?: ExecutableEffect }).then;
  if (then !== undefined) {
    const registry = getGlobalCardRegistry();
    for (const cardId of burned) {
      if (registry.getCardType(cardId) !== "unit") {
        continue;
      }
      executeEffect(then, {
        ...ctx,
        boundTargets: undefined,
        variables: { ...ctx.variables, burnedMight: registry.getMight(cardId) },
      });
    }
  }
}
