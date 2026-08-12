/**
 * What an OPEN PROMPT would charge if it were accepted — the one place the
 * engine answers "is the game standing in a Pay step right now, and for how
 * much?".
 *
 * rule 429.3 / 357.1.a — a Reaction [Add] ability (a Basic Rune's
 * "[Exhaust]: Add [1]" / "Recycle this: Add [C]") may be activated ANY time a
 * cost must be paid. DESIGN.md §Paying costs turns that into the manual-pay
 * rule this file serves: the prompt STAYS OPEN while the payer taps runes, and
 * only then do they accept. So every prompt whose acceptance charges resources
 * must (a) keep the rune moves legal while it is open and (b) advertise "yes"
 * as reachable-after-tapping rather than hiding it — otherwise the player is
 * forced to pre-tap before the ability is even offered, which is exactly the
 * Blade Dancer / Fiora bug ("no Yes option unless I pre-recycled").
 */

import type { RiftboundGameState } from "../../types";
import { getGlobalCardRegistry } from "../../operations/card-lookup";

/** The resource part of what accepting an open prompt would charge. */
export interface PromptResourceCost {
  /** Seat being asked to pay. */
  readonly payerId: string;
  readonly energy: number;
  /** Power pips owed, by domain string ("order", "rainbow", "fury|order", …). */
  readonly power: readonly string[];
  /**
   * True when the amount is not fixed by the prompt itself — "pay any amount of
   * [rainbow]" (204.3.b), or a pick whose price is the CARD the player names
   * (419.2.a). The rune window opens all the same; there is just no single
   * shortfall to quote.
   */
  readonly openEnded: boolean;
}

/** The top-up a prompt's "yes" still needs before it can be paid. */
export interface NeedsAdd {
  readonly energy?: number;
  readonly power?: Readonly<Record<string, number>>;
  /** Player-facing hint, e.g. "tap a rune, or recycle an [order] rune first". */
  readonly reason: string;
}

type Bag = Record<string, unknown>;

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function pips(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((p): p is string => typeof p === "string") : [];
}

/**
 * rule 128.6 / 419.2.a — is this `opt-in` the "you may play it?" confirm of an
 * instructed play that still costs something? Both confirm shapes are covered:
 * the pre-chain one (`playConfirmSpec`, raised by `beginPlay`) and the pending
 * item's own (`playConfirm` + `playItemId`, raised by `continueEffectPlay`).
 * A play under a fully waived cost mode charges nothing, so it is no Pay step.
 */
function playConfirmCharges(state: RiftboundGameState, p: Bag): boolean {
  let spec = p.playConfirmSpec as { costMode?: { kind?: string } } | undefined;
  if (spec === undefined && p.playConfirm === true && typeof p.playItemId === "string") {
    const items = (state.interaction?.chain?.items ?? []) as readonly {
      id?: string;
      play?: { costMode?: { kind?: string } };
    }[];
    spec = items.find((it) => it.id === p.playItemId)?.play;
  }
  if (spec === undefined) {
    return false;
  }
  const kind = spec.costMode?.kind;
  return kind !== "ignore-all" && kind !== "ignore-any-and-all";
}

/**
 * The cost `state.pendingChoice`'s acceptance would charge, or `undefined` when
 * the open prompt is not a Pay step at all (a costless "you may …", an ordering
 * prompt, a mandatory target pick) — those keep the board frozen, so no Add
 * ability may be activated during them.
 *
 * Prompt kinds that ARE a Pay step:
 *  - `pay-x`                      rule 204.3.b / 444.2.c — name X, paid on the spot.
 *  - `reveal-and-pick` → play     rule 419.2.a — the pick commits to the card's remaining cost.
 *  - `opt-in` carrying a cost     rule 383.3.b / 404.1 / 444.2.c — a trigger's own
 *                                 "you may pay [C] to …", an elected optional additional
 *                                 cost, a [Deflect] surcharge, an instructed play's confirm,
 *                                 a resolving spell's ransom, an activated ability's mid-
 *                                 resolution Pay.
 *  - `choose-target` / `pick-many` with `deflectTax`   rule 809.1.c.1 — the surcharge is
 *                                 owed as the target is CHOSEN, so the pick is a payment.
 *
 * Object-only costs ("kill 3 other friendly units") are not resource costs: a
 * rune can never fund them, so they open no window (rule-id ven-067-166).
 */
