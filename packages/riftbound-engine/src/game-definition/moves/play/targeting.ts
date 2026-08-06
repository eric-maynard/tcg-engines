/**
 * Spell/ability target-legality helpers (split from cards.ts).
 * Leaf module: must not import move defs.
 */

import { resolveTarget } from "../../../abilities/target-resolver";

export type SpellEffectTargetDescriptor =
  | string
  | {
      type: string;
      quantity?: number | "all" | "any" | { upTo?: number; atLeast?: number };
    };

export type SpellEffectTargetShape = {
  type?: string;
  target?: SpellEffectTargetDescriptor;
  target1?: SpellEffectTargetDescriptor;
  target2?: SpellEffectTargetDescriptor;
  // rule-id: ven-083-166 — `fight` effects carry attacker/defender descriptors.
  attacker?: SpellEffectTargetDescriptor;
  defender?: SpellEffectTargetDescriptor;
  amount?: { might?: SpellEffectTargetDescriptor | string };
  /** rule-id: unl-107-219 — caster-chosen Might-reference unit for a criteria move. */
  reference?: SpellEffectTargetDescriptor;
  player?: string;
  options?: { effect?: SpellEffectTargetShape }[];
  effects?: SpellEffectTargetShape[];
};

/**
 * Rule 355.8 / 355.14.a (unl-192-219 Alpha Strike): an `amount:{might:<selector>}`
 * expression whose selector is a board descriptor names a caster-chosen standard
 * target even though it appears as an amount, not as `effect.target`. Surface it
 * so play-time enumeration binds it to the chain item.
 */
