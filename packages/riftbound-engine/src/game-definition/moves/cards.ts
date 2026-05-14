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
import type { GameEvent } from "../../abilities/game-events";
import type { TriggerRunnerContext } from "../../abilities/trigger-runner";
import { dispatchEvent } from "../../events/dispatcher";
import { resolveTarget } from "../../abilities/target-resolver";
import {
  addToChain,
  createInteractionState,
  getPriorityHolder,
  getTurnState,
  isLegalTiming,
} from "../../chain";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import {
  type CostReductionContext,
  applyStaticCostReduction,
  computeStaticCostReduction,
} from "../../operations/static-cost-reduction";
import { canPlayViaAmbush, hasteEntersExhausted } from "../../keywords/keyword-effects";
import { evaluateLegionCondition } from "../../abilities/legion-conditions";
import {
  extractBattlefieldId,
  getBattlefieldZoneId,
  getFacedownZoneId,
  isBattlefieldZone,
} from "../../zones/zone-configs";

/**
 * Play / hide events emitted by the card-play moves flow through the
 * unified event-bus chokepoint (`events/dispatcher.ts#dispatchEvent`)
 * rather than calling the trigger runner ad-hoc. The old `fireTriggers`
 * call sites kept the `(event, ctx)` signature; `dispatchEvent` is
 * `(ctx, event)` — this thin adapter preserves the call-site shape while
 * routing the emission through the bus (so an attached event log / any
 * future centralised event handling sees these too).
 */
function fireTriggers(event: GameEvent, ctx: TriggerRunnerContext): number {
  return dispatchEvent(ctx, event);
}

/**
 * Phase B batch 26 HHH: subset-emission helpers for `playSpell` enumeration.
 *
 * Multi-target spells (`{ upTo: N }`, `{ atLeast: N }`, numeric N>1) enumerate
 * ONE legal-move per legal target SUBSET so SPAs can drive a multi-pick UX
 * by inspecting `legalMoves`. To prevent combinatorial blowup (e.g. upTo:3
 * over 20 candidates ≈ 1.4k subsets) we cap total subsets per spell at
 * MAX_SUBSETS. When a kind would exceed the cap the enumerator falls back
 * to a single "select-all" move whose params carry a `_truncated: true`
 * hint flag.
 */
const MAX_SUBSETS = 64;

/**
 * Enumerate every subset of `items` whose size lies in `[lo, hi]` (inclusive),
 * stopping early and returning `null` if the count would exceed `cap`.
 *
 * Pure function — no per-card branching. Order is deterministic (size-ascending,
 * left-to-right within a size) so tests can pin tuple shape if needed.
 */
