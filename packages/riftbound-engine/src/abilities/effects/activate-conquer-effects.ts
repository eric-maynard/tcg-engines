// Effect handler: "activate-conquer-effects"
//
// rule 383.4.g / 383.4.g.1 (ogn-286-298 Reckoner's Arena): "activate the
// conquer effects of units here" checks each unit's own conquer-triggered
// abilities treating ONLY the "conquer" part of the trigger condition as
// fulfilled, and places each one on the chain as if it had just triggered.
// No Conquer happens (no control change, no point, no player-referencing
// "when you conquer" trigger), and nothing is chosen — "units here" is
// criteria-based (rule 355.5.a).
import { addToChain, createInteractionState } from "../../chain/chain-state";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import type { EffectHelpers } from "./_helpers";

interface ConquerAbility {
  readonly type?: string;
  readonly trigger?: {
    event?: string;
    on?: unknown;
    condition?: unknown;
    restrictions?: unknown;
  };
  readonly effect?: unknown;
  readonly condition?: unknown;
  readonly restrictions?: unknown;
  readonly optional?: boolean;
}

/**
 * rule 383.2.a.1: extra conditions ("after an attack", "if you assigned 5 or
 * more excess damage", "a battlefield that WAS UNCONTROLLED") are part of the
 * trigger condition and are NOT treated as fulfilled — only the conquer itself
 * is. An ability carrying any such extra condition is not placed on the chain,
 * whether the condition sits on the ability or inside its `trigger` (where the
 * parser and card defs put `restrictions`, e.g. sfd-116-221 Yone, Blademaster:
 * a hold happens at a battlefield you already controlled — rule 464.2 — so his
 * "was uncontrolled" condition can never be met this way).
 */
function isPlainConquerTrigger(ability: ConquerAbility): boolean {
  return (
    ability.type === "triggered" &&
    ability.trigger?.event === "conquer" &&
    ability.trigger.on === "self" &&
    ability.condition === undefined &&
    ability.restrictions === undefined &&
    ability.trigger.condition === undefined &&
    ability.trigger.restrictions === undefined
  );
}

export function handle_activateConquerEffects(
  effect: ExecutableEffect,
  ctx: EffectContext,
  h: EffectHelpers,
): void {
  const registry = getGlobalCardRegistry();
  const turnOrder = Object.keys(ctx.draft.players);
  for (const unitId of h.getTargetIds(effect, ctx)) {
    const abilities = (registry.getAbilities(unitId) ?? []) as ConquerAbility[];
    for (const ability of abilities) {
      if (!isPlainConquerTrigger(ability)) {
        continue;
      }
      ctx.draft.interaction = addToChain(
        ctx.draft.interaction ?? createInteractionState(),
        {
          cardId: unitId,
          controller: ctx.cards.getCardOwner(unitId as Parameters<EffectContext["cards"]["getCardOwner"]>[0]) ?? ctx.playerId,
          effect: ability.effect,
          optional: ability.optional === true,
          triggered: true,
          type: "ability",
        },
        turnOrder,
      );
    }
  }
}
