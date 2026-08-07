/**
 * activateAbility move + activated-ability collection/cost helpers (split from chain-moves.ts).
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import {
  addToChain,
  createInteractionState,
  getTurnState,
  hasChainPriorityPermission,
  hasShowdownPermission,
  isLegalTiming,
} from "../../../chain";
import type { ExecutableEffect } from "../../../abilities/effect-executor";
import { executeEffect } from "../../../abilities/effect-executor";
import type { TargetDescriptor } from "../../../abilities/target-resolver";
import { resolveTarget } from "../../../abilities/target-resolver";
import { recalculateStaticEffects } from "../../../abilities/static-abilities";
import { fireTriggers } from "../../../abilities/trigger-runner";
import { evaluateWhileLevel } from "../../../abilities/xp-conditions";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import { removeFromBoard } from "../../../operations/leave-board";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { getDeflectSurcharge, getPotentialRuneEnergy } from "../play/cost";
import type { SpellEffectTargetShape } from "../play/targeting";
import { findSequenceLeadTarget, spellEffectHasLegalTargets } from "../play/targeting";
import { buildEffectContext, canAffordPower } from "./effect-context";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * rule 343.1.b / 308.1.a: card abilities by DEFAULT cannot be activated during
 * a Showdown State — only those printed [Action]/[Reaction] can (313.1.a). This
 * holds for every host type: units (145.2), gear (151.2) and legends
 * (174.8/381) alike, so an untagged ability is "standard" timing, which
 * `isLegalTiming` permits in neutral-open only.
 */
function abilityTimingClass(
  ability: { keyword?: string; timing?: string },
  _hostCardId: string,
): "standard" | "action" | "reaction" {
  if (ability.keyword === "Reaction" || ability.timing === "reaction") {
    return "reaction";
  }
  if (ability.keyword === "Action" || ability.timing === "action") {
    return "action";
  }
  return "standard";
}

/**
 * rule 403 / 379.5 — normalize an activated ability's `recycle` cost. The parser
 * emits a bare count for "Recycle N from your trash" and an object
 * `{amount, from, cardType?}` for "Recycle a <noun> from your trash"
 * (sfd-019-221 Assembly Rig). Hand/board recycle costs are paid elsewhere.
 */
/**
 * rule 377.2.b — "Use only once per turn" is a condition on ACTIVATING: the
 * per-turn tally lives in `turnEventCounts` (reset every turn by the flow) and
 * is keyed by the HOST card, so a copy of the ability on another card keeps its
 * own allowance.
 */
/**
 * rule-id: sfd-075-221 — the acting source type for `use-activated-ability`.
 * rule 151: Equipment is a kind of gear (and [Equip] is an activated ability),
 * so both report "gear" to "an activated ability of a gear" triggers.
 */
function activationSourceType(hostCardId: string): string | undefined {
  const cardType = getGlobalCardRegistry().getCardType(hostCardId);
  if (cardType === "equipment") {
    return "gear";
  }
  return cardType ?? undefined;
}

export function abilityUseKey(hostCardId: string, abilityIndex: number): string {
  return `activate|${hostCardId}|${abilityIndex}`;
}

function oncePerTurnExhausted(
  state: { turnEventCounts?: Record<string, number> },
  restrictions: readonly { type: string }[] | undefined,
  hostCardId: string,
  abilityIndex: number,
): boolean {
  if (!restrictions?.some((r) => r.type === "once-per-turn")) {
    return false;
  }
  return (state.turnEventCounts?.[abilityUseKey(hostCardId, abilityIndex)] ?? 0) >= 1;
}

function normalizeRecycleCost(raw: unknown): { amount: number; cardType?: string } | undefined {
  if (typeof raw === "number") {
    return raw > 0 ? { amount: raw } : undefined;
  }
  if (raw && typeof raw === "object") {
    const spec = raw as { amount?: number; cardType?: string; from?: string };
    if (spec.from !== undefined && spec.from !== "trash") {
      return undefined;
    }
    const amount = spec.amount ?? 1;
    return amount > 0 ? { amount, cardType: spec.cardType } : undefined;
  }
  return undefined;
}

/**
 * rule 357.2 / 422.3 — a "Discard N" activation cost is either a bare number
 * or a descriptor ("Discard a gear" -> `{amount, cardType}`, ven-060-166).
 * Normalizing both shapes keeps condition / enumerator / reducer honest; an
 * object cost used to fail the `> 0` numeric test and silently eat the other
 * costs without ever creating the chain item.
 */
function normalizeDiscardCost(raw: unknown): { amount: number; cardType?: string } | undefined {
  if (typeof raw === "number") {
    return raw > 0 ? { amount: raw } : undefined;
  }
  if (raw && typeof raw === "object") {
    const spec = raw as { amount?: number; cardType?: string };
    const amount = spec.amount ?? 1;
    return amount > 0 ? { amount, cardType: spec.cardType } : undefined;
  }
  return undefined;
}

/** rule 357.2 — the hand cards that can actually pay a discard cost. */
function eligibleDiscardCards(hand: readonly unknown[], spec: { cardType?: string }): string[] {
  const ids = hand as readonly string[];
  if (!spec.cardType) {
    return [...ids];
  }
  const registry = getGlobalCardRegistry();
  return ids.filter((id) => registry.getCardType(id) === spec.cardType);
}

/**
 * rule 429.2 / 605.2 — an activated ability that only [Add]s resources resolves
 * as soon as it is finalized and never becomes a respondable chain item. A
 * conditional wrapper ("[Add] 1. If this is [Empowered], [Add] 2 instead.",
 * ven-075-166) is still only an Add, so unwrap it: every branch present must
 * itself be an immediate Add.
 */
