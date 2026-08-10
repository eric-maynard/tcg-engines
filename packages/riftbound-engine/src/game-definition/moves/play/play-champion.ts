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
import { enterPlayedPermanent } from "./play-pipeline";
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
  createMetaAccessor,
  getOptionalPlayCost,
  getPotentialRuneEnergy,
  deductCost,
  opponentsRestrictedToBase,
} from "./cost";
import { legacyParamsFromSelection, paidIdsFromLegacyParams, withCostsParam } from "./cost-model";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * rule 356.2 with rule 355.10.a.1 (rule-id: unl-052-219) — an optional
 * additional cost printed on a champion is offered on EVERY play of that card,
 * including the play from the Champion Zone: the rune-paid shapes
 * (`accelerate` / `pay`) and, rule 356.2.b.1 (rule-id: unl-178-219), the
 * "spend N XP … if you do, I cost [N] less" shape.
 */
function championOptionalRuneCost(cardId: string):
  | {
      kind: "accelerate" | "pay";
      energy: number;
      power: readonly string[];
      xp: number;
      energyDiscount: number;
    }
  | undefined {
  const optional = getOptionalPlayCost(cardId);
  if (optional?.kind !== "accelerate" && optional?.kind !== "pay") {
    return undefined;
  }
  const xp = optional.cost?.xp ?? 0;
  return {
    energy: optional.cost?.energy ?? 0,
    // rule 560 — the "I cost [N] less" rider is honoured on the XP path only,
    // exactly as the hand play prices it.
    energyDiscount: xp > 0 ? (optional.energyDiscount ?? 0) : 0,
    kind: optional.kind,
    power: optional.cost?.power ?? [],
    xp,
  };
}

/**
 * rule 356.2.b.1 — the extras that price the PAID variant: the extra runes,
 * netted against the "I cost [N] less" rider.
 */
function paidCostExtras(optional: {
  energy: number;
  power: readonly string[];
  energyDiscount: number;
}): { energy: number; power: readonly string[] } {
  return { energy: optional.energy - optional.energyDiscount, power: optional.power };
}

