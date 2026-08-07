// Effect handler: "sequence"
import type { CardId as CoreCardId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import type { TargetDescriptor } from "../target-resolver";
import { isAllAtOneBattlefield, resolveTarget } from "../target-resolver";
import { type EffectHelpers, getTargetIds } from "./_helpers";
import { findSpendableBuff } from "./spend-buff";
import { canSpendXp } from "./spend-xp";
import {
  collectIndependentTargetSlots,
  collectSequenceTargetSlots,
  findAmountReferenceTarget,
  findSplitDamageEffect,
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
    independentExecution?: boolean;
    pendingValue?: { source: number };
  };
  // rule 820.2.a — a continuation parked behind a modal prompt is its OWN
  // execution and makes its own choices: it must not inherit the target the
  // prompt just picked, or a repeated modal effect would silently re-hit the
  // previous execution's target instead of prompting again.
  if (seq.independentExecution === true && ctx.boundTargets !== undefined) {
    const { boundTargets: _priorPick, ...rest } = ctx;
    ctx = rest as EffectContext;
  }
  if (seq.effects) {
    // rule-id: sfd-206-221 (rule 355.8) — "Choose a friendly unit and a
    // spell": the chain item the caster locked for a bare lead `counter` rides
    // alongside the board targets. Split it off so only the counter step sees
    // it and the remaining steps keep their own descriptor slots.
    const counterStepIdx = seq.effects.findIndex(
      (e) => e.type === "counter" && (e as { target?: unknown }).target === undefined,
    );
    let counterBoundId: string | undefined;
    if (counterStepIdx >= 0 && ctx.boundTargets && ctx.boundTargets.length > 1) {
      const chainItems = ctx.draft.interaction?.chain?.items ?? [];
      const at = ctx.boundTargets.findIndex((id) =>
        chainItems.some((it) => it !== undefined && it.cardId === id),
      );
      if (at >= 0) {
        counterBoundId = ctx.boundTargets[at] as string;
        ctx = { ...ctx, boundTargets: ctx.boundTargets.filter((_, k) => k !== at) };
      }
    }
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
    // rule-id: ogn-029-298 (rule 355.8) — repeated instructions each own a
    // POSITIONAL slot: identical descriptors must not be merged, and the same
    // card may fill more than one slot. A slot with no locked pick was never
    // chosen, so its instruction does nothing.
    const indepSlots =
      (seq as { independentTargets?: boolean }).independentTargets === true
        ? collectIndependentTargetSlots(seq as unknown as SpellEffectTargetShape)
        : undefined;
    let seqSlots = (ctx as { sequenceSlots?: SequenceSlots }).sequenceSlots;
    if (!seqSlots && !indepSlots && ctx.boundTargets && sameIdx < 0) {
      const slots = collectSequenceTargetSlots(seq as unknown as SpellEffectTargetShape);
      // rule-id: ogn-266-298 (rule 355.8) — "Choose a battlefield. …friendly
      // units there… enemy units there…": every all-at-one-battlefield step
      // shares the ONE chosen battlefield id, so leave it bound on the whole
      // sequence instead of routing it to the first slot only.
      const sharedBattlefield =
        slots !== undefined && slots.length > 0 && slots.every((s) => isAllAtOneBattlefield(s));
      if (slots && !sharedBattlefield && slots.length >= 2 && ctx.boundTargets.length <= slots.length) {
        seqSlots = { bound: ctx.boundTargets, slots: slots as Record<string, unknown>[] };
      }
      // rule-id: sfd-107-221 (rule 355.8 / 355.14.a) — a sequence that names a
      // Might-REFERENCE unit as well as its own target ("Choose an equipped
      // friendly unit. It deals damage equal to its Might to an enemy unit")
      // locks them as [reference, …slots]: the reference belongs to the amount
      // expression, so keep it out of the steps and hand each targeted step
      // only its own slot id.
      if (
        !seqSlots &&
        !sharedBattlefield &&
        slots !== undefined &&
        slots.length >= 1 &&
        ctx.boundTargets.length === slots.length + 1 &&
        findSplitDamageEffect(seq as unknown as SpellEffectTargetShape) === undefined &&
        findAmountReferenceTarget(seq as unknown as SpellEffectTargetShape) !== undefined &&
        slots.every((s) => (s as { quantity?: unknown }).quantity === undefined)
      ) {
        pending = [ctx.boundTargets[0] as string];
        seqSlots = {
          bound: ctx.boundTargets.slice(1),
          slots: slots as Record<string, unknown>[],
        };
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
    // rule-id: ogn-262-298 (rule 355.4) — "…move a friendly unit to THAT enemy
    // unit's battlefield": the destination step's zone comes from an earlier
    // step's chosen target, so capture that zone and thread it as `sameZone`.
    const destRefIdx = seq.effects.findIndex(
      (e) => (e as unknown as { to?: unknown }).to === "target-battlefield",
    );
    let destRefZone: string | undefined;
    let sameZone: string | undefined;
    let leadIds: string[] = [];
    let sameBound: string[] | undefined;
    let prevPerformed: boolean | undefined;
    for (let i = 0; i < seq.effects.length; i++) {
      const sub = seq.effects[i];
      // rule-id: ogn-147-298 — "spend a buff to buff me and ready me": the
      // spend-buff cost gates every remaining step, not just its own `then`.
      // rule 355.13 (ogn-153-298): an OPTIONAL spend-buff is not a cost, so it
      // never gates the steps after it ("Then buff all friendly units" happens
      // whether or not a buff was spent).
      if (
        sub.type === "spend-buff" &&
        (sub as { optional?: boolean }).optional !== true &&
        !findSpendableBuff(sub, ctx)
      ) {
        break;
      }
      // rule-id: unl-119-219 — "spend 3 XP to deal damage": an unpayable
      // spend-xp cost likewise gates every remaining step.
      if (sub.type === "spend-xp" && !canSpendXp(sub, ctx)) {
        break;
      }
      const subTarget = (sub as { target?: SubTarget }).target;
      let subCtx: EffectContext = ctx;
      // rule-id: sfd-206-221 — hand the locked chain item to the counter step.
      if (counterBoundId !== undefined && i === counterStepIdx) {
        const { boundTargets: _drop, ...rest } = ctx;
        subCtx = { ...rest, boundTargets: [counterBoundId] };
      }
      if (indepSlots) {
        const k = indepSlots.findIndex((s) => s.index === i);
        if (k >= 0) {
          const id = ctx.boundTargets?.[k];
          if (id === undefined) {
            continue;
          }
          const { boundTargets: _drop, ...rest } = ctx;
          subCtx = { ...rest, boundTargets: [id] };
        }
      }
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
        subTarget.type !== "self" &&
        // rule-id: ogn-200-298 — "all OTHER …" owns no slot of its own: it
        // keeps the earlier step's picks so it can exclude them.
        (subTarget as { excludeBound?: boolean }).excludeBound !== true
      ) {
        const j = seqSlots.slots.findIndex((s) =>
          isRestatementOf(s as { type: string }, subTarget as { type: string }),
        );
        const id = j >= 0 ? seqSlots.bound[j] : undefined;
        // rule 355.13 (rule-id: sfd-023-221) — an "up to N" slot the caster
        // left unchosen selects nothing; the step is skipped rather than
        // re-resolved from the board.
        if (j >= 0 && id === undefined) {
          const q = (seqSlots.slots[j] as { quantity?: { upTo?: number } }).quantity;
          if (typeof q === "object" && q !== null && q.upTo !== undefined) {
            continue;
          }
        }
        const { boundTargets: _drop, ...rest } = subCtx;
        subCtx = id !== undefined ? { ...rest, boundTargets: [id] } : rest;
      } else if (seqSlots && sub.type === "sequence") {
        subCtx = { ...subCtx, sequenceSlots: seqSlots } as EffectContext;
      }
      // Rule 354.2: a `pending-value` target references the card(s) resolved
      // by this sequence's `pendingValue.source` step — bind them explicitly
      // so target resolution never falls through to a board scan.
      // rule-id: sfd-024-221 — "Attach IT to me" names the pending value
      // through the step's `equipment` descriptor, not through `target`.
      const pvTarget = subTarget ?? ((sub as { equipment?: SubTarget }).equipment as SubTarget);
      if (
        pending &&
        pvTarget &&
        typeof pvTarget !== "string" &&
        pvTarget.type === "pending-value"
      ) {
        subCtx = { ...ctx, boundTargets: pending };
      }
      // rule-id: sfd-024-221 (rule 354.2) — a source step that PLAYS a card out
      // of a non-board zone has no resolvable target, so give it a sink and
      // take the pending value from what it actually played.
      let playedSink: { ids: string[] } | undefined;
      if (seq.pendingValue?.source === i) {
        pending = getTargetIds(sub, subCtx);
        subCtx = { ...subCtx, boundTargets: pending };
        if (pending.length === 0) {
          playedSink = { ids: [] };
          subCtx = { ...subCtx, playedSink } as EffectContext;
        }
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
      if (destRefIdx >= 0) {
        if (i < destRefIdx) {
          const refZone = getTargetIds(sub, subCtx)
            .map((id) => ctx.zones.getCardZone(id as CoreCardId))
            .find((z) => z?.startsWith("battlefield-") === true);
          if (refZone) {
            destRefZone = refZone;
          }
        } else if (i === destRefIdx) {
          subCtx = { ...subCtx, sameZone: destRefZone } as EffectContext;
        }
      }
      // rule-id: ogn-056-298 — "you may kill a gear. If you do, buff me": a
      // following `paid-additional-cost` conditional is satisfied when the
      // preceding bare action step actually had something to act on.
      if (
        prevPerformed !== undefined &&
        sub.type === "conditional" &&
        ["did-perform", "paid-additional-cost"].includes(
          (sub as { condition?: { type?: string } }).condition?.type ?? "",
        )
      ) {
        subCtx = { ...subCtx, ifYouDoPerformed: prevPerformed } as EffectContext;
      }
      // rule 355.13 (sfd-053-221 Janna, Savior) — "…, then move UP TO ONE enemy
      // unit here to its base": an "up to N" step inside a sequence is the
      // controller's own choice (zero is legal), so it must prompt instead of
      // silently auto-picking. The rest of the sequence rides on the prompt's
      // `then` so it still runs after the pick (or the decline).
      const upToN = (subTarget as { quantity?: { upTo?: number } } | undefined)?.quantity?.upTo;
      if (
        typeof subTarget === "object" &&
        typeof upToN === "number" &&
        subCtx.boundTargets === undefined &&
        ctx.draft.pendingChoice === undefined
      ) {
        const options = resolveTarget(
          { ...(subTarget as TargetDescriptor), quantity: "all" },
          { ...resolverCtx, choosing: true } as Parameters<typeof resolveTarget>[1],
        );
        if (options.length > 0) {
          const rest = seq.effects.slice(i + 1);
          ctx.draft.pendingChoice = {
            anyNumber: true,
            effect: sub,
            maxPicks: upToN,
            options,
            picked: [],
            playerId: ctx.playerId,
            remaining: Math.min(upToN, options.length),
            sourceCardId: ctx.sourceCardId,
            type: "choose-target",
            ...(rest.length > 0 ? { then: { effects: rest, type: "sequence" } } : {}),
          } as typeof ctx.draft.pendingChoice;
          return;
        }
      }
      prevPerformed =
        typeof subTarget === "object" &&
        subTarget.type !== "self" &&
        subTarget.type !== "player" &&
        sub.type !== "conditional" &&
        sub.type !== "optional" &&
        sub.type !== "sequence"
          ? getTargetIds(sub, subCtx).length > 0
          : undefined;
      executeEffect(
        sub,
        { ...subCtx, pendingSequenceValue: pending } as EffectContext,
      );
      if (playedSink !== undefined && playedSink.ids.length > 0) {
        pending = playedSink.ids;
      }
      // rule 355.8 / 820.2 (unl-182-219) — a step that parked a modal prompt
      // suspends the rest of the sequence: the later Repeat executions must
      // not run (and silently auto-pick modes) while the choice is pending.
      // They resume from the prompt's `then` once the mode is picked.
      const parked = ctx.draft.pendingChoice as
        | { type?: string; then?: unknown }
        | undefined;
      // rule 355.13 (ogn-153-298) — a `confirm` prompt suspends the rest too:
      // the later steps resume from the prompt's `then` after the answer.
      // rule 422.4 / 359.3.e (ogn-178-298) — so does a `reveal-and-pick`:
      // "Discard 2, THEN draw 2" must not draw while the discard is unanswered
      // (it would leak the drawn cards into the pick).
      if (
        (parked?.type === "choose-mode" ||
          parked?.type === "confirm" ||
          parked?.type === "reveal-and-pick") &&
        parked.then === undefined
      ) {
        const rest = seq.effects.slice(i + 1);
        if (rest.length > 0) {
          ctx.draft.pendingChoice = {
            ...(parked as object),
            then: { effects: rest, independentExecution: true, type: "sequence" },
            // The continuation is the REST OF THE SEQUENCE, not the prompt's
            // own follow-up: it must still run when an optional prompt is
            // declined ("you may [Predict], then reveal the top card").
            thenIsSequenceRest: true,
          } as typeof ctx.draft.pendingChoice;
        }
        return;
      }
    }
  }
}
