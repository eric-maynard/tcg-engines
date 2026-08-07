// Effect handler: "grant-visibility"
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers } from "./_helpers";

/**
 * rule 127 — information effects: "They reveal their hand. You can look at
 * their facedown cards this turn." (unl-053-219 Scuttle Crab). The grant is
 * recorded on the state so every per-seat observation (harness + app snapshot)
 * un-redacts those private zones for the granted viewer.
 *
 * Effect shape: `{ type: "grant-visibility", player?: "opponent" | "self",
 * zones?: ("hand" | "facedown")[], duration?: "turn" | "permanent" }`.
 * Turn-scoped grants are cleared with the rest of the turn state.
 */
export function handle_grantVisibility(
  effect: ExecutableEffect,
  ctx: EffectContext,
  _h: EffectHelpers,
): void {
  const spec = effect as unknown as {
    player?: string;
    zones?: readonly string[];
    duration?: "turn" | "permanent";
  };
  const viewer = ctx.playerId;
  // A bound player target wins; otherwise "opponent" (the default) resolves to
  // the other player — "Choose an opponent" is forced in a two-player game.
  const bound = ctx.boundTargets?.find((id) => ctx.draft.players[id] !== undefined);
  const owner =
    bound ??
    (spec.player === "self"
      ? viewer
      : (Object.keys(ctx.draft.players).find((p) => p !== viewer) ?? viewer));
  if (owner === undefined) {
    return;
  }
  const zones = spec.zones ?? ["hand", "facedown"];
  const grants = ctx.draft.visibilityGrants ?? [];
  const existing = grants.find((g) => g.viewer === viewer && g.owner === owner);
  if (existing) {
    const merged = [...new Set([...existing.zones, ...zones])];
    (existing as { zones: readonly string[] }).zones = merged;
    return;
  }
  ctx.draft.visibilityGrants = [
    ...grants,
    { duration: spec.duration ?? "turn", owner, viewer, zones: [...zones] },
  ];
}
