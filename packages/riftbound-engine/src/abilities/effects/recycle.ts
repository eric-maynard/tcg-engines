// Effect handler: "recycle"
import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds, resolveAmount } from "./_helpers";

/**
 * rule 416.1.a / rule-id: ogn-110-298 — recycle a specific card to the bottom
 * of its owner's Main Deck, clearing board-only state like the kill/bounce paths.
 */
function recycleToDeckBottom(cardId: string, ctx: EffectContext): void {
  ctx.zones.moveCard({
    cardId: cardId as CoreCardId,
    position: "bottom",
    targetZoneId: "mainDeck" as CoreZoneId,
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

export function handle_recycle(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // rule-id: unl-204-219-owner-chooses-top-or-bottom — "Its owner places it
  // on the top or bottom of their Main Deck." prompts the target's OWNER via
  // choose-destination with mainDeck-top / mainDeck-bottom options.
  if ((effect as { position?: string }).position === "owner-choice") {
    const [targetId] = getTargetIds(effect, ctx);
    if (!targetId) {
      return;
    }
    const owner = ctx.cards.getCardOwner(targetId as CoreCardId) ?? ctx.playerId;
    ctx.draft.pendingChoice = {
      cardId: targetId,
      options: ["mainDeck-top", "mainDeck-bottom"],
      playerId: owner,
      type: "choose-destination",
    };
    return;
  }
  // rule 416.1.a / rule-id: ogn-109-298 — counted recycle out of a zone
  // ("recycle 3 from your trash"): the controller chooses which cards, so park
  // a multi-pick prompt; when the zone holds no more than N there is no choice
  // and every card is recycled.
  const from = (effect as { from?: string }).from;
  if ((effect as { amount?: unknown }).amount !== undefined && (from === "trash" || from === "hand")) {
    const zoneId = from as CoreZoneId;
    const pool = ctx.zones
      .getCardsInZone(zoneId, ctx.playerId as CorePlayerId)
      .map((id) => id as string);
    const want = resolveAmount((effect as { amount?: unknown }).amount ?? 1, ctx);
    const n = Math.min(want, pool.length);
    if (n <= 0) {
      return;
    }
    if (n < pool.length) {
      ctx.draft.pendingChoice = {
        onPicked: "recycle",
        prompter: ctx.playerId,
        revealed: pool,
        revealer: ctx.playerId,
        sourceCardId: ctx.sourceCardId,
        type: "reveal-and-pick",
        ...(n > 1 ? { remaining: n } : {}),
      };
      return;
    }
    for (const id of pool) {
      recycleToDeckBottom(id, ctx);
    }
    ctx.fireTriggers?.({ cardIds: pool, playerId: ctx.playerId, type: "recycle" });
    return;
  }
  // rule 416.1.a / 383.3.b (ogn-110-298 "[Deathknell] — Recycle me …"): a
  // specific-card recycle ("me" or a chosen unit/gear) goes to the bottom of
  // its owner's Main Deck. Counted forms ("recycle 3 cards from your trash")
  // and rune recycles (→ rune deck) are not handled here.
  const rawTarget = effect.target as unknown;
  const isSelf =
    rawTarget === "self" ||
    (typeof rawTarget === "object" && rawTarget !== null && (rawTarget as { type?: string }).type === "self");
  const targetType = typeof rawTarget === "object" && rawTarget !== null ? (rawTarget as { type?: string }).type : undefined;
  if (!isSelf && targetType !== "unit" && targetType !== "gear") {
    return;
  }
  if ((effect as { amount?: unknown }).amount !== undefined) {
    return;
  }
  // rule-id: ogn-244-298 — "each player chooses N …, recycle the rest" (a
  // per-player keep-N choice) is not implemented; never treat it as "recycle all".
  if ((effect as { keep?: unknown }).keep !== undefined) {
    return;
  }
  const ids = isSelf ? [ctx.sourceCardId] : getTargetIds(effect, ctx);
  const registry = getGlobalCardRegistry();
  const recycled: string[] = [];
  for (const id of ids) {
    const zone = ctx.zones.getCardZone(id as CoreCardId) as string | undefined;
    // 383.3.b: "Recycle me" from a Deathknell resolves from the trash; a card
    // that has already left (banished, replayed) can't be recycled.
    if (zone === undefined || zone === "mainDeck" || zone === "banishment") {
      continue;
    }
    if (registry.get(id)?.cardType === "rune") {
      continue;
    }
    recycleToDeckBottom(id, ctx);
    recycled.push(id);
  }
  // rule-id: ogn-235-298 — "When you recycle one or more cards to your Main Deck".
  const own = recycled.filter((id) => (ctx.cards.getCardOwner(id as CoreCardId) ?? ctx.playerId) === ctx.playerId);
  if (own.length > 0) {
    ctx.fireTriggers?.({ cardIds: own, playerId: ctx.playerId, type: "recycle" });
  }
}