function subsetsOfSizes(
  items: readonly string[],
  lo: number,
  hi: number,
  cap: number,
): string[][] | null {
  const out: string[][] = [];
  const n = items.length;
  const loC = Math.max(0, lo);
  const hiC = Math.min(n, hi);
  if (loC > hiC) {
    return out;
  }
  for (let size = loC; size <= hiC; size++) {
    // Generate combinations of `items` of length `size` lexicographically.
    if (size === 0) {
      out.push([]);
      if (out.length > cap) {return null;}
      continue;
    }
    const idx = Array.from({ length: size }, (_, i) => i);
    while (true) {
      out.push(idx.map((i) => items[i] as string));
      if (out.length > cap) {return null;}
      // Advance idx to next combination
      let i = size - 1;
      while (i >= 0 && idx[i] === n - size + i) {i--;}
      if (i < 0) {break;}
      idx[i] = (idx[i] as number) + 1;
      for (let j = i + 1; j < size; j++) {idx[j] = (idx[j - 1] as number) + 1;}
    }
  }
  return out;
}

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
 * Detect a "Legion play-from-trash" alternate-play permission (rule 724 +
 * rule 555).
 *
 * Cards like Undying Legion carry
 * `{ type: "keyword", keyword: "Legion", effect: { type: "play",
 *    from: "trash", target: { type: "unit", ... } } }` — a [Legion][>]
 * ability that lets the owner play the card from their trash for the
 * printed alternate cost (which, for the known Unleashed card, equals the
 * card's normal `energyCost`/`domain`, so the standard cost path applies).
 *
 * Returns `true` when the card has such an ability AND it would play a
 * unit (i.e. the [>] play-permission applies to playing it as a unit).
 */
function hasLegionPlayFromTrash(cardId: string): boolean {
  const registry = getGlobalCardRegistry();
  for (const ability of registry.getAbilities(cardId) ?? []) {
    if (ability.type !== "keyword" || ability.keyword !== "Legion") {
      continue;
    }
    const {effect} = (ability as { effect?: { type?: string; from?: string } });
    if (effect && effect.type === "play" && effect.from === "trash") {
      return true;
    }
  }
  return false;
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
  const cost = registry.getSpellRepeatCost(cardId);
  if (!cost) {
    return 0;
  }
  return (cost.energy ?? 0) * repeatCount;
}

/**
 * Compute the effective energy cost to deduct for `cardId` at this moment.
 * Shared by `canAffordCard` (check) and `deductCost` (apply).
 *
 * Combines: printed base + per-card `costModifier` meta (one-shot triggers
 * like Legion "I cost N less" land here) + interactive reduction +
 * **static cost-reduction** scanned from the player's permanents (rule 466
 * — aura-style "your spells cost N less") + X surcharge + Repeat surcharge.
 *
 * Static cost-reduction is gated behind `boardCtx` — callers in flows that
 * have a zones/cards context (move reducers/conditions) pass it through;
 * paths that don't (legacy ad-hoc tests) get the old behaviour.
 */
function computeEffectiveEnergyCost(
  cardId: string,
  baseEnergy: number,
  extras: CostExtras,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
  boardCtx?: CostReductionContext,
  playerId?: string,
): number {
  const modifier = getCostModifier(cardId, getCardMeta);
  const interactive = getInteractiveReduction(cardId, extras.chosenTargetId, getCardMeta);
  const xAmount = Math.max(0, extras.xAmount ?? 0);
  const repeatSurcharge = getRepeatEnergySurcharge(cardId, Math.max(0, extras.repeatCount ?? 0));
  // Step 1: base + per-card meta-modifier + interactive reduction.
  const beforeStatic =
    Math.max(0, baseEnergy + modifier - interactive) + xAmount + repeatSurcharge;
  // Step 2: scan player's permanents for static cost-reductions and clamp
  // To each aura's minimum (and to ≥0).
  if (boardCtx && playerId) {
    const staticRed = computeStaticCostReduction(boardCtx, playerId, cardId);
    if (staticRed.reduction > 0) {
      return applyStaticCostReduction(beforeStatic, staticRed);
    }
  }
  return beforeStatic;
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
  boardCtx?: CostReductionContext,
): boolean {
  const registry = getGlobalCardRegistry();
  const pool = state.runePools[playerId];
  if (!pool) {
    return false;
  }

  const baseCost = registry.getCostToDeduct(cardId);
  const adjustedEnergy = computeEffectiveEnergyCost(
    cardId,
    baseCost.energy,
    extras,
    getCardMeta,
    boardCtx,
    playerId,
  );

  if (pool.energy < adjustedEnergy) {
    return false;
  }

  // Check power (domain requirements are not affected by cost modifiers)
  for (const [domain, amount] of Object.entries(baseCost.power)) {
    const available = pool.power[domain as keyof typeof pool.power] ?? 0;
    if (available < (amount ?? 0)) {
      return false;
    }
  }

  const deflectCost = getDeflectSurcharge(state, playerId, extras.targets);
  if (deflectCost > 0) {
    const remainingEnergy = pool.energy - adjustedEnergy;
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
  boardCtx?: CostReductionContext,
): void {
  const registry = getGlobalCardRegistry();
  const cost = registry.getCostToDeduct(cardId);
  const pool = draft.runePools[playerId];
  if (!pool) {
    return;
  }

  const adjustedEnergy = computeEffectiveEnergyCost(
    cardId,
    cost.energy,
    extras,
    getCardMeta,
    boardCtx,
    playerId,
  );

  pool.energy = Math.max(0, pool.energy - adjustedEnergy);
  for (const [domain, amount] of Object.entries(cost.power)) {
    if (amount && amount > 0) {
      const key = domain as keyof typeof pool.power;
      pool.power[key] = Math.max(0, (pool.power[key] ?? 0) - amount);
    }
  }

  const deflectCost = getDeflectSurcharge(draft, playerId, extras.targets);
  if (deflectCost > 0) {
    pool.energy = Math.max(0, pool.energy - deflectCost);
  }
}

/**
 * Build a `CostReductionContext` from a move reducer/condition `context`.
 * Centralised so all callers thread the same shape into `canAffordCard` /
 * `deductCost`. Pure pass-through — no new state.
 */
function buildBoardCtx(
  draft: RiftboundGameState,
  context: { zones: { getCardsInZone: (z: CoreZoneId, p?: CorePlayerId) => readonly CoreCardId[] }; cards: { getCardMeta: (id: CoreCardId) => unknown; getCardOwner: (id: CoreCardId) => string | undefined; getCardController?: (id: CoreCardId) => string | undefined; updateCardMeta: (id: CoreCardId, m: Partial<RiftboundCardMeta>) => void } },
): CostReductionContext {
  return {
    cards: {
      getCardController: context.cards.getCardController,
      getCardMeta: (id) =>
        context.cards.getCardMeta(id) as Partial<RiftboundCardMeta> | undefined,
      getCardOwner: context.cards.getCardOwner,
      updateCardMeta: context.cards.updateCardMeta,
    },
    draft,
    zones: {
      getCardsInZone: (z, p) => context.zones.getCardsInZone(z, p),
    },
  };
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
      const isLegionTrashPlay =
        zone === "trash" && hasLegionPlayFromTrash(context.params.cardId);
      if (zone !== "hand" && !isLegionTrashPlay) {
        return false;
      }

      // Rule 103 / 555: only the card's owner may play it.
      const owner = context.cards.getCardOwner(context.params.cardId as CoreCardId);
      if (owner !== context.params.playerId) {
        return false;
      }

      // Rule 724 (Legion) [>] play-from-trash permission (e.g. Undying
      // Legion): only legal when the owner has played another card this
      // Turn, on their own turn during the main phase, to their base.
      if (isLegionTrashPlay) {
        if (
          !evaluateLegionCondition(
            state,
            context.params.playerId as Parameters<typeof evaluateLegionCondition>[1],
          )
        ) {
          return false;
        }
        if (state.turn.activePlayer !== context.params.playerId) {
          return false;
        }
        if (state.turn.phase !== "main") {
          return false;
        }
        const trashLocation = context.params.location as string | undefined;
        if (trashLocation && isBattlefieldZone(trashLocation)) {
          // Undying Legion's [>] permission plays it to base, not a bf.
          return false;
        }
        if (
          !canAffordCard(
            state,
            context.params.playerId,
            context.params.cardId,
            {},
            createMetaAccessor(context.cards),
            buildBoardCtx(state, context),
          )
        ) {
          return false;
        }
        return true;
      }

      // Rule 577.3.c (Ambush): a unit with Ambush may be played to a
      // Battlefield where the player has friendly units, as a Reaction.
      // Otherwise the unit must be played on its controller's turn during
      // The main phase to the player's base.
      const location = context.params.location as string | undefined;
      const targetIsBattlefield = Boolean(location) && isBattlefieldZone(location as string);
      const registry = getGlobalCardRegistry();
      const hasAmbush = registry.hasKeyword(context.params.cardId, "Ambush");

      if (targetIsBattlefield) {
        // Ambush path: relax phase / active-player gating and permit the
        // Unit to be played directly to the target battlefield.
        if (!hasAmbush) {
          return false;
        }
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
      }

      if (
        !canAffordCard(
          state,
          context.params.playerId,
          context.params.cardId,
          {},
          createMetaAccessor(context.cards),
          buildBoardCtx(state, context),
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

      const registry = getGlobalCardRegistry();
      const pool = state.runePools[context.playerId as string];
      if (!pool) {
        return [];
      }

      const handCards = context.zones.getCardsInZone(
        "hand" as CoreZoneId,
        context.playerId as CorePlayerId,
      );

      // Standard play path: enumerated only on the player's own turn during
      // The main phase (rule 554), playing to base.
      const isOwnMainPhase =
        state.turn.activePlayer === (context.playerId as string) && state.turn.phase === "main";

      // Rule 822 (Ambush): an Ambush unit "may be played to a battlefield
      // Where you control Units" and "has [Reaction] as long as I'm being
      // Played to a battlefield where you control Units." So an Ambush unit
      // Is also playable to any such battlefield during a Reaction window —
      // Off-turn, outside the main phase, etc. — provided the player
      // Controls at least one unit there.
      const battlefieldIds = Object.keys(state.battlefields ?? {});

      const results: { playerId: string; cardId: string; location: string }[] = [];
      for (const cardId of handCards) {
        const def = registry.get(cardId as string);
        if (!def || def.cardType !== "unit") {
          continue;
        }
        if (!registry.canAfford(cardId as string, pool)) {
          continue;
        }

        if (isOwnMainPhase) {
          results.push({
            cardId: cardId as string,
            location: "base",
            playerId: context.playerId as string,
          });
        }

        // Ambush battlefield plays — always available (rule 822: Reaction
        // Timing is always legal) at battlefields where the player controls
        // A unit.
        if (registry.hasKeyword(cardId as string, "Ambush")) {
          for (const bfId of battlefieldIds) {
            const bfZoneId = getBattlefieldZoneId(bfId);
            const unitsAtBf = context.zones.getCardsInZone(
              bfZoneId as CoreZoneId,
              context.playerId as CorePlayerId,
            );
            if (unitsAtBf.length > 0) {
              results.push({
                cardId: cardId as string,
                location: bfZoneId,
                playerId: context.playerId as string,
              });
            }
          }
        }
      }

      // Rule 724 (Legion) [>] play-from-trash permission (e.g. Undying
      // Legion): on the player's own main phase, with another card already
      // Played this turn, a unit in the trash that carries a
      // `{keyword:"Legion", effect:{type:"play", from:"trash"}}` ability may
      // Be played to base for its printed alternate cost.
      if (
        isOwnMainPhase &&
        evaluateLegionCondition(
          state,
          context.playerId as Parameters<typeof evaluateLegionCondition>[1],
        )
      ) {
        const trashCards = context.zones.getCardsInZone(
          "trash" as CoreZoneId,
          context.playerId as CorePlayerId,
        );
        for (const cardId of trashCards) {
          const def = registry.get(cardId as string);
          if (!def || def.cardType !== "unit") {
            continue;
          }
          if (!hasLegionPlayFromTrash(cardId as string)) {
            continue;
          }
          if (!registry.canAfford(cardId as string, pool)) {
            continue;
          }
          results.push({
            cardId: cardId as string,
            location: "base",
            playerId: context.playerId as string,
          });
        }
      }
      return results;
    },
    reducer: (draft, context) => {
      const { cardId, playerId, location } = context.params;
      const { zones, counters } = context;

      deductCost(
        draft,
        playerId,
        cardId,
        {},
        createMetaAccessor(context.cards),
        buildBoardCtx(draft, context),
      );

      zones.moveCard({
        cardId: cardId as CoreCardId,
        targetZoneId: location as CoreZoneId,
      });

      // Units normally enter play exhausted (rule 554). Haste units enter
      // Ready and can act immediately (rule 719).
      const registry = getGlobalCardRegistry();
      const unitHasHaste = registry.hasKeyword(cardId, "Haste");
      counters.setFlag(cardId as CoreCardId, "exhausted", hasteEntersExhausted(unitHasHaste));

      // Fire "play-self" and "play-card" triggers BEFORE incrementing the
      // Rule-724 counter, so a Legion trigger on this card itself cannot
      // Satisfy its own condition — it must observe the count of cards
      // That were played EARLIER in this turn.
      fireTriggers(
        { cardId, playerId, type: "play-self" },
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
          buildBoardCtx(state, context),
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

      const registry = getGlobalCardRegistry();
      const pool = state.runePools[context.playerId as string];
      if (!pool) {
        return [];
      }

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
        if (!registry.canAfford(cardId as string, pool)) {
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

      deductCost(
        draft,
        playerId,
        cardId,
        { chosenTargetId },
        createMetaAccessor(context.cards),
        buildBoardCtx(draft, context),
      );

      zones.moveCard({
        cardId: cardId as CoreCardId,
        targetZoneId: "base" as CoreZoneId,
      });

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
      if (zone !== "hand") {
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
            xAmount: context.params.xAmount,
          },
          createMetaAccessor(context.cards),
          buildBoardCtx(state, context),
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
      // Priority, so only they may play an Action-timed spell.
      if (timing === "action" && turnState === "neutral-open") {
        if (state.turn.activePlayer !== context.params.playerId) {
          return false;
        }
      }

      // Rules 510 / 530 / 543.x — once a chain or showdown is ongoing, only
      // The player who currently holds Priority (chain) / Focus (showdown) may
      // Add to the chain. A Reaction spell is *not* free for anyone to play
      // Mid-chain; it waits for that player's window. (Neutral Open is gated
      // By the rule-530 check above; `getPriorityHolder` returns null there.)
      const priorityHolder = getPriorityHolder(interaction);
      if (priorityHolder !== null && priorityHolder !== context.params.playerId) {
        return false;
      }

      // Rule 537: Check that required targets exist before allowing the spell
      const abilities = registry.getAbilities(context.params.cardId) ?? [];
      const spellAbility = abilities.find((a: { type: string }) => a.type === "spell");
      const effect = spellAbility?.effect as { target?: { type: string } } | undefined;
      if (effect?.target && effect.target.type !== "self") {
        const resolved = resolveTarget(
          effect.target as {
            type: string;
            controller?: "friendly" | "enemy" | "any";
            location?: string;
            quantity?: number | "all";
          },
          {
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
          },
        );
        if (resolved.length === 0) {
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

      const registry = getGlobalCardRegistry();
      const interaction = state.interaction ?? createInteractionState();
      const turnState = getTurnState(interaction);
      const pool = state.runePools[context.playerId as string];
      if (!pool) {
        return [];
      }

      const handCards = context.zones.getCardsInZone(
        "hand" as CoreZoneId,
        context.playerId as CorePlayerId,
      );

      const results: {
        playerId: string;
        cardId: string;
        targets?: string[];
        // Phase B batch 26 HHH: when subset enumeration would blow past
        // MAX_SUBSETS, we collapse to a single "select-all" move and set
        // This hint flag so UIs can render a multi-pick affordance instead
        // Of an exploded subset list. Engine apply-time validation ignores
        // This field (it's not part of the typed playSpell params).
        _truncated?: boolean;
      }[] = [];
      for (const cardId of handCards) {
        const def = registry.get(cardId as string);
        if (!def || def.cardType !== "spell") {
          continue;
        }
        if (!registry.canAfford(cardId as string, pool)) {
          continue;
        }

        // Check spell timing is legal in current turn state (rule 553)
        const timing = (registry.getSpellTiming(cardId as string) ?? "action") as
          | "action"
          | "reaction";
        if (!isLegalTiming(timing, turnState)) {
          continue;
        }

        // Phase B batch 25 DDD: emit one legal-move per legal target tuple,
        // Mirroring how `playUnit` enumerates per `{cardId, location}`. This
        // Lets UIs (TargetPicker) restrict the picker to engine-validated
        // Targets rather than every battlefield unit.
        //
        // Rules:
        //   - No target descriptor          → 1 move, targets: []
        //   - Self-target descriptor        → 1 move, targets: [] (implicit)
        //   - Non-self target descriptor    → 1 move per legal target id;
        //                                     0 candidates ⇒ no move (rule 537)
        const abilities = registry.getAbilities(cardId as string) ?? [];
        const spellAbility = abilities.find((a: { type: string }) => a.type === "spell");
        const effect = spellAbility?.effect as { target?: { type: string } } | undefined;
        const targetDescriptor = effect?.target;

        if (!targetDescriptor || targetDescriptor.type === "self") {
          results.push({
            cardId: cardId as string,
            playerId: context.playerId as string,
            targets: [],
          });
          continue;
        }

        // To enumerate one tuple per legal CHOICE, ask the resolver for the
        // FULL candidate set (override `quantity: "all"`) — the resolver's
        // Default quantity=1 would silently keep only the first id. We then
        // Decide tuple shape based on the original descriptor's quantity.
        const fullCandidates = resolveTarget(
          {
            ...(targetDescriptor as Record<string, unknown>),
            quantity: "all",
          } as {
            type: string;
            controller?: "friendly" | "enemy" | "any";
            location?: string;
            quantity?: number | "all";
          },
          {
            cards: {
              getCardOwner: (c) => context.cards.getCardOwner(c),
            },
            draft: state,
            playerId: context.playerId as string,
            sourceCardId: cardId as string,
            zones: {
              getCardZone: (c) => context.zones.getCardZone(c),
              getCardsInZone: (z, p) => context.zones.getCardsInZone(z, p),
            },
          },
        );
        if (fullCandidates.length === 0) {
          continue; // Rule 537: no legal target ⇒ spell is not playable
        }
        // Phase B batch 26 HHH: per-subset enumeration for multi-target spells.
        //
        // Quantity kinds and emission formula:
        //   - undefined / 1 / single-target  → one move per legal candidate (sizes-1 only)
        //   - "all"                          → one move with the full candidate set
        //   - { upTo: N }                    → every subset of sizes 0..min(N, K)
        //   - { atLeast: N }                 → every subset of sizes min(N,K)..K
        //   - numeric N (N > 1)              → every subset of EXACTLY size min(N, K)
        // Where K = fullCandidates.length.
        //
        // To prevent combinatorial blowup we cap total emitted subsets per
        // Spell at MAX_SUBSETS. If a kind would emit more than that we fall
        // Back to a single "select-all" move with `_truncated: true` so UIs
        // Can render a multi-pick affordance instead of an exploded subset
        // List. Apply-time validation accepts any subset of legal IDs, so
        // Truncation never blocks a legal play.
        const qty = (targetDescriptor as { quantity?: unknown }).quantity;
        const K = fullCandidates.length;
        const cardIdStr = cardId as string;
        const playerIdStr = context.playerId as string;

        type Subset = readonly string[];
        const emitSubsets = (subsets: Subset[]): void => {
          for (const s of subsets) {
            results.push({
              cardId: cardIdStr,
              playerId: playerIdStr,
              targets: [...s],
            });
          }
        };
        const emitTruncated = (): void => {
          results.push({
            _truncated: true,
            cardId: cardIdStr,
            playerId: playerIdStr,
            targets: fullCandidates,
          });
        };

        if (qty === "all") {
          // Single tuple with every legal id.
          results.push({
            cardId: cardIdStr,
            playerId: playerIdStr,
            targets: fullCandidates,
          });
        } else if (
          typeof qty === "object" &&
          qty !== null &&
          ("upTo" in qty || "atLeast" in qty)
        ) {
          const {upTo} = (qty as { upTo?: number });
          const {atLeast} = (qty as { atLeast?: number });
          const lo = typeof atLeast === "number" ? Math.max(0, Math.min(atLeast, K)) : 0;
          const hi = typeof upTo === "number" ? Math.max(0, Math.min(upTo, K)) : K;
          const subsets = subsetsOfSizes(fullCandidates, lo, hi, MAX_SUBSETS);
          if (subsets === null) {
            emitTruncated();
          } else {
            emitSubsets(subsets);
            // The largest legal subset (`hi`) is already enumerated, so we
            // Intentionally do NOT emit an extra "select-all" move here —
            // That would duplicate (for { atLeast }) or be illegal (for
            // { upTo: N } where K > N). UIs can use the size-`hi` subset
            // As the "max" affordance.
          }
        } else if (typeof qty === "number" && qty > 1) {
          const n = Math.min(qty, K);
          const subsets = subsetsOfSizes(fullCandidates, n, n, MAX_SUBSETS);
          if (subsets === null) {
            emitTruncated();
          } else {
            emitSubsets(subsets);
          }
        } else {
          // Default: single-target spell — one tuple per legal candidate.
          for (const targetId of fullCandidates) {
            results.push({
              cardId: cardIdStr,
              playerId: playerIdStr,
              targets: [targetId],
            });
          }
        }
      }
      return results;
    },
    reducer: (draft, context) => {
      const { cardId, playerId, targets, xAmount, repeatCount } = context.params;
      const { zones } = context;

      const repeatN = Math.max(0, repeatCount ?? 0);
      deductCost(
        draft,
        playerId,
        cardId,
        { repeatCount: repeatN, targets, xAmount },
        createMetaAccessor(context.cards),
        buildBoardCtx(draft, context),
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
      const newChainItemId = `chain-${interaction.nextChainItemId}`;
      draft.interaction = addToChain(
        interaction,
        { cardId, controller: playerId, effect: effectToStore, type: "spell" },
        turnOrder,
      );
      // Engine-bus event: a new (spell) item was added to the chain.
      fireTriggers(
        {
          cardId: cardId as string,
          chainItemId: newChainItemId,
          controller: playerId,
          triggered: false,
          type: "chainItemAdded",
        },
        { cards: context.cards, counters: context.counters, draft, zones },
      );

      // Fire triggers BEFORE incrementing the Rule-724 counter (see
      // Comment in playUnit). Legion on this spell must consult plays
      // Made EARLIER in the turn.
      fireTriggers(
        { cardId, playerId, type: "play-spell" },
        { cards: context.cards, counters: context.counters, draft, zones },
      );
      fireTriggers(
        { cardId, cardType: "spell", playerId, type: "play-card" },
        { cards: context.cards, counters: context.counters, draft, zones },
      );

      // Rule 724 (Legion) tracker: count this spell play so subsequent
      // Cards can satisfy their Legion conditions.
      if (draft.cardsPlayedThisTurn) {
        draft.cardsPlayedThisTurn[playerId] = (draft.cardsPlayedThisTurn[playerId] ?? 0) + 1;
      }

      // Move spell to trash (it resolves from the chain later)
      zones.moveCard({
        cardId: cardId as CoreCardId,
        targetZoneId: "trash" as CoreZoneId,
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

      const zone = context.zones.getCardZone(context.params.cardId as CoreCardId);
      if (zone !== "hand") {
        return false;
      }

      // Enforce per-player hidden-card capacity at the target battlefield.
      // Default capacity is 1; battlefields like Bandle Tree bump
      // `hiddenCapacityBonus` to permit additional hidden cards.
      const bfId = context.params.battlefieldId;
      const bf = state.battlefields[bfId];
      if (bf) {
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
      }

      return true;
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
        const newChainItemId = `chain-${interaction.nextChainItemId}`;
        draft.interaction = addToChain(
          interaction,
          { cardId, controller: playerId, effect: spellEffect, type: "spell" },
          turnOrder,
        );
        zones.moveCard({
          cardId: cardId as CoreCardId,
          targetZoneId: "trash" as CoreZoneId,
        });
        // Engine-bus event: a new (spell) item was added to the chain.
        fireTriggers(
          {
            cardId: cardId as string,
            chainItemId: newChainItemId,
            controller: playerId,
            triggered: false,
            type: "chainItemAdded",
          },
          { cards, counters, draft, zones },
        );
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

      const championZoneCards = context.zones.getCardsInZone(
        "championZone" as CoreZoneId,
        context.playerId as CorePlayerId,
      );
      if (championZoneCards.length === 0) {
        return [];
      }

      const energy = state.runePools?.[context.playerId]?.energy ?? 0;
      const results: { playerId: CorePlayerId; location: string }[] = [];
      for (const cardId of championZoneCards) {
        const def = (context.registry as { get?: (id: CoreCardId) => { energyCost?: number } | undefined } | undefined)?.get?.(cardId);
        const cost = def?.energyCost ?? 0;
        if (cost > energy) {
          continue;
        }
        results.push({ location: "base", playerId: context.playerId as CorePlayerId });
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
          deductCost(
            draft,
            playerId,
            championId as string,
            {},
            createMetaAccessor(context.cards),
            buildBoardCtx(draft, context),
          );

          zones.moveCard({
            cardId: championId,
            targetZoneId: location as CoreZoneId,
          });

          counters.setFlag(championId, "exhausted", true);
        }
      }
    },
  },
};