export function promptPayableCost(
  state: RiftboundGameState,
  pending: unknown = state.pendingChoice,
): PromptResourceCost | undefined {
  const pc = pending as (Bag & { type?: string }) | undefined;
  if (!pc?.type) {
    return undefined;
  }
  const payer = (pc.playerId ?? pc.prompter) as string | undefined;

  // rule 204.3.b / 444.2.c (rule-id: ogn-268-298 Bullet Time) — "pay any amount
  // of [rainbow]" is paid ON RESOLUTION, and that prompt IS the Pay step.
  if (pc.type === "pay-x") {
    return typeof pc.playerId === "string"
      ? { energy: 0, openEnded: true, payerId: pc.playerId, power: [] }
      : undefined;
  }

  // rule 419.2.a / 444.2.c (rule-id: sfd-188-221 Void Rush) — picking a card the
  // instruction then PLAYS commits the prompter to paying that card's remaining
  // cost, so the pick prompt carries a Pay step of its own.
  if (pc.type === "reveal-and-pick") {
    return pc.onPicked === "play" && typeof pc.prompter === "string"
      ? { energy: 0, openEnded: true, payerId: pc.prompter, power: [] }
      : undefined;
  }

  // rule 809.1.c.1 / 429.3 — a surcharged `choose-target` / `pick-many` (a
  // [Deflect] tax, or a keyword surcharge a static imposes) is a Pay step: the
  // surcharge is owed as the target is CHOSEN, so the chooser may Add runes
  // while the prompt is open and answer once the pool covers the option they
  // want (`surchargePayability` re-derives each option after every Add). Which
  // option is named decides the amount, so no single shortfall is quoted here.
  if (pc.type === "choose-target" || pc.type === "pick-many") {
    return promptIsSurcharged(pc) && typeof pc.playerId === "string"
      ? { energy: 0, openEnded: true, payerId: pc.playerId, power: [] }
      : undefined;
  }

  if (pc.type !== "opt-in" || typeof payer !== "string") {
    return undefined;
  }

  const fixed = { energy: 0, power: [] as string[] };
  const optInCost = (pc.resolved as { optInCost?: Bag } | undefined)?.optInCost;
  if (optInCost && typeof optInCost === "object") {
    fixed.energy += num(optInCost.energy);
    fixed.power.push(...pips(optInCost.power));
  }
  // rule 805.1.a — a granted [Accelerate] is an optional additional cost whose
  // price rides on the prompt rather than on `resolved.optInCost`.
  const accelerate = (pc.acceleratePlay as { cost?: Bag } | undefined)?.cost;
  if (accelerate && typeof accelerate === "object") {
    fixed.energy += num(accelerate.energy);
    fixed.power.push(...pips(accelerate.power));
  }
  // rule 809.1.c.1 / 429.3.a (ruling cb0c9c7b9d025ad8) — the [Deflect] surcharge
  // this trigger's own choice owes is Power paid at THIS prompt, in the same
  // payment as the base cost (404.1).
  const deflect = num(pc.deflectSurcharge);
  for (let i = 0; i < deflect; i++) {
    fixed.power.push("rainbow");
  }

  if (fixed.energy > 0 || fixed.power.length > 0) {
    return { ...fixed, openEnded: false, payerId: payer };
  }

  // Costs whose amount lives elsewhere than the prompt: a resolving spell's
  // ransom (sfd-136-221 Hard Bargain), the "you may pay [C]. If you do, …"
  // elected as the item resolves (355.10.c.1), an elected optional additional
  // cost of a pending play (355.1.a / 357), and an instructed play's confirm
  // (128.6 / 419.2.a). All are real Pay steps; only their size is not fixed here.
  if (
    pc.counterRansom !== undefined ||
    pc.payChoice !== undefined ||
    (pc.playItemId !== undefined && pc.playConfirm !== true) ||
    playConfirmCharges(state, pc)
  ) {
    return { energy: 0, openEnded: true, payerId: payer, power: [] };
  }
  return undefined;
}

