/**
 * Spell/ability target-legality helpers (split from cards.ts).
 * Leaf module: must not import move defs.
 */

import { isAllAtOneBattlefield, resolveTarget } from "../../../abilities/target-resolver";
import { isLegalCounterTarget } from "../../../chain/counter-target";

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
 * rule-id: ogn-254-298 (rule 355.8) — "Choose a unit. Kill it the next time it
 * takes damage this turn": a single-fire (`duration:"next"`) `replacement`
 * spell carries its caster-chosen unit on the nested `replacement.target`, not
 * on the effect itself. Surface it so play-time gating and enumeration bind it.
 * Turn-wide replacements ("When any unit takes damage this turn, kill it") are
 * criteria, not caster choices, so only `next` lifts.
 */
export function findReplacementChosenTarget(
  effect: SpellEffectTargetShape | undefined,
): SpellEffectTargetDescriptor | undefined {
  if (effect?.type !== "replacement" || effect.target !== undefined) return undefined;
  const r = effect as {
    duration?: string;
    replacement?: { target?: SpellEffectTargetDescriptor } | string;
  };
  if (r.duration !== "next" || !r.replacement || typeof r.replacement === "string") {
    return undefined;
  }
  const t = r.replacement.target;
  if (!t || typeof t === "string") return undefined;
  if (t.type === "self" || t.type === "pending-value" || t.type === "trigger-source") {
    return undefined;
  }
  return t;
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
  const slots = collectSequenceTargetSlots(effect);
  if (slots?.length === 1) return slots[0];
  // rule-id: ogn-266-298 (rule 355.8) — "Choose a battlefield. …friendly
  // units there… enemy units there…": several all-at-one-battlefield steps
  // share ONE play-time battlefield choice, so the first names it.
  if (slots && slots.length > 1 && slots.every((s) => isAllAtOneBattlefield(s))) {
    return slots[0];
  }
  return undefined;
}

type SlotDescriptor = Exclude<SpellEffectTargetDescriptor, string>;

/** True when `t` is an anaphoric restatement of `slot` (no conflicting keys). */
export function isRestatementOf(slot: SlotDescriptor, t: SlotDescriptor): boolean {
  const rec = slot as Record<string, unknown>;
  for (const [k, v] of Object.entries(t as Record<string, unknown>)) {
    if (JSON.stringify(rec[k]) !== JSON.stringify(v)) return false;
  }
  return true;
}

/**
 * rule-id: sfd-200-221 (rule 355.8) — a sequence may name MORE than one
 * caster-chosen card target ("Banish a friendly unit, then its owner plays
 * it… Deal 3 to an enemy unit at a battlefield. Banish this."). Flatten
 * nested sequences in text order and return each distinct card descriptor
 * once (slot 0 is the lead); restatements of an earlier slot share it.
 * `self` / `pending-value` back-references are never caster-chosen. Returns
 * undefined when a step carries an opaque string target other than "self".
 */
export function collectSequenceTargetSlots(
  effect: SpellEffectTargetShape | undefined,
): SlotDescriptor[] | undefined {
  if (effect?.type !== "sequence" || !Array.isArray(effect.effects)) return undefined;
  const slots: SlotDescriptor[] = [];
  const walk = (effects: SpellEffectTargetShape[]): boolean => {
    for (const sub of effects) {
      if (sub?.type === "sequence" && Array.isArray(sub.effects)) {
        if (!walk(sub.effects)) return false;
        continue;
      }
      const t = sub?.target;
      if (t === undefined) continue;
      if (typeof t === "string") {
        if (t === "self") continue;
        return false;
      }
      if (t.type === "pending-value" || t.type === "self") continue;
      if (slots.some((s) => isRestatementOf(s, t))) continue;
      slots.push(t);
    }
    return true;
  };
  return walk(effect.effects) ? slots : undefined;
}

/**
 * rule-id: ogn-029-298 (rule 355.8) — a spell printed as several separate
 * instructions ("Deal 3 to a unit. Deal 3 to a unit.") is enriched into ONE
 * `sequence` flagged `independentTargets`. Unlike `collectSequenceTargetSlots`
 * identical descriptors are NOT merged: every step naming a single
 * caster-chosen card is its own positional slot (the same card may be picked
 * for more than one slot — no "another"). Returns undefined for other effects.
 */
