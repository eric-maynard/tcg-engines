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
  hasShowdownPermission,
  isLegalTiming,
} from "../../../chain";
import type { ExecutableEffect } from "../../../abilities/effect-executor";
import { executeEffect } from "../../../abilities/effect-executor";
import type { TargetDescriptor } from "../../../abilities/target-resolver";
import { resolveTarget } from "../../../abilities/target-resolver";
import { fireTriggers } from "../../../abilities/trigger-runner";
import { evaluateWhileLevel } from "../../../abilities/xp-conditions";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { getPotentialRuneEnergy } from "../play/cost";
import type { SpellEffectTargetShape } from "../play/targeting";
import { spellEffectHasLegalTargets } from "../play/targeting";
import { buildEffectContext, canAffordPower } from "./effect-context";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * rule 151.2: a Gear activated ability may be used only during its controller's
 * Main Phase in an Open State, never during a Showdown — unless the ability
 * itself is printed [Action]/[Reaction]. Classifying it as "standard" timing
 * gives exactly that through `isLegalTiming` (neutral-open only).
 */
function abilityTimingClass(
  ability: { keyword?: string; timing?: string },
  hostCardId: string,
): "standard" | "action" | "reaction" {
  if (ability.keyword === "Reaction" || ability.timing === "reaction") {
    return "reaction";
  }
  if (ability.keyword === "Action" || ability.timing === "action") {
    return "action";
  }
  return getGlobalCardRegistry().getCardType(hostCardId) === "gear" ? "standard" : "action";
}

/**
 * rule-id: sfd-052-221 (rule 355.10.f / 355.14.b) — an activated ability's
 * single caster-chosen card target ("Give a unit +3 Might") is chosen when
 * the ability is finalized on the chain, not when it resolves. Returns that
 * descriptor, or undefined when the effect has no such play-time choice
 * (self / player / battlefield / "all" / multi-pick targets stay as-is).
 */
