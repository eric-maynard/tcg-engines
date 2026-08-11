// Effect handler: "conditional"
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, evaluateEffectCondition, getTargetIds } from "./_helpers";

/**
 * rule 354.2 (sfd-154-221 Guards!) — does this branch name what the enclosing
 * sequence's source step produced ("Play a … token. You may pay [order] to
 * ready IT")? The reference may sit anywhere inside the branch.
 */
function namesPendingValue(effect: unknown): boolean {
  if (effect === null || typeof effect !== "object") {
    return false;
  }
  for (const value of Object.values(effect as Record<string, unknown>)) {
    if (value !== null && typeof value === "object") {
      if ((value as { type?: unknown }).type === "pending-value" || namesPendingValue(value)) {
        return true;
      }
    }
  }
  return false;
}

export function handle_conditional(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  const executeEffect = h.executeEffect;
  // If condition is met, execute "then"; otherwise execute "else"
  const { condition } = effect as unknown as { condition?: Record<string, unknown> };
  const thenEffect = (effect as unknown as { then?: ExecutableEffect }).then;
  const elseEffect = (effect as unknown as { else?: ExecutableEffect }).else;

  // rule 359.3.e.5 / 359.3.e.7 (unl-134-219 Existential Dread × [Repeat]) — a
  // branch whose subject is the chosen target does nothing at all once that
  // target is illegal: neither branch runs, and the condition is never read
  // off a card that is no longer the object that was chosen.
  const subject = (effect as unknown as { target?: unknown }).target;
  if (subject !== undefined && (ctx.boundTargets?.length ?? 0) > 0 && getTargetIds(effect, ctx).length === 0) {
    return;
  }

  // rule 356.1 (ven-152-166) — "You may pay [rainbow]. If you do, X.
  // Otherwise, Y." is a cost paid WITHIN the instructions: the controller is
  // asked, and only an accepted (and charged) payment takes the `then` branch.
  // rule 444.2 / 355.10.c.1 / 429.3 — the Pay is a Game Action that is still
  // ASKED even when nothing in the pool can meet it: the prompt is surfaced
  // with `canAccept:false` (the enumerator withholds "accept") so its
  // controller may still activate Reaction [Add] abilities while it is open.
  // Declining runs `else`, exactly as an unpayable cost used to do silently.
  const payCost =
    condition?.type === "pay-cost" && condition.cost && typeof condition.cost === "object"
      ? (condition.cost as Record<string, unknown>)
      : undefined;
  if (payCost) {
    // rule 354.2 / 205 (sfd-154-221) — the linked instruction names the object
    // the sequence's source step just produced, so the parked Pay carries that
    // object rather than re-resolving from the board when it is answered.
    const pendingValue = (ctx as { pendingSequenceValue?: readonly string[] }).pendingSequenceValue;
    const namedPending =
      pendingValue !== undefined &&
      pendingValue.length > 0 &&
      (namesPendingValue(thenEffect) || namesPendingValue(elseEffect));
    if (!ctx.draft.pendingChoice) {
      ctx.draft.pendingChoice = {
        payChoice: {
          boundTargets: namedPending
            ? [...(pendingValue as readonly string[])]
            : ctx.boundTargets
              ? [...ctx.boundTargets]
              : undefined,
          else: elseEffect,
          sourcePlayerId: ctx.playerId,
          then: thenEffect,
        },
        playerId: ctx.playerId,
        resolved: { optInCost: payCost },
        // rule 205 — the Pay is asked about the object the linked instruction
        // acts on, so a pending-value rider names the card it just produced.
        sourceCardId: namedPending ? ((pendingValue as readonly string[])[0] as string) : ctx.sourceCardId,
        type: "opt-in",
      } as typeof ctx.draft.pendingChoice;
    }
    return;
  }

  let conditionMet = true; // Default to true if no condition specified
  if (condition) {
    conditionMet = evaluateEffectCondition(condition, ctx);
  }

  if (conditionMet && thenEffect) {
    executeEffect(thenEffect, ctx);
  } else if (!conditionMet && elseEffect) {
    executeEffect(elseEffect, ctx);
  }
}
