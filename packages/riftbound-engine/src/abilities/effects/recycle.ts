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

type KeepCategory = "unit" | "gear" | "rune" | "hand";

/**
 * rule 424.4.a / rule-id: ogn-244-298 — "Each player chooses N units, N gear,
 * N runes and N cards in their hands. Recycle the rest." Collect one player's
 * cards for one category.
 */
function collectCategory(playerId: string, category: KeepCategory, ctx: EffectContext): string[] {
  if (category === "hand") {
    return ctx.zones.getCardsInZone("hand" as CoreZoneId, playerId as CorePlayerId).map((id) => id as string);
  }
  if (category === "rune") {
    return ctx.zones.getCardsInZone("runePool" as CoreZoneId, playerId as CorePlayerId).map((id) => id as string);
  }
  const registry = getGlobalCardRegistry();
  const battlefields = Object.keys(
    (ctx.draft as { battlefields?: Record<string, unknown> }).battlefields ?? {},
  );
  const zoneIds = ["base", ...battlefields.map((bf) => `battlefield-${bf}`)];
  const out: string[] = [];
  for (const zoneId of zoneIds) {
    for (const raw of ctx.zones.getCardsInZone(zoneId as CoreZoneId, playerId as CorePlayerId)) {
      const id = raw as string;
      if ((ctx.cards.getCardOwner(id as CoreCardId) ?? playerId) !== playerId) {
        continue;
      }
      if (registry.get(id)?.cardType === category) {
        out.push(id);
      }
    }
  }
  return out;
}

/**
 * rule-id: ogn-244-298 — walk (player × category) in order; the FIRST pair
 * holding more than `keep` parks a pick prompt whose `then` re-runs this same
 * effect, so the remaining categories/players are prompted one at a time
 * (a single `pendingChoice` slot exists). Pairs at or under the limit keep
 * everything, so re-entry always makes progress.
 */
function handleKeepRecycle(effect: ExecutableEffect, ctx: EffectContext): void {
  const keep = (effect as { keep?: number }).keep ?? 0;
  const categories = ((effect as { categories?: readonly KeepCategory[] }).categories ?? [
    "unit",
    "gear",
    "rune",
    "hand",
  ]) as readonly KeepCategory[];
  const players = Object.keys((ctx.draft as { players?: Record<string, unknown> }).players ?? {});
  for (const category of categories) {
    for (const playerId of players) {
      const pool = collectCategory(playerId, category, ctx);
      if (pool.length <= keep) {
        continue;
      }
      ctx.draft.pendingChoice = {
        onPicked: "recycle",
        prompter: playerId,
        remaining: pool.length - keep,
        revealed: pool,
        revealer: playerId,
        sourceCardId: ctx.sourceCardId,
        then: effect,
        type: "reveal-and-pick",
      };
      return;
    }
  }
}

export function handle_recycle(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  if ((effect as { keep?: unknown }).keep !== undefined) {
    handleKeepRecycle(effect, ctx);
    return;
  }
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
    // rule-id: ogn-212-298 — "from trashes" pools every player's trash; each
    // picked card still returns to the bottom of ITS OWNER's Main Deck.
    const owners =
      (effect as { owner?: string }).owner === "any"
        ? Object.keys((ctx.draft as { players?: Record<string, unknown> }).players ?? {})
        : [ctx.playerId];
    const pool = owners.flatMap((p) =>
      ctx.zones.getCardsInZone(zoneId, p as CorePlayerId).map((id) => id as string),
    );
    const want = resolveAmount((effect as { amount?: unknown }).amount ?? 1, ctx);
    const n = Math.min(want, pool.length);
    // rule 416 — "recycle up to N" lets the chooser take fewer (or none), so
    // the prompt is offered even when the zone holds no more than N.
    const upTo = (effect as { upTo?: boolean }).upTo === true;
    if (n <= 0) {
      return;
    }
    if (n < pool.length || upTo) {
      ctx.draft.pendingChoice = {
        onPicked: "recycle",
        prompter: ctx.playerId,
        revealed: pool,
        revealer: ctx.playerId,
        sourceCardId: ctx.sourceCardId,
        type: "reveal-and-pick",
        ...(upTo ? { optional: true } : {}),
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