/** rule 356.2.b.1 — can this player still afford the paid variant (XP included)? */
function canPayChampionOptional(
  state: RiftboundGameState,
  playerId: string,
  optional: { xp: number },
): boolean {
  return optional.xp === 0 || (state.players[playerId]?.xp ?? 0) >= optional.xp;
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
  condition: (state, rawContext) => {
    // rule 355.1 — `costs` is canonical; expand onto the legacy params (the
    // played card is whatever sits in this player's Champion Zone).
    const context = rawContext.params.costs
      ? {
          ...rawContext,
          params: legacyParamsFromSelection(
            (rawContext.zones.getCardsInZone("championZone" as never, rawContext.params.playerId as never)[0] as string | undefined) ?? "",
            rawContext.params,
          ),
        }
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
    const championZoneCards = context.zones.getCardsInZone(
      "championZone" as CoreZoneId,
      context.params.playerId as CorePlayerId,
    );
    if (championZoneCards.length === 0) {
      return false;
    }

    // rule 054.1 / 355.2 (rule-id: ogn-070-298) — an enemy static that confines
    // this player's unit plays to their base beats every play-LOCATION
    // permission, [Ambush] included: the Champion-Zone play is still a unit
    // play, so no battlefield destination is legal.
    if (
      isBattlefieldZone((context.params.location as string | undefined) ?? "") &&
      opponentsRestrictedToBase(state, context.zones, context.params.playerId as string)
    ) {
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
      // rule 356.2.b.1 (unl-178-219) — the XP half of the cost must be payable too.
      if (!canPayChampionOptional(state, context.params.playerId as string, optional)) {
        return false;
      }
      if (
        !canAffordCard(
          state,
          context.params.playerId as string,
          championId as string,
          {
            additionalCost: paidCostExtras(optional),
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
      const affordFull = canAffordCard(
        state,
        context.playerId as string,
        cardId as string,
        { board: { cards: context.cards, zones: context.zones } },
        createMetaAccessor(context.cards),
        energy - (state.runePools?.[context.playerId]?.energy ?? 0),
      );
      // rule 356.2 / 356.2.b.1 (unl-052-219, unl-178-219) — the champion's own
      // optional additional cost is offered on this play too, at every legal
      // destination; when only the discounted (XP) line is affordable it alone
      // keeps the play on the menu.
      const optional = championOptionalRuneCost(cardId as string);
      const affordPaid =
        optional !== undefined &&
        canPayChampionOptional(state, context.playerId as string, optional) &&
        canAffordCard(
          state,
          context.playerId as string,
          cardId as string,
          {
            additionalCost: paidCostExtras(optional),
            board: { cards: context.cards, zones: context.zones },
          },
          createMetaAccessor(context.cards),
          energy - (state.runePools?.[context.playerId]?.energy ?? 0),
        );
      if (!affordFull && !affordPaid) {
        continue;
      }
      const destinations: string[] = [];
      const offer = (location: string) => {
        if (destinations.includes(location)) {
          return;
        }
        destinations.push(location);
        if (affordFull) {
          results.push({ location, playerId: context.playerId as PlayerId });
        }
        if (affordPaid) {
          results.push({
            location,
            paidAdditionalCost: true,
            playerId: context.playerId as PlayerId,
          });
        }
      };
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
            offer(bfZoneId);
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
          if (destinations.includes(bfZoneId)) {
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
            offer(bfZoneId);
          }
        }
      }
      offer("base");
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
    }
    {
      // rule 054.1 / 355.2 (rule-id: ogn-070-298) — same restriction as the
      // hand play: drop every battlefield destination while an enemy static
      // confines this player's unit plays to their base.
      const offered = opponentsRestrictedToBase(state, context.zones, context.playerId as string)
        ? results.filter((r) => !isBattlefieldZone(r.location))
        : results;
      const championId = championZoneCards[0] as string | undefined;
      return championId ? offered.map((r) => withCostsParam(r, championId)) : offered;
    }
  },
  reducer: (draft, rawContext) => {
    const context = rawContext.params.costs
      ? {
          ...rawContext,
          params: legacyParamsFromSelection(
            (rawContext.zones.getCardsInZone("championZone" as never, rawContext.params.playerId as never)[0] as string | undefined) ?? "",
            rawContext.params,
          ),
        }
      : rawContext;
    const { playerId, location, paidAdditionalCost, discardId } = context.params;
    const { zones, counters } = context;

    const championZoneCards = zones.getCardsInZone(
      "championZone" as CoreZoneId,
      playerId as CorePlayerId,
    );

    if (championZoneCards.length > 0) {
      const championId = championZoneCards[0];
      if (championId) {
        // rule 356.2 / 355.10.a.1 (rule-id: unl-052-219) — pay the champion's
        // optional additional cost while playing it, so "if you paid the
        // additional cost" riders on the play trigger see it as paid.
        let paidOptional = false;
        let paidAccelerate = false;
        const optional = paidAdditionalCost
          ? championOptionalRuneCost(championId as string)
          : undefined;
        // rule 356.2.b.1 (unl-178-219) — "spend N XP … if you do, I cost [N]
        // less": spend the XP up front so the base cost is charged discounted.
        let energyDiscount = 0;
        if (optional && optional.xp > 0) {
          const player = draft.players[playerId];
          if (player && player.xp >= optional.xp) {
            player.xp -= optional.xp;
            energyDiscount = optional.energyDiscount;
            paidOptional = true;
          }
        }
        // rule 357.1.a: tap ready runes for any Energy shortfall at Pay time.
        deductCost(
          draft,
          playerId,
          championId as string,
          energyDiscount > 0 ? { additionalCost: { energy: -energyDiscount } } : {},
          createMetaAccessor(context.cards),
          {
            counters: context.counters,
            zones: context.zones,
          },
        );

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

        // rule 355.10.a.1 / 359.2 — playing a champion from the Champion Zone is
        // still playing it: the ONE enter path (`play-pipeline.ts`) handles the
        // "next unit you play" replacement, Accelerate / "I enter ready", play
        // triggers with the paid additional cost, Legion count and an Ambush
        // arrival's contest exactly as for a play from hand.
        enterPlayedPermanent(
          { cards: context.cards, counters, draft, zones },
          {
            cardId: championId as string,
            entersReady: paidAccelerate,
            entryZone: location as string,
            from: "championZone",
            paidAdditionalCost: paidOptional,
            paidIds: paidOptional ? paidIdsFromLegacyParams(championId as string, context.params) : [],
            playerId: playerId as string,
            via: "champion",
          },
        );

        // rule 337.2 / 340.4 — the unit resolved the instant it was finalized
        // and never sat on the chain, so once nothing is Pending the controller
        // of the newest REMAINING item gains Priority. `finalizeSweepTouched`
        // is what the end-of-move finalization sweep reads to reseat it.
        if (draft.interaction?.chain?.items.length) {
          draft.finalizeSweepTouched = true;
        }
      }
    }
  },
};
