// Effect handler: "extra-turn"
import { enqueueExtraTurn } from "../../operations/turn-queue";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers } from "./_helpers";

export function handle_extraTurn(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // Rule 734: an additional turn is inserted directly after the current
  // turn in the repeating turn queue. The flow layer's turn.onEnd hook
  // dequeues it before normal seat-order rotation applies.
  enqueueExtraTurn(ctx.draft, ctx.playerId);
}
