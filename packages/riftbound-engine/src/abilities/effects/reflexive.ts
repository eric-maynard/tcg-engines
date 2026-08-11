// Effect handler: "reflexive"
import { addToChain, createInteractionState } from "../../chain";
import type { RiftboundGameState } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, lethallyDamagedBoundIds } from "./_helpers";

/**
 * rule 387 / 388 — Reflexive Trigger ("[Then] [you may] do this[ N times]: …").
 * The instruction is NOT carried out inline: when the effect it follows
 * resolves, a new triggered ability is created and added to the Chain as a
 * Pending Item (388.1) — N items, in order, for "N times" (387.1.a / 388.2).
 * The item is finalized like any trigger (rule 402: its controller chooses its
 * targets / answers a leading "you may" before anyone gets Priority — see
 * `trigger-finalization.ts`), and every opponent receives Priority before it
 * resolves. Source = the card whose text this is; controller = the player
 * resolving that text.
 *
 * Referents that only exist during THIS resolution are frozen into the queued
 * effect (rule 359.3.e.14 — "ready up to two of THEM" means the objects the
 * main instruction produced, never a later board scan): a `pending-value`
 * target becomes an id-linked descriptor and `trigger-source` keeps pointing at
 * the firing event's subject. Its own targets are chosen when it is finalized.
 */
export function handle_reflexive(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const node = effect as unknown as {
    effect?: ExecutableEffect;
    killGuard?: boolean;
    optional?: boolean;
    times?: number;
  };
  const inner = node.effect;
  if (!inner) {
    return;
  }
  // rule 387 / 359.3.e.14 — the objects the MAIN instruction just produced are
  // this body's referents: a sequence hands them over as `pendingSequenceValue`,
  // a "move …, then do this" hands over the moved unit as the bound target.
  const pending =
    (ctx as { pendingSequenceValue?: readonly string[] }).pendingSequenceValue ?? ctx.boundTargets;
  // The effect node reaches here as part of a chain item (an immer draft) —
  // snapshot to plain data before it is stored on a new item.
  const frozen = bindReferents(
    JSON.parse(JSON.stringify(inner)) as ExecutableEffect,
    pending,
    ctx.sameZone,
  );
  // rule 372 / 370.1.a.1 (rule-id: ogn-005-298 × ogn-269-298 The Boss) — "If
  // this kills it, do this: …" queues this item while the lethally damaged unit
  // is still on the board: the rule 520 death, and any optional "you may pay …
  // instead" replacement answering it, happen after this instruction. So the
  // kill test travels with the item, stamped with the units it was about to
  // kill; a unit whose death was replaced is alive when the item resolves and
  // the body does nothing.
  const guarded = node.killGuard === true ? guardOnKill(frozen, ctx) : frozen;
  const times = Math.max(0, Math.floor(node.times ?? 1));
  const turnOrder = Object.keys(ctx.draft.players ?? {});
  const draft = ctx.draft as RiftboundGameState & {
    interaction: NonNullable<RiftboundGameState["interaction"]>;
  };
  for (let i = 0; i < times; i++) {
    draft.interaction = addToChain(
      ctx.draft.interaction ?? createInteractionState(),
      {
        cardId: ctx.sourceCardId,
        controller: ctx.playerId,
        effect: guarded,
        ...(node.optional === true ? { optional: true } : {}),
        // rule 388.1 / 337.1 — a Pending Item until the finalization dialog
        // (run by the move wrapper once this resolution has finished) has
        // asked its questions.
        status: "pending",
        // "it" inside the reflexive text still names the firing event's subject.
        ...(ctx.triggerSourceId !== undefined
          ? { triggerEvent: { cardId: ctx.triggerSourceId, type: "reflexive" } }
          : {}),
        triggered: true,
        type: "ability",
      },
      turnOrder,
    );
  }
}

