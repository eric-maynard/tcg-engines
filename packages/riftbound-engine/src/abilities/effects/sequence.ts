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
  /** A hole means that slot's locked pick became illegal before resolution. */
  readonly bound: readonly (string | undefined)[];
};

const isSameLocationTarget = (t: SubTarget): boolean =>
  typeof t === "object" && t.location === "same";

/**
 * rule 354.2 (rule-id: ven-139-166) — true when every remaining step of a
 * sequence names the SAME object the step just prompted for ("…move a friendly
 * unit in a showdown to base and if I'm [Empowered], ready IT"). Steps nested in
 * a `conditional` / `optional` / inner sequence are inspected too, since the
 * pronoun commonly sits inside the condition's branch. A step naming a
 * different descriptor (or the source itself) means the remainder chooses for
 * itself, so it must NOT inherit this pick.
 */
function remainderIsAnaphoric(
  rest: readonly ExecutableEffect[],
  lead: Record<string, unknown> | undefined,
): boolean {
  if (lead === undefined || typeof lead !== "object") {
    return false;
  }
  let sawRestatement = false;
  const walk = (effects: readonly unknown[]): boolean => {
    for (const raw of effects) {
      const sub = raw as
        | { effects?: unknown[]; effect?: unknown; else?: unknown; target?: SubTarget; then?: unknown }
        | undefined;
      if (sub === undefined || sub === null) continue;
      const t = sub.target;
      if (typeof t === "string") return false;
      if (t !== undefined) {
        const desc = t as Record<string, unknown>;
        const type = desc.type as string | undefined;
        if (type === "self" || type === "player" || type === "pending-value") {
          // names its own object, never this prompt's pick
        } else if (
          isRestatementOf(lead as { type: string }, desc as { type: string }) &&
          isRestatementOf(desc as { type: string }, lead as { type: string })
        ) {
          sawRestatement = true;
        } else {
          return false;
        }
      }
      const nested = [sub.then, sub.else, sub.effect].filter((x) => x !== undefined);
      if (nested.length > 0 && !walk(nested)) return false;
      if (Array.isArray(sub.effects) && !walk(sub.effects)) return false;
    }
    return true;
  };
  return walk(rest) && sawRestatement;
}

/**
 * rule 477.3.b — `increase-might-to`/`swap-might` whose `target1` is the source
 * itself: the single caster choice is `target2`, so the sequence prompts for it
 * like an ordinary `target` step and binds it as boundTargets[0].
 */
function isFixedFirstMightStep(sub: { type?: string; target1?: unknown }): boolean {
  if (sub.type !== "increase-might-to" && sub.type !== "swap-might") {
    return false;
  }
  const t1 = sub.target1;
  return t1 === undefined || t1 === "self" || (t1 as { type?: string })?.type === "self";
}

/** Descriptors that name a fixed referent — never a controller choice (rule 355.10). */
const PROMPTLESS_TARGET_TYPES: readonly string[] = [
  "self",
  "player",
  "battlefield",
  "pending-value",
  "trigger-source",
];

/** Steps that gather their own candidates (private zones, modes, nested shapes). */
const PROMPTLESS_STEP_TYPES: readonly string[] = [
  "choice",
  "conditional",
  "counter",
  "for-each",
  "optional",
  "play",
  "sequence",
];

/** "exhaust me" written as the first step of a sequence — rule 204.3.b cost form. */
const isSelfExhaustCost = (sub: { type?: string; target?: unknown }): boolean =>
  sub.type === "exhaust" &&
  (sub.target === "self" || (sub.target as { type?: string } | undefined)?.type === "self");

/** The source permanent is already exhausted, so an "exhaust me" cost is unpayable. */
function sourceIsExhausted(ctx: EffectContext): boolean {
  const meta = ctx.cards.getCardMeta?.(ctx.sourceCardId as CoreCardId) as
    | { exhausted?: boolean; __flags?: Record<string, boolean> }
    | undefined;
  return meta?.__flags?.exhausted === true || meta?.exhausted === true;
}

