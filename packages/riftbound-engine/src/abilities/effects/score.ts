// Effect handler: "score"
import { hasPlayerWon } from "../../game-definition/win-conditions/victory";
import { pointGainDenied } from "../../operations/scoring-rules";
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
    const player = ctx.draft.players[playerId];
    if (!player) {
      continue;
    }
    // rule 054.1 / 055: while an opposing "can't gain points" static is on the
    // board, gaining points is impossible, so the instruction is simply skipped.
    // Losing points (a negative amount) is not a gain and still applies.
    if (amount > 0 && pointGainDenied(ctx.draft, playerId, ctx)) {
      continue;
    }
    player.victoryPoints += amount;
  }
  // rule 194.2(.b): the win check compares every player, so it runs only after
  // ALL recipients of one instruction have been updated — a symmetric "each
  // player gains 1" never leaves a momentary sole leader.
  for (const playerId of recipients) {
    if (hasPlayerWon(ctx.draft, playerId)) {
      ctx.draft.status = "finished";
      ctx.draft.winner = playerId;
      return;
    }
  }
}
