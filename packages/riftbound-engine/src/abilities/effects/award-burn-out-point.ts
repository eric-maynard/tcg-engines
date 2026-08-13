// Effect handler: "award-burn-out-point"
/**
 * rule 431.2.c — "Chooses an opponent to gain 1 point."
 *
 * Burn Out is a sequence (431.2.a–d) and step c is a real choice whenever the
 * burning player has two or more opponents. `operations/points.ts burnOut`
 * raises it as a `choose-player` prompt whose effect is this one; the answer
 * arrives as `ownerId` and the point is awarded through the ONE point choke
 * point, so 054.1 denial, 443.1.a replacements and 431.3.b's unpreventable
 * repeats behave exactly as they do when no seat had to be named.
 *
 * rule 431.2.d — "Completes the remainder of the action that caused them to
 * burn out". When the question came from the Draw Phase that phase is already
 * over by the time it is answered (315.4 — its hook returns immediately), so
 * the owed draw rides on the choice and is performed here, including the
 * further Burn Outs an still-empty deck causes (431.3) and the `draw` event the
 * phase would have fired.
 */
import type { PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { awardPoints, checkVictory, refillDeckOrBurnOut } from "../../operations/points";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import type { PlayerId } from "../../types";

export function handle_awardBurnOutPoint(effect: ExecutableEffect, ctx: EffectContext): void {
  const e = effect as unknown as {
    ownerId?: string;
    burnerId?: string;
    sequenceIndex?: number;
    thenDraw?: boolean;
  };
  if (e.ownerId === undefined) {
    return;
  }
  const sequenceIndex = e.sequenceIndex ?? 0;
  const io = ctx as unknown as Parameters<typeof awardPoints>[4];
  awardPoints(ctx.draft, e.ownerId as PlayerId, 1, { method: "burn-out", sequenceIndex }, io);
  // rule 431.3.c.1 — a repeat Burn Out's point wins the game at once.
  checkVictory(ctx.draft, { immediate: sequenceIndex > 0, io: io as never });

  const burner = e.burnerId;
  if (e.thenDraw !== true || burner === undefined || ctx.draft.status !== "playing") {
    return;
  }
  // rule 431.3 — the deck can still be empty (an empty trash recycles nothing),
  // in which case this loops into the next Burn Out; that one may ask again,
  // and the draw rides on that question in turn.
  const refilled = refillDeckOrBurnOut(ctx.draft, burner as PlayerId, io as never, {
    canPrompt: true,
    thenDraw: true,
  });
  if (!refilled || ctx.draft.pendingChoice !== undefined || ctx.draft.status !== "playing") {
    return;
  }
  ctx.zones?.drawCards?.({
    count: 1,
    from: "mainDeck" as CoreZoneId,
    playerId: burner as CorePlayerId,
    to: "hand" as CoreZoneId,
  } as never);
  ctx.fireTriggers?.({ playerId: burner, type: "draw" } as never);
}