/** Wrap a queued body in the deferred "did this actually kill them" re-check. */
function guardOnKill(body: ExecutableEffect, ctx: EffectContext): ExecutableEffect {
  // rule 373 — stamp every lethally damaged target, including one a single-use
  // shield may yet save: which death it replaces is decided at the Cleanup, and
  // this stamped re-check reads the board once that is settled.
  const ids = lethallyDamagedBoundIds(ctx, { includeReplaced: true });
  if (ids.length === 0) {
    return body;
  }
  return {
    condition: { ids: [...ids], type: "this-kills-target" },
    then: body,
    type: "conditional",
  } as unknown as ExecutableEffect;
}

function referencesPendingValue(effect: unknown): boolean {
  if (!effect || typeof effect !== "object") {
    return false;
  }
  const obj = effect as Record<string, unknown>;
  if ((obj.target as { type?: string } | undefined)?.type === "pending-value") {
    return true;
  }
  return [obj.effect, obj.then, obj.else, ...(Array.isArray(obj.effects) ? obj.effects : [])].some(
    referencesPendingValue,
  );
}

/**
 * Rewrite every `pending-value` target into a board descriptor linked to the
 * produced ids (`filter.idIn`), keeping its quantity ("up to two of them").
 * With no pending value the link is empty, so the instruction finds nothing.
 */
function bindReferents(
  effect: ExecutableEffect,
  pending: readonly string[] | undefined,
  sameZone: string | undefined,
): ExecutableEffect {
  const walk = (node: unknown): unknown => {
    if (!node || typeof node !== "object") {
      return node;
    }
    if (Array.isArray(node)) {
      return node.map(walk);
    }
    const obj = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "target" && (value as { type?: string } | undefined)?.type === "pending-value") {
        const { type: _t, ...rest } = value as Record<string, unknown>;
        out.target = { ...rest, filter: { idIn: [...(pending ?? [])] }, type: "permanent" };
        continue;
      }
      // rule-id: ogn-258-298 (rule 387) — "THEY deal damage to each other": the
      // fight's attacker is the unit the main instruction moved, a fixed
      // referent and never a choice, so it freezes to that bare id (leaving the
      // defender as the item's only caster-chosen Game Object, rule 402.2).
      if (key === "attacker" && (value as { type?: string } | undefined)?.type === "pending-value") {
        const fixed = pending?.[0];
        if (fixed !== undefined) {
          out.attacker = fixed;
          continue;
        }
      }
      if (isFrozenDescriptor(value)) {
        out[key] = freezeAnchor(value as Record<string, unknown>, pending, sameZone);
        continue;
      }
      out[key] = key === "effect" || key === "then" || key === "else" || key === "effects" ? walk(value) : value;
    }
    return out;
  };
  return referencesPendingValue(effect) || sameZone !== undefined
    ? (walk(effect) as ExecutableEffect)
    : effect;
}

/** A target descriptor whose wording is anchored on the main instruction's result. */
function isFrozenDescriptor(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const d = value as { location?: unknown; excludeSelf?: unknown };
  return d.location === "same" || d.excludeSelf === true;
}

/**
 * rule 387 / 359.3.e.14 — "another enemy unit AT ITS DESTINATION" is read once,
 * as the item is queued: pin the produced object's zone and exclude the object
 * itself, so the choice offered at finalization is exactly the units that stood
 * with it then.
 */
function freezeAnchor(
  descriptor: Record<string, unknown>,
  pending: readonly string[] | undefined,
  sameZone: string | undefined,
): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  let anchored = descriptor;
  if (descriptor.location === "same" && sameZone !== undefined) {
    extra.zoneIn = [sameZone];
    // rule 140 (rule-id: ogn-258-298) — the wording is spent once the zone is
    // pinned: keeping `location:"same"` re-applies its "at a battlefield"
    // reading at finalization and would lose a destination that is a base.
    const { location: _spent, ...rest } = descriptor;
    anchored = rest;
  }
  if (descriptor.excludeSelf === true && pending !== undefined && pending.length > 0) {
    extra.idNotIn = [...pending];
  }
  if (Object.keys(extra).length === 0) {
    return descriptor;
  }
  const existing = anchored.filter;
  const filters = existing === undefined ? [] : Array.isArray(existing) ? [...existing] : [existing];
  return { ...anchored, filter: [...filters, extra] };
}
