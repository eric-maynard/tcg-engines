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
import { attachedEffectTextAbilities } from "../trigger-runner";
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
 * rule 136.2.d / 718 (rule-id: sfd-030-221 Skyfall of Areion) — "My hold
 * effects are also conquer effects, and vice versa": a `hold-conquer-equivalence`
 * static on the unit or on any Equipment it wears.
 */
function hasHoldConquerEquivalence(unitId: string, equipped: readonly string[]): boolean {
  const registry = getGlobalCardRegistry();
  for (const id of [unitId, ...equipped]) {
    for (const a of registry.getAbilities(id) ?? []) {
      const effect = (a as { effect?: { type?: string } }).effect;
      if (a.type === "static" && effect?.type === "hold-conquer-equivalence") {
        return true;
      }
    }
  }
  return false;
}

/** The conquer-effect copies Skyfall makes of the wearer's hold triggers. */
function holdTriggersAsConquer(abilities: readonly ConquerAbility[]): ConquerAbility[] {
  return abilities
    .filter((a) => a.type === "triggered" && a.trigger?.event === "hold")
    .map((a) => ({ ...a, trigger: { ...a.trigger, event: "conquer" } }));
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
    // rule 136 / 718.3 (rule-id: sfd-124-221 Doran's Ring) — an Equipment's
    // Effect Text is part of the WEARER's text, so a conquer effect it confers
    // is one of "the conquer effects of units here" too.
    const meta = ctx.cards.getCardMeta?.(unitId as Parameters<EffectContext["cards"]["getCardOwner"]>[0]);
    const abilities = [
      ...((registry.getAbilities(unitId) ?? []) as ConquerAbility[]),
      ...(attachedEffectTextAbilities(meta as never) as unknown as ConquerAbility[]),
    ];
    // rule 136.2.d / 718 (rule-id: sfd-030-221 Skyfall of Areion, ruling
    // be6bb893a652ef83) — Skyfall makes the wearer's hold effects conquer
    // effects too, so those copies are among "the conquer effects of units
    // here" the Arena activates.
    const equipped = ((meta as { equippedWith?: readonly string[] } | undefined)?.equippedWith ??
      []) as readonly string[];
    if (hasHoldConquerEquivalence(unitId as string, equipped)) {
      abilities.push(...holdTriggersAsConquer(abilities));
    }
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
