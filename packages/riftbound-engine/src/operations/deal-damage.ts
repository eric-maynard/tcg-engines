/**
 * Deal — the ONE damage choke point (rules 417 Deal, 432 Double, 437 Prevent,
 * 465.2.c–d combat damage, 712–715 Bonus Damage, 366–373 replacement effects).
 *
 * Every path that marks damage on a unit calls {@link dealDamage} /
 * {@link dealDamageBatch}: spell & ability damage (`effects/damage.ts`, incl.
 * split / splash), "deal damage equal to Might" fights (`effects/fight.ts`),
 * combat damage (`moves/combat/resolve-full-combat.ts`, `assign-damage.ts`)
 * and the sandbox `addDamage` move. For one damage event on one unit it:
 *
 *  1. rule 417.1.e — ignores non-positive amounts (nothing is dealt);
 *  2. rule 465.2.c.10 — a unit that "doesn't take damage" is dealt nothing;
 *  3. rule 715 — adds the source's Bonus Damage (spells / abilities only) so
 *     every later reduction sees the increased total (715.4.a);
 *  4. gathers the target-side replacement / modification effects — a
 *     "…is dealt to Z instead" redirect, Double (Lotus Trap), Prevent All
 *     (Unyielding Spirit, Esteemed Hierophant, Counter Strike's next instance),
 *     Prevent N (Ki Barrier) — and orders them: rule 372, the affected unit's
 *     CONTROLLER orders them when the order changes the outcome (an `order`
 *     prompt the caller parks; the answer lands in
 *     `draft.damageReplacementOrder[target]`), otherwise a deterministic order;
 *  5. folds the chain ({@link applyDamageOps}), spends what was used (437.3
 *     Prevent Value, single-use shields, `duration:"next"` entries), marks the
 *     result through the single damage STORE (`damage-store.ts addDamage`) with
 *     kill attribution (428.5.c) and `meta.lastDamage` LKI;
 *  6. rule 391 — runs "when it takes damage" delayed effects bound to the unit
 *     (Noxian Guillotine) or the turn (Imperial Decree) once damage WAS dealt;
 *  7. emits ONE `take-damage` GameEvent {amount, original, modifiedBy, combat}
 *     per unit actually dealt damage (437.4: fully prevented damage was never
 *     dealt — no event) and appends it to `draft.damageLog`;
 *  8. returns the dealt amount so callers total the MODIFIED number.
 *
 * {@link previewDamage} is the pure half (no writes): the combat damage step
 * uses its ordered op chain to compute lethal assignment thresholds
 * (465.2.c.4.a / 465.2.c.5 / 437.5) with {@link minAssignedForLethal}.
 * Deflect / Shield / Tank are Might & targeting rules, not damage modifiers,
 * and are not consulted here.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import { getBonusDamage, getLocationBonusDamage } from "../abilities/bonus-damage";
import type { EffectContext, ExecutableEffect } from "../abilities/effect-executor";
import { executeEffect } from "../abilities/effect-executor";
import type { GameEvent } from "../abilities/game-events";
import {
  type MatchedReplacement,
  findAllReplacements,
  markReplacementConsumed,
} from "../abilities/replacement-effects";
import { resolveTarget, type TargetDescriptor } from "../abilities/target-resolver";
import { fireTriggers as runTriggers, type TriggerRunnerContext } from "../abilities/trigger-runner";
import type { PendingItem, RiftboundCardMeta, RiftboundGameState } from "../types";
import { getGlobalCardRegistry } from "./card-lookup";
import { unitIgnoresDamage } from "./damage-immunity";
import { type DamageOp, type DamageOpStep, applyDamageOps, damageOpsOrderMatters } from "./damage-modifiers";
import { addDamage, getDamage } from "./damage-store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * rule 417.6 — what is dealing the damage. `spell` / `ability`: an effect whose
 * source is that card (Bonus Damage applies, 715); `unit`: a spell/ability made
 * a UNIT the source ("deal damage equal to its Might", 417.6.b.3); `combat`:
 * assigned combat damage (417.6.c); `effect` / `cost`: anything else.
 */