/** True when `playerId` is the seat being asked to pay by the open prompt. */
export function isPayPromptFor(state: RiftboundGameState, playerId: string): boolean {
  return promptPayableCost(state)?.payerId === playerId;
}

/** Could one unit of `produced` Power of Domain `domain` pay the pip `pip`? */
function domainPays(domain: string, pip: string): boolean {
  // rule 135.2.e.5.b — universal ([rainbow]) Power pays any pip, and a
  // [rainbow] pip is paid by Power of any Domain. rule 135.2.e.6.c — a hybrid
  // pip takes either of its printed Domains, never a third.
  return domain === "rainbow" || pip === "rainbow" || pip === domain || pip.split("|").includes(domain);
}

// ---------------------------------------------------------------------------
// What a Reaction [Add] actually PRODUCES (rule 429.3.a / 605.2)
// ---------------------------------------------------------------------------

/** The pool entry one activation of a Reaction [Add] ability would create. */
export interface AddYield {
  readonly energy: number;
  /** Power by Domain; "rainbow" is universal Power (135.2.e.5.b). */
  readonly power: Readonly<Record<string, number>>;
}

const NO_YIELD: AddYield = { energy: 0, power: {} };

function mergeYield(a: AddYield, b: AddYield): AddYield {
  const power: Record<string, number> = { ...a.power };
  for (const [d, n] of Object.entries(b.power)) {
    power[d] = (power[d] ?? 0) + (n ?? 0);
  }
  return { energy: a.energy + b.energy, power };
}

function isEmptyYield(y: AddYield): boolean {
  return y.energy <= 0 && Object.values(y.power).every((n) => (n ?? 0) <= 0);
}

/**
 * rule 605.2 / 429.3.a — what an ability's effect would put in the pool, or
 * `undefined` when it is not an immediate [Add] (only those resolve off the
 * chain, so only those can fund a payment that is already being made).
 *
 * The shapes an [Add] can wear, all priced by what they actually produce so
 * this can never drift from `isImmediateAddEffect`, which decides the same
 * question for legality:
 *  - `add-resource` / `add`  the printed pips, `amount` times (rule 429.1).
 *  - `conditional`           "[Add] 1. If [Empowered], [Add] 2 instead"
 *                            (ven-075-166) — priced at the BEST branch, since
 *                            reachability asks what COULD still be added.
 *  - `sequence`              a wrapper the parser emits around a single Add.
 */
export function addYieldOfEffect(effect: unknown): AddYield | undefined {
  const e = effect as
    | (Bag & { type?: string; then?: unknown; else?: unknown; effects?: unknown })
    | undefined;
  const type = e?.type;
  if (type === "add-resource" || type === "add") {
    // rule 429.4 (ogn-247-298 Daughter of the Void, "Use only to play spells")
    // — an EARMARKED Add makes Power that most costs cannot spend. Activating it
    // stays legal (429.3), but it must never be counted as reachable funding for
    // a prompt, or "yes" would be advertised on Power that can never pay it.
    if (e?.restriction !== undefined) {
      return undefined;
    }
    // rule 429.1 — a variable `amount` ("[Add] that much [rainbow]") promises
    // no fixed size; count the printed pips once.
    const times = typeof e?.amount === "number" ? Math.max(0, e.amount) : 1;
    const power: Record<string, number> = {};
    for (const domain of pips(e?.power)) {
      power[domain] = (power[domain] ?? 0) + times;
    }
    return { energy: num(e?.energy) * times, power };
  }
  if (type === "conditional") {
    const branches = [e?.then, e?.else]
      .filter((b) => b !== undefined)
      .map((b) => addYieldOfEffect(b));
    if (branches.length === 0 || branches.some((b) => b === undefined)) {
      return undefined;
    }
    let best = NO_YIELD;
    for (const b of branches as AddYield[]) {
      const total = (y: AddYield) =>
        y.energy + Object.values(y.power).reduce<number>((a, n) => a + (n ?? 0), 0);
      if (total(b) > total(best)) {
        best = b;
      }
    }
    return best;
  }
  if (type === "sequence" && Array.isArray(e?.effects)) {
    let total = NO_YIELD;
    for (const sub of e.effects as unknown[]) {
      const y = addYieldOfEffect(sub);
      if (!y) {
        return undefined;
      }
      total = mergeYield(total, y);
    }
    return total;
  }
  return undefined;
}

