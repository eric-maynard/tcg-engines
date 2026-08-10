/**
 * Die-replacement planning for a batch of SIMULTANEOUS deaths (rules 370–373).
 *
 * One entry point, {@link runDieBatch}, is shared by the lethal-damage cleanup
 * pass (`cleanup/state-based-checks.ts`), Kill instructions / kill costs /
 * [Temporary] (`operations/leave-board.ts` → `applyDieReplacement`,
 * `effects/kill.ts killUnits`). For every dying object it gathers ALL matching
 * `die` replacements — printed board abilities (Zhonya's Hourglass, Soraka,
 * Guardian Angel), runtime-bound ones (`draft.activeReplacements`: Smite,
 * Tactical Retreat, Unlicensed Armory) — and then:
 *
 *  - rule 371.2   an optional, costed shield ("you may pay [C] … instead") is
 *                 asked first (legacy `opt-in` prompt; the batch waits);
 *  - rule 372     one death with ≥2 applicable replacements ⇒ the dying
 *                 object's controller ORDERS them (`order` prompt); they apply
 *                 in that order and each later one re-checks that the death
 *                 still exists — a replaced death is no longer a death, so the
 *                 rest never apply and are not consumed (370.1.b / 370.2);
 *  - rule 373     a replacement that can apply only once (it kills / spends
 *                 itself) but matches ≥2 deaths of the batch ⇒ its controller
 *                 picks WHICH death it is applied to first (`pick-many` 1-of-N,
 *                 semantics `replacement-assign`); once spent it is off the
 *                 board (365.1) and cannot save a second unit;
 *  - rule 373.1.a every applied replacement's actions run before the
 *                 unmodified deaths, which the caller then performs together.
 *
 * Single-candidate / single-death cases never prompt. Decisions live on
 * `draft.dieBatch` (pure data) so the batch resumes after each answer.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import { canAffordPower } from "../game-definition/moves/chain/effect-context";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import { clearDamage } from "../operations/damage-store";
import {
  type LeaveBoardContext,
  type LeaveCause,
  type LeaveDestination,
  buildReplacementEffectContext,
  buildTrashReplacedBanishEvent,
  emitLeaveEvents,
  leaveBoard,
  snapshotBatch,
  zoneOfCard,
} from "../operations/leave-board";
import type { PendingItem, RiftboundGameState } from "../types";
import type { ExecutableEffect } from "./effect-executor";
import { executeEffect } from "./effect-executor";
import {
  type MatchedReplacement,
  findAllReplacements,
  markReplacementConsumed,
} from "./replacement-effects";
import { fireTriggers } from "./trigger-runner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BoundEntry {
  replaces?: string;
  replacement?: unknown;
  targetCardIds?: readonly string[];
  condition?: { type?: string; cost?: { energy?: number; power?: readonly string[] } };
  owner?: string;
  sourceCardId?: string;
  duration?: string;
  /** Stable identity across prompts (stamped lazily). */
  rid?: string;
}

export interface DieReplacementCandidate {
  /** Global identity: `board:<source>#<abilityIndex>` or the bound entry's `rid`. */
  readonly id: string;
  /** Prompt key — the replacement's source card (suffixed only to stay unique). */
  readonly key: string;
  readonly sourceCardId: string;
  /** Controller of the replacement effect (rule 373: orders / assigns it). */
  readonly controller: string;
  /** Spends itself when applied (kills/banishes its source, single-fire, runtime-bound). */
  readonly singleUse: boolean;
  readonly kind: "board" | "bound";
  readonly match?: MatchedReplacement;
  readonly entry?: BoundEntry;
  /** rule 428.1 — a blanket "…goes to your trash → banish it instead" shield (ven-022-166). */
  readonly banishInstead?: boolean;
  /** rule 371.2 — "may pay [C] … instead": asked (and paid) by `payer` before it applies. */
  readonly optional?: { readonly cost: { energy?: number; power?: readonly string[] }; readonly payer: string };
}

export interface DieBatchOptions {
  /** May this call park a prompt? (false ⇒ default choices: listed order / front event.) */
  readonly canPrompt: boolean;
  /**
   * A Kill instruction / cost / [Temporary] batch: unreplaced cards are NOT
   * re-detected by a later cleanup, so the batch is finished on resume
   * (`continueKillBatch`). Absent for the lethal-damage pass.
   */
  readonly kill?: { readonly to: string; readonly cause: LeaveCause; readonly playerId: string; readonly sourceCardId: string };
  /**
   * rule 321 / 323.5 — the DAMAGE-TIME pass between two damage instances of one
   * resolving item: consult ONLY costed "you may pay … instead" shields
   * (ogn-269-298 The Boss) and kill nothing. Death-class replacements are a
   * Cleanup event and are left to the single Cleanup after the item resolves.
   */
  readonly shieldsOnly?: boolean;
}