export type DamageKind = "spell" | "ability" | "combat" | "unit" | "effect" | "cost" | "bonus";

export interface DamageSource {
  readonly kind: DamageKind;
  /** Source card (spell / ability source / dealing unit); absent for pooled combat damage. */
  readonly cardId?: string;
  /** rule 142.3.a / 417.6.b.4 — the player responsible for the Deal. */
  readonly player?: string;
}

export interface DamageRequest {
  readonly target: string;
  readonly amount: number;
  readonly source: DamageSource;
  /** rule 465.2.d — set for combat damage: the TARGET's role and the battlefield. */
  readonly combat?: { readonly role: "attacker" | "defender"; readonly battlefieldId: string };
  /** rule 715 — the caller already folded Bonus Damage into `amount`. */
  readonly noBonus?: boolean;
  /**
   * rule 715.3 — split damage: the source's own Bonus Damage was already added
   * ONCE to the amount being split, so it must not be added again per target.
   * Location-scoped Bonus Damage (Void Gate) still applies to each unit.
   */
  readonly noSourceBonus?: boolean;
}

export interface DamageModifierNote {
  readonly kind: "immune" | "bonus" | "double" | "prevent" | "redirect";
  readonly key: string;
  readonly sourceCardId?: string;
  readonly before: number;
  readonly after: number;
}

export interface DamagePreview {
  /** Unit that finally receives the damage (after a redirect). */
  readonly target: string;
  readonly requestedTarget: string;
  /** Amount as requested, before Bonus Damage and any replacement. */
  readonly original: number;
  /** Amount that would be marked (≥ 0). */
  readonly amount: number;
  readonly immune: boolean;
  /** Ordered replacement chain applied after Bonus Damage. */
  readonly ops: readonly DamageOp[];
  readonly modifiedBy: readonly DamageModifierNote[];
  /** rule 372 — ≥2 order-sensitive effects and no order chosen yet: who orders which items. */
  readonly needsOrder?: { readonly chooser: string; readonly items: readonly PendingItem[] };
}

export interface DealDamageResult extends DamagePreview {
  /** Damage actually marked by this event (= `amount`, 0 when nothing was dealt). */
  readonly dealt: number;
  /** Marked damage on the target afterwards. */
  readonly total: number;
}

/** One dealt-damage record (`draft.damageLog`, `meta.lastDamage`). */
export interface DamageRecord {
  readonly target: string;
  readonly amount: number;
  readonly original: number;
  readonly source: DamageSource;
  readonly combat: boolean;
  readonly modifiedBy: readonly DamageModifierNote[];
  readonly turn: number;
}

/**
 * Structural slice of the engine operation bags; effect contexts, move
 * contexts and cleanup contexts all satisfy it.
 */
export interface DamageIO {
  readonly draft: RiftboundGameState;
  readonly zones: {
    getCardsInZone(zoneId: CoreZoneId, playerId?: CorePlayerId): CoreCardId[];
    getCardZone?(cardId: CoreCardId): string | undefined;
    moveCard(params: { cardId: CoreCardId; targetZoneId: CoreZoneId; position?: "top" | "bottom" | number }): void;
    drawCards?(params: unknown): unknown;
    removeCardFromGame?(params: { cardId: CoreCardId }): void;
  };
  readonly cards: {
    getCardOwner(cardId: CoreCardId): string | undefined;
    getCardController?(cardId: CoreCardId): string | undefined;
    getCardMeta?(cardId: CoreCardId): object | undefined;
    updateCardMeta?(cardId: CoreCardId, meta: Record<string, unknown>): void;
  };
  readonly counters?: {
    setFlag?(cardId: CoreCardId, flag: string, value: boolean): void;
    addCounter?(cardId: CoreCardId, counter: string, amount: number): void;
    removeCounter?(cardId: CoreCardId, counter: string, amount: number): void;
    clearCounter?(cardId: CoreCardId, counter: string): void;
  };
  readonly fireTriggers?: (event: GameEvent) => void;
}

