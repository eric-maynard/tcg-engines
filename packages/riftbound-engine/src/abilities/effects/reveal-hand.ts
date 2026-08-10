// Effect handler: "reveal-hand"
import type { PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { matchesRevealPickFilter } from "../../operations/reveal-pick-filter";
import type { RevealPickFilter } from "../../operations/reveal-pick-filter";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, recordPublicReveal } from "./_helpers";

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

  const { filter } = effect as unknown as { filter?: RevealPickFilter };
  const revealEff = effect as unknown as {
    chooseBattlefield?: boolean;
    optional?: boolean;
    playIgnoreCost?: boolean;
    playStun?: boolean;
  };
  const onPicked = ((effect as unknown as { onPicked?: "recycle" | "banish" | "discard" | "play" })
    .onPicked ?? "recycle") as "recycle" | "banish" | "discard" | "play";

  // rule 355.10 / 419.3 (unl-139-219 Bone Skewer) — "Choose a battlefield …
  // They play that unit to THAT battlefield": the destination is picked by
  // this effect's controller before the hand is revealed. With two or more
  // battlefields the controller is prompted; a single one is auto-chosen.
  let playTo: string | undefined;
  if (revealEff.chooseBattlefield === true) {
    const bound = ctx.boundTargets?.[0];
    const allBfIds = Object.keys(ctx.draft.battlefields ?? {});
    // rule 811.1.d.2 / 723.1.d — a card played from Hidden may only choose at
    // the battlefield it was facedown at: lock the destination there (single
    // option ⇒ auto-chosen) instead of offering the whole board.
    const hiddenBfIds =
      ctx.hiddenZone === undefined
        ? allBfIds
        : allBfIds.filter((id) => `battlefield-${id}` === ctx.hiddenZone);
    const bfIds = hiddenBfIds.length > 0 ? hiddenBfIds : allBfIds;
    if (bound !== undefined) {
      playTo = bound.startsWith("battlefield-") ? bound : `battlefield-${bound}`;
    } else if (bfIds.length >= 2) {
      ctx.draft.pendingChoice = {
        effect,
        options: bfIds,
        playerId: ctx.playerId,
        remaining: 1,
        sourceCardId: ctx.sourceCardId,
        type: "choose-target",
      } as NonNullable<typeof ctx.draft.pendingChoice>;
      return;
    } else if (bfIds[0] !== undefined) {
      playTo = `battlefield-${bfIds[0]}`;
    } else {
      return;
    }
  }

  // rule 424.1 / 424.3.a — "They reveal their hand" presents those cards to ALL
  // players, so the reveal lands on the shared public-reveal record like every
  // other reveal path; the prompt only governs who may pick from it. The reveal
  // is unconditional — it happens even when nothing in the hand is pickable.
  recordPublicReveal(ctx, revealer, revealed);

  // rule 359.3.e.11 — if the revealer has no cards in hand, or every revealed
  // card fails the pick filter, there is no valid pick: the choose/recycle
  // instructions are skipped so play can continue (otherwise pendingChoice
  // deadlocks the game on a prompt with no legal answer). Shares the exact
  // predicate `resolvePendingChoice` validates picks with, so a filter the
  // prompt would reject can never open a prompt.
  if (!revealed.some((id) => matchesRevealPickFilter(filter, id))) {
    return;
  }

  ctx.draft.pendingChoice = {
    filter,
    onPicked,
    ...(playTo !== undefined ? { playTo } : {}),
    // rule 356.5.a (unl-139-219) — "ignoring any and all costs".
    ...(revealEff.playIgnoreCost === true ? { playIgnoreCost: true } : {}),
    // rule 423 (unl-139-219) — "When they do, Stun it."
    ...(revealEff.playStun === true ? { playStun: true } : {}),
    // rule 355.13 — "You may choose a unit from it".
    ...(revealEff.optional === true ? { optional: true } : {}),
    // rule 392 (unl-169-219) — "When they hold, return it to their hand".
    ...((effect as unknown as { returnOnHold?: boolean }).returnOnHold === true
      ? { returnOnHold: true }
      : {}),
    // rule 356.1 (unl-135-219) — "They reveal their hand. You may pay 2 XP to
    // choose a card from their hand": the reveal itself is never gated on the
    // payment; only the pick is.
    ...((effect as unknown as { pickCost?: unknown }).pickCost !== undefined
      ? { pickCost: (effect as unknown as { pickCost?: unknown }).pickCost }
      : {}),
    // rule 359.3.e (unl-135-219) — "…they discard that card AND draw 1": the
    // follow-up rides on the prompt and runs only after a card was picked.
    ...((effect as unknown as { then?: unknown }).then !== undefined
      ? { then: (effect as unknown as { then?: unknown }).then }
      : {}),
    prompter: ctx.playerId,
    revealed,
    revealer,
    sourceCardId: ctx.sourceCardId,
    type: "reveal-and-pick",
  };
}
