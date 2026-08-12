/**
 * rule 354–358 / 419 — the ONE play-options model for permanents (units, gear).
 *
 * Every way a permanent gets played — from hand (`playUnit`), from the trash
 * under a standing permission (`playUnit`), from the Champion Zone
 * (`playFromChampionZone`), from a facedown zone (`revealHidden`), or because an
 * EFFECT instructs it (`play-pipeline.ts continueEffectPlay`, which also serves
 * `playFromZone` and activated abilities that play a card) — asks this module
 * the same two questions:
 *
 *  - {@link computeUnitPlayOptions}: which (destination × cost selection) pairs
 *    are LEGAL and PAYABLE right now — 355.2 valid locations (defaults,
 *    card/board permissions, [Ambush], a battlefield's own paid redirect,
 *    restrictions such as Mageseeker Warden), 355.1.a optional additional costs
 *    with the objects that may pay them (kill / discard / spend buffs / exhaust
 *    / return, incl. every legal SUBSET of an "any number" cost), 356 the total
 *    through the cost model (base → replacement → additional → increases →
 *    component discounts → total discounts; keyword surcharges priced with the
 *    keywords the card has WHILE being played — 822.4 / 811.6), 357 payable
 *    from the pool as ONE assignment (specific-Domain pips first, any-Domain
 *    pips last — 135.2.e.5), 822.3 Ambush re-checked AFTER the cost objects
 *    leave. Illegal or unpayable combinations are simply absent (355.16 /
 *    357.3): menus list exactly this set.
 *  - {@link resolveSubmittedUnitPlay}: does a SUBMITTED move (legacy per-kind
 *    params or a `costs` selection) name one of those options? Reducers then pay
 *    through {@link payUnitPlayCosts} with the option's own total, so what a
 *    menu offers, what a raw move accepts and what is charged cannot drift
 *    (358.5: a refused play changes nothing; an elected optional cost is paid
 *    or the play does not exist — never "silently dropped").
 *
 * Paying stays MANUAL (DESIGN.md §Paying costs): payability is pool-only.
 *
 * TODO(a7c4dc7d481b): spells are not modelled here yet (play-spell.ts keeps its
 * own enumerator). When they are, a [Repeat] election must be shaped as
 * `executions: [{targets…}, …]` — one entry per execution, each with its OWN
 * target set chosen at play/finalization (820.2.a) — not a flat target list plus
 * a repeat count; effect plays of spells must ask the same per-execution choices.
 */

