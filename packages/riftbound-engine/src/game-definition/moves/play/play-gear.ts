/**
 * playGear move (split from cards.ts).
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { createInteractionState, getTurnState } from "../../../chain";
import { isLegalTiming } from "../../../chain/chain-state";
import { hasKeyword } from "../movement/helpers";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import {
  createMetaAccessor,
  getPotentialRuneEnergy,
  canAffordCard,
  deductCost,
  hasPlayFromTrashGrant,
} from "./cost";
import { legacyParamsFromSelection, withCostsParam } from "./cost-model";
import { reactionWindowOpen } from "./reaction-window";
import { enterPlayedPermanent } from "./play-pipeline";

/**
 * rule 813.1 (unl-085-219 Sumpworks Map) — the gear prints [Reaction] (which
 * `normalizeSpellTiming` files as its timing class) or carries it as a keyword.
 */
function gearHasReaction(cardId: string): boolean {
  const registry = getGlobalCardRegistry();
  return registry.getSpellTiming(cardId) === "reaction" || registry.hasKeyword(cardId, "Reaction");
}

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/** A granted "play a gear … ignoring its Energy cost" permission on the draft. */
interface EnergyWaiverEntry {
  replaces?: string;
  duration?: string;
  owner?: string;
  ignoreEnergyCost?: boolean;
  maxEnergyCost?: number;
  target?: { type?: string };
}

/**
 * rule 356.1.b / 317.2.c (rule-id: sfd-084-221 Jayce, Man of Progress) — "you
 * may play a gear with Energy cost no more than [7] from hand this turn,
 * ignoring its Energy cost". The permission is installed as an
 * `activeReplacements` entry (`replaces: "play-cost"`, `ignoreEnergyCost`), and
 * unlike a fixed discount it waives the play's WHOLE Energy component while
 * leaving the Power cost untouched. A gear above `maxEnergyCost` is not covered
 * at all — it keeps its full cost rather than getting a partial discount.
 * Returns the entry's index so the pay path can spend a `duration: "next"` one.
 */
function findEnergyWaiver(state: RiftboundGameState, playerId: string, cardId: string): number {
  const active = state.activeReplacements as EnergyWaiverEntry[] | undefined;
  if (!active) {
    return -1;
  }
  const cardType = getGlobalCardRegistry().get(cardId)?.cardType;
  const printed = getGlobalCardRegistry().getEnergyCost(cardId) ?? 0;
  for (let i = active.length - 1; i >= 0; i--) {
    const entry = active[i];
    if (!entry || entry.replaces !== "play-cost" || entry.ignoreEnergyCost !== true) {
      continue;
    }
    if (entry.owner !== undefined && entry.owner !== playerId) {
      continue;
    }
    const targetType = entry.target?.type;
    if (targetType !== undefined && targetType !== "card" && targetType !== cardType) {
      continue;
    }
    if (entry.maxEnergyCost !== undefined && printed > entry.maxEnergyCost) {
      continue;
    }
    return i;
  }
  return -1;
}

/**
 * Play gear to Base (rule 143.1.a.1)
 */