export interface DieBatchResult {
  /** Deaths replaced — these cards never die (no `die` event, no Deathknell — 808.1.d.1). */
  readonly replaced: string[];
  /** Deaths that stand; the caller kills them together (373.1.a). */
  readonly dying: string[];
  /** A prompt is open; nothing in `dying` may be killed yet. */
  readonly suspended: boolean;
}

type BatchState = NonNullable<RiftboundGameState["dieBatch"]>;

type Ctx = LeaveBoardContext & {
  readonly zones: LeaveBoardContext["zones"] & {
    getCardsInZone(zoneId: CoreZoneId, playerId?: CorePlayerId): CoreCardId[];
  };
};

/**
 * rule 370.2 — a replacement applies once to an event and to whatever replaces
 * it; the kill it performs itself ("kill this instead") is not replaced again
 * by the same source while it runs.
 */
const RUNNING = new Set<string>();

export function isDieReplacementRunning(cardId: string): boolean {
  return RUNNING.has(cardId);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ownerOf(ctx: Ctx, cardId: string): string {
  return (ctx.cards?.getCardOwner?.(cardId as CoreCardId) as string | undefined) ?? "";
}

function controllerOf(ctx: Ctx, cardId: string): string {
  return (
    (ctx.cards?.getCardController?.(cardId as CoreCardId) as string | undefined) ??
    ownerOf(ctx, cardId)
  );
}

function activeEntries(draft: RiftboundGameState): BoundEntry[] {
  return ((draft as { activeReplacements?: BoundEntry[] }).activeReplacements ?? []) as BoundEntry[];
}

function stampRid(draft: RiftboundGameState, entry: BoundEntry): string {
  if (typeof entry.rid === "string") {
    return entry.rid;
  }
  const d = draft as { dieBatchSeq?: number };
  d.dieBatchSeq = (d.dieBatchSeq ?? 0) + 1;
  entry.rid = `bound:${entry.sourceCardId ?? "?"}:${d.dieBatchSeq}`;
  return entry.rid;
}

/** Does the replacement's own effect remove its source (kill / banish / discard "self")? */
function effectRemovesSelf(effect: unknown): boolean {
  if (!effect || typeof effect !== "object") {
    return false;
  }
  const e = effect as { type?: string; target?: unknown; effects?: unknown[]; then?: unknown; effect?: unknown };
  const t = e.target as { type?: string } | string | undefined;
  const isSelf = t === "self" || (typeof t === "object" && t !== null && t.type === "self");
  if (
    isSelf &&
    (e.type === "kill" || e.type === "banish" || e.type === "sacrifice" || e.type === "recycle" || e.type === "return-to-hand")
  ) {
    return true;
  }
  for (const child of [...(e.effects ?? []), e.then, e.effect]) {
    if (effectRemovesSelf(child)) {
      return true;
    }
  }
  return false;
}

function replacementCtx(ctx: Ctx) {
  return {
    cards: {
      getCardMeta: (id: CoreCardId) =>
        (ctx.cards?.getCardMeta?.(id) ?? undefined) as Partial<import("../types").RiftboundCardMeta> | undefined,
      // rule 191.1 / 455 — "friendly"/"enemy" and the zone a board replacement
      // lives in read off the CONTROLLER: a gear taken with "you control it
      // until I leave the board" (sfd-109-221 Akshan) still sits in its owner's
      // base zone while its abilities belong to the thief.
      getCardController: (id: CoreCardId) => ctx.cards?.getCardController?.(id),
      getCardOwner: (id: CoreCardId) => ctx.cards?.getCardOwner?.(id),
    },
    draft: ctx.draft,
    zones: { getCardsInZone: ctx.zones.getCardsInZone },
  };
}

/**
 * rule 428.1 / 571 (rule-id: ven-022-166 Endless Riches) — a kill is "board →
 * trash", so a blanket "If a card would go to YOUR trash …, banish it instead"
 * permanent also replaces a death. Scoped to its own controller's trash: only
 * cards owned by the source's controller are covered.
 */
function collectTrashToBanishCandidates(ctx: Ctx, cardId: string): DieReplacementCandidate[] {
  const owner = ownerOf(ctx, cardId);
  if (owner === "") {
    return [];
  }
  const registry = getGlobalCardRegistry();
  const zoneIds = ["base", ...Object.keys(ctx.draft.battlefields ?? {}).map((bf) => `battlefield-${bf}`)];
  const out: DieReplacementCandidate[] = [];
  for (const zoneId of zoneIds) {
    for (const sourceCardId of ctx.zones.getCardsInZone(zoneId as CoreZoneId, owner as CorePlayerId)) {
      const src = sourceCardId as string;
      if (src === cardId || RUNNING.has(src) || controllerOf(ctx, src) !== owner) {
        continue;
      }
      const abilities = registry.getAbilities(src) ?? [];
      for (let i = 0; i < abilities.length; i++) {
        const ability = abilities[i] as { type?: string; effect?: { type?: string } } | undefined;
        if (ability?.type !== "replacement" || ability.effect?.type !== "trash-to-banish") {
          continue;
        }
        out.push({
          banishInstead: true,
          controller: owner,
          id: `board:${src}#${i}`,
          key: src,
          kind: "board",
          singleUse: false,
          sourceCardId: src,
        });
      }
    }
  }
  return out;
}

/** Every non-optional die replacement that could apply to `cardId` right now (bound first, then board scan order). */
export function collectDieCandidates(ctx: Ctx, cardId: string): DieReplacementCandidate[] {
  const out: DieReplacementCandidate[] = [];
  for (const entry of activeEntries(ctx.draft)) {
    if (
      entry?.replaces !== "die" ||
      entry.targetCardIds?.includes(cardId) !== true ||
      entry.condition?.type === "pay-cost"
    ) {
      continue;
    }
    const sourceCardId = entry.sourceCardId ?? cardId;
    out.push({
      controller: entry.owner ?? controllerOf(ctx, cardId),
      entry,
      id: stampRid(ctx.draft, entry),
      key: sourceCardId,
      kind: "bound",
      singleUse: true,
      sourceCardId,
    });
  }
  const matches = findAllReplacements(
    { cardId, owner: ownerOf(ctx, cardId), type: "die" },
    replacementCtx(ctx),
  );
  for (const m of matches) {
    if (RUNNING.has(m.sourceCardId)) {
      continue;
    }
    const controller = controllerOf(ctx, m.sourceCardId) || m.sourceOwner;
    const cond = m.condition as { type?: string; cost?: { energy?: number; power?: readonly string[] } } | undefined;
    const optional =
      cond?.type === "pay-cost" && cond.cost
        ? { cost: cond.cost, payer: m.payer === "affected-controller" ? controllerOf(ctx, cardId) : controller }
        : undefined;
    out.push({
      controller,
      id: `board:${m.sourceCardId}#${m.abilityIndex}`,
      key: m.sourceCardId,
      kind: "board",
      match: m,
      ...(optional ? { optional } : {}),
      singleUse: m.duration === "next" || effectRemovesSelf(m.replacement),
      sourceCardId: m.sourceCardId,
    });
  }
  out.push(...collectTrashToBanishCandidates(ctx, cardId));
  // Keys name the source card; keep them unique within one prompt.
  const seen = new Map<string, number>();
  return out.map((c) => {
    const n = seen.get(c.key) ?? 0;
    seen.set(c.key, n + 1);
    return n === 0 ? c : { ...c, key: `${c.key}#${n}` };
  });
}

/**
 * rule 372 / 373 (ogn-077-298 Zhonya's Hourglass, sfd-051-221 Guardian Angel) — would a
 * death of `cardId` right now be replaced by something that removes ITSELF instead, leaving
 * `cardId` on the board? Callers that must know up front whether a unit survives its own
 * death — the [Equip] "Kill a friendly unit" cost naming its own holder (sfd-178-221) —
 * ask here rather than re-deriving the shield. Optional (pay-cost) shields do not count:
 * they may be declined.
 */
export function survivesOwnDeath(
  ctx: Pick<Ctx, "cards" | "draft" | "zones">,
  cardId: string,
): boolean {
  return collectDieCandidates(ctx as Ctx, cardId).some((c) => {
    if (c.optional) {
      return false;
    }
    const replacement =
      c.kind === "bound"
        ? (c.entry as { replacement?: unknown } | undefined)?.replacement
        : c.match?.replacement;
    return effectRemovesSelf(replacement);
  });
}

function isLive(ctx: Ctx, cardId: string, c: DieReplacementCandidate): boolean {
  if (c.kind === "bound") {
    return activeEntries(ctx.draft).some((e) => e?.rid === c.id && e.targetCardIds?.includes(cardId) === true);
  }
  return collectDieCandidates(ctx, cardId).some((x) => x.id === c.id);
}

function isBoardZone(zone: string | undefined): boolean {
  return zone === "base" || (zone !== undefined && zone.startsWith("battlefield-"));
}

/** Still a would-be death: on the board (a replacement may have recalled/banished it — then it is done). */
function stillOnBoard(ctx: Ctx, cardId: string): boolean {
  return isBoardZone(zoneOfCard(ctx, cardId));
}

/** Apply one replacement to `cardId`'s death. Returns true when the death was replaced. */
function applyCandidate(ctx: Ctx, cardId: string, c: DieReplacementCandidate): boolean {
  if (c.kind === "bound") {
    const active = activeEntries(ctx.draft);
    const idx = active.findIndex((e) => e?.rid === c.id);
    if (idx < 0) {
      return false;
    }
    const entry = active.splice(idx, 1)[0] as BoundEntry;
    const repl = entry.replacement as ExecutableEffect | "prevent" | undefined;
    if (repl && repl !== "prevent" && typeof repl === "object" && repl.type === "banish") {
      // "banish it instead": a new object in banishment (124.1), not a death.
      leaveBoard(ctx, cardId, "banishment", { kind: "replaced" });
      return true;
    }
    clearDamage(ctx, cardId);
    if (repl && repl !== "prevent" && typeof repl === "object" && repl.type) {
      executeEffect(repl, {
        ...buildReplacementEffectContext(
          ctx,
          { sourceCardId: entry.sourceCardId ?? cardId, sourceOwner: entry.owner ?? ownerOf(ctx, cardId) },
          cardId,
        ),
        boundTargets: [cardId],
      });
    }
    return true;
  }
  if (c.banishInstead) {
    // rule 427.2.a — banishment is not a kill: no `die` event, no Deathknell.
    clearDamage(ctx, cardId);
    const res = leaveBoard(ctx, cardId, "banishment", { kind: "replaced" });
    // rule 374 / 370.2 — a replacement's actions are performed by the controller
    // of its source, and "if a card would go to YOUR trash …" only ever matches
    // the card's own owner, so this IS a banish that player performed: "when you
    // banish a card you own" (ven-191-166) must see it.
    if (res.left) {
      fireTriggers(buildTrashReplacedBanishEvent(cardId, res.lki), ctx as never);
    }
    return true;
  }
  const match = c.match as MatchedReplacement;
  markReplacementConsumed(ctx.draft, match);
  clearDamage(ctx, cardId);
  const repl = match.replacement as ExecutableEffect | "prevent" | undefined;
  if (repl && repl !== "prevent" && typeof repl === "object" && repl.type) {
    RUNNING.add(match.sourceCardId);
    try {
      executeEffect(repl, buildReplacementEffectContext(ctx, match, cardId));
    } finally {
      RUNNING.delete(match.sourceCardId);
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Optional costed shields (rule 371.2) — legacy opt-in prompt
// ---------------------------------------------------------------------------

function canPayCost(draft: RiftboundGameState, playerId: string, cost: { energy?: number; power?: readonly string[] }): boolean {
  const pool = draft.runePools[playerId];
  if (!pool || pool.energy < (cost.energy ?? 0)) {
    return false;
  }
  const needed: Record<string, number> = {};
  for (const d of cost.power ?? []) {
    needed[d] = (needed[d] ?? 0) + 1;
  }
  return canAffordPower(pool.power, needed);
}

function payCost(draft: RiftboundGameState, playerId: string, cost: { energy?: number; power?: readonly string[] }): void {
  const pool = draft.runePools[playerId];
  if (!pool) {
    return;
  }
  pool.energy = Math.max(0, pool.energy - (cost.energy ?? 0));
  for (const domain of cost.power ?? []) {
    const key =
      domain === "rainbow"
        ? (Object.entries(pool.power).sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))[0]?.[0] as keyof typeof pool.power | undefined)
        : (domain as keyof typeof pool.power);
    if (key !== undefined) {
      pool.power[key] = Math.max(0, (pool.power[key] ?? 0) - 1);
    }
  }
}

/**
 * rule 371.2 / 372 (ogn-023-298 Unlicensed Armory) — "the next time it would
 * die, you may pay [C] to … instead". Payable ⇒ ask the controller (the batch
 * waits: nothing dies while the question is open, 370.1.c); unpayable ⇒ the
 * shield is spent ("the next time" has passed) and the death proceeds. When no
 * prompt can be raised the shield is honoured by paying for it.
 * Returns "prompted" | "applied" | "none".
 */
function offerOptionalShield(
  ctx: Ctx,
  cardId: string,
  opts: DieBatchOptions,
): "prompted" | "applied" | "none" {
  const active = activeEntries(ctx.draft);
  for (;;) {
    const idx = active.findIndex(
      (e) => e?.replaces === "die" && e.targetCardIds?.includes(cardId) === true && e.condition?.type === "pay-cost",
    );
    if (idx < 0) {
      return "none";
    }
    const entry = active[idx] as BoundEntry;
    const cost = entry.condition?.cost;
    const repl = entry.replacement as ExecutableEffect | undefined;
    const payer = entry.owner ?? controllerOf(ctx, cardId);
    active.splice(idx, 1);
    if (!cost || !repl || typeof repl !== "object" || !canPayCost(ctx.draft, payer, cost)) {
      continue;
    }
    const sourceCardId = entry.sourceCardId ?? cardId;
    if (!opts.canPrompt || ctx.draft.pendingChoice) {
      payCost(ctx.draft, payer, cost);
      clearDamage(ctx, cardId);
      executeEffect(repl, {
        ...buildReplacementEffectContext(ctx, { sourceCardId, sourceOwner: payer }, cardId),
        boundTargets: [cardId],
      });
      return "applied";
    }
    (ctx.draft as { pendingChoice?: unknown }).pendingChoice = {
      playerId: payer,
      resolved: {
        cardId: sourceCardId,
        controller: payer,
        effect: repl,
        id: `die-replacement-${cardId}`,
        optInCost: cost,
        targets: [cardId],
        triggerEvent: { cardId, type: "die" },
        triggered: true,
        type: "ability",
      },
      sourceCardId,
      suspendedDeathCardId: cardId,
      // rule 371.2.b — a declined KILL is not re-detected by any cleanup, so it
      // is carried out on the answer; a lethal-damage death re-runs by itself.
      ...(opts.kill
        ? { suspendedKill: { by: opts.kill.cause.by ?? payer, source: opts.kill.cause.source ?? sourceCardId } }
        : {}),
      type: "opt-in",
    };
    return "prompted";
  }
}

// ---------------------------------------------------------------------------
// The batch
// ---------------------------------------------------------------------------

function itemFor(cardId: string): PendingItem {
  return { cardId, key: cardId };
}

function freshState(ids: readonly string[], opts: DieBatchOptions): BatchState {
  return {
    assigned: [],
    dying: [],
    orders: {},
    queue: [...ids],
    replaced: [],
    ...(opts.kill ? { kill: { ...opts.kill } } : {}),
    ...(opts.shieldsOnly === true ? { shieldsOnly: true } : {}),
  };
}

/**
 * Processing order of a fresh batch: rule 373.1 — events whose controller
 * comes first in turn order first (their replacements execute first); within
 * one controller, deaths carrying an optional ("you may pay …") shield are
 * asked about before the rest (371.2); otherwise board order.
 */
function initialOrder(ctx: Ctx, ids: readonly string[]): string[] {
  const draft = ctx.draft;
  const turnOrder = Object.keys(draft.players ?? {});
  const start = Math.max(0, turnOrder.indexOf(draft.turn?.activePlayer ?? ""));
  const rank = (pid: string): number => {
    const i = turnOrder.indexOf(pid);
    return i < 0 ? Number.MAX_SAFE_INTEGER : (i - start + turnOrder.length) % turnOrder.length;
  };
  const hasOptional = (id: string): boolean =>
    activeEntries(draft).some(
      (e) => e?.replaces === "die" && e.targetCardIds?.includes(id) === true && e.condition?.type === "pay-cost",
    );
  return ids
    .map((id, i) => ({ i, id, opt: hasOptional(id) ? 0 : 1, r: rank(controllerOf(ctx, id)) }))
    .sort((a, b) => a.r - b.r || a.opt - b.opt || a.i - b.i)
    .map((e) => e.id);
}

function loadState(ctx: Ctx, ids: readonly string[], opts: DieBatchOptions): BatchState {
  const draft = ctx.draft;
  const prev = draft.dieBatch;
  const known = prev ? [...prev.queue, ...prev.replaced, ...prev.dying] : [];
  const resumable = prev !== undefined && ids.some((id) => known.includes(id));
  if (!resumable) {
    draft.dieBatch = freshState(initialOrder(ctx, ids), opts);
    return draft.dieBatch as BatchState;
  }
  const state = prev as BatchState;
  // Keep the chosen processing order; drop ids no longer dying (healed by an
  // accepted shield), append newcomers.
  state.queue = [
    ...state.queue.filter((id) => ids.includes(id)),
    ...ids.filter((id) => !state.queue.includes(id) && !state.replaced.includes(id) && !state.dying.includes(id)),
  ];
  return state;
}

/** >0 while a batch is being processed: a kill performed BY a replacement is a nested, promptless batch. */
let DEPTH = 0;

/**
 * Decide and apply die replacements for `ids` (simultaneous would-be deaths).
 * May park ONE prompt and return `suspended`; call again (same ids or the
 * re-detected subset) after the answer — `draft.dieBatch` remembers what was
 * decided. When it completes, `draft.dieBatch` is cleared.
 */
export function runDieBatch(ctx: Ctx, ids: readonly string[], opts: DieBatchOptions): DieBatchResult {
  const draft = ctx.draft;
  const nested = DEPTH > 0;
  DEPTH += 1;
  try {
    const state = nested ? freshState(ids, opts) : loadState(ctx, ids, opts);
    // rule 371.2.b — a costed shield declined during the damage-time pass is
    // not offered again by the Cleanup that kills the unit (same event).
    const carried = draft.damageTimeShieldsAsked;
    if (!nested && carried !== undefined) {
      state.asked = { ...carried, ...(state.asked ?? {}) };
      draft.damageTimeShieldsAsked = undefined;
    }
    // A batch that started as the damage-time pass stays restricted when it is
    // resumed after its shield prompt (321 / 323.5).
    const shieldsOnly = opts.shieldsOnly === true || state.shieldsOnly === true;
    const result = processBatch(ctx, state, { ...opts, canPrompt: opts.canPrompt && !nested, shieldsOnly });
    if (!nested) {
      draft.dieBatch = result.suspended ? state : undefined;
      if (shieldsOnly && !result.suspended && state.asked !== undefined) {
        draft.damageTimeShieldsAsked = { ...state.asked };
      }
    }
    return result;
  } finally {
    DEPTH -= 1;
  }
}

/**
 * rule 373.1 (ruling b9a88df37a35379b — Soraka, Wanderer + Guardian Angel) —
 * when ONE player controls replacements for several deaths of the same batch
 * AND one of the dying objects is itself the source of such a replacement, the
 * order the deaths are processed in changes the outcome (Soraka must still be
 * "here" to save the smaller units, so her controller may apply her
 * replacement before the one that recalls her). That player orders them.
 * Returns the prompt items (death id as key, its replacement's source as the
 * card shown) plus the chooser, or undefined when nothing is order-sensitive.
 */
function batchOrderQuestion(
  ctx: Ctx,
  state: BatchState,
): { playerId: string; items: PendingItem[] } | undefined {
  const live = state.queue.filter((id) => !RUNNING.has(id) && stillOnBoard(ctx, id));
  if (live.length < 2) {
    return undefined;
  }
  const entries: { death: string; source: string; controller: string }[] = [];
  for (const death of live) {
    const cand = collectDieCandidates(ctx, death).find((c) => !c.optional);
    if (cand) {
      entries.push({ controller: cand.controller, death, source: cand.sourceCardId });
    }
  }
  if (entries.length < 2 || new Set(entries.map((e) => e.source)).size < 2) {
    return undefined;
  }
  const controllers = new Set(entries.map((e) => e.controller));
  // Cross-controller order stays turn order (373.1).
  if (controllers.size !== 1) {
    return undefined;
  }
  // Order only matters when a dying object shields ANOTHER dying object.
  if (!entries.some((e) => e.source !== e.death && live.includes(e.source))) {
    return undefined;
  }
  return {
    items: entries.map((e) => ({ cardId: e.source, key: e.death })),
    playerId: [...controllers][0] as string,
  };
}

function processBatch(ctx: Ctx, state: BatchState, opts: DieBatchOptions): DieBatchResult {
  const draft = ctx.draft;
  const canPrompt = (): boolean => opts.canPrompt && !draft.pendingChoice;

  // rule 373.1 — batch-wide ordering of order-sensitive deaths, asked before
  // any replacement of the batch is applied.
  if (state.batchOrdered !== true && opts.shieldsOnly !== true) {
    const question = batchOrderQuestion(ctx, state);
    if (question && canPrompt()) {
      draft.pendingChoice = {
        items: question.items,
        playerId: question.playerId,
        prompt: "Order these deaths' replacement effects (first = applied first)",
        resume: { kind: "die-batch-order" },
        type: "order",
      };
      return { dying: [], replaced: [...state.replaced], suspended: true };
    }
    state.batchOrdered = true;
  }

  for (let guard = 0; guard < 256 && state.queue.length > 0; guard++) {
    const cardId = state.queue[0] as string;
    if (RUNNING.has(cardId) || !stillOnBoard(ctx, cardId)) {
      // Being killed BY a running replacement (not replaceable again), or
      // already gone (a replacement moved it): nothing to decide.
      state.queue.shift();
      (stillOnBoard(ctx, cardId) ? state.dying : state.replaced).push(cardId);
      continue;
    }

    // rule 371.2 — optional costed shields first.
    const optional = offerOptionalShield(ctx, cardId, opts);
    if (optional === "prompted") {
      return { dying: [], replaced: [...state.replaced], suspended: true };
    }
    if (optional === "applied") {
      state.queue.shift();
      state.replaced.push(cardId);
      continue;
    }

    // rule 373.2 / 373.2.a — a replacement effect gets ONE uninterrupted
    // sequence per batch: one that already ran is done for this batch, even if
    // a later replacement moved its source somewhere it would now match again
    // (Soraka recalled by Guardian Angel does not save a second unit).
    let cands = collectDieCandidates(ctx, cardId).filter((c) => state.spent?.includes(c.id) !== true);
    // rule 321 / 323.5 — damage-time pass: only costed shields are consulted;
    // "if this would die" replacements belong to the Cleanup after the item.
    if (opts.shieldsOnly === true) {
      cands = cands.filter((c) => c.optional !== undefined);
    }

    // rule 372 — several replacements for ONE death: its controller orders them.
    const chosenOrder = state.orders[cardId];
    if (cands.length >= 2 && chosenOrder === undefined) {
      if (canPrompt()) {
        draft.pendingChoice = {
          items: cands.map((c) => ({ cardId: c.sourceCardId, key: c.key })),
          playerId: controllerOf(ctx, cardId),
          prompt: "Order the replacement effects that apply to this death (first = applied first)",
          resume: { dyingCardId: cardId, kind: "die-order" },
          sourceCardId: cardId,
          type: "order",
        };
        return { dying: [], replaced: [...state.replaced], suspended: true };
      }
      state.orders[cardId] = cands.map((c) => c.key);
    }
    if (chosenOrder !== undefined) {
      const rank = (k: string): number => {
        const i = chosenOrder.indexOf(k);
        return i < 0 ? Number.MAX_SAFE_INTEGER : i;
      };
      cands = [...cands].sort((a, b) => rank(a.key) - rank(b.key));
    }

    let replaced = false;
    let suspended = false;
    for (const c of cands) {
      if (!stillOnBoard(ctx, cardId)) {
        replaced = true;
        break;
      }
      if (!isLive(ctx, cardId, c)) {
        continue;
      }
      // rule 371.2 — an optional board replacement ("its controller may pay …
      // instead"): unpayable ⇒ skipped; otherwise its payer is asked once per
      // event (asked before and still dying ⇒ it was declined, 371.2.b — not
      // applied, nothing consumed). Accepting pays and applies it through the
      // opt-in reducer, which heals the unit out of this batch.
      if (c.optional) {
        const askedFor = (state.asked ??= {});
        const asked = (askedFor[cardId] ??= []);
        if (asked.includes(c.id) || !canPayCost(draft, c.optional.payer, c.optional.cost)) {
          continue;
        }
        // rule 371.2 (rule-id: ogn-269-298 The Boss) — "pay [rainbow], exhaust
        // ME, and …": an already-exhausted source cannot pay, so nobody is asked.
        if ((c.optional.cost as { exhaust?: unknown }).exhaust === true) {
          const meta = ctx.cards.getCardMeta?.(c.sourceCardId as CoreCardId) as
            | { exhausted?: boolean; __flags?: { exhausted?: boolean } }
            | undefined;
          if (meta?.exhausted === true || meta?.__flags?.exhausted === true) {
            continue;
          }
        }
        const repl = c.match?.replacement as ExecutableEffect | "prevent" | undefined;
        if (!repl || repl === "prevent" || typeof repl !== "object") {
          continue;
        }
        if (!canPrompt()) {
          // No way to ask: an optional effect is simply not applied.
          continue;
        }
        asked.push(c.id);
        draft.pendingChoice = {
          playerId: c.optional.payer,
          resolved: {
            cardId: c.sourceCardId,
            controller: c.optional.payer,
            effect: repl,
            id: `die-replacement-${cardId}`,
            optInCost: c.optional.cost,
            targets: [cardId],
            triggerEvent: { cardId, type: "die" },
            triggered: true,
            type: "ability",
          },
          sourceCardId: c.sourceCardId,
          suspendedDeathCardId: cardId,
          ...(opts.kill
            ? { suspendedKill: { by: opts.kill.cause.by ?? c.optional.payer, source: opts.kill.cause.source ?? c.sourceCardId } }
            : {}),
          type: "opt-in",
        } as typeof draft.pendingChoice;
        suspended = true;
        break;
      }
      // rule 373 / 373.2 — a replacement that spends itself but matches other
      // deaths of this batch too: its controller decides which it saves first.
      if (c.singleUse && !state.assigned.includes(c.id)) {
        const others = state.queue
          .slice(1)
          .filter((other) => stillOnBoard(ctx, other) && collectDieCandidates(ctx, other).some((x) => x.id === c.id));
        if (others.length > 0 && canPrompt()) {
          draft.pendingChoice = {
            max: 1,
            min: 1,
            options: [cardId, ...others].map(itemFor),
            playerId: c.controller,
            prompt: "Choose which death this replacement effect applies to",
            resume: { kind: "die-assign", replacementId: c.id },
            semantics: "replacement-assign",
            sourceCardId: c.sourceCardId,
            type: "pick-many",
          };
          suspended = true;
          break;
        }
        state.assigned.push(c.id);
      }
      if (applyCandidate(ctx, cardId, c)) {
        replaced = true;
        // rule 373.2 — that ONE sequence covers every other simultaneous death
        // this same replacement matches RIGHT NOW (Soraka standing here saves
        // every smaller unit here at once); afterwards it is spent for the batch.
        if (c.kind === "board" && !c.singleUse) {
          (state.spent ??= []).push(c.id);
          for (const other of state.queue.slice(1)) {
            if (!stillOnBoard(ctx, other)) {
              continue;
            }
            const again = collectDieCandidates(ctx, other).find(
              (x) => x.id === c.id && x.optional === undefined,
            );
            if (again && applyCandidate(ctx, other, again)) {
              state.replaced.push(other);
            }
          }
          state.queue = state.queue.filter((id, i) => i === 0 || !state.replaced.includes(id));
        }
        break;
      }
    }
    if (suspended) {
      return { dying: [], replaced: [...state.replaced], suspended: true };
    }
    state.queue.shift();
    (replaced ? state.replaced : state.dying).push(cardId);
  }

  return {
    // rule 321 / 323.5 — the damage-time pass never kills: units the shields did
    // not save stay standing until the Cleanup after the resolving item, which
    // re-detects them and consults the death-class replacements then.
    dying: opts.shieldsOnly === true ? [] : state.dying.filter((id) => stillOnBoard(ctx, id)),
    replaced: [...state.replaced],
    suspended: false,
  };
}

/**
 * Finish a Kill-instruction / cost / [Temporary] batch that parked a prompt:
 * re-run the batch with the recorded answers, then take the unreplaced cards
 * off the board together and publish their events (rule 373.1.a).
 * No-op when no such batch is waiting.
 */
export function continueKillBatch(
  ctx: Ctx,
  fire: Parameters<typeof emitLeaveEvents>[2],
): DieBatchResult | undefined {
  const kill = ctx.draft.dieBatch?.kill as DieBatchOptions["kill"] | undefined;
  const queue = ctx.draft.dieBatch?.queue;
  if (!kill || !queue) {
    return undefined;
  }
  const result = runDieBatch(ctx, [...queue], { canPrompt: true, kill });
  if (result.suspended) {
    return result;
  }
  const snaps = snapshotBatch(ctx, result.dying);
  const results = result.dying.map((id) =>
    leaveBoard(ctx, id, kill.to as LeaveDestination, kill.cause, { lki: snaps.get(id), replacements: "skip" }),
  );
  emitLeaveEvents(ctx, results, fire);
  return result;
}

/**
 * Apply the answer of a `die-order` / `die-assign` prompt to `draft.dieBatch`.
 * The caller then re-runs the batch (cleanup re-detects lethal damage; a Kill
 * batch continues through {@link continueKillBatch}).
 */
export function recordDieBatchAnswer(
  draft: RiftboundGameState,
  resume:
    | { kind: "die-order"; dyingCardId: string }
    | { kind: "die-assign"; replacementId: string }
    | { kind: "die-batch-order" },
  answer: { orderedKeys?: readonly string[]; pickedKeys?: readonly string[]; defaultOrder?: readonly string[] },
): void {
  const state = draft.dieBatch;
  if (!state) {
    return;
  }
  // rule 373.1 — the chosen death order for the whole batch; first = its
  // replacement applies first.
  if (resume.kind === "die-batch-order") {
    const order =
      answer.orderedKeys && answer.orderedKeys.length > 0 ? answer.orderedKeys : (answer.defaultOrder ?? []);
    state.batchOrdered = true;
    state.queue = [
      ...order.filter((id) => state.queue.includes(id)),
      ...state.queue.filter((id) => !order.includes(id)),
    ];
    return;
  }
  if (resume.kind === "die-order") {
    const order = answer.orderedKeys && answer.orderedKeys.length > 0 ? answer.orderedKeys : (answer.defaultOrder ?? []);
    state.orders[resume.dyingCardId] = [...order];
    return;
  }
  const first = answer.pickedKeys?.[0];
  state.assigned.push(resume.replacementId);
  if (first !== undefined && state.queue.includes(first)) {
    state.queue = [first, ...state.queue.filter((id) => id !== first)];
  }
}

/** Is a Kill-instruction batch waiting to be finished after a prompt? */
export function hasSuspendedKillBatch(draft: RiftboundGameState): boolean {
  return draft.dieBatch?.kill !== undefined;
}