/**
 * rule 605.2 / 429.3.a — the immediate-[Add] test the activation enumerator
 * uses. Kept here beside the pricing so legality and reachability can never
 * disagree about what counts as an Add.
 */
export function isImmediateAddEffect(effect: unknown): boolean {
  const type = (effect as { type?: string } | undefined)?.type;
  if (type === "add-resource" || type === "add") {
    return true;
  }
  if (type === "conditional") {
    const branch = effect as { then?: unknown; else?: unknown };
    if (!branch.then || !isImmediateAddEffect(branch.then)) {
      return false;
    }
    return branch.else === undefined || isImmediateAddEffect(branch.else);
  }
  return false;
}

/** An activated ability as the registry stores it. */
interface AbilityLike {
  readonly type?: string;
  readonly effect?: unknown;
}

/** rule 429.3.a — what activating this ability would ADD, if it is an Add at all. */
export function addYieldOfAbility(ability: unknown): AddYield | undefined {
  const a = ability as AbilityLike | undefined;
  if (a?.type !== "activated") {
    return undefined;
  }
  const y = addYieldOfEffect(a.effect);
  return y && !isEmptyYield(y) ? y : undefined;
}

/**
 * rule 429.3.a — what an offered `activateAbility` would put in the pool. The
 * ability is looked up the way the enumerator names it (`sourceCardId` for a
 * copied/inherited line, else `cardId`), so an Add that the enumerator offers
 * is an Add this prices.
 */
function addFromActivation(
  params: Readonly<Record<string, unknown>> | undefined,
): AddYield | undefined {
  const cardId = params?.sourceCardId ?? params?.cardId;
  const index = params?.abilityIndex;
  if (typeof cardId !== "string" || typeof index !== "number") {
    return undefined;
  }
  return addYieldOfAbility((getGlobalCardRegistry().getAbilities(cardId) ?? [])[index]);
}

