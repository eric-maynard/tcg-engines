// Effect handler: "reveal-zone"
import type { PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, recordPublicReveal } from "./_helpers";
import { resolveInformationTarget } from "./grant-visibility";

/**
 * "They reveal their hand." (unl-053-219 Scuttle Crab) — a bare Reveal of a
 * whole private zone, with no pick riding on it (that flow is `reveal-hand`).
 *
 * rule 424.1 — a Reveal presents the cards to ALL players, so they go on the
 * shared public reveal record. rule 424.1.a.3 — the Revealed state lasts only
 * until the revealing ability finishes resolving, so this grants NO lasting
 * visibility; a seat's live view of the zone is redacted again afterwards.
 * rule 424.3.a.1 — "reveal [zone]" names the cards there at that moment, so a
 * card drawn later was never revealed.
 *
 * Effect shape: `{ type: "reveal-zone", player?: "opponent" | "self",
 * zone?: "hand" }`.
 */
export function handle_revealZone(
  effect: ExecutableEffect,
  ctx: EffectContext,
  _h: EffectHelpers,
): void {
  const spec = effect as unknown as { player?: string; zone?: string };
  const owner = resolveInformationTarget(spec, ctx);
  if (owner === undefined) {
    return;
  }
  const zone = spec.zone ?? "hand";
  const revealed = ctx.zones
    .getCardsInZone(zone as CoreZoneId, owner as CorePlayerId)
    .map((id) => id as string);
  recordPublicReveal(ctx, owner, revealed);
}