const isLeadTarget = (t: SubTarget): boolean =>
  typeof t === "object" && t.type !== "pending-value" && t.location !== "same";

/**
 * rule 355.10 (rule-id: unl-198-219) — the battlefield a sequence chooses.
 * Prefers a battlefield where the controller has units (the printed
 * restriction on every "choose a battlefield where you have units" card);
 * returns the `battlefield-<id>` zone, or undefined when none qualifies.
 */
function chooseSequenceBattlefield(
  target: TargetDescriptor,
  ctx: EffectContext,
  resolverCtx: Parameters<typeof resolveTarget>[1],
): string | undefined {
  const bound = ctx.boundTargets?.find((id) => ctx.draft.battlefields?.[id] !== undefined);
  const ids =
    bound !== undefined
      ? [bound]
      : (resolveTarget({ ...target, quantity: "all" }, resolverCtx) as string[]);
  const hasFriendlyUnits = (bfId: string): boolean =>
    ctx.zones.getCardsInZone(
      `battlefield-${bfId}` as CoreZoneId,
      ctx.playerId as Parameters<typeof ctx.zones.getCardsInZone>[1],
    ).length > 0;
  const chosen = ids.find(hasFriendlyUnits);
  return chosen === undefined ? undefined : `battlefield-${chosen}`;
}

