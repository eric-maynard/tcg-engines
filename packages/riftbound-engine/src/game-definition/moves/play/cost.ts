/**
 * Play-cost and enter-state helpers shared by the play* moves
 * (split from cards.ts). Leaf module: must not import move defs.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { type EffectContext, executeEffect } from "../../../abilities/effect-executor";
import { evaluateLegionCondition } from "../../../abilities/legion-conditions";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import {
  type CostReductionContext,
  type StaticCostReduction,
  applyStaticCostReduction,
  computeGrantedSpellRepeatCost,
  computeOptionalAdditionalCostFlexReduction,
  computeStaticCostReduction,
  computeStaticRepeatCostReduction,
  decodeCostAmount,
  reducePowerCost,
} from "../../../operations/static-cost-reduction";
import { getBattlefieldZoneId } from "../../../zones/zone-configs";

/**
 * Check whether a card carries a static ability whose effect has the given
 * `type`. Used for enter-state modifiers such as `enter-ready` (rule 143.4
 * override — unit enters ready instead of exhausted) and `enters-exhausted`
 * (gear that enters tapped, e.g. Honeyfruit unl-049-219).
 */
export function hasStaticEffect(cardId: string, effectType: string): boolean {
  const abilities = getGlobalCardRegistry().getAbilities(cardId) ?? [];
  for (const ability of abilities) {
    if (ability?.type !== "static") {
      continue;
    }
    const effect = (ability as { effect?: { type?: string } }).effect;
    if (effect?.type === effectType) {
      return true;
    }
  }
  return false;
}

/**
 * rule-id: ven-091-166 — a static "I enter ready" may carry a play-time
 * condition (e.g. "If your score is not within 3 points of the Victory
 * Score"). Returns true only if some static enter-ready ability's condition
 * holds. Conditions this helper cannot evaluate keep the legacy
 * unconditional behaviour.
 */
export function staticEnterReadyApplies(
  cardId: string,
  state: RiftboundGameState,
  playerId: string,
): boolean {
  const abilities = getGlobalCardRegistry().getAbilities(cardId) ?? [];
  for (const ability of abilities) {
    if (ability?.type !== "static") {
      continue;
    }
    const { effect, condition } = ability as {
      effect?: { type?: string };
      condition?: Record<string, unknown>;
    };
    if (effect?.type !== "enter-ready") {
      continue;
    }
    if (!condition || evaluateEnterReadyCondition(condition, state, playerId) !== false) {
      return true;
    }
  }
  return false;
}

function evaluateEnterReadyCondition(
  condition: Record<string, unknown>,
  state: RiftboundGameState,
  playerId: string,
): boolean | undefined {
  switch (condition.type) {
    case "not": {
      const inner = evaluateEnterReadyCondition(
        (condition.condition ?? {}) as Record<string, unknown>,
        state,
        playerId,
      );
      return inner === undefined ? undefined : !inner;
    }
    case "score-within": {
      const range = ((condition.points ?? condition.range) as number | undefined) ?? 0;
      const whose = (condition.whose as string | undefined) ?? "opponent";
      const pids = Object.keys(state.players).filter((pid) =>
        whose === "your" ? pid === playerId : whose === "any" ? true : pid !== playerId,
      );
      return pids.some((pid) => {
        const player = state.players[pid];
        const threshold = state.victoryScore + (player?.victoryScoreModifier ?? 0);
        return threshold - (player?.victoryPoints ?? 0) <= range;
      });
    }
    // rule-id: ogn-144-298 — "If an enemy unit has died this turn": read the
    // per-player turn event log (`fireTriggers` records deaths).
    case "this-turn": {
      const eventType = condition.event as string;
      const events = state.turnEvents?.[playerId] ?? [];
      const n = events.filter((e) => e === eventType).length;
      const cmp = condition.count as { gte?: number; eq?: number; lte?: number } | undefined;
      if (cmp?.eq !== undefined) return n === cmp.eq;
      if (cmp?.lte !== undefined) return n <= cmp.lte && n >= (cmp.gte ?? 0);
      return n >= (cmp?.gte ?? 1);
    }
    // rule 143.4 / rule-id: ogn-035-298 — "If an opponent controls a
    // battlefield, I enter ready": the parser emits the battlefield subject as
    // `{type:"card"|"battlefield", controller:"enemy"}` with no filter.
    case "opponent-controls": {
      const target = (condition.target ?? {}) as { type?: string; filter?: unknown };
      if (target.type === "battlefield" || (target.type === "card" && target.filter === undefined)) {
        return Object.values(state.battlefields ?? {}).some(
          (bf) => typeof bf?.controller === "string" && bf.controller !== playerId,
        );
      }
      return undefined;
    }
    default: {
      return undefined;
    }
  }
}

/**
 * rule 466 / rule-id: ogn-047-298 — the played card's OWN static
 * "If CONDITION, this costs [N] less" rider: a flat energy discount applied
 * at pay time when the play-time condition holds. Unscaled (no `scope`/`by`)
 * self cost-reductions without a condition, or with a condition this module
 * cannot evaluate, contribute 0 here.
 */
function getSelfConditionalEnergyReduction(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
): number {
  let total = 0;
  for (const ability of getGlobalCardRegistry().getAbilities(cardId) ?? []) {
    if (ability?.type !== "static") {
      continue;
    }
    const { effect, condition } = ability as {
      effect?: { type?: string; target?: unknown; scope?: unknown; by?: unknown; reduction?: unknown; amount?: unknown };
      condition?: Record<string, unknown>;
    };
    if (effect?.type !== "cost-reduction" || effect.target !== "self") {
      continue;
    }
    if (effect.scope !== undefined || effect.by !== undefined || !condition) {
      continue;
    }
    if (evaluateEnterReadyCondition(condition, state, playerId) !== true) {
      continue;
    }
    total += Math.max(0, decodeCostAmount(effect.reduction ?? effect.amount).energy);
  }
  return total;
}

/**
 * rule 724 / rule-id: ogn-012-298 — the played card's OWN `[Legion] — I cost
 * [N] less` keyword: a flat self discount once its controller has already
 * played another card this turn (read before this play bumps the counter).
 */
function getSelfLegionEnergyReduction(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
): number {
  let total = 0;
  for (const ability of getGlobalCardRegistry().getAbilities(cardId) ?? []) {
    if (ability?.type !== "keyword" || ability.keyword !== "Legion") {
      continue;
    }
    const effect = (ability as { effect?: { type?: string; target?: unknown; reduction?: unknown; amount?: unknown; by?: unknown } }).effect;
    if (effect?.type !== "cost-reduction" || (effect.target !== undefined && effect.target !== "self")) {
      continue;
    }
    if (!evaluateLegionCondition(state, playerId)) {
      continue;
    }
    total += Math.max(0, decodeCostAmount(effect.reduction ?? effect.amount ?? effect.by).energy);
  }
  return total;
}

/**
 * Read a static `play-restriction` effect's `allowedLocation` string
 * ("You may play me to …"). Returns undefined when the card has none.
 */
export function getPlayLocationPermission(cardId: string): string | undefined {
  const abilities = getGlobalCardRegistry().getAbilities(cardId) ?? [];
  for (const ability of abilities) {
    if (ability?.type !== "static") {
      continue;
    }
    const effect = (
      ability as { effect?: { type?: string; allowedLocation?: string; appliesTo?: string } }
    ).effect;
    if (effect?.type === "play-restriction" && !effect.appliesTo) {
      return effect.allowedLocation;
    }
  }
  return undefined;
}

/**
 * Rule ogn-193-298: a friendly unit on the board with static "Friendly units
 * may be played to open battlefields" (play-restriction with
 * `appliesTo: "friendly-units"`) extends the open-battlefield permission to
 * every unit its controller plays.
 */
