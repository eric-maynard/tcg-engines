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
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import {
  type CostReductionContext,
  type StaticCostReduction,
  applyStaticCostReduction,
  computeStaticCostReduction,
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
 * Optional additional-cost declared on a unit card at play time.
 */
export interface OptionalPlayCost {
  /** `"accelerate"` (rule 717) enters the unit ready when paid. */
  readonly kind: "accelerate" | "kill" | "pay";
  /**
   * Extra energy/power to deduct when the cost is paid.
   * rule-id: unl-178-219 — `xp` is spent from the player's XP total.
   */
  readonly cost?: { energy?: number; power?: readonly string[]; xp?: number };
  /** Target descriptor for a "kill a friendly X" additional cost. */
  readonly kill?: unknown;
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
      const power: string[] = [];
      const raw = effect.additionalCost;
      if (typeof raw === "string") {
        for (const m of raw.matchAll(/:rb_energy_(\d+):/g)) {
          energy += Number.parseInt(m[1], 10);
        }
        for (const m of raw.matchAll(
          /:rb_rune_(fury|calm|mind|body|chaos|order|rainbow):/g,
        )) {
          power.push(m[1]);
        }
      } else if (typeof raw === "object" && raw !== null) {
        const obj = raw as { energy?: number; power?: readonly string[]; xp?: number };
        energy = obj.energy ?? 0;
        xp = obj.xp ?? 0;
        if (obj.power) {power.push(...obj.power);}
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
  const buffBonus = meta?.buffed ? 1 : 0;
  const mightMod = meta?.mightModifier ?? 0;
  const staticBonus = meta?.staticMightBonus ?? 0;
  let equipBonus = 0;
  for (const equipId of meta?.equippedWith ?? []) {
    equipBonus += registry.getMightBonus(equipId);
  }
  return Math.max(0, baseMight + buffBonus + mightMod + staticBonus + equipBonus);
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
  return computeStaticCostReduction({ draft: state, ...extras.board }, playerId, cardId);
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
 * Compute the total Repeat surcharge (energy) for a spell being played
 * with `repeatCount` additional effects.
 */
export function getRepeatEnergySurcharge(cardId: string, repeatCount: number): number {
  if (repeatCount <= 0) {
    return 0;
  }
  const registry = getGlobalCardRegistry();
  const tiers = registry.getSpellRepeatCost(cardId);
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
): Partial<Record<string, number>> {
  if (repeatCount <= 0) {
    return {};
  }
  const registry = getGlobalCardRegistry();
  const tiers = registry.getSpellRepeatCost(cardId);
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
 * rule-id: ven-049-166 — resolve the base cost to charge for a play. Normally
 * the printed cost; when playing via [Flow] from the trash, the card's Flow
 * keyword cost replaces the printed cost.
 */
export function getBaseCostForPlay(
  cardId: string,
  extras: CostExtras,
): { energy: number; power: Partial<Record<string, number>> } {
  const registry = getGlobalCardRegistry();
  if (extras.viaFlow) {
    const flow = registry.getSpellFlowCost(cardId);
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

  const modifier = getCostModifier(cardId, getCardMeta);
  const baseCost = getBaseCostForPlay(cardId, extras);
  const interactive = getInteractiveReduction(cardId, extras.chosenTargetId, getCardMeta);
  const xAmount = Math.max(0, extras.xAmount ?? 0);
  const repeatSurcharge = getRepeatEnergySurcharge(cardId, Math.max(0, extras.repeatCount ?? 0));
  const boardReduction = getBoardCostReduction(state, playerId, cardId, extras);
  const adjustedEnergy = Math.max(
    0,
    applyStaticCostReduction(Math.max(0, baseCost.energy + modifier - interactive), boardReduction) +
      xAmount +
      repeatSurcharge +
      (extras.additionalCost?.energy ?? 0),
  );

  // Rule 357.1.a: ready runes can be exhausted for energy during Pay Costs,
  // so treat their yield as available when testing affordability.
  const availableEnergy = pool.energy + potentialEnergy;
  if (availableEnergy < adjustedEnergy) {
    return false;
  }

  // Check power (domain requirements are not affected by cost modifiers,
  // only by board statics that waive power pips).
  // Rule 820.1.c.2 / 820.3: multi-tier Repeat power costs stack on top.
  const basePower = reducePowerCost(baseCost.power, boardReduction.power, pool.power);
  const repeatPower = getRepeatPowerSurcharge(cardId, Math.max(0, extras.repeatCount ?? 0));
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
  let rainbowNeed = getDeflectSurcharge(state, playerId, extras.targets, extras.board?.cards);
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
      rainbowNeed += need;
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
  if (rainbowNeed > 0) {
    const leftover = Object.values(remaining).reduce((a, b) => a + b, 0);
    if (leftover < rainbowNeed) {
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
  const cost = getBaseCostForPlay(cardId, extras);
  const pool = draft.runePools[playerId];
  if (!pool) {
    return;
  }

  const modifier = getCostModifier(cardId, getCardMeta);
  const interactive = getInteractiveReduction(cardId, extras.chosenTargetId, getCardMeta);
  const xAmount = Math.max(0, extras.xAmount ?? 0);
  const repeatSurcharge = getRepeatEnergySurcharge(cardId, Math.max(0, extras.repeatCount ?? 0));
  const boardReduction = getBoardCostReduction(draft, playerId, cardId, extras);
  const adjustedEnergy = Math.max(
    0,
    applyStaticCostReduction(Math.max(0, cost.energy + modifier - interactive), boardReduction) +
      xAmount +
      repeatSurcharge +
      (extras.additionalCost?.energy ?? 0),
  );

  pool.energy = Math.max(0, pool.energy - adjustedEnergy);
  // Rule 820.1.c.2 / 820.3: multi-tier Repeat power costs stack on top.
  const basePower = reducePowerCost(cost.power, boardReduction.power, pool.power);
  const repeatPower = getRepeatPowerSurcharge(cardId, Math.max(0, extras.repeatCount ?? 0));
  const extraPower = additionalCostPower(extras);
  const powerDomains = new Set([
    ...Object.keys(basePower),
    ...Object.keys(repeatPower),
    ...Object.keys(extraPower),
  ]);
  // Rule 721.1.c / 721.1.c.1 (unl-030-219): Deflect surcharge is paid in
  // Power of any Domain, never energy.
  let rainbowOwed = getDeflectSurcharge(draft, playerId, extras.targets, extras.board?.cards);
  for (const domain of powerDomains) {
    const amount =
      (basePower[domain] ?? 0) +
      (repeatPower[domain] ?? 0) +
      (extraPower[domain] ?? 0);
    if (domain === "rainbow") {
      rainbowOwed += amount;
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
  while (rainbowOwed > 0) {
    const key = Object.entries(anyPool)
      .filter(([, v]) => (v ?? 0) > 0)
      .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))[0]?.[0];
    if (key === undefined) {
      break;
    }
    anyPool[key] = (anyPool[key] ?? 0) - 1;
    rainbowOwed--;
  }
}
