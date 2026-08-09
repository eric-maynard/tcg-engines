/**
 * rule 356 / 357 — the play COST MODEL: one description of everything that
 * determines a card's Total Cost (`getPlayCostModel`), one selection shape for
 * the choices a player makes about it (`PlayCostSelection` — which alternative,
 * which optional additional costs, paid with which objects), and one
 * computation turning model + selection into the resources owed and the object
 * payments due (`computeTotalCost`), shared by every play move's condition,
 * enumerator and reducer.
 *
 * The per-shape readers still live in `cost.ts` (leaf module); this module
 * folds them into the model so callers stop pattern-matching ability shapes.
 * Legacy move params (`paidAdditionalCost`, `sacrificeId`, `discardId`, …)
 * translate to/from a selection via `selectionFromLegacyParams` /
 * `legacyParamsFromSelection`.
 *
 * ─── "Add during payment" sub-step (rules 357.1.a / 429.3 / 204.4.b.1) ────
 * Intentionally not implemented (DESIGN.md §Paying costs): paying is MANUAL.
 * Affordability of a PLAY, an activation and a taxed move is pool-only —
 * ready runes / Gold / Seals are never credited or auto-exhausted; the player
 * taps or recycles them first (the app's right-click Recycle auto-taps for +1
 * Energy as the single convenience). What IS supported end-to-end: every
 * printed cost ALTERNATIVE — "spend a buff … if you do, ignore this spell's
 * [energy] cost", "Spend my buff:" activations, pay-[rainbow]-or-spend-buff
 * replacements — is enumerated from the model's `alternatives` even when the
 * pool is empty, and choosing it charges no Energy. Mid-RESOLUTION pays
 * ("you may pay [1]", counter ransoms) keep their prompt open while runes are
 * tapped, so 444.2.c works.
 * ───────────────────────────────────────────────────────────────────────────
 */

import type { CardId as CoreCardId } from "@tcg/core";
import type {
  AdditionalCost,
  CostComponent,
  PlayCostAlternative,
  PlayCostModel,
  PlayCostSelection,
} from "@tcg/riftbound-types";
import type { RiftboundCardMeta, RiftboundGameState } from "../../../types";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import { computeOptionalAdditionalCostFlexReduction } from "../../../operations/static-cost-reduction";
import {
  type CostExtras,
  type OptionalPlayCost,
  type PlayResourceCost,
  canPayResourceCost,
  computePlayResourceCost,
  discountOptionalPlayCost,
  getAlternatePlayCost,
  getBuffSpendCost,
  getDeflectSurcharge,
  getEffectiveSpellRepeatCost,
  getFlowCostOptionsForPlay,
  getGrantedAcceleratePlayCost,
  getKillAnyNumberCost,
  getOptionalPlayCost,
  getSacrificeCostDiscount,
  optionalPlayCostOffered,
  xCostIsPower,
} from "./cost";
import { getSelfTrashPlayCost } from "./self-trash-play";

