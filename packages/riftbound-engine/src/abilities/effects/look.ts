// Effect handler: "look"
import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { type EffectHelpers, resolveAmount } from "./_helpers";

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
  const deck = ctx.zones.getCardsInZone(from as CoreZoneId, looker as CorePlayerId);
  const topN = deck.slice(0, n).map((c) => c as string);
  if (topN.length === 0) return;
  // rule 369.1 / 370.1 (ogn-194-298 Nocturne) — "as you look at or reveal me
  // from the top of your deck, you may …": a replacement on the LOOK itself,
  // so it is offered before the looking effect's own choice, while the card is
  // still in the deck. (Burn / mill move cards without looking and must not
  // offer it.) Cards already offered for this look are remembered so a decline
  // does not re-offer forever.
  const offered = ((effect as { revealOffered?: readonly string[] }).revealOffered ?? []) as readonly string[];
  if (from === "mainDeck") {
    for (const revealedId of topN) {
      if (offered.includes(revealedId)) {
        continue;
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
        then: { ...(effect as object), revealOffered: [...offered, revealedId] },
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
    onRest?: "recycle";
    then?: { recycle?: unknown };
    filter?: { excludeCardTypes?: readonly string[]; cardTypes?: readonly string[] };
    optional?: boolean;
    reduceCost?: { energy?: number };
    ignoreEnergyCost?: boolean;
    ignoreCost?: boolean;
    playImmediately?: boolean;
    maxMightAboveKilled?: number;
    followUp?: unknown;
  };
  const visionLike = lookEff.then?.recycle !== undefined;
  const onPicked = lookEff.onPicked ?? (visionLike ? "recycle" : "draw");
  const onRest = lookEff.onRest ?? (visionLike ? undefined : "recycle");
  const lookExcluded = lookEff.filter?.excludeCardTypes;
  // rule 383.3.a.3 (sfd-058-221) — "reveal a GEAR from among them": an
  // allow-list on the pick; non-matching looked-at cards are never offered.
  const lookAllowed = lookEff.filter?.cardTypes;
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
    // rule-id: ogn-115-298 — "plays those cards, ignoring Energy costs".
    ...(onPicked === "play" && lookEff.ignoreEnergyCost ? { playIgnoreEnergy: true } : {}),
    // rule 356.1.b.1 (ogn-242-298) — "play it, ignoring its cost": nothing is
    // paid, energy and power alike.
    ...(onPicked === "play" && lookEff.ignoreCost ? { playIgnoreCost: true } : {}),
    // rule 337.1.b (ogn-242-298) — "banish … and play it" as one instruction:
    // the play finalizes with the ability, it does not wait on the chain.
    ...(onPicked === "play" && lookEff.playImmediately ? { playImmediate: true } : {}),
    // rule-id: ogn-062-298-look-pick-filter — "banish a unit from among
    // them" must restrict the pick; thread the effect's filter through so
    // isValidPendingPick rejects non-matching revealed cards.
    ...((lookExcluded && lookExcluded.length > 0) ||
    (lookAllowed && lookAllowed.length > 0) ||
    maxMight !== undefined
      ? {
          filter: {
            ...(lookExcluded && lookExcluded.length > 0
              ? { excludeCardTypes: [...lookExcluded] }
              : {}),
            ...(lookAllowed && lookAllowed.length > 0 ? { cardTypes: [...lookAllowed] } : {}),
            ...(maxMight !== undefined ? { maxMight } : {}),
          },
        }
      : {}),
    // rule-id: ogn-235-298-vision-optional-recycle — "You may recycle it"
    // means leave-on-top is a legal outcome; the pick must be declinable.
    ...(visionLike || lookEff.optional ? { optional: true } : {}),
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
