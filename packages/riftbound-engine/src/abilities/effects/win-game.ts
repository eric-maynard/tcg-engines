// Effect handler: "win-game"
import { declareWinner } from "../../operations/points";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers } from "./_helpers";

/**
 * rule 472.1 — "you win the game": the game ends the moment the effect
 * resolves, regardless of Victory Points. `effect.player` names the winner
 * when it isn't the resolving controller.
 */
export function handle_winGame(
  effect: ExecutableEffect,
  ctx: EffectContext,
  _h: EffectHelpers,
): void {
  const named = (effect as { player?: string }).player;
  const winner =
    named === "opponent"
      ? Object.keys(ctx.draft.players ?? {}).find((p) => p !== ctx.playerId)
      : ctx.playerId;
  if (winner) {
    declareWinner(ctx.draft, winner);
  }
}
