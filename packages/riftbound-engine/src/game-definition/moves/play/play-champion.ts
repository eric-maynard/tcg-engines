/**
 * playFromChampionZone move (split from cards.ts).
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { createInteractionState, getTurnState } from "../../../chain";
import { fireTriggers } from "../../../abilities/trigger-runner";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import { canPlayViaAmbush } from "../../../keywords/keyword-effects";
import { removeFromBoard } from "../../../operations/leave-board";
import { contestBattlefieldOnArrival } from "../movement/contest-arrival";
import { cleanupAndFireDeaths, type PostMoveCleanupContext } from "../../../cleanup/post-move-cleanup";
import {
  extractBattlefieldId,
  getBattlefieldZoneId,
  isBattlefieldZone,
} from "../../../zones/zone-configs";
import { reactionWindowOpen } from "./reaction-window";
import {
  battlefieldHasEnemyUnits,
  canAffordCard,
  canPlayToEnemyOccupiedBattlefield,
  staticEnterReadyApplies,
  consumeEntersReadyReplacement,
  createMetaAccessor,
  getOptionalPlayCost,
  getPotentialRuneEnergy,
  deductCost,
} from "./cost";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * rule 356.2 with rule 355.10.a.1 (rule-id: unl-052-219) — an optional
 * additional cost printed on a champion is offered on EVERY play of that card,
 * including the play from the Champion Zone. Only the rune-paid shapes
 * (`accelerate` / `pay`) are payable on this path.
 */
function championOptionalRuneCost(
  cardId: string,
): { kind: "accelerate" | "pay"; energy: number; power: readonly string[] } | undefined {
  const optional = getOptionalPlayCost(cardId);
  if (optional?.kind !== "accelerate" && optional?.kind !== "pay") {
    return undefined;
  }
  if ((optional.cost?.xp ?? 0) > 0) {
    return undefined;
  }
  return {
    energy: optional.cost?.energy ?? 0,
    kind: optional.kind,
    power: optional.cost?.power ?? [],
  };
}

/**
 * rule 135.2.e.5.a / 135.2.e.5.b — an additional cost's pips obey the printed
 * cost's Power rules: a named-Domain pip prefers its own Domain and falls back
 * to pooled [rainbow], a [rainbow] pip is payable from any Domain. Returns the
 * per-Domain amounts to spend, or undefined when the pool cannot cover them.
 */
function planPips(
  pips: readonly string[],
  have: Partial<Record<string, number>>,
): Record<string, number> | undefined {
  const left: Record<string, number> = {};
  for (const [domain, count] of Object.entries(have)) {
    left[domain] = count ?? 0;
  }
  const spend: Record<string, number> = {};
  const take = (domain: string) => {
    left[domain] = (left[domain] ?? 0) - 1;
    spend[domain] = (spend[domain] ?? 0) + 1;
  };
  let wild = 0;
  for (const pip of pips) {
    if (pip === "rainbow") {
      wild++;
      continue;
    }
    if ((left[pip] ?? 0) > 0) {
      take(pip);
    } else if ((left.rainbow ?? 0) > 0) {
      take("rainbow");
    } else {
      return undefined;
    }
  }
  for (let i = 0; i < wild; i++) {
    const domain = Object.keys(left)
      .filter((d) => (left[d] ?? 0) > 0)
      .sort((a, b) => (left[b] ?? 0) - (left[a] ?? 0))[0];
    if (domain === undefined) {
      return undefined;
    }
    take(domain);
  }
  return spend;
}

/**
 * rule 419.1.a with rule 822.1.b — cards are played from hand OR the Champion
 * Zone, so [Ambush]'s permission ("play me as a [Reaction] to a battlefield
 * where you have units") covers the Champion-Zone play too.
 */