export function collectIndependentTargetSlots(
  effect: SpellEffectTargetShape | undefined,
): { index: number; target: SlotDescriptor }[] | undefined {
  if (
    effect?.type !== "sequence" ||
    !Array.isArray(effect.effects) ||
    (effect as { independentTargets?: boolean }).independentTargets !== true
  ) {
    return undefined;
  }
  const slots: { index: number; target: SlotDescriptor }[] = [];
  effect.effects.forEach((sub, index) => {
    const t = sub?.target;
    if (!t || typeof t === "string") return;
    if (
      t.type === "self" ||
      t.type === "player" ||
      t.type === "battlefield" ||
      t.type === "pending-value" ||
      t.type === "trigger-source"
    ) {
      return;
    }
    if (t.quantity !== undefined && t.quantity !== 1) return;
    if (sub.type === "damage" && (sub as { split?: boolean }).split === true) return;
    slots.push({ index, target: t });
  });
  return slots;
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

/**
 * rule-id: ogn-256-298 (Fox-Fire) — aggregate legality of a multi-target pick
 * set ("any number of units at a battlefield with total Might 4 or less"):
 * "at a battlefield" (singular) pins every pick to ONE battlefield zone, and
 * `totalMight: { lte|lt: N }` caps the summed Might of the whole set.
 */
export function isLegalMultiTargetSet(
  tgt: { location?: string; totalMight?: { lte?: number; lt?: number } } | undefined,
  ids: readonly string[],
  ctx: { getCardZone: (id: string) => string | undefined; getMight: (id: string) => number },
): boolean {
  if (!tgt || ids.length === 0) return true;
  if (tgt.location === "battlefield" || tgt.location === "here") {
    const zone = ctx.getCardZone(ids[0] as string);
    if (!ids.every((id) => ctx.getCardZone(id) === zone)) return false;
  }
  const cap = tgt.totalMight;
  if (cap && (cap.lte !== undefined || cap.lt !== undefined)) {
    let sum = 0;
    for (const id of ids) sum += ctx.getMight(id);
    if (cap.lte !== undefined && !(sum <= cap.lte)) return false;
    if (cap.lt !== undefined && !(sum < cap.lt)) return false;
  }
  return true;
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
    if (!effect.effects.every((sub) => spellEffectHasLegalTargets(sub, ctx))) {
      return false;
    }
    // rule-id: ogn-220-298 (rule 355.8) — "… and an enemy unit at the same
    // battlefield": some lead candidate's battlefield must also hold a legal
    // (distinct) target for the `location: "same"` step.
    const sameSub = effect.effects.find(
      (s) => typeof s?.target === "object" && (s.target as { location?: string }).location === "same",
    );
    const leadSub = effect.effects.find(
      (s) =>
        typeof s?.target === "object" &&
        s.target.type !== "pending-value" &&
        (s.target as { location?: string }).location !== "same",
    );
    if (sameSub && leadSub) {
      type Desc = Exclude<Parameters<typeof resolveTarget>[0], string | undefined>;
      const leads = resolveTarget({ ...(leadSub.target as Desc), quantity: "all" }, ctx);
      return leads.some((id) => {
        const zone = ctx.zones.getCardZone(id as Parameters<typeof ctx.zones.getCardZone>[0]);
        return (
          zone !== undefined &&
          resolveTarget(
            { ...(sameSub.target as Desc), quantity: "all" },
            { ...ctx, sameZone: zone },
          ).some((o) => o !== id)
        );
      });
    }
    return true;
  }
  // Rule 355.10.d: "for each <criteria>" is a programmatic selection, not a
  // caster-chosen target — 355.8's ≥1-valid-target gate does not apply, and the
  // nested per-object effect binds to each selected object rather than a
  // caster-declared target. Zero matches is legal.
  if (effect.type === "for-each") {
    return true;
  }
  // rule-id: unl-131-219 (rule 355.8) — "Counter a spell" targets a spell on
  // the chain; with no un-countered spell pending there is no valid choice, so
  // the play is illegal (the counter would otherwise silently no-op).
  if (effect.type === "counter") {
    const items = ctx.draft.interaction?.chain?.items ?? [];
    return items.some((item) => isLegalCounterTarget(effect, item));
  }
  // rule-id: ogn-080-298 (rule 355.6) — "Gain control of a spell" chooses a
  // spell on the chain; a spell exists as an object only there, so with no
  // pending spell the play has no legal choice and is illegal.
  if (effect.type === "gain-control-of-spell") {
    const items = ctx.draft.interaction?.chain?.items ?? [];
    return items.some((item) => item.type === "spell" && !item.countered);
  }
  // Multi-target effects (swap-might etc.) carry target1/target2 alongside or
  // instead of `target`; every present descriptor must resolve non-empty.
  for (const tgt of [
    effect.target,
    effect.target1,
    effect.target2,
    effect.attacker,
    effect.defender,
    // rule-id: ogn-254-298 — a "next time it…" replacement's chosen unit.
    findReplacementChosenTarget(effect),
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
  // rule-id: ogn-115-298 (rule 355.8) — a `pending-value` target names cards
  // produced earlier in the same resolution (revealed/banished cards), not a
  // board object chosen at play time, so it never gates castability.
  if (
    tgt.type === "self" ||
    tgt.type === "player" ||
    tgt.type === "battlefield" ||
    tgt.type === "pending-value" ||
    player
  ) {
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
