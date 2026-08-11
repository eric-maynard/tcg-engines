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

  // NOT covered (deliberately): a [Deflect]-taxed `choose-target` / `pick-many`
  // (809.1.c.1 — the surcharge is owed as the target is CHOSEN). Opening the
  // rune window there would buy nothing today: each producer bakes its option
  // list at prompt time by filtering candidates against the pool as it then
  // stands (`filterDeflectAffordable` and its five siblings) and never
  // re-derives it, so a rune added mid-prompt could not make a filtered-out
  // target reappear. Widening those budgets needs a pick-time payability gate
  // to replace the filter — tracked separately, not folded in here.

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

/** A move as the harness/enumerators shape it. */
interface MoveLike {
  readonly moveId: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

/**
 * rule 164.2.a/b / 594 — what the seat's Reaction [Add] abilities could still
 * put in the pool, read straight off the legal moves so the answer can never
 * drift from what the enumerators actually allow. Each `exhaustRune` is +1
 * Energy; each `recycleRune` variant is +1 Power of that variant's Domain.
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
  for (const m of moves) {
    if (m.moveId === "exhaustRune") {
      energy += 1;
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
  // tapping; a named-Domain pip only from recycling a rune of that Domain (or
  // any rune, for a [rainbow] pip).
  if (short.energy > adds.energy) {
    return undefined;
  }
  const totalRecyclable = Object.values(adds.power).reduce<number>((a, b) => a + (b ?? 0), 0);
  let wildOwed = 0;
  for (const [pip, n] of Object.entries(short.power)) {
    if (pip === "rainbow") {
      wildOwed += n;
      continue;
    }
    const usable = pip.includes("|")
      ? pip.split("|").reduce<number>((a, d) => a + (adds.power[d] ?? 0), 0)
      : (adds.power[pip] ?? 0);
    if (usable < n) {
      return undefined;
    }
    wildOwed += n;
  }
  if (wildOwed > totalRecyclable) {
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
