// Effect handler: "grant-play-permission"
import type { CardId as CoreCardId } from "@tcg/core";
import { grantPlayPermission } from "../../operations/play-permissions";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

/**
 * rule 366.1 / 419.1.a — "you may play it (from your banishment / trash) [this
 * turn] [for <cost> / ignoring its cost]": records a PLAY PERMISSION on the
 * draft (`operations/play-permissions.ts`). The `playFromZone` move then offers
 * that play to the permitted player like any other Discretionary Action, and
 * the play runs through the play pipeline.
 *
 * Shape: `{ type: "grant-play-permission", target | (bound cards), zone?,
 * duration?: "turn" | "permanent", cost?, ignoreCost?: true | "energy",
 * player?: "self" | "owner", once? }`. `zone` defaults to wherever each card is
 * now; `player: "owner"` grants it to the card's owner instead of this effect's
 * controller.
 */
export function handle_grantPlayPermission(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const eff = effect as unknown as {
    zone?: string;
    duration?: "turn" | "permanent";
    cost?: { energy?: number; power?: readonly string[] };
    ignoreCost?: true | "energy";
    player?: string;
    once?: boolean;
  };
  for (const targetId of getTargetIds(effect, ctx)) {
    const zone = eff.zone ?? (ctx.zones.getCardZone(targetId as CoreCardId) as string | undefined);
    if (zone === undefined) {
      continue;
    }
    const playerId =
      eff.player === "owner"
        ? ((ctx.cards.getCardOwner(targetId as CoreCardId) as string | undefined) ?? ctx.playerId)
        : ctx.playerId;
    grantPlayPermission(ctx.draft, {
      cardId: targetId,
      expires: eff.duration ?? "turn",
      playerId,
      sourceCardId: ctx.sourceCardId,
      zone,
      ...(eff.cost !== undefined ? { cost: eff.cost } : {}),
      ...(eff.ignoreCost === true ? { costMode: "ignore-all" as const } : eff.ignoreCost === "energy" ? { costMode: "ignore-energy" as const } : {}),
      ...(eff.once === true ? { once: true } : {}),
    });
  }
}