export function handle_sequence(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  const executeEffect = h.executeEffect;
  const seq = effect as unknown as {
    boundTargetsOverride?: readonly string[];
    effects?: ExecutableEffect[];
    independentExecution?: boolean;
    pendingValue?: { source: number };
  };
  // rule 820.2.a (sfd-129-221) — a suspended Repeat remainder carries its own
  // slots' ids; whatever the prompt bound (the unit that just moved) is not
  // this execution's target.
  if (seq.boundTargetsOverride !== undefined) {
    ctx = { ...ctx, boundTargets: [...seq.boundTargetsOverride] } as EffectContext;
  }
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
    // rule 820.2.a (sfd-136-221) — repeated counters own one locked chain item
    // EACH (positional, below); that list must not be split as a lead pick.
    const repeatedCounterTargets =
      (seq as { independentTargets?: boolean }).independentTargets === true &&
      seq.effects.every(
        (e) => e.type === "counter" && (e as { target?: unknown }).target === undefined,
      ) &&
      ctx.boundTargets !== undefined &&
      ctx.boundTargets.length === seq.effects.length;
    if (!repeatedCounterTargets && counterStepIdx >= 0 && ctx.boundTargets && ctx.boundTargets.length > 1) {
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
      // rule 355.14.b (rule-id: unl-192-219) — a sequence containing a SPLIT
      // damage step owns a variable-length pick ([reference, …split targets]),
      // so its bound ids can never be sliced one-per-slot: hand them to the
      // steps whole and let the damage handler read the reference off index 0.
      const hasSplitDamage =
        findSplitDamageEffect(seq as unknown as SpellEffectTargetShape) !== undefined;
      if (
        slots &&
        !sharedBattlefield &&
        !hasSplitDamage &&
        slots.length >= 2 &&
        ctx.boundTargets.length <= slots.length
      ) {
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
    // rule 355.4 / 359.3.f.4 (rule-id: unl-198-219) — "Choose a battlefield
    // where you have units. … move … to that battlefield. Then give enemy
    // units THERE …": the sequence's own battlefield target is the referent
    // every later "here" reads, not the spell's own zone. Bind it once so the
    // move destination and the debuff both land at the chosen battlefield.
    const seqBattlefield = (effect as { target?: TargetDescriptor }).target;
    let boundBattlefieldZone: string | undefined;
    if (
      seqBattlefield !== undefined &&
      typeof seqBattlefield === "object" &&
      seqBattlefield.type === "battlefield"
    ) {
      const chosen = chooseSequenceBattlefield(seqBattlefield, ctx, resolverCtx);
      if (chosen !== undefined) {
        boundBattlefieldZone = chosen;
        ctx = { ...ctx, sourceZone: chosen } as EffectContext;
        resolverCtx.sourceZone = chosen;
      }
    }
    /**
     * rule 355.4 (rule-id: unl-198-219) — a step that parks a prompt resumes
     * from a context rebuilt off the SOURCE CARD's zone, which would lose the
     * chosen battlefield; carry it on the prompt so "there"/"here" still means
     * the battlefield the sequence chose.
     */
    const carryBattlefieldZone = (): void => {
      const parked = ctx.draft.pendingChoice as { sourceZone?: string } | undefined;
      if (boundBattlefieldZone !== undefined && parked && parked.sourceZone === undefined) {
        parked.sourceZone = boundBattlefieldZone;
      }
    };
    // rule 359.3.e.5 (rule-id: sfd-200-221) — a locked pick that became illegal
    // before resolution is dropped from the chain item's list, so POSITION no
    // longer identifies the slot ([friendly, enemy] with the friendly gone would
    // hand the enemy to the friendly step). Re-align each surviving id with the
    // slot whose descriptor it still satisfies and skip the vacated slot's step.
    const vacatedSlots = new Set<number>();
    if (seqSlots !== undefined && seqSlots.bound.length < seqSlots.slots.length) {
      const remaining = [...seqSlots.bound];
      const aligned = seqSlots.slots.map((slot, slotIdx) => {
        const pool = resolveTarget({ ...(slot as TargetDescriptor), quantity: "all" }, {
          ...resolverCtx,
          choosing: true,
        } as Parameters<typeof resolveTarget>[1]);
        const k = remaining.findIndex((id) => id !== undefined && pool.includes(id));
        if (k < 0) {
          vacatedSlots.add(slotIdx);
          return undefined;
        }
        return remaining.splice(k, 1)[0];
      });
      seqSlots = { bound: aligned, slots: seqSlots.slots };
    }
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
    /** Descriptor slot the current step consumed, so a suspended remainder keeps the later slots' picks. */
    let stepSlotIdx = -1;
    for (let i = 0; i < seq.effects.length; i++) {
      stepSlotIdx = -1;
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
      // rule 204.3.b (rule-id: unl-187-219) — "you may exhaust me TO <payoff>":
      // the leading self-exhaust is a COST, not an effect. An already-exhausted
      // source cannot pay it, so nothing after it happens.
      if (i === 0 && seq.effects.length > 1 && isSelfExhaustCost(sub) && sourceIsExhausted(ctx)) {
        break;
      }
      // rule 383.3.b (rule-id: ven-101-166) — "banish a card from any trash TO
      // give a unit [Assault 2]": a cost within instructions at the start of an
      // effect gates every remaining step. An unpayable cost (no card in any
      // trash) means nothing after it happens, so the step must not fall
      // through as a silent no-op and let the payoff resolve for free.
      // (A cost step naming no board object — "spend 3 XP to …" — is gated by
      // its own payability check above.)
      const costStepTarget = (sub as { target?: SubTarget }).target;
      if (
        (sub as { costStep?: boolean }).costStep === true &&
        typeof costStepTarget === "object" &&
        costStepTarget !== null
      ) {
        const payable = resolveTarget({ ...(costStepTarget as TargetDescriptor), quantity: "all" }, {
          ...resolverCtx,
          choosing: true,
        } as Parameters<typeof resolveTarget>[1]);
        if (payable.length === 0) {
          break;
        }
      }
      // rule 477.3.b (rule-id: ven-079-166) — a directional Might step
      // ("Increase MY Might to its Might, then …") names its only caster choice
      // in `target2`; without this the step would prompt on its own and drop
      // every later step of the sequence.
      const subTarget =
        (sub as { target?: SubTarget }).target ??
        (isFixedFirstMightStep(sub) ? (sub as { target2?: SubTarget }).target2 : undefined);
      let subCtx: EffectContext = ctx;
      // rule-id: sfd-206-221 — hand the locked chain item to the counter step.
      if (counterBoundId !== undefined && i === counterStepIdx) {
        const { boundTargets: _drop, ...rest } = ctx;
        subCtx = { ...rest, boundTargets: [counterBoundId] };
      }
      // rule 820.2.a (sfd-136-221) — a bare `counter` carries no target
      // descriptor, so it owns no descriptor slot: route the caster's i-th
      // locked chain item to the i-th execution.
      if (repeatedCounterTargets) {
        const id = ctx.boundTargets?.[i];
        const { boundTargets: _drop, ...rest } = ctx;
        subCtx = id !== undefined ? { ...rest, boundTargets: [id] } : rest;
      }
      if (indepSlots) {
        const k = indepSlots.findIndex((s) => s.index === i);
        if (k >= 0) {
          let id = ctx.boundTargets?.[k];
          // rule 355.8 (ogn-029-298) — every instruction that names a target
          // must choose one if a legal choice exists. A slot the caster left
          // unlocked at play time is chosen HERE (prompting when there is more
          // than one candidate) instead of being silently skipped; only
          // "up to"/"any number" slots (355.13) may end up with nothing.
          if (id === undefined) {
            const desc = indepSlots[k]?.target as TargetDescriptor | undefined;
            const q = (desc as { quantity?: { upTo?: number } } | undefined)?.quantity;
            const optional =
              typeof q === "object" && q !== null && (q as { upTo?: number }).upTo !== undefined;
            const options =
              desc === undefined || optional
                ? []
                : (resolveTarget({ ...desc, quantity: "all" }, {
                    ...resolverCtx,
                    choosing: true,
                  } as Parameters<typeof resolveTarget>[1]) as string[]);
            if (options.length === 0) {
              continue;
            }
            if (options.length > 1) {
              if (ctx.draft.pendingChoice !== undefined) {
                continue;
              }
              const rest = seq.effects.slice(i + 1);
              ctx.draft.pendingChoice = {
                effect: sub,
                options,
                playerId: ctx.playerId,
                remaining: 1,
                sourceCardId: ctx.sourceCardId,
                ...(rest.length > 0
                  ? {
                      then: {
                        boundTargetsOverride: (ctx.boundTargets ?? []).slice(k + 1),
                        effects: rest,
                        independentTargets: true,
                        type: "sequence",
                      },
                    }
                  : {}),
                type: "choose-target",
              } as typeof ctx.draft.pendingChoice;
              carryBattlefieldZone();
              return;
            }
            id = options[0] as string;
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
        stepSlotIdx = j;
        // rule 355.13 (rule-id: sfd-023-221) — an "up to N" slot the caster
        // left unchosen selects nothing; the step is skipped rather than
        // re-resolved from the board.
        if (j >= 0 && id === undefined) {
          // rule 359.3.e.5 — the slot's pick is gone: the instruction is
          // skipped, never re-resolved against the rest of the board. A skipped
          // source step leaves any later `pending-value` step empty (354.2).
          if (vacatedSlots.has(j)) {
            if (seq.pendingValue?.source === i) {
              pending = [];
            }
            continue;
          }
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
        // rule-id: sfd-198-221 (rule 354.2) — a `for-each` source step's own
        // targets are what it COUNTS ("for each Equipment you control"), not
        // what it produced, so its pending value comes from the sink only.
        pending = sub.type === "for-each" ? [] : getTargetIds(sub, subCtx);
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
      // rule 359.3.e.14 (rule-id: sfd-198-221) — "Ready up to two of THEM":
      // the choice is made among the pending value only (the tokens this
      // sequence just played), never a fresh board scan.
      const pvOptions =
        typeof subTarget === "object" && subTarget?.type === "pending-value" && pending
          ? [...pending]
          : undefined;
      if (
        typeof subTarget === "object" &&
        typeof upToN === "number" &&
        (subCtx.boundTargets === undefined || pvOptions !== undefined) &&
        ctx.draft.pendingChoice === undefined
      ) {
        const options =
          pvOptions ??
          resolveTarget(
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
          carryBattlefieldZone();
          return;
        }
      }
      // rule 402.2 / 355.10 (sfd-132-221 Beast Below) — "return another friendly
      // unit AND an enemy unit": every step of a sequence carries its OWN
      // caster-chosen single target, so a step whose slot was never locked must
      // ask its controller instead of silently taking the first candidate. Only
      // the lead descriptor is lifted into the resolution prompt, so the later
      // steps prompt from here; the rest of the sequence rides on `then`.
      const subQuantity = (subTarget as { quantity?: unknown } | undefined)?.quantity;
      if (
        typeof subTarget === "object" &&
        subTarget !== null &&
        (subQuantity === undefined || subQuantity === 1) &&
        !PROMPTLESS_TARGET_TYPES.includes(subTarget.type ?? "") &&
        !PROMPTLESS_STEP_TYPES.includes(sub.type) &&
        subCtx.boundTargets === undefined &&
        ctx.draft.pendingChoice === undefined
      ) {
        const options = resolveTarget(
          { ...(subTarget as TargetDescriptor), quantity: "all" },
          { ...resolverCtx, choosing: true } as Parameters<typeof resolveTarget>[1],
        );
        // rule 383.3.b.1 (rule-id: ven-082-166) — a cost-payment slot is always
        // the controller's own choice, so it prompts even with one candidate.
        const promptSingle =
          (subTarget as { promptWhenSingle?: boolean }).promptWhenSingle === true;
        if (options.length > 1 || (promptSingle && options.length === 1)) {
          const rest = seq.effects.slice(i + 1);
          ctx.draft.pendingChoice = {
            effect: sub,
            options,
            playerId: ctx.playerId,
            remaining: 1,
            sourceCardId: ctx.sourceCardId,
            type: "choose-target",
            // The remainder makes its OWN choices — it must not inherit the id
            // this prompt just bound, or the next step would re-hit that card.
            // rule 354.2 (rule-id: ven-139-166) — UNLESS every remaining step
            // is an anaphoric restatement of this one ("…move a friendly unit
            // in a showdown to base and … ready IT"): "it" is the card just
            // chosen, so the remainder keeps this pick instead of re-scanning
            // the board (which would name a different unit).
            ...(rest.length > 0
              ? {
                  then: remainderIsAnaphoric(rest, subTarget as Record<string, unknown>)
                    ? { effects: rest, type: "sequence" }
                    : { effects: rest, independentExecution: true, type: "sequence" },
                }
              : {}),
          } as typeof ctx.draft.pendingChoice;
          carryBattlefieldZone();
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
      carryBattlefieldZone();
      if (playedSink !== undefined && playedSink.ids.length > 0) {
        pending = playedSink.ids;
      }
      // rule 355.8 / 820.2 (unl-182-219) — a step that parked a modal prompt
      // suspends the rest of the sequence: the later Repeat executions must
      // not run (and silently auto-pick modes) while the choice is pending.
      // They resume from the prompt's `then` once the mode is picked.
      const parked = ctx.draft.pendingChoice as
        | { counterRansom?: unknown; type?: string; then?: unknown }
        | undefined;
      // rule 158.1 / 820.1.d.1 (sfd-136-221) — "Counter a spell unless its
      // controller pays [N]" parks the ransom question; a later Repeat
      // execution must not run (and demand a second ransom) before it is
      // answered. It resumes from the prompt's `then`.
      if (parked?.counterRansom !== undefined) {
        const rest = seq.effects.slice(i + 1);
        if (rest.length > 0) {
          const ransom = parked.counterRansom as {
            boundTargets?: readonly string[];
            effect: unknown;
            sourcePlayerId: string;
          };
          const carry = repeatedCounterTargets
            ? ctx.boundTargets?.slice(i + 1)
            : (subCtx.boundTargets as readonly string[] | undefined);
          const restSeq =
            carry !== undefined && carry.length > 0
              ? {
                  boundTargetsOverride: carry,
                  effects: rest,
                  ...(repeatedCounterTargets ? { independentTargets: true } : {}),
                  type: "sequence",
                }
              : { effects: rest, independentExecution: true, type: "sequence" };
          // Paying keeps the spell and the remaining executions still run;
          // declining lets THIS counter land first, then the rest.
          ctx.draft.pendingChoice = {
            payChoice: {
              ...(ransom.boundTargets ? { boundTargets: ransom.boundTargets } : {}),
              else: { effects: [ransom.effect, restSeq], type: "sequence" },
              sourcePlayerId: ransom.sourcePlayerId,
              then: restSeq,
            },
            playerId: (parked as { playerId?: string }).playerId,
            resolved: (parked as { resolved?: unknown }).resolved,
            sourceCardId: (parked as { sourceCardId?: string }).sourceCardId,
            type: "opt-in",
          } as typeof ctx.draft.pendingChoice;
        }
        carryBattlefieldZone();
        return;
      }
      // rule 355.13 (ogn-153-298) — a `confirm` prompt suspends the rest too:
      // the later steps resume from the prompt's `then` after the answer.
      // rule 422.4 / 359.3.e (ogn-178-298) — so does a `reveal-and-pick`:
      // "Discard 2, THEN draw 2" must not draw while the discard is unanswered
      // (it would leak the drawn cards into the pick).
      if (
        // rule 820.2.a (sfd-129-221 Temptation) — and so does a
        // `choose-destination`: each Repeat execution picks its own
        // destination, so a later one must not overwrite the parked prompt.
        // rule 820.2 (unl-182-219) — a mode locked in while the card was
        // PLAYED runs inline, so the prompt it parks (its own target) is what
        // suspends the remaining executions.
        ((parked as { fromChosenMode?: boolean } | undefined)?.fromChosenMode === true ||
          parked?.type === "choose-mode" ||
          parked?.type === "confirm" ||
          // rule 355.13 (ogn-153-298) — a per-unit `pick-many` subset prompt
          // raised mid-sequence suspends the rest the same way a confirm does.
          (parked?.type === "pick-many" &&
            (parked as { suspendsSequence?: boolean }).suspendsSequence === true) ||
          // rule 372 — so does the "order your damage replacements" question a
          // damage step raised: the damage has not been dealt yet.
          (parked?.type === "order" &&
            (parked as { suspendsSequence?: boolean }).suspendsSequence === true) ||
          parked?.type === "reveal-and-pick" ||
          // rule 355.4 (unl-202-219 Void Assault) — "Move a friendly unit, then
          // move an enemy unit": when the LATER steps own their own locked
          // targets, each move needs its own destination prompt, so this step's
          // prompt must not be overwritten. The remainder resumes from the
          // prompt carrying its slots' picks.
          (parked?.type === "choose-destination" &&
            (indepSlots !== undefined ||
              (seqSlots !== undefined &&
                stepSlotIdx >= 0 &&
                seqSlots.bound.slice(stepSlotIdx + 1).some((id) => id !== undefined)))) ||
          // rule 355.14.e-h (unl-192-219 Alpha Strike) — a RESOLUTION-time
          // split prompt (dropping targets / assigning surplus damage) is part
          // of the damage step itself: the damage has not been dealt yet, so
          // "Then for each unit this kills…" must wait for the answer instead
          // of running against a board nothing has happened to.
          (parked?.type === "choose-target" &&
            ((parked as { assign?: boolean }).assign === true ||
              (parked as { boundTargets?: readonly string[] }).boundTargets !== undefined))) &&
        parked.then === undefined
      ) {
        const rest = seq.effects.slice(i + 1);
        if (rest.length > 0) {
          // rule 820.2.a (sfd-129-221) — when the Repeat executions each own a
          // positional target slot, the suspended remainder must carry ITS
          // slots' ids, otherwise it would re-resolve from the board and hit
          // the execution that just happened.
          const k = indepSlots ? indepSlots.findIndex((s) => s.index === i) : -1;
          const carry =
            k >= 0 && ctx.boundTargets
              ? ctx.boundTargets.slice(k + 1)
              : // rule 355.8 (unl-202-219) — the remainder keeps the ids locked
                // for the slots it still has to fill.
                seqSlots !== undefined && stepSlotIdx >= 0
                ? seqSlots.bound.slice(stepSlotIdx + 1).filter((id): id is string => id !== undefined)
                : undefined;
          ctx.draft.pendingChoice = {
            ...(parked as object),
            then:
              carry !== undefined && carry.length > 0
                ? {
                    boundTargetsOverride: carry,
                    effects: rest,
                    independentTargets: true,
                    type: "sequence",
                  }
                : { effects: rest, independentExecution: true, type: "sequence" },
            // The continuation is the REST OF THE SEQUENCE, not the prompt's
            // own follow-up: it must still run when an optional prompt is
            // declined ("you may [Predict], then reveal the top card").
            thenIsSequenceRest: true,
          } as typeof ctx.draft.pendingChoice;
        }
        carryBattlefieldZone();
        return;
      }
      // rule 436 / 359.3.e (unl-136-219 Scryer's Bloom) — "[Predict 2], THEN
      // draw 1": the parked prompt already owns a `then` (the next Predict
      // step), so the sequence remainder cannot ride there. Defer it until the
      // whole prompt chain has been answered, or the draw would happen while
      // the player is still deciding what to leave on top.
      if (parked?.type === "reveal-and-pick" && parked.then !== undefined) {
        const rest = seq.effects.slice(i + 1);
        if (rest.length > 0) {
          const restSeq = { effects: rest, independentExecution: true, type: "sequence" };
          ctx.draft.deferredSequenceRest = [
            ...(ctx.draft.deferredSequenceRest ?? []),
            {
              effect: restSeq,
              playerId: ctx.playerId,
              ...(ctx.sourceCardId !== undefined ? { sourceCardId: ctx.sourceCardId } : {}),
            },
          ];
        }
        return;
      }
      // rule 371.2 (ogn-269-298 The Boss x ogn-213-298 Hidden Blade / sfd-163-221
      // Deathgrip) — an optional "you may pay … instead" DIE replacement is
      // decided AS the kill instruction executes, so the sequence's later
      // instructions ("Its controller draws 2", "If you do …, Draw 1") must not
      // run while the question is open. The opt-in reducer owns the deferred
      // kill and the whole answer chain, so the remainder waits in
      // `deferredSequenceRest` and runs once nothing is pending.
      if ((parked as { suspendedDeathCardId?: string } | undefined)?.suspendedDeathCardId !== undefined) {
        const rest = seq.effects.slice(i + 1);
        if (rest.length > 0) {
          // rule 359.3.e.12 — the remainder still names the object the kill
          // instruction targeted, even though it may never have died.
          const carry = (subCtx.boundTargets ?? ctx.boundTargets) as readonly string[] | undefined;
          const restSeq =
            carry !== undefined && carry.length > 0
              ? { boundTargetsOverride: [...carry], effects: rest, type: "sequence" }
              : { effects: rest, independentExecution: true, type: "sequence" };
          ctx.draft.deferredSequenceRest = [
            ...(ctx.draft.deferredSequenceRest ?? []),
            {
              effect: restSeq,
              playerId: ctx.playerId,
              ...(ctx.sourceCardId !== undefined ? { sourceCardId: ctx.sourceCardId } : {}),
            },
          ];
        }
        carryBattlefieldZone();
        return;
      }
    }
  }
}
