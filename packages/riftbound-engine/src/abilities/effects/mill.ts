// Effect handler: "mill" — the [Burn N] keyword action.
import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { addToChain, createInteractionState } from "../../chain/chain-state";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { refillDeckOrBurnOut } from "../../operations/points";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, resolveAmount } from "./_helpers";

/**
 * rule 387 / 388.1 — a "do this:" clause is a REFLEXIVE TRIGGER: it does not run
 * inline inside the burn, it adds a NEW Pending item to the Chain. Its target is
 * therefore chosen when that item is finalized (402.2) and every player gets a
 * window before it resolves (so the recipient can be removed in between —
 * 359.3.e.2, the item then does nothing rather than retargeting). The burned
 * card's Might is fixed now and rides on the item as `_variables`.
 */
function queueReflexiveItem(
  then: ExecutableEffect,
  burnedMight: number,
  ctx: EffectContext,
): void {
  const draft = ctx.draft as unknown as {
    interaction?: unknown;
    players?: Record<string, unknown>;
  };
  if (!draft.interaction) {
    draft.interaction = createInteractionState();
  }
  // The recipient is now the item's declared target, picked at finalization —
  // drop the resolution-time `chooseTarget` prompt so it is not asked twice.
  const { chooseTarget: _chooseTarget, ...body } = then as unknown as Record<string, unknown>;
  draft.interaction = addToChain(
    draft.interaction as never,
    {
      cardId: ctx.sourceCardId,
      controller: ctx.playerId,
      effect: { ...body, _variables: { ...(ctx.variables ?? {}), burnedMight } },
      status: "pending",
      triggered: true,
      type: "ability",
    } as never,
    Object.keys(draft.players ?? {}),
  ) as never;
}

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
  // rule 440.1.a — "When you burn a unit this way, do this: …" fires once per
  // burned UNIT and exposes that card's PRINTED Might as the `burnedMight`
  // variable (the card is in the trash, so no modifiers apply).
  const then = (effect as { then?: ExecutableEffect }).then;
  if (then !== undefined) {
    const registry = getGlobalCardRegistry();
    for (const cardId of burned) {
      if (registry.getCardType(cardId) !== "unit") {
        continue;
      }
      queueReflexiveItem(then, registry.getMight(cardId) ?? 0, ctx);
    }
  }
}