function isImmediateAddEffect(effect: unknown): boolean {
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

/**
 * rule 379.5 — the cards in `trash` that can actually pay a recycle cost.
 * "Recycle a unit from your trash" is only payable with units.
 */
function eligibleRecycleCards(
  trash: readonly unknown[],
  spec: { cardType?: string },
): string[] {
  const ids = trash as readonly string[];
  if (!spec.cardType) {
    return [...ids];
  }
  const registry = getGlobalCardRegistry();
  return ids.filter((id) => registry.getCardType(id) === spec.cardType);
}

/**
 * rule-id: sfd-052-221 (rule 355.10.f / 355.14.b) — an activated ability's
 * single caster-chosen card target ("Give a unit +3 Might") is chosen when
 * the ability is finalized on the chain, not when it resolves. Returns that
 * descriptor, or undefined when the effect has no such play-time choice
 * (self / player / battlefield / "all" / multi-pick targets stay as-is).
 */
/**
 * rule 809.1.c (rule-id: sfd-120-221) — [Deflect X] taxes an opponent's
 * targeted ACTIVATED ability exactly as it taxes a spell: choosing a Deflect
 * object costs X more Power of any Domain on top of the ability's own cost.
 * The host already sits on the board, so the whole pool (less the ability's own
 * Power pips) is the budget. Returns 0 for a chooser who controls the target.
 */
function deflectSurchargeForActivation(
  state: RiftboundGameState,
  playerId: string,
  targets: readonly string[] | undefined,
  cards: unknown,
): number {
  if (!targets || targets.length === 0) {
    return 0;
  }
  return getDeflectSurcharge(state as never, playerId, targets as string[], cards as never);
}

/** Power left over for a Deflect surcharge after the ability's own Power pips. */
function deflectBudget(
  state: RiftboundGameState,
  playerId: string,
  cost: Record<string, unknown> | undefined,
): number {
  const pool = state.runePools[playerId];
  const total = Object.values(pool?.power ?? {}).reduce(
    (a: number, b) => a + ((b as number | undefined) ?? 0),
    0,
  );
  return total - ((cost?.power as string[] | undefined)?.length ?? 0);
}

/**
 * rule-id: unl-045-219 (Forgotten Signpost) — rule 402.3 / 204.1.b: an effect
 * that pays by exhausting one unit and moves "a DIFFERENT unit you control"
 * needs two distinct units, so the ids a `to: "exhausted-ally"` move may
 * legally carry are only those with some other ready unit left to pay.
 */
function exhaustedAllyMoveTargets(
  effect: unknown,
  resolverCtx: Parameters<typeof resolveTarget>[1],
): string[] | undefined {
  const e = effect as { to?: unknown; target?: unknown; costExhaust?: unknown } | undefined;
  if (e?.to !== "exhausted-ally" || !e.target || !e.costExhaust) {
    return undefined;
  }
  const movers = resolveTarget({ ...(e.target as TargetDescriptor), quantity: "all" }, resolverCtx);
  const payers = resolveTarget(
    { ...(e.costExhaust as TargetDescriptor), quantity: "all" },
    resolverCtx,
  );
  return movers.filter((m) => payers.some((p) => p !== m));
}

function activationChosenTarget(effect: unknown): TargetDescriptor | undefined {
  let t = (effect as { target?: unknown } | undefined)?.target;
  // rule 355.7/355.8: a sequence ability ("Kill a friendly unit. Look at the
  // top 5 …") still declares its one caster-chosen target at finalization, so
  // opponents may react before it resolves — same lead-slot rule as spells.
  if (!t && (effect as { type?: string } | undefined)?.type === "sequence") {
    t = findSequenceLeadTarget(effect as SpellEffectTargetShape);
  }
  if (!t || typeof t !== "object") {
    return undefined;
  }
  const d = t as TargetDescriptor & { quantity?: unknown };
  if (
    d.type === "self" ||
    d.type === "trigger-source" ||
    d.type === "player" ||
    d.type === "battlefield" ||
    d.type === "pending-value"
  ) {
    return undefined;
  }
  if (d.quantity !== undefined && d.quantity !== 1) {
    return undefined;
  }
  return d;
}

/**
 * A resolved entry returned by `collectActivatedAbilities`.
 *
 * - `hostCardId` is the card whose cost will be paid (e.g., Heimerdinger,
 *   Svellsongur). This is always the card the player selects.
 * - `sourceCardId` is the card whose ability text/effect is used. It equals
 *   `hostCardId` for a card's own abilities and differs for inherited /
 *   copied abilities.
 * - `abilityIndex` indexes into the source card's registry ability list.
 */
export interface ActivatedEntry {
  hostCardId: string;
  sourceCardId: string;
  abilityIndex: number;
  ability: NonNullable<
    ReturnType<ReturnType<typeof getGlobalCardRegistry>["getAbilities"]>
  >[number];
}

/**
 * Collect every activated ability available on `hostCardId`, including
 * abilities inherited via `inheritExhaustAbilities` (Heimerdinger) or
 * copied via `copiedFromCardId` meta (Svellsongur).
 *
 * Each returned entry is a distinct `(sourceCardId, abilityIndex)` pair that
 * will be paid on `hostCardId`. Own abilities come first so the existing
 * ability-index convention is preserved for cards without inheritance.
 */
export function collectActivatedAbilities(
  hostCardId: string,
  playerId: string,
  ctx: {
    zones: {
      getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
    };
    cards: {
      getCardOwner: (cardId: CoreCardId) => string | undefined;
      getCardMeta: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined;
    };
    battlefields: Record<string, unknown>;
  },
): ActivatedEntry[] {
  const registry = getGlobalCardRegistry();
  const entries: ActivatedEntry[] = [];

  // 1. Own abilities (always present — abilityIndex matches getAbilities)
  const ownAbilities = registry.getAbilities(hostCardId) ?? [];
  for (let i = 0; i < ownAbilities.length; i++) {
    const ability = ownAbilities[i];
    if (!ability || ability.type !== "activated") {
      continue;
    }
    entries.push({
      ability,
      abilityIndex: i,
      hostCardId,
      sourceCardId: hostCardId,
    });
  }

  // 2. Copied abilities (Svellsongur): when `copiedFromCardId` is set,
  // Expose the referenced card's activated abilities as if they were this
  // Card's own.
  const hostMeta = ctx.cards.getCardMeta(hostCardId as CoreCardId) as
    | Partial<RiftboundCardMeta>
    | undefined;
  const copiedFrom = hostMeta?.copiedFromCardId;
  if (copiedFrom && copiedFrom !== hostCardId) {
    const copiedAbilities = registry.getAbilities(copiedFrom as string) ?? [];
    for (let i = 0; i < copiedAbilities.length; i++) {
      const ability = copiedAbilities[i];
      if (!ability || ability.type !== "activated") {
        continue;
      }
      entries.push({
        ability,
        abilityIndex: i,
        hostCardId,
        sourceCardId: copiedFrom as string,
      });
    }
  }

  // rule-id: ven-142-166 — abilities granted by another card's effect
  // ("give it '[rainbow][rainbow]: Ready me' this turn"). Host pays; the
  // ability text lives on the granting card at `abilityIndex`.
  for (const granted of hostMeta?.grantedAbilities ?? []) {
    const ability = (registry.getAbilities(granted.sourceCardId as string) ?? [])[
      granted.abilityIndex
    ];
    if (!ability || ability.type !== "activated") {
      continue;
    }
    entries.push({
      ability,
      abilityIndex: granted.abilityIndex,
      hostCardId,
      sourceCardId: granted.sourceCardId as string,
    });
  }

  // 3. Inherited exhaust abilities (Heimerdinger): scan every friendly
  // Legend, unit, and gear for activated abilities whose cost includes
  // `exhaust: true`, and expose each as if it were an ability of this card.
  const hostDef = registry.get(hostCardId);
  if (hostDef?.inheritExhaustAbilities) {
    const friendlyCardIds = collectFriendlyBoardCards(playerId, ctx);
    for (const otherCardId of friendlyCardIds) {
      if (otherCardId === hostCardId) {
        continue;
      }
      const otherDef = registry.get(otherCardId);
      if (!otherDef) {
        continue;
      }
      const { cardType } = otherDef;
      if (
        cardType !== "legend" &&
        cardType !== "unit" &&
        cardType !== "gear" &&
        cardType !== "equipment"
      ) {
        continue;
      }
      const otherAbilities = registry.getAbilities(otherCardId) ?? [];
      for (let i = 0; i < otherAbilities.length; i++) {
        const ability = otherAbilities[i];
        if (!ability || ability.type !== "activated") {
          continue;
        }
        const cost = ability.cost as Record<string, unknown> | undefined;
        if (!cost || cost.exhaust !== true) {
          continue;
        }
        entries.push({
          ability,
          abilityIndex: i,
          hostCardId,
          sourceCardId: otherCardId,
        });
      }
    }
  }

  return entries;
}

/**
 * Collect all friendly cards on the board for a player — used when scanning
 * for inheritable abilities (Heimerdinger).
 */
export function collectFriendlyBoardCards(
  playerId: string,
  ctx: {
    zones: {
      getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
    };
    cards: { getCardOwner: (cardId: CoreCardId) => string | undefined };
    battlefields: Record<string, unknown>;
  },
): string[] {
  const collected: string[] = [];
  const push = (cards: CoreCardId[]) => {
    for (const cardId of cards) {
      if (ctx.cards.getCardOwner(cardId) === playerId) {
        collected.push(cardId as string);
      }
    }
  };
  push(ctx.zones.getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId));
  push(ctx.zones.getCardsInZone("legendZone" as CoreZoneId, playerId as CorePlayerId));
  // rule 108.3 — the champion zone is not the board: a champion waiting there
  // has not been played, so its abilities are not on any friendly permanent.
  for (const bfId of Object.keys(ctx.battlefields)) {
    push(ctx.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId, playerId as CorePlayerId));
  }
  return collected;
}

