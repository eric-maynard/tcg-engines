/**
 * Riftbound Card Play Moves
 *
 * Moves for playing cards: units, gear, spells, and hidden cards.
 * Each move validates game rules before executing.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../types";
import { fireTriggers } from "../../abilities/trigger-runner";
import { resolveTarget } from "../../abilities/target-resolver";
import { addToChain, createInteractionState, getTurnState, isLegalTiming } from "../../chain";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { canPlayViaAmbush } from "../../keywords/keyword-effects";

/**
 * Check whether a card carries a static ability whose effect has the given
 * `type`. Used for enter-state modifiers such as `enter-ready` (rule 143.4
 * override — unit enters ready instead of exhausted) and `enters-exhausted`
 * (gear that enters tapped, e.g. Honeyfruit unl-049-219).
 */
function hasStaticEffect(cardId: string, effectType: string): boolean {
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
function getPlayLocationPermission(cardId: string): string | undefined {
  const abilities = getGlobalCardRegistry().getAbilities(cardId) ?? [];
  for (const ability of abilities) {
    if (ability?.type !== "static") {
      continue;
    }
    const effect = (ability as { effect?: { type?: string; allowedLocation?: string } }).effect;
    if (effect?.type === "play-restriction") {
      return effect.allowedLocation;
    }
  }
  return undefined;
}

/**
 * Runtime replacement stored in `draft.activeReplacements` by the
 * effect-executor `case "replacement"`.
 */
interface ActiveReplacementEntry {
  replaces?: string;
  duration?: string;
  owner?: string;
  target?: { type?: string; controller?: string };
}

/**
 * Rule 571 consumer for `enters-ready` replacements installed at runtime
 * (Sun Disc ogn-021-298: "the next unit you play this turn enters ready").
 * Scans `draft.activeReplacements` for a matching entry, removes it when
 * `duration:"next"`, and reports whether one applied so the caller can skip
 * the rule-143.4 exhaust flag.
 */
function consumeEntersReadyReplacement(
  draft: RiftboundGameState,
  playerId: string,
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
    return true;
  }
  return false;
}

/**
 * Optional additional-cost declared on a unit card at play time.
 */
interface OptionalPlayCost {
  /** `"accelerate"` (rule 717) enters the unit ready when paid. */
  readonly kind: "accelerate" | "kill" | "pay";
  /** Extra energy/power to deduct when the cost is paid. */
  readonly cost?: { energy?: number; power?: readonly string[] };
  /** Target descriptor for a "kill a friendly X" additional cost. */
  readonly kill?: unknown;
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
function getOptionalPlayCost(cardId: string): OptionalPlayCost | undefined {
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
    const effect = ability.effect as
      | { type?: string; additionalCost?: unknown }
      | undefined;
    if (
      (ability.type === "static" || ability.type === "additional-cost-option") &&
      effect?.type === "additional-cost-option" &&
      effect.additionalCost !== undefined
    ) {
      let energy = 0;
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
        const obj = raw as { energy?: number; power?: readonly string[] };
        energy = obj.energy ?? 0;
        if (obj.power) {power.push(...obj.power);}
      }
      if (energy > 0 || power.length > 0) {
        return { cost: { energy, power }, kind: "pay" };
      }
    }
  }
  return undefined;
}
import {
  extractBattlefieldId,
  getBattlefieldZoneId,
  getFacedownZoneId,
  isBattlefieldZone,
} from "../../zones/zone-configs";

/**
 * Calculate the Deflect surcharge for targeting a card (rule 721.1.b).
 *
 * Reads the Deflect value from each target's `keyword`-typed abilities
 * (shape: `{ type: "keyword", keyword: "Deflect", value: N }`). Multiple
 * Deflect abilities on the same target stack (rule 721.2). Falls back to
 * +1 per target if the card declares Deflect in its flat `keywords[]`
 * array but no ability carries an explicit numeric value (rule 721.1.b.3).
 */
