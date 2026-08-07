// Effect handler: "double-might"
import type { CardId as CoreCardId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import {
  type EffectHelpers,
  getTargetIds,
  getEffectiveMight,
  getKeywordTotalValue,
  checkBecomesMighty,
} from "./_helpers";

/**
 * rule 807.1.c (Assault) / rule 811.1.c (Shield): while a unit carries a combat
 * role its keyword bonus is part of its CURRENT Might, so rule 432.1.a doubles
 * it in. `getEffectiveMight` only sums the persistent layers.
 */
function combatRoleMightBonus(cardId: string, ctx: EffectContext): number {
  const meta = ctx.cards.getCardMeta?.(cardId as CoreCardId) as
    | Partial<RiftboundCardMeta>
    | undefined;
  const role = (meta as { combatRole?: string } | undefined)?.combatRole;
  if (role !== "attacker" && role !== "defender") {
    return 0;
  }
  return getKeywordTotalValue(cardId, role === "attacker" ? "Assault" : "Shield", ctx);
}

export function handle_doubleMight(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // rule-id: ven-142-166 — "double a unit's Might this turn": add the
  // unit's current effective Might to its turn-scoped mightModifier
  // (reset at Ending Step alongside other modify-might buffs).
  // rule-id: sfd-110-221 (rule 466.7.c) — duration:"combat" also records the
  // delta in combatMightModifier so Combat Cleanup can revert it.
  const thisCombat = effect.duration === "combat";
  const targets = getTargetIds(effect, ctx);
  const dmTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
  for (const targetId of dmTargets) {
    // rule 432.1.a — "double" reads the unit's Might right now, including live
    // combat-role bonuses (Assault/Shield); the flat +X outlives them.
    const mightBefore = getEffectiveMight(targetId, ctx) + combatRoleMightBonus(targetId, ctx);
    const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      {
        mightModifier: (meta?.mightModifier ?? 0) + mightBefore,
        ...(thisCombat
          ? { combatMightModifier: (meta?.combatMightModifier ?? 0) + mightBefore }
          : {}),
      } as unknown as Record<string, unknown>,
    );
    checkBecomesMighty(targetId, mightBefore, ctx);
  }
}