/**
 * rule 135.2.e.5.a / 429.1 (sfd-083-221, sfd-117-221) — "Pay any amount of
 * [rainbow]/Energy to [Add] that much …": the chosen X rides on the move as
 * `xAmount` (absent ⇒ 0, which is always a legal "any amount") and the cost
 * spec names which pool pays it ([rainbow] ⇒ Power of any Domain).
 */
export function abilityXPayment(
  cost: Record<string, unknown> | undefined,
  params: Record<string, unknown>,
): { amount: number; resource: "energy" | "power" } | undefined {
  const spec = cost?.x as { resource?: string } | undefined;
  if (!spec) {
    return undefined;
  }
  const raw = params.xAmount;
  const amount = typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : 0;
  return { amount, resource: spec.resource === "energy" ? "energy" : "power" };
}

/**
 * Deduct an activated ability's cost from the player's rune pool.
 */
export function deductAbilityCost(
  draft: RiftboundGameState,
  playerId: string,
  cost: Record<string, unknown>,
  zones: { getCardsInZone: (zone: CoreZoneId, player: CorePlayerId) => readonly CoreCardId[] },
  counters: {
    getFlag: (cardId: CoreCardId, flag: string) => boolean | undefined;
    setFlag: (cardId: CoreCardId, flag: string, value: boolean) => void;
  },
): void {
  // rule 512.2 / rule-id: unl-135-219 — an XP portion of a cost is spent from
  // the player's XP pool (which lives outside the rune pool, so charge it
  // before the pool guard below).
  const xpCost = (cost.xp as number) ?? 0;
  if (xpCost > 0) {
    const player = draft.players[playerId];
    if (player) {
      player.xp = Math.max(0, player.xp - xpCost);
    }
  }

  const pool = draft.runePools[playerId];
  if (!pool) {
    return;
  }

  const energyCost = (cost.energy as number) ?? 0;
  if (energyCost > 0) {
    // Rule 403.1.a + 404.1: the full [N] energy cost must be paid before an
    // ability is finalized to the chain. Rule 357.1.a lets a player exhaust
    // ready runes for energy during Pay Costs, and the condition/enumerator
    // credit those runes toward affordability — so when banked energy is
    // short, auto-exhaust ready runes here to actually cover the shortfall
    // instead of clamping the deduction to zero.
    let shortfall = energyCost - pool.energy;
    if (shortfall > 0) {
      const runes = zones.getCardsInZone("runePool" as CoreZoneId, playerId as CorePlayerId);
      for (const runeId of runes) {
        if (shortfall <= 0) {
          break;
        }
        if (counters.getFlag(runeId, "exhausted")) {
          continue;
        }
        counters.setFlag(runeId, "exhausted", true);
        pool.energy += 1;
        shortfall -= 1;
      }
    }
    pool.energy = Math.max(0, pool.energy - energyCost);
  }

  const powerCost = cost.power as string[] | undefined;
  if (powerCost) {
    for (const domain of powerCost) {
      // Rule 135.2.e.5.a: [rainbow] costs are paid with any Domain's Power.
      const key =
        domain === "rainbow"
          ? (Object.entries(pool.power).sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))[0]?.[0] as
              | keyof typeof pool.power
              | undefined)
          : (domain as keyof typeof pool.power);
      // rule 135.2.e.5.b: universal ([rainbow]) Power pays a pip of any Domain,
      // so a named-domain pip falls back to it when that Domain is empty.
      if (key !== undefined && (pool.power[key] ?? 0) === 0 && (pool.power.rainbow ?? 0) > 0) {
        pool.power.rainbow = (pool.power.rainbow ?? 0) - 1;
        continue;
      }
      if (key !== undefined) {
        pool.power[key] = Math.max(0, (pool.power[key] ?? 0) - 1);
      }
    }
  }
}

/**
 * Activate an ability on a card (rules 564-585)
 *
 * Player chooses a card + ability index, pays the cost,
 * and the ability goes on the chain.
 */
