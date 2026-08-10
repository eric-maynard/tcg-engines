// Effect handler: "reveal"
import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { beginPlay, type PlayIO } from "../../game-definition/moves/play/play-pipeline";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { findAllReplacements, type ReplacementContext } from "../replacement-effects";
import { type EffectHelpers, recordPublicReveal } from "./_helpers";
import { fireMandatoryRevealAbilities, handle_look, offerAsYouRevealChoice } from "./look";

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

// rule 424.1 — `recordPublicReveal` now lives in `_helpers` so every reveal
// path (including amounts like Teemo's `revealTop`) can reach it; re-exported
// here because callers still import it from the reveal handler.
export { recordPublicReveal };

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
    // rule 354.3 (ogn-194-298 Nocturne) — on re-entry after an owner answered
    // their "as you … reveal me" prompt, the reveal still ranges over exactly
    // the cards it turned over; one that banished itself simply drops out and
    // no fresh card pulled up behind it joins the reveal.
    const carriedIds = (revEff as { revealedIds?: readonly string[] }).revealedIds;
    const carriedOwners = (revEff as { revealedFromDeckOf?: Record<string, string> })
      .revealedFromDeckOf;
    const revealed: string[] = [];
    const revealedFromDeckOf: Record<string, string> = { ...carriedOwners };
    if (carriedIds !== undefined) {
      for (const id of carriedIds) {
        if (ctx.zones.getCardZone(id as CoreCardId) === "mainDeck") revealed.push(id);
      }
    } else {
      for (const pid of Object.keys(ctx.draft.players)) {
        if (pid === actor) continue;
        const top = ctx.zones.getCardsInZone("mainDeck" as CoreZoneId, pid as CorePlayerId)[0];
        if (top !== undefined) {
          revealed.push(top as string);
          revealedFromDeckOf[top as string] = pid;
        }
      }
      if (revealed.length === 0) return;
      recordPublicReveal(ctx, actor, revealed);
      // rule 370.1.b.1 / 166.1 (sfd-175-221 Undertitan) — "As I'm revealed from
      // YOUR deck" belongs to the player whose deck was turned over, not to the
      // opponent who caused the reveal; the rider resolves on the spot into that
      // player's pool (429.2), with no chain item and no priority.
      for (const revealedId of revealed) {
        fireMandatoryRevealAbilities([revealedId], revealedFromDeckOf[revealedId] ?? actor, ctx, _h);
      }
    }
    if (revealed.length === 0) return;
    // rule 409 / 369.1 / 370.1 (ogn-025-298 Blind Fury × ogn-194-298 Nocturne) —
    // a reveal shows the card to EVERY player, so its own optional "as you look
    // at or reveal me from the top of your deck" replacement is offered to its
    // OWNER (the player whose deck was turned over), whether or not the
    // revealer ends up choosing it.
    const offeredSoFar =
      (revEff as { revealOffered?: readonly string[] }).revealOffered ?? [];
    for (const revealedId of revealed) {
      if (offeredSoFar.includes(revealedId)) continue;
      const owner = revealedFromDeckOf[revealedId] ?? actor;
      const parked = offerAsYouRevealChoice(
        ctx,
        [revealedId],
        owner,
        (nowOffered) => ({
          ...(effect as object),
          asPlayer: actor,
          revealedFromDeckOf,
          revealedIds: revealed,
          revealOffered: nowOffered,
        }),
        offeredSoFar,
        ctx.sourceCardId,
      );
      if (parked) return;
    }
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
    // rule 403 / 405 (ven-033-166 Pakaa Protector) — "Otherwise, put it in your
    // trash and give me +2 [Might] this turn": a miss can be TRASHED instead of
    // recycled, and the clause may carry a rider that only fires on a miss.
    const missHandling = revEff.then as {
      otherwise?: unknown;
      trash?: unknown;
    };
    const trashesMisses = missHandling.trash !== undefined;
    let missed = false;
    const deckNow = ctx.zones
      .getCardsInZone("mainDeck" as CoreZoneId, actor as CorePlayerId)
      .map((c) => c as string);
    // rule 354.3 / 370.1 (ogn-194-298 Nocturne) — a revealed card that removed itself with
    // its own "as you … reveal me" replacement is no longer part of this reveal; the rest of
    // the instruction still ranges over the cards revealed, never over fresh cards pulled up
    // behind them.
    const carried = (revEff as { revealedIds?: readonly string[] }).revealedIds;
    const top = carried
      ? carried.filter((id) => deckNow.includes(id))
      : deckNow.slice(0, Math.max(1, revEff.amount ?? 1));
    const alreadyOffered = (revEff as { revealOffered?: readonly string[] }).revealOffered;
    if (alreadyOffered === undefined) {
      // rule 424.1 — present the cards to every player BEFORE anything moves
      // them: once a match is drawn or a miss is recycled the identity is gone.
      recordPublicReveal(ctx, actor, top);
      // rule 424 / 429.2 — the revealed cards' own mandatory on-reveal abilities
      // resolve immediately, before the reveal's draw/recycle follow-up.
      fireMandatoryRevealAbilities(top, actor, ctx, _h);
    }
    // rule 369.1 / 370.1 (sfd-041-221 Apprentice Smith × ogn-194-298 Nocturne) — an OPTIONAL
    // "as you look at or reveal me from the top of your deck" replacement is offered on a
    // reveal exactly as it is on a look, before this reveal's own draw/recycle follow-up.
    if (
      offerAsYouRevealChoice(
        ctx,
        top,
        actor,
        (nowOffered) => ({
          ...(effect as object),
          asPlayer: actor,
          revealedIds: top,
          revealOffered: nowOffered,
        }),
        alreadyOffered ?? [],
      )
    ) {
      return;
    }
    for (const cardId of top) {
      if (registry.get(cardId as string)?.cardType === revEff.until) {
        ctx.zones.moveCard({
          cardId: cardId as CoreCardId,
          targetZoneId: "hand" as CoreZoneId,
        });
      } else if (trashesMisses) {
        missed = true;
        ctx.zones.moveCard({
          cardId: cardId as CoreCardId,
          targetZoneId: "trash" as CoreZoneId,
        });
      } else if (recyclesMisses) {
        missed = true;
        ctx.zones.moveCard({
          cardId: cardId as CoreCardId,
          position: "bottom",
          targetZoneId: "mainDeck" as CoreZoneId,
        });
      }
    }
    if (missed && missHandling.otherwise) {
      _h.executeEffect(missHandling.otherwise as ExecutableEffect, ctx);
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
    // rule 424.1 — every card turned over by the scan was revealed, hit or not.
    recordPublicReveal(ctx, actor, hit ? [...rest, hit] : rest);
    if (hit) {
      ctx.zones.moveCard({
        cardId: hit as CoreCardId,
        targetZoneId: "banishment" as CoreZoneId,
      });
      const owner = (ctx.cards.getCardOwner(hit as CoreCardId) as string | undefined) ?? actor;
      // rule 419.3 / 355.2 — "banish it. Play it, ignoring its cost" is a real
      // play, so it runs through the ONE play pipeline: the card's own play
      // permissions ("You may play me to an occupied enemy battlefield",
      // ogn-161-298) are offered as destinations and its play triggers fire.
      beginPlay(ctx as unknown as PlayIO, {
        cardId: hit,
        costMode: { kind: "ignore-all" },
        location: "prompt",
        playerId: owner,
        sourceCardId: ctx.sourceCardId,
        via: "effect",
      });
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