export interface DealOptions {
  /**
   * rule 372 — called when a unit's controller must order its damage
   * replacements and no order is stored; the caller parks an `order` prompt
   * and re-enters later. When absent (or returning false) a deterministic
   * order is used. Nothing of the batch has been applied when this is called.
   */
  readonly onNeedsOrder?: (preview: DamagePreview) => boolean;
}

interface ActiveEntry {
  replaces?: string;
  replacement?: unknown;
  global?: boolean;
  amount?: unknown;
  duration?: string;
  owner?: string;
  sourceCardId?: string;
  targetCardIds?: readonly string[];
}

type ShieldMeta = Partial<RiftboundCardMeta> & {
  damagePreventionShield?: number | "all";
  damagePreventionSource?: string;
  preventNextDamageInstance?: boolean;
  preventNextDamageSource?: string;
};

/** A gathered target-side effect plus how to spend it once applied. */
interface Candidate {
  readonly item: PendingItem;
  readonly op: DamageOp;
  /** Default rank when nobody orders (lower = applied first). */
  readonly rank: number;
  readonly consume?: (step: DamageOpStep) => void;
}

interface Gathered {
  readonly target: string;
  readonly redirect?: DamageModifierNote;
  readonly immune: boolean;
  readonly bonus: number;
  readonly candidates: readonly Candidate[];
  /** rule 391 — printed "when/next time it takes damage, <effect>" on board cards: run once damage WAS dealt. */
  readonly boardReactions: readonly MatchedReplacement[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function metaOf(io: DamageIO, cardId: string): ShieldMeta | undefined {
  return io.cards.getCardMeta?.(cardId as CoreCardId) as ShieldMeta | undefined;
}

function controllerOf(io: DamageIO, cardId: string): string {
  return (
    (io.cards.getCardController?.(cardId as CoreCardId) as string | undefined) ??
    (io.cards.getCardOwner(cardId as CoreCardId) as string | undefined) ??
    ""
  );
}

function zoneOf(io: DamageIO, cardId: string): string | undefined {
  const direct = io.zones.getCardZone?.(cardId as CoreCardId);
  if (direct !== undefined) {
    return direct;
  }
  for (const playerId of Object.keys(io.draft.players ?? {})) {
    if (io.zones.getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId).includes(cardId as CoreCardId)) {
      return "base";
    }
  }
  for (const bfId of Object.keys(io.draft.battlefields ?? {})) {
    if (io.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId).includes(cardId as CoreCardId)) {
      return `battlefield-${bfId}`;
    }
  }
  return undefined;
}

function isSpellOrAbility(kind: DamageKind): boolean {
  return kind === "spell" || kind === "ability";
}

function labelOf(cardId: string | undefined, fallback: string): string {
  if (cardId === undefined) {
    return fallback;
  }
  const name = getGlobalCardRegistry().get(cardId)?.name;
  return name ? `${fallback} (${name})` : fallback;
}

