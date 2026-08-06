// Effect handler: "sequence"
import type { CardId as CoreCardId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import { type EffectHelpers, getTargetIds } from "./_helpers";
import { findSpendableBuff } from "./spend-buff";
import {
  collectSequenceTargetSlots,
  isRestatementOf,
  type SpellEffectTargetShape,
} from "../../game-definition/moves/play/targeting";

type SubTarget = { type?: string; location?: string } | string | undefined;

/**
 * rule-id: sfd-200-221 (rule 355.8) — play-time targets [lead, second, …]
 * indexed by the sequence's distinct card-descriptor slots; computed once at
 * the outermost sequence and threaded into nested ones.
 */
type SequenceSlots = {
  readonly slots: readonly Record<string, unknown>[];
  readonly bound: readonly string[];
};

const isSameLocationTarget = (t: SubTarget): boolean =>
  typeof t === "object" && t.location === "same";

const isLeadTarget = (t: SubTarget): boolean =>
  typeof t === "object" && t.type !== "pending-value" && t.location !== "same";

export function handle_sequence(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  const executeEffect = h.executeEffect;
  const seq = effect as unknown as {
    effects?: ExecutableEffect[];
    pendingValue?: { source: number };
  };
  if (seq.effects) {
    // Rule 354.2 / 309.1 / 323.6: seed from an enclosing sequence's captured
    // pending value so a nested `pending-value` reference still binds to the
    // banished card — Arcane Shift parses as [banish, [play-it, …]], and the
    // inner sequence has no `target` of its own, so without this seed the
    // play step fell through to a board scan and never added the pending
    // chain item that keeps the turn closed (rule 355.2 location choice).
    let pending: readonly string[] | undefined = (
      ctx as { pendingSequenceValue?: readonly string[] }
    ).pendingSequenceValue;
    // rule-id: ogn-220-298 — "Stun a friendly unit and an enemy unit at the
    // same battlefield": a later `location: "same"` step resolves against the
    // battlefield zone of the earlier step's chosen target.
    const sameIdx = seq.effects.findIndex((e) =>
      isSameLocationTarget((e as { target?: SubTarget }).target),
    );
    // rule-id: sfd-200-221 (rule 355.8) — when the chain item locked one id
    // per distinct card-descriptor slot ([friendly, enemy] for Arcane Shift),
    // each step receives only ITS slot's id instead of the whole list, and a
    // step whose slot was not locked re-resolves from the board.
    let seqSlots = (ctx as { sequenceSlots?: SequenceSlots }).sequenceSlots;
    if (!seqSlots && ctx.boundTargets && sameIdx < 0) {
      const slots = collectSequenceTargetSlots(seq as unknown as SpellEffectTargetShape);
      if (slots && slots.length >= 2 && ctx.boundTargets.length <= slots.length) {
        seqSlots = { bound: ctx.boundTargets, slots: slots as Record<string, unknown>[] };
      }
    }
    const resolverCtx = {
      cards: ctx.cards,
      draft: ctx.draft,
      playerId: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
      sourceZone: ctx.sourceZone,
      zones: ctx.zones,
    };
    let sameZone: string | undefined;
    let leadIds: string[] = [];
    let sameBound: string[] | undefined;
    for (let i = 0; i < seq.effects.length; i++) {
      const sub = seq.effects[i];
      // rule-id: ogn-147-298 — "spend a buff to buff me and ready me": the
      // spend-buff cost gates every remaining step, not just its own `then`.
      if (sub.type === "spend-buff" && !findSpendableBuff(sub, ctx)) {
        break;
      }
      const subTarget = (sub as { target?: SubTarget }).target;
      let subCtx: EffectContext = ctx;
      // rule-id: sfd-200-221 — "Banish this" / "…me": a self-referential step
      // never inherits the chain item's chosen targets.
      if (
        ctx.boundTargets &&
        (subTarget === "self" || (typeof subTarget === "object" && subTarget.type === "self"))
      ) {
        const { boundTargets: _drop, ...rest } = ctx;
        subCtx = rest;
      }
      // rule-id: sfd-200-221 (rule 355.8) — route each locked target to the
      // step whose descriptor slot it was chosen for.
      if (
        seqSlots &&
        typeof subTarget === "object" &&
        subTarget.type !== "pending-value" &&
        subTarget.type !== "self"
      ) {
        const j = seqSlots.slots.findIndex((s) =>
          isRestatementOf(s as { type: string }, subTarget as { type: string }),
        );
        const id = j >= 0 ? seqSlots.bound[j] : undefined;
        const { boundTargets: _drop, ...rest } = subCtx;
        subCtx = id !== undefined ? { ...rest, boundTargets: [id] } : rest;
      } else if (seqSlots && sub.type === "sequence") {
        subCtx = { ...subCtx, sequenceSlots: seqSlots } as EffectContext;
      }
      // Rule 354.2: a `pending-value` target references the card(s) resolved
      // by this sequence's `pendingValue.source` step — bind them explicitly
      // so target resolution never falls through to a board scan.
      if (
        pending &&
        subTarget &&
        typeof subTarget !== "string" &&
        subTarget.type === "pending-value"
      ) {
        subCtx = { ...ctx, boundTargets: pending };
      }
      if (seq.pendingValue?.source === i) {
        pending = getTargetIds(sub, subCtx);
        subCtx = { ...subCtx, boundTargets: pending };
      }
      if (sameIdx >= 0) {
        if (isSameLocationTarget(subTarget)) {
          // rule-id: ogn-220-298 — the "same" step names a distinct unit in
          // the lead's battlefield zone; no lead zone means no legal target.
          const desc = subTarget as TargetDescriptor;
          const pool = sameZone
            ? resolveTarget({ ...desc, quantity: "all" }, { ...resolverCtx, sameZone }).filter(
                (id) => !leadIds.includes(id),
              )
            : [];
          const q = desc.quantity;
          // rule-id: ogn-220-298 (rule 355.8) — a play-time bound "same" pick
          // wins over auto-selection; it must still be legal in the lead zone.
          const ids = sameBound
            ? sameBound.filter((id) => pool.includes(id))
            : q === "all"
              ? pool
              : pool.slice(0, typeof q === "number" ? q : 1);
          if (ids.length === 0) continue;
          const { boundTargets: _lead, ...rest } = subCtx;
          subCtx = { ...rest, boundTargets: ids, sameZone };
        } else if (isLeadTarget(subTarget) && i < sameIdx) {
          let ids = subCtx.boundTargets ? [...subCtx.boundTargets] : undefined;
          // rule-id: ogn-220-298 (rule 355.8) — play-time targets arrive as
          // [lead, same…]; split so each step affects only its own pick.
          if (ids && ids.length > 1) {
            sameBound = ids.slice(1);
            ids = [ids[0] as string];
            subCtx = { ...subCtx, boundTargets: ids };
          }
          if (!ids) {
            // rule-id: ogn-220-298 (rule 355.8) — an unbound lead must be a
            // unit whose battlefield also holds a legal "same" target.
            const sameTarget = (seq.effects[sameIdx] as { target?: TargetDescriptor }).target;
            const candidates = resolveTarget(
              { ...(subTarget as TargetDescriptor), quantity: "all" },
              resolverCtx,
            );
            const pick =
              candidates.find((id) => {
                const zone = ctx.zones.getCardZone(id as CoreCardId);
                return (
                  zone !== undefined &&
                  resolveTarget(
                    { ...(sameTarget as TargetDescriptor), quantity: "all" },
                    { ...resolverCtx, sameZone: zone },
                  ).some((o) => o !== id)
                );
              }) ?? candidates[0];
            ids = pick ? [pick] : [];
            if (pick) {
              subCtx = { ...subCtx, boundTargets: ids };
            }
          }
          leadIds = ids;
          const leadId = ids[0];
          sameZone = leadId ? ctx.zones.getCardZone(leadId as CoreCardId) : undefined;
        }
      }
      executeEffect(
        sub,
        { ...subCtx, pendingSequenceValue: pending } as EffectContext,
      );
    }
  }
}
