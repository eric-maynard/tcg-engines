/**
 * "I don't take damage" restrictions (rule 465.2.c.10).
 *
 * A unit with an active `{type:"static", effect:{type:"restriction",
 * restriction:"no-damage"}}` ability is never dealt damage: spell/ability
 * damage does nothing to it, and in combat it is skipped for mandatory damage
 * assignment and can never be dealt lethal damage.
 */

import { getGlobalCardRegistry } from "./card-lookup";

interface ImmunityState {
  readonly turnEventCounts?: Record<string, number>;
}

/**
 * rule-id: ogn-189-298 — "If I have moved twice this turn": every move of this
 * unit (Standard Move, Ganking or effect-driven) is tallied by `fireTriggers`
 * under the `move|c:<cardId>` key, which the flow clears each turn.
 */
function conditionHolds(
  condition: { type?: string; count?: number } | undefined,
  cardId: string,
  state: ImmunityState | undefined,
): boolean {
  if (condition === undefined) {
    return true;
  }
  if (condition.type === "moved-this-turn") {
    return (state?.turnEventCounts?.[`move|c:${cardId}`] ?? 0) >= (condition.count ?? 1);
  }
  // Unrecognised condition — do not grant immunity.
  return false;
}

export function unitIgnoresDamage(cardId: string, state: ImmunityState | undefined): boolean {
  for (const ability of getGlobalCardRegistry().getAbilities(cardId) ?? []) {
    const ab = ability as {
      type?: string;
      condition?: { type?: string; count?: number };
      effect?: { type?: string; restriction?: string };
    };
    if (ab.type !== "static" || ab.effect?.type !== "restriction") {
      continue;
    }
    if (ab.effect.restriction !== "no-damage") {
      continue;
    }
    if (conditionHolds(ab.condition, cardId, state)) {
      return true;
    }
  }
  return false;
}
