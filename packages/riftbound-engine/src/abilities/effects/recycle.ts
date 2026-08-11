// Effect handler: "recycle"
import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { leaveBoard } from "../../operations/leave-board";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds, resolveAmount } from "./_helpers";

/**
 * rule 416.1.a / rule-id: ogn-110-298 — recycle a specific card to the bottom
 * of its owner's Main Deck through the leave-board choke point: a NEW object
 * with no board state (rule 124.1), Equipment detached (457.1), and a token
 * ceases to exist instead of entering the deck (rule 186.1 / 185.2.e).
 */
export function recycleToDeckBottom(cardId: string, ctx: EffectContext): void {
  leaveBoard(ctx, cardId, "deck-bottom", { by: ctx.playerId, kind: "recycle", source: ctx.sourceCardId });
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

/** rule 303.2.a — every seat, starting from the turn player. */
function turnOrderSeats(ctx: EffectContext): string[] {
  const seats = Object.keys((ctx.draft as { players?: Record<string, unknown> }).players ?? {});
  const turn = (ctx.draft as { turn?: { activePlayer?: string } }).turn;
  const at = seats.indexOf(turn?.activePlayer ?? "");
  return at < 0 ? seats : [...seats.slice(at), ...seats.slice(0, at)];
}

/**
 * rule-id: ogn-244-298 — walk (player × category) in order; the FIRST pair
 * holding more than `keep` parks a pick prompt whose `then` re-runs this same
 * effect, so the remaining categories/players are prompted one at a time
 * (a single `pendingChoice` slot exists). Pairs at or under the limit keep
 * everything, so re-entry always makes progress.
 *
 * rule 303.2.a — "Each player chooses …" is ONE instruction per player made in
 * turn order from the turn player, so the seat loop is the OUTER one: a seat
 * answers every category it must answer before the next seat is asked anything.
 */
function handleKeepRecycle(effect: ExecutableEffect, ctx: EffectContext): void {
  const keep = (effect as { keep?: number }).keep ?? 0;
  const categories = ((effect as { categories?: readonly KeepCategory[] }).categories ?? [
    "unit",
    "gear",
    "rune",
    "hand",
  ]) as readonly KeepCategory[];
  const players = turnOrderSeats(ctx);
  for (const playerId of players) {
    for (const category of categories) {
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
  // (A counted recycle out of a zone — "put a card from your hand …" — carries
  // `from`/`amount` and is handled further down, where the card is picked first.)
  const fromZonePool =
    (effect as { amount?: unknown }).amount !== undefined &&
    ((effect as { from?: string }).from === "hand" || (effect as { from?: string }).from === "trash");
  if ((effect as { position?: string }).position === "owner-choice" && !fromZonePool) {
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
  // rule 416.1.b / 416.1.c / 416.5.a — "Recycle N of your runes": the runes go
  // under their OWNER's Rune Deck (no power for anyone — 429.4.a), and when
  // more than one is recycled at once the owner chooses the order they are put
  // there, so park a pick prompt even when every rune must go.
  // rule 416.6 (ogn-287-298) — the same counted-rune form spelled as a target
  // descriptor ("recycle one of your runes", `target:{type:"rune"}` + `amount`):
  // it names no rune up front, so the pool is read HERE, at resolution.
  const runeTargetType =
    typeof effect.target === "object" && effect.target !== null
      ? (effect.target as { type?: unknown }).type
      : undefined;
  const ownRunePoolRecycle =
    runeTargetType === "rune" &&
    (effect.target as { controller?: unknown }).controller === "friendly" &&
    (ctx.boundTargets?.length ?? 0) === 0;
  const countedRuneRecycle =
    ((effect as { what?: string }).what === "rune" || ownRunePoolRecycle) &&
    (effect as { amount?: unknown }).amount !== undefined;
  if (countedRuneRecycle) {
    const owner = ctx.playerId;
    const pool = ctx.zones
      .getCardsInZone("runePool" as CoreZoneId, owner as CorePlayerId)
      .map((id) => id as string);
    const n = Math.min(resolveAmount((effect as { amount?: unknown }).amount ?? 1, ctx), pool.length);
    if (n <= 0) {
      return;
    }
    if (n === 1 && pool.length === 1) {
      const [only] = pool;
      ctx.zones.moveCard({
        cardId: only as CoreCardId,
        position: "bottom",
        targetZoneId: "runeDeck" as CoreZoneId,
      });
      ctx.counters.setFlag(only as CoreCardId, "exhausted", false);
      return;
    }
    ctx.draft.pendingChoice = {
      onPicked: "recycle",
      prompter: owner,
      remaining: n,
      revealed: pool,
      revealer: owner,
      sourceCardId: ctx.sourceCardId,
      type: "reveal-and-pick",
    };
    return;
  }
  if ((effect as { amount?: unknown }).amount !== undefined && (from === "trash" || from === "hand")) {
    const zoneId = from as CoreZoneId;
    // rule-id: ogn-212-298 — "from trashes" pools every player's trash; each
    // picked card still returns to the bottom of ITS OWNER's Main Deck.
    // rule-id: unl-103-219 — the scope may also be spelled on the effect's
    // `target` ("cards from opponents' trashes" → controller "enemy"), so read
    // `owner` first and fall back to `target.controller`.
    const targetSpec = (effect.target ?? undefined) as
      | { controller?: string; quantity?: { upTo?: unknown } }
      | undefined;
    const scope = (effect as { owner?: string }).owner ?? targetSpec?.controller;
    const allPlayers = Object.keys((ctx.draft as { players?: Record<string, unknown> }).players ?? {});
    const owners =
      scope === "any" || scope === "all"
        ? allPlayers
        : scope === "enemy" || scope === "opponent"
          ? allPlayers.filter((p) => p !== ctx.playerId)
          : [ctx.playerId];
    const pool = owners.flatMap((p) =>
      ctx.zones.getCardsInZone(zoneId, p as CorePlayerId).map((id) => id as string),
    );
    const want = resolveAmount((effect as { amount?: unknown }).amount ?? 1, ctx);
    const n = Math.min(want, pool.length);
    // rule 416 — "recycle up to N" lets the chooser take fewer (or none), so
    // the prompt is offered even when the zone holds no more than N.
    const upTo =
      (effect as { upTo?: boolean }).upTo === true || targetSpec?.quantity?.upTo !== undefined;
    if (n <= 0) {
      return;
    }
    // rule 355.5 / 355.10.a (unl-103-219) — "Choose up to 3 cards from
    // opponents' trashes": a trash is public, so cards its own `target` names
    // there were CHOSEN already (at play, or through the target prompt) and
    // arrive bound — recycle exactly those (none, if none were named).
    if (
      ctx.boundTargets &&
      (targetSpec as { location?: string } | undefined)?.location === from
    ) {
      const chosen = ctx.boundTargets.filter((id) => pool.includes(id)).slice(0, want);
      for (const id of chosen) {
        recycleToDeckBottom(id, ctx);
      }
      if (chosen.length > 0) {
        ctx.fireTriggers?.({ cardIds: chosen, playerId: ctx.playerId, type: "recycle" });
      }
      return;
    }
    // rule 416.1.a / rule-id: sfd-169-221 — "put a card from your hand on the
    // top or bottom of your Main Deck": the owner picks the end as well.
    const ownerChoice = (effect as { position?: string }).position === "owner-choice";
    if (n < pool.length || upTo) {
      ctx.draft.pendingChoice = {
        onPicked: "recycle",
        prompter: ctx.playerId,
        revealed: pool,
        revealer: ctx.playerId,
        sourceCardId: ctx.sourceCardId,
        type: "reveal-and-pick",
        ...(ownerChoice ? { position: "owner-choice" as const } : {}),
        // rule 355.13 (rule-id: ogn-212-298) — "Recycle UP TO 4 cards": the
        // count is a ceiling answered in one go, so the prompt must not re-park
        // for the picks the chooser declined to take (which would strand the
        // batch's single `recycle` event behind a decline).
        ...(upTo ? { optional: true, upTo: true } : {}),
        ...(n > 1 ? { remaining: n } : {}),
      };
      return;
    }
    // Only one legal card: no pick to make, but the top/bottom end is still a
    // real choice, so go straight to the destination prompt.
    if (ownerChoice && pool.length === 1 && n === 1) {
      const only = pool[0] as string;
      ctx.draft.pendingChoice = {
        cardId: only,
        options: ["mainDeck-top", "mainDeck-bottom"],
        playerId: ctx.cards.getCardOwner(only as CoreCardId) ?? ctx.playerId,
        type: "choose-destination",
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
  // rule 416.1.b / rule 416.1.c: a rune recycled by an EFFECT goes under its
  // OWNER's Rune Deck (not the Main Deck) and adds power to nobody — only the
  // rune's own "Recycle this: Add [C]" ability produces power (164.2.b).
  if (targetType === "rune") {
    for (const id of getTargetIds(effect, ctx)) {
      const zone = ctx.zones.getCardZone(id as CoreCardId) as string | undefined;
      if (zone === undefined || zone === "runeDeck" || zone === "banishment") {
        continue;
      }
      ctx.zones.moveCard({
        cardId: id as CoreCardId,
        position: "bottom",
        targetZoneId: "runeDeck" as CoreZoneId,
      });
      ctx.counters.setFlag(id as CoreCardId, "exhausted", false);
    }
    return;
  }
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