function getDeflectSurcharge(
  _state: RiftboundGameState,
  _playerId: string,
  _targets?: string[],
): number {
  if (!_targets || _targets.length === 0) {
    return 0;
  }
  const registry = getGlobalCardRegistry();
  let surcharge = 0;
  for (const targetId of _targets) {
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
function createMetaAccessor(cards: {
  getCardMeta: (cardId: CoreCardId) => unknown;
}): (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined {
  return (cardId: CoreCardId) =>
    cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
}

/**
 * Get the cost modifier for a card from its metadata.
 */
function getCostModifier(
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
function getCardEffectiveMight(
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
function getInteractiveReduction(
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
interface CostExtras {
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
}

/**
 * Compute the total Repeat surcharge (energy) for a spell being played
 * with `repeatCount` additional effects.
 */
function getRepeatEnergySurcharge(cardId: string, repeatCount: number): number {
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
function getRepeatPowerSurcharge(
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
function getBaseCostForPlay(
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
function canAffordCard(
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
  const adjustedEnergy =
    Math.max(0, baseCost.energy + modifier - interactive) + xAmount + repeatSurcharge;

  // Rule 357.1.a: ready runes can be exhausted for energy during Pay Costs,
  // so treat their yield as available when testing affordability.
  const availableEnergy = pool.energy + potentialEnergy;
  if (availableEnergy < adjustedEnergy) {
    return false;
  }

  // Check power (domain requirements are not affected by cost modifiers).
  // Rule 820.1.c.2 / 820.3: multi-tier Repeat power costs stack on top.
  const repeatPower = getRepeatPowerSurcharge(cardId, Math.max(0, extras.repeatCount ?? 0));
  const powerDomains = new Set([...Object.keys(baseCost.power), ...Object.keys(repeatPower)]);
  for (const domain of powerDomains) {
    const need =
      (baseCost.power[domain as keyof typeof baseCost.power] ?? 0) + (repeatPower[domain] ?? 0);
    const available = pool.power[domain as keyof typeof pool.power] ?? 0;
    if (available < need) {
      return false;
    }
  }

  const deflectCost = getDeflectSurcharge(state, playerId, extras.targets);
  if (deflectCost > 0) {
    const remainingEnergy = availableEnergy - adjustedEnergy;
    if (remainingEnergy < deflectCost) {
      return false;
    }
  }
  return true;
}

/**
 * Deduct a card's cost from the player's rune pool.
 */
function deductCost(
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
  const adjustedEnergy =
    Math.max(0, cost.energy + modifier - interactive) + xAmount + repeatSurcharge;

  pool.energy = Math.max(0, pool.energy - adjustedEnergy);
  // Rule 820.1.c.2 / 820.3: multi-tier Repeat power costs stack on top.
  const repeatPower = getRepeatPowerSurcharge(cardId, Math.max(0, extras.repeatCount ?? 0));
  const powerDomains = new Set([...Object.keys(cost.power), ...Object.keys(repeatPower)]);
  for (const domain of powerDomains) {
    const amount =
      (cost.power[domain as keyof typeof cost.power] ?? 0) + (repeatPower[domain] ?? 0);
    if (amount > 0) {
      const key = domain as keyof typeof pool.power;
      pool.power[key] = Math.max(0, (pool.power[key] ?? 0) - amount);
    }
  }

  const deflectCost = getDeflectSurcharge(draft, playerId, extras.targets);
  if (deflectCost > 0) {
    pool.energy = Math.max(0, pool.energy - deflectCost);
  }
}

type SpellEffectTargetDescriptor =
  | string
  | {
      type: string;
      quantity?: number | "all" | "any" | { upTo?: number; atLeast?: number };
    };

export type SpellEffectTargetShape = {
  type?: string;
  target?: SpellEffectTargetDescriptor;
  target1?: SpellEffectTargetDescriptor;
  target2?: SpellEffectTargetDescriptor;
  amount?: { might?: SpellEffectTargetDescriptor | string };
  player?: string;
  options?: { effect?: SpellEffectTargetShape }[];
  effects?: SpellEffectTargetShape[];
};

/**
 * Rule 355.8 / 355.14.a (unl-192-219 Alpha Strike): an `amount:{might:<selector>}`
 * expression whose selector is a board descriptor names a caster-chosen standard
 * target even though it appears as an amount, not as `effect.target`. Surface it
 * so play-time enumeration binds it to the chain item.
 */
function findAmountReferenceTarget(
  effect: SpellEffectTargetShape | undefined,
): SpellEffectTargetDescriptor | undefined {
  if (!effect) return undefined;
  const ref = effect.amount?.might;
  if (ref && typeof ref !== "string") return ref;
  if (effect.type === "sequence" && Array.isArray(effect.effects)) {
    for (const sub of effect.effects) {
      const found = findAmountReferenceTarget(sub);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Rule 355.14.b/c / 355.15 (unl-192-219 Alpha Strike): a `damage` effect with
 * `split: true` names caster-chosen split targets that are locked at
 * finalization alongside the might-reference target. Surface the split
 * effect's enemy target descriptor so play-time enumeration can bind them.
 */
function findSplitDamageEffect(
  effect: SpellEffectTargetShape | undefined,
): SpellEffectTargetShape | undefined {
  if (!effect) return undefined;
  if (effect.type === "damage" && (effect as { split?: boolean }).split === true) {
    return effect;
  }
  if (effect.type === "sequence" && Array.isArray(effect.effects)) {
    for (const sub of effect.effects) {
      const found = findSplitDamageEffect(sub);
      if (found) return found;
    }
  }
  return undefined;
}

function enumerateSubsetsUpTo(pool: string[], maxSize: number): string[][] {
  const out: string[][] = [[]];
  const limit = Math.min(maxSize, pool.length);
  const walk = (start: number, chosen: string[]) => {
    if (chosen.length === limit) return;
    for (let i = start; i < pool.length; i++) {
      const next = [...chosen, pool[i]];
      out.push(next);
      walk(i + 1, next);
    }
  };
  walk(0, []);
  return out;
}

/**
 * Rule 355.8 / 419.2.a: a spell is a legal Play only if valid choices exist for
 * every caster-chosen target. For a modal (`choice`) effect the caster picks one
 * mode, so the spell is legal iff at least one mode's targets can be satisfied.
 */
export function spellEffectHasLegalTargets(
  effect: SpellEffectTargetShape | undefined,
  ctx: Parameters<typeof resolveTarget>[1],
): boolean {
  if (!effect) {
    return true;
  }
  // Rule 355.8: modal spells — at least one option must have a valid target set.
  if (effect.type === "choice" && Array.isArray(effect.options)) {
    return effect.options.some((opt) => spellEffectHasLegalTargets(opt?.effect, ctx));
  }
  // Sequence effects: every sub-effect's targets must be satisfiable.
  if (effect.type === "sequence" && Array.isArray(effect.effects)) {
    return effect.effects.every((sub) => spellEffectHasLegalTargets(sub, ctx));
  }
  // Rule 355.10.d: "for each <criteria>" is a programmatic selection, not a
  // caster-chosen target — 355.8's ≥1-valid-target gate does not apply, and the
  // nested per-object effect binds to each selected object rather than a
  // caster-declared target. Zero matches is legal.
  if (effect.type === "for-each") {
    return true;
  }
  // Multi-target effects (swap-might etc.) carry target1/target2 alongside or
  // instead of `target`; every present descriptor must resolve non-empty.
  for (const tgt of [effect.target, effect.target1, effect.target2]) {
    if (!targetDescriptorIsSatisfiable(tgt, effect.player, ctx)) {
      return false;
    }
  }
  // Rule 355.5.a / 358.3.a: per-player criteria-based instructions and
  // targetless effects impose no play-legality constraint.
  return true;
}

function targetDescriptorIsSatisfiable(
  tgt: SpellEffectTargetDescriptor | undefined,
  player: string | undefined,
  ctx: Parameters<typeof resolveTarget>[1],
): boolean {
  if (!tgt) {
    return true;
  }
  // Legacy parser output: bare string "self".
  if (typeof tgt === "string") {
    return true;
  }
  // Self / player / battlefield are not caster-chosen board targets.
  if (tgt.type === "self" || tgt.type === "player" || tgt.type === "battlefield" || player) {
    return true;
  }
  // Rule 355.10.d: quantity:"all" selects programmatically — those objects are
  // not caster-chosen targets, so 355.8's ≥1-valid-target gate does not apply.
  // Rule 355.13 / 419.2.a: "up to N" / "any" permits choosing zero targets.
  const qty = tgt.quantity;
  const zeroTargetsLegal =
    qty === "all" ||
    qty === "any" ||
    (typeof qty === "object" && qty.upTo !== undefined && qty.atLeast === undefined);
  if (zeroTargetsLegal) {
    return true;
  }
  const resolved = resolveTarget(
    tgt as {
      type: string;
      controller?: "friendly" | "enemy" | "any";
      location?: string;
      quantity?: number | "all";
    },
    ctx,
  );
  return resolved.length > 0;
}

/**
 * Card play move definitions
 */
export const cardPlayMoves: Partial<
  GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>
> = {
  /**
   * Play a unit to Base (rule 554)
   */
  playUnit: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      if (state.pendingChoice) {
        return false;
      }

      const zone = context.zones.getCardZone(context.params.cardId as CoreCardId);
      if (zone !== "hand") {
        return false;
      }

      // Rule 103 / 555: only the card's owner may play it.
      const owner = context.cards.getCardOwner(context.params.cardId as CoreCardId);
      if (owner !== context.params.playerId) {
        return false;
      }

      // Rule 577.3.c (Ambush): a unit with Ambush may be played to a
      // Battlefield where the player has friendly units, as a Reaction.
      // Otherwise the unit must be played on its controller's turn during
      // The main phase to the player's base.
      const location = context.params.location as string | undefined;
      const targetIsBattlefield = Boolean(location) && isBattlefieldZone(location);
      const registry = getGlobalCardRegistry();
      const hasAmbush = registry.hasKeyword(context.params.cardId, "Ambush");

      if (targetIsBattlefield && !hasAmbush) {
        // Rule ogn-174-298: static play-restriction ("You may play me to an
        // open battlefield") lets a non-Ambush unit be played to an
        // uncontrolled battlefield at standard main-phase timing.
        const allowed = getPlayLocationPermission(context.params.cardId as string);
        const bfId = extractBattlefieldId(location ?? "");
        const bf = bfId ? state.battlefields?.[bfId] : undefined;
        if (allowed !== "an open battlefield" || !bf || bf.controller) {
          return false;
        }
        if (state.turn.activePlayer !== context.params.playerId) {
          return false;
        }
        if (state.turn.phase !== "main") {
          return false;
        }
        const interaction = state.interaction ?? createInteractionState();
        if (getTurnState(interaction) !== "neutral-open") {
          return false;
        }
      } else if (targetIsBattlefield) {
        // Ambush path: relax phase / active-player gating and permit the
        // Unit to be played directly to the target battlefield.
        const bfId = extractBattlefieldId(location ?? "");
        if (!bfId) {
          return false;
        }
        const bfZoneId = getBattlefieldZoneId(bfId);
        const unitsAtBattlefield = context.zones.getCardsInZone(
          bfZoneId as CoreZoneId,
          context.params.playerId as CorePlayerId,
        );
        const hasFriendlyUnits = unitsAtBattlefield.length > 0;
        // Reaction timing is always legal per `isLegalTiming("reaction", ...)`
        // Regardless of chain/showdown state, so we treat Ambush as
        // Permanently reaction-legal and rely on `canPlayViaAmbush`'s
        // Friendly-units check.
        if (!canPlayViaAmbush(hasAmbush, hasFriendlyUnits, true)) {
          return false;
        }
      } else {
        // Standard play path: active player, main phase.
        if (state.turn.activePlayer !== context.params.playerId) {
          return false;
        }
        if (state.turn.phase !== "main") {
          return false;
        }
        // Rule 140.1.b/c + 508.1.a: Playing a Unit is a Discretionary Action,
        // legal only in a Neutral Open state (no chain, no showdown).
        const interaction = state.interaction ?? createInteractionState();
        if (getTurnState(interaction) !== "neutral-open") {
          return false;
        }
      }

      if (
        !canAffordCard(
          state,
          context.params.playerId,
          context.params.cardId,
          {},
          createMetaAccessor(context.cards),
          getPotentialRuneEnergy(context.zones, context.counters, context.params.playerId),
        )
      ) {
        return false;
      }

      return true;
    },
    enumerator: (state, context) => {
      if (state.status !== "playing") {
        return [];
      }
      if (state.pendingChoice) {
        return [];
      }
      // Rule ven-123-166 / 577.3.c: Ambush lets a unit be played to a
      // battlefield with friendly units at reaction timing, so the
      // active-player / main-phase / neutral-open gates only govern the
      // standard base-play path — do not early-return here.
      const interaction = state.interaction ?? createInteractionState();
      const standardTiming =
        state.turn.activePlayer === (context.playerId as string) &&
        state.turn.phase === "main" &&
        getTurnState(interaction) === "neutral-open";

      const registry = getGlobalCardRegistry();
      const pool = state.runePools[context.playerId as string];
      if (!pool) {
        return [];
      }
      // Rule 357.1.a: credit ready runes as available energy for enumeration.
      const potential = getPotentialRuneEnergy(
        context.zones,
        context.counters,
        context.playerId as string,
      );
      const affordPool = { energy: pool.energy + potential, power: pool.power };

      const handCards = context.zones.getCardsInZone(
        "hand" as CoreZoneId,
        context.playerId as CorePlayerId,
      );

      const results: RiftboundMoves["playUnit"][] = [];
      for (const cardId of handCards) {
        const def = registry.get(cardId as string);
        if (!def || def.cardType !== "unit") {
          continue;
        }
        if (!registry.canAfford(cardId as string, affordPool)) {
          continue;
        }

        // Rule ven-123-166 / 577.3.c: offer Ambush plays to any battlefield
        // where the player already has friendly units (reaction timing —
        // legal even outside the active player's main phase / neutral-open).
        if (registry.hasKeyword(cardId as string, "Ambush")) {
          for (const bfId of Object.keys(state.battlefields ?? {})) {
            const bfZoneId = getBattlefieldZoneId(bfId);
            const friendly = context.zones.getCardsInZone(
              bfZoneId as CoreZoneId,
              context.playerId as CorePlayerId,
            );
            if (friendly.length > 0) {
              results.push({
                cardId: cardId as string,
                location: bfZoneId as string,
                playerId: context.playerId as string,
              });
            }
          }
        }

        if (!standardTiming) {
          continue;
        }

        results.push({
          cardId: cardId as string,
          location: "base",
          playerId: context.playerId as string,
        });

        // Rule ogn-174-298: offer open (uncontrolled) battlefields when the
        // card carries a static play-restriction permitting it.
        if (getPlayLocationPermission(cardId as string) === "an open battlefield") {
          for (const [bfId, bf] of Object.entries(state.battlefields ?? {})) {
            if (!bf.controller) {
              results.push({
                cardId: cardId as string,
                location: getBattlefieldZoneId(bfId) as string,
                playerId: context.playerId as string,
              });
            }
          }
        }

        // Rule 560 / 717: when the unit declares an optional additional
        // play-cost, also enumerate the paid variant so callers can elect
        // to pay it.
        const optional = getOptionalPlayCost(cardId as string);
        if (optional?.kind === "accelerate" || optional?.kind === "pay") {
          const extraEnergy = optional.cost?.energy ?? 0;
          const extraPower = optional.cost?.power ?? [];
          const canAffordExtra =
            affordPool.energy >= (def.energyCost ?? 0) + extraEnergy &&
            extraPower.every(
              (d) => (affordPool.power[d as keyof typeof affordPool.power] ?? 0) >= 1,
            );
          if (canAffordExtra) {
            results.push({
              additionalCostSpec: { energy: extraEnergy, power: extraPower },
              cardId: cardId as string,
              location: "base",
              paidAdditionalCost: true,
              playerId: context.playerId as string,
            });
          }
        } else if (optional?.kind === "kill") {
          const killDescriptor = {
            ...(optional.kill as Record<string, unknown>),
            quantity: "all" as const,
          };
          const sacrificeOptions = resolveTarget(
            killDescriptor as Parameters<typeof resolveTarget>[0],
            {
              cards: context.cards as Parameters<typeof resolveTarget>[1]["cards"],
              draft: state,
              playerId: context.playerId as string,
              sourceCardId: cardId as string,
              zones: context.zones,
            },
          );
          for (const sacrificeId of sacrificeOptions) {
            results.push({
              cardId: cardId as string,
              location: "base",
              paidAdditionalCost: true,
              playerId: context.playerId as string,
              sacrificeId,
            });
          }
        }
      }
      return results;
    },
    reducer: (draft, context) => {
      const { cardId, playerId, location, paidAdditionalCost, additionalCostSpec, sacrificeId } =
        context.params;
      const { zones, counters } = context;

      deductCost(draft, playerId, cardId, {}, createMetaAccessor(context.cards));

      // Rule 560: optional additional cost. Re-derive from the card definition
      // instead of trusting client-supplied additionalCostSpec/sacrificeId — a
      // multiplayer client could otherwise trash an opponent's card or claim an
      // Accelerate benefit the card doesn't have.
      let paidAccelerate = false;
      let paidAdditionalCostActual = false;
      if (paidAdditionalCost) {
        const optional = getOptionalPlayCost(cardId);
        const pool = draft.runePools[playerId];
        if ((optional?.kind === "accelerate" || optional?.kind === "pay") && pool) {
          const need = optional.cost ?? {};
          const canPay =
            pool.energy >= (need.energy ?? 0) &&
            (need.power ?? []).every((d: string) => (pool.power[d as keyof typeof pool.power] ?? 0) >= 1);
          if (canPay) {
            pool.energy -= need.energy ?? 0;
            for (const domain of need.power ?? []) {
              const key = domain as keyof typeof pool.power;
              pool.power[key] = (pool.power[key] ?? 0) - 1;
            }
            paidAccelerate = optional.kind === "accelerate";
            paidAdditionalCostActual = true;
          }
        } else if (optional?.kind === "kill" && sacrificeId) {
          const owner = context.cards.getCardOwner(sacrificeId as CoreCardId);
          const zone = context.zones.getCardZone(sacrificeId as CoreCardId);
          const inPlay =
            zone === "base" ||
            (typeof zone === "string" && zone.startsWith("battlefield-"));
          const kind = getGlobalCardRegistry().get(sacrificeId as string)?.cardType;
          const okType =
            !optional.kill?.type ||
            optional.kill.type === "permanent" ||
            optional.kill.type === kind;
          if (owner === playerId && inPlay && sacrificeId !== cardId && okType) {
            zones.moveCard({
              cardId: sacrificeId as CoreCardId,
              targetZoneId: "trash" as CoreZoneId,
            });
            paidAdditionalCostActual = true;
          }
        }
      }

      zones.moveCard({
        cardId: cardId as CoreCardId,
        targetZoneId: location as CoreZoneId,
      });

      // Rule 143.4: units enter exhausted unless a static "I enter ready"
      // effect (enter-ready) says otherwise (e.g. Eager Drakehound sfd-006-221),
      // Accelerate was paid (rule 717), or a runtime `enters-ready` replacement
      // (rule 571 — Sun Disc ogn-021-298) applies.
      const entersReady =
        hasStaticEffect(cardId, "enter-ready") ||
        paidAccelerate ||
        consumeEntersReadyReplacement(draft, playerId);
      if (!entersReady) {
        counters.setFlag(cardId as CoreCardId, "exhausted", true);
      }

      // Fire "play-self" and "play-card" triggers BEFORE incrementing the
      // Rule-724 counter, so a Legion trigger on this card itself cannot
      // Satisfy its own condition — it must observe the count of cards
      // That were played EARLIER in this turn.
      fireTriggers(
        { cardId, paidAdditionalCost: paidAdditionalCostActual, playerId, type: "play-self" },
        { cards: context.cards, counters, draft, zones },
      );
      fireTriggers(
        { cardId, cardType: "unit", playerId, type: "play-card" },
        { cards: context.cards, counters, draft, zones },
      );

      // Rule 724 (Legion) tracker: count this play so subsequent cards
      // Can satisfy their Legion conditions. Runes are NOT counted.
      if (draft.cardsPlayedThisTurn) {
        draft.cardsPlayedThisTurn[playerId] = (draft.cardsPlayedThisTurn[playerId] ?? 0) + 1;
      }

      // rule-id: ven-041-166-weaponmaster-on-play-equip
      // Weaponmaster is a `{type:"keyword"}` ability, so trigger-matcher never
      // schedules it. Surface the "you may Equip … for [rainbow] less" prompt
      // directly: when the just-played unit has Weaponmaster and the player
      // owns any on-board equipment, block on a pendingChoice so the
      // controller can pick one (or decline). The [rainbow] discount is
      // implicit — the on-play attach charges nothing.
      if (
        !draft.pendingChoice &&
        getGlobalCardRegistry().hasKeyword(cardId, "Weaponmaster")
      ) {
        const registry = getGlobalCardRegistry();
        const boardZones: string[] = ["base"];
        for (const bfId of Object.keys(draft.battlefields ?? {})) {
          boardZones.push(getBattlefieldZoneId(bfId));
        }
        const equipOptions: string[] = [];
        for (const zoneId of boardZones) {
          for (const id of zones.getCardsInZone(
            zoneId as CoreZoneId,
            playerId as CorePlayerId,
          )) {
            if (registry.get(id as string)?.cardType === "equipment") {
              equipOptions.push(id as string);
            }
          }
        }
        if (equipOptions.length > 0) {
          draft.pendingChoice = {
            options: equipOptions,
            playerId,
            type: "weaponmaster-equip",
            unitId: cardId,
          };
        }
      }
    },
  },

  /**
   * Play gear to Base (rule 143.1.a.1)
   */
  playGear: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      if (state.pendingChoice) {
        return false;
      }
      if (state.turn.activePlayer !== context.params.playerId) {
        return false;
      }
      if (state.turn.phase !== "main") {
        return false;
      }
      // Rule 140.1.b/c + 508.1.a: Playing Gear is a Discretionary Action,
      // legal only in a Neutral Open state (no chain, no showdown).
      const interaction = state.interaction ?? createInteractionState();
      if (getTurnState(interaction) !== "neutral-open") {
        return false;
      }

      const zone = context.zones.getCardZone(context.params.cardId as CoreCardId);
      if (zone !== "hand") {
        return false;
      }

      // Rule 103 / 555: only the card's owner may play it.
      const owner = context.cards.getCardOwner(context.params.cardId as CoreCardId);
      if (owner !== context.params.playerId) {
        return false;
      }

      if (
        !canAffordCard(
          state,
          context.params.playerId,
          context.params.cardId,
          { chosenTargetId: context.params.chosenTargetId },
          createMetaAccessor(context.cards),
          getPotentialRuneEnergy(context.zones, context.counters, context.params.playerId),
        )
      ) {
        return false;
      }

      return true;
    },
    enumerator: (state, context) => {
      if (state.status !== "playing") {
        return [];
      }
      if (state.pendingChoice) {
        return [];
      }
      if (state.turn.activePlayer !== (context.playerId as string)) {
        return [];
      }
      if (state.turn.phase !== "main") {
        return [];
      }
      const interaction = state.interaction ?? createInteractionState();
      if (getTurnState(interaction) !== "neutral-open") {
        return [];
      }

      const registry = getGlobalCardRegistry();
      const pool = state.runePools[context.playerId as string];
      if (!pool) {
        return [];
      }

      // Rule 357.1.a: credit ready runes as available energy for enumeration.
      const potential = getPotentialRuneEnergy(
        context.zones,
        context.counters,
        context.playerId as string,
      );
      const affordPool = { energy: pool.energy + potential, power: pool.power };

      const handCards = context.zones.getCardsInZone(
        "hand" as CoreZoneId,
        context.playerId as CorePlayerId,
      );

      const results: { playerId: string; cardId: string }[] = [];
      for (const cardId of handCards) {
        const def = registry.get(cardId as string);
        if (!def || (def.cardType !== "gear" && def.cardType !== "equipment")) {
          continue;
        }
        // Cards with interactive cost reduction are enumerated against their
        // Base cost; the actual cost is computed per-target at play time.
        if (!registry.canAfford(cardId as string, affordPool)) {
          continue;
        }

        results.push({
          cardId: cardId as string,
          playerId: context.playerId as string,
        });
      }
      return results;
    },
    reducer: (draft, context) => {
      const { cardId, playerId, chosenTargetId } = context.params;
      const { zones } = context;

      deductCost(draft, playerId, cardId, { chosenTargetId }, createMetaAccessor(context.cards));

      zones.moveCard({
        cardId: cardId as CoreCardId,
        targetZoneId: "base" as CoreZoneId,
      });

      // Gear normally enters ready (rule 143.4 applies to units only), but a
      // static "This enters exhausted" effect forces it to enter tapped
      // (e.g. Honeyfruit unl-049-219).
      if (hasStaticEffect(cardId, "enters-exhausted")) {
        context.counters.setFlag(cardId as CoreCardId, "exhausted", true);
      }

      // Fire "play-self" / "play-card" triggers BEFORE incrementing the
      // Rule-724 counter (see comment in playUnit).
      fireTriggers(
        { cardId, playerId, type: "play-self" },
        { cards: context.cards, counters: context.counters, draft, zones },
      );
      fireTriggers(
        { cardId, cardType: "gear", playerId, type: "play-card" },
        { cards: context.cards, counters: context.counters, draft, zones },
      );

      // Rule 724 (Legion) tracker: count this gear/equipment play.
      if (draft.cardsPlayedThisTurn) {
        draft.cardsPlayedThisTurn[playerId] = (draft.cardsPlayedThisTurn[playerId] ?? 0) + 1;
      }
    },
  },

  /**
   * Play a spell (rule 146-151)
   */
  playSpell: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      if (state.pendingChoice) {
        return false;
      }

      const zone = context.zones.getCardZone(context.params.cardId as CoreCardId);
      // rule-id: ven-049-166 — [Flow] lets the owner play a spell from their
      // trash for its Flow cost. viaFlow is only legal from the trash zone on
      // a card that carries a Flow keyword; non-Flow plays remain hand-only.
      const viaFlow = context.params.viaFlow === true;
      if (viaFlow) {
        if (zone !== "trash") {
          return false;
        }
        if (!getGlobalCardRegistry().getSpellFlowCost(context.params.cardId)) {
          return false;
        }
      } else if (zone !== "hand") {
        return false;
      }

      // Rule 103 / 555: only the card's owner may play it.
      const owner = context.cards.getCardOwner(context.params.cardId as CoreCardId);
      if (owner !== context.params.playerId) {
        return false;
      }

      // Rule: Repeat cost is only valid on spells that have a defined
      // `repeat` cost on their spell ability. Reject repeatCount > 0 for
      // Spells without Repeat.
      const reqRepeatCount = Math.max(0, context.params.repeatCount ?? 0);
      if (reqRepeatCount > 0) {
        const registryCheck = getGlobalCardRegistry();
        if (!registryCheck.getSpellRepeatCost(context.params.cardId)) {
          return false;
        }
      }

      if (
        !canAffordCard(
          state,
          context.params.playerId,
          context.params.cardId,
          {
            repeatCount: reqRepeatCount,
            targets: context.params.targets,
            viaFlow,
            xAmount: context.params.xAmount,
          },
          createMetaAccessor(context.cards),
          getPotentialRuneEnergy(context.zones, context.counters, context.params.playerId),
        )
      ) {
        return false;
      }

      const interaction = state.interaction ?? createInteractionState();
      const turnState = getTurnState(interaction);
      const registry = getGlobalCardRegistry();
      const timing = (registry.getSpellTiming(context.params.cardId) ?? "action") as
        | "action"
        | "reaction";

      if (!isLegalTiming(timing, turnState)) {
        return false;
      }

      // Rule 530: in Neutral Open state, only the active player holds
      // Priority, so only they may play an Action-timed spell. Reaction
      // Spells can be played by any relevant player in a Closed state.
      if (timing === "action" && turnState === "neutral-open") {
        if (state.turn.activePlayer !== context.params.playerId) {
          return false;
        }
      }

      // Rule 355.8 / 419.2.a: gate on caster-chosen targets (including modal options).
      const abilities = registry.getAbilities(context.params.cardId) ?? [];
      const spellAbility = abilities.find((a: { type: string }) => a.type === "spell");
      if (
        !spellEffectHasLegalTargets(spellAbility?.effect as SpellEffectTargetShape | undefined, {
          cards: {
            getCardOwner: (c) => context.cards.getCardOwner(c),
          },
          draft: state,
          playerId: context.params.playerId as string,
          sourceCardId: context.params.cardId as string,
          zones: {
            getCardZone: (c) => context.zones.getCardZone(c),
            getCardsInZone: (z, p) => context.zones.getCardsInZone(z, p),
          },
        })
      ) {
        return false;
      }

      return true;
    },
    enumerator: (state, context) => {
      if (state.status !== "playing") {
        return [];
      }
      if (state.pendingChoice) {
        return [];
      }

      const registry = getGlobalCardRegistry();
      const interaction = state.interaction ?? createInteractionState();
      const turnState = getTurnState(interaction);
      const pool = state.runePools[context.playerId as string];
      if (!pool) {
        return [];
      }
      // Rule 357.1.a: credit ready runes as available energy for enumeration.
      const potential = getPotentialRuneEnergy(
        context.zones,
        context.counters,
        context.playerId as string,
      );
      const affordPool = { energy: pool.energy + potential, power: pool.power };

      const handCards = context.zones.getCardsInZone(
        "hand" as CoreZoneId,
        context.playerId as CorePlayerId,
      );

      const results: {
        playerId: string;
        cardId: string;
        targets?: string[];
        repeatCount?: number;
        viaFlow?: boolean;
      }[] = [];
      for (const cardId of handCards) {
        const def = registry.get(cardId as string);
        if (!def || def.cardType !== "spell") {
          continue;
        }
        if (!registry.canAfford(cardId as string, affordPool)) {
          continue;
        }

        // Check spell timing is legal in current turn state (rule 553)
        const timing = (registry.getSpellTiming(cardId as string) ?? "action") as
          | "action"
          | "reaction";
        if (!isLegalTiming(timing, turnState)) {
          continue;
        }

        // Rule 355.8 / 419.2.a: gate on caster-chosen targets (including modal options).
        const abilities = registry.getAbilities(cardId as string) ?? [];
        const spellAbility = abilities.find((a: { type: string }) => a.type === "spell");
        const spellEffect = spellAbility?.effect as SpellEffectTargetShape | undefined;
        const resolverCtx = {
          cards: {
            getCardMeta: (c: CoreCardId) => context.cards.getCardMeta?.(c),
            getCardOwner: (c: CoreCardId) => context.cards.getCardOwner(c),
          },
          draft: state,
          playerId: context.playerId as string,
          sourceCardId: cardId as string,
          zones: {
            getCardZone: (c: CoreCardId) => context.zones.getCardZone(c),
            getCardsInZone: (z: CoreZoneId, p?: CorePlayerId) => context.zones.getCardsInZone(z, p),
          },
        };
        if (!spellEffectHasLegalTargets(spellEffect, resolverCtx)) {
          continue;
        }

        // Rule 355.8: targets are chosen when the spell is PLAYED. For a
        // single-card target descriptor, enumerate one legal Play per valid
        // target so the caster picks. Programmatic selections (quantity:"all"),
        // player/battlefield targets, and self are not caster-chosen.
        // Rule 355.14.a: an amount:{might:<selector>} reference is also a
        // caster-chosen play-time target (unl-192-219).
        const refTgt = findAmountReferenceTarget(spellEffect);
        const tgt = spellEffect?.target ?? refTgt;
        const isCardTarget =
          tgt !== undefined &&
          typeof tgt !== "string" &&
          tgt.type !== "self" &&
          tgt.type !== "player" &&
          tgt.type !== "battlefield" &&
          tgt.quantity !== "all";
        const baseVariants: { playerId: string; cardId: string; targets?: string[] }[] = [];
        if (isCardTarget) {
          const validTargets = resolveTarget(
            tgt as Parameters<typeof resolveTarget>[0],
            resolverCtx,
          );
          // Rule 355.14.b/c / 355.15 (unl-192-219): when the enumerated target
          // is the might-reference of a split-damage effect, the caster ALSO
          // chooses up to N enemy split targets at finalization (N = ref's
          // current Might; zero is legal). Enumerate every subset so all
          // choices are locked on the chain item before opponents respond.
          const splitEffect = refTgt ? findSplitDamageEffect(spellEffect) : undefined;
          const splitDesc =
            splitEffect?.target && typeof splitEffect.target !== "string"
              ? splitEffect.target
              : undefined;
          for (const targetId of validTargets) {
            if (splitDesc) {
              const n = getCardEffectiveMight(targetId as string, (c) =>
                context.cards.getCardMeta?.(c),
              );
              const splitPool = resolveTarget(
                { ...splitDesc, quantity: "all" } as Parameters<typeof resolveTarget>[0],
                resolverCtx,
              );
              for (const subset of enumerateSubsetsUpTo(splitPool, n)) {
                baseVariants.push({
                  cardId: cardId as string,
                  playerId: context.playerId as string,
                  targets: [targetId as string, ...subset],
                });
              }
            } else {
              baseVariants.push({
                cardId: cardId as string,
                playerId: context.playerId as string,
                targets: [targetId as string],
              });
            }
          }
        } else {
          baseVariants.push({
            cardId: cardId as string,
            playerId: context.playerId as string,
          });
        }
        results.push(...baseVariants);

        // unl-182-219 [Repeat]: the additional cost is paid at cast time, so
        // enumerate one variant per affordable repeatCount alongside the base
        // play. Skip when every tier is free of energy AND power to avoid an
        // unbounded loop (rule 820.1.c.2 / 820.3 — canAffordCard bounds n
        // once any tier charges a resource).
        const repeatCost = registry.getSpellRepeatCost(cardId as string);
        if (repeatCost?.some((t) => t.energy > 0 || t.power.length > 0)) {
          const meta = createMetaAccessor(context.cards);
          for (const base of baseVariants) {
            for (let n = 1; ; n++) {
              if (
                !canAffordCard(
                  state,
                  context.playerId as string,
                  cardId as string,
                  { repeatCount: n, targets: base.targets },
                  meta,
                  potential,
                )
              ) {
                break;
              }
              results.push({ ...base, repeatCount: n });
            }
          }
        }
      }

      // rule-id: ven-049-166 — [Flow]: enumerate spells in the owner's trash
      // that carry a Flow cost keyword as playable via their alternate cost.
      const trashCards = context.zones.getCardsInZone(
        "trash" as CoreZoneId,
        context.playerId as CorePlayerId,
      );
      const meta = createMetaAccessor(context.cards);
      for (const cardId of trashCards) {
        const def = registry.get(cardId as string);
        if (!def || def.cardType !== "spell") {
          continue;
        }
        if (!registry.getSpellFlowCost(cardId as string)) {
          continue;
        }
        if (
          !canAffordCard(state, context.playerId as string, cardId as string, { viaFlow: true }, meta, potential)
        ) {
          continue;
        }
        const timing = (registry.getSpellTiming(cardId as string) ?? "action") as
          | "action"
          | "reaction";
        if (!isLegalTiming(timing, turnState)) {
          continue;
        }
        if (timing === "action" && turnState === "neutral-open") {
          if (state.turn.activePlayer !== (context.playerId as string)) {
            continue;
          }
        }
        const abilities = registry.getAbilities(cardId as string) ?? [];
        const spellAbility = abilities.find((a: { type: string }) => a.type === "spell");
        const spellEffect = spellAbility?.effect as SpellEffectTargetShape | undefined;
        const resolverCtx = {
          cards: {
            getCardMeta: (c: CoreCardId) => context.cards.getCardMeta?.(c),
            getCardOwner: (c: CoreCardId) => context.cards.getCardOwner(c),
          },
          draft: state,
          playerId: context.playerId as string,
          sourceCardId: cardId as string,
          zones: {
            getCardZone: (c: CoreCardId) => context.zones.getCardZone(c),
            getCardsInZone: (z: CoreZoneId, p?: CorePlayerId) => context.zones.getCardsInZone(z, p),
          },
        };
        if (!spellEffectHasLegalTargets(spellEffect, resolverCtx)) {
          continue;
        }
        const tgt = spellEffect?.target;
        const isCardTarget =
          tgt !== undefined &&
          typeof tgt !== "string" &&
          tgt.type !== "self" &&
          tgt.type !== "player" &&
          tgt.type !== "battlefield" &&
          tgt.quantity !== "all";
        if (isCardTarget) {
          const validTargets = resolveTarget(
            tgt as Parameters<typeof resolveTarget>[0],
            resolverCtx,
          );
          for (const targetId of validTargets) {
            results.push({
              cardId: cardId as string,
              playerId: context.playerId as string,
              targets: [targetId as string],
              viaFlow: true,
            });
          }
        } else {
          results.push({
            cardId: cardId as string,
            playerId: context.playerId as string,
            viaFlow: true,
          });
        }
      }
      return results;
    },
    reducer: (draft, context) => {
      const { cardId, playerId, targets, xAmount, repeatCount, viaFlow } = context.params;
      const { zones } = context;

      const repeatN = Math.max(0, repeatCount ?? 0);
      deductCost(
        draft,
        playerId,
        cardId,
        { repeatCount: repeatN, targets, viaFlow: viaFlow === true, xAmount },
        createMetaAccessor(context.cards),
      );

      // Look up spell effect from card definition
      const registry = getGlobalCardRegistry();
      const abilities = registry.getAbilities(cardId) ?? [];
      const spellAbility = abilities.find((a) => a.type === "spell");
      const spellEffect = spellAbility?.effect;

      // For X-cost spells, wrap the effect so the chosen X value travels
      // With it through the chain. The effect executor reads `variables.x`
      // When resolving `{ variable: "x" }` amount expressions.
      // For Repeat spells, we wrap the effect in a `sequence` that
      // Repeats the original effect (1 + repeatCount) times. This
      // Executes during chain resolution exactly once per repeat.
      const xValue = Math.max(0, xAmount ?? 0);
      let effectToStore: unknown = spellEffect;
      if (spellEffect && repeatN > 0) {
        const repeatedEffects = Array.from({ length: 1 + repeatN }, () => spellEffect);
        effectToStore = {
          effects: repeatedEffects,
          type: "sequence",
        };
      }
      if (xValue > 0 && effectToStore) {
        effectToStore = {
          ...(effectToStore as Record<string, unknown>),
          _variables: { x: xValue },
        };
      }

      // Add spell to the chain (rule 537)
      const interaction = draft.interaction ?? createInteractionState();
      const turnOrder = Object.keys(draft.players);
      draft.interaction = addToChain(
        interaction,
        { cardId, controller: playerId, effect: effectToStore, targets, type: "spell" },
        turnOrder,
      );

      // Rule 419.4.a: play-spell / play-card triggers fire when the spell
      // RESOLVES (not here) — see executeResolvedItem in chain-moves.ts.
      // Firing here would trigger e.g. Abandoned Hall even on countered
      // spells (425.1.b).

      // Rule 724 (Legion) tracker: count this spell play so subsequent
      // Cards can satisfy their Legion conditions.
      if (draft.cardsPlayedThisTurn) {
        draft.cardsPlayedThisTurn[playerId] = (draft.cardsPlayedThisTurn[playerId] ?? 0) + 1;
      }

      // Move spell to trash (it resolves from the chain later).
      // rule-id: ven-049-166 — a spell played via [Flow] from the trash is
      // banished instead of returning to the trash.
      zones.moveCard({
        cardId: cardId as CoreCardId,
        targetZoneId: (viaFlow ? "banishment" : "trash") as CoreZoneId,
      });
    },
  },

  /**
   * Hide a card at a Battlefield (rule 723)
   */
  hideCard: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      if (state.pendingChoice) {
        return false;
      }
      // Rule 597.2: Hide is a Discretionary Action → Neutral Open only.
      const interaction = state.interaction ?? createInteractionState();
      if (getTurnState(interaction) !== "neutral-open") {
        return false;
      }

      const zone = context.zones.getCardZone(context.params.cardId as CoreCardId);
      if (zone !== "hand") {
        return false;
      }

      // Rule 723.1: only cards with the Hidden keyword may be Hidden.
      const registry = getGlobalCardRegistry();
      if (!registry.hasKeyword(context.params.cardId as string, "Hidden")) {
        return false;
      }

      // Rule 597.1 / 723.1.b: must be a battlefield the player controls.
      const bfId = context.params.battlefieldId;
      const bf = state.battlefields[bfId];
      if (!bf || bf.controller !== context.params.playerId) {
        return false;
      }

      // Enforce per-player hidden-card capacity at the target battlefield.
      // Default capacity is 1; battlefields like Bandle Tree bump
      // `hiddenCapacityBonus` to permit additional hidden cards.
      const capacity = 1 + (bf.hiddenCapacityBonus ?? 0);
      const facedownZoneId = getFacedownZoneId(bfId);
      const hiddenCards = context.zones.getCardsInZone(facedownZoneId as CoreZoneId);
      let ownedHidden = 0;
      for (const hiddenId of hiddenCards) {
        if (context.cards.getCardOwner(hiddenId) === context.params.playerId) {
          ownedHidden++;
        }
      }
      if (ownedHidden >= capacity) {
        return false;
      }

      return true;
    },
    enumerator: (state, context) => {
      if (state.status !== "playing" || state.pendingChoice) {
        return [];
      }
      const interaction = state.interaction ?? createInteractionState();
      if (getTurnState(interaction) !== "neutral-open") {
        return [];
      }
      const registry = getGlobalCardRegistry();
      const hand = context.zones.getCardsInZone(
        "hand" as CoreZoneId,
        context.playerId as CorePlayerId,
      );
      const hiddenCards = hand.filter((id) => registry.hasKeyword(id as string, "Hidden"));
      if (hiddenCards.length === 0) {
        return [];
      }
      const results: { playerId: string; cardId: string; battlefieldId: string }[] = [];
      for (const [bfId, bf] of Object.entries(state.battlefields)) {
        if (bf.controller !== (context.playerId as string)) {
          continue;
        }
        const capacity = 1 + (bf.hiddenCapacityBonus ?? 0);
        const facedown = context.zones.getCardsInZone(getFacedownZoneId(bfId) as CoreZoneId);
        let owned = 0;
        for (const hid of facedown) {
          if (context.cards.getCardOwner(hid) === (context.playerId as string)) {
            owned++;
          }
        }
        if (owned >= capacity) {
          continue;
        }
        for (const cid of hiddenCards) {
          results.push({
            battlefieldId: bfId,
            cardId: cid as string,
            playerId: context.playerId as string,
          });
        }
      }
      return results;
    },
    reducer: (_draft, context) => {
      const { cardId, battlefieldId } = context.params;
      const { zones, counters, cards } = context;

      const facedownZoneId = getFacedownZoneId(battlefieldId);

      zones.moveCard({
        cardId: cardId as CoreCardId,
        targetZoneId: facedownZoneId as CoreZoneId,
      });

      counters.setFlag(cardId as CoreCardId, "hidden", true);
      cards.updateCardMeta(
        cardId as CoreCardId,
        {
          hidden: true,
          hiddenAt: battlefieldId,
        } as Partial<RiftboundCardMeta>,
      );

      // Fire hide event
      fireTriggers(
        { cardId, playerId: context.params.playerId, type: "hide" },
        { cards, counters, draft: _draft, zones },
      );
    },
  },

  /**
   * Reveal and play a hidden card (rule 723.1.c.3).
   *
   * Playing a card from facedown OPENS a chain. For spell cards this
   * means we add a chain item (same as playSpell). For unit/gear cards
   * we move them to the appropriate zone (battlefield / base).
   */
  revealHidden: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      if (state.pendingChoice) {
        return false;
      }
      const meta = context.cards.getCardMeta(context.params.cardId as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      if (!meta?.hidden) {
        return false;
      }
      const owner = context.cards.getCardOwner(context.params.cardId as CoreCardId);
      if (owner !== context.params.playerId) {
        return false;
      }
      return true;
    },
    reducer: (draft, context) => {
      const { cardId, playerId } = context.params;
      const { zones, counters, cards } = context;

      const meta = cards.getCardMeta(cardId as CoreCardId) as Partial<RiftboundCardMeta>;
      const battlefieldId = meta.hiddenAt;

      const registry = getGlobalCardRegistry();
      const def = registry.get(cardId);
      const cardType = def?.cardType;

      // Clear hidden state — the card is no longer facedown regardless
      // Of its eventual destination.
      counters.setFlag(cardId as CoreCardId, "hidden", false);
      cards.updateCardMeta(
        cardId as CoreCardId,
        {
          hidden: false,
          hiddenAt: undefined,
        } as Partial<RiftboundCardMeta>,
      );

      if (cardType === "spell") {
        // Rule 723.1.c.3: playing a card from facedown opens a chain.
        // Push the spell onto the chain and move the physical card to
        // Trash (where resolved spells live).
        const abilities = registry.getAbilities(cardId) ?? [];
        const spellAbility = abilities.find((a) => a.type === "spell");
        const spellEffect = spellAbility?.effect;
        const interaction = draft.interaction ?? createInteractionState();
        const turnOrder = Object.keys(draft.players);
        draft.interaction = addToChain(
          interaction,
          { cardId, controller: playerId, effect: spellEffect, type: "spell" },
          turnOrder,
        );
        zones.moveCard({
          cardId: cardId as CoreCardId,
          targetZoneId: "trash" as CoreZoneId,
        });
        fireTriggers({ cardId, playerId, type: "play-spell" }, { cards, counters, draft, zones });
        fireTriggers(
          { cardId, cardType: "spell", playerId, type: "play-card" },
          { cards, counters, draft, zones },
        );
        return;
      }

      // Unit / gear / equipment: move to the associated battlefield's
      // Physical zone. The card becomes face-up and "in play" without
      // Going through the chain.
      if (battlefieldId) {
        const battlefieldZoneId = getBattlefieldZoneId(battlefieldId);
        zones.moveCard({
          cardId: cardId as CoreCardId,
          targetZoneId: battlefieldZoneId as CoreZoneId,
        });
      }

      if (cardType === "unit") {
        fireTriggers({ cardId, playerId, type: "play-self" }, { cards, counters, draft, zones });
        fireTriggers(
          { cardId, cardType: "unit", playerId, type: "play-card" },
          { cards, counters, draft, zones },
        );
      }
    },
  },

  /**
   * Play Chosen Champion from Champion Zone (rule 107.2.c)
   */
  playFromChampionZone: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      if (state.pendingChoice) {
        return false;
      }
      if (state.turn.phase !== "main") {
        return false;
      }
      if (state.turn.activePlayer !== context.params.playerId) {
        return false;
      }

      // Rule 309.1.a: Closed State (chain open) admits only Reaction plays;
      // champion units are non-Reaction, so require neutral-open.
      const interaction = state.interaction ?? createInteractionState();
      if (getTurnState(interaction) !== "neutral-open") {
        return false;
      }

      const championZoneCards = context.zones.getCardsInZone(
        "championZone" as CoreZoneId,
        context.params.playerId as CorePlayerId,
      );
      if (championZoneCards.length === 0) {
        return false;
      }

      return true;
    },
    enumerator: (state, context) => {
      if (state.status !== "playing" || state.turn.phase !== "main") {
        return [];
      }
      if (state.turn.activePlayer !== context.playerId) {
        return [];
      }

      // Rule 309.1.a: no champion-zone plays while a chain exists.
      const interaction = state.interaction ?? createInteractionState();
      if (getTurnState(interaction) !== "neutral-open") {
        return [];
      }

      const championZoneCards = context.zones.getCardsInZone(
        "championZone" as CoreZoneId,
        context.playerId as CorePlayerId,
      );
      if (championZoneCards.length === 0) {
        return [];
      }

      // Rule 108.3.d/419.1.a with 357.1.a: credit ready runes as available energy.
      const banked = state.runePools?.[context.playerId]?.energy ?? 0;
      const energy =
        banked +
        getPotentialRuneEnergy(
          context.zones,
          context.counters,
          context.playerId as string,
        );
      // Rule 419.1.a: use the global card registry (context.registry has no .get()).
      const registry = getGlobalCardRegistry();
      const results: { playerId: PlayerId; location: string }[] = [];
      for (const cardId of championZoneCards) {
        const def = registry.get(cardId as string);
        const cost = def?.energyCost ?? 0;
        if (cost > energy) {
          continue;
        }
        results.push({ location: "base", playerId: context.playerId as PlayerId });
      }
      return results;
    },
    reducer: (draft, context) => {
      const { playerId, location } = context.params;
      const { zones, counters } = context;

      const championZoneCards = zones.getCardsInZone(
        "championZone" as CoreZoneId,
        playerId as CorePlayerId,
      );

      if (championZoneCards.length > 0) {
        const championId = championZoneCards[0];
        if (championId) {
          deductCost(draft, playerId, championId as string, {}, createMetaAccessor(context.cards));

          zones.moveCard({
            cardId: championId,
            targetZoneId: location as CoreZoneId,
          });

          const entersReady =
            hasStaticEffect(championId as string, "enter-ready") ||
            consumeEntersReadyReplacement(draft, playerId);
          if (!entersReady) {
            counters.setFlag(championId, "exhausted", true);
          }
        }
      }
    },
  },
};