/** A move as the harness/enumerators shape it. */
interface MoveLike {
  readonly moveId: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

/**
 * rule 164.2.a/b / 594 / 429.3.a — what the seat's Reaction [Add] abilities
 * could still put in the pool, read straight off the legal moves so the answer
 * can never drift from what the enumerators actually allow. Each `exhaustRune`
 * is +1 Energy; each `recycleRune` variant is +1 Power of that variant's
 * Domain; each offered `activateAbility` whose effect is an immediate [Add]
 * (a Gold's "Kill this, [Exhaust]: [Add] [rainbow]", a legend's "[Exhaust]:
 * Add", a battlefield's Add line) counts for exactly what it produces.
 * A rune may be tapped AND then recycled (594 puts no readiness condition on
 * recycling), so the two totals are independent.
 */
export function potentialAddsFromMoves(moves: readonly MoveLike[]): {
  energy: number;
  power: Record<string, number>;
} {
  let energy = 0;
  const power: Record<string, number> = {};
  const seenRecycle = new Set<string>();
  const seenActivation = new Set<string>();
  for (const m of moves) {
    if (m.moveId === "exhaustRune") {
      energy += 1;
      continue;
    }
    // rule 429.3.a (sfd-t03 Gold) — a rune is not the only Reaction [Add]: a
    // card's "[Exhaust]: [Add] …" is an Add in the same window, so its offer
    // counts toward what the seat could still put in the pool. One card's one
    // ability is one Add however many variants (kill/discard picks) it fans out to.
    if (m.moveId === "activateAbility") {
      const add = addFromActivation(m.params);
      if (!add) {
        continue;
      }
      const key = `${String(m.params?.cardId ?? "")}#${String(m.params?.abilityIndex ?? "")}`;
      if (seenActivation.has(key)) {
        continue;
      }
      seenActivation.add(key);
      energy += add.energy;
      for (const [domain, n] of Object.entries(add.power)) {
        power[domain] = (power[domain] ?? 0) + (n ?? 0);
      }
      continue;
    }
    if (m.moveId === "recycleRune") {
      const domain = m.params?.domain;
      const runeId = m.params?.runeId;
      if (typeof domain !== "string") {
        continue;
      }
      // One rune yields one Power however many domain variants it enumerates.
      const key = typeof runeId === "string" ? runeId : `${domain}:${power[domain] ?? 0}`;
      if (seenRecycle.has(key)) {
        continue;
      }
      seenRecycle.add(key);
      power[domain] = (power[domain] ?? 0) + 1;
    }
  }
  return { energy, power };
}

/**
 * rule 135.2.e.5.b / 135.2.e.6.c — spend named-Domain Power first, then
 * universal ([rainbow]) Power for whatever is left; a hybrid pip ("fury|order")
 * takes either of its Domains but never a third one. Returns what is still
 * owed after the given pool is drained, or `undefined` when the pool covers it.
 */
function shortfall(
  pool: { energy: number; power: Readonly<Record<string, number>> },
  cost: PromptResourceCost,
): { energy: number; power: Record<string, number> } | undefined {
  const remaining: Record<string, number> = {};
  for (const [d, v] of Object.entries(pool.power)) {
    if (typeof v === "number" && v > 0) {
      remaining[d] = v;
    }
  }
  const owed: Record<string, number> = {};
  const wildLast: string[] = [];
  for (const pip of cost.power) {
    if (pip === "rainbow" || pip.includes("|")) {
      wildLast.push(pip);
      continue;
    }
    if ((remaining[pip] ?? 0) > 0) {
      remaining[pip] = (remaining[pip] ?? 0) - 1;
    } else if ((remaining.rainbow ?? 0) > 0) {
      remaining.rainbow = (remaining.rainbow ?? 0) - 1;
    } else {
      owed[pip] = (owed[pip] ?? 0) + 1;
    }
  }
  // [rainbow] / hybrid pips are paid last: any Domain still in the pool covers
  // a [rainbow], and either printed Domain covers a hybrid.
  for (const pip of wildLast) {
    const usable =
      pip === "rainbow"
        ? Object.keys(remaining).filter((d) => (remaining[d] ?? 0) > 0)
        : pip.split("|").filter((d) => (remaining[d] ?? 0) > 0);
    const from = usable[0];
    if (from !== undefined) {
      remaining[from] = (remaining[from] ?? 0) - 1;
    } else {
      owed[pip] = (owed[pip] ?? 0) + 1;
    }
  }
  const owedEnergy = Math.max(0, cost.energy - pool.energy);
  if (owedEnergy === 0 && Object.keys(owed).length === 0) {
    return undefined;
  }
  return { energy: owedEnergy, power: owed };
}

function describePips(power: Readonly<Record<string, number>>): string[] {
  const out: string[] = [];
  for (const [domain, n] of Object.entries(power)) {
    for (let i = 0; i < (n ?? 0); i++) {
      out.push(`[${domain}]`);
    }
  }
  return out;
}

/**
 * rule 429.3 / DESIGN.md §Paying costs — "yes" is unaffordable RIGHT NOW but
 * would be affordable once the seat's Reaction [Add] abilities are activated.
 * Returns the top-up still needed (so the UI can say "tap an [order] rune
 * first" and keep the button visible-but-disabled), or `undefined` when the
 * prompt is already payable, is not a Pay step, or can never be funded by Adds.
 */
export function promptNeedsAdd(
  state: RiftboundGameState,
  playerId: string,
  legalMoves: readonly MoveLike[],
  pending: unknown = state.pendingChoice,
): NeedsAdd | undefined {
  const cost = promptPayableCost(state, pending);
  if (!cost || cost.payerId !== playerId || cost.openEnded) {
    return undefined;
  }
  const pool = state.runePools[playerId];
  const have = { energy: num(pool?.energy), power: (pool?.power ?? {}) as Record<string, number> };
  const short = shortfall(have, cost);
  if (!short) {
    return undefined;
  }
  const adds = potentialAddsFromMoves(legalMoves);
  // Could the Adds still on the table close the gap? Energy comes only from
  // tapping; a named-Domain pip only from an Add that produces that Domain (a
  // recycle of a rune of that Domain, or a Gold-style "[Add] [rainbow]").
  if (short.energy > adds.energy) {
    return undefined;
  }
  // rule 429.3 / DESIGN §Paying costs — the prompt is "genuinely unpayable", and
  // so hidden, only when NOTHING the seat can still do puts a usable resource
  // toward it. Anything left in the pool after `shortfall` has drained it is by
  // construction unable to pay what is owed (calm Power against a [fury] pip,
  // ven-009-166), so the only question is whether a REACTION [Add] could:
  //  - an Add of a Domain that pays one of the owed pips keeps "yes" alive even
  //    when it covers only part of the bill — a seat one Gold short of four
  //    pips is short, not locked out, and 429.3 lets them find the rest
  //    (rule-id sfd-214-221 × sfd-t03);
  //  - no such Add at all, and the prompt is genuinely only declinable
  //    (383.3.b.1 / 404.2), so it is hidden rather than dangled.
  const totalAddable = Object.entries(adds.power)
    .filter(([domain, n]) => (n ?? 0) > 0 && Object.keys(short.power).some((pip) => domainPays(domain, pip)))
    .reduce<number>((a, [, n]) => a + (n ?? 0), 0);
  // …or the pool has already covered part of the bill. Whatever is LEFT in the
  // pool after `shortfall` has drained it could not pay what is owed (calm Power
  // against a [fury] pip), so the test is what the pool has already absorbed:
  // a seat three pips into a four-pip payment with its last Add spent is short,
  // not locked out (rule-id sfd-214-221 × sfd-t03).
  // Energy already in hand does not count here: a full Energy pool next to a
  // [fury] pip nothing can make is still "genuinely unpayable" (404.2).
  const owedPips = Object.values(short.power).reduce<number>((a, n) => a + (n ?? 0), 0);
  const pipsPaidFromPool = cost.power.length - owedPips;
  if (owedPips > 0 && totalAddable === 0 && pipsPaidFromPool === 0) {
    return undefined;
  }
  const parts = [
    ...(short.energy > 0 ? [`tap ${short.energy === 1 ? "a rune" : `${short.energy} runes`}`] : []),
    ...(Object.keys(short.power).length > 0
      ? [`recycle a rune for ${describePips(short.power).join("")}`]
      : []),
  ];
  return {
    ...(short.energy > 0 ? { energy: short.energy } : {}),
    ...(Object.keys(short.power).length > 0 ? { power: short.power } : {}),
    reason: `${parts.join(" and ")} first`,
  };
}

// ---------------------------------------------------------------------------
// Pick-time payability of a SURCHARGED option (rule 809.1.c/d + 429.3)
// ---------------------------------------------------------------------------

/**
 * rule 809.1.c.1 — a prompt whose PICK carries a price: a [Deflect]-taxed
 * `choose-target` (`deflectTax`) or the `pick-many` target set whose aggregate
 * surcharge is gated (`constraint.deflectAffordable`, rule 355.14.d).
 */
export function promptIsSurcharged(pending: unknown): boolean {
  const pc = pending as
    | { deflectTax?: boolean; constraint?: { deflectAffordable?: boolean } }
    | undefined;
  return pc?.deflectTax === true || pc?.constraint?.deflectAffordable === true;
}

/** rule 135.2.e — the seat's pooled Power, all Domains (what a surcharge draws on). */
export function pooledPowerOf(state: RiftboundGameState, playerId: string): number {
  const power = (state.runePools?.[playerId]?.power ?? {}) as Partial<Record<string, number>>;
  return Object.values(power).reduce<number>((a, b) => a + (b ?? 0), 0);
}

/** The rune-pool reader the raise-time helpers need (the engine's zone accessor). */
export interface RunePoolZones {
  getCardsInZone: (zone: never, player: never) => readonly unknown[];
}

/**
 * The extra board readers `addablePowerOf` needs to see Reaction [Add]
 * abilities that are NOT runes. All optional: without `state` the answer stays
 * the rune-only one, and without `getFlag` an already-exhausted host is counted
 * (over-counting only keeps a candidate LISTED, which is the direction 809.1.d
 * asks for — a candidate is dropped only when nothing could fund it).
 */
export interface AddSourceIo {
  readonly state?: RiftboundGameState;
  readonly getFlag?: (cardId: never, flag: string) => unknown;
  readonly getCardController?: (cardId: never) => unknown;
}

/** The board zones a Reaction [Add] ability can be activated from (rule 343.1/174.8). */
function boardZonesOf(state: RiftboundGameState | undefined): string[] {
  const zones = ["base", "legendZone", "battlefieldRow"];
  for (const bfId of Object.keys(state?.battlefields ?? {})) {
    zones.push(`battlefield-${bfId}`);
  }
  return zones;
}

/**
 * rule 429.3 / 429.3.a / 594 — how much more Power the seat could still ADD
 * while a prompt is open. Two sources, both priced by what they produce:
 *  - every rune in their Rune Pool — one Power each. Recycling has no readiness
 *    condition (594) and a surcharge takes Power of ANY Domain (721.1.c), so
 *    the rune count alone is that half's ceiling.
 *  - every OTHER Reaction [Add] on a permanent they control — a Gold's "Kill
 *    this, [Exhaust]: [Add] [rainbow]" (sfd-t03), a legend's or battlefield's
 *    Add line. 429.3.a admits these in exactly the same window as a rune, so
 *    counting only runes made a Gold-only seat's option "unfundable".
 * Only the Power half counts here: a surcharge is Power, never Energy (164.2.a).
 * Without a zone reader nothing is assumed.
 */
export function addablePowerOf(
  playerId: string,
  zones: RunePoolZones | undefined,
  io?: AddSourceIo,
): number {
  if (!zones?.getCardsInZone) {
    return 0;
  }
  const read = (zone: string): readonly unknown[] => {
    try {
      return zones.getCardsInZone(zone as never, playerId as never);
    } catch {
      return [];
    }
  };
  let total = read("runePool").length;
  if (!io?.state) {
    return total;
  }
  const registry = getGlobalCardRegistry();
  for (const zone of boardZonesOf(io.state)) {
    for (const raw of read(zone)) {
      const cardId = raw as string;
      if (typeof cardId !== "string") {
        continue;
      }
      // rule 477.1.a — a possessed permanent is activated by its CONTROLLER.
      const controller = io.getCardController?.(cardId as never);
      if (typeof controller === "string" && controller !== playerId) {
        continue;
      }
      for (const ability of registry.getAbilities(cardId) ?? []) {
        const add = addYieldOfAbility(ability);
        const power = add
          ? Object.values(add.power).reduce<number>((a, n) => a + (n ?? 0), 0)
          : 0;
        if (power <= 0) {
          continue;
        }
        // An "[Exhaust]:" line on an already-exhausted host is not activatable.
        const cost = (ability as { cost?: { exhaust?: unknown } } | undefined)?.cost;
        if (cost?.exhaust === true && io.getFlag?.(cardId as never, "exhausted") === true) {
          continue;
        }
        total += power;
      }
    }
  }
  return total;
}

/** What a surcharged option costs and whether the seat can answer with it. */
export interface SurchargePayability {
  readonly surcharge: number;
  /** The pool covers it RIGHT NOW — answering with this option is legal. */
  readonly payableNow: boolean;
  /** It is payable now, or would be after the seat's Reaction [Add] abilities. */
  readonly reachable: boolean;
  /** Set only while `reachable && !payableNow`: the top-up still owed. */
  readonly needsAdd?: NeedsAdd;
}

/**
 * rule 809.1.d / 429.3 — pick-time payability of ONE option's surcharge.
 *
 * `addable` is what Reaction [Add] abilities could still put in the pool
 * (`addablePowerOf` from a zone reader, or `potentialAddsFromMoves` from the
 * legal moves). An option the pool cannot cover but an Add could is still a
 * legal candidate — it stays in the option list carrying `needsAdd`, and only
 * the ANSWER is refused until the pool actually covers it. An option nothing
 * could ever fund is not a legal choice at all (809.1.d).
 */
export function surchargePayability(
  state: RiftboundGameState,
  playerId: string,
  surcharge: number,
  addable = 0,
): SurchargePayability {
  const pooled = pooledPowerOf(state, playerId);
  const payableNow = surcharge <= pooled;
  const reachable = surcharge <= pooled + addable;
  if (payableNow || !reachable) {
    return { payableNow, reachable, surcharge };
  }
  const owed = surcharge - pooled;
  return {
    needsAdd: {
      power: { rainbow: owed },
      reason: `recycle ${owed === 1 ? "a rune" : `${owed} runes`} for ${"[rainbow]".repeat(owed)} first`,
    },
    payableNow,
    reachable,
    surcharge,
  };
}

/**
 * rule 809.1.d — the candidates a surcharged prompt may OFFER, plus the prompt
 * fields that let every later reader re-derive their payable state. Candidates
 * whose surcharge no Add could ever fund are dropped (they are not legal
 * choices); every other candidate stays listed, however short the pool is now.
 */
export function surchargedOptions<T extends string>(
  state: RiftboundGameState,
  playerId: string,
  ids: readonly T[],
  surchargeOf: (id: T) => number,
  zones: RunePoolZones | undefined,
  io?: Omit<AddSourceIo, "state">,
): {
  options: T[];
  /** The subset the pool covers RIGHT NOW — the only ones that may be AUTO-bound (402.2). */
  payableNow: T[];
  deflectTax: boolean;
  deflectPerOption: Record<string, number>;
} {
  // rule 429.3.a — every Reaction [Add] the seat still has counts toward
  // "could this surcharge be funded", not just their runes.
  const addable = addablePowerOf(playerId, zones, { ...io, state });
  const options: T[] = [];
  const payableNow: T[] = [];
  const deflectPerOption: Record<string, number> = {};
  let deflectTax = false;
  for (const id of ids) {
    const surcharge = surchargeOf(id);
    const pay = surchargePayability(state, playerId, surcharge, addable);
    if (!pay.reachable) {
      continue;
    }
    options.push(id);
    if (pay.payableNow) {
      payableNow.push(id);
    }
    if (surcharge > 0) {
      deflectPerOption[id] = surcharge;
      deflectTax = true;
    }
  }
  return { deflectPerOption, deflectTax, options, payableNow };
}

/** The `deflectTax` / `deflectPerOption` fields to spread onto a raised prompt. */
export function surchargeFields(taxed: {
  deflectTax: boolean;
  deflectPerOption: Record<string, number>;
}): { deflectTax?: true; deflectPerOption?: Record<string, number> } {
  return taxed.deflectTax
    ? { deflectPerOption: taxed.deflectPerOption, deflectTax: true as const }
    : {};
}
