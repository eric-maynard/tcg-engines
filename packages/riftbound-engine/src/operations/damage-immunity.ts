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

interface ImmunityMeta {
  readonly empowered?: boolean;
  readonly combatRole?: string;
  /** rule 465.2.c.10 — denial conferred by ANOTHER permanent's static. */
  readonly staticNoDamage?: boolean;
}

type ImmunityCondition = {
  type?: string;
  count?: number;
  condition?: ImmunityCondition;
  conditions?: ImmunityCondition[];
};

/**
 * Tri-state so an unrecognised condition can never be turned INTO immunity by
 * wrapping it in a `not` — `undefined` means "not understood" and propagates.
 *
 * rule-id: ogn-189-298 — "If I have moved twice this turn": every move of this
 * unit (Standard Move, Ganking or effect-driven) is tallied by `fireTriggers`
 * under the `move|c:<cardId>` key, which the flow clears each turn.
 * rule 827 (rule-id: ven-084-166, Ambessa The Wolf) — "[Empowered] … can't be
 * dealt damage unless I'm in combat" is `and(while-empowered, not(in-combat))`.
 */
function evaluateCondition(
  condition: ImmunityCondition | undefined,
  cardId: string,
  state: ImmunityState | undefined,
  meta: ImmunityMeta | undefined,
): boolean | undefined {
  if (condition === undefined) {
    return true;
  }
  switch (condition.type) {
    case "moved-this-turn":
      return (state?.turnEventCounts?.[`move|c:${cardId}`] ?? 0) >= (condition.count ?? 1);
    case "while-empowered":
      return meta?.empowered === true;
    // rule 545: a unit is "in combat" while it carries a combat designation.
    case "in-combat":
      return meta?.combatRole === "attacker" || meta?.combatRole === "defender";
    case "attacking":
      return meta?.combatRole === "attacker";
    case "defending":
      return meta?.combatRole === "defender";
    case "not": {
      const inner = evaluateCondition(condition.condition, cardId, state, meta);
      return inner === undefined ? undefined : !inner;
    }
    case "and":
    case "or": {
      const subs = condition.conditions ?? [];
      if (subs.length === 0) {
        return undefined;
      }
      const results = subs.map((c) => evaluateCondition(c, cardId, state, meta));
      if (results.some((r) => r === undefined)) {
        return undefined;
      }
      return condition.type === "and" ? results.every(Boolean) : results.some(Boolean);
    }
    default:
      // Unrecognised condition — do not grant immunity.
      return undefined;
  }
}

export function unitIgnoresDamage(
  cardId: string,
  state: ImmunityState | undefined,
  getMeta?: (cardId: string) => ImmunityMeta | undefined,
): boolean {
  // rule 465.2.c.10 — "Other units you control here don't take damage." is a
  // static on ANOTHER card; the recalculation pass stamps the protection onto
  // every unit it currently covers, so no ability lookup here could see it.
  const meta = getMeta?.(cardId);
  if (meta?.staticNoDamage === true) {
    return true;
  }
  for (const ability of getGlobalCardRegistry().getAbilities(cardId) ?? []) {
    const ab = ability as {
      type?: string;
      condition?: ImmunityCondition;
      target?: unknown;
      effect?: { type?: string; restriction?: string; target?: unknown };
    };
    if (ab.type !== "static" || ab.effect?.type !== "restriction") {
      continue;
    }
    if (ab.effect.restriction !== "no-damage") {
      continue;
    }
    // rule 465.2.c.10 — a denial that names OTHER units ("Other units you
    // control here don't take damage.") protects them, never its own source;
    // that grant reaches them through `staticNoDamage` above.
    const subject = ab.effect.target ?? ab.target;
    if (subject !== undefined && subject !== "self") {
      const descriptor = subject as { excludeSelf?: boolean; includeSelf?: boolean };
      if (typeof subject !== "object" || descriptor.excludeSelf === true || descriptor.includeSelf !== true) {
        continue;
      }
    }
    if (evaluateCondition(ab.condition, cardId, state, meta) === true) {
      return true;
    }
  }
  return false;
}