function effectContext(
  io: DamageIO,
  playerId: string,
  sourceCardId: string,
  boundTargets: readonly string[] | undefined,
): EffectContext {
  const noop = () => {};
  const counters = io.counters ?? {};
  return {
    ...(boundTargets ? { boundTargets } : {}),
    cards: io.cards as unknown as EffectContext["cards"],
    counters: {
      addCounter: (counters.addCounter ?? noop) as EffectContext["counters"]["addCounter"],
      clearCounter: (counters.clearCounter ?? noop) as EffectContext["counters"]["clearCounter"],
      removeCounter: (counters.removeCounter ?? noop) as EffectContext["counters"]["removeCounter"],
      setFlag: (counters.setFlag ?? noop) as EffectContext["counters"]["setFlag"],
    },
    draft: io.draft,
    // A "kill it" reaction must publish its `die` (Deathknell …) even when the
    // caller is a move context without its own trigger hook.
    fireTriggers: io.fireTriggers ?? ((event: GameEvent) => emit(io, event)),
    playerId,
    sourceCardId,
    zones: {
      drawCards: (io.zones.drawCards ?? noop) as EffectContext["zones"]["drawCards"],
      getCardZone: (id: CoreCardId) => zoneOf(io, id as string),
      getCardsInZone: (z, p) => io.zones.getCardsInZone(z, p),
      moveCard: (p) => io.zones.moveCard(p),
      ...(io.zones.removeCardFromGame ? { removeCardFromGame: (p: { cardId: CoreCardId }) => io.zones.removeCardFromGame?.(p) } : {}),
    },
  };
}

function emit(io: DamageIO, event: GameEvent): void {
  if (io.fireTriggers) {
    io.fireTriggers(event);
    return;
  }
  const cardsAny = io.cards as unknown as TriggerRunnerContext["cards"];
  const countersAny = (io.counters ?? {}) as unknown as TriggerRunnerContext["counters"];
  if (typeof cardsAny.getCardMeta !== "function" || typeof countersAny.setFlag !== "function") {
    return;
  }
  runTriggers(event, {
    cards: cardsAny,
    counters: countersAny,
    draft: io.draft,
    zones: io.zones as unknown as TriggerRunnerContext["zones"],
  });
}

function replacementCtx(io: DamageIO) {
  return {
    cards: {
      getCardMeta: (id: CoreCardId) => (io.cards.getCardMeta?.(id) ?? undefined) as Partial<RiftboundCardMeta> | undefined,
      getCardOwner: (id: CoreCardId) => io.cards.getCardOwner(id),
    },
    draft: io.draft,
    zones: { getCardsInZone: (z: CoreZoneId, p?: CorePlayerId) => io.zones.getCardsInZone(z, p) },
  };
}

// ---------------------------------------------------------------------------
// Gathering (no writes)
// ---------------------------------------------------------------------------

/** rule 715 — Bonus Damage the source adds to this instance (spells / abilities only). */
function bonusFor(io: DamageIO, req: DamageRequest, target: string): number {
  if (req.noBonus === true || !isSpellOrAbility(req.source.kind) || req.amount <= 0) {
    return 0;
  }
  const ctx = {
    cards: io.cards,
    draft: io.draft,
    playerId: req.source.player ?? "",
    sourceCardId: req.source.cardId ?? "",
    zones: { getCardZone: (id: CoreCardId) => zoneOf(io, id as string), getCardsInZone: io.zones.getCardsInZone.bind(io.zones) },
  } as unknown as EffectContext;
  return (req.noSourceBonus === true ? 0 : getBonusDamage(ctx)) + getLocationBonusDamage(target, ctx);
}

/**
 * Board `take-damage` replacements matching this event (Esteemed Hierophant's
 * "prevent all damage enemy spells and abilities would deal to me", a
 * "…is dealt to Z instead" redirect). `sourceController` is only named for
 * spell/ability damage so shields scoped to it fail closed on combat damage.
 */
function boardMatches(io: DamageIO, req: DamageRequest, target: string): MatchedReplacement[] {
  return findAllReplacements(
    {
      amount: req.amount,
      cardId: target,
      owner: io.cards.getCardOwner(target as CoreCardId) ?? "",
      ...(isSpellOrAbility(req.source.kind) && req.source.player !== undefined
        ? { sourceController: req.source.player }
        : {}),
      type: "take-damage",
    },
    replacementCtx(io),
  );
}

