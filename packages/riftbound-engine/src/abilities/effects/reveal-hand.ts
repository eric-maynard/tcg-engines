// Effect handler: "reveal-hand"
import type { PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers } from "./_helpers";

export function handle_revealHand(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // Opponent-reveals-hand + active-player-picks flow.
  // Sets a `pendingChoice` on the game state. All other moves become
  // Illegal until `resolvePendingChoice` is invoked (see chain-moves.ts).
  //
  // Effect shape:
  //   {
  //     Type: "reveal-hand",
  //     Target: { type: "player", controller: "enemy" }, // whose hand to reveal
  //     Filter?: { excludeCardTypes?: string[] },        // non-unit, etc.
  //     OnPicked?: "recycle" | "banish" | "discard",     // default: recycle
  //   }
  const revealerOverride = (effect as unknown as { revealer?: string }).revealer;
  const revealer =
    revealerOverride ??
    Object.keys(ctx.draft.players).find((p) => p !== ctx.playerId) ??
    ctx.playerId;
  const revealed = ctx.zones
    .getCardsInZone("hand" as CoreZoneId, revealer as CorePlayerId)
    .map((id) => id as string);

  const { filter } = effect as unknown as { filter?: { excludeCardTypes?: string[] } };
  const onPicked = ((effect as unknown as { onPicked?: "recycle" | "banish" | "discard" })
    .onPicked ?? "recycle") as "recycle" | "banish" | "discard";

  // If the revealer has no cards in hand, or every revealed card is
  // excluded by the filter, there is no valid pick — skip so play can
  // continue (otherwise pendingChoice deadlocks the game).
  const revealRegistry = getGlobalCardRegistry();
  const excluded = filter?.excludeCardTypes ?? [];
  const validPicks = revealed.filter((id) => {
    const t = revealRegistry.get(id)?.cardType;
    return !t || !excluded.includes(t);
  });
  if (validPicks.length === 0) {
    return;
  }

  ctx.draft.pendingChoice = {
    filter,
    onPicked,
    prompter: ctx.playerId,
    revealed,
    revealer,
    type: "reveal-and-pick",
  };
}
