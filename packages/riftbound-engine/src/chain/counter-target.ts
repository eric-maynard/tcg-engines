/**
 * Counter-target legality — shared by the play-time gate/enumerator
 * (rule 355.8) and the `counter` effect handler so all three agree on which
 * chain items a given counter effect may hit.
 */

import { getGlobalCardRegistry } from "../operations/card-lookup";
import type { ChainItem } from "./chain-state";

type Comparison = { eq?: number; lt?: number; lte?: number; gt?: number; gte?: number };
type CounterTargetObject = { type?: string; controller?: string; filter?: unknown };
type ChoosesDescriptor = { type?: string; types?: readonly string[]; controller?: string };

/**
 * rule 355.9.b (sfd-045-221) — "enemy"/"friendly" qualifiers on a counter's
 * target (and on the objects that target *chooses*) are relative to the
 * COUNTER's controller, so the legality check needs to know who is countering
 * and who controls each chosen object.
 */
export interface CounterTargetContext {
  readonly controllerOf: (id: string) => string | undefined;
  readonly playerId?: string;
}

/** Descriptor shapes a counter's `filter.chooses` may name (`types` array or a `type` alias). */
const CHOOSES_TYPES: Record<string, readonly string[]> = {
  "gear": ["gear"],
  "permanent": ["unit", "gear"],
  "unit": ["unit"],
  "unit-or-gear": ["unit", "gear"],
};

function wantedKinds(chooses: ChoosesDescriptor): readonly string[] {
  if (Array.isArray(chooses.types) && chooses.types.length > 0) return chooses.types;
  return CHOOSES_TYPES[chooses.type ?? "unit"] ?? [chooses.type ?? "unit"];
}

function within(value: number, cmp: unknown): boolean {
  if (typeof cmp !== "object" || cmp === null) return true;
  const c = cmp as Comparison;
  if (c.eq !== undefined && value !== c.eq) return false;
  if (c.lt !== undefined && !(value < c.lt)) return false;
  if (c.lte !== undefined && !(value <= c.lte)) return false;
  if (c.gt !== undefined && !(value > c.gt)) return false;
  if (c.gte !== undefined && !(value >= c.gte)) return false;
  return true;
}

/** True when the counter effect only hits spells (not abilities). */
export function counterWantsSpell(effect: { target?: unknown } | undefined): boolean {
  const tgt = effect?.target;
  return (
    tgt === undefined ||
    tgt === "spell" ||
    (typeof tgt === "object" && tgt !== null && (tgt as CounterTargetObject).type === "spell")
  );
}

/**
 * rule 355.5 — a triggered/activated ability whose Game Object is chosen on
 * resolution still "chooses" prospectively while it sits on the chain. Read the
 * single caster-chosen target descriptor off the item's effect (top level or the
 * first such step of a sequence); mass effects (`quantity: "all"`) and fixed
 * referents choose nothing.
 */
function prospectiveTarget(effect: unknown): { type?: unknown; controller?: unknown } | undefined {
  if (typeof effect !== "object" || effect === null) return undefined;
  const e = effect as { type?: string; target?: unknown; effects?: unknown[] };
  if (e.type === "sequence" && Array.isArray(e.effects)) {
    for (const step of e.effects) {
      const t = prospectiveTarget(step);
      if (t) return t;
    }
    return undefined;
  }
  const t = e.target as { type?: unknown; quantity?: unknown; controller?: unknown } | undefined;
  if (typeof t !== "object" || t === null || typeof t.type !== "string") return undefined;
  if (["self", "trigger-source", "player", "battlefield"].includes(t.type)) return undefined;
  if (t.quantity !== undefined && t.quantity !== 1) return undefined;
  return t;
}

/**
 * rule 355.9.b (sfd-045-221) — "…that chooses a friendly unit or gear": the
 * candidate chain item must have locked in at least one target that is an
 * object of the named kind AND stands in the named relation to the counter's
 * controller. An ability item that has locked nothing yet (engine convention:
 * a lone trigger picks on resolution) is judged prospectively (rule 355.5) —
 * it matches when its effect WOULD choose an object of the named kind that can
 * stand in the named relation.
 */
function itemChoosesMatching(
  chooses: ChoosesDescriptor,
  item: ChainItem,
  ctx: CounterTargetContext | undefined,
): boolean {
  const wanted = wantedKinds(chooses);
  const registry = getGlobalCardRegistry();
  const locked = item.targets ?? [];
  if (locked.length === 0 && item.type === "ability") {
    const t = prospectiveTarget(item.effect);
    if (!t) return false;
    const kinds = CHOOSES_TYPES[t.type as string] ?? [t.type as string];
    if (!kinds.some((k) => wanted.includes(k))) return false;
    if (chooses.controller === undefined || t.controller === undefined) return true;
    // The effect's "friendly"/"enemy" is relative to the ITEM's controller;
    // `chooses.controller` is relative to the counter's controller.
    const sameSide = ctx?.playerId !== undefined && item.controller === ctx.playerId;
    const effectPicksCounterSide = t.controller === (sameSide ? "friendly" : "enemy");
    return chooses.controller === "friendly" ? effectPicksCounterSide : !effectPicksCounterSide;
  }
  return locked.some((id) => {
    if (!wanted.includes(registry.getCardType(id) ?? "")) return false;
    if (chooses.controller === undefined) return true;
    const owner = ctx?.controllerOf(id);
    if (owner === undefined || ctx?.playerId === undefined) return false;
    return chooses.controller === "friendly" ? owner === ctx.playerId : owner !== ctx.playerId;
  });
}

/**
 * Whether `item` is a legal target for `effect` (a `counter` effect).
 * `sourceCardId` excludes the countering spell itself.
 */
export function isLegalCounterTarget(
  effect: { target?: unknown } | undefined,
  item: ChainItem | undefined,
  sourceCardId?: string,
  ctx?: CounterTargetContext,
): boolean {
  if (!item || item.countered) return false;
  if (sourceCardId !== undefined && item.cardId === sourceCardId) return false;
  if (counterWantsSpell(effect) && item.type !== "spell") return false;
  const tgt = effect?.target;
  if (typeof tgt === "object" && tgt !== null) {
    // rule 355.9.b — "an ENEMY spell or ability": relative to the counter's controller.
    const ctrl = (tgt as CounterTargetObject).controller;
    if (ctrl !== undefined && ctx?.playerId !== undefined) {
      const friendly = item.controller === ctx.playerId;
      if (ctrl === "friendly" ? !friendly : friendly) return false;
    }
    const raw = (tgt as CounterTargetObject).filter;
    const filters = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
    const registry = getGlobalCardRegistry();
    for (const f of filters) {
      if (typeof f !== "object" || f === null) continue;
      // rule 206: cost restrictions read the target's printed cost, not what was paid.
      if ("energyCost" in f && !within(registry.getEnergyCost(item.cardId), (f as { energyCost: unknown }).energyCost)) {
        return false;
      }
      if ("cost" in f && !within(registry.getEnergyCost(item.cardId), (f as { cost: unknown }).cost)) {
        return false;
      }
      if ("powerCost" in f && !within(registry.getPowerCost(item.cardId).length, (f as { powerCost: unknown }).powerCost)) {
        return false;
      }
      // rule 355.9.b — "…that chooses a friendly unit or gear".
      const chooses = (f as { chooses?: unknown }).chooses;
      if (chooses !== undefined) {
        if (typeof chooses !== "object" || chooses === null) continue;
        if (!itemChoosesMatching(chooses as ChoosesDescriptor, item, ctx)) return false;
      }
    }
  }
  return true;
}