export const playGear: Defs["playGear"] = {
  condition: (state, rawContext) => {
    // rule 355.1 — `costs` is the canonical cost param (gear has no printed
    // additional costs today; the shim keeps the six play moves uniform).
    const context = rawContext.params.costs
      ? { ...rawContext, params: legacyParamsFromSelection(rawContext.params.cardId as string, rawContext.params) }
      : rawContext;
    if (state.status !== "playing") {
      return false;
    }
    if (state.pendingChoice) {
      return false;
    }
    // rule-id: ogn-026-298 — "opponents can't play cards this turn".
    if (state.cannotPlayCardsThisTurn?.[context.params.playerId as string]) {
      return false;
    }
    // rule 819.1.b (sfd-054-221) — [Quick-Draw] gives the Equipment [Reaction],
    // so it may be played at Reaction speed: any open state, on either player's
    // turn. Everything else is a Discretionary Action (140.1.b/c + 508.1.a),
    // legal only in a Neutral Open state on your own Main Phase.
    const interaction = state.interaction ?? createInteractionState();
    const quickDraw = hasKeyword(context.params.cardId as string, "Quick-Draw", (id) =>
      context.cards.getCardMeta(id),
    );
    if (quickDraw) {
      if (!isLegalTiming("reaction", getTurnState(interaction))) {
        return false;
      }
    } else if (gearHasReaction(context.params.cardId as string)) {
      // rule 813.1.c.1 (unl-085-219) — printed [Reaction] gear may be played in
      // any window where its controller may act (priority on a chain, Focus in
      // a showdown), not only in its own Neutral Open Main Phase.
      if (!reactionWindowOpen(state, context.params.playerId as string)) {
        return false;
      }
    } else {
      if (state.turn.activePlayer !== context.params.playerId) {
        return false;
      }
      if (state.turn.phase !== "main") {
        return false;
      }
      if (getTurnState(interaction) !== "neutral-open") {
        return false;
      }
    }

    const zone = context.zones.getCardZone(context.params.cardId as CoreCardId);
    if (
      zone !== "hand" &&
      // rule 419.1 (rule-id: ven-022-166) — "You may play cards from your
      // trash" covers every card type (rule 101), gear included.
      !(
        zone === "trash" &&
        hasPlayFromTrashGrant(state, context.zones, context.params.playerId as string)
      )
    ) {
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
        {
          // rule 356.4 — board statics (e.g. a battlefield's "gear you play
          // costs [1] less") price gear plays like every other play.
          board: { cards: context.cards, zones: context.zones },
          chosenTargetId: context.params.chosenTargetId,
          ignoreEnergyCost:
            findEnergyWaiver(state, context.params.playerId as string, context.params.cardId as string) >= 0,
        },
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
    const interaction = state.interaction ?? createInteractionState();
    // rule 819.1.b — Quick-Draw Equipment is enumerated at Reaction speed; see
    // the condition above. Everything else needs your own open Main Phase.
    const openTurn =
      state.turn.activePlayer === (context.playerId as string) &&
      state.turn.phase === "main" &&
      getTurnState(interaction) === "neutral-open";
    if (!openTurn && !isLegalTiming("reaction", getTurnState(interaction))) {
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

    const handCards = context.zones.getCardsInZone(
      "hand" as CoreZoneId,
      context.playerId as CorePlayerId,
    );

    // rule 419.1 (rule-id: ven-022-166) — with "You may play cards from your
    // trash" on board, gear in the trash is offered alongside the hand.
    const playableCards = hasPlayFromTrashGrant(state, context.zones, context.playerId as string)
      ? [
          ...handCards,
          ...context.zones.getCardsInZone("trash" as CoreZoneId, context.playerId as CorePlayerId),
        ]
      : handCards;

    const results: { playerId: string; cardId: string }[] = [];
    for (const cardId of playableCards) {
      const def = registry.get(cardId as string);
      if (!def || (def.cardType !== "gear" && def.cardType !== "equipment")) {
        continue;
      }
      if (
        !openTurn &&
        !hasKeyword(cardId as string, "Quick-Draw", (id) => context.cards.getCardMeta(id)) &&
        // rule 813.1.c.1 (unl-085-219) — printed [Reaction] gear is offered
        // wherever its controller may act.
        !(
          gearHasReaction(cardId as string) &&
          reactionWindowOpen(state, context.playerId as string)
        )
      ) {
        continue;
      }
      // rule 356.4 (sfd-084-221) — enumerate through the same pay path as the
      // condition/reducer, so cost modifiers, board statics and one-shot
      // play-cost discounts count here too; a raw printed-cost check would hide
      // a gear whose Energy cost is discounted or waived.
      // Cards with interactive cost reduction are enumerated against their
      // Base cost; the actual cost is computed per-target at play time.
      if (
        !canAffordCard(
          state,
          context.playerId as string,
          cardId as string,
          {
            board: { cards: context.cards, zones: context.zones },
            ignoreEnergyCost:
              findEnergyWaiver(state, context.playerId as string, cardId as string) >= 0,
          },
          createMetaAccessor(context.cards),
          potential,
        )
      ) {
        continue;
      }

      results.push({
        cardId: cardId as string,
        playerId: context.playerId as string,
      });
    }
    return results.map((r) => withCostsParam(r));
  },
  reducer: (draft, rawContext) => {
    const context = rawContext.params.costs
      ? { ...rawContext, params: legacyParamsFromSelection(rawContext.params.cardId as string, rawContext.params) }
      : rawContext;
    const { cardId, playerId, chosenTargetId } = context.params;
    const { zones } = context;

    // rule 356.1.b (sfd-084-221) — spend a granted "ignoring its Energy cost"
    // permission on this play: the Energy is waived, the Power cost is still
    // paid, and a one-shot (`duration: "next"`) permission is used up, so the
    // next gear this turn costs its full price again.
    const waiverIdx = findEnergyWaiver(draft, playerId as string, cardId as string);
    if (waiverIdx >= 0) {
      const active = draft.activeReplacements as EnergyWaiverEntry[];
      if (active[waiverIdx]?.duration === "next") {
        active.splice(waiverIdx, 1);
      }
    }

    // rule 357.1.a: tap ready runes for any Energy shortfall at Pay time.
    deductCost(
      draft,
      playerId,
      cardId,
      {
        board: { cards: context.cards, zones: context.zones },
        chosenTargetId,
        ignoreEnergyCost: waiverIdx >= 0,
      },
      createMetaAccessor(context.cards),
      {
        counters: context.counters,
        zones: context.zones,
      },
    );

    // rule 359.2 / 143.1.a.1 — the ONE enter path (`play-pipeline.ts`): base,
    // "enters exhausted" statics, play triggers, Legion count, [Quick-Draw].
    enterPlayedPermanent(
      { cards: context.cards, counters: context.counters, draft, zones },
      { cardId: cardId as string, entryZone: "base", from: "hand", playerId: playerId as string, via: "hand" },
    );
  },
};
