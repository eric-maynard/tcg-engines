// Effect handler: "take-control"
import type { CardId as CoreCardId, PlayerId as CorePlayerId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_takeControl(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // rule-id: sfd-109-221 (Akshan) — record a layered control-changing
  // effect on each target and apply it. `until-leaves` entries carry the
  // source so state-based cleanup can drop them (and fall back to the
  // next-latest effect, else the owner) once the source leaves the board.
  // rule 190.3.a: a stolen unit "otherwise becomes present" at a battlefield for its new
  // controller — the Contested / conquer consequence is settled by state-based cleanup once
  // the ability has finished (so Possession's follow-up recall leaves nothing behind).
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
  }
}