type MetaAccessor = (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined;

/** Board/target context the model and the total-cost computation read. */
export interface CostModelContext {
  readonly board?: CostExtras["board"];
  readonly getCardMeta?: MetaAccessor;
  /** Chosen targets (Deflect is owed per opposing target — rule 809). */
  readonly targets?: readonly string[];
  /** rule 805.1.a (sfd-029-221) — false when the play comes from anywhere but the hand. */
  readonly playedFromHand?: boolean;
  /** Interactive "reduced by the Might of the unit you choose" target. */
  readonly chosenTargetId?: string;
  readonly xAmount?: number;
  readonly repeatCount?: number;
  /** rule-id: sfd-141-221 — pre-target gate: assume a "spells that choose me cost less" aura applies. */
  readonly assumeChooseDiscount?: boolean;
  /** rule 356.1.b.2 — the play ignores its Energy component. */
  readonly ignoreEnergyCost?: boolean;
}

/** Stable ids of the additional costs this module derives. */
export const ADDITIONAL_COST_IDS = {
  accelerate: "accelerate",
  accelerateGranted: "accelerate-granted",
  deflect: "deflect",
  discard: "discard",
  exhaust: "exhaust",
  kill: "kill",
  killAny: "kill-any",
  pay: "pay",
  returnToHand: "return-to-hand",
  spendBuff: "spend-buff",
  spendBuffAny: "spend-buff-any",
} as const;

/** Stable ids of the alternative costs this module derives. */
export const ALTERNATIVE_COST_IDS = {
  alt: "alt",
  flow: "flow",
  hidden: "hidden",
  selfTrash: "self-trash",
} as const;

function toComponent(cost: { energy?: number; power?: readonly string[]; xp?: number } | undefined): CostComponent {
  if (!cost) {
    return {};
  }
  return {
    ...(cost.energy ? { energy: cost.energy } : {}),
    ...(cost.power && cost.power.length > 0 ? { power: [...cost.power] } : {}),
    ...(cost.xp ? { xp: cost.xp } : {}),
  };
}

function pipsToArray(power: Partial<Record<string, number>>): string[] {
  const out: string[] = [];
  for (const [d, n] of Object.entries(power)) {
    for (let i = 0; i < (n ?? 0); i++) {
      out.push(d);
    }
  }
  return out;
}

/** Map the single `getOptionalPlayCost` descriptor onto an `AdditionalCost`. */
function additionalFromOptional(optional: OptionalPlayCost): AdditionalCost {
  const mandatory = optional.mandatory === true;
  switch (optional.kind) {
    case "accelerate": {
      return { cost: toComponent(optional.cost), id: ADDITIONAL_COST_IDS.accelerate, ifPaid: "enter-ready", mandatory: false };
    }
    case "pay": {
      const ifPaid =
        (optional.energyDiscount ?? 0) > 0
          ? { energy: optional.energyDiscount, type: "cost-reduction" }
          : optional.entersReadyIfPaid
            ? "enter-ready"
            : undefined;
      return {
        cost: toComponent(optional.cost),
        id: ADDITIONAL_COST_IDS.pay,
        mandatory,
        ...(ifPaid !== undefined ? { ifPaid } : {}),
        ...(optional.condition ? { condition: optional.condition } : {}),
      };
    }
    case "kill": {
      return { cost: { kill: optional.kill as CostComponent["kill"] }, id: ADDITIONAL_COST_IDS.kill, mandatory };
    }
    case "discard": {
      return {
        cost: { discard: optional.discard ?? 1 },
        id: ADDITIONAL_COST_IDS.discard,
        mandatory,
        ...((optional.energyDiscount ?? 0) > 0
          ? { ifPaid: { energy: optional.energyDiscount, type: "cost-reduction" } }
          : {}),
      };
    }
    case "exhaust": {
      return { cost: { exhaust: optional.exhaust as CostComponent["exhaust"] }, id: ADDITIONAL_COST_IDS.exhaust, mandatory };
    }
    case "spend-buff": {
      return {
        cost: { spendBuff: { controller: "friendly", type: "unit" } as CostComponent["spendBuff"] },
        id: ADDITIONAL_COST_IDS.spendBuff,
        mandatory,
        ...(optional.ignoresBaseCost ? { ifPaid: "ignore-cost" } : {}),
      };
    }
    case "return-to-hand": {
      return {
        cost: { returnToHand: optional.returnToHand ?? { type: "gear", controller: "friendly" } },
        id: ADDITIONAL_COST_IDS.returnToHand,
        mandatory,
      };
    }
    default: {
      return { cost: {}, id: optional.kind, mandatory };
    }
  }
}

/**
 * rule 356 — derive the cost model of `cardId` for `playerId`: printed base,
 * alternatives (356.1.a: alt cost, [Flow], own trash permission, [Hidden]),
 * additional costs (356.2: printed optional/mandatory ones, "any number"
 * costs with per-unit discounts, board-granted [Accelerate], [Deflect] per
 * chosen opposing target), [Repeat] tiers and the X component. Pure: reads
 * state, never writes.
 */
export function getPlayCostModel(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  ctx: CostModelContext = {},
): PlayCostModel {
  const registry = getGlobalCardRegistry();
  const printed = registry.getCostToDeduct(cardId);
  const base: CostComponent = {
    ...(printed.energy ? { energy: printed.energy } : {}),
    ...(Object.keys(printed.power).length > 0 ? { power: pipsToArray(printed.power) } : {}),
  };

  const alternatives: PlayCostAlternative[] = [];
  const alt = getAlternatePlayCost(state, playerId, cardId);
  if (alt) {
    alternatives.push({ cost: toComponent(alt), id: ALTERNATIVE_COST_IDS.alt });
  }
  for (const [i, flow] of getFlowCostOptionsForPlay(cardId, ctx.getCardMeta).entries()) {
    alternatives.push({
      cost: toComponent(flow),
      from: ["trash"],
      id: i === 0 ? ALTERNATIVE_COST_IDS.flow : `${ALTERNATIVE_COST_IDS.flow}-${i}`,
    });
  }
  const selfTrash = getSelfTrashPlayCost(state, playerId, cardId);
  if (selfTrash) {
    alternatives.push({ cost: toComponent(selfTrash), from: ["trash"], id: ALTERNATIVE_COST_IDS.selfTrash });
  }
  if (registry.hasKeyword(cardId, "Hidden")) {
    // rule 812.2 — a facedown [Hidden] card is played from its battlefield ignoring its cost.
    alternatives.push({ cost: {}, from: ["facedown"], id: ALTERNATIVE_COST_IDS.hidden });
  }

  const additional: AdditionalCost[] = [];
  const optional = getOptionalPlayCost(cardId);
  if (optional && (optional.kind !== "pay" || optionalPlayCostOffered(optional, state, playerId, cardId))) {
    additional.push(additionalFromOptional(optional));
  }
  const buffAny = getBuffSpendCost(cardId);
  if (buffAny) {
    additional.push({
      cost: { spendBuff: { anyNumber: true } },
      id: ADDITIONAL_COST_IDS.spendBuffAny,
      mandatory: false,
      perUnit: { reduces: { power: [buffAny.domain] } },
    });
  }
  const killAny = getKillAnyNumberCost(cardId);
  if (killAny) {
    additional.push({
      cost: { kill: { anyNumber: true, target: killAny.target as never } },
      id: ADDITIONAL_COST_IDS.killAny,
      mandatory: false,
      perUnit: { reduces: { power: [killAny.domain] } },
    });
  }
  if (ctx.board && ctx.playedFromHand === false && optional?.kind !== "accelerate") {
    const boardCards = collectBoardCards(state, ctx.board);
    const granted = getGrantedAcceleratePlayCost(cardId, playerId, boardCards, false);
    if (granted) {
      additional.push({
        cost: toComponent(granted),
        id: ADDITIONAL_COST_IDS.accelerateGranted,
        ifPaid: "enter-ready",
        mandatory: false,
      });
    }
  }
  if (ctx.targets && ctx.targets.length > 0) {
    const n = getDeflectSurcharge(state, playerId, [...ctx.targets], ctx.board?.cards, cardId, ctx.board?.zones);
    if (n > 0) {
      additional.push({
        cost: { power: Array.from({ length: n }, () => "rainbow") },
        id: ADDITIONAL_COST_IDS.deflect,
        mandatory: true,
        perTarget: true,
      });
    }
  }

  const tiers = getEffectiveSpellRepeatCost(state, playerId, cardId, ctx.board);
  const repeat = tiers?.map((t) => ({
    ...(t.energy ? { energy: t.energy } : {}),
    ...(t.power.length > 0 ? { power: [...t.power] } : {}),
    ...((t as { discard?: number }).discard ? { discard: (t as { discard?: number }).discard } : {}),
  }));

  const usesX =
    xCostIsPower(cardId) ||
    (registry.getAbilities(cardId) ?? []).some(
      (a) => a?.type === "spell" && ((a as { xCost?: unknown }).xCost !== undefined || effectReadsX((a as { effect?: unknown }).effect)),
    );

  return {
    additional,
    alternatives,
    base,
    ...(repeat && repeat.length > 0 ? { repeat } : {}),
    ...(usesX ? { x: { resource: xCostIsPower(cardId) ? "power" : "energy" } } : {}),
  };
}

function effectReadsX(effect: unknown): boolean {
  if (!effect || typeof effect !== "object") {
    return false;
  }
  if ((effect as { variable?: unknown }).variable === "x") {
    return true;
  }
  return Object.values(effect as Record<string, unknown>).some((v) =>
    Array.isArray(v) ? v.some(effectReadsX) : effectReadsX(v),
  );
}

export function collectBoardCards(
  state: RiftboundGameState,
  board: NonNullable<CostExtras["board"]>,
): { cardId: string; controller: string | undefined }[] {
  const out: { cardId: string; controller: string | undefined }[] = [];
  const zoneIds = ["base", "legendZone", ...Object.keys(state.battlefields ?? {}).map((b) => `battlefield-${b}`)];
  for (const pid of Object.keys(state.players ?? {})) {
    for (const zoneId of zoneIds) {
      for (const id of board.zones.getCardsInZone(zoneId as never, pid as never)) {
        const controller =
          (board.cards.getCardController?.(id as CoreCardId) as string | undefined) ??
          (board.cards.getCardOwner(id as CoreCardId) as string | undefined);
        out.push({ cardId: id as string, controller });
      }
    }
  }
  return out;
}

/** rule 357.2 — a non-standard payment: which additional cost, what kind, and the objects paying it. */
export interface ObjectPayment {
  readonly costId: string;
  readonly kind: "kill" | "discard" | "exhaust" | "spend-buff" | "return-to-hand" | "recycle" | "banish" | "xp";
  readonly objects: readonly string[];
  readonly count?: number;
}

/** Everything a move needs to gate and pay one play, from ONE computation. */
export interface TotalCost {
  readonly resources: PlayResourceCost;
  readonly objects: readonly ObjectPayment[];
  /** Ids of the additional costs the selection pays (→ `additionalCostsPaid[cardId]`). */
  readonly paidIds: readonly string[];
  /** rule 805 / 369.3 — a paid cost's rider makes the unit enter ready. */
  readonly entersReady: boolean;
  /** The `CostExtras` the legacy `canAffordCard`/`deductCost` wrappers would take for this play. */
  readonly extras: CostExtras;
  /** A mandatory additional cost is unpaid, or a paid id is not on the model → the play is illegal. */
  readonly illegal?: string;
}

function paidEntry(
  selection: PlayCostSelection,
  id: string,
): { objects: readonly string[]; count?: number; spec?: { energy?: number; power?: readonly string[]; xp?: number } } | undefined {
  const v = selection.paid?.[id];
  if (v === undefined) {
    return undefined;
  }
  if (v === true) {
    return { objects: [] };
  }
  return { objects: v.objects ?? [], ...(v.count !== undefined ? { count: v.count } : {}), ...(v.spec ? { spec: v.spec } : {}) };
}

/**
 * rule 356.4.c / 356.4.c.1 (sfd-149-221) — the resource part of a paid
 * optional cost as actually owed: friendly "optional additional costs cost [1]
 * or [A] less" statics shave it, the payer may name which discounted shape
 * (`spec`) when several are legal, and an XP-paid "I cost [N] less" rider nets
 * against the Energy.
 */
export function pricePayableAdditionalCost(
  state: RiftboundGameState,
  playerId: string,
  entry: AdditionalCost,
  board: CostExtras["board"] | undefined,
  spec?: { energy?: number; power?: readonly string[] },
): { energy: number; power: readonly string[]; xp: number } {
  const printed = { energy: entry.cost.energy ?? 0, power: [...(entry.cost.power ?? [])] };
  const xp = entry.cost.xp ?? 0;
  const rider = entry.ifPaid as { type?: string; energy?: number } | string | undefined;
  const discount = xp > 0 && typeof rider === "object" && rider?.type === "cost-reduction" ? (rider.energy ?? 0) : 0;
  let priced = discountOptionalPlayCost(state, playerId, printed, board) ?? printed;
  if (spec && board) {
    const flex = computeOptionalAdditionalCostFlexReduction({ draft: state, ...board }, playerId);
    if (flex > 0 && flexibleShapes(printed, flex).some((s) => sameSpec(s, spec))) {
      priced = { energy: spec.energy ?? 0, power: spec.power ?? [] };
    }
  } else if (spec && sameSpec(priced, spec)) {
    priced = { energy: spec.energy ?? 0, power: spec.power ?? [] };
  }
  return { energy: priced.energy - discount, power: priced.power, xp };
}

/** rule 356.4.c.1 — every shape `flex` "[1] or [A] less" reductions can leave `cost` in. */
export function flexibleShapes(
  cost: { energy?: number; power?: readonly string[] },
  flex: number,
): { energy: number; power: readonly string[] }[] {
  let frontier: { energy: number; power: string[] }[] = [{ energy: cost.energy ?? 0, power: [...(cost.power ?? [])] }];
  for (let i = 0; i < flex; i++) {
    const next = new Map<string, { energy: number; power: string[] }>();
    for (const s of frontier) {
      if (s.energy === 0 && s.power.length === 0) {
        next.set(JSON.stringify(s), s);
        continue;
      }
      if (s.energy > 0) {
        const v = { energy: s.energy - 1, power: [...s.power] };
        next.set(JSON.stringify(v), v);
      }
      for (let j = 0; j < s.power.length; j++) {
        const v = { energy: s.energy, power: s.power.filter((_, k) => k !== j) };
        next.set(JSON.stringify({ ...v, power: [...v.power].sort() }), v);
      }
    }
    frontier = [...next.values()];
  }
  return frontier;
}

function sameSpec(
  a: { energy?: number; power?: readonly string[] },
  b: { energy?: number; power?: readonly string[] },
): boolean {
  const ap = [...(a.power ?? [])].sort();
  const bp = [...(b.power ?? [])].sort();
  return (a.energy ?? 0) === (b.energy ?? 0) && ap.length === bp.length && ap.every((d, i) => d === bp[i]);
}

/**
 * rule 356 / 357 — model + selection → the resources owed (after every
 * discount, increase, minimum and Deflect surcharge) and the object payments
 * due. Used by conditions (with `canPayResourceCost`), enumerators and
 * reducers alike; `illegal` names why a selection cannot be played at all
 * (unpaid mandatory cost, unknown id, alternative not on the model).
 */
export function computeTotalCost(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  selection: PlayCostSelection,
  ctx: CostModelContext = {},
  model: PlayCostModel = getPlayCostModel(state, playerId, cardId, ctx),
): TotalCost {
  const objects: ObjectPayment[] = [];
  const paidIds: string[] = [];
  let entersReady = false;
  let illegal: string | undefined;
  const extras: CostExtras = {
    ...(ctx.board ? { board: ctx.board } : {}),
    ...(ctx.targets ? { targets: [...ctx.targets] } : {}),
    ...(ctx.chosenTargetId ? { chosenTargetId: ctx.chosenTargetId } : {}),
    ...(ctx.xAmount !== undefined ? { xAmount: ctx.xAmount } : {}),
    ...(ctx.repeatCount !== undefined ? { repeatCount: ctx.repeatCount } : {}),
    ...(ctx.assumeChooseDiscount ? { assumeChooseDiscount: true } : {}),
    ...(ctx.ignoreEnergyCost ? { ignoreEnergyCost: true } : {}),
  };

  // rule 356.1.a — alternative cost.
  if (selection.alternativeId !== undefined) {
    const chosen = model.alternatives.find((a) => a.id === selection.alternativeId);
    if (!chosen) {
      illegal = `alternative:${selection.alternativeId}`;
    } else if (chosen.id.startsWith(ALTERNATIVE_COST_IDS.flow)) {
      extras.viaFlow = true;
    } else if (chosen.id === ALTERNATIVE_COST_IDS.hidden) {
      extras.altCost = { energy: 0, power: [] };
    } else {
      extras.altCost = { energy: chosen.cost.energy ?? 0, power: chosen.cost.power ?? [] };
    }
  }

  // rule 356.2 — additional costs.
  for (const id of Object.keys(selection.paid ?? {})) {
    if (!model.additional.some((a) => a.id === id)) {
      illegal ??= `unknown-cost:${id}`;
    }
  }
  let addEnergy = 0;
  const addPower: string[] = [];
  const waive: Record<string, number> = {};
  for (const entry of model.additional) {
    const paid = paidEntry(selection, entry.id);
    if (entry.id === ADDITIONAL_COST_IDS.deflect) {
      // Mandatory and automatic: `extras.targets` makes computePlayResourceCost add it.
      paidIds.push(entry.id);
      continue;
    }
    if (!paid) {
      if (entry.mandatory) {
        illegal ??= `unpaid-mandatory:${entry.id}`;
      }
      continue;
    }
    paidIds.push(entry.id);
    switch (entry.id) {
      case ADDITIONAL_COST_IDS.accelerate:
      case ADDITIONAL_COST_IDS.accelerateGranted:
      case ADDITIONAL_COST_IDS.pay: {
        const priced = pricePayableAdditionalCost(state, playerId, entry, ctx.board, paid.spec);
        addEnergy += priced.energy;
        addPower.push(...priced.power);
        if (priced.xp > 0) {
          objects.push({ costId: entry.id, count: priced.xp, kind: "xp", objects: [] });
        }
        if (entry.ifPaid === "enter-ready") {
          entersReady = true;
        }
        break;
      }
      case ADDITIONAL_COST_IDS.discard: {
        const rider = entry.ifPaid as { energy?: number } | undefined;
        addEnergy -= rider?.energy ?? 0;
        objects.push({ costId: entry.id, count: typeof entry.cost.discard === "number" ? entry.cost.discard : 1, kind: "discard", objects: paid.objects });
        break;
      }
      case ADDITIONAL_COST_IDS.kill: {
        const victim = paid.objects[0];
        // rule-id: unl-170-219 — "I cost [1] less per Energy / [D] less per Power it costs".
        const discount = victim ? getSacrificeCostDiscount(cardId, victim) : undefined;
        if (discount) {
          addEnergy -= discount.energy;
          for (const [d, n] of Object.entries(discount.power)) {
            waive[d] = (waive[d] ?? 0) + (n ?? 0);
          }
        }
        objects.push({ costId: entry.id, kind: "kill", objects: paid.objects });
        break;
      }
      case ADDITIONAL_COST_IDS.killAny:
      case ADDITIONAL_COST_IDS.spendBuffAny: {
        const per = entry.perUnit?.reduces.power ?? [];
        for (const d of per) {
          waive[d] = (waive[d] ?? 0) + paid.objects.length;
        }
        objects.push({ costId: entry.id, kind: entry.id === ADDITIONAL_COST_IDS.killAny ? "kill" : "spend-buff", objects: paid.objects });
        break;
      }
      case ADDITIONAL_COST_IDS.spendBuff: {
        if (entry.ifPaid === "ignore-cost") {
          extras.ignoreBaseCost = true;
        }
        objects.push({ costId: entry.id, kind: "spend-buff", objects: paid.objects });
        break;
      }
      case ADDITIONAL_COST_IDS.exhaust: {
        objects.push({ costId: entry.id, kind: "exhaust", objects: paid.objects });
        break;
      }
      case ADDITIONAL_COST_IDS.returnToHand: {
        objects.push({ costId: entry.id, kind: "return-to-hand", objects: paid.objects });
        break;
      }
      default: {
        break;
      }
    }
  }
  if (addEnergy !== 0 || addPower.length > 0) {
    extras.additionalCost = { energy: addEnergy, power: addPower };
  }
  if (Object.keys(waive).length > 0) {
    extras.waivePower = waive;
  }
  const resources = computePlayResourceCost(state, playerId, cardId, extras, ctx.getCardMeta, false);
  return { entersReady, extras, objects, paidIds, resources, ...(illegal ? { illegal } : {}) };
}

/** Convenience: is `selection` legal AND payable from the pool right now? */
export function canPayTotalCost(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  total: TotalCost,
  potentialEnergy = 0,
): boolean {
  if (total.illegal) {
    return false;
  }
  const xp = total.objects.filter((o) => o.kind === "xp").reduce((a, o) => a + (o.count ?? 0), 0);
  if (xp > 0 && (state.players[playerId]?.xp ?? 0) < xp) {
    return false;
  }
  return canPayResourceCost(state, playerId, cardId, total.resources, potentialEnergy);
}

/**
 * rule 356.2.b — the optional-cost SUBSETS a player may elect (mandatory ones
 * are always in). Object choices are NOT expanded here — they surface as move
 * fields (`sacrificeId`, `discardId`, …) so a hand of N cards never mints 2^N
 * variants.
 */
export function optionalCostSubsets(model: PlayCostModel): string[][] {
  const optional = model.additional.filter((a) => !a.mandatory && a.id !== ADDITIONAL_COST_IDS.deflect).map((a) => a.id);
  const out: string[][] = [];
  const cap = Math.min(optional.length, 6);
  for (let mask = 0; mask < 1 << cap; mask++) {
    out.push(optional.filter((_, i) => (mask & (1 << i)) !== 0));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Legacy param shims (one release): paidAdditionalCost/additionalCostSpec/
// sacrificeId(s)/discardId/spentBuffIds/altCost/viaFlow  ⇄  PlayCostSelection
// ---------------------------------------------------------------------------

/** The cost-bearing legacy params shared by playUnit / playSpell / playGear / … */
export interface LegacyCostParams {
  paidAdditionalCost?: boolean;
  additionalCostSpec?: { energy?: number; power?: readonly string[]; xp?: number };
  sacrificeId?: string;
  sacrificeIds?: readonly string[];
  discardId?: string;
  spentBuffIds?: readonly string[];
  altCost?: boolean;
  viaFlow?: boolean;
  /** playSpell's "exhaust a friendly X" cost names its object as targets[0]. */
  targets?: readonly string[];
  costs?: PlayCostSelection;
}

/**
 * Read the selection a move was invoked with: an explicit `costs` wins;
 * otherwise the legacy params are translated against the card's model ids.
 */
export function selectionFromLegacyParams(cardId: string, params: LegacyCostParams): PlayCostSelection {
  if (params.costs) {
    return params.costs;
  }
  const paid: Record<string, NonNullable<PlayCostSelection["paid"]>[string]> = {};
  const optional = getOptionalPlayCost(cardId);
  if (params.paidAdditionalCost === true && optional) {
    const id = additionalFromOptional(optional).id;
    if (id === ADDITIONAL_COST_IDS.kill || id === ADDITIONAL_COST_IDS.returnToHand) {
      paid[id] = params.sacrificeId ? { objects: [params.sacrificeId] } : true;
    } else if (id === ADDITIONAL_COST_IDS.discard) {
      paid[id] = params.discardId ? { objects: [params.discardId] } : true;
    } else if (id === ADDITIONAL_COST_IDS.exhaust) {
      paid[id] = params.targets?.[0] ? { objects: [params.targets[0]] } : true;
    } else if (id === ADDITIONAL_COST_IDS.pay || id === ADDITIONAL_COST_IDS.accelerate) {
      // On a play that also names an object cost the bare flag means THAT cost;
      // the resource cost is elected only by an explicit spec (see playUnit).
      const objectCostNamed =
        (params.spentBuffIds && params.spentBuffIds.length > 0) ||
        (params.sacrificeIds && params.sacrificeIds.length > 0);
      if (params.additionalCostSpec) {
        paid[id] = { spec: params.additionalCostSpec };
      } else if (!objectCostNamed) {
        paid[id] = true;
      }
    } else {
      paid[id] = true;
    }
  } else if (
    params.paidAdditionalCost === true &&
    !optional &&
    !(params.sacrificeIds && params.sacrificeIds.length > 0) &&
    !(params.spentBuffIds && params.spentBuffIds.length > 0)
  ) {
    // Board-granted [Accelerate] (sfd-029-221) has no printed descriptor.
    paid[ADDITIONAL_COST_IDS.accelerateGranted] = params.additionalCostSpec ? { spec: params.additionalCostSpec } : true;
  }
  if (params.sacrificeId && optional?.kind === "kill" && paid[ADDITIONAL_COST_IDS.kill] === undefined) {
    // A mandatory kill (spell `additionalCost.kill`) names its victim without `paidAdditionalCost`.
    paid[ADDITIONAL_COST_IDS.kill] = { objects: [params.sacrificeId] };
  }
  if (params.sacrificeIds && params.sacrificeIds.length > 0 && getKillAnyNumberCost(cardId)) {
    paid[ADDITIONAL_COST_IDS.killAny] = { objects: [...params.sacrificeIds] };
    delete paid[ADDITIONAL_COST_IDS.kill];
  }
  if (params.spentBuffIds && params.spentBuffIds.length > 0) {
    paid[ADDITIONAL_COST_IDS.spendBuffAny] = { objects: [...params.spentBuffIds] };
  }
  const alternativeId = params.viaFlow === true ? ALTERNATIVE_COST_IDS.flow : params.altCost === true ? ALTERNATIVE_COST_IDS.alt : undefined;
  return {
    ...(alternativeId ? { alternativeId } : {}),
    ...(Object.keys(paid).length > 0 ? { paid } : {}),
  };
}

/**
 * The inverse: expand a `costs` selection into the legacy params the move
 * bodies still read, so a caller may send either shape during the migration.
 * Fields already present on `params` are kept.
 */
export function legacyParamsFromSelection<P extends LegacyCostParams>(cardId: string, params: P): P {
  const sel = params.costs;
  if (!sel) {
    return params;
  }
  const out: LegacyCostParams = { ...params };
  if (sel.alternativeId?.startsWith(ALTERNATIVE_COST_IDS.flow)) {
    out.viaFlow ??= true;
  } else if (sel.alternativeId === ALTERNATIVE_COST_IDS.alt) {
    out.altCost ??= true;
  }
  for (const [id, v] of Object.entries(sel.paid ?? {})) {
    const objects = v === true ? [] : [...(v.objects ?? [])];
    const spec = v === true ? undefined : v.spec;
    switch (id) {
      case ADDITIONAL_COST_IDS.accelerate:
      case ADDITIONAL_COST_IDS.accelerateGranted:
      case ADDITIONAL_COST_IDS.pay: {
        out.paidAdditionalCost = true;
        // The spec doubles as the "resource cost elected" signal when an object
        // cost is paid on the same play; default to the printed shape (the move
        // re-prices it and falls back to the legal discounted shape).
        const printed = id === ADDITIONAL_COST_IDS.accelerateGranted ? undefined : getOptionalPlayCost(cardId)?.cost;
        const fallback = printed ? { energy: printed.energy ?? 0, power: printed.power ?? [], ...(printed.xp ? { xp: printed.xp } : {}) } : undefined;
        if (spec ?? fallback) {
          out.additionalCostSpec ??= spec ?? fallback;
        }
        break;
      }
      case ADDITIONAL_COST_IDS.kill:
      case ADDITIONAL_COST_IDS.returnToHand: {
        // playSpell names a MANDATORY kill by `sacrificeId` alone; every other
        // legacy path also raises `paidAdditionalCost`.
        if (
          !(
            id === ADDITIONAL_COST_IDS.kill &&
            getGlobalCardRegistry().getCardType(cardId) === "spell" &&
            getOptionalPlayCost(cardId)?.mandatory === true
          )
        ) {
          out.paidAdditionalCost = true;
        }
        if (objects[0]) {
          out.sacrificeId ??= objects[0];
        }
        break;
      }
      case ADDITIONAL_COST_IDS.killAny: {
        out.paidAdditionalCost = true;
        out.sacrificeIds ??= objects;
        if (objects.length === 1) {
          out.sacrificeId ??= objects[0];
        }
        break;
      }
      case ADDITIONAL_COST_IDS.discard: {
        out.paidAdditionalCost = true;
        if (objects[0]) {
          out.discardId ??= objects[0];
        }
        break;
      }
      case ADDITIONAL_COST_IDS.spendBuffAny: {
        out.paidAdditionalCost = true;
        out.spentBuffIds ??= objects;
        break;
      }
      case ADDITIONAL_COST_IDS.spendBuff: {
        out.paidAdditionalCost = true;
        break;
      }
      case ADDITIONAL_COST_IDS.exhaust: {
        out.paidAdditionalCost = true;
        if (objects[0] && getGlobalCardRegistry().getCardType(cardId) === "spell") {
          // rule 355.6 / 352.10.c (ogn-048-298) — the exhausted permanent is a
          // COST object, not a target; it rides as `targets[0]` only so the
          // reducer can find and strip it. The enumerated variant already
          // carries it there, so never list it twice: a duplicate survives the
          // strip and is then treated as a chosen spell target (firing
          // Targeting Effects like The Dreaming Tree).
          const rest = params.targets ?? [];
          out.targets = rest[0] === objects[0] ? [...rest] : [objects[0], ...rest];
        }
        break;
      }
      default: {
        out.paidAdditionalCost = true;
        break;
      }
    }
  }
  return out as P;
}


/**
 * Enumerator helper: attach the equivalent `costs` selection to a legacy-param
 * variant (only when something is selected, so plain variants stay unchanged).
 */
export function withCostsParam<P extends LegacyCostParams & { cardId?: string }>(variant: P, cardId = variant.cardId): P {
  if (variant.costs || !cardId) {
    return variant;
  }
  const sel = selectionFromLegacyParams(cardId, variant);
  if (sel.alternativeId === undefined && sel.paid === undefined) {
    return variant;
  }
  return { ...variant, costs: sel };
}

/**
 * The additional-cost ids a legacy-param play actually paid, for the
 * `additionalCostsPaid` ledger and `play-self.paidAdditionalCostIds`.
 */
export function paidIdsFromLegacyParams(cardId: string, params: LegacyCostParams): string[] {
  return Object.keys(selectionFromLegacyParams(cardId, { ...params, costs: undefined }).paid ?? {});
}

export { additionalCostWasPaid, recordAdditionalCostsPaid } from "../../../operations/additional-costs-paid";