export function findAmountReferenceTarget(
  effect: SpellEffectTargetShape | undefined,
): SpellEffectTargetDescriptor | undefined {
  if (!effect) return undefined;
  const ref = effect.amount?.might;
  if (ref && typeof ref !== "string") return ref;
  // rule-id: unl-107-219 — an explicit `reference` descriptor (Might comparand
  // for a criteria-based move) is likewise a caster-chosen play-time target.
  if (effect.reference && typeof effect.reference !== "string") return effect.reference;
  if (effect.type === "sequence" && Array.isArray(effect.effects)) {
    for (const sub of effect.effects) {
      const found = findAmountReferenceTarget(sub);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * rule-id: sfd-017-221 / ogn-213-298 (rule 355.8) — a `sequence` spell ("Kill a
 * unit at a battlefield. Its controller draws 2.") carries its caster-chosen
 * target on a sub-effect, not on the sequence itself. Surface that lead
 * descriptor so play-time enumeration offers one Play per legal candidate.
 * The sequence handler threads the bound choice to every step, so only lift
 * when every other targeted step is an anaphoric restatement of the lead
 * ("it": same keys, no conflicting values) or a `pending-value` back-reference.
 */
export function findSequenceLeadTarget(
  effect: SpellEffectTargetShape | undefined,
): SpellEffectTargetDescriptor | undefined {
  if (effect?.type !== "sequence" || !Array.isArray(effect.effects)) return undefined;
  let lead: Exclude<SpellEffectTargetDescriptor, string> | undefined;
  for (const sub of effect.effects) {
    const t = sub?.target;
    if (t === undefined) continue;
    if (typeof t === "string") return undefined;
    if (t.type === "pending-value") continue;
    if (!lead) {
      lead = t;
      continue;
    }
    const leadRec = lead as Record<string, unknown>;
    for (const [k, v] of Object.entries(t as Record<string, unknown>)) {
      if (JSON.stringify(leadRec[k]) !== JSON.stringify(v)) return undefined;
    }
  }
  return lead;
}

/**
 * Rule 355.14.b/c / 355.15 (unl-192-219 Alpha Strike): a `damage` effect with
 * `split: true` names caster-chosen split targets that are locked at
 * finalization alongside the might-reference target. Surface the split
 * effect's enemy target descriptor so play-time enumeration can bind them.
 */
export function findSplitDamageEffect(
  effect: SpellEffectTargetShape | undefined,
): SpellEffectTargetShape | undefined {
  if (!effect) return undefined;
  if (effect.type === "damage" && (effect as { split?: boolean }).split === true) {
    return effect;
  }
  if (effect.type === "sequence" && Array.isArray(effect.effects)) {
    for (const sub of effect.effects) {
      const found = findSplitDamageEffect(sub);
      if (found) return found;
    }
  }
  return undefined;
}

export function enumerateSubsetsUpTo(pool: string[], maxSize: number): string[][] {
  const out: string[][] = [[]];
  const limit = Math.min(maxSize, pool.length);
  const walk = (start: number, chosen: string[]) => {
    if (chosen.length === limit) return;
    for (let i = start; i < pool.length; i++) {
      const next = [...chosen, pool[i]];
      out.push(next);
      walk(i + 1, next);
    }
  };
  walk(0, []);
  return out;
}

/**
 * Rule 355.8 / 419.2.a: a spell is a legal Play only if valid choices exist for
 * every caster-chosen target. For a modal (`choice`) effect the caster picks one
 * mode, so the spell is legal iff at least one mode's targets can be satisfied.
 */
export function spellEffectHasLegalTargets(
  effect: SpellEffectTargetShape | undefined,
  ctx: Parameters<typeof resolveTarget>[1],
): boolean {
  if (!effect) {
    return true;
  }
  // Rule 355.8: modal spells — at least one option must have a valid target set.
  if (effect.type === "choice" && Array.isArray(effect.options)) {
    return effect.options.some((opt) => spellEffectHasLegalTargets(opt?.effect, ctx));
  }
  // Sequence effects: every sub-effect's targets must be satisfiable.
  if (effect.type === "sequence" && Array.isArray(effect.effects)) {
    return effect.effects.every((sub) => spellEffectHasLegalTargets(sub, ctx));
  }
  // Rule 355.10.d: "for each <criteria>" is a programmatic selection, not a
  // caster-chosen target — 355.8's ≥1-valid-target gate does not apply, and the
  // nested per-object effect binds to each selected object rather than a
  // caster-declared target. Zero matches is legal.
  if (effect.type === "for-each") {
    return true;
  }
  // Multi-target effects (swap-might etc.) carry target1/target2 alongside or
  // instead of `target`; every present descriptor must resolve non-empty.
  for (const tgt of [
    effect.target,
    effect.target1,
    effect.target2,
    effect.attacker,
    effect.defender,
  ]) {
    if (!targetDescriptorIsSatisfiable(tgt, effect.player, ctx)) {
      return false;
    }
  }
  // Rule 355.5.a / 358.3.a: per-player criteria-based instructions and
  // targetless effects impose no play-legality constraint.
  return true;
}

export function targetDescriptorIsSatisfiable(
  tgt: SpellEffectTargetDescriptor | undefined,
  player: string | undefined,
  ctx: Parameters<typeof resolveTarget>[1],
): boolean {
  if (!tgt) {
    return true;
  }
  // Legacy parser output: bare string "self".
  if (typeof tgt === "string") {
    return true;
  }
  // Self / player / battlefield are not caster-chosen board targets.
  if (tgt.type === "self" || tgt.type === "player" || tgt.type === "battlefield" || player) {
    return true;
  }
  // Rule 355.10.d: quantity:"all" selects programmatically — those objects are
  // not caster-chosen targets, so 355.8's ≥1-valid-target gate does not apply.
  // Rule 355.13 / 419.2.a: "up to N" / "any" permits choosing zero targets.
  const qty = tgt.quantity;
  const zeroTargetsLegal =
    qty === "all" ||
    qty === "any" ||
    (typeof qty === "object" && qty.upTo !== undefined && qty.atLeast === undefined);
  if (zeroTargetsLegal) {
    return true;
  }
  const resolved = resolveTarget(
    tgt as {
      type: string;
      controller?: "friendly" | "enemy" | "any";
      location?: string;
      quantity?: number | "all";
    },
    ctx,
  );
  return resolved.length > 0;
}
