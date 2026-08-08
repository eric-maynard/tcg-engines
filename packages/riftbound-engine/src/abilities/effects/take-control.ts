// Effect handler: "take-control"
import type { CardId as CoreCardId, PlayerId as CorePlayerId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";
import { arriveByEffect } from "./move";

export function handle_takeControl(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // rule-id: sfd-109-221 (Akshan) — record a layered control-changing
  // effect on each target and apply it. `until-leaves` entries carry the
  // source so state-based cleanup can drop them (and fall back to the
  // next-latest effect, else the owner) once the source leaves the board.
  // rule 190.3.a: a stolen unit "otherwise becomes present" at a battlefield for its new
  // controller, contesting it exactly as a Move would. Standing among its former allies the
  // Cleanup after this resolution begins a Combat (323.9 / 323.13 — shared arrival helper);
  // alone there it is a Non-Combat Showdown (344.2 / 323.12) whose close establishes control
  // = Conquer (348.2.a) — control is never flipped inline. A recall later in the same
  // resolution (Possession) leaves nobody contesting, so the Cleanup just drops the status.
  const targets = getTargetIds(effect, ctx);
  const untilLeaves = effect.duration === "until-leaves";
  for (const targetId of targets) {
    const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    const existing = meta?.controlEffects ?? [];
    const entry = untilLeaves
      ? { controllerId: ctx.playerId, sourceCardId: ctx.sourceCardId }
      : { controllerId: ctx.playerId };
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      { controlEffects: [...existing, entry] } as unknown as Record<string, unknown>,
    );
    ctx.cards.setCardController?.(targetId as CoreCardId, ctx.playerId as CorePlayerId);
    arriveByEffect(ctx, [targetId], ctx.zones.getCardZone(targetId as CoreCardId) ?? "", "control-change");
  }
}
