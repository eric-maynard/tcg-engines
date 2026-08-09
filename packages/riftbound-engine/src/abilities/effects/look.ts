// Effect handler: "look"
import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { findAllReplacements } from "../replacement-effects";
import { type EffectHelpers, resolveAmount } from "./_helpers";

/**
 * rule 369.1 / 424 (sfd-018-221 Void Hatchling) — "If you would reveal cards
 * from a deck, look at the top card first. You may recycle it. Then reveal
 * those cards."
 *
 * A REVEAL from a deck is a replaceable event (a private look is not), so the
 * replacement's leading steps run before the reveal happens, against the deck
 * as it stands. Its trailing "then reveal those cards" step IS the original
 * reveal, so it is dropped here and the original effect continues instead.
 */
function revealReplacementPrefix(
  ctx: EffectContext,
  looker: string,
): ExecutableEffect | undefined {
  const replacementCtx = {
    cards: {
      getCardMeta: ctx.cards.getCardMeta ?? (() => undefined),
      getCardOwner: ctx.cards.getCardOwner,
    },
    draft: ctx.draft,
    zones: { getCardsInZone: ctx.zones.getCardsInZone },
  };
  const matches = findAllReplacements(
    { owner: looker, playerId: looker, type: "reveal" },
    replacementCtx as Parameters<typeof findAllReplacements>[1],
  );
  for (const match of matches) {
    // "If YOU would reveal" — only the replacement's own controller is meant.
    if (match.sourceOwner !== looker) {
      continue;
    }
    const replacement = match.replacement as
      | { type?: string; effects?: readonly unknown[] }
      | undefined;
    if (!replacement || replacement.type !== "sequence" || !Array.isArray(replacement.effects)) {
      continue;
    }
    const prefix = replacement.effects.filter(
      (step) => (step as { type?: string }).type !== "reveal",
    );
    if (prefix.length === 0) {
      continue;
    }
    return (
      prefix.length === 1 ? prefix[0] : { effects: prefix, type: "sequence" }
    ) as ExecutableEffect;
  }
  return undefined;
}

/**
 * rule 369.1 / 370.1 (ogn-194-298 Nocturne) — the optional replacement a card
 * carries for being looked at or revealed from the top of its owner's deck.
 * Only a self-scoped "as you look at or reveal ME" ability qualifies.
 */
function asYouLookAbility(cardId: string): unknown {
  const abilities = getGlobalCardRegistry().getAbilities(cardId) ?? [];
  for (const a of abilities as readonly {
    type?: string;
    optional?: boolean;
    trigger?: { event?: string; on?: unknown };
    effect?: unknown;
  }[]) {
    if (
      a.type === "triggered" &&
      a.optional === true &&
      a.trigger?.event === "reveal" &&
      (a.trigger.on ?? "self") === "self" &&
      a.effect !== undefined
    ) {
      return a.effect;
    }
  }
  return undefined;
}

/**
 * rule 424 / 429.2 (sfd-175-221 Undertitan) — a MANDATORY "as I'm revealed from
 * your deck" ability resolves immediately, from inside the deck, with no chain
 * window and no prompt. Only self-scoped, non-optional reveal triggers qualify.
 */
export function mandatoryRevealEffects(cardId: string): unknown[] {
  const abilities = getGlobalCardRegistry().getAbilities(cardId) ?? [];
  const out: unknown[] = [];
  for (const a of abilities as readonly {
    type?: string;
    optional?: boolean;
    trigger?: { event?: string; on?: unknown };
    effect?: unknown;
  }[]) {
    if (
      a.type === "triggered" &&
      a.optional !== true &&
      a.trigger?.event === "reveal" &&
      (a.trigger.on ?? "self") === "self" &&
      a.effect !== undefined
    ) {
      out.push(a.effect);
    }
  }
  return out;
}

/** Runs every mandatory on-reveal ability of the cards just revealed from `owner`'s deck. */
export function fireMandatoryRevealAbilities(
  revealedIds: readonly string[],
  owner: string,
  ctx: EffectContext,
  h: EffectHelpers,
): void {
  for (const revealedId of revealedIds) {
    for (const effect of mandatoryRevealEffects(revealedId)) {
      h.executeEffect(effect as ExecutableEffect, {
        ...ctx,
        boundTargets: [revealedId as CoreCardId],
        playerId: owner as CorePlayerId,
        sourceCardId: revealedId as CoreCardId,
      });
    }
  }
}