function activationChosenTarget(effect: unknown): TargetDescriptor | undefined {
  const t = (effect as { target?: unknown } | undefined)?.target;
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
  push(ctx.zones.getCardsInZone("championZone" as CoreZoneId, playerId as CorePlayerId));
  for (const bfId of Object.keys(ctx.battlefields)) {
    push(ctx.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId, playerId as CorePlayerId));
  }
  return collected;
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
    if (state.pendingChoice) {
      return false;
    }

    const { playerId, cardId, abilityIndex, sourceCardId } = context.params;

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

    // Must be controlled by the player
    const owner = context.cards.getCardOwner(cardId as CoreCardId);
    if (owner !== playerId) {
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
    // rule 316.5.b: in a Neutral Open State only the Turn Player may
    // activate abilities ([Reaction] adds Closed States, not this one).
    if (turnState === "neutral-open" && state.turn.activePlayer !== playerId) {
      return false;
    }
    // rule 313.1 / 347: in a Showdown Open State only the Focus holder acts.
    if (turnState === "showdown-open" && !hasShowdownPermission(interaction, playerId)) {
      return false;
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

      // Rule 357.2 / 422.3: a "Discard N" cost requires ≥N cards in hand
      // at activation time; the caller names which card via `discardId`.
      const discardCost = cost.discard as number | undefined;
      if (discardCost && discardCost > 0) {
        const hand = context.zones.getCardsInZone(
          "hand" as CoreZoneId,
          playerId as CorePlayerId,
        );
        if (hand.length < discardCost) {
          return false;
        }
        const discardId = context.params.discardId as string | undefined;
        if (discardId && !hand.includes(discardId as CoreCardId)) {
          return false;
        }
      }

      // rule-id: ogn-036-298 (rule 577.2 / 409) — a "Recycle N from your
      // trash" cost requires ≥N cards in the controller's trash; any named
      // `recycleIds` must all be in that trash.
      const recycleCost = cost.recycle as number | undefined;
      if (recycleCost && recycleCost > 0) {
        const trash = context.zones.getCardsInZone(
          "trash" as CoreZoneId,
          playerId as CorePlayerId,
        );
        if (trash.length < recycleCost) {
          return false;
        }
        const recycleIds = context.params.recycleIds as string[] | undefined;
        if (
          recycleIds &&
          (recycleIds.length !== recycleCost ||
            !recycleIds.every((id) => trash.includes(id as CoreCardId)))
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
    const playerId = context.playerId as string;
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
    const baseCards = context.zones.getCardsInZone(
      "base" as CoreZoneId,
      playerId as CorePlayerId,
    );
    const bfCards: CoreCardId[] = [];
    for (const bfId of Object.keys(state.battlefields ?? {})) {
      const bfZoneId = `battlefield-${bfId}` as CoreZoneId;
      const cards = context.zones.getCardsInZone(bfZoneId, playerId as CorePlayerId);
      bfCards.push(...cards);
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

    for (const cardId of [
      ...baseCards,
      ...bfCards,
      ...legendCards,
      ...battlefieldRowCards,
      ...championZoneCards,
    ]) {
      const owner = context.cards.getCardOwner(cardId);
      if (owner !== playerId) {
        continue;
      }

      const entries = collectActivatedAbilities(cardId as string, playerId, {
        battlefields: state.battlefields,
        cards: context.cards,
        zones: context.zones,
      });

      for (const entry of entries) {
        const { ability } = entry;

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
        // rule 316.5.b: Neutral Open State → only the Turn Player activates.
        if (turnState === "neutral-open" && state.turn.activePlayer !== playerId) {
          continue;
        }
        // rule 313.1 / 347: Showdown Open State → only the Focus holder acts.
        if (turnState === "showdown-open" && !hasShowdownPermission(interaction, playerId)) {
          continue;
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
        }

        // Rule 357.2 / 422.3: a "Discard N" cost enumerates one activation
        // per hand card so the caller can pick which card to discard. Fewer
        // than N cards in hand → the ability is not activatable.
        let discardOptions: string[] | undefined;
        const discardCost = (ability.cost as Record<string, unknown> | undefined)?.discard as
          | number
          | undefined;
        if (discardCost && discardCost > 0) {
          const hand = context.zones.getCardsInZone(
            "hand" as CoreZoneId,
            playerId as CorePlayerId,
          );
          if (hand.length < discardCost) {
            continue;
          }
          discardOptions = [...hand] as string[];
        }

        // rule-id: ogn-036-298 (rule 577.2) — a "Recycle N from your trash"
        // cost is unpayable with fewer than N cards in trash.
        const recycleCost = (ability.cost as Record<string, unknown> | undefined)?.recycle as
          | number
          | undefined;
        if (recycleCost && recycleCost > 0) {
          const trash = context.zones.getCardsInZone(
            "trash" as CoreZoneId,
            playerId as CorePlayerId,
          );
          if (trash.length < recycleCost) {
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

    // Pay cost
    if (ability.cost) {
      const cost = ability.cost as Record<string, unknown>;
      deductAbilityCost(draft, playerId, cost, context.zones, context.counters);

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

      // Rule 730.2: "Spend N XP" reduces the controlling player's XP.
      const xpCost = cost.xp as number | undefined;
      if (xpCost && xpCost > 0) {
        const player = draft.players[playerId];
        if (player) {
          player.xp = Math.max(0, (player.xp ?? 0) - xpCost);
        }
      }

      // Rule 357.2 / 422.3: pay the "Discard N" cost — the chosen hand
      // card is trashed before the ability is placed on the chain.
      if (cost.discard) {
        if (!discardId) {
          return;
        }
        context.zones.moveCard({
          cardId: discardId as CoreCardId,
          targetZoneId: "trash" as CoreZoneId,
        });
        // Rule ogn-006-298: emit the discard event for the paid-as-cost card.
        fireTriggers(
          { cardId: discardId as string, playerId, type: "discard" },
          { cards: context.cards, counters: context.counters, draft, zones: context.zones },
        );
      }

      // rule-id: ogn-036-298 (rule 577.2 / 409) — pay the "Recycle N from
      // your trash" cost: move N trash cards (caller-named via `recycleIds`,
      // else the top N) to the bottom of the main deck before chaining.
      const recycleCost = cost.recycle as number | undefined;
      if (recycleCost && recycleCost > 0) {
        const trash = context.zones.getCardsInZone(
          "trash" as CoreZoneId,
          playerId as CorePlayerId,
        );
        if (trash.length < recycleCost) {
          return;
        }
        const named = context.params.recycleIds as string[] | undefined;
        const toRecycle =
          named && named.length === recycleCost
            ? named
            : (trash.slice(0, recycleCost) as readonly string[]);
        for (const id of toRecycle) {
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
        context.zones.moveCard({
          cardId: killId as CoreCardId,
          targetZoneId: "trash" as CoreZoneId,
        });
      }
    }

    // Rule 605.2: activated abilities that Add resources resolve immediately
    // and cannot be reacted to — do not open a chain for them.
    const effectType = (ability.effect as { type?: string } | undefined)?.type;
    if (effectType === "add-resource" || effectType === "add") {
      const effectCtx = buildEffectContext(draft, playerId, cardId, context);
      executeEffect(ability.effect as ExecutableEffect, effectCtx);
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
        effect: ability.effect,
        ...(targets && targets.length > 0 ? { targets } : {}),
        type: "ability",
      },
      turnOrder,
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
  },
};
