// Effect handler: "look"
import type { PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, resolveAmount } from "./_helpers";

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
  const deck = ctx.zones.getCardsInZone(from as CoreZoneId, ctx.playerId as CorePlayerId);
  const topN = deck.slice(0, n).map((c) => c as string);
  if (topN.length === 0) return;
  // Rule 729 (ogn-174-298 Vision): parser emits {then:{recycle:…}} — the
  // choice is recycle-to-bottom or leave-on-top, never draw. A bare look
  // (no `then`) is the Stacked-Deck shape: draw the pick, recycle the rest.
  const lookEff = effect as {
    onPicked?: "recycle" | "banish" | "discard" | "draw" | "play";
    onRest?: "recycle";
    then?: { recycle?: unknown };
    filter?: { excludeCardTypes?: readonly string[] };
    optional?: boolean;
    reduceCost?: { energy?: number };
  };
  const visionLike = lookEff.then?.recycle !== undefined;
  const onPicked = lookEff.onPicked ?? (visionLike ? "recycle" : "draw");
  const onRest = lookEff.onRest ?? (visionLike ? undefined : "recycle");
  const lookExcluded = lookEff.filter?.excludeCardTypes;
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
    // rule-id: ogn-062-298-look-pick-filter — "banish a unit from among
    // them" must restrict the pick; thread the effect's filter through so
    // isValidPendingPick rejects non-matching revealed cards.
    ...(lookExcluded && lookExcluded.length > 0
      ? { filter: { excludeCardTypes: [...lookExcluded] } }
      : {}),
    // rule-id: ogn-235-298-vision-optional-recycle — "You may recycle it"
    // means leave-on-top is a legal outcome; the pick must be declinable.
    ...(visionLike || lookEff.optional ? { optional: true } : {}),
    prompter: ctx.playerId,
    revealed: topN,
    revealer: ctx.playerId,
    sourceCardId: ctx.sourceCardId,
    type: "reveal-and-pick",
  };
}
