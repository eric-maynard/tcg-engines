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
    // rule 421.4 — the board context is the io the reveal needs: an effect win
    // ends the game exactly as a points win does, facedown cards included.
    declareWinner(ctx.draft, winner, ctx as Parameters<typeof declareWinner>[2]);
  }
}
