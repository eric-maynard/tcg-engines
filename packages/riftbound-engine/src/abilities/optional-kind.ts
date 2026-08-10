/**
 * ONE model for the optional / costed parts of a TRIGGERED ability (rules
 * 383.3.a–b, 402.1, 403.1.b.1, 404, 204.3, 205, 740.4.a.2). Every caller that
 * needs to know WHEN a "you may …" is decided or WHEN a cost inside a trigger is
 * paid asks this classifier instead of pattern-matching the payload itself.
 *
 * | kind                   | text shape                                                       | decided | paid / performed |
 * |------------------------|------------------------------------------------------------------|---------|------------------|
 * | `cost-at-finalization` | "you may [pay N / kill me / exhaust me / discard N / spend a buff / kill X / recycle X] TO Y", "Recycle me to Y", "spend 3 XP to Y" | FIN (383.3.a / 402.1) | FIN — it is the trigger's BASE COST (383.3.b, 204.3.a, 740.4.a.2, 404.1); unpayable / declined ⇒ the Pending item is removed (404.2) |
 * | `may-at-finalization`  | "you may Y", "you may X. If you do, Y"                           | FIN (383.3.a / 402.1); declined ⇒ removed (383.3.a.2) | X and Y are instructions performed at RES; a "pay [C]. If you do" is a GAME ACTION, not a cost (205); Y is mandatory once opted in (383.3.a.1) |
 * | `may-at-resolution`    | a "you may" / "pay X to" that is NOT the first part of the effect | RES (383.3.a.3) | RES (204.3.b, 740.4.a.2.a) |
 * | `none`                 | no optional part                                                 | —       | —                |
 */

export type OptionalKind =
  | "cost-at-finalization"
  | "may-at-finalization"
  | "may-at-resolution"
  | "none";

interface AbilityLike {
  readonly optional?: boolean;
  readonly condition?: unknown;
  readonly effect?: unknown;
}

/** The `{ type: "pay-cost", cost }` clause of a trigger condition (top level or inside an `and`). */
export function payCostOf(condition: unknown): Record<string, unknown> | undefined {
  if (!condition || typeof condition !== "object") {
    return undefined;
  }
  const c = condition as { type?: string; cost?: unknown; conditions?: unknown[] };
  if (c.cost && typeof c.cost === "object") {
    return c.cost as Record<string, unknown>;
  }
  if (c.type === "and" && Array.isArray(c.conditions)) {
    for (const sub of c.conditions) {
      const found = payCostOf(sub);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

/** The first instruction of an effect (a sequence's first step, else the effect itself). */
export function leadInstruction(effect: unknown): Record<string, unknown> | undefined {
  if (!effect || typeof effect !== "object") {
    return undefined;
  }
  const e = effect as { type?: string; effects?: unknown[] };
  if (e.type === "sequence" && Array.isArray(e.effects)) {
    return e.effects[0] as Record<string, unknown> | undefined;
  }
  return effect as Record<string, unknown>;
}

/** rule 383.3.b — a cost written INSIDE the first instruction ("Recycle me to …", "spend 3 XP to …"). */
export function hasLeadCostStep(effect: unknown): boolean {
  return leadInstruction(effect)?.costStep === true;
}

/**
 * rule 383.3.a.3 / 204.3.b — an optional or pay-to part somewhere in the effect
 * that is NOT its first part: decided (and paid) as the ability resolves.
 */
export function hasResolutionTimeOption(effect: unknown, depth = 0): boolean {
  if (!effect || typeof effect !== "object" || depth > 6) {
    return false;
  }
  const e = effect as {
    type?: string;
    optional?: unknown;
    pickCost?: unknown;
    condition?: { type?: string };
    effects?: unknown[];
    then?: unknown;
    else?: unknown;
    effect?: unknown;
  };
  if (e.type === "optional" || e.optional === true || e.pickCost !== undefined) {
    return true;
  }
  if (e.type === "conditional" && e.condition?.type === "pay-cost") {
    return true;
  }
  const nested = [
    ...(Array.isArray(e.effects) ? e.effects : []),
    ...[e.then, e.else, e.effect].filter((x) => x !== undefined && typeof x === "object"),
  ];
  return nested.some((n) => hasResolutionTimeOption(n, depth + 1));
}

/**
 * Classify a triggered ability payload. A leading "you may" (`optional`) or a
 * base cost (`pay-cost` condition / lead `costStep`) is a FINALIZATION matter;
 * anything optional that only appears deeper in the effect is a RESOLUTION
 * matter. (An ability can have both — Kha'Zix "you may spend 3 XP to deal …"
 * is `cost-at-finalization`; its payoff has no further option.)
 */
export function optionalKind(ability: AbilityLike | undefined): OptionalKind {
  if (!ability) {
    return "none";
  }
  if (payCostOf(ability.condition) !== undefined || hasLeadCostStep(ability.effect)) {
    return "cost-at-finalization";
  }
  if (ability.optional === true) {
    return "may-at-finalization";
  }
  if (hasResolutionTimeOption(ability.effect)) {
    return "may-at-resolution";
  }
  return "none";
}

/** True when the controller answers a Yes/No while the item is FINALIZED (both finalization kinds). */
export function decidedAtFinalization(kind: OptionalKind): boolean {
  return kind === "cost-at-finalization" || kind === "may-at-finalization";
}
