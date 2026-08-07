// Effect handler: "score"
import { awardPoints, checkVictory, losePoints } from "../../operations/points";
import type { PlayerId } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, resolveAmount } from "./_helpers";

/**
 * rule 194.1.c: a point instruction names who gains/loses. `player` selects the
 * recipients; anything unrecognised (including the common absent case) means
 * the controller of the effect.
 */
function scoreRecipients(effect: ExecutableEffect, ctx: EffectContext): PlayerId[] {
  const all = Object.keys(ctx.draft.players) as PlayerId[];
  switch ((effect as { player?: string }).player) {
    case "all":
    case "each":
    case "each-player":
    case "every":
      return all;
    case "each-opponent":
    case "enemy":
    case "opponent":
    case "opponents":
    case "other":
      return all.filter((pid) => pid !== ctx.playerId);
    default:
      return [ctx.playerId];
  }
}

export function handle_score(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const amount = resolveAmount(effect.amount ?? 1, ctx);
  const recipients = scoreRecipients(effect, ctx);
  for (const playerId of recipients) {
    if (amount < 0) {
      // rule 194.4: a loss never takes a player below 0 (194.4.a: at 0, nothing).
      losePoints(ctx.draft, playerId, -amount);
      continue;
    }
    // rule 054.1 / 055: awardPoints skips the gain while an opposing "can't
    // gain points" static is on the board (an impossible instruction).
    awardPoints(
      ctx.draft,
      playerId,
      amount,
      { method: "effect", sourceCardId: ctx.sourceCardId },
      ctx,
    );
  }
  // rule 320 / 321 / 472: no Cleanup — hence no victory check — while a Chain
  // Item is resolving, so "You gain 1 point. Then each opponent gains 1 point."
  // never wins between its two instructions; and rule 194.2(.b): the check
  // compares every player only after ALL recipients of one instruction were
  // updated. checkVictory is a no-op mid-resolution; the post-resolution
  // Cleanup runs it. Outside a chain (inline resolution) it applies now.
  checkVictory(ctx.draft, { io: ctx });
}