function redirectTargetOf(io: DamageIO, match: MatchedReplacement): string | undefined {
  const repl = match.replacement as { type?: string; to?: TargetDescriptor | string } | undefined;
  if (repl?.type !== "redirect-damage") {
    return undefined;
  }
  const to = repl.to ?? "self";
  const ids = resolveTarget(to as TargetDescriptor | string, {
    cards: io.cards as never,
    draft: io.draft,
    playerId: match.sourceOwner,
    sourceCardId: match.sourceCardId,
    sourceZone: zoneOf(io, match.sourceCardId),
    zones: { getCardZone: (id: CoreCardId) => zoneOf(io, id as string), getCardsInZone: (z, p) => io.zones.getCardsInZone(z, p) },
  });
  const z = ids[0];
  if (z === undefined) {
    return undefined;
  }
  const zone = zoneOf(io, z);
  return zone === "base" || zone?.startsWith("battlefield-") ? z : undefined;
}

function gather(io: DamageIO, req: DamageRequest): Gathered {
  let target = req.target;
  let redirect: DamageModifierNote | undefined;

  // rule 370.1.b / 370.2 — "…is dealt to Z instead" replaces the event with
  // one aimed at Z; Z's own effects then apply, but not another redirect.
  const first = boardMatches(io, req, target);
  for (const m of first) {
    const z = redirectTargetOf(io, m);
    if (z !== undefined && z !== target) {
      redirect = { after: req.amount, before: req.amount, key: `redirect:${m.sourceCardId}#${m.abilityIndex}`, kind: "redirect", sourceCardId: m.sourceCardId };
      target = z;
      break;
    }
  }

  const immune = unitIgnoresDamage(target, io.draft, (id) => metaOf(io, id) as { empowered?: boolean; combatRole?: string } | undefined);
  const bonus = immune ? 0 : bonusFor(io, req, target);
  const candidates: Candidate[] = [];
  const meta = metaOf(io, target);

  // rule 437.1.b.1.b — a global "Prevent all spell and ability damage this turn".
  if (isSpellOrAbility(req.source.kind)) {
    const list = io.draft.activeReplacements as ActiveEntry[] | undefined;
    (list ?? []).forEach((e, idx) => {
      if (e?.replaces === "take-damage" && e.replacement === "prevent" && e.global === true && e.amount === "all") {
        candidates.push({
          consume: (step) => {
            if (e.duration === "next" && step.before > 0) {
              const cur = io.draft.activeReplacements as ActiveEntry[] | undefined;
              const i = cur?.indexOf(e) ?? -1;
              if (cur && i >= 0) cur.splice(i, 1);
            }
          },
          item: { ...(e.sourceCardId ? { cardId: e.sourceCardId as CoreCardId } : {}), key: `prevent-all:${e.sourceCardId ?? idx}`, label: labelOf(e.sourceCardId, "Prevent all") },
          op: { amount: "all", key: `prevent-all:${e.sourceCardId ?? idx}`, op: "prevent", ...(e.sourceCardId ? { sourceCardId: e.sourceCardId } : {}) },
          rank: 10,
        });
      }
    });
  }

  // Board "prevent" replacements (ven-025-166 Esteemed Hierophant).
  const boardReactions: MatchedReplacement[] = [];
  for (const m of redirect ? boardMatches(io, req, target) : first) {
    if (m.replacement !== "prevent") {
      const t = (m.replacement as { type?: string } | undefined)?.type;
      if (m.replacement && typeof m.replacement === "object" && t !== "redirect-damage") {
        boardReactions.push(m);
      }
      continue;
    }
    const key = `board:${m.sourceCardId}#${m.abilityIndex}`;
    candidates.push({
      consume: (step) => {
        if (step.before > 0) markReplacementConsumed(io.draft, m);
      },
      item: { cardId: m.sourceCardId as CoreCardId, key, label: labelOf(m.sourceCardId, "Prevent all") },
      op: { amount: "all", key, op: "prevent", sourceCardId: m.sourceCardId },
      rank: 11,
    });
  }

  // rule 437.5.b (sfd-194-221 Counter Strike) — "the next time it would be dealt damage, prevent it".
  if (meta?.preventNextDamageInstance === true) {
    candidates.push({
      consume: (step) => {
        if (step.before > 0) {
          io.cards.updateCardMeta?.(target as CoreCardId, { preventNextDamageInstance: false });
        }
      },
      item: { ...(meta.preventNextDamageSource ? { cardId: meta.preventNextDamageSource as CoreCardId } : {}), key: "prevent-next", label: labelOf(meta.preventNextDamageSource, "Prevent the next damage") },
      op: { amount: "all", key: "prevent-next", op: "prevent", ...(meta.preventNextDamageSource ? { sourceCardId: meta.preventNextDamageSource } : {}) },
      rank: 12,
    });
  }

  // rule 437.1.b.1 (ven-126-166 Ki Barrier) — "prevent the next N damage".
  const shield = meta?.damagePreventionShield;
  if (shield === "all" || (typeof shield === "number" && shield > 0)) {
    candidates.push({
      consume: (step) => {
        if (shield === "all" || (step.prevented ?? 0) <= 0) return;
        const left = shield - (step.prevented ?? 0);
        // rule 437.3.a — 0 or less: no longer tracked.
        io.cards.updateCardMeta?.(target as CoreCardId, {
          damagePreventionShield: left > 0 ? left : undefined,
          ...(left > 0 ? {} : { damagePreventionSource: undefined }),
        });
      },
      item: { ...(meta?.damagePreventionSource ? { cardId: meta.damagePreventionSource as CoreCardId } : {}), key: "prevent-shield", label: labelOf(meta?.damagePreventionSource, shield === "all" ? "Prevent all" : `Prevent ${shield}`) },
      op: { amount: shield, key: "prevent-shield", op: "prevent", ...(meta?.damagePreventionSource ? { sourceCardId: meta.damagePreventionSource } : {}) },
      rank: 13,
    });
  }

  // rule 432 / 437.2 (unl-013-219 Lotus Trap) — each Double grant doubles once.
  (meta?.grantedKeywords ?? []).forEach((gk, i) => {
    if (gk.keyword !== "DoubleIncomingDamage") return;
    const src = (gk as { source?: string }).source;
    const key = i === 0 || !candidates.some((c) => c.item.key === "double") ? "double" : `double#${i}`;
    candidates.push({
      item: { ...(src ? { cardId: src as CoreCardId } : {}), key, label: labelOf(src, "Double the damage") },
      op: { key, op: "double", ...(src ? { sourceCardId: src } : {}) },
      rank: 20,
    });
  });

  return { boardReactions, bonus, candidates, immune, ...(redirect ? { redirect } : {}), target };
}

