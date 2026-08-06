// Effect handler: "sequence"
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_sequence(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  const executeEffect = h.executeEffect;
  const seq = effect as unknown as {
    effects?: ExecutableEffect[];
    pendingValue?: { source: number };
  };
  if (seq.effects) {
    // Rule 354.2 / 309.1 / 323.6: seed from an enclosing sequence's captured
    // pending value so a nested `pending-value` reference still binds to the
    // banished card — Arcane Shift parses as [banish, [play-it, …]], and the
    // inner sequence has no `target` of its own, so without this seed the
    // play step fell through to a board scan and never added the pending
    // chain item that keeps the turn closed (rule 355.2 location choice).
    let pending: readonly string[] | undefined = (
      ctx as { pendingSequenceValue?: readonly string[] }
    ).pendingSequenceValue;
    for (let i = 0; i < seq.effects.length; i++) {
      const sub = seq.effects[i];
      const subTarget = (sub as { target?: { type?: string } | string }).target;
      let subCtx: EffectContext = ctx;
      // Rule 354.2: a `pending-value` target references the card(s) resolved
      // by this sequence's `pendingValue.source` step — bind them explicitly
      // so target resolution never falls through to a board scan.
      if (
        pending &&
        subTarget &&
        typeof subTarget !== "string" &&
        subTarget.type === "pending-value"
      ) {
        subCtx = { ...ctx, boundTargets: pending };
      }
      if (seq.pendingValue?.source === i) {
        pending = getTargetIds(sub, subCtx);
        subCtx = { ...subCtx, boundTargets: pending };
      }
      executeEffect(
        sub,
        { ...subCtx, pendingSequenceValue: pending } as EffectContext,
      );
    }
  }
}