export function handle_look(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // rule-id: sfd-122-221-repeat-look — a look that fires while an earlier
  // reveal-and-pick is still unresolved (Repeat wraps the spell effect in a
  // sequence) must not overwrite it; defer via the choice's `then` so it
  // re-reads the deck after the first pick has drawn/recycled.
  const existing = ctx.draft.pendingChoice as
    | { type?: string; then?: unknown }
    | undefined;
  if (existing && existing.type === "reveal-and-pick") {
    const prevThen = existing.then;
    ctx.draft.pendingChoice = {
      ...(existing as NonNullable<typeof ctx.draft.pendingChoice>),
      then: prevThen ? { effects: [prevThen, effect], type: "sequence" } : effect,
    } as NonNullable<typeof ctx.draft.pendingChoice>;
    return;
  }
  const n = resolveAmount((effect as { amount?: unknown }).amount ?? 1, ctx);
  const from = ((effect as { from?: string }).from ?? "deck") === "deck"
    ? "mainDeck"
    : (effect as { from?: string }).from!;
  // rule-id: ogn-115-298 — "each player looks at the top 5 cards of THEIR Main
  // Deck": a per-player look step names whose deck is looked at and who picks.
  const looker =
    (effect as { player?: string }).player === "opponent"
      ? (Object.keys(ctx.draft.players).find((p) => p !== ctx.playerId) ?? ctx.playerId)
      : ctx.playerId;
  // rule 424 (sfd-188-221 Void Rush + sfd-018-221 Void Hatchling) — a look
  // flagged as a public REVEAL from a deck can be replaced before it happens;
  // the replacement's prefix resolves first and the reveal then sees the deck
  // it left behind.
  if (
    from === "mainDeck" &&
    (effect as { reveal?: boolean }).reveal === true &&
    (effect as { revealReplaced?: boolean }).revealReplaced !== true
  ) {
    const prefix = revealReplacementPrefix(ctx, looker);
    if (prefix) {
      const continuation = {
        ...(effect as object),
        revealReplaced: true,
      } as ExecutableEffect;
      _h.executeEffect(prefix, { ...ctx, playerId: looker as CorePlayerId });
      const raised = ctx.draft.pendingChoice as
        | { then?: unknown; onDecline?: unknown }
        | undefined;
      if (raised) {
        // rule 359.3.e / 424 — the replacement's own prompt is optional ("you MAY
        // recycle it"), but the reveal it replaced happens either way: hang the
        // continuation off BOTH the accept (`then`) and the decline (`onDecline`)
        // branches so declining cannot cancel the reveal.
        ctx.draft.pendingChoice = {
          ...(raised as NonNullable<typeof ctx.draft.pendingChoice>),
          onDecline: raised.onDecline
            ? { effects: [raised.onDecline, continuation], type: "sequence" }
            : continuation,
          then: raised.then
            ? { effects: [raised.then, continuation], type: "sequence" }
            : continuation,
        } as NonNullable<typeof ctx.draft.pendingChoice>;
        return;
      }
      _h.executeEffect(continuation, ctx);
      return;
    }
  }
  const deck = ctx.zones
    .getCardsInZone(from as CoreZoneId, looker as CorePlayerId)
    .map((c) => c as string);
  // rule 354.3 / 370.1 (ogn-062-298 x ogn-194-298) — once a looked-at card has
  // removed itself with its own "as you look at me" replacement, the rest of
  // the looking instruction still ranges over the cards that were looked at and
  // are still there, never over fresh cards pulled up behind them.
  const carriedLookedAt = (effect as { lookedAtIds?: readonly string[] }).lookedAtIds;
  const topN = carriedLookedAt
    ? carriedLookedAt.filter((id) => deck.includes(id))
    : deck.slice(0, n);
  if (topN.length === 0) return;
  // rule 369.1 / 370.1 (ogn-194-298 Nocturne) — "as you look at or reveal me
  // from the top of your deck, you may …": a replacement on the LOOK itself,
  // so it is offered before the looking effect's own choice, while the card is
  // still in the deck. (Burn / mill move cards without looking and must not
  // offer it.) Cards already offered for this look are remembered so a decline
  // does not re-offer forever.
  const offered = ((effect as { revealOffered?: readonly string[] }).revealOffered ?? []) as readonly string[];
  if (from === "mainDeck") {
    const handled = [...offered];
    for (const revealedId of topN) {
      if (handled.includes(revealedId)) {
        continue;
      }
      // Mandatory on-reveal abilities resolve before any choice about the
      // revealed cards is offered (rule 429.2).
      const mandatory = mandatoryRevealEffects(revealedId);
      if (mandatory.length > 0) {
        fireMandatoryRevealAbilities([revealedId], looker, ctx, _h);
        handled.push(revealedId);
      }
      const asYouLook = asYouLookAbility(revealedId);
      if (!asYouLook) {
        continue;
      }
      ctx.draft.pendingChoice = {
        boundTargets: [revealedId as CoreCardId],
        effect: asYouLook,
        playerId: looker as CorePlayerId,
        sourceCardId: revealedId as CoreCardId,
        // The looking effect itself resumes after the answer either way.
        then: {
          ...(effect as object),
          lookedAtIds: topN,
          revealOffered: handled.includes(revealedId) ? handled : [...handled, revealedId],
        },
        type: "confirm",
        // biome-ignore lint/suspicious/noExplicitAny: branded id types
      } as any;
      return;
    }
  }
  // Rule 729 (ogn-174-298 Vision): parser emits {then:{recycle:…}} — the
  // choice is recycle-to-bottom or leave-on-top, never draw. A bare look
  // (no `then`) is the Stacked-Deck shape: draw the pick, recycle the rest.
  const lookEff = effect as {
    onPicked?: "recycle" | "banish" | "discard" | "draw" | "play";
    onRest?: "recycle" | "draw" | "trash";
    then?: { recycle?: unknown; draw?: unknown };
    filter?: {
      excludeCardTypes?: readonly string[];
      cardTypes?: readonly string[];
      minEnergyCost?: number;
    };
    optional?: boolean;
    reduceCost?: { energy?: number };
    ignoreEnergyCost?: boolean;
    ignoreCost?: boolean;
    maxMightAboveKilled?: number;
    followUp?: unknown;
  };
  const visionLike = lookEff.then?.recycle !== undefined;
  // rule 355.13 (ogn-291-298 The Candlelit Sanctum) — "You may recycle one or
  // BOTH of them": when the whole `then` is the recycle (no draw partner), the
  // pick is an "up to N" over every looked-at card, answered in one go.
  const recycleAnyOfThem =
    visionLike && lookEff.then?.draw === undefined && lookEff.onPicked === undefined && topN.length > 1;
  const onPicked = lookEff.onPicked ?? (visionLike ? "recycle" : "draw");
  const onRest = lookEff.onRest ?? (visionLike ? undefined : "recycle");
  const lookExcluded = lookEff.filter?.excludeCardTypes;
  // rule 383.3.a.3 (sfd-058-221) — "reveal a GEAR from among them": an
  // allow-list on the pick; non-matching looked-at cards are never offered.
  const lookAllowed = lookEff.filter?.cardTypes;
  // rule 206 (unl-064-219 Fate Weaver) — "a spell with Energy cost [4] or
  // more": a printed-Energy floor on the pick, checked by isValidPendingPick.
  const lookMinEnergy = lookEff.filter?.minEnergyCost;
  // rule-id: ogn-242-298 — "a unit … that has Might up to 1 more than the
  // killed unit": the ceiling is the Might the just-killed unit last had
  // (rule 429 / last-known information), recorded by `handle_kill`.
  const maxMight =
    lookEff.maxMightAboveKilled !== undefined &&
    typeof ctx.draft.lastKilledUnitMight === "number"
      ? ctx.draft.lastKilledUnitMight + lookEff.maxMightAboveKilled
      : undefined;
  // rule 359.3.e.12 (ogn-242-298) — the killed unit's Might is NULL when no
  // unit was killed (the target left play in response): every "Might up to N
  // more than the killed unit" comparison fails, so nothing may be picked.
  // The rest of the instruction ("then recycle the rest") still happens.
  if (lookEff.maxMightAboveKilled !== undefined && maxMight === undefined) {
    if (onRest === "recycle") {
      for (const restId of topN) {
        ctx.zones.moveCard({
          cardId: restId as CoreCardId,
          position: "bottom",
          targetZoneId: "mainDeck" as CoreZoneId,
        });
      }
      ctx.fireTriggers?.({ cardIds: topN, playerId: looker, type: "recycle" });
    }
    return;
  }
  // rule-id: ogn-062-298-look-banish-play — "banish … then play it,
  // reducing its cost by [N]" threads the discount to the pick resolver.
  const playEnergyReduction =
    onPicked === "play" ? (lookEff.reduceCost?.energy ?? 0) : undefined;
  // Rule 435 (ogn-174-298): must match the real RevealAndPickChoice
  // shape (prompter/revealer/revealed) — the previous playerId/options
  // shape made resolvePendingChoice unenumerable and softlocked play.
  ctx.draft.pendingChoice = {
    onPicked,
    ...(onRest ? { onRest } : {}),
    ...(playEnergyReduction !== undefined ? { playEnergyReduction } : {}),
    // rule 355.2.b (sfd-170-221) — "If it is a unit, you may play it here":
    // the source's own battlefield is a valid location for the instructed
    // play, even a contested one the player does not control.
    ...(onPicked === "play" && (ctx.sourceZone ?? "").startsWith("battlefield-")
      ? { playHere: ctx.sourceZone }
      : {}),
    // rule-id: ogn-115-298 — "plays those cards, ignoring Energy costs".
    ...(onPicked === "play" && lookEff.ignoreEnergyCost ? { playIgnoreEnergy: true } : {}),
    // rule 356.1.b.1 (ogn-242-298) — "play it, ignoring its cost": nothing is
    // paid, energy and power alike.
    ...(onPicked === "play" && lookEff.ignoreCost ? { playIgnoreCost: true } : {}),
    // rule 386.2 (ogn-291-298) — "Put those you don't [recycle] back in any
    // order": keeping every looked-at card leaves two or more on top, and
    // their order is the looker's decision. Declining the recycle is the only
    // outcome that keeps more than one (a pick recycles the rest of the pair),
    // so the arrangement is offered from the decline path.
    ...(visionLike && topN.length >= 2
      ? { onDecline: { amount: topN.length, type: "order-top" } }
      : {}),
    // rule-id: ogn-062-298-look-pick-filter — "banish a unit from among
    // them" must restrict the pick; thread the effect's filter through so
    // isValidPendingPick rejects non-matching revealed cards.
    ...((lookExcluded && lookExcluded.length > 0) ||
    (lookAllowed && lookAllowed.length > 0) ||
    maxMight !== undefined ||
    lookMinEnergy !== undefined
      ? {
          filter: {
            ...(lookExcluded && lookExcluded.length > 0
              ? { excludeCardTypes: [...lookExcluded] }
              : {}),
            ...(lookAllowed && lookAllowed.length > 0 ? { cardTypes: [...lookAllowed] } : {}),
            ...(maxMight !== undefined ? { maxMight } : {}),
            ...(lookMinEnergy !== undefined ? { minEnergyCost: lookMinEnergy } : {}),
          },
        }
      : {}),
    // rule-id: ogn-235-298-vision-optional-recycle — "You may recycle it"
    // means leave-on-top is a legal outcome; the pick must be declinable.
    ...(visionLike || lookEff.optional ? { optional: true } : {}),
    // rule 355.13 (ogn-291-298) — "one or both": up to `remaining` picks, one answer.
    ...(recycleAnyOfThem ? { remaining: topN.length, upTo: true } : {}),
    // rule 128.4 — "Look at" is a PRIVATE view; nothing is revealed (424.1),
    // so the looked-at cards and the pick stay hidden from every other player.
    private: true,
    prompter: looker,
    revealed: topN,
    revealer: looker,
    sourceCardId: ctx.sourceCardId,
    // rule-id: ven-089-166-look-then-empower — "Then you may do this:
    // Empower it" runs after the pick; the resolver binds the picked card as
    // the follow-up's trigger-source.
    ...(lookEff.followUp !== undefined ? { then: lookEff.followUp } : {}),
    type: "reveal-and-pick",
  };
}