export function hasFriendlyOpenBattlefieldGrant(
  state: RiftboundGameState,
  zones: { getCardsInZone: (zone: CoreZoneId, player: CorePlayerId) => readonly CoreCardId[] },
  playerId: string,
): boolean {
  const registry = getGlobalCardRegistry();
  const zoneIds = [
    "base",
    ...Object.keys(state.battlefields ?? {}).map((bfId) => getBattlefieldZoneId(bfId) as string),
  ];
  for (const zoneId of zoneIds) {
    for (const unitId of zones.getCardsInZone(zoneId as CoreZoneId, playerId as CorePlayerId)) {
      for (const ability of registry.getAbilities(unitId as string) ?? []) {
        if (ability?.type !== "static") {
          continue;
        }
        const effect = (
          ability as { effect?: { type?: string; allowedLocation?: string; appliesTo?: string } }
        ).effect;
        if (
          effect?.type === "play-restriction" &&
          effect.appliesTo === "friendly-units" &&
          effect.allowedLocation === "an open battlefield"
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * rule 355.2 (rule-id: ogn-070-298 Mageseeker Warden): an ENEMY permanent at a
 * battlefield may carry a static `play-restriction` with
 * `appliesTo: "opponents"` — "opponents can only play units to their base".
 * Only battlefield zones are scanned, which is exactly the
 * `while-at-battlefield` condition such cards print.
 */
export function opponentsRestrictedToBase(
  state: RiftboundGameState,
  zones: { getCardsInZone: (zone: CoreZoneId, player: CorePlayerId) => readonly CoreCardId[] },
  playerId: string,
): boolean {
  const registry = getGlobalCardRegistry();
  for (const bfId of Object.keys(state.battlefields ?? {})) {
    const zoneId = getBattlefieldZoneId(bfId) as CoreZoneId;
    for (const otherId of Object.keys(state.players ?? {})) {
      if (otherId === playerId) {
        continue;
      }
      for (const cardId of zones.getCardsInZone(zoneId, otherId as CorePlayerId)) {
        for (const ability of registry.getAbilities(cardId as string) ?? []) {
          if (ability?.type !== "static") {
            continue;
          }
          const effect = (
            ability as { effect?: { type?: string; allowedLocation?: string; appliesTo?: string } }
          ).effect;
          if (
            effect?.type === "play-restriction" &&
            effect.appliesTo === "opponents" &&
            effect.allowedLocation === "their base"
          ) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

/**
 * rule 143.4 / 369.3 (rule-id: ogn-011-298 Magma Wurm): a card already on a
 * player's board may carry a static grant of the virtual `EntersReady`
 * keyword to other friendly units ("Other friendly units enter ready").
 * Static recalculation only stamps `grantedKeywords` after the unit is
 * already on the board exhausted, so the play path must consult these grants
 * up front — the same way `create-token` does via
 * `tokenEntersReadyFromStaticGrant`.
 */
export function boardEntersReadyGrantApplies(
  state: RiftboundGameState,
  zones: { getCardsInZone: (zone: CoreZoneId, player: CorePlayerId) => readonly CoreCardId[] },
  cardId: string,
  playerId: string,
): boolean {
  const registry = getGlobalCardRegistry();
  const zoneIds = [
    "base",
    "legendZone",
    "championZone",
    ...Object.keys(state.battlefields ?? {}).map((bfId) => getBattlefieldZoneId(bfId) as string),
  ];
  for (const zoneId of zoneIds) {
    for (const sourceId of zones.getCardsInZone(zoneId as CoreZoneId, playerId as CorePlayerId)) {
      for (const ability of registry.getAbilities(sourceId as string) ?? []) {
        if (ability?.type !== "static" || (ability as { condition?: unknown }).condition) {
          continue;
        }
        const effect = (ability as { effect?: Record<string, unknown> }).effect;
        if (effect?.type !== "grant-keyword" || effect.keyword !== "EntersReady") {
          continue;
        }
        const target = effect.target as
          | { controller?: string; type?: string; filter?: string; excludeSelf?: boolean }
          | undefined;
        if (target?.controller && target.controller !== "friendly") {
          continue;
        }
        if (target?.type && target.type !== "unit") {
          continue;
        }
        // A token-only grant (Renata sfd-171-221) never readies a played card.
        if (target?.filter) {
          continue;
        }
        // "Other friendly units" — a grant cannot ready its own source.
        if (target?.excludeSelf && (sourceId as string) === cardId) {
          continue;
        }
        return true;
      }
    }
  }
  return false;
}

export function canPlayToOpenBattlefield(
  state: RiftboundGameState,
  zones: { getCardsInZone: (zone: CoreZoneId, player: CorePlayerId) => readonly CoreCardId[] },
  cardId: string,
  playerId: string,
): boolean {
  return (
    getPlayLocationPermission(cardId) === "an open battlefield" ||
    hasFriendlyOpenBattlefieldGrant(state, zones, playerId)
  );
}

/**
 * rule 355.2.b (ogn-161-298) — "You may play me to an occupied enemy
 * battlefield" adds enemy-controlled battlefields that hold at least one unit
 * (rule 170.11.a: occupied = a unit is there) to this card's play locations.
 */
export function canPlayToOccupiedEnemyBattlefield(cardId: string): boolean {
  return getPlayLocationPermission(cardId) === "an occupied enemy battlefield";
}

/**
 * rule 170.11.a / 355.2.b: enemy-controlled AND holding at least one unit.
 */
export function battlefieldIsOccupiedEnemy(
  state: RiftboundGameState,
  zones: { getCardsInZone: (zone: CoreZoneId, player?: CorePlayerId) => readonly CoreCardId[] },
  bfId: string,
  playerId: string,
): boolean {
  const controller = state.battlefields?.[bfId]?.controller;
  if (!controller || controller === playerId) {
    return false;
  }
  return zones.getCardsInZone(getBattlefieldZoneId(bfId) as CoreZoneId).length > 0;
}

/**
 * rule 170.11.c: a battlefield is "open" only while it is BOTH uncontrolled and
 * unoccupied — an uncontrolled battlefield holding any unit (friendly or enemy)
 * is not a legal destination for "You may play me to an open battlefield".
 */
export function battlefieldIsOpen(
  state: RiftboundGameState,
  zones: { getCardsInZone: (zone: CoreZoneId, player?: CorePlayerId) => readonly CoreCardId[] },
  bfId: string,
): boolean {
  if (state.battlefields?.[bfId]?.controller) {
    return false;
  }
  const bfZoneId = getBattlefieldZoneId(bfId) as CoreZoneId;
  return zones.getCardsInZone(bfZoneId).length === 0;
}

/**
 * rule-id: sfd-015-221 — "Play me only to a battlefield you conquered this
 * turn." True when the card self-grants the `PlayOnlyToConqueredBattlefield`
 * keyword (printed or via an unconditional static).
 */
export function playOnlyToConqueredBattlefield(cardId: string): boolean {
  const registry = getGlobalCardRegistry();
  if (registry.hasKeyword(cardId, "PlayOnlyToConqueredBattlefield")) {
    return true;
  }
  return (registry.getAbilities(cardId) ?? []).some((a) => {
    const ab = a as {
      type?: string;
      condition?: unknown;
      effect?: { type?: string; keyword?: string; target?: unknown };
    };
    return (
      ab.type === "static" &&
      ab.condition === undefined &&
      ab.effect?.type === "grant-keyword" &&
      ab.effect.keyword === "PlayOnlyToConqueredBattlefield" &&
      (ab.effect.target === undefined || ab.effect.target === "self")
    );
  });
}

/**
 * Runtime replacement stored in `draft.activeReplacements` by the
 * effect-executor `case "replacement"`.
 */
export interface ActiveReplacementEntry {
  replaces?: string;
  duration?: string;
  owner?: string;
  sourceCardId?: string;
  target?: { type?: string; controller?: string };
  /** rule-id: unl-052-219 — also [Buff] the entering unit. */
  buff?: boolean;
}

/**
 * The unit entering play, so riders on the matched replacement (e.g. `buff`)
 * can be applied to it.
 */
export interface EnteringUnit {
  readonly cardId: string;
  readonly ctx: Pick<EffectContext, "zones" | "cards" | "counters">;
}

/**
 * Rule 571 consumer for `enters-ready` replacements installed at runtime
 * (Sun Disc ogn-021-298: "the next unit you play this turn enters ready").
 * Scans `draft.activeReplacements` for a matching entry, removes it when
 * `duration:"next"`, and reports whether one applied so the caller can skip
 * the rule-143.4 exhaust flag.
 *
 * rule-id: unl-052-219 — when the matched entry carries `buff: true` ("the
 * next time you play a unit this turn, ready it and Buff it") and `entering`
 * is supplied, the entering unit is also buffed.
 */
export function consumeEntersReadyReplacement(
  draft: RiftboundGameState,
  playerId: string,
  entering?: EnteringUnit,
): boolean {
  const active = draft.activeReplacements as ActiveReplacementEntry[] | undefined;
  if (!active || active.length === 0) {
    return false;
  }
  for (let i = 0; i < active.length; i++) {
    const entry = active[i];
    if (entry?.replaces !== "enters-ready") {
      continue;
    }
    // "the next unit YOU play" — the replacement is scoped to its installer.
    // A friendly-controller target filter narrows to the same player; an
    // absent/any controller matches everyone.
    const controller = entry.target?.controller;
    if (entry.owner !== undefined && entry.owner !== playerId) {
      continue;
    }
    if (controller === "enemy") {
      continue;
    }
    const targetType = entry.target?.type;
    if (targetType !== undefined && targetType !== "unit") {
      continue;
    }
    if (entry.duration === "next") {
      active.splice(i, 1);
    }
    if (entry.buff && entering) {
      executeEffect(
        { type: "buff" },
        {
          ...entering.ctx,
          boundTargets: [entering.cardId],
          draft,
          playerId,
          sourceCardId: entry.sourceCardId ?? entering.cardId,
        },
      );
    }
    return true;
  }
  return false;
}

/**
 * rule 356.4.b (rule-id: ogn-031-298): one-shot "the next <type> you play this
 * turn costs [N] less" discounts live in `draft.activeReplacements` as
 * `replaces: "play-cost"` entries scoped to their installer. Returns the summed
 * energy discount for this play; with `consume`, spends the matched
 * `duration:"next"` entries (only call that from the pay path on a draft).
 */
export function takeNextPlayDiscount(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  consume: boolean,
): number {
  const active = state.activeReplacements as
    | (ActiveReplacementEntry & { reduction?: unknown; amount?: unknown })[]
    | undefined;
  if (!active || active.length === 0) {
    return 0;
  }
  const cardType = getGlobalCardRegistry().get(cardId)?.cardType;
  let total = 0;
  for (let i = active.length - 1; i >= 0; i--) {
    const entry = active[i];
    if (entry?.replaces !== "play-cost") {
      continue;
    }
    if (entry.owner !== undefined && entry.owner !== playerId) {
      continue;
    }
    const targetType = entry.target?.type;
    if (targetType !== undefined && targetType !== "card" && targetType !== cardType) {
      continue;
    }
    total += decodeCostAmount(entry.reduction ?? entry.amount).energy;
    if (consume && entry.duration === "next") {
      active.splice(i, 1);
    }
  }
  return total;
}

/**
 * Optional additional-cost declared on a unit card at play time.
 */
export interface OptionalPlayCost {
  /** `"accelerate"` (rule 717) enters the unit ready when paid. */
  readonly kind: "accelerate" | "kill" | "pay" | "exhaust" | "discard" | "spend-buff";
  /**
   * rule 356.5 (ogn-146-298 Wallop) — "If you do, ignore this spell's cost":
   * paying the optional additional cost waives the base cost entirely.
   */
  readonly ignoresBaseCost?: boolean;
  /**
   * rule 356.2.b (ogn-002-298) — "you may discard N as an additional cost":
   * how many cards leave the hand when the cost is paid.
   */
  readonly discard?: number;
  /**
   * Extra energy/power to deduct when the cost is paid.
   * rule-id: unl-178-219 — `xp` is spent from the player's XP total.
   */
  readonly cost?: { energy?: number; power?: readonly string[]; xp?: number };
  /** Target descriptor for a "kill a friendly X" additional cost. */
  readonly kill?: unknown;
  /** rule-id: ogn-048-298 (rule 356.2) — descriptor for "you may exhaust a friendly X". */
  readonly exhaust?: unknown;
  /**
   * rule-id: unl-178-219 (rule 560) — "If you do, I cost [N] less": energy
   * discount applied to the base cost when the optional cost is paid.
   */
  readonly energyDiscount?: number;
}

/** Decode an "I cost [N] less" ifPaid rider into an energy discount. */
function ifPaidEnergyDiscount(ifPaid: unknown): number {
  if (typeof ifPaid !== "object" || ifPaid === null) {
    return 0;
  }
  const r = ifPaid as { type?: string; reduction?: unknown; amount?: unknown; energy?: unknown };
  if (r.type !== "cost-reduction") {
    return 0;
  }
  let discount = 0;
  for (const v of [r.reduction, r.amount, r.energy]) {
    if (typeof v === "number") {
      discount += v;
    } else if (typeof v === "string") {
      for (const m of v.matchAll(/:rb_energy_(\d+):/g)) {
        discount += Number.parseInt(m[1], 10);
      }
    } else if (typeof v === "object" && v !== null) {
      const e = (v as { energy?: unknown }).energy;
      if (typeof e === "number") {
        discount += e;
      }
    }
  }
  return discount;
}

/**
 * Read a unit's optional additional play-cost from its abilities.
 *
 * Recognises Accelerate (`{type:"keyword", keyword:"Accelerate", cost}`), the
 * "you may kill a friendly X as an additional cost to play me" pattern
 * (`{type:"static"|"additional-cost-option", cost:{kill: TargetDescriptor}}`),
 * and the plain "you may pay [X] as an additional cost to play me" pattern
 * emitted by the parser as
 * `{type:"static", effect:{type:"additional-cost-option", additionalCost}}`.
 */
export function getOptionalPlayCost(cardId: string): OptionalPlayCost | undefined {
  const abilities = getGlobalCardRegistry().getAbilities(cardId) ?? [];
  for (const ability of abilities) {
    if (ability.type === "keyword" && ability.keyword === "Accelerate") {
      const cost = ability.cost as { energy?: number; power?: readonly string[] } | undefined;
      return { cost, kind: "accelerate" };
    }
    // rule 356.2.a.1 / 204.2 (unl-173-219) — "As an additional cost to play
    // this, kill a friendly [Mighty] unit": on a SPELL ability the parser
    // hangs the descriptor off `additionalCost` at the top level. It is
    // mandatory, so the spell is unplayable without a legal sacrifice.
    const spellAdditional = (ability as { additionalCost?: { kill?: unknown } }).additionalCost;
    if (ability.type === "spell" && spellAdditional?.kill) {
      return { kill: spellAdditional.kill, kind: "kill", mandatory: true };
    }
    const rawCost = ability.cost as { kill?: unknown } | undefined;
    if (
      (ability.type === "static" || ability.type === "additional-cost-option") &&
      rawCost?.kill
    ) {
      return { kill: rawCost.kill, kind: "kill" };
    }
    // Rule 560 — sfd-109-221: plain "you may pay COST" additional cost. The
    // parser wraps it as a static ability whose effect is
    // `{type:"additional-cost-option", additionalCost}` with no top-level
    // `cost`, so read the nested effect and decode the rune-token string.
    // Rule 560 — unl-178-219: "you may spend N XP as an additional cost … If
    // you do, I cost [N] less" arrives as `additionalCost:{xp:N}` with an
    // `ifPaid` cost-reduction rider.
    const effect = ability.effect as
      | { type?: string; additionalCost?: unknown; ifPaid?: unknown }
      | undefined;
    if (
      (ability.type === "static" || ability.type === "additional-cost-option") &&
      effect?.type === "additional-cost-option" &&
      effect.additionalCost !== undefined
    ) {
      let energy = 0;
      let xp = 0;
      let discard = 0;
      const power: string[] = [];
      const raw = effect.additionalCost;
      const ignoresBaseCost =
        (effect.ifPaid as { type?: string } | undefined)?.type === "ignore-cost";
      if (typeof raw === "string" && /^spend a buff$/i.test(raw.trim())) {
        // rule 356.2.b (ogn-146-298) — "you may spend a buff as an additional
        // cost": a buff counter on a friendly unit pays for the play.
        return { kind: "spend-buff", ...(ignoresBaseCost ? { ignoresBaseCost } : {}) };
      }
      if (typeof raw === "string") {
        // rule 356.2.b (ogn-002-298) — "discard N as an additional cost".
        const d = /^discard (\d+)$/.exec(raw.trim());
        if (d) {
          discard = Number.parseInt(d[1], 10);
        }
        for (const m of raw.matchAll(/:rb_energy_(\d+):/g)) {
          energy += Number.parseInt(m[1], 10);
        }
        for (const m of raw.matchAll(
          /:rb_rune_(fury|calm|mind|body|chaos|order|rainbow):/g,
        )) {
          power.push(m[1]);
        }
      } else if (typeof raw === "object" && raw !== null) {
        const obj = raw as {
          energy?: number;
          power?: readonly string[];
          xp?: number;
          exhaust?: unknown;
          discard?: number;
        };
        // rule 356.2 — ogn-048-298: "you may exhaust a friendly unit" as an
        // additional cost; the unit is chosen and exhausted at pay time.
        if (obj.exhaust) {
          return { exhaust: obj.exhaust, kind: "exhaust" };
        }
        energy = obj.energy ?? 0;
        xp = obj.xp ?? 0;
        discard = obj.discard ?? 0;
        if (obj.power) {power.push(...obj.power);}
      }
      // rule 356.2.b / 204.2 (ogn-002-298): the discarded card is the whole
      // additional cost; an "If you do, reduce my cost by [N]" rider nets
      // against the base cost.
      if (discard > 0) {
        return {
          discard,
          kind: "discard",
          ...(ifPaidEnergyDiscount(effect.ifPaid) > 0
            ? { energyDiscount: ifPaidEnergyDiscount(effect.ifPaid) }
            : {}),
        };
      }
      if (energy > 0 || power.length > 0 || xp > 0) {
        const energyDiscount = ifPaidEnergyDiscount(effect.ifPaid);
        return {
          cost: { energy, power, ...(xp > 0 ? { xp } : {}) },
          kind: "pay",
          ...(energyDiscount > 0 ? { energyDiscount } : {}),
        };
      }
    }
  }
  return undefined;
}

/**
 * Calculate the Deflect surcharge for targeting a card (rule 721.1.b).
 *
 * Reads the Deflect value from each target's `keyword`-typed abilities
 * (shape: `{ type: "keyword", keyword: "Deflect", value: N }`). Multiple
 * Deflect abilities on the same target stack (rule 721.2). Falls back to
 * +1 per target if the card declares Deflect in its flat `keywords[]`
 * array but no ability carries an explicit numeric value (rule 721.1.b.3).
 *
 * rule-id: unl-030-219 (rule 721.1.c) — "OPPONENTS must pay": targets the
 * caster controls (or owns, when no controller accessor is available) never
 * contribute a surcharge.
 */
export function getDeflectSurcharge(
  _state: RiftboundGameState,
  _playerId: string,
  _targets?: string[],
  cards?: {
    getCardOwner?: (cardId: CoreCardId) => string | undefined;
    getCardController?: (cardId: CoreCardId) => string | undefined;
    getCardMeta?: (cardId: CoreCardId) => unknown;
  },
): number {
  if (!_targets || _targets.length === 0) {
    return 0;
  }
  const registry = getGlobalCardRegistry();
  let surcharge = 0;
  for (const targetId of _targets) {
    const controller =
      cards?.getCardController?.(targetId as CoreCardId) ??
      cards?.getCardOwner?.(targetId as CoreCardId);
    if (controller !== undefined && controller === _playerId) {
      continue;
    }
    const abilities = registry.getAbilities(targetId) ?? [];
    let targetSurcharge = 0;
    for (const ability of abilities) {
      if (ability.type === "keyword" && ability.keyword === "Deflect") {
        targetSurcharge += ability.value ?? 1;
      }
    }
    // Fallback: flat-keyword Deflect with no numeric ability entry — treat
    // As value 1 (rule 721.1.b.3).
    if (targetSurcharge === 0 && registry.hasKeyword(targetId, "Deflect")) {
      targetSurcharge = 1;
    }
    // Rule-id: ogn-063-298 (rule 721.2) — Deflect granted at runtime (e.g. by
    // a static "friendly units have [Deflect]") lives in meta.grantedKeywords,
    // not the printed definition, and stacks with any printed Deflect.
    const meta = cards?.getCardMeta?.(targetId as CoreCardId) as
      | { grantedKeywords?: readonly { keyword: string; value?: number }[] }
      | undefined;
    for (const gk of meta?.grantedKeywords ?? []) {
      if (gk.keyword === "Deflect") {
        targetSurcharge += gk.value ?? 1;
      }
    }
    surcharge += targetSurcharge;
  }
  return surcharge;
}

/**
 * Create a typed getCardMeta accessor from the move context's cards API.
 */
export function createMetaAccessor(cards: {
  getCardMeta: (cardId: CoreCardId) => unknown;
}): (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined {
  return (cardId: CoreCardId) =>
    cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
}

/**
 * Get the cost modifier for a card from its metadata.
 */
export function getCostModifier(
  cardId: string,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
): number {
  if (!getCardMeta) {
    return 0;
  }
  const meta = getCardMeta(cardId as CoreCardId);
  return meta?.costModifier ?? 0;
}

/**
 * Get the effective Might of a card at the moment of play.
 *
 * Used for interactive cost reduction: the engine needs to read the
 * chosen target's current Might before the card is played to compute
 * the effective cost. Includes base Might plus any equipment bonus,
 * buff counter, and runtime Might modifiers stored on meta.
 */
/**
 * rule 807.1.c (Assault) / rule 811.1.c (Shield): "While I'm an attacker /
 * defender, I have +X [Might]". The bonus is part of the unit's current Might
 * — not just its combat damage — for as long as the combat role is stamped.
 */
function getCombatRoleMightBonus(
  cardId: string,
  meta: Partial<RiftboundCardMeta> | undefined,
): number {
  const role = (meta as { combatRole?: string } | undefined)?.combatRole;
  if (role !== "attacker" && role !== "defender") {
    return 0;
  }
  const keyword = role === "attacker" ? "Assault" : "Shield";
  const def = getGlobalCardRegistry().get(cardId);
  let bonus = 0;
  for (const ability of def?.abilities ?? []) {
    if (ability.type === "keyword" && ability.keyword === keyword) {
      bonus += (ability as { value?: number }).value ?? 1;
    }
  }
  if (bonus === 0) {
    bonus += (def?.keywords ?? []).filter((k) => k === keyword).length;
  }
  for (const granted of meta?.grantedKeywords ?? []) {
    if (granted.keyword === keyword) {
      bonus += granted.value ?? 1;
    }
  }
  return bonus;
}

export function getCardEffectiveMight(
  cardId: string,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
): number {
  const registry = getGlobalCardRegistry();
  const baseMight = registry.getMight(cardId);
  if (baseMight === 0) {
    return 0;
  }
  const meta = getCardMeta?.(cardId as CoreCardId);
  const roleBonus = getCombatRoleMightBonus(cardId, meta);
  const buffBonus = (meta?.buffed ? 1 : 0) + (meta?.extraBuffs ?? 0);
  const mightMod = meta?.mightModifier ?? 0;
  const staticBonus = meta?.staticMightBonus ?? 0;
  let equipBonus = 0;
  for (const equipId of meta?.equippedWith ?? []) {
    equipBonus += registry.getMightBonus(equipId);
  }
  return Math.max(0, baseMight + buffBonus + mightMod + staticBonus + equipBonus + roleBonus);
}

/**
 * Compute the interactive cost reduction (rule: "Energy cost is reduced
 * by the Might of the unit you choose") for a card being played.
 * Returns 0 if the card has no interactive reduction or no chosen target.
 */
export function getInteractiveReduction(
  cardId: string,
  chosenTargetId: string | undefined,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
): number {
  if (!chosenTargetId) {
    return 0;
  }
  const registry = getGlobalCardRegistry();
  const mode = registry.getInteractiveCostReduction(cardId);
  if (mode !== "target-might") {
    return 0;
  }
  return getCardEffectiveMight(chosenTargetId, getCardMeta);
}

/**
 * Optional extras for card affordability and cost deduction.
 */
export interface CostExtras {
  /** Targets of the card (used for Deflect surcharge calculation). */
  targets?: string[];
  /**
   * Card ID of the target chosen at play time for interactive cost
   * reduction (e.g., Hextech Gauntlets chooses a unit; the unit's
   * Might reduces the gauntlets' energy cost).
   */
  chosenTargetId?: string;
  /**
   * Value of X for X-cost spells — the chosen non-negative integer
   * amount the player pays on top of the card's base cost. Each point
   * of X consumes 1 energy from the rune pool.
   */
  xAmount?: number;
  /**
   * Number of EXTRA Repeat activations for spells with the `[Repeat]`
   * keyword. Each additional repeat adds the spell's `repeat` cost on
   * top of the base cost. See RiftboundMoves.playSpell.repeatCount.
   */
  repeatCount?: number;
  /**
   * rule-id: ven-049-166 — when true, the card is being played via its
   * `[Flow]` keyword from the trash: substitute the Flow cost for the
   * card's printed base cost.
   */
  viaFlow?: boolean;
  /**
   * rule-id: ven-083-166 — optional "you may pay [X] as an additional cost"
   * (rule 560) elected by the caster; stacks on top of the base cost.
   * rule-id: unl-178-219 — `energy` may be negative when the paid optional
   * cost carries an "I cost [N] less" rider; the total is clamped at 0.
   */
  additionalCost?: { energy?: number; power?: readonly string[] };
  /**
   * rule 356.5 (ogn-146-298) — the paid optional additional cost says to
   * ignore the card's cost: nothing is paid at all.
   */
  ignoreBaseCost?: boolean;
  /**
   * rule 356.1.b (ogn-196-298) — the play ignores only the card's Energy cost
   * component ("ignoring its Energy cost"); its Power cost is still paid.
   */
  ignoreEnergyCost?: boolean;
  /**
   * rule-id: ogn-150-298 (rule 560) — power pips waived by a paid optional
   * additional cost ("reduce my cost by [body] for each buff you spend"),
   * keyed by domain. Waived exactly like a board static's power waiver.
   */
  waivePower?: Partial<Record<string, number>>;
  /**
   * rule-id: ven-055-166 — board accessors so friendly permanents' static
   * cost-reductions ("Your spells cost [1][rainbow] less, to a minimum of
   * [1]") apply at pay time (rule 466). Omitted → no board statics apply.
   */
  board?: Pick<CostReductionContext, "zones" | "cards">;
}

const NO_BOARD_REDUCTION: StaticCostReduction = { minimum: 0, power: {}, reduction: 0 };

/** rule-id: ven-055-166 — friendly permanents' static cost-reduction for this play. */
function getBoardCostReduction(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  extras: CostExtras,
): StaticCostReduction {
  if (!extras.board) {
    return NO_BOARD_REDUCTION;
  }
  return computeStaticCostReduction({ draft: state, ...extras.board }, playerId, cardId, {
    viaFlow: extras.viaFlow === true,
  });
}

/**
 * rule-id: ogn-150-298 (rule 560) — pips waived by board statics plus those
 * waived by a paid optional additional cost, merged per domain.
 */
function waivedPower(
  boardReduction: StaticCostReduction,
  extras: CostExtras,
): Partial<Record<string, number>> {
  if (!extras.waivePower) {
    return boardReduction.power;
  }
  const out: Partial<Record<string, number>> = { ...boardReduction.power };
  for (const [domain, n] of Object.entries(extras.waivePower)) {
    if (n && n > 0) {
      out[domain] = (out[domain] ?? 0) + n;
    }
  }
  return out;
}

/**
 * rule-id: ogn-150-298 (rule 560 / 702.2.b) — "you may spend any number of
 * buffs as an additional cost. Reduce my cost by [D] for each buff you spend."
 * Returns the domain pip waived per buff spent. Kept separate from
 * `getOptionalPlayCost` because a card may declare BOTH this and another
 * optional cost (Kraken Hunter also has Accelerate).
 */
export function getBuffSpendCost(cardId: string): { domain: string } | undefined {
  for (const ability of getGlobalCardRegistry().getAbilities(cardId) ?? []) {
    if (ability.type !== "static" && ability.type !== "additional-cost-option") {
      continue;
    }
    const effect = ability.effect as
      | { type?: string; additionalCost?: { spendBuff?: string; reducePower?: string } }
      | undefined;
    if (effect?.type !== "additional-cost-option") {
      continue;
    }
    const spec = effect.additionalCost;
    if (spec?.spendBuff === "any" && typeof spec.reducePower === "string") {
      return { domain: spec.reducePower };
    }
  }
  return undefined;
}

/**
 * rule-id: ogn-231-298 (rule 356.2.b / 356.4) — "you may kill any number of
 * friendly units as an additional cost. Reduce my cost by [D] for each killed
 * this way." Returns the domain pip waived per kill plus the target descriptor
 * naming what may be killed. Kept out of `getOptionalPlayCost` because the
 * count is variable, so it prices like the buff-spend cost, not a single kill.
 */
export function getKillAnyNumberCost(
  cardId: string,
): { domain: string; target: unknown } | undefined {
  for (const ability of getGlobalCardRegistry().getAbilities(cardId) ?? []) {
    if (ability.type !== "static" && ability.type !== "additional-cost-option") {
      continue;
    }
    const effect = ability.effect as
      | {
          type?: string;
          additionalCost?: { killAnyNumber?: unknown };
          ifPaid?: { reducePower?: string };
        }
      | undefined;
    if (effect?.type !== "additional-cost-option") {
      continue;
    }
    const target = effect.additionalCost?.killAnyNumber;
    const domain = effect.ifPaid?.reducePower;
    if (target !== undefined && typeof domain === "string") {
      return { domain, target };
    }
  }
  return undefined;
}

export type RepeatTiers = readonly { energy: number; power: readonly string[] }[];

/**
 * rule-id: unl-146-219 — a spell's effective Repeat tiers: its own printed
 * Repeat instances plus any granted by the caster's board permanents ("your
 * spells have [Repeat] [2][chaos]"). Rule 820.3: each instance is a
 * separately payable tier. Undefined when the spell has no Repeat at all.
 */
export function getEffectiveSpellRepeatCost(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  board?: CostExtras["board"],
): RepeatTiers | undefined {
  const intrinsic = getGlobalCardRegistry().getSpellRepeatCost(cardId) ?? [];
  const granted = board
    ? computeGrantedSpellRepeatCost({ draft: state, ...board }, playerId, cardId)
    : [];
  let tiers: RepeatTiers = [...intrinsic, ...granted];
  // rule-id: sfd-211-221 (rules 356.4.c, 356.6) — "friendly [Repeat] costs
  // cost [1] less" discounts EVERY tier's energy part; a [rainbow]-only tier
  // has no energy to reduce and stays as printed.
  const perTier = board ? computeStaticRepeatCostReduction({ draft: state, ...board }, playerId) : 0;
  if (perTier > 0) {
    tiers = tiers.map((t) => ({ ...t, energy: Math.max(0, t.energy - perTier) }));
  }
  // rule-id: sfd-149-221 (rules 356.4.c, 356.4.c.1) — "Optional additional
  // costs you pay cost [1] or [rainbow] less": each Repeat tier is an optional
  // additional cost, and the payer chooses which half of the tier each
  // reduction shaves off. Resolve that choice against the pool so a tier that
  // could go either way is dropped from whichever resource is short.
  const flex = board
    ? computeOptionalAdditionalCostFlexReduction({ draft: state, ...board }, playerId)
    : 0;
  if (flex > 0) {
    tiers = applyFlexibleRepeatReduction(tiers, flex, availablePowerForRepeats(state, playerId, cardId));
  }
  return tiers.length > 0 ? tiers : undefined;
}

/** Power pips left over for [Repeat] costs once the printed cost is covered. */
function availablePowerForRepeats(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
): number {
  const pool = state.runePools[playerId];
  if (!pool) {
    return 0;
  }
  const have = Object.values(pool.power).reduce((a, b) => a + (b ?? 0), 0);
  const printed = getGlobalCardRegistry().getPowerCost(cardId)?.length ?? 0;
  return Math.max(0, have - printed);
}

/**
 * rule 356.4.c.1 — apply `flex` "one Energy OR one Power pip less" reductions
 * to every tier. A tier with only one kind of cost left has no choice; a tier
 * with both defers to the pool: shave the Energy when the remaining pips are
 * still payable, otherwise shave a pip.
 */
function applyFlexibleRepeatReduction(
  tiers: RepeatTiers,
  flex: number,
  availablePower: number,
): RepeatTiers {
  const work = tiers.map((t) => ({ energy: t.energy, power: [...t.power] }));
  const pending: number[] = [];
  for (const [i, tier] of work.entries()) {
    for (let n = 0; n < flex; n++) {
      if (tier.energy > 0 && tier.power.length > 0) {
        pending.push(i);
      } else if (tier.energy > 0) {
        tier.energy -= 1;
      } else if (tier.power.length > 0) {
        tier.power.pop();
      }
    }
  }
  let pips = work.reduce((a, t) => a + t.power.length, 0);
  for (const i of pending) {
    const tier = work[i] as { energy: number; power: string[] };
    if (tier.energy > 0 && pips <= availablePower) {
      tier.energy -= 1;
    } else if (tier.power.length > 0) {
      tier.power.pop();
      pips -= 1;
    } else if (tier.energy > 0) {
      tier.energy -= 1;
    }
  }
  return work;
}

/**
 * rule-id: ven-096-166 (rule 466) — the played card's OWN static
 * "I cost [N] less for each …" reduction, scaled by a countable scope read
 * off the trash. Board statics skip the played card, and `costModifier` is
 * only written by triggered effects, so a self static on a card in hand needs
 * its own path. Unrecognised scopes contribute 0.
 */
function getSelfScaledEnergyReduction(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  extras: CostExtras,
): number {
  const zones = extras.board?.zones;
  if (!zones) {
    return 0;
  }
  const registry = getGlobalCardRegistry();
  let total = 0;
  for (const ability of registry.getAbilities(cardId) ?? []) {
    if (ability?.type !== "static") {
      continue;
    }
    const effect = ability.effect as
      | { type?: string; target?: unknown; scope?: unknown; reduction?: unknown; amount?: unknown; by?: unknown }
      | undefined;
    if (effect?.type !== "cost-reduction" || effect.target !== "self") {
      continue;
    }
    // rule 356.4 (rule-id: sfd-164-221) — "I cost [N] less to play from
    // anywhere other than your hand": a flat self-discount gated on the play's
    // origin zone. A [Flow] play always comes from the trash (rule 829.1.b).
    if ((effect as { whenPlayedFrom?: unknown }).whenPlayedFrom === "not-hand") {
      if (extras.viaFlow) {
        total += Math.max(0, decodeCostAmount(effect.by ?? effect.reduction ?? effect.amount).energy);
      }
      continue;
    }
    // rule 356.4 / rule-id: ogn-014-298 — "This spell's Energy cost is reduced
    // by the highest Might among units you control": a flat discount equal to
    // the current (effective) Might of the caster's mightiest unit on the board.
    if (typeof effect.by === "string" && /highest might among units you control/i.test(effect.by)) {
      const cards = extras.board?.cards;
      let highest = 0;
      const consider = (id: CoreCardId): void => {
        if (registry.getCardType(id as string) !== "unit") return;
        const controller = cards?.getCardController?.(id) ?? cards?.getCardOwner(id);
        if (controller !== playerId) return;
        highest = Math.max(highest, getCardEffectiveMight(id as string, cards?.getCardMeta));
      };
      for (const id of zones.getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId)) consider(id);
      for (const bfId of Object.keys(state.battlefields ?? {})) {
        for (const id of zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId)) consider(id);
      }
      total += highest;
      continue;
    }
    if (typeof effect.scope !== "string") {
      continue;
    }
    const scope = effect.scope.toLowerCase();
    let count = 0;
    if (scope.startsWith("for each card with my name in your trash")) {
      const name = registry.get(cardId)?.name;
      const trash = zones.getCardsInZone("trash" as CoreZoneId, playerId as CorePlayerId);
      count = name ? trash.filter((id) => registry.get(id as string)?.name === name).length : 0;
    } else if (scope.startsWith("for each card in your trash")) {
      // rule-id: ogn-195-298 — same shape, unfiltered trash count.
      count = zones.getCardsInZone("trash" as CoreZoneId, playerId as CorePlayerId).length;
    }
    if (count <= 0) {
      continue;
    }
    const per = decodeCostAmount(effect.reduction ?? effect.amount ?? effect.by).energy;
    total += Math.max(0, per) * count;
  }
  return total;
}

/** Per-domain tally of an optional additional cost's power pips. */
export function additionalCostPower(extras: CostExtras): Partial<Record<string, number>> {
  const out: Partial<Record<string, number>> = {};
  for (const d of extras.additionalCost?.power ?? []) {
    out[d] = (out[d] ?? 0) + 1;
  }
  return out;
}

/**
 * rule 805.1.a.1 / 135.2.e.5 — walk an optional additional cost's pips against
 * a power pool. A named-domain pip is paid from that domain, falling back to
 * pooled [rainbow] Power (rule 135.2.e.5.b); a [rainbow] pip is paid from any
 * domain (rule 135.2.e.5.a). Returns the leftover pool, or undefined when the
 * cost cannot be met.
 */
function walkOptionalPlayCostPower(
  power: Partial<Record<string, number>>,
  pips: readonly string[],
): Record<string, number> | undefined {
  const remaining: Record<string, number> = {};
  for (const [d, v] of Object.entries(power)) {
    if (typeof v === "number" && v > 0) {
      remaining[d] = v;
    }
  }
  for (const domain of pips) {
    if (domain === "rainbow") {
      const any = Object.keys(remaining).find((k) => (remaining[k] ?? 0) > 0);
      if (any === undefined) {
        return undefined;
      }
      remaining[any] -= 1;
      continue;
    }
    if ((remaining[domain] ?? 0) > 0) {
      remaining[domain] -= 1;
      continue;
    }
    if ((remaining.rainbow ?? 0) > 0) {
      remaining.rainbow -= 1;
      continue;
    }
    return undefined;
  }
  return remaining;
}

/**
 * rule 356.4.c / 356.4.c.1 (sfd-149-221 Ezreal, Prodigy) — apply `flex`
 * "one Energy OR one Power pip less" reductions to an optional additional cost
 * (e.g. [Accelerate]'s [1][fury]). The payer picks which half each reduction
 * shaves, so resolve the choice against the pool: drop the Energy while the
 * remaining pips stay payable, otherwise drop a pip.
 */
export function applyFlexibleOptionalCostReduction(
  cost: { energy?: number; power?: readonly string[] },
  flex: number,
  pool: { energy: number; power: Partial<Record<string, number>> } | undefined,
): { energy: number; power: readonly string[] } {
  let energy = cost.energy ?? 0;
  let pips = [...(cost.power ?? [])];
  const payable = (list: readonly string[]): boolean =>
    pool === undefined || walkOptionalPlayCostPower(pool.power, list) !== undefined;
  for (let i = 0; i < flex; i++) {
    if (energy > 0 && payable(pips)) {
      energy -= 1;
      continue;
    }
    if (pips.length > 0) {
      // rule 356.4.c.1: drop whichever pip the pool cannot cover.
      const drop = pips.findIndex((_, idx) => payable(pips.filter((__, j) => j !== idx)));
      pips = pips.filter((_, idx) => idx !== (drop >= 0 ? drop : pips.length - 1));
      continue;
    }
    if (energy > 0) {
      energy -= 1;
    }
  }
  return { energy, power: pips };
}

/**
 * rule 356.4.c (sfd-149-221) — the optional additional cost `cost` as the
 * player actually pays it, after friendly "optional additional costs you pay
 * cost [1] or [rainbow] less" statics. Returns `cost` unchanged when no such
 * static is on the board (or no board accessors were supplied).
 */
export function discountOptionalPlayCost(
  state: RiftboundGameState,
  playerId: string,
  cost: { energy?: number; power?: readonly string[] } | undefined,
  board: CostExtras["board"] | undefined,
): { energy: number; power: readonly string[] } | undefined {
  if (!cost || !board) {
    return cost === undefined ? undefined : { energy: cost.energy ?? 0, power: cost.power ?? [] };
  }
  const flex = computeOptionalAdditionalCostFlexReduction({ draft: state, ...board }, playerId);
  if (flex <= 0) {
    return { energy: cost.energy ?? 0, power: cost.power ?? [] };
  }
  return applyFlexibleOptionalCostReduction(cost, flex, state.runePools[playerId]);
}

/** rule 356.1.b.3 / 805.1.a — can `pool` pay this optional additional cost right now? */
export function canPayOptionalPlayCost(
  pool: { energy: number; power: Partial<Record<string, number>> } | undefined,
  cost: { energy?: number; power?: readonly string[] } | undefined,
): boolean {
  if (!pool) {
    return false;
  }
  if (!cost) {
    return true;
  }
  if (pool.energy < (cost.energy ?? 0)) {
    return false;
  }
  return walkOptionalPlayCostPower(pool.power, cost.power ?? []) !== undefined;
}

/** rule 356.1.b.3 / 805.1.a — spend an optional additional cost from `pool`. */
export function payOptionalPlayCost(
  pool: { energy: number; power: Partial<Record<string, number>> },
  cost: { energy?: number; power?: readonly string[] } | undefined,
): void {
  if (!cost) {
    return;
  }
  pool.energy = Math.max(0, pool.energy - (cost.energy ?? 0));
  const left = walkOptionalPlayCostPower(pool.power, cost.power ?? []);
  if (!left) {
    return;
  }
  for (const domain of Object.keys(pool.power)) {
    (pool.power as Record<string, number>)[domain] = left[domain] ?? 0;
  }
}

/**
 * Compute the total Repeat surcharge (energy) for a spell being played
 * with `repeatCount` additional effects. `tiers` overrides the printed
 * Repeat cost (rule-id: unl-146-219 — board-granted Repeat).
 */
export function getRepeatEnergySurcharge(
  cardId: string,
  repeatCount: number,
  tiers: RepeatTiers | undefined = getGlobalCardRegistry().getSpellRepeatCost(cardId),
): number {
  if (repeatCount <= 0) {
    return 0;
  }
  if (!tiers || tiers.length === 0) {
    return 0;
  }
  // Rule 820.1.c.2 / 820.1.c.3 / 820.3: nth repeat pays tiers[n-1]. A
  // single-tier Repeat applies its cost to every repeat, so clamp the
  // index instead of stopping at tiers.length.
  let energy = 0;
  for (let i = 0; i < repeatCount; i++) {
    energy += tiers[Math.min(i, tiers.length - 1)].energy;
  }
  return energy;
}

/**
 * Compute the total Repeat surcharge (power, per domain) for a spell
 * being played with `repeatCount` additional effects.
 * Rule 820.1.c.2 / 820.1.c.3 / 820.3.
 */
export function getRepeatPowerSurcharge(
  cardId: string,
  repeatCount: number,
  tiers: RepeatTiers | undefined = getGlobalCardRegistry().getSpellRepeatCost(cardId),
): Partial<Record<string, number>> {
  if (repeatCount <= 0) {
    return {};
  }
  if (!tiers || tiers.length === 0) {
    return {};
  }
  const power: Partial<Record<string, number>> = {};
  for (let i = 0; i < repeatCount; i++) {
    for (const domain of tiers[Math.min(i, tiers.length - 1)].power) {
      power[domain] = (power[domain] ?? 0) + 1;
    }
  }
  return power;
}

/**
 * Rule 357.1.a permits activating rune Add-abilities during Pay Costs, but by
 * design the engine requires the player to exhaust runes explicitly first —
 * crediting ready runes here made the enumerator offer plays the reducer then
 * under-charged for. Returns 0; kept for existing callsites.
 */
export function getPotentialRuneEnergy(
  _zones: { getCardsInZone: (zone: CoreZoneId, player: CorePlayerId) => readonly CoreCardId[] },
  _counters: { getFlag: (cardId: CoreCardId, flag: string) => boolean | undefined },
  _playerId: string,
): number {
  return 0;
}

/**
 * rule-id: ven-113-166 (rule 829.1.b) — a card's [Flow] cost, whether printed
 * as a keyword or granted this turn by an effect ("give a spell in your trash
 * [Flow] equal to its cost"). Granted Flow is card meta, so every reader that
 * offers or prices a play from the trash must consult it, not just the
 * registry's printed keyword.
 */
export function getFlowCostForPlay(
  cardId: string,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
): { energy: number; power: readonly string[] } | undefined {
  const printed = getGlobalCardRegistry().getSpellFlowCost(cardId);
  if (printed) {
    return printed;
  }
  const granted = getCardMeta?.(cardId as CoreCardId)?.grantedFlow;
  return granted ? { energy: granted.energy, power: granted.power } : undefined;
}

/**
 * rule-id: ven-049-166 — resolve the base cost to charge for a play. Normally
 * the printed cost; when playing via [Flow] from the trash, the card's Flow
 * keyword cost replaces the printed cost.
 */
export function getBaseCostForPlay(
  cardId: string,
  extras: CostExtras,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
): { energy: number; power: Partial<Record<string, number>> } {
  const registry = getGlobalCardRegistry();
  if (extras.viaFlow) {
    const flow = getFlowCostForPlay(cardId, getCardMeta);
    if (flow) {
      const power: Partial<Record<string, number>> = {};
      for (const domain of flow.power) {
        power[domain] = (power[domain] ?? 0) + 1;
      }
      return { energy: flow.energy, power };
    }
  }
  return registry.getCostToDeduct(cardId);
}

/**
 * Rule 135.2.e.6.c (rule-id: ven-150-166): a multi-domain card's printed [C]
 * power pips are hybrid — payable only with Power of that card's own Domains,
 * not "any Domain" like a true [rainbow] pip. Returns those Domains for a
 * multi-domain card, otherwise undefined.
 */
/**
 * rule 204.3.b / rule 135.2.e (rule-id: ogn-268-298): "Pay any amount of
 * [rainbow]" — the variable X payment is Power of any Domain, never Energy.
 * Spell abilities declare this with `xCost: "power"`.
 */
export function xCostIsPower(cardId: string): boolean {
  const abilities = getGlobalCardRegistry().getAbilities(cardId) ?? [];
  return abilities.some(
    (a) => a?.type === "spell" && (a as { xCost?: unknown }).xCost === "power",
  );
}

export function getHybridPipDomains(cardId: string): string[] | undefined {
  const domain = getGlobalCardRegistry().get(cardId)?.domain;
  return Array.isArray(domain) && domain.length > 1 ? domain : undefined;
}

/**
 * Drain one Power from the most-stocked eligible domain in `pool`. Returns
 * false if nothing eligible remains.
 */
function drainOnePowerPip(
  pool: Partial<Record<string, number>>,
  eligible: (domain: string) => boolean,
): boolean {
  const key = Object.entries(pool)
    .filter(([d, v]) => (v ?? 0) > 0 && eligible(d))
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))[0]?.[0];
  if (key === undefined) {
    return false;
  }
  pool[key] = (pool[key] ?? 0) - 1;
  return true;
}

/**
 * Check if player can afford a card's cost from their rune pool.
 */
export function canAffordCard(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  extras: CostExtras,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
  potentialEnergy = 0,
): boolean {
  const pool = state.runePools[playerId];
  if (!pool) {
    return false;
  }
  // rule 356.5 — the elected additional cost waives the card's cost entirely.
  if (extras.ignoreBaseCost) {
    return true;
  }

  const modifier = getCostModifier(cardId, getCardMeta);
  const baseCost = getBaseCostForPlay(cardId, extras, getCardMeta);
  const interactive = getInteractiveReduction(cardId, extras.chosenTargetId, getCardMeta);
  const xAmount = Math.max(0, extras.xAmount ?? 0);
  // rule 204.3.b / 135.2.e: an X paid in [rainbow] never touches Energy.
  const xPower = xAmount > 0 && xCostIsPower(cardId) ? xAmount : 0;
  const xEnergy = xAmount - xPower;
  const repeatN = Math.max(0, extras.repeatCount ?? 0);
  // rule-id: unl-146-219 — include board-granted Repeat instances.
  const repeatTiers =
    repeatN > 0 ? getEffectiveSpellRepeatCost(state, playerId, cardId, extras.board) : undefined;
  const repeatSurcharge = getRepeatEnergySurcharge(cardId, repeatN, repeatTiers);
  const boardReduction = getBoardCostReduction(state, playerId, cardId, extras);
  // rule-id: ven-096-166 — self static "I cost [N] less for each …".
  const selfScaled =
    getSelfScaledEnergyReduction(state, playerId, cardId, extras) +
    getSelfConditionalEnergyReduction(state, playerId, cardId) +
    getSelfLegionEnergyReduction(state, playerId, cardId);
  const nextPlay = takeNextPlayDiscount(state, playerId, cardId, false);
  // rule 356.4.e: a discount's minimum binds only that discount, and the payer
  // orders discounts — floored board auras go first so unfloored ones aren't lost.
  const adjustedEnergy = Math.max(
    0,
    Math.max(0, applyStaticCostReduction(Math.max(0, baseCost.energy + modifier), boardReduction) - interactive - selfScaled - nextPlay) +
      xEnergy +
      repeatSurcharge +
      (extras.additionalCost?.energy ?? 0),
  );

  // Rule 357.1.a: ready runes can be exhausted for energy during Pay Costs,
  // so treat their yield as available when testing affordability.
  const availableEnergy = pool.energy + potentialEnergy;
  // rule 356.1.b: "ignoring its Energy cost" skips only that component.
  if (!extras.ignoreEnergyCost && availableEnergy < adjustedEnergy) {
    return false;
  }

  // Check power (domain requirements are not affected by cost modifiers,
  // only by board statics that waive power pips).
  // Rule 820.1.c.2 / 820.3: multi-tier Repeat power costs stack on top.
  const basePower = reducePowerCost(baseCost.power, waivedPower(boardReduction, extras), pool.power);
  const repeatPower = getRepeatPowerSurcharge(cardId, repeatN, repeatTiers);
  const extraPower = additionalCostPower(extras);
  const powerDomains = new Set([
    ...Object.keys(basePower),
    ...Object.keys(repeatPower),
    ...Object.keys(extraPower),
  ]);
  // Rule 135.2.e.5.a: [rainbow] pips are payable with Power of any Domain —
  // check named domains first, then cover rainbow from whatever is left.
  // Rule 721.1.c / 721.1.c.1 (unl-030-219): the Deflect surcharge is Power of
  // any Domain, so it joins the rainbow requirement rather than energy.
  let rainbowNeed = getDeflectSurcharge(state, playerId, extras.targets, extras.board?.cards) + xPower;
  // Rule 135.2.e.6.c (rule-id: ven-150-166): a multi-domain card's printed
  // pips are hybrid — payable only from the card's own Domains.
  const hybridDomains = getHybridPipDomains(cardId);
  let hybridNeed = 0;
  const remaining: Record<string, number> = {};
  for (const [d, v] of Object.entries(pool.power)) {
    if (typeof v === "number" && v > 0) {
      remaining[d] = v;
    }
  }
  for (const domain of powerDomains) {
    const need =
      (basePower[domain] ?? 0) +
      (repeatPower[domain] ?? 0) +
      (extraPower[domain] ?? 0);
    if (domain === "rainbow") {
      const printed = need - (extraPower[domain] ?? 0);
      if (hybridDomains) {
        hybridNeed += printed;
        rainbowNeed += need - printed;
      } else {
        rainbowNeed += need;
      }
      continue;
    }
    const available = remaining[domain] ?? 0;
    if (available < need) {
      // Rule 135.2.e.5.b (unl-022-219): [rainbow] Power in the pool can be
      // spent as Power of any Domain — cover the shortfall from it.
      const shortfall = need - available;
      const wild = remaining.rainbow ?? 0;
      if (wild < shortfall) {
        return false;
      }
      remaining.rainbow = wild - shortfall;
      remaining[domain] = 0;
      continue;
    }
    remaining[domain] = available - need;
  }
  if (hybridDomains && hybridNeed > 0) {
    // Rule 135.2.e.6.c: only the card's own Domains (or pooled [rainbow]
    // Power, Rule 135.2.e.5.b) may cover hybrid pips.
    let hybridAvailable = remaining.rainbow ?? 0;
    for (const d of hybridDomains) {
      hybridAvailable += remaining[d] ?? 0;
    }
    if (hybridAvailable < hybridNeed) {
      return false;
    }
  }
  if (rainbowNeed + hybridNeed > 0) {
    const leftover = Object.values(remaining).reduce((a, b) => a + b, 0);
    if (leftover < rainbowNeed + hybridNeed) {
      return false;
    }
  }
  return true;
}

/**
 * Deduct a card's cost from the player's rune pool.
 */
export function deductCost(
  draft: RiftboundGameState,
  playerId: string,
  cardId: string,
  extras: CostExtras,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
): void {
  const cost = getBaseCostForPlay(cardId, extras, getCardMeta);
  const pool = draft.runePools[playerId];
  if (!pool) {
    return;
  }
  // rule 356.5 — the elected additional cost waives the card's cost entirely.
  if (extras.ignoreBaseCost) {
    return;
  }

  const modifier = getCostModifier(cardId, getCardMeta);
  const interactive = getInteractiveReduction(cardId, extras.chosenTargetId, getCardMeta);
  const xAmount = Math.max(0, extras.xAmount ?? 0);
  // rule 204.3.b / 135.2.e: an X paid in [rainbow] never touches Energy.
  const xPower = xAmount > 0 && xCostIsPower(cardId) ? xAmount : 0;
  const xEnergy = xAmount - xPower;
  const repeatN = Math.max(0, extras.repeatCount ?? 0);
  // rule-id: unl-146-219 — include board-granted Repeat instances.
  const repeatTiers =
    repeatN > 0 ? getEffectiveSpellRepeatCost(draft, playerId, cardId, extras.board) : undefined;
  const repeatSurcharge = getRepeatEnergySurcharge(cardId, repeatN, repeatTiers);
  const boardReduction = getBoardCostReduction(draft, playerId, cardId, extras);
  // rule-id: ven-096-166 — self static "I cost [N] less for each …".
  const selfScaled =
    getSelfScaledEnergyReduction(draft, playerId, cardId, extras) +
    getSelfConditionalEnergyReduction(draft, playerId, cardId) +
    getSelfLegionEnergyReduction(draft, playerId, cardId);
  // rule 356.4.b / 356.6: the one-shot "next spell costs [N] less" is spent here.
  const nextPlay = takeNextPlayDiscount(draft, playerId, cardId, true);
  const adjustedEnergy = Math.max(
    0,
    // rule 356.4.e: floored board auras first, then unfloored discounts (see canAffordCard).
    Math.max(0, applyStaticCostReduction(Math.max(0, cost.energy + modifier), boardReduction) - interactive - selfScaled - nextPlay) +
      xEnergy +
      repeatSurcharge +
      (extras.additionalCost?.energy ?? 0),
  );

  // rule 356.1.b: "ignoring its Energy cost" skips only that component.
  pool.energy = extras.ignoreEnergyCost ? pool.energy : Math.max(0, pool.energy - adjustedEnergy);
  // Rule 820.1.c.2 / 820.3: multi-tier Repeat power costs stack on top.
  const basePower = reducePowerCost(cost.power, waivedPower(boardReduction, extras), pool.power);
  const repeatPower = getRepeatPowerSurcharge(cardId, repeatN, repeatTiers);
  const extraPower = additionalCostPower(extras);
  const powerDomains = new Set([
    ...Object.keys(basePower),
    ...Object.keys(repeatPower),
    ...Object.keys(extraPower),
  ]);
  // Rule 721.1.c / 721.1.c.1 (unl-030-219): Deflect surcharge is paid in
  // Power of any Domain, never energy.
  let rainbowOwed = getDeflectSurcharge(draft, playerId, extras.targets, extras.board?.cards) + xPower;
  // Rule 135.2.e.6.c (rule-id: ven-150-166): a multi-domain card's printed
  // pips are hybrid — paid only from the card's own Domains.
  const hybridDomains = getHybridPipDomains(cardId);
  let hybridOwed = 0;
  for (const domain of powerDomains) {
    const amount =
      (basePower[domain] ?? 0) +
      (repeatPower[domain] ?? 0) +
      (extraPower[domain] ?? 0);
    if (domain === "rainbow") {
      const printed = amount - (extraPower[domain] ?? 0);
      if (hybridDomains) {
        hybridOwed += printed;
        rainbowOwed += amount - printed;
      } else {
        rainbowOwed += amount;
      }
      continue;
    }
    if (amount > 0) {
      const key = domain as keyof typeof pool.power;
      const have = pool.power[key] ?? 0;
      pool.power[key] = Math.max(0, have - amount);
      // Rule 135.2.e.5.b (unl-022-219): pooled [rainbow] Power covers any
      // domain shortfall.
      const shortfall = amount - have;
      if (shortfall > 0) {
        const wildPool = pool.power as Partial<Record<string, number>>;
        wildPool.rainbow = Math.max(0, (wildPool.rainbow ?? 0) - shortfall);
      }
    }
  }
  // Rule 135.2.e.5.a: [rainbow] pips are paid with any Domain's Power — after
  // named domains, drain one pip at a time from whichever domain has the most.
  const anyPool = pool.power as Partial<Record<string, number>>;
  // Rule 135.2.e.6.c: hybrid pips first, restricted to the card's own
  // Domains (pooled [rainbow] Power as fallback per Rule 135.2.e.5.b).
  while (hybridDomains && hybridOwed > 0) {
    if (!drainOnePowerPip(anyPool, (d) => d === "rainbow" || hybridDomains.includes(d))) {
      break;
    }
    hybridOwed--;
  }
  while (rainbowOwed > 0) {
    if (!drainOnePowerPip(anyPool, () => true)) {
      break;
    }
    rainbowOwed--;
  }
}
