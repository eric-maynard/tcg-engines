// Effect handler: "reveal"
import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { addToChain, createInteractionState } from "../../chain";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { findAllReplacements, type ReplacementContext } from "../replacement-effects";
import { type EffectHelpers } from "./_helpers";
import { handle_look } from "./look";

/**
 * rule 369.1 / 370.1 (sfd-018-221 Void Hatchling) — "If you would reveal cards
 * from a deck, look at the top card first. You may recycle it. Then reveal
 * those cards." The replacement belongs to the player whose deck is being
 * revealed (not to whoever caused the reveal), so an opponent's Hatchling sees
 * my Blind Fury too. Each such replacement gets its OWN look/recycle step
 * before the reveal; the reveal is deferred onto the look prompt's `then` and
 * re-enters this handler once every look has been answered.
 */
function offerRevealLook(
  effect: ExecutableEffect,
  ctx: EffectContext,
  revealers: readonly string[],
  h: EffectHelpers,
): boolean {
  const done = ((effect as { lookedBefore?: readonly string[] }).lookedBefore ??
    []) as readonly string[];
  for (const revealer of revealers) {
    const matches = findAllReplacements(
      { owner: revealer, playerId: revealer, type: "reveal" },
      ctx as unknown as ReplacementContext,
    );
    for (const match of matches) {
      if (match.sourceOwner !== revealer || done.includes(match.sourceCardId)) continue;
      const steps = (match.replacement as { effects?: { type?: string }[] } | undefined)?.effects;
      const lookStep = steps?.find((s) => s?.type === "look");
      if (!lookStep) continue;
      handle_look(lookStep as ExecutableEffect, { ...ctx, playerId: revealer }, h);
      const parked = ctx.draft.pendingChoice as { then?: unknown } | undefined;
      // An empty deck gives nothing to look at — that Hatchling simply does nothing.
      if (!parked) continue;
      ctx.draft.pendingChoice = {
        ...(parked as object),
        then: {
          ...(effect as object),
          asPlayer: ctx.playerId,
          lookedBefore: [...done, match.sourceCardId],
        },
        // rule 359.3.e — "You MAY recycle it. THEN reveal those cards": declining
        // the recycle still performs the reveal it interrupted.
        thenIsSequenceRest: true,
        // biome-ignore lint/suspicious/noExplicitAny: branded id types
      } as any;
      return true;
    }
  }
  return false;
}

export function handle_reveal(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // Rule 354.2 (ogn-160-298 Dazzling Aurora): "reveal cards from the top
  // of your Main Deck until you reveal a <cardType>" — scan the deck
  // top-down for the first hit, banish it, play it ignoring cost (added
  // to the chain per rule 354.3), and recycle every other revealed card
  // to the bottom. Without `until` the reveal is purely informational.
  const revEff = effect as unknown as {
    amount?: number;
    asPlayer?: string;
    from?: string;
    ignoreCost?: boolean;
    then?: { draw?: unknown; recycle?: unknown };
    until?: string;
  };
  // A reveal deferred by a Void Hatchling look (below) keeps its ORIGINAL
  // player: the look prompt belongs to the revealer, the reveal does not.
  const actor = revEff.asPlayer ?? ctx.playerId;
  const readsADeck =
    revEff.from === "opponent-decks" || (revEff.until !== undefined && (revEff.from ?? "deck") === "deck");
  if (readsADeck) {
    const revealers =
      revEff.from === "opponent-decks"
        ? Object.keys(ctx.draft.players).filter((p) => p !== actor)
        : [actor];
    if (offerRevealLook(effect, { ...ctx, playerId: actor }, revealers, _h)) return;
  }
  // rule 354.2 / 356.1.b.1 (ogn-025-298 Blind Fury): "Each opponent reveals the
  // top card of their Main Deck. Choose one and banish it, then play it,
  // ignoring its cost. Then recycle the rest." The choice is made among the
  // revealed cards on resolution, so this names no play-time board target.
  if (revEff.from === "opponent-decks") {
    const revealed: string[] = [];
    for (const pid of Object.keys(ctx.draft.players)) {
      if (pid === actor) continue;
      const top = ctx.zones.getCardsInZone("mainDeck" as CoreZoneId, pid as CorePlayerId)[0];
      if (top !== undefined) revealed.push(top as string);
    }
    if (revealed.length === 0) return;
    ctx.draft.pendingChoice = {
      onPicked: "play",
      onRest: "recycle",
      ...(revEff.ignoreCost ? { playIgnoreCost: true } : {}),
      prompter: actor,
      revealed,
      revealer: actor,
      sourceCardId: ctx.sourceCardId,
      type: "reveal-and-pick",
      // biome-ignore lint/suspicious/noExplicitAny: branded id types
    } as any;
    return;
  }
  // Rule 354.2 (unl-079-219 Diana, Lunari): "reveal the top card of your
  // Main Deck. If it's a <cardType>, draw it." — a bounded reveal with a
  // `then: { draw }` follow-up is a conditional draw of the top `amount`
  // cards, not a reveal-until scan. Matching cards go to hand; non-matching
  // cards stay on top of the deck — unless the reveal also says what to do
  // with the misses ("Otherwise, recycle it", sfd-041-221 Apprentice Smith):
  // rule 403, a recycled card goes to the BOTTOM of its owner's deck.
  if (
    revEff.until &&
    (revEff.from ?? "deck") === "deck" &&
    revEff.then &&
    typeof revEff.then === "object" &&
    "draw" in revEff.then
  ) {
    const registry = getGlobalCardRegistry();
    const recyclesMisses = revEff.then.recycle !== undefined;
    const top = ctx.zones
      .getCardsInZone("mainDeck" as CoreZoneId, actor as CorePlayerId)
      .slice(0, Math.max(1, revEff.amount ?? 1));
    for (const cardId of top) {
      if (registry.get(cardId as string)?.cardType === revEff.until) {
        ctx.zones.moveCard({
          cardId: cardId as CoreCardId,
          targetZoneId: "hand" as CoreZoneId,
        });
      } else if (recyclesMisses) {
        ctx.zones.moveCard({
          cardId: cardId as CoreCardId,
          position: "bottom",
          targetZoneId: "mainDeck" as CoreZoneId,
        });
      }
    }
    return;
  }
  if (revEff.until && (revEff.from ?? "deck") === "deck") {
    const revealRegistry = getGlobalCardRegistry();
    const revealDeck = ctx.zones.getCardsInZone(
      "mainDeck" as CoreZoneId,
      actor as CorePlayerId,
    );
    const rest: string[] = [];
    let hit: string | undefined;
    for (const cardId of revealDeck) {
      const id = cardId as string;
      if (revealRegistry.get(id)?.cardType === revEff.until) {
        hit = id;
        break;
      }
      rest.push(id);
    }
    if (hit) {
      ctx.zones.moveCard({
        cardId: hit as CoreCardId,
        targetZoneId: "banishment" as CoreZoneId,
      });
      const owner = ctx.cards.getCardOwner(hit as CoreCardId) ?? actor;
      ctx.draft.interaction = addToChain(
        ctx.draft.interaction ?? createInteractionState(),
        {
          cardId: hit,
          controller: owner,
          effect: { target: hit, to: "choose", type: "move" },
          triggered: true,
          type: "ability",
        },
        Object.keys(ctx.draft.players),
      );
    }
    for (const cardId of rest) {
      ctx.zones.moveCard({
        cardId: cardId as CoreCardId,
        position: "bottom",
        targetZoneId: "mainDeck" as CoreZoneId,
      });
    }
  }
}