import type {
  CardId as CoreCardId,
  ConditionFailure,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import type { AdditionalCost, PlayCostModel, PlayCostSelection } from "@tcg/riftbound-types";
import type { RiftboundCardMeta, RiftboundGameState } from "../../../types";
import { fireTriggers } from "../../../abilities/trigger-runner";
import { executeEffect } from "../../../abilities/effect-executor";
import { resolveTarget } from "../../../abilities/target-resolver";
import { playIsForbidden, selfPlayIsForbidden } from "../../../abilities/play-restrictions";
import { nameOf, refuse } from "../../refusal";
import { createInteractionState, getActiveShowdown, getTurnState } from "../../../chain";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import { isGrantedAdditionalCostId } from "../../../operations/additional-costs-paid";
import type { BuffCardsIo } from "../../../operations/buff-counters";
import { removeOneBuffCounter } from "../../../operations/buff-counters";
import { removeFromBoard } from "../../../operations/leave-board";
import { computeOptionalAdditionalCostFlexReduction } from "../../../operations/static-cost-reduction";
import {
  extractBattlefieldId,
  getBattlefieldZoneId,
  isBattlefieldZone,
} from "../../../zones/zone-configs";
import {
  type CostExtras,
  battlefieldForbidsUnitPlay,
  battlefieldHasEnemyUnits,
  battlefieldIsAttackedBy,
  battlefieldIsOccupiedEnemy,
  battlefieldIsOpen,
  battlefieldMatchesOccupiedPermission,
  battlefieldRedirectPowerFor,
  canPayResourceCost,
  type ReachableAdds,
  canPlayToAttackedBattlefield,
  canPlayToEnemyOccupiedBattlefield,
  canPlayToOccupiedEnemyBattlefield,
  canPlayToOpenBattlefield,
  computePlayResourceCost,
  createMetaAccessor,
  getKillAnyNumberCost,
  getOccupiedBattlefieldPermission,
  hasPlayFromTrashGrant,
  opponentsRestrictedToBase,
  opponentsRestrictedToBaseSource,
  payResourceCost,
  playOnlyToConqueredBattlefield,
  recordPowerSpent,
} from "./cost";
import {
  ADDITIONAL_COST_IDS,
  ALTERNATIVE_COST_IDS,
  type CostModelContext,
  type TotalCost,
  computeTotalCost,
  flexibleShapes,
  getPlayCostModel,
  pricePayableAdditionalCost,
  selectionFromLegacyParams,
} from "./cost-model";
import { reactionWindowOpen } from "./reaction-window";
import { getSelfTrashPlayCost } from "./self-trash-play";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Where the played card comes from — decides permissions, timing and base-cost alternatives. */
export type UnitPlayOrigin =
  | { readonly kind: "hand" }
  | { readonly kind: "trash" }
  | { readonly kind: "championZone" }
  | { readonly kind: "facedown"; readonly battlefieldId?: string }
  | {
      readonly kind: "effect";
      /** rule 355.2 — the destinations the INSTRUCTION allows (before restrictions / affordability). */
      readonly destinations: readonly string[];
      /** rule 356.1.a/b — the instruction's base-cost overrides ("for [cost]", "ignoring …", "reduced by …"). */
      readonly extras?: Partial<CostExtras>;
      /** rule 356.5.a — "ignoring any and all costs": total cost 0, additional costs included. */
      readonly free?: boolean;
      /** The zone the card left (`hand`, `trash`, `banishment`, `mainDeck`, …) — `hand` forbids granted Accelerate. */
      readonly from?: string;
      /** Set false to never elect an OPTIONAL additional cost (a caller that asked already). */
      readonly offerOptionalCosts?: boolean;
      /** The optional cost ids the caller's dialog can ask about; others are left unelected. */
      readonly optionalCostIds?: readonly string[];
    };

/** The board accessors every caller has (move context / effect context / prompt context). */
export interface PlayOptionIO {
  // biome-ignore lint/suspicious/noExplicitAny: engine context bags are framework-typed
  readonly cards: any;
  // biome-ignore lint/suspicious/noExplicitAny: engine context bags are framework-typed
  readonly zones: any;
  // biome-ignore lint/suspicious/noExplicitAny: engine context bags are framework-typed
  readonly counters?: any;
}

/** rule 355.2 — one candidate destination and the permission classes that make it Valid. */
export interface PlayDestination {
  readonly zone: string;
  /** Valid at standard timing (own Neutral Open main phase). */
  readonly standard: boolean;
  /** Valid in any window the player may act in because the CARD has [Reaction] (813.1.c). */
  readonly reactionKeyword: boolean;
  /** rule 822.1.b — Valid via [Ambush] (any window the player may act in, standard timing included). */
  readonly ambush: boolean;
  /** rule 822.1.b / 822.3 — the Ambush permission needs a friendly unit STILL there after costs are paid. */
  readonly ambushNeedsPresence: boolean;
  /** rule 356.2 / 355.2.b (ven-157-166) — the battlefield's own "pay … to play a X here". */
  readonly redirect?: { readonly pips: readonly string[]; readonly otherwiseValid: boolean };
  /** No timing gate of its own (an effect play; a facedown flip whose window is checked by the origin). */
  readonly always?: boolean;
}

/** A resource quote callers may show (Energy, per-Domain pips, any-Domain pips, XP). */
export interface PlayCostQuote {
  readonly energy: number;
  readonly power: Readonly<Record<string, number>>;
  readonly any: number;
  readonly xp: number;
  readonly free: boolean;
  readonly paidIds: readonly string[];
  readonly entersReady: boolean;
}

/** One legal, payable way to play the card right now. */
export interface UnitPlayOption {
  readonly cardId: string;
  readonly playerId: string;
  readonly origin: UnitPlayOrigin["kind"];
  readonly destination: string;
  /** rule 355.1 — canonical cost selection (alternative + paid additional costs with their objects / priced spec). */
  readonly selection: PlayCostSelection;
  readonly total: TotalCost;
  /** rule 822.4 / 811.6 — the card has [Reaction] for this play (cost audiences priced it). */
  readonly grantedReaction: boolean;
  /** Which permission admitted the play now. */
  readonly admittedBy: "standard" | "reaction" | "ambush" | "always";
  /** ven-157-166 — the destination's own pips were paid: as the only way in, or as its controller's election. */
  readonly redirect?: "mandatory" | "optional";
  readonly quote: PlayCostQuote;
}

interface Env {
  readonly state: RiftboundGameState;
  readonly io: PlayOptionIO;
  readonly playerId: string;
  readonly cardId: string;
  readonly origin: UnitPlayOrigin;
  readonly isUnit: boolean;
  readonly hasAmbush: boolean;
  readonly hasReactionKeyword: boolean;
  readonly board: NonNullable<CostExtras["board"]>;
  readonly now: { readonly standard: boolean; readonly reaction: boolean };
  readonly model: PlayCostModel;
  readonly modelCtx: CostModelContext;
  readonly candidates: CostCandidates;
  /**
   * rule 357.1.a — the enumeration credit: what Reaction [Add] abilities could
   * still put in the pool. Set only when LISTING what a player may play, never
   * when deciding whether a submitted play may proceed — paying is manual.
   */
  readonly reach?: ReachableAdds;
}

interface CostCandidates {
  readonly killSingle: readonly string[];
  readonly killAny: readonly string[];
  readonly buffed: readonly string[];
  readonly discard: readonly string[];
  readonly gear: readonly string[];
  readonly readyLegend?: string;
  readonly exhaustable: readonly string[];
}

type PaidValue = NonNullable<PlayCostSelection["paid"]>[string];

const MAX_SELECTIONS = 640;

// ---------------------------------------------------------------------------
// Small readers
// ---------------------------------------------------------------------------

function controllerOf(io: PlayOptionIO, id: string): string | undefined {
  return (
    (io.cards.getCardController?.(id as CoreCardId) as string | undefined) ??
    (io.cards.getCardOwner?.(id as CoreCardId) as string | undefined)
  );
}

function seats(state: RiftboundGameState): string[] {
  return Object.keys(state.players ?? state.runePools ?? {});
}

export function unitHasReactionKeyword(cardId: string): boolean {
  const registry = getGlobalCardRegistry();
  return registry.getSpellTiming(cardId) === "reaction" || registry.hasKeyword(cardId, "Reaction");
}

/** rule 347 / 355.2 (ven-179-166) — a running Showdown narrows an Ambush-into-enemies play to its own battlefield. */
function ambushEnemyBattlefieldOpen(state: RiftboundGameState, bfId: string): boolean {
  const showdown = getActiveShowdown(state.interaction ?? createInteractionState());
  return showdown?.active !== true || showdown.battlefieldId === bfId;
}

export function standardTimingNow(state: RiftboundGameState, playerId: string): boolean {
  return (
    state.turn.activePlayer === playerId &&
    state.turn.phase === "main" &&
    getTurnState(state.interaction ?? createInteractionState()) === "neutral-open"
  );
}

/** `playerId`'s cards at `zone` (owner-keyed zone read — what "friendly units here" reads everywhere). */
function friendlyAt(io: PlayOptionIO, zone: string, playerId: string): string[] {
  return (io.zones.getCardsInZone(zone as CoreZoneId, playerId as CorePlayerId) as readonly string[]).map(String);
}

function boardZoneIds(state: RiftboundGameState): string[] {
  return ["base", ...Object.keys(state.battlefields ?? {}).map((b) => getBattlefieldZoneId(b) as string)];
}

/** rule-id: ogn-231-298 — friendly units on the board (owner scan, board order). */
function friendlyKillableUnits(state: RiftboundGameState, io: PlayOptionIO, playerId: string, except: string): string[] {
  const registry = getGlobalCardRegistry();
  const out: string[] = [];
  for (const zoneId of boardZoneIds(state)) {
    for (const id of friendlyAt(io, zoneId, playerId)) {
      if (id !== except && registry.getCardType(id) === "unit") {
        out.push(id);
      }
    }
  }
  return out;
}

/** rule-id: ogn-150-298 — friendly buffed units (board order). */
function friendlyBuffedUnits(state: RiftboundGameState, io: PlayOptionIO, playerId: string): string[] {
  const out: string[] = [];
  for (const zoneId of boardZoneIds(state)) {
    for (const id of friendlyAt(io, zoneId, playerId)) {
      const meta = io.cards.getCardMeta?.(id as CoreCardId) as { buffed?: boolean } | undefined;
      if (meta?.buffed === true) {
        out.push(id);
      }
    }
  }
  return out;
}

/** Friendly permanents by CONTROL matching a cost descriptor's `type` (unit | gear | permanent). */
function friendlyPermanents(state: RiftboundGameState, io: PlayOptionIO, playerId: string, except: string, want: string): string[] {
  const registry = getGlobalCardRegistry();
  const out: string[] = [];
  for (const zoneId of boardZoneIds(state)) {
    for (const seat of seats(state)) {
      for (const id of friendlyAt(io, zoneId, seat)) {
        if (id === except || out.includes(id) || controllerOf(io, id) !== playerId) {
          continue;
        }
        const type = registry.getCardType(id);
        const isGear = type === "gear" || type === "equipment";
        const ok = want === "permanent" ? type === "unit" || isGear : want === "gear" || want === "equipment" ? isGear : type === want;
        if (ok) {
          out.push(id);
        }
      }
    }
  }
  return out;
}

function isExhausted(io: PlayOptionIO, id: string): boolean {
  if (typeof io.counters?.getFlag === "function") {
    return io.counters.getFlag(id as CoreCardId, "exhausted") === true;
  }
  const meta = io.cards.getCardMeta?.(id as CoreCardId) as { exhausted?: boolean } | undefined;
  return meta?.exhausted === true;
}

function readyLegendId(io: PlayOptionIO, playerId: string): string | undefined {
  return friendlyAt(io, "legendZone", playerId).find((id) => !isExhausted(io, id));
}

/** Full power set up to this many candidates; beyond it only prefix sets (bounded enumeration). */
export const OBJECT_SUBSET_FULL_LIMIT = 6;

/**
 * Non-empty subsets, smallest first. Over {@link OBJECT_SUBSET_FULL_LIMIT}
 * candidates only the prefixes (in board order) are listed — and, to keep
 * enumerator ≡ reducer, only those are ACCEPTED (`isListedSubset`).
 */
export function objectSubsets(ids: readonly string[]): string[][] {
  if (ids.length > OBJECT_SUBSET_FULL_LIMIT) {
    return ids.map((_, i) => ids.slice(0, i + 1));
  }
  const subsets: string[][] = [];
  for (let mask = 1; mask < 1 << ids.length; mask++) {
    subsets.push(ids.filter((_, i) => (mask & (1 << i)) !== 0));
  }
  subsets.sort((a, b) => a.length - b.length);
  return subsets;
}

/** Is `objects` (any order) one of the sets `objectSubsets(candidates)` lists? */
function isListedSubset(objects: readonly string[], candidates: readonly string[]): boolean {
  if (new Set(objects).size !== objects.length || !objects.every((o) => candidates.includes(o))) {
    return false;
  }
  if (candidates.length <= OBJECT_SUBSET_FULL_LIMIT) {
    return true;
  }
  // Prefix sets only: the first |objects| candidates in board order.
  const prefix = new Set(candidates.slice(0, objects.length));
  return objects.every((o) => prefix.has(o));
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function buildEnv(
  state: RiftboundGameState,
  io: PlayOptionIO,
  playerId: string,
  cardId: string,
  origin: UnitPlayOrigin,
  reach?: ReachableAdds,
): Env {
  const registry = getGlobalCardRegistry();
  const type = registry.getCardType(cardId);
  const isUnit = type !== "gear" && type !== "equipment";
  const board: NonNullable<CostExtras["board"]> = { cards: io.cards, zones: io.zones };
  const playedFrom =
    origin.kind === "effect" ? (origin.from ?? "effect") : origin.kind === "facedown" ? "facedown" : origin.kind;
  const modelCtx: CostModelContext = {
    board,
    getCardMeta: createMetaAccessor(io.cards),
    playedFrom,
    playedFromHand: playedFrom === "hand",
  };
  const model = getPlayCostModel(state, playerId, cardId, modelCtx);
  return {
    board,
    candidates: costCandidates(state, io, playerId, cardId, model),
    cardId,
    hasAmbush: isUnit && registry.hasKeyword(cardId, "Ambush"),
    hasReactionKeyword: unitHasReactionKeyword(cardId),
    io,
    isUnit,
    model,
    modelCtx,
    now: { reaction: reactionWindowOpen(state, playerId), standard: standardTimingNow(state, playerId) },
    origin,
    playerId,
    ...(reach ? { reach } : {}),
    state,
  };
}

function resolveAll(state: RiftboundGameState, io: PlayOptionIO, playerId: string, cardId: string, descriptor: object): string[] {
  if (typeof io.zones?.getCardsInZone !== "function") {
    return [];
  }
  return resolveTarget(
    { controller: "friendly", type: "unit", ...descriptor, quantity: "all" } as Parameters<typeof resolveTarget>[0],
    { cards: io.cards, draft: state, playerId, sourceCardId: cardId, zones: io.zones } as Parameters<typeof resolveTarget>[1],
  ).map(String);
}

function costCandidates(
  state: RiftboundGameState,
  io: PlayOptionIO,
  playerId: string,
  cardId: string,
  model: PlayCostModel,
): CostCandidates {
  const byId = new Map(model.additional.map((a) => [a.id, a] as const));
  let killSingle: string[] = [];
  const kill = byId.get(ADDITIONAL_COST_IDS.kill);
  if (kill) {
    const descriptor = kill.cost.kill as Record<string, unknown> | "self" | undefined;
    if (descriptor && descriptor !== "self") {
      const want = String((descriptor as { type?: string }).type ?? "unit");
      const controlled = friendlyPermanents(state, io, playerId, cardId, want);
      const viaResolver = new Set(resolveAll(state, io, playerId, cardId, descriptor as object));
      // rule 740.1.a — "friendly" is CONTROL; the resolver contributes the descriptor's filters (tags, Might, …).
      killSingle = controlled.filter((id) => viaResolver.has(id));
    }
  }
  const exhaustEntry = byId.get(ADDITIONAL_COST_IDS.exhaust);
  const exhaustDescriptor = exhaustEntry?.cost.exhaust as { type?: string } | undefined;
  let exhaustable: string[] = [];
  if (exhaustEntry && exhaustDescriptor && exhaustDescriptor.type !== "legend") {
    exhaustable = resolveAll(state, io, playerId, cardId, exhaustDescriptor as object).filter(
      (id) => id !== cardId && !isExhausted(io, id),
    );
  }
  return {
    buffed:
      byId.has(ADDITIONAL_COST_IDS.spendBuffAny) || byId.has(ADDITIONAL_COST_IDS.spendBuff)
        ? friendlyBuffedUnits(state, io, playerId)
        : [],
    discard: byId.has(ADDITIONAL_COST_IDS.discard) ? friendlyAt(io, "hand", playerId).filter((id) => id !== cardId) : [],
    exhaustable,
    gear: byId.has(ADDITIONAL_COST_IDS.returnToHand) ? friendlyPermanents(state, io, playerId, cardId, "gear") : [],
    killAny: byId.has(ADDITIONAL_COST_IDS.killAny) ? friendlyKillableUnits(state, io, playerId, cardId) : [],
    killSingle,
    ...(exhaustDescriptor?.type === "legend" ? { readyLegend: readyLegendId(io, playerId) } : {}),
  };
}

// ---------------------------------------------------------------------------
// Destinations (rule 355.2)
// ---------------------------------------------------------------------------

/**
 * rule 355.2 — every candidate destination for this play with the permission
 * classes that make it Valid: the defaults (355.2.a base / a controlled
 * battlefield), card- and board-granted locations (355.2.b), [Ambush]
 * (822.1.b), a battlefield's own paid redirect (ven-157-166) — minus what a
 * restriction forbids (054.1 Mageseeker Warden, "units can't be played here",
 * "play me only to a battlefield you conquered this turn").
 */
/**
 * A refusal must carry its cause: WHY a destination this play cannot use is
 * missing from `unitPlayDestinations`. Decided here, beside the omission, so
 * the two can never drift — a play refused for a destination the board forbids
 * reports the forbidding permanent by name instead of "no legal variant".
 * `undefined` = the destination is not forbidden by a static (it is refused for
 * some other reason: cost, origin, timing).
 */
export function unitPlayDestinationRefusal(
  state: RiftboundGameState,
  io: PlayOptionIO,
  playerId: string,
  cardId: string,
  location: string | undefined,
): ConditionFailure | undefined {
  const registry = getGlobalCardRegistry();
  const type = registry.getCardType(cardId);
  if (type === "gear" || type === "equipment" || !location || location === "base") {
    return undefined;
  }
  const bfId = isBattlefieldZone(location) ? (extractBattlefieldId(location) ?? location) : location;
  // rule 358.3.a / 355.2 — "opponents can only play units to their base".
  const zones = io.zones;
  if (typeof zones?.getCardsInZone === "function") {
    const warden = opponentsRestrictedToBaseSource(state, zones, playerId);
    if (warden) {
      return refuse({
        code: "PLAY_RESTRICTED_TO_BASE",
        object: warden,
        rule: "358.3.a",
        subject: cardId,
        text: `while it is at a battlefield you can only play units to your base, so ${nameOf(cardId)} can't be played at ${bfId}`,
      });
    }
  }
  // rule 358.3.a — a battlefield that forbids unit plays outright.
  if (battlefieldForbidsUnitPlay(bfId)) {
    return refuse({
      code: "PLAY_FORBIDDEN_BY_STATIC",
      object: bfId,
      rule: "358.3.a",
      subject: cardId,
      text: `no units can be played here, so ${nameOf(cardId)} can't be played at ${bfId}`,
    });
  }
  return undefined;
}

export function unitPlayDestinations(
  state: RiftboundGameState,
  io: PlayOptionIO,
  playerId: string,
  cardId: string,
  origin: UnitPlayOrigin,
): PlayDestination[] {
  const registry = getGlobalCardRegistry();
  const type = registry.getCardType(cardId);
  const isUnit = type !== "gear" && type !== "equipment";
  const zones = io.zones;
  const canScan = typeof zones?.getCardsInZone === "function";
  const restrictedToBase = isUnit && canScan && opponentsRestrictedToBase(state, zones, playerId);
  const forbids = (bfId: string): boolean => isUnit && battlefieldForbidsUnitPlay(bfId);
  const plain = (zone: string, extra: Partial<PlayDestination> = {}): PlayDestination => ({
    ambush: false,
    ambushNeedsPresence: false,
    reactionKeyword: false,
    standard: true,
    zone,
    ...extra,
  });

  if (origin.kind === "effect") {
    return origin.destinations
      .filter((z) => (isUnit || z === "base") && (!isBattlefieldZone(z) || (!restrictedToBase && !forbids(extractBattlefieldId(z) ?? ""))))
      .map((zone) => {
        const bfId = isBattlefieldZone(zone) ? (extractBattlefieldId(zone) ?? undefined) : undefined;
        const pips = bfId && isUnit ? battlefieldRedirectPowerFor(bfId, cardId) : undefined;
        const controls = bfId ? state.battlefields?.[bfId]?.controller === playerId : true;
        return plain(zone, { always: true, ...(pips && !controls ? { redirect: { otherwiseValid: false, pips } } : {}) });
      });
  }

  if (origin.kind === "facedown") {
    // rule 811.1.d.1 — the flip plays the card AT its facedown battlefield.
    const bfId = origin.battlefieldId;
    if (bfId && (forbids(bfId) || restrictedToBase)) {
      return [];
    }
    return [plain(bfId ? (getBattlefieldZoneId(bfId) as string) : "base", { always: true, reactionKeyword: true })];
  }

  const hasReactionKw = unitHasReactionKeyword(cardId);
  if (!isUnit) {
    // rule 143.1.a.1 — gear is played to base.
    return [plain("base", { reactionKeyword: hasReactionKw })];
  }

  // rule 054.1 (sfd-015-221) — "Play me only to a battlefield you conquered this turn".
  if (playOnlyToConqueredBattlefield(cardId)) {
    if (restrictedToBase) {
      return [];
    }
    return (state.conqueredThisTurn?.[playerId] ?? [])
      .filter((bfId) => state.battlefields?.[bfId] !== undefined && !forbids(bfId))
      .map((bfId) => plain(getBattlefieldZoneId(bfId) as string, { reactionKeyword: false }));
  }

  const hasAmbush = registry.hasKeyword(cardId, "Ambush");
  const getController = (id: CoreCardId) => controllerOf(io, id as string);
  const out: PlayDestination[] = [plain("base", { reactionKeyword: hasReactionKw })];
  if (restrictedToBase || !canScan) {
    return out;
  }
  const openOk = canPlayToOpenBattlefield(state, zones, cardId, playerId);
  const occupiedEnemyOk = canPlayToOccupiedEnemyBattlefield(cardId);
  const enemyUnitsOk = canPlayToEnemyOccupiedBattlefield(cardId);
  const attackedOk = canPlayToAttackedBattlefield(cardId);
  const occupiedPermission = getOccupiedBattlefieldPermission(state, zones, cardId, playerId);
  for (const [bfId, bf] of Object.entries(state.battlefields ?? {})) {
    if (forbids(bfId)) {
      continue;
    }
    const zone = getBattlefieldZoneId(bfId) as string;
    let standard = false;
    let reactionKeyword = false;
    let ambush = false;
    let ambushNeedsPresence = true;
    const enemyUnits = battlefieldHasEnemyUnits(zones, getController, bfId, playerId);
    // rule 355.2.a — a battlefield the player controls.
    if (bf.controller === playerId) {
      standard = true;
      reactionKeyword = hasReactionKw;
    }
    // rule 355.2 (sfd-025-221) — "a battlefield you're attacking" (a COMBAT: enemy units present).
    if (attackedOk && battlefieldIsAttackedBy(state, bfId, playerId) && enemyUnits) {
      standard = true;
      reactionKeyword = reactionKeyword || hasReactionKw;
    }
    // rule 355.2.b (ogn-174-298 / ogn-193-298) — open battlefields.
    if (openOk && battlefieldIsOpen(state, zones, bfId)) {
      standard = true;
    }
    // rule 355.2.b (ogn-161-298) — occupied enemy battlefields.
    if (occupiedEnemyOk && battlefieldIsOccupiedEnemy(state, zones, bfId, playerId)) {
      standard = true;
    }
    // rule 355.2 (unl-120-219) — "a battlefield where there are enemy units"; on an
    // [Ambush] card it extends Ambush itself (822.1.d, ruling 581f4d14f9876f8a).
    if (enemyUnitsOk && enemyUnits) {
      standard = true;
      reactionKeyword = reactionKeyword || hasReactionKw;
      if (hasAmbush && ambushEnemyBattlefieldOpen(state, bfId)) {
        ambush = true;
        ambushNeedsPresence = false;
      }
    }
    // rule 355.2 / 740.2.a (unl-117-219) — "can be played to an occupied battlefield if …".
    if (
      occupiedPermission !== undefined &&
      battlefieldMatchesOccupiedPermission(zones, getController, bfId, playerId, occupiedPermission)
    ) {
      standard = true;
    }
    // rule 822.1.b — [Ambush]: a battlefield where you have units, as a Reaction.
    if (hasAmbush && !ambush && friendlyAt(io, zone, playerId).length > 0) {
      ambush = true;
    }
    // rule 356.2 / 355.2.b (ven-157-166) — the battlefield's own paid redirect.
    const pips = battlefieldRedirectPowerFor(bfId, cardId);
    const otherwiseValid = standard || reactionKeyword || ambush;
    if (!otherwiseValid && !pips) {
      continue;
    }
    out.push({
      ambush,
      ambushNeedsPresence,
      reactionKeyword,
      standard,
      zone,
      ...(pips ? { redirect: { otherwiseValid, pips } } : {}),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Selections (rule 355.1 / 356.2)
// ---------------------------------------------------------------------------

/** The base-cost alternative(s) this origin plays under. */
function alternativesFor(env: Env): (string | undefined)[] {
  const ids = new Set(env.model.alternatives.map((a) => a.id));
  switch (env.origin.kind) {
    case "facedown":
      return [ALTERNATIVE_COST_IDS.hidden];
    case "trash":
      // rule 356.1 (unl-025-219) — the card's own trash permission names its cost;
      // a board-wide grant (ven-022-166) plays it for the printed cost.
      return ids.has(ALTERNATIVE_COST_IDS.selfTrash) ? [ALTERNATIVE_COST_IDS.selfTrash] : [undefined];
    case "effect":
      return [undefined];
    default:
      return ids.has(ALTERNATIVE_COST_IDS.alt) ? [undefined, ALTERNATIVE_COST_IDS.alt] : [undefined];
  }
}

function sameShape(
  a: { energy?: number; power?: readonly string[] },
  b: { energy?: number; power?: readonly string[] },
): boolean {
  const ap = [...(a.power ?? [])].sort();
  const bp = [...(b.power ?? [])].sort();
  return (a.energy ?? 0) === (b.energy ?? 0) && ap.length === bp.length && ap.every((d, i) => d === bp[i]);
}

/**
 * rule 356.4.c / 356.4.c.1 — every priced shape a payable resource cost may take:
 * the default (component discounts already applied — Ezreal's "[1] or [A]
 * less" —, an XP cost's "I cost [N] less" rider netted), then every other
 * shape the PAYER may leave a flexible discount in. Empty when the player
 * lacks the XP.
 */
function resourceCostSpecs(env: Env, entry: AdditionalCost): { energy: number; power: readonly string[]; xp?: number }[] {
  const xp = entry.cost.xp ?? 0;
  if (xp > 0 && (env.state.players[env.playerId]?.xp ?? 0) < xp) {
    return [];
  }
  const priced = pricePayableAdditionalCost(env.state, env.playerId, entry, env.board);
  const out: { energy: number; power: readonly string[]; xp?: number }[] = [
    { energy: priced.energy, power: [...priced.power], ...(xp > 0 ? { xp } : {}) },
  ];
  if (xp > 0) {
    return out;
  }
  const flex = computeOptionalAdditionalCostFlexReduction({ draft: env.state, ...env.board } as never, env.playerId);
  if (flex > 0) {
    const printed = { energy: entry.cost.energy ?? 0, power: [...(entry.cost.power ?? [])] };
    for (const shape of flexibleShapes(printed, flex)) {
      if (!out.some((o) => sameShape(o, shape))) {
        out.push({ energy: shape.energy, power: [...shape.power] });
      }
    }
  }
  return out;
}

/** Per additional cost: the values a selection may take (`undefined` = not paid). */
function choicesFor(env: Env, entry: AdditionalCost, offerOptional: boolean): (PaidValue | undefined)[] {
  if (!entry.mandatory && !offerOptional) {
    return [undefined];
  }
  if (
    !entry.mandatory &&
    env.origin.kind === "effect" &&
    env.origin.optionalCostIds !== undefined &&
    !env.origin.optionalCostIds.includes(entry.id)
  ) {
    return [undefined];
  }
  const none: (PaidValue | undefined)[] = entry.mandatory ? [] : [undefined];
  const c = env.candidates;
  switch (entry.id) {
    case ADDITIONAL_COST_IDS.accelerate:
    case ADDITIONAL_COST_IDS.accelerateGranted:
    case ADDITIONAL_COST_IDS.pay:
      return [...none, ...resourceCostSpecs(env, entry).map((spec) => ({ spec }))];
    case ADDITIONAL_COST_IDS.discard: {
      const n = typeof entry.cost.discard === "number" ? entry.cost.discard : 1;
      if (n !== 1) {
        return [...none, ...objectSubsets(c.discard).filter((s) => s.length === n).map((objects) => ({ objects }))];
      }
      return [...none, ...c.discard.map((id) => ({ objects: [id] }))];
    }
    case ADDITIONAL_COST_IDS.kill:
      return [...none, ...c.killSingle.map((id) => ({ objects: [id] }))];
    case ADDITIONAL_COST_IDS.killAny:
      return [undefined, ...objectSubsets(c.killAny).map((objects) => ({ objects }))];
    case ADDITIONAL_COST_IDS.spendBuffAny:
      return [undefined, ...objectSubsets(c.buffed).map((objects) => ({ objects }))];
    case ADDITIONAL_COST_IDS.spendBuff:
      return [...none, ...c.buffed.map((id) => ({ objects: [id] }))];
    case ADDITIONAL_COST_IDS.exhaust: {
      const descriptor = entry.cost.exhaust as { type?: string } | undefined;
      if (descriptor?.type === "legend") {
        return c.readyLegend ? [...none, { objects: [c.readyLegend] }] : none;
      }
      return [...none, ...c.exhaustable.map((id) => ({ objects: [id] }))];
    }
    case ADDITIONAL_COST_IDS.returnToHand:
      return [...none, ...c.gear.map((id) => ({ objects: [id] }))];
    default:
      return [undefined];
  }
}

/** rule 355.1 / 356.2 — every cost selection worth evaluating for this play (bounded cross product). */
function generateSelections(env: Env): PlayCostSelection[] {
  const offerOptional = env.origin.kind !== "effect" || env.origin.offerOptionalCosts !== false;
  const perEntry = env.model.additional
    .filter((e) => e.id !== ADDITIONAL_COST_IDS.deflect)
    .map((entry) => ({ entry, values: choicesFor(env, entry, offerOptional) }));
  let combos: Record<string, PaidValue>[] = [{}];
  for (const { entry, values } of perEntry) {
    if (values.length === 0) {
      // rule 356.2.a.1 — a mandatory cost nothing can pay: no selection exists.
      return [];
    }
    const next: Record<string, PaidValue>[] = [];
    for (const acc of combos) {
      for (const v of values) {
        if (next.length >= MAX_SELECTIONS) {
          break;
        }
        next.push(v === undefined ? acc : { ...acc, [entry.id]: v });
      }
    }
    combos = next;
  }
  const out: PlayCostSelection[] = [];
  for (const alternativeId of alternativesFor(env)) {
    for (const paid of combos) {
      out.push({
        ...(alternativeId ? { alternativeId } : {}),
        ...(Object.keys(paid).length > 0 ? { paid } : {}),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Evaluate one (destination, selection)
// ---------------------------------------------------------------------------

/** Objects a selection removes from the board while paying (killed units / bounced gear). */
function boardVictims(selection: PlayCostSelection): Set<string> {
  const out = new Set<string>();
  for (const [id, v] of Object.entries(selection.paid ?? {})) {
    if (v === true) {
      continue;
    }
    if (id === ADDITIONAL_COST_IDS.kill || id === ADDITIONAL_COST_IDS.killAny || id === ADDITIONAL_COST_IDS.returnToHand) {
      for (const o of v.objects ?? []) {
        out.add(o);
      }
    }
  }
  return out;
}

/**
 * Validate and normalise the OBJECTS / specs a selection names against the same
 * candidate lists the menu draws from. Undefined = not a legal selection.
 */
function normaliseSelection(env: Env, selection: PlayCostSelection): PlayCostSelection | undefined {
  const paid: Record<string, PaidValue> = {};
  const c = env.candidates;
  const inList = (objects: readonly string[], list: readonly string[], exact?: number): boolean =>
    new Set(objects).size === objects.length &&
    objects.every((o) => list.includes(o)) &&
    (exact === undefined || objects.length === exact);
  for (const [id, raw] of Object.entries(selection.paid ?? {})) {
    if (id === ADDITIONAL_COST_IDS.redirect) {
      paid[id] = true;
      continue;
    }
    if (id === ADDITIONAL_COST_IDS.deflect) {
      continue;
    }
    const entry = env.model.additional.find((a) => a.id === id);
    if (!entry) {
      return undefined;
    }
    const v = raw === true ? { objects: [] as readonly string[] } : raw;
    const objects = [...(v.objects ?? [])].map(String);
    switch (id) {
      case ADDITIONAL_COST_IDS.accelerate:
      case ADDITIONAL_COST_IDS.accelerateGranted:
      case ADDITIONAL_COST_IDS.pay: {
        const specs = resourceCostSpecs(env, entry);
        if (specs.length === 0) {
          return undefined;
        }
        // rule 356.4.c.1 — an elected shape the payer MAY choose is honoured;
        // anything else pays the default (discounted) shape.
        const wanted = "spec" in v ? v.spec : undefined;
        const spec = (wanted && specs.find((s) => sameShape(s, wanted))) ?? (specs[0] as (typeof specs)[number]);
        paid[id] = { spec };
        break;
      }
      case ADDITIONAL_COST_IDS.discard: {
        const n = typeof entry.cost.discard === "number" ? entry.cost.discard : 1;
        if (!inList(objects, c.discard, n)) {
          return undefined;
        }
        paid[id] = { objects };
        break;
      }
      case ADDITIONAL_COST_IDS.kill:
        if (!inList(objects, c.killSingle, 1)) {
          return undefined;
        }
        paid[id] = { objects };
        break;
      case ADDITIONAL_COST_IDS.killAny:
        if (objects.length === 0) {
          break;
        }
        if (!isListedSubset(objects, c.killAny)) {
          return undefined;
        }
        paid[id] = { objects };
        break;
      case ADDITIONAL_COST_IDS.spendBuffAny:
        if (objects.length === 0) {
          break;
        }
        if (!isListedSubset(objects, c.buffed)) {
          return undefined;
        }
        paid[id] = { objects };
        break;
      case ADDITIONAL_COST_IDS.spendBuff:
        if (objects.length === 0 && c.buffed.length > 0) {
          // Legacy flag without an object: the first spendable buff pays.
          paid[id] = { objects: [c.buffed[0] as string] };
          break;
        }
        if (!inList(objects, c.buffed, 1)) {
          return undefined;
        }
        paid[id] = { objects };
        break;
      case ADDITIONAL_COST_IDS.exhaust: {
        const descriptor = entry.cost.exhaust as { type?: string } | undefined;
        if (descriptor?.type === "legend") {
          if (!c.readyLegend || (objects.length > 0 && (objects.length !== 1 || objects[0] !== c.readyLegend))) {
            return undefined;
          }
          paid[id] = { objects: [c.readyLegend] };
          break;
        }
        if (!inList(objects, c.exhaustable, 1)) {
          return undefined;
        }
        paid[id] = { objects };
        break;
      }
      case ADDITIONAL_COST_IDS.returnToHand:
        if (!inList(objects, c.gear, 1)) {
          return undefined;
        }
        paid[id] = { objects };
        break;
      default:
        paid[id] = raw;
        break;
    }
  }
  return {
    ...(selection.alternativeId !== undefined ? { alternativeId: selection.alternativeId } : {}),
    ...(Object.keys(paid).length > 0 ? { paid } : {}),
  };
}

function quoteOf(total: TotalCost): PlayCostQuote {
  const r = total.resources;
  const xp = total.objects.filter((o) => o.kind === "xp").reduce((a, o) => a + (o.count ?? 0), 0);
  const power: Record<string, number> = {};
  for (const [d, n] of Object.entries(r.named)) {
    if (n && n > 0) {
      power[d] = n;
    }
  }
  return {
    any: r.free ? 0 : r.any + (r.hybrid?.n ?? 0),
    energy: r.free || r.ignoreEnergy ? 0 : r.energy,
    entersReady: total.entersReady,
    free: r.free,
    paidIds: total.paidIds.filter((id) => id !== ADDITIONAL_COST_IDS.deflect),
    power: r.free ? {} : power,
    xp,
  };
}

/**
 * The heart of the model: is playing the card to `dest` paying `selection`
 * legal and payable NOW? Returns the option (with its total cost) or undefined.
 */
function evaluate(env: Env, dest: PlayDestination, rawSelection: PlayCostSelection): UnitPlayOption | undefined {
  const { state, playerId, cardId, origin } = env;
  const selection = normaliseSelection(env, rawSelection);
  if (!selection) {
    return undefined;
  }
  if (!alternativesFor(env).includes(selection.alternativeId)) {
    return undefined;
  }
  const victims = boardVictims(selection);
  const isBf = isBattlefieldZone(dest.zone);
  const presenceAfter = isBf ? friendlyAt(env.io, dest.zone, playerId).filter((id) => !victims.has(id)).length : 0;

  // rule 355.2 / 358.4 — which permission admits the play in the current window.
  // rule 822.3 / 813.4.b — Ambush's Reaction is void once its own cost empties the battlefield.
  const ambushOk = dest.ambush && (env.now.standard || env.now.reaction) && (!dest.ambushNeedsPresence || presenceAfter > 0);
  const wantsRedirect = selection.paid?.[ADDITIONAL_COST_IDS.redirect] !== undefined;
  let admittedBy: UnitPlayOption["admittedBy"] | undefined;
  if (dest.always) {
    admittedBy = "always";
  } else if (dest.standard && env.now.standard) {
    admittedBy = "standard";
  } else if (dest.reactionKeyword && env.now.reaction) {
    admittedBy = "reaction";
  } else if (ambushOk) {
    admittedBy = "ambush";
  } else if (dest.redirect && wantsRedirect && (env.now.standard || (env.hasReactionKeyword && env.now.reaction))) {
    // rule 355.2.b (ven-157-166) — paying the battlefield's cost is what makes it Valid.
    admittedBy = env.now.standard ? "standard" : "reaction";
  }
  if (admittedBy === undefined) {
    return undefined;
  }
  // A destination Valid ONLY through its paid redirect must pay it (357.3); no redirect elsewhere.
  if (dest.redirect && !dest.redirect.otherwiseValid && !wantsRedirect) {
    return undefined;
  }
  if (wantsRedirect && !dest.redirect) {
    return undefined;
  }
  // rule 822.4 — an [Ambush] unit HAS [Reaction] while being played to a battlefield where
  // its controller has units; rule 811.6 — so does a card played from facedown.
  const grantedReaction = origin.kind === "facedown" || (env.hasAmbush && isBf && presenceAfter > 0);

  const redirectEntry: AdditionalCost | undefined = dest.redirect
    ? { cost: { power: [...dest.redirect.pips] }, id: ADDITIONAL_COST_IDS.redirect, mandatory: !dest.redirect.otherwiseValid }
    : undefined;
  const model: PlayCostModel = redirectEntry ? { ...env.model, additional: [...env.model.additional, redirectEntry] } : env.model;
  const ctx: CostModelContext = {
    ...env.modelCtx,
    grantedReaction,
    ...(origin.kind === "effect" && origin.extras ? { extras: origin.extras } : {}),
  };
  let total = computeTotalCost(state, playerId, cardId, selection, ctx, model);
  if (total.illegal) {
    return undefined;
  }
  if (origin.kind === "effect" && origin.free) {
    // rule 356.5.a — "any and all costs": nothing is paid; elections still count as made (356.4.f.1).
    total = {
      ...total,
      objects: total.objects.filter((o) => o.kind !== "xp"),
      resources: { any: 0, energy: 0, free: true, ignoreEnergy: false, named: {} },
    };
  }
  const xp = total.objects.filter((o) => o.kind === "xp").reduce((a, o) => a + (o.count ?? 0), 0);
  if (xp > 0 && (state.players[playerId]?.xp ?? 0) < xp) {
    return undefined;
  }
  // rule 357.1.a / 429.3 — when LISTING, a cost the player could pay after one
  // Add counts as payable: the unit path priced the pool alone, so a 2-cost body
  // next to 1 pooled Energy and a ready rune was simply missing from the hand
  // and the player had to know to tap first. `env.reach` is unset on the submit
  // path, so an actual attempt is still refused (manual pay).
  if (
    state.runePools[playerId] !== undefined &&
    !canPayResourceCost(state, playerId, cardId, total.resources, env.reach ?? 0)
  ) {
    return undefined;
  }
  return {
    admittedBy,
    cardId,
    destination: dest.zone,
    grantedReaction,
    origin: origin.kind,
    playerId,
    quote: quoteOf(total),
    selection,
    total,
    ...(wantsRedirect && dest.redirect ? { redirect: dest.redirect.otherwiseValid ? "optional" : "mandatory" } : {}),
  };
}

// ---------------------------------------------------------------------------
// Public: enumerate / resolve
// ---------------------------------------------------------------------------

/** rule 419.1 / 103 — may `playerId` play `cardId` from this origin at all (before locations and costs)? */
function originPermits(state: RiftboundGameState, io: PlayOptionIO, playerId: string, cardId: string, origin: UnitPlayOrigin): boolean {
  if (state.status !== undefined && state.status !== "playing") {
    return false;
  }
  if (state.cannotPlayCardsThisTurn?.[playerId]) {
    return false;
  }
  const registry = getGlobalCardRegistry();
  const type = registry.getCardType(cardId);
  if (type !== "unit" && type !== "gear" && type !== "equipment") {
    return false;
  }
  if (origin.kind !== "effect") {
    // rule 103 — your card (an effect may have you play another player's card — 191.1).
    const owner = io.cards.getCardOwner?.(cardId as CoreCardId) as string | undefined;
    if (owner !== undefined && owner !== playerId) {
      return false;
    }
  }
  // rule 419.1 (ven-029-166 / ven-132-166) — the card's own or a board static's "can't be played".
  if (typeof io.zones?.getCardsInZone === "function" && typeof io.cards?.getCardOwner === "function") {
    if (playIsForbidden({ cards: io.cards, draft: state, zones: io.zones } as never, playerId, cardId)) {
      return false;
    }
  } else if (selfPlayIsForbidden(state, playerId, cardId)) {
    return false;
  }
  const zone = io.zones.getCardZone?.(cardId as CoreCardId) as string | undefined;
  switch (origin.kind) {
    case "hand":
      return zone === "hand";
    case "trash":
      return (
        zone === "trash" &&
        (hasPlayFromTrashGrant(state, io.zones, playerId) || getSelfTrashPlayCost(state, playerId, cardId) !== undefined)
      );
    case "championZone":
      return zone === "championZone";
    case "facedown":
      return true;
    default:
      return true;
  }
}

/**
 * rule 355–358 — every legal, payable (destination × cost selection) for
 * `playerId` playing permanent `cardId` from `origin` right now. Menus list
 * exactly this; reducers accept exactly this.
 */
export function computeUnitPlayOptions(
  state: RiftboundGameState,
  io: PlayOptionIO,
  playerId: string,
  cardId: string,
  origin: UnitPlayOrigin,
  /** rule 357.1.a — see `Env.reach`: pass this only from an ENUMERATOR. */
  reach?: ReachableAdds,
): UnitPlayOption[] {
  if (state.pendingChoice && origin.kind !== "effect") {
    return [];
  }
  if (!originPermits(state, io, playerId, cardId, origin)) {
    return [];
  }
  const destinations = unitPlayDestinations(state, io, playerId, cardId, origin);
  if (destinations.length === 0) {
    return [];
  }
  const env = buildEnv(state, io, playerId, cardId, origin, reach);
  const selections = generateSelections(env);
  const out: UnitPlayOption[] = [];
  const seen = new Set<string>();
  for (const dest of destinations) {
    for (const base of selections) {
      const tries: PlayCostSelection[] = [];
      if (dest.redirect) {
        const withRedirect: PlayCostSelection = { ...base, paid: { ...(base.paid ?? {}), [ADDITIONAL_COST_IDS.redirect]: true } };
        if (dest.redirect.otherwiseValid) {
          tries.push(base, withRedirect);
        } else {
          tries.push(withRedirect);
        }
      } else {
        tries.push(base);
      }
      for (const selection of tries) {
        const option = evaluate(env, dest, selection);
        if (!option) {
          continue;
        }
        const key = unitPlayOptionKey(option);
        if (!seen.has(key)) {
          seen.add(key);
          out.push(option);
        }
      }
    }
  }
  return out;
}

/** A stable identity for an option (destination + alternative + paid ids with objects / spec). */
export function unitPlayOptionKey(option: Pick<UnitPlayOption, "destination" | "selection">): string {
  const paid = Object.entries(option.selection.paid ?? {})
    .map(([id, v]) => {
      if (v === true) {
        return id;
      }
      const objects = [...(v.objects ?? [])].sort().join("+");
      const spec = v.spec ? `${v.spec.energy ?? 0}/${[...(v.spec.power ?? [])].sort().join(",")}/${v.spec.xp ?? 0}` : "";
      return `${id}:${objects}:${spec}`;
    })
    .sort()
    .join("|");
  return `${option.destination}#${option.selection.alternativeId ?? ""}#${paid}`;
}

/** The move-param shapes callers submit (legacy per-kind params and/or `costs`). */
export interface SubmittedUnitPlay {
  readonly location?: string;
  readonly paidAdditionalCost?: boolean;
  readonly additionalCostSpec?: { energy?: number; power?: readonly string[]; xp?: number };
  readonly sacrificeId?: string;
  readonly sacrificeIds?: readonly string[];
  readonly discardId?: string;
  readonly spentBuffIds?: readonly string[];
  readonly altCost?: boolean;
  readonly viaFlow?: boolean;
  readonly targets?: readonly string[];
  readonly costs?: PlayCostSelection;
}

/**
 * rule 355.1 — the selection a move was submitted with, in either param shape,
 * normalised for THIS origin/destination: origin-implied alternatives filled
 * in, an id only the bare legacy flag could have produced (`accelerate-granted`
 * on a card that is not granted one) dropped, and at a battlefield with its own
 * paid redirect the pips elected exactly as the flag always implied.
 */
function selectionFromSubmitted(env: Env, dest: PlayDestination, params: SubmittedUnitPlay): PlayCostSelection {
  const fromLegacy = params.costs === undefined;
  const sel = selectionFromLegacyParams(env.cardId, { ...params });
  const paid: Record<string, PaidValue> = { ...(sel.paid ?? {}) };
  const onModel = new Set(env.model.additional.map((a) => a.id));
  if (fromLegacy) {
    // The bare legacy flag translates to `accelerate-granted` on a card with no
    // printed optional cost; keep it only when this play really is granted one.
    for (const id of Object.keys(paid)) {
      if (!onModel.has(id)) {
        delete paid[id];
      }
    }
  }
  // An explicit `costs` naming an id this play does not carry stays as it is —
  // `computeTotalCost` reports it illegal and the play is refused.
  if (dest.redirect && (!dest.redirect.otherwiseValid || (fromLegacy && params.paidAdditionalCost === true))) {
    paid[ADDITIONAL_COST_IDS.redirect] = true;
  }
  let alternativeId = sel.alternativeId;
  const allowed = alternativesFor(env);
  if (!allowed.includes(alternativeId) && (env.origin.kind === "facedown" || env.origin.kind === "trash" || env.origin.kind === "effect")) {
    alternativeId = allowed[0];
  }
  return {
    ...(alternativeId !== undefined ? { alternativeId } : {}),
    ...(Object.keys(paid).length > 0 ? { paid } : {}),
  };
}

/**
 * rule 358 — does the submitted play name a legal, payable option? Recomputes
 * exactly the option the enumerator would list for these params (same
 * destinations, same candidate objects, same total). Undefined = refuse.
 */
export function resolveSubmittedUnitPlay(
  state: RiftboundGameState,
  io: PlayOptionIO,
  playerId: string,
  cardId: string,
  origin: UnitPlayOrigin,
  params: SubmittedUnitPlay,
): UnitPlayOption | undefined {
  if (state.pendingChoice && origin.kind !== "effect") {
    return undefined;
  }
  if (!originPermits(state, io, playerId, cardId, origin)) {
    return undefined;
  }
  const destinations = unitPlayDestinations(state, io, playerId, cardId, origin);
  if (destinations.length === 0) {
    return undefined;
  }
  const env = buildEnv(state, io, playerId, cardId, origin);
  const fallback = origin.kind === "facedown" || !env.isUnit ? destinations[0]?.zone : "base";
  const location = params.location ?? fallback;
  const dest = destinations.find((d) => d.zone === location);
  if (!dest) {
    return undefined;
  }
  const selection = selectionFromSubmitted(env, dest, params);
  // rule 364.3.a / 356.2.b — a legacy `paidAdditionalCost: true` must actually
  // elect something this play offers (a gated or XP-short payment, or a card
  // with no additional cost at all, is not a legal "paid" play).
  if (params.paidAdditionalCost === true && params.costs === undefined && Object.keys(selection.paid ?? {}).length === 0) {
    return undefined;
  }
  return evaluate(env, dest, selection);
}

// ---------------------------------------------------------------------------
// Option → move params (menus keep their legacy shape)
// ---------------------------------------------------------------------------

/**
 * The legacy per-kind params a menu variant carries for `option`, plus the
 * canonical `costs` selection and a `quote` of what it will charge.
 */
export function unitPlayOptionParams(option: UnitPlayOption): Record<string, unknown> {
  const out: Record<string, unknown> = { location: option.destination };
  const paid = option.selection.paid ?? {};
  let flag = option.redirect === "optional";
  const costsPaid: Record<string, PaidValue> = {};
  for (const [id, v] of Object.entries(paid)) {
    const objects = v === true ? [] : [...(v.objects ?? [])];
    switch (id) {
      case ADDITIONAL_COST_IDS.accelerate:
      case ADDITIONAL_COST_IDS.accelerateGranted:
      case ADDITIONAL_COST_IDS.pay: {
        flag = true;
        const spec = v === true ? undefined : v.spec;
        if (spec) {
          out.additionalCostSpec = {
            energy: spec.energy ?? 0,
            power: [...(spec.power ?? [])],
            ...((spec.xp ?? 0) > 0 ? { xp: spec.xp } : {}),
          };
        }
        costsPaid[id] = spec ? { spec: out.additionalCostSpec as NonNullable<typeof spec> } : true;
        break;
      }
      case ADDITIONAL_COST_IDS.kill:
      case ADDITIONAL_COST_IDS.returnToHand:
        flag = true;
        out.sacrificeId = objects[0];
        costsPaid[id] = { objects };
        break;
      case ADDITIONAL_COST_IDS.killAny:
        if (objects.length === 0) {
          break;
        }
        flag = true;
        out.sacrificeIds = objects;
        if (objects.length === 1) {
          out.sacrificeId = objects[0];
        }
        costsPaid[id] = { objects };
        break;
      case ADDITIONAL_COST_IDS.spendBuffAny:
        if (objects.length === 0) {
          break;
        }
        flag = true;
        out.spentBuffIds = objects;
        costsPaid[id] = { objects };
        break;
      case ADDITIONAL_COST_IDS.spendBuff:
        flag = true;
        out.spentBuffIds = objects;
        costsPaid[id] = { objects };
        break;
      case ADDITIONAL_COST_IDS.discard:
        flag = true;
        out.discardId = objects[0];
        costsPaid[id] = { objects };
        break;
      case ADDITIONAL_COST_IDS.exhaust:
        flag = true;
        costsPaid[id] = objects.length > 0 ? { objects } : true;
        break;
      case ADDITIONAL_COST_IDS.redirect:
        if (option.redirect === "optional") {
          costsPaid[id] = true;
        }
        break;
      default:
        flag = true;
        costsPaid[id] = v;
        break;
    }
  }
  if (flag) {
    out.paidAdditionalCost = true;
  }
  const alternativeId = option.selection.alternativeId;
  if (alternativeId === ALTERNATIVE_COST_IDS.alt) {
    out.altCost = true;
  }
  const impliedAlternative =
    alternativeId === undefined ||
    (option.origin === "trash" && alternativeId === ALTERNATIVE_COST_IDS.selfTrash) ||
    (option.origin === "facedown" && Object.keys(costsPaid).length === 0);
  if (!impliedAlternative || Object.keys(costsPaid).length > 0) {
    out.costs = {
      ...(alternativeId !== undefined && !(option.origin === "trash" && alternativeId === ALTERNATIVE_COST_IDS.selfTrash)
        ? { alternativeId }
        : {}),
      ...(Object.keys(costsPaid).length > 0 ? { paid: costsPaid } : {}),
    };
  }
  out.quote = option.quote;
  return out;
}

// ---------------------------------------------------------------------------
// Pay (rule 357)
// ---------------------------------------------------------------------------

export interface PaidUnitPlay {
  readonly paidIds: readonly string[];
  readonly paidAdditionalCost: boolean;
  readonly entersReady: boolean;
  /** A cost payment opened a prompt (371.2 optional costed die replacement): the entry must wait. */
  readonly suspended: boolean;
}

/**
 * rule 357 — pay every cost of `option` on the draft: the resource total as ONE
 * pool payment (specific-Domain pips first, any-Domain last — 135.2.e.5;
 * one-shot "next card costs less" riders consumed now), XP, discards, spent
 * buffs (one event each — 702.2.b), cost-kills through the kill effect
 * (Deathknell / die replacements apply, a replaced kill still counts as paid —
 * 357.2.a; a "reduce my cost for each killed" unit that survived pays its pip
 * back), an exhausted legend / permanent, a returned gear.
 */
export function payUnitPlayCosts(
  draft: RiftboundGameState,
  io: PlayOptionIO,
  option: UnitPlayOption,
): PaidUnitPlay {
  const { playerId, cardId } = option;
  const { cards, zones, counters } = io;
  const trig = { cards, counters, draft, zones } as unknown as Parameters<typeof fireTriggers>[1];
  const fire = (event: unknown) => fireTriggers(event as never, trig);
  const paid = option.selection.paid ?? {};
  const objectsOf = (id: string): string[] => {
    const v = paid[id];
    return v === undefined || v === true ? [] : [...(v.objects ?? [])];
  };

  // rule 356 → 357.1 — the total is fixed BEFORE anything is paid; recompute it on the
  // draft only to consume one-shot riders ("the next unit you play costs [2] less").
  const resources = option.total.resources.free
    ? option.total.resources
    : computePlayResourceCost(draft, playerId, cardId, option.total.extras, createMetaAccessor(cards), true);

  // XP (unl-178-219).
  const xp = option.total.objects.filter((o) => o.kind === "xp").reduce((a, o) => a + (o.count ?? 0), 0);
  const player = draft.players[playerId];
  if (xp > 0 && player) {
    player.xp = Math.max(0, player.xp - xp);
  }
  // rule 356.2.b / 422 (ogn-002-298) — a discard paid as a cost is still a discard.
  const discards = objectsOf(ADDITIONAL_COST_IDS.discard);
  if (discards.length > 0) {
    removeFromBoard(
      { cards, counters, draft, zones } as never,
      discards,
      "trash",
      { by: playerId, kind: "discard", source: cardId } as never,
      fire as never,
    );
  }
  // rule 357.1 — Energy + Power as one assignment.
  if (!resources.free && draft.runePools[playerId] !== undefined) {
    payResourceCost(draft, playerId, cardId, resources);
  }
  // rule 702.2.b — each spent buff is its own event.
  const buffs = [...objectsOf(ADDITIONAL_COST_IDS.spendBuffAny), ...objectsOf(ADDITIONAL_COST_IDS.spendBuff)];
  for (const id of buffs) {
    removeOneBuffCounter(cards as BuffCardsIo, counters, id);
  }
  for (const id of buffs) {
    fire({ cardId, playerId, spentFrom: id, type: "spend-buff" });
  }
  // rule 428.1 / 357.2.a — cost-kills are real kills.
  const killAny = objectsOf(ADDITIONAL_COST_IDS.killAny);
  const killSingle = objectsOf(ADDITIONAL_COST_IDS.kill);
  const registry = getGlobalCardRegistry();
  for (const id of [...killSingle, ...killAny]) {
    const type = registry.getCardType(id);
    executeEffect({ target: { type: type === "gear" || type === "equipment" ? "gear" : "unit" }, type: "kill" } as never, {
      boundTargets: [id],
      cards,
      counters,
      draft,
      fireTriggers: fire,
      playerId,
      sourceCardId: cardId,
      zones,
    } as never);
  }
  // rule 356.4 / 370 (ogn-231-298 × sfd-173-221) — "for each killed this way": a
  // replaced death paid the cost but earns no discount — charge that pip back.
  const killAnyCost = killAny.length > 0 ? getKillAnyNumberCost(cardId) : undefined;
  if (killAnyCost) {
    const survived = killAny.filter((id) => {
      const zone = zones.getCardZone(id as CoreCardId) as string | undefined;
      return zone === "base" || (typeof zone === "string" && zone.startsWith("battlefield-"));
    });
    const pool = draft.runePools[playerId];
    if (survived.length > 0 && pool) {
      const key = killAnyCost.domain as keyof typeof pool.power;
      const owed = Math.min(survived.length, pool.power[key] ?? 0);
      if (owed > 0) {
        pool.power[key] = (pool.power[key] ?? 0) - owed;
        recordPowerSpent(draft, playerId, owed);
      }
    }
  }
  // rule 356.2.b / 414.4 (sfd-079-221, ogn-048-298) — exhaust the paying permanent.
  for (const id of objectsOf(ADDITIONAL_COST_IDS.exhaust)) {
    counters?.setFlag?.(id as CoreCardId, "exhausted", true);
    cards.updateCardMeta?.(id as CoreCardId, { exhausted: true } as Partial<RiftboundCardMeta>);
  }
  // rule 356.2.a.1 (sfd-044-221) — the gear is in its owner's hand before anything can respond.
  for (const id of objectsOf(ADDITIONAL_COST_IDS.returnToHand)) {
    executeEffect({ target: { type: "gear" }, type: "return-to-hand" } as never, {
      boundTargets: [id],
      cards,
      counters,
      draft,
      fireTriggers: fire,
      playerId,
      sourceCardId: cardId,
      zones,
    } as never);
  }
  const paidIds = option.total.paidIds.filter((id) => id !== ADDITIONAL_COST_IDS.deflect);
  return {
    entersReady: option.total.entersReady,
    // rule 805.1.a / 356.2.b.1 — the bare "if you paid the additional cost"
    // payoff keys on the card's OWN printed additional cost; an [Accelerate]
    // another permanent grants this play is a separate election and buys only
    // its own enter-ready.
    paidAdditionalCost: paidIds.some((id) => !isGrantedAdditionalCostId(id)),
    paidIds,
    suspended: draft.pendingChoice !== undefined && draft.pendingChoice !== null,
  };
}