function ambushDestinationOk(
  state: RiftboundGameState,
  zones: { getCardsInZone: (zone: CoreZoneId, player: CorePlayerId) => readonly string[] },
  playerId: string,
  championId: string,
  location: string | undefined,
): boolean {
  if (location === undefined || !isBattlefieldZone(location)) {
    return false;
  }
  if (!getGlobalCardRegistry().hasKeyword(championId, "Ambush")) {
    return false;
  }
  const bfId = extractBattlefieldId(location);
  if (!bfId) {
    return false;
  }
  const friendly = zones.getCardsInZone(
    getBattlefieldZoneId(bfId) as CoreZoneId,
    playerId as CorePlayerId,
  );
  // rule 813.1.c.1 / 310.1.a — Reaction TIMING, not a permission to act.
  return canPlayViaAmbush(true, friendly.length > 0, reactionWindowOpen(state, playerId));
}

/**
 * Play Chosen Champion from Champion Zone (rule 107.2.c)
 */
export const playFromChampionZone: Defs["playFromChampionZone"] = {
  condition: (state, context) => {
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
    const championZoneCards = context.zones.getCardsInZone(
      "championZone" as CoreZoneId,
      context.params.playerId as CorePlayerId,
    );
    if (championZoneCards.length === 0) {
      return false;
    }

    // rule 419.1.a / 822.1.b — an [Ambush] champion may be played from the
    // Champion Zone in any Reaction window, to a battlefield where its
    // controller has units; every other Champion-Zone play is a Discretionary
    // Action in the controller's own Neutral Open main phase.
    const ambushPlay = ambushDestinationOk(
      state,
      context.zones,
      context.params.playerId as string,
      championZoneCards[0] as string,
      context.params.location as string | undefined,
    );

    if (!ambushPlay) {
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
    }

    // rule 356.2 (rule-id: unl-052-219) — an optional additional cost may only
    // be declared paid when the card has one and the pool can cover it.
    if (context.params.paidAdditionalCost === true) {
      const championId = championZoneCards[0];
      // rule 356.2.b / 355.10.a.1 (ven-023a-166) — "you may discard N as an
      // additional cost to play me" is offered on the Champion-Zone play too;
      // the declared fodder must be another card in this player's own hand.
      const discardCost =
        championId === undefined ? undefined : getOptionalPlayCost(championId as string);
      if (discardCost?.kind === "discard" && (discardCost.discard ?? 0) === 1) {
        const discardId = context.params.discardId as string | undefined;
        if (!discardId || discardId === (championId as string)) {
          return false;
        }
        if (context.zones.getCardZone(discardId as CoreCardId) !== "hand") {
          return false;
        }
        return context.cards.getCardOwner(discardId as CoreCardId) === context.params.playerId;
      }
      const optional =
        championId === undefined ? undefined : championOptionalRuneCost(championId as string);
      if (!optional) {
        return false;
      }
      if (
        !canAffordCard(
          state,
          context.params.playerId as string,
          championId as string,
          {
            additionalCost: { energy: optional.energy, power: optional.power },
            board: { cards: context.cards, zones: context.zones },
          },
          createMetaAccessor(context.cards),
          getPotentialRuneEnergy(context.zones, context.counters, context.params.playerId as string),
        )
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

    // Rule 309.1.a: no champion-zone plays while a chain exists — except the
    // [Ambush] path below, which is a Reaction (rule 822.1.b / 419.1.a).
    const interaction = state.interaction ?? createInteractionState();
    const standardTiming =
      state.turn.phase === "main" &&
      state.turn.activePlayer === context.playerId &&
      getTurnState(interaction) === "neutral-open";
    const reactionWindow = reactionWindowOpen(state, context.playerId as string);
    if (!standardTiming && !reactionWindow) {
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
    const results: {
      playerId: PlayerId;
      location: string;
      paidAdditionalCost?: boolean;
      discardId?: string;
    }[] = [];
    for (const cardId of championZoneCards) {
      // rule 824 (rule-id: unl-059-219) — a Champion-Zone play is still
      // "playing me", so the champion's own (possibly [Level]-gated) cost
      // reductions price it: ask the shared cost path instead of comparing the
      // printed Energy, which also gets the Power pips checked.
      if (
        !canAffordCard(
          state,
          context.playerId as string,
          cardId as string,
          { board: { cards: context.cards, zones: context.zones } },
          createMetaAccessor(context.cards),
          energy - (state.runePools?.[context.playerId]?.energy ?? 0),
        )
      ) {
        continue;
      }
      // rule 419.1.a / 822.1.b — [Ambush] offers every battlefield where this
      // player already has units, in any window they may act in.
      if (getGlobalCardRegistry().hasKeyword(cardId as string, "Ambush")) {
        for (const bfId of Object.keys(state.battlefields ?? {})) {
          const bfZoneId = getBattlefieldZoneId(bfId);
          const friendly = context.zones.getCardsInZone(
            bfZoneId as CoreZoneId,
            context.playerId as CorePlayerId,
          );
          if (friendly.length > 0) {
            results.push({ location: bfZoneId, playerId: context.playerId as PlayerId });
          }
        }
      }
      if (!standardTiming) {
        continue;
      }
      // rule 355.2 / 419.1.a (rule-id: ven-179-166) — "I can be played to a
      // battlefield where there are enemy units" is a play-LOCATION permission,
      // so it covers the Champion-Zone play too. It grants no Reaction timing.
      if (canPlayToEnemyOccupiedBattlefield(cardId as string)) {
        for (const bfId of Object.keys(state.battlefields ?? {})) {
          const bfZoneId = getBattlefieldZoneId(bfId);
          if (results.some((r) => r.location === bfZoneId)) {
            continue;
          }
          if (
            battlefieldHasEnemyUnits(
              context.zones,
              (id) =>
                (context.cards.getCardController?.(id as CoreCardId) as string | undefined) ??
                (context.cards.getCardOwner(id as CoreCardId) as string | undefined),
              bfId,
              context.playerId as string,
            )
          ) {
            results.push({ location: bfZoneId, playerId: context.playerId as PlayerId });
          }
        }
      }
      results.push({ location: "base", playerId: context.playerId as PlayerId });
      // rule 356.2 / 355.10.a.1 (rule-id: unl-052-219) — offer the champion's
      // own optional additional cost here too; it is only a variant when the
      // pool can actually cover the base cost plus the extra.
      // rule 356.2.b / 355.10.a.1 (ven-023a-166) — one paid variant per other
      // card in hand for a "you may discard 1 as an additional cost" champion.
      const discardCost = getOptionalPlayCost(cardId as string);
      if (discardCost?.kind === "discard" && (discardCost.discard ?? 0) === 1) {
        for (const fodder of context.zones.getCardsInZone(
          "hand" as CoreZoneId,
          context.playerId as CorePlayerId,
        )) {
          if ((fodder as string) === (cardId as string)) {
            continue;
          }
          results.push({
            discardId: fodder as string,
            location: "base",
            paidAdditionalCost: true,
            playerId: context.playerId as PlayerId,
          });
        }
      }
      const optional = championOptionalRuneCost(cardId as string);
      if (
        optional &&
        canAffordCard(
          state,
          context.playerId as string,
          cardId as string,
          {
            additionalCost: { energy: optional.energy, power: optional.power },
            board: { cards: context.cards, zones: context.zones },
          },
          createMetaAccessor(context.cards),
          energy - (state.runePools?.[context.playerId]?.energy ?? 0),
        )
      ) {
        results.push({
          location: "base",
          paidAdditionalCost: true,
          playerId: context.playerId as PlayerId,
        });
      }
    }
    return results;
  },
  reducer: (draft, context) => {
    const { playerId, location, paidAdditionalCost, discardId } = context.params;
    const { zones, counters } = context;

    const championZoneCards = zones.getCardsInZone(
      "championZone" as CoreZoneId,
      playerId as CorePlayerId,
    );

    if (championZoneCards.length > 0) {
      const championId = championZoneCards[0];
      if (championId) {
        // rule 357.1.a: tap ready runes for any Energy shortfall at Pay time.
        deductCost(draft, playerId, championId as string, {}, createMetaAccessor(context.cards), {
          counters: context.counters,
          zones: context.zones,
        });

        // rule 356.2 / 355.10.a.1 (rule-id: unl-052-219) — pay the champion's
        // optional additional cost while playing it, so "if you paid the
        // additional cost" riders on the play trigger see it as paid.
        let paidOptional = false;
        let paidAccelerate = false;
        const optional = paidAdditionalCost
          ? championOptionalRuneCost(championId as string)
          : undefined;
        const pool = draft.runePools[playerId];
        if (optional && pool) {
          const spend = planPips(optional.power, pool.power);
          if (spend !== undefined && pool.energy >= optional.energy) {
            pool.energy -= optional.energy;
            for (const [domain, count] of Object.entries(spend)) {
              const key = domain as keyof typeof pool.power;
              pool.power[key] = (pool.power[key] ?? 0) - count;
            }
            paidOptional = true;
            paidAccelerate = optional.kind === "accelerate";
          }
        }

        // rule 356.2.b / 357.2 (ven-023a-166) — a "you may discard N" additional
        // cost is paid BEFORE the champion lands, so the fodder is already in the
        // trash when the play trigger's "if you paid" rider is checked.
        const discardCost = paidAdditionalCost
          ? getOptionalPlayCost(championId as string)
          : undefined;
        if (discardCost?.kind === "discard" && discardId) {
          const owner = context.cards.getCardOwner(discardId as CoreCardId);
          const inHand = zones.getCardZone(discardId as CoreCardId) === "hand";
          if (owner === playerId && inHand && discardId !== championId) {
            // rule 422 — a discard paid as a cost is still a discard event.
            removeFromBoard(
              { cards: context.cards, counters, draft, zones },
              [discardId as string],
              "trash",
              { by: playerId as string, kind: "discard", source: championId as string },
              (event) => fireTriggers(event, { cards: context.cards, counters, draft, zones }),
            );
            paidOptional = true;
          }
        }

        zones.moveCard({
          cardId: championId,
          targetZoneId: location as CoreZoneId,
        });

        // rule-id: unl-052-219 — consume the "next unit you play" replacement
        // first so its Buff rider (if any) lands on the entering champion.
        const replacedReady = consumeEntersReadyReplacement(draft, playerId, {
          cardId: championId as string,
          ctx: { cards: context.cards, counters, zones },
        });
        const entersReady =
          replacedReady ||
          // rule 717: a paid Accelerate enters the champion ready.
          paidAccelerate ||
          // rule 143.4 (rule-id: sfd-176-221): a conditional "I enter ready" is
          // evaluated as the champion enters — an unmet "if" leaves him exhausted.
          staticEnterReadyApplies(championId as string, draft, playerId, zones);
        if (!entersReady) {
          counters.setFlag(championId, "exhausted", true);
        }

        // rule 355.10.a.1: playing a champion from the Champion Zone is still
        // "playing" it — "when you play me" triggers must fire exactly as they
        // do for a play from hand.
        fireTriggers(
          { cardId: championId, paidAdditionalCost: paidOptional, playerId, type: "play-self" },
          { cards: context.cards, counters, draft, zones },
        );
        fireTriggers(
          { cardId: championId, cardType: "unit", playerId, type: "play-card" },
          { cards: context.cards, counters, draft, zones },
        );

        if (draft.cardsPlayedThisTurn) {
          draft.cardsPlayedThisTurn[playerId] = (draft.cardsPlayedThisTurn[playerId] ?? 0) + 1;
        }

        // rule 190.3.a.1 / 464.2.c.3.a — a champion played straight to a
        // battlefield (Ambush) contests it and picks up its combat
        // designation exactly like a unit played there does.
        if (isBattlefieldZone(location as string)) {
          const arrivedAt = extractBattlefieldId(location as string);
          if (arrivedAt) {
            contestBattlefieldOnArrival({
              arrivingUnitIds: [championId as string],
              battlefieldId: arrivedAt,
              cards: context.cards,
              counters,
              draft,
              playerId,
              zones,
            });
          }
          cleanupAndFireDeaths(draft, context as unknown as PostMoveCleanupContext);
        }
      }
    }
  },
};
