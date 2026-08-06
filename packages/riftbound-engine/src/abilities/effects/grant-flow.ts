// Effect handler: "grant-flow"
import type { CardId as CoreCardId } from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

/**
 * rule-id: ven-113-166 (rules 829.1.b, 206) — "give a spell in your trash
 * [Flow] equal to its cost this turn". [Flow] is a permission plus an
 * alternate cost: the owner may play the card from their trash for that cost
 * and then banishes it (829.1.b.1). "Its cost" means the card's PRINTED cost
 * (rule 206), so the grant is priced off the registry, not off any discount
 * that happens to apply right now.
 *
 * An explicit `cost` on the effect overrides the printed-cost default.
 */
export function handle_grantFlow(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const registry = getGlobalCardRegistry();
  const targets = getTargetIds(effect, ctx);
  const duration = (effect.duration ?? "turn") as "turn" | "permanent";
  const explicit = (effect as { cost?: { energy?: number; power?: readonly string[] } }).cost;
  for (const targetId of targets) {
    const printed = registry.getCostToDeduct(targetId);
    const power: string[] = [];
    if (explicit?.power) {
      power.push(...explicit.power);
    } else {
      for (const [domain, n] of Object.entries(printed?.power ?? {})) {
        for (let i = 0; i < (n ?? 0); i++) {
          power.push(domain);
        }
      }
    }
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      {
        grantedFlow: { duration, energy: explicit?.energy ?? printed?.energy ?? 0, power },
      } as unknown as Record<string, unknown>,
    );
  }
}