function orderCandidates(io: DamageIO, target: string, cands: readonly Candidate[]): Candidate[] {
  const stored = io.draft.damageReplacementOrder?.[target];
  const byRank = [...cands].sort((a, b) => a.rank - b.rank);
  if (!stored || stored.length === 0) {
    return byRank;
  }
  const rank = (k: string): number => {
    const i = stored.indexOf(k);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return byRank.sort((a, b) => rank(a.item.key) - rank(b.item.key));
}

function buildPreview(io: DamageIO, req: DamageRequest, g: Gathered): { preview: DamagePreview; ordered: Candidate[]; steps: DamageOpStep[] } {
  const original = Math.max(0, Math.trunc(req.amount));
  const notes: DamageModifierNote[] = [];
  if (g.redirect) notes.push(g.redirect);
  if (original <= 0) {
    return { ordered: [], preview: { amount: 0, immune: g.immune, modifiedBy: notes, ops: [], original, requestedTarget: req.target, target: g.target }, steps: [] };
  }
  if (g.immune) {
    notes.push({ after: 0, before: original, key: "immune", kind: "immune" });
    return { ordered: [], preview: { amount: 0, immune: true, modifiedBy: notes, ops: [], original, requestedTarget: req.target, target: g.target }, steps: [] };
  }
  let amount = original;
  if (g.bonus > 0) {
    notes.push({ after: amount + g.bonus, before: amount, key: "bonus", kind: "bonus", ...(req.source.cardId ? { sourceCardId: req.source.cardId } : {}) });
    amount += g.bonus;
  }
  const ordered = orderCandidates(io, g.target, g.candidates);
  const ops = ordered.map((c) => c.op);
  const stored = io.draft.damageReplacementOrder?.[g.target];
  const needsOrder =
    (stored === undefined || stored.length === 0) && ordered.length >= 2 && damageOpsOrderMatters(ops)
      ? { chooser: controllerOf(io, g.target), items: ordered.map((c) => c.item) }
      : undefined;
  const folded = applyDamageOps(amount, ops);
  for (const step of folded.steps) {
    const c = ordered.find((x) => x.item.key === step.key);
    notes.push({ after: step.after, before: step.before, key: step.key, kind: step.op === "double" ? "double" : "prevent", ...(c?.op.sourceCardId ? { sourceCardId: c.op.sourceCardId } : {}) });
  }
  return {
    ordered,
    preview: { amount: folded.amount, immune: false, modifiedBy: notes, ...(needsOrder ? { needsOrder } : {}), ops, original, requestedTarget: req.target, target: g.target },
    steps: folded.steps,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Pure: what dealing `req` would do right now (no state is written). */
export function previewDamage(io: DamageIO, req: DamageRequest): DamagePreview {
  return buildPreview(io, req, gather(io, req)).preview;
}

/**
 * rule 372 — the target-side effects that would apply to damage dealt to
 * `target` by `source`, in the order they will be applied (stored controller
 * order, else default), and whether that order changes the outcome.
 */
export function damageReplacementProfile(
  io: DamageIO,
  target: string,
  source: DamageSource,
): { immune: boolean; ops: readonly DamageOp[]; items: readonly PendingItem[]; orderMatters: boolean; chooser: string; ordered: boolean } {
  const g = gather(io, { amount: 1, noBonus: true, source, target });
  const ordered = orderCandidates(io, g.target, g.candidates);
  const ops = ordered.map((c) => c.op);
  const stored = io.draft.damageReplacementOrder?.[g.target];
  return {
    chooser: controllerOf(io, g.target),
    immune: g.immune,
    items: ordered.map((c) => c.item),
    ops,
    orderMatters: ordered.length >= 2 && damageOpsOrderMatters(ops),
    ordered: stored !== undefined && stored.length > 0,
  };
}

/** rule 372 — record the controller's chosen order for the next damage dealt to `target`. */
export function recordDamageReplacementOrder(draft: RiftboundGameState, target: string, keys: readonly string[]): void {
  draft.damageReplacementOrder = { ...(draft.damageReplacementOrder ?? {}), [target]: [...keys] };
}

/**
 * Deal a batch of SIMULTANEOUS damage events (417.1.d / 465.2.c.1.a): every
 * preview is computed before anything is written, then all are marked, then
 * "when it takes damage" effects run and events fire. Returns `suspended` when
 * a rule 372 order question was parked (nothing applied).
 */
export function dealDamageBatch(
  io: DamageIO,
  requests: readonly DamageRequest[],
  opts: DealOptions = {},
): { results: DealDamageResult[]; suspended: boolean } {
  const planned = requests.map((req) => {
    const g = gather(io, req);
    return { g, req, ...buildPreview(io, req, g) };
  });
  for (const p of planned) {
    if (p.preview.needsOrder && opts.onNeedsOrder?.(p.preview) === true) {
      return { results: [], suspended: true };
    }
  }

  const results: DealDamageResult[] = [];
  const dealtNow: { p: (typeof planned)[number]; dealt: number }[] = [];
  for (const p of planned) {
    const { preview, ordered, steps, req, g } = p;
    // Spend what the chain used (437.3 / single-use shields / "next" entries).
    for (const step of steps) {
      ordered.find((c) => c.item.key === step.key)?.consume?.(step);
    }
    if (io.draft.damageReplacementOrder?.[g.target] !== undefined && preview.original > 0) {
      const rest = { ...io.draft.damageReplacementOrder };
      delete rest[g.target];
      io.draft.damageReplacementOrder = Object.keys(rest).length > 0 ? rest : undefined;
    }
    const dealt = preview.amount;
    let total = getDamage(io, g.target);
    if (dealt > 0) {
      const record: DamageRecord = {
        amount: dealt,
        combat: req.combat !== undefined,
        modifiedBy: preview.modifiedBy,
        original: preview.original,
        source: req.source,
        target: g.target,
        turn: (io.draft.turn as { number?: number } | undefined)?.number ?? 0,
      };
      const legacyKind = req.source.kind === "spell" || req.source.kind === "ability" || req.source.kind === "combat" ? req.source.kind : undefined;
      total = addDamage(io, g.target, dealt, {
        // rule 383.2.c.1 — fresh damage restores kill credit to this source.
        killCreditStale: undefined,
        lastDamage: record,
        lastDamageSource: legacyKind,
        lastDamagedBy: req.source.player,
      });
      const log = (io.draft.damageLog ??= []);
      log.push(record);
      if (log.length > 64) log.splice(0, log.length - 64);
      dealtNow.push({ dealt, p });
    }
    results.push({ ...preview, dealt, total });
  }

  // rule 391 — "when it takes damage" delayed effects (bound: ogn-254-298
  // Noxian Guillotine; turn-wide: ogn-221-298 Imperial Decree), then the event.
  for (const { dealt, p } of dealtNow) {
    const target = p.g.target;
    const list = io.draft.activeReplacements as ActiveEntry[] | undefined;
    const reactions = (list ?? []).filter(
      (e) =>
        e?.replaces === "take-damage" &&
        e.replacement !== undefined &&
        e.replacement !== "prevent" &&
        typeof e.replacement === "object" &&
        (e.replacement as { type?: string }).type !== "redirect-damage" &&
        (e.targetCardIds ? e.targetCardIds.includes(target) : e.duration === "turn" && e.global !== true),
    );
    for (const e of reactions) {
      if (e.duration === "next") {
        const cur = io.draft.activeReplacements as ActiveEntry[] | undefined;
        const i = cur?.indexOf(e) ?? -1;
        if (cur && i >= 0) cur.splice(i, 1);
      }
      executeEffect(e.replacement as ExecutableEffect, effectContext(io, e.owner ?? controllerOf(io, target), e.sourceCardId ?? "", [target]));
    }
    for (const m of p.g.boardReactions) {
      markReplacementConsumed(io.draft, m);
      executeEffect(m.replacement as ExecutableEffect, { ...effectContext(io, m.sourceOwner, m.sourceCardId, undefined), triggerSourceId: target });
    }
    emit(io, {
      amount: dealt,
      cardId: target,
      combat: p.req.combat !== undefined,
      kind: p.req.source.kind,
      modifiedBy: p.preview.modifiedBy,
      original: p.preview.original,
      ...(p.req.source.cardId ? { sourceId: p.req.source.cardId } : {}),
      ...(p.req.source.player ? { sourcePlayer: p.req.source.player } : {}),
      type: "take-damage",
    });
  }
  return { results, suspended: false };
}

/** Deal one damage event; see {@link dealDamageBatch}. */
export function dealDamage(io: DamageIO, req: DamageRequest, opts: DealOptions = {}): DealDamageResult & { suspended: boolean } {
  const { results, suspended } = dealDamageBatch(io, [req], opts);
  const r = results[0];
  if (r) {
    return { ...r, suspended };
  }
  const preview = previewDamage(io, req);
  return { ...preview, dealt: 0, suspended, total: getDamage(io, preview.target) };
}
