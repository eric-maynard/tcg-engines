// Effect handler: "reveal"
import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { addToChain, createInteractionState } from "../../chain";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers } from "./_helpers";

export function handle_reveal(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // Rule 354.2 (ogn-160-298 Dazzling Aurora): "reveal cards from the top
  // of your Main Deck until you reveal a <cardType>" — scan the deck
  // top-down for the first hit, banish it, play it ignoring cost (added
  // to the chain per rule 354.3), and recycle every other revealed card
  // to the bottom. Without `until` the reveal is purely informational.
  const revEff = effect as unknown as {
    amount?: number;
    from?: string;
    ignoreCost?: boolean;
    then?: { draw?: unknown };
    until?: string;
  };
  // rule 354.2 / 356.1.b.1 (ogn-025-298 Blind Fury): "Each opponent reveals the
  // top card of their Main Deck. Choose one and banish it, then play it,
  // ignoring its cost. Then recycle the rest." The choice is made among the
  // revealed cards on resolution, so this names no play-time board target.
  if (revEff.from === "opponent-decks") {
    const revealed: string[] = [];
    for (const pid of Object.keys(ctx.draft.players)) {
      if (pid === ctx.playerId) continue;
      const top = ctx.zones.getCardsInZone("mainDeck" as CoreZoneId, pid as CorePlayerId)[0];
      if (top !== undefined) revealed.push(top as string);
    }
    if (revealed.length === 0) return;
    ctx.draft.pendingChoice = {
      onPicked: "play",
      onRest: "recycle",
      ...(revEff.ignoreCost ? { playIgnoreCost: true } : {}),
      prompter: ctx.playerId,
      revealed,
      revealer: ctx.playerId,
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
  // cards stay on top of the deck.
  if (
    revEff.until &&
    (revEff.from ?? "deck") === "deck" &&
    revEff.then &&
    typeof revEff.then === "object" &&
    "draw" in revEff.then
  ) {
    const registry = getGlobalCardRegistry();
    const top = ctx.zones
      .getCardsInZone("mainDeck" as CoreZoneId, ctx.playerId as CorePlayerId)
      .slice(0, Math.max(1, revEff.amount ?? 1));
    for (const cardId of top) {
      if (registry.get(cardId as string)?.cardType === revEff.until) {
        ctx.zones.moveCard({
          cardId: cardId as CoreCardId,
          targetZoneId: "hand" as CoreZoneId,
        });
      }
    }
    return;
  }
  if (revEff.until && (revEff.from ?? "deck") === "deck") {
    const revealRegistry = getGlobalCardRegistry();
    const revealDeck = ctx.zones.getCardsInZone(
      "mainDeck" as CoreZoneId,
      ctx.playerId as CorePlayerId,
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
      const owner = ctx.cards.getCardOwner(hit as CoreCardId) ?? ctx.playerId;
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