export const activateAbility: Defs["activateAbility"] = {
  condition: (state, context) => {
    if (state.status !== "playing") {
      return false;
    }
    const { playerId, cardId, abilityIndex, sourceCardId } = context.params;

    // rule 429.3 / 429.3.a / 444.2.c: while a payment is being asked for, the
    // paying player may still activate Reaction [Add] abilities (they resolve
    // immediately and never use the chain). Every other pending choice, and
    // every other ability, stays locked out until the choice is answered.
    const payXPrompt =
      state.pendingChoice?.type === "pay-x" && state.pendingChoice.playerId === playerId;
    if (state.pendingChoice && !payXPrompt) {
      return false;
    }

    // Card must be on board (base, battlefield, legendZone, battlefieldRow).
    // Rule 580 / 101 (clarified): champions in championZone have NOT been
    // Played yet — they must be played from championZone into play before
    // Their activated abilities can be used. Legends in legendZone, by
    // Contrast, remain accessible from their zone. ChampionZone is therefore
    // Excluded from the set of zones that permit activation.
    const zone = context.zones.getCardZone(cardId as CoreCardId) as string | undefined;
    if (
      !zone ||
      (zone !== "base" &&
        !zone.startsWith("battlefield") &&
        zone !== "legendZone" &&
        zone !== "battlefieldRow")
    ) {
      return false;
    }

    // rule 477.1.a / 702.2.b.2: activation legality follows CURRENT CONTROL,
    // not ownership — a possessed unit is activated by its new controller and
    // no longer by its owner.
    const controller =
      context.cards.getCardController?.(cardId as CoreCardId) ??
      context.cards.getCardOwner(cardId as CoreCardId);
    if (controller !== playerId) {
      return false;
    }

    // Look up the ability from the source card (may equal cardId for own
    // Abilities or differ for inherited/copied abilities).
    const registry = getGlobalCardRegistry();
    const abilityLookupId = (sourceCardId as string | undefined) ?? cardId;
    const abilities = registry.getAbilities(abilityLookupId) ?? [];
    const ability = abilities[abilityIndex];
    if (!ability || ability.type !== "activated") {
      return false;
    }

    // rule 605.2 / 429.3.a: only resource-Adding abilities resolve immediately,
    // so only those may be used mid-payment.
    if (payXPrompt) {
      if (!isImmediateAddEffect(ability.effect)) {
        return false;
      }
    }

    // Rule 728 / [Level N]: an activated ability gated by a while-level
    // condition is unavailable until the controller has ≥ threshold XP.
    const abilityCondition = (ability as { condition?: { type?: string; threshold?: number } })
      .condition;
    if (abilityCondition?.type === "while-level") {
      if (!evaluateWhileLevel(state, playerId, abilityCondition.threshold ?? 0)) {
        return false;
      }
    }

    // Rule 580.3 (unl-160-219): "Use this ability only while I'm at a
    // battlefield" attaches a self-at-battlefield restriction to the
    // activated ability; the host card must be at a battlefield zone.
    const abilityRestrictions = (ability as { restrictions?: readonly { type: string }[] })
      .restrictions;
    if (abilityRestrictions?.some((r) => r.type === "self-at-battlefield")) {
      if (!zone.startsWith("battlefield")) {
        return false;
      }
    }
    // rule 377.2.b: "Use only once per turn" — already used this turn.
    if (oncePerTurnExhausted(state, abilityRestrictions, cardId as string, abilityIndex as number)) {
      return false;
    }
    // Rule 827.1.c.1: [Empower] carries an implicit "Play only if not
    // Empowered" — reject activation when the host is already Empowered.
    if (abilityRestrictions?.some((r) => r.type === "not-empowered")) {
      const hostMeta = context.cards.getCardMeta(cardId as CoreCardId) as
        | { empowered?: boolean }
        | undefined;
      if (hostMeta?.empowered === true) {
        return false;
      }
    }

    // If an inherited ability was requested, verify that the host card
    // Legitimately exposes it (prevents arbitrary cross-card activation).
    if (sourceCardId && sourceCardId !== cardId) {
      const entries = collectActivatedAbilities(cardId, playerId, {
        battlefields: state.battlefields,
        cards: context.cards,
        zones: context.zones,
      });
      const match = entries.find(
        (e) => e.sourceCardId === sourceCardId && e.abilityIndex === abilityIndex,
      );
      if (!match) {
        return false;
      }
    }

    // Check timing legality
    const interaction = state.interaction ?? createInteractionState();
    const turnState = getTurnState(interaction);
    const timing = abilityTimingClass(ability as { keyword?: string; timing?: string }, cardId as string);
    if (!isLegalTiming(timing, turnState)) {
      return false;
    }
    // rule 429.3 / 429.3.a: a payment being asked for is its own window — the
    // paying player may crack Reaction [Add] abilities there regardless of who
    // holds Focus or the turn.
    if (!payXPrompt) {
      // rule 316.5.b: in a Neutral Open State only the Turn Player may
      // activate abilities ([Reaction] adds Closed States, not this one).
      if (turnState === "neutral-open" && state.turn.activePlayer !== playerId) {
        return false;
      }
      // rule 312.2.c-d / 338.1.b.1: Closed State → only the Priority holder
      // may add another item to the chain.
      if (!hasChainPriorityPermission(interaction, playerId)) {
        return false;
      }
      // rule 313.1 / 347: in a Showdown Open State only the Focus holder acts.
      if (turnState === "showdown-open" && !hasShowdownPermission(interaction, playerId)) {
        return false;
      }
    }

    // Check if player can afford the cost
    if (ability.cost) {
      const cost = ability.cost as Record<string, unknown>;
      const pool = state.runePools[playerId];
      if (!pool) {
        return false;
      }

      const energyCost = (cost.energy as number) ?? 0;
      // Rule 357.1.a: ready runes may be exhausted for energy during Pay
      // Costs, so count them toward affordability (parity with play* moves).
      const potentialEnergy = getPotentialRuneEnergy(
        context.zones,
        context.counters as { getFlag: (c: CoreCardId, f: string) => boolean | undefined },
        playerId,
      );
      if (pool.energy + potentialEnergy < energyCost) {
        return false;
      }

      const powerCost = cost.power as string[] | undefined;
      if (powerCost) {
        const needed: Record<string, number> = {};
        for (const d of powerCost) {
          needed[d] = (needed[d] ?? 0) + 1;
        }
        if (!canAffordPower(pool.power, needed)) {
          return false;
        }
      }

      // rule 444.2 / 135.2.e.5.a: X may never exceed what the paying pool
      // holds; [rainbow] X is payable out of Power of ANY Domain.
      const xPay = abilityXPayment(cost, context.params as Record<string, unknown>);
      if (xPay) {
        const rawX = (context.params as { xAmount?: unknown }).xAmount;
        if (rawX !== undefined && (typeof rawX !== "number" || !Number.isInteger(rawX) || rawX < 0)) {
          return false;
        }
        if (xPay.resource === "energy") {
          if (pool.energy + potentialEnergy < energyCost + xPay.amount) {
            return false;
          }
        } else {
          const totalPower = Object.values(pool.power).reduce<number>((a, b) => a + (b ?? 0), 0);
          if (totalPower < xPay.amount + (powerCost?.length ?? 0)) {
            return false;
          }
        }
      }

      // Rules 729-730: XP is a player resource; "Spend N XP" requires the
      // controller to have ≥N XP at activation time.
      const xpCost = cost.xp as number | undefined;
      if (xpCost && xpCost > 0) {
        const have = state.players[playerId]?.xp ?? 0;
        if (have < xpCost) {
          return false;
        }
      }

      // Rule 577.2: Cost must be payable at activation time. An [Exhaust]
      // Cost cannot be paid if the host card is already exhausted.
      // Exhaust always applies to the host card (`cardId`), even for
      // Inherited abilities where the source differs (e.g., Heimerdinger).
      if (cost.exhaust) {
        const {getFlag} = (
          context.counters as { getFlag?: (c: CoreCardId, f: string) => boolean }
        );
        if (getFlag && getFlag(cardId as CoreCardId, "exhausted")) {
          return false;
        }
        const hostMeta = context.cards.getCardMeta(cardId as CoreCardId) as
          | { exhausted?: boolean }
          | undefined;
        if (hostMeta?.exhausted === true) {
          return false;
        }
      }

      // rule 702.2.b.1 (ogn-164-298 Sett): a "Spend my buff" cost removes the
      // host's buff — an unbuffed host cannot pay it.
      if (cost.spend === "buff") {
        const hostMeta = context.cards.getCardMeta(cardId as CoreCardId) as
          | { buffed?: boolean }
          | undefined;
        if (hostMeta?.buffed !== true) {
          return false;
        }
      }

      // rule 827.1.d (ven-087-166 Hextech Disc): "Disempower this" is payable
      // only while the host is [Empowered].
      if (cost.disempower === "self") {
        const hostMeta = context.cards.getCardMeta(cardId as CoreCardId) as
          | { empowered?: boolean }
          | undefined;
        if (hostMeta?.empowered !== true) {
          return false;
        }
      }

      // Rule 357.2 / 422.3: a "Discard N" cost requires ≥N cards in hand
      // at activation time; the caller names which card via `discardId`.
      const discardSpec = normalizeDiscardCost(cost.discard);
      if (discardSpec) {
        const hand = context.zones.getCardsInZone(
          "hand" as CoreZoneId,
          playerId as CorePlayerId,
        );
        // "Discard a gear" (ven-060-166) only counts cards of that type.
        const eligible = eligibleDiscardCards(hand, discardSpec);
        if (eligible.length < discardSpec.amount) {
          return false;
        }
        const discardId = context.params.discardId as string | undefined;
        if (discardId && !eligible.includes(discardId)) {
          return false;
        }
      }

      // rule-id: ogn-036-298 (rule 577.2 / 409) — a "Recycle N from your
      // trash" cost requires ≥N cards in the controller's trash; any named
      // `recycleIds` must all be in that trash.
      const recycleSpec = normalizeRecycleCost(cost.recycle);
      if (recycleSpec) {
        const trash = context.zones.getCardsInZone(
          "trash" as CoreZoneId,
          playerId as CorePlayerId,
        );
        const eligible = eligibleRecycleCards(trash, recycleSpec);
        if (eligible.length < recycleSpec.amount) {
          return false;
        }
        const recycleIds = context.params.recycleIds as string[] | undefined;
        if (
          recycleIds &&
          (recycleIds.length !== recycleSpec.amount ||
            !recycleIds.every((id) => eligible.includes(id)))
        ) {
          return false;
        }
      }

      // Rule 577.2: A [Kill] (sacrifice) cost requires a legal target on
      // the board matching the descriptor. Malzahar (ogn-113-298) is the
      // canonical case: exhaust + kill a friendly permanent → +2 rainbow.
      // The host card cannot pay its own kill cost — unless the cost is
      // literally "Kill this" (ogn-212-298 Forge of the Future), where the
      // host is the only legal sacrifice.
      if (cost.kill) {
        const sacrificeId = context.params.sacrificeId as string | undefined;
        const options =
          cost.kill === "self"
            ? [cardId as string]
            : // rule 577.2: enumerate EVERY legal sacrifice (quantity "all"),
              // else the default single pick may be the host itself.
              resolveTarget({ ...(cost.kill as TargetDescriptor), quantity: "all" }, {
                cards: context.cards,
                choosing: true,
                draft: state,
                playerId,
                sourceCardId: cardId,
                sourceZone: zone,
                zones: context.zones,
              }).filter((id) => id !== cardId);
        if (options.length === 0) {
          return false;
        }
        if (sacrificeId && !options.includes(sacrificeId)) {
          return false;
        }
      }
    }

    // Rule 355.8 / 355.10.c: an activated ability whose effect names a
    // caster-chosen target cannot be put on the chain when no legal
    // choice exists (e.g. Unlicensed Armory with zero friendly units).
    if (
      !spellEffectHasLegalTargets(ability.effect as SpellEffectTargetShape | undefined, {
        cards: context.cards,
        draft: state,
        playerId,
        sourceCardId: cardId,
        sourceZone: zone,
        zones: context.zones,
      })
    ) {
      return false;
    }

    // rule 402.3 (unl-045-219) — "move a DIFFERENT unit you control": with a
    // single unit the mover and the exhaust-payer would have to be the same
    // card, so the ability has no legal activation at all.
    const differentUnitMovers = exhaustedAllyMoveTargets(ability.effect, {
      cards: context.cards,
      choosing: true,
      draft: state,
      playerId,
      sourceCardId: cardId,
      sourceZone: zone,
      zones: context.zones,
    });
    if (differentUnitMovers) {
      if (differentUnitMovers.length === 0) {
        return false;
      }
      const named = (context.params.targets as string[] | undefined)?.[0];
      if (named !== undefined && !differentUnitMovers.includes(named)) {
        return false;
      }
    }

    // rule-id: sfd-052-221 (rule 355.14.b) — a supplied play-time target
    // must be one of the legal candidates for the effect's chosen target.
    const boundTargets = context.params.targets as string[] | undefined;
    if (boundTargets && boundTargets.length > 0) {
      const chosen = activationChosenTarget(ability.effect);
      if (!chosen) {
        return false;
      }
      const options = resolveTarget(
        { ...chosen, quantity: "all" },
        {
          cards: context.cards,
          choosing: true,
          draft: state,
          playerId,
          sourceCardId: cardId,
          sourceZone: zone,
          zones: context.zones,
        },
      );
      if (boundTargets.length !== 1 || !options.includes(boundTargets[0] as string)) {
        return false;
      }
      // rule 809.1.c (rule-id: sfd-120-221) — an opponent's Deflect object may
      // only be chosen when the extra Power is available on top of the cost.
      if (
        deflectSurchargeForActivation(state, playerId, boundTargets, context.cards) >
        deflectBudget(state, playerId, ability.cost as Record<string, unknown> | undefined)
      ) {
        return false;
      }
    }

    return true;
  },
  enumerator: (state, context) => {
    if (state.status !== "playing") {
      return [];
    }
    const playerId = context.playerId as string;
    // rule 429.3 / 444.2.c: mid-payment, only the paying player's Reaction
    // [Add] abilities are offered (the per-entry filter below keeps them).
    const payXPrompt =
      state.pendingChoice?.type === "pay-x" && state.pendingChoice.playerId === playerId;
    if (state.pendingChoice && !payXPrompt) {
      return [];
    }
    const interaction = state.interaction ?? createInteractionState();
    const turnState = getTurnState(interaction);
    const results: {
      playerId: string;
      cardId: string;
      abilityIndex: number;
      sourceCardId?: string;
      sacrificeId?: string;
      discardId?: string;
      targets?: string[];
    }[] = [];

    // Collect cards on base, battlefields, legendZone, battlefieldRow, and championZone
    // rule 477.1.a: a unit under this player's control may sit in ANOTHER
    // player's base/battlefield zone bucket (control changed, ownership did
    // not), so scan every player's board zones and filter by controller below.
    const allPlayerIds = Object.keys(state.players ?? {});
    const baseCards: CoreCardId[] = [];
    for (const pid of allPlayerIds) {
      baseCards.push(...context.zones.getCardsInZone("base" as CoreZoneId, pid as CorePlayerId));
    }
    const bfCards: CoreCardId[] = [];
    for (const bfId of Object.keys(state.battlefields ?? {})) {
      const bfZoneId = `battlefield-${bfId}` as CoreZoneId;
      for (const pid of allPlayerIds) {
        bfCards.push(...context.zones.getCardsInZone(bfZoneId, pid as CorePlayerId));
      }
    }
    const legendCards = context.zones.getCardsInZone(
      "legendZone" as CoreZoneId,
      playerId as CorePlayerId,
    );
    const battlefieldRowCards = context.zones.getCardsInZone(
      "battlefieldRow" as CoreZoneId,
      playerId as CorePlayerId,
    );
    const championZoneCards = context.zones.getCardsInZone(
      "championZone" as CoreZoneId,
      playerId as CorePlayerId,
    );

    // scanning every player's zone bucket can surface the same card twice
    // (zone stores that ignore the player argument), so dedupe.
    for (const cardId of [
      ...new Set([
        ...baseCards,
        ...bfCards,
        ...legendCards,
        ...battlefieldRowCards,
        ...championZoneCards,
      ]),
    ]) {
      const controller =
        (context.cards as { getCardController?: (id: CoreCardId) => string | undefined })
          .getCardController?.(cardId) ?? context.cards.getCardOwner(cardId);
      if (controller !== playerId) {
        continue;
      }

      const entries = collectActivatedAbilities(cardId as string, playerId, {
        battlefields: state.battlefields,
        cards: context.cards,
        zones: context.zones,
      });

      for (const entry of entries) {
        const { ability } = entry;

        // rule 605.2 / 429.3.a: mid-payment only resource-Adding abilities
        // (which resolve immediately, off the chain) may be used.
        if (payXPrompt) {
          if (!isImmediateAddEffect(ability.effect)) {
            continue;
          }
        }

        // Rule 728 / [Level N]: skip activated abilities whose while-level
        // condition is not yet met (e.g. Honeyfruit's Level-6 ability).
        const abilityCondition = (
          ability as { condition?: { type?: string; threshold?: number } }
        ).condition;
        if (abilityCondition?.type === "while-level") {
          if (!evaluateWhileLevel(state, playerId, abilityCondition.threshold ?? 0)) {
            continue;
          }
        }

        // Rule 580.3 (unl-160-219): "Use this ability only while I'm at a
        // battlefield" — skip when the host card is not at a battlefield.
        const abilityRestrictions = (ability as { restrictions?: readonly { type: string }[] })
          .restrictions;
        if (abilityRestrictions?.some((r) => r.type === "self-at-battlefield")) {
          const hostZone = context.zones.getCardZone(entry.hostCardId as CoreCardId) as
            | string
            | undefined;
          if (!hostZone?.startsWith("battlefield")) {
            continue;
          }
        }
        // rule 377.2.b: "Use only once per turn" — skip once used this turn.
        if (
          oncePerTurnExhausted(state, abilityRestrictions, entry.hostCardId as string, entry.abilityIndex)
        ) {
          continue;
        }
        // Rule 827.1.c.1: [Empower] — skip when the host is already Empowered.
        if (abilityRestrictions?.some((r) => r.type === "not-empowered")) {
          const hostMeta = context.cards.getCardMeta(entry.hostCardId as CoreCardId) as
            | { empowered?: boolean }
            | undefined;
          if (hostMeta?.empowered === true) {
            continue;
          }
        }

        // Check timing
        const timing = abilityTimingClass(
          ability as { keyword?: string; timing?: string },
          entry.hostCardId as string,
        );
        if (!isLegalTiming(timing, turnState)) {
          continue;
        }
        // rule 429.3 / 429.3.a: mid-payment the paying player acts regardless
        // of Focus / turn ownership.
        if (!payXPrompt) {
          // rule 316.5.b: Neutral Open State → only the Turn Player activates.
          if (turnState === "neutral-open" && state.turn.activePlayer !== playerId) {
            continue;
          }
          // rule 312.2.c-d: Closed State → only the Priority holder may act.
          if (!hasChainPriorityPermission(interaction, playerId)) {
            continue;
          }
          // rule 313.1 / 347: Showdown Open State → only the Focus holder acts.
          if (turnState === "showdown-open" && !hasShowdownPermission(interaction, playerId)) {
            continue;
          }
        }

        // Check cost affordability
        if (ability.cost) {
          const cost = ability.cost as Record<string, unknown>;
          const pool = state.runePools[playerId];
          if (!pool) {
            continue;
          }
          const energyCost = (cost.energy as number) ?? 0;
          // Rule 357.1.a: ready runes may be exhausted for energy during Pay
          // Costs, so count them toward affordability (parity with play* moves).
          const potentialEnergy = getPotentialRuneEnergy(
            context.zones,
            context.counters as { getFlag: (c: CoreCardId, f: string) => boolean | undefined },
            playerId,
          );
          if (pool.energy + potentialEnergy < energyCost) {
            continue;
          }
          const powerCost = cost.power as string[] | undefined;
          if (powerCost) {
            const needed: Record<string, number> = {};
            for (const d of powerCost) {
              needed[d] = (needed[d] ?? 0) + 1;
            }
            if (!canAffordPower(pool.power, needed)) {
              continue;
            }
          }

          // Rules 729-730: XP is a player resource, not a per-card counter.
          const xpCost = cost.xp as number | undefined;
          if (xpCost && xpCost > 0) {
            const have = state.players[playerId]?.xp ?? 0;
            if (have < xpCost) {
              continue;
            }
          }

          // Rule 577.2: An [Exhaust] cost cannot be paid if the host card
          // Is already exhausted. `entry.hostCardId` is the card that
          // Would pay the exhaust (the unit holding the ability).
          if (cost.exhaust) {
            const hostCardId = entry.hostCardId as CoreCardId;
            const {getFlag} = (
              context.counters as { getFlag?: (c: CoreCardId, f: string) => boolean }
            );
            if (getFlag && getFlag(hostCardId, "exhausted")) {
              continue;
            }
            const hostMeta = context.cards.getCardMeta(hostCardId) as
              | { exhausted?: boolean }
              | undefined;
            if (hostMeta?.exhausted === true) {
              continue;
            }
          }

          // rule 702.2.b.1 (ogn-164-298 Sett): "Spend my buff" needs a buff
          // on the host to pay with.
          if (cost.spend === "buff") {
            const hostMeta = context.cards.getCardMeta(entry.hostCardId as CoreCardId) as
              | { buffed?: boolean }
              | undefined;
            if (hostMeta?.buffed !== true) {
              continue;
            }
          }

          // rule 827.1.d (ven-087-166 Hextech Disc): a "Disempower this" cost
          // can only be paid by a host that is currently [Empowered].
          if (cost.disempower === "self") {
            const hostMeta = context.cards.getCardMeta(entry.hostCardId as CoreCardId) as
              | { empowered?: boolean }
              | undefined;
            if (hostMeta?.empowered !== true) {
              continue;
            }
          }
        }

        // Rule 357.2 / 422.3: a "Discard N" cost enumerates one activation
        // per hand card so the caller can pick which card to discard. Fewer
        // than N cards in hand → the ability is not activatable.
        let discardOptions: string[] | undefined;
        const discardSpec = normalizeDiscardCost(
          (ability.cost as Record<string, unknown> | undefined)?.discard,
        );
        if (discardSpec) {
          const hand = context.zones.getCardsInZone(
            "hand" as CoreZoneId,
            playerId as CorePlayerId,
          );
          const eligible = eligibleDiscardCards(hand, discardSpec);
          if (eligible.length < discardSpec.amount) {
            continue;
          }
          discardOptions = eligible;
        }

        // rule-id: ogn-036-298 (rule 577.2) — a "Recycle N from your trash"
        // cost is unpayable with fewer than N cards in trash.
        const recycleSpec = normalizeRecycleCost(
          (ability.cost as Record<string, unknown> | undefined)?.recycle,
        );
        if (recycleSpec) {
          const trash = context.zones.getCardsInZone(
            "trash" as CoreZoneId,
            playerId as CorePlayerId,
          );
          if (eligibleRecycleCards(trash, recycleSpec).length < recycleSpec.amount) {
            continue;
          }
        }

        // Rule 577.2: A [Kill] (sacrifice) cost enumerates one activation
        // per legal sacrifice target so the caller can pick which permanent
        // to trash. No legal target → the ability is not activatable.
        let sacrificeOptions: string[] | undefined;
        const killCost = (ability.cost as Record<string, unknown> | undefined)?.kill;
        if (killCost === "self") {
          // Rule 577.2 (ogn-212-298): "Kill this" — the host sacrifices itself.
          sacrificeOptions = [entry.hostCardId];
        } else if (killCost) {
          const hostZone = context.zones.getCardZone(entry.hostCardId as CoreCardId) as
            | string
            | undefined;
          // rule 577.2: list every legal sacrifice, not the default single pick.
          sacrificeOptions = resolveTarget({ ...(killCost as TargetDescriptor), quantity: "all" }, {
            cards: context.cards,
            choosing: true,
            draft: state,
            playerId,
            sourceCardId: entry.hostCardId,
            sourceZone: hostZone,
            zones: context.zones,
          }).filter((id) => id !== entry.hostCardId);
          if (sacrificeOptions.length === 0) {
            continue;
          }
        }

        // Rule 355.8 / 355.10.c: skip abilities whose caster-chosen effect
        // target has no legal choices on the current board.
        const hostZone = context.zones.getCardZone(entry.hostCardId as CoreCardId) as
          | string
          | undefined;
        if (
          !spellEffectHasLegalTargets(ability.effect as SpellEffectTargetShape | undefined, {
            cards: context.cards,
            draft: state,
            playerId,
            sourceCardId: entry.hostCardId,
            sourceZone: hostZone,
            zones: context.zones,
          })
        ) {
          continue;
        }

        // rule 402.3 (unl-045-219) — only units that leave some OTHER ready
        // unit free to pay the exhaust cost are movable.
        const exhaustAllyMovers = exhaustedAllyMoveTargets(ability.effect, {
          cards: context.cards,
          choosing: true,
          draft: state,
          playerId,
          sourceCardId: entry.hostCardId,
          sourceZone: hostZone,
          zones: context.zones,
        });
        if (exhaustAllyMovers && exhaustAllyMovers.length === 0) {
          continue;
        }

        // rule-id: sfd-052-221 (rule 355.10.f / 355.14.b) — enumerate one
        // activation per legal caster-chosen target so the choice is locked
        // when the ability is finalized on the chain, not at resolution.
        let targetOptions: string[] | undefined;
        const chosen = activationChosenTarget(ability.effect);
        if (chosen) {
          targetOptions = resolveTarget(
            { ...chosen, quantity: "all" },
            {
              cards: context.cards,
              choosing: true,
              draft: state,
              playerId,
              sourceCardId: entry.hostCardId,
              sourceZone: hostZone,
              zones: context.zones,
            },
          );
          if (exhaustAllyMovers) {
            targetOptions = targetOptions.filter((id) => exhaustAllyMovers.includes(id));
          }
          // rule 809.1.c (rule-id: sfd-120-221) — a Deflect object the chooser
          // cannot pay the surcharge for is not a legal choice.
          const budget = deflectBudget(
            state,
            playerId,
            ability.cost as Record<string, unknown> | undefined,
          );
          targetOptions = targetOptions.filter(
            (id) =>
              deflectSurchargeForActivation(state, playerId, [id as string], context.cards) <=
              budget,
          );
          if (targetOptions.length === 0) {
            continue;
          }
        }

        const result: {
          playerId: string;
          cardId: string;
          abilityIndex: number;
          sourceCardId?: string;
          sacrificeId?: string;
          discardId?: string;
          targets?: string[];
        } = {
          abilityIndex: entry.abilityIndex,
          cardId: entry.hostCardId,
          playerId,
        };
        if (entry.sourceCardId !== entry.hostCardId) {
          result.sourceCardId = entry.sourceCardId;
        }
        let bases: (typeof result)[] = sacrificeOptions
          ? sacrificeOptions.map((sacrificeId) => ({ ...result, sacrificeId }))
          : [result];
        if (targetOptions) {
          const withTargets: (typeof result)[] = [];
          for (const base of bases) {
            for (const targetId of targetOptions) {
              if (targetId === base.sacrificeId) {
                continue;
              }
              withTargets.push({ ...base, targets: [targetId] });
            }
          }
          bases = withTargets;
        }
        if (discardOptions) {
          for (const base of bases) {
            for (const discardId of discardOptions) {
              results.push({ ...base, discardId });
            }
          }
        } else {
          results.push(...bases);
        }
      }
    }
    return results;
  },
  reducer: (draft, context) => {
    const { playerId, cardId, abilityIndex, sourceCardId, sacrificeId, discardId } =
      context.params;

    const registry = getGlobalCardRegistry();
    // For inherited/copied abilities, look up the ability text from the
    // Source card, but pay the cost on the host card (`cardId`).
    const abilityLookupId = (sourceCardId as string | undefined) ?? cardId;
    const abilities = registry.getAbilities(abilityLookupId) ?? [];
    const ability = abilities[abilityIndex];
    if (!ability) {
      return;
    }

    // rule 377.2.b: record the use of a once-per-turn ability against the HOST
    // card before anything else — the allowance is spent on activation.
    const useRestrictions = (ability as { restrictions?: readonly { type: string }[] }).restrictions;
    if (useRestrictions?.some((r) => r.type === "once-per-turn")) {
      const counts = (draft as { turnEventCounts?: Record<string, number> });
      counts.turnEventCounts ??= {};
      const key = abilityUseKey(cardId as string, abilityIndex as number);
      counts.turnEventCounts[key] = (counts.turnEventCounts[key] ?? 0) + 1;
    }

    const xPay = abilityXPayment(
      ability.cost as Record<string, unknown> | undefined,
      context.params as Record<string, unknown>,
    );

    // rule 809.1.c / 809.1.c.1 (rule-id: sfd-120-221) — the Deflect surcharge
    // for choosing an opponent's Deflect object is a mandatory additional cost,
    // payable with Power of any Domain, and is owed even by a free ability.
    const deflectOwed = deflectSurchargeForActivation(
      draft,
      playerId,
      context.params.targets as string[] | undefined,
      context.cards,
    );
    if (deflectOwed > 0) {
      deductAbilityCost(
        draft,
        playerId,
        { power: Array.from({ length: deflectOwed }, () => "rainbow") },
        context.zones,
        context.counters,
      );
    }

    // Pay cost
    if (ability.cost) {
      const cost = ability.cost as Record<string, unknown>;
      deductAbilityCost(draft, playerId, cost, context.zones, context.counters);

      // rule 135.2.e.5.a: the chosen X leaves the pool as part of paying the
      // cost — [rainbow] out of Power of any Domain, otherwise out of Energy.
      if (xPay && xPay.amount > 0) {
        deductAbilityCost(
          draft,
          playerId,
          xPay.resource === "energy"
            ? { energy: xPay.amount }
            : { power: Array.from({ length: xPay.amount }, () => "rainbow") },
          context.zones,
          context.counters,
        );
      }

      // Handle exhaust cost — always exhaust the host card, never the
      // Source (Heimerdinger exhausts himself for an inherited ability).
      if (cost.exhaust) {
        context.counters.setFlag(cardId as CoreCardId, "exhausted", true);
      }

      // rule 702.2.b (ogn-164-298 Sett): spending a buff removes it; Might
      // readers look at top-level meta.buffed, so mirror the flag there.
      if (cost.spend === "buff") {
        context.counters.setFlag(cardId as CoreCardId, "buffed", false);
        context.cards.updateCardMeta(
          cardId as CoreCardId,
          { buffed: false } as Partial<RiftboundCardMeta>,
        );
      }

      // rule 827.1.d (ven-087-166 Hextech Disc): paying "Disempower this"
      // removes the host's [Empowered] state, re-enabling its [Empower] cost.
      if (cost.disempower === "self") {
        context.cards.updateCardMeta(
          cardId as CoreCardId,
          { empowered: false } as unknown as Partial<RiftboundCardMeta>,
        );
      }

      // rule 730.2: "Spend N XP" reduces the controlling player's XP — already
      // charged by the `deductAbilityCost(cost)` call above; charging it again
      // here would spend the XP twice.

      // Rule 357.2 / 422.3: pay the "Discard N" cost — the chosen hand
      // card is trashed before the ability is placed on the chain.
      if (cost.discard) {
        if (!discardId) {
          return;
        }
        // rule 422 / ogn-006-298: a discard paid as a cost is still a discard —
        // one choke point moves it and emits the `discard` event.
        const costCtx = buildEffectContext(draft, playerId, cardId, context);
        removeFromBoard(
          costCtx,
          [discardId as string],
          "trash",
          { by: playerId, kind: "discard", source: cardId as string, sourceKind: "ability" },
          costCtx.fireTriggers,
        );
      }

      // rule-id: ogn-036-298 (rule 577.2 / 409) — pay the "Recycle N from
      // your trash" cost: move N trash cards (caller-named via `recycleIds`,
      // else the top N) to the bottom of the main deck before chaining.
      const recycleSpec = normalizeRecycleCost(cost.recycle);
      if (recycleSpec) {
        const trash = context.zones.getCardsInZone(
          "trash" as CoreZoneId,
          playerId as CorePlayerId,
        );
        const eligible = eligibleRecycleCards(trash, recycleSpec);
        if (eligible.length < recycleSpec.amount) {
          return;
        }
        const named = context.params.recycleIds as string[] | undefined;
        const toRecycle =
          named && named.length === recycleSpec.amount
            ? named
            : (eligible.slice(0, recycleSpec.amount) as readonly string[]);
        // rule 416.5: cards recycled simultaneously go to the bottom in a
        // RANDOM order — the payer must not be able to stack the deck bottom
        // by choosing (or by relying on) the trash order.
        const ordered = [...toRecycle];
        for (let i = ordered.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const a = ordered[i] as string;
          const b = ordered[j] as string;
          ordered[i] = b;
          ordered[j] = a;
        }
        for (const id of ordered) {
          context.zones.moveCard({
            cardId: id as CoreCardId,
            position: "bottom",
            targetZoneId: "mainDeck" as CoreZoneId,
          });
        }
        // rule-id: ogn-235-298 — recycling to your Main Deck as a cost still
        // triggers "When you recycle one or more cards to your Main Deck".
        if (toRecycle.length > 0) {
          fireTriggers(
            { cardIds: [...toRecycle] as string[], playerId: playerId as string, type: "recycle" },
            { cards: context.cards, counters: context.counters, draft, zones: context.zones },
          );
        }
      }

      // Handle kill (sacrifice) cost — the chosen permanent is trashed as
      // part of paying the cost, before the effect resolves.
      if (cost.kill) {
        // Rule 577.2 (ogn-212-298): "Kill this" defaults to the host card.
        const killId = (sacrificeId as string | undefined) ?? (cost.kill === "self" ? cardId : undefined);
        if (!killId) {
          return;
        }
        // rule 428.1.a.1 — a kill paid as a cost is an Active Kill like any
        // other: die replacements may apply (357.2.a: still paid), Equipment
        // detaches (457.1), the card resets (124.1), a token ceases to exist
        // (186.1) and `die` fires with last-known information (Deathknell).
        const costCtx = buildEffectContext(draft, playerId, cardId, context);
        removeFromBoard(
          costCtx,
          [killId as string],
          "trash",
          { by: playerId, kind: "cost", source: cardId as string, sourceKind: "ability" },
          costCtx.fireTriggers,
        );
      }
    }

    // Rule 605.2: activated abilities that Add resources resolve immediately
    // and cannot be reacted to — do not open a chain for them.
    if (isImmediateAddEffect(ability.effect)) {
      const base = buildEffectContext(draft, playerId, cardId, context);
      // rule 429.1: "[Add] that much" reads the X that was just paid.
      const effectCtx = xPay ? { ...base, variables: { ...base.variables, x: xPay.amount } } : base;
      executeEffect(ability.effect as ExecutableEffect, effectCtx);
      // rule-id: sfd-075-221 — rule 429.2: an [Add] ability resolving
      // immediately is still an activated ability being USED, so "when you use
      // an activated ability of a gear" still sees it.
      fireTriggers(
        {
          cardId: cardId as string,
          playerId: playerId as string,
          sourceType: activationSourceType(cardId as string),
          type: "use-activated-ability",
        },
        { cards: context.cards, counters: context.counters, draft, zones: context.zones },
      );
      return;
    }

    // Add ability to chain. The chain item's `cardId` is the host so that
    // Effect execution's `sourceCardId` (used for self-targeting and
    // Location-relative targets) resolves to the host.
    const interaction = draft.interaction ?? createInteractionState();
    const turnOrder = Object.keys(draft.players);
    // rule-id: sfd-052-221 (rule 355.10.f / 355.14.b) — lock the caster-chosen
    // target on the chain item at finalization so resolution uses it instead
    // of prompting.
    const targets = context.params.targets as string[] | undefined;
    draft.interaction = addToChain(
      interaction,
      {
        cardId,
        controller: playerId,
        // rule 429.1: carry the paid X to resolution for `{variable:"x"}`.
        effect: xPay
          ? { ...(ability.effect as object), _variables: { x: xPay.amount } }
          : ability.effect,
        ...(targets && targets.length > 0 ? { targets } : {}),
        type: "ability",
      },
      turnOrder,
    );
    // rule-id: sfd-075-221 — rule 206.1: "when you use an activated ability"
    // fires as the ability is activated. Firing it AFTER `addToChain` puts the
    // trigger above the ability on the chain, so it resolves first.
    fireTriggers(
      {
        cardId: cardId as string,
        playerId: playerId as string,
        sourceType: activationSourceType(cardId as string),
        type: "use-activated-ability",
      },
      { cards: context.cards, counters: context.counters, draft, zones: context.zones },
    );
    // Rule 359.2: "when you choose me" triggers fire when the target is
    // chosen — at finalization for play-time targets (parity with playSpell).
    if (targets && targets.length > 0) {
      const trigCtx = { cards: context.cards, counters: context.counters, draft, zones: context.zones };
      for (const targetId of targets) {
        fireTriggers(
          { cardId: targetId, chooserId: playerId, sourceType: "ability", type: "choose" },
          trigCtx,
        );
      }
    }
    // rule 824.1.d: a Dependent ability becomes inactive "as soon as" its
    // condition stops holding — paying an XP/buff/exhaust cost can flip one off
    // while the ability is still on the chain, so re-evaluate statics now
    // rather than waiting for resolution.
    recalculateStaticEffects({
      cards: context.cards,
      draft,
      zones: context.zones,
    } as unknown as Parameters<typeof recalculateStaticEffects>[0]);
  },
};
