/**
 * playFromChampionZone move — rule 108.3.d / 419.1.a: the Chosen Champion is
 * played from the Champion Zone EXACTLY like a card from hand — same locations
 * and permissions (355.2 defaults, [Ambush] 822.1.b, "can be played to a
 * battlefield with enemy units", Mageseeker Warden's confinement 054.1), same
 * timing (a Discretionary play, or a [Reaction]/[Ambush] window), same costs
 * (every optional additional cost incl. the XP-for-discount and discard shapes,
 * Accelerate GRANTED to non-hand plays — sfd-029-221 —, keyword surcharges on
 * the granted Reaction). All of it comes from the one play-options model
 * (`play-options.ts`, origin `championZone`); the reducer pays the matched
 * option's total and enters through the shared unit-play tail (340.4 Priority
 * reseat, Focus pass, Cleanup).
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import type { PlayerId } from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { createInteractionState, getActiveShowdown } from "../../../chain";
import {
  type SubmittedUnitPlay,
  computeUnitPlayOptions,
  payUnitPlayCosts,
  resolveSubmittedUnitPlay,
  unitPlayOptionParams,
} from "./play-options";
import { completeUnitPlay } from "./play-unit";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

const ORIGIN = { kind: "championZone" } as const;

function championOf(zones: { getCardsInZone: (z: CoreZoneId, p?: CorePlayerId) => readonly CoreCardId[] }, playerId: string): string | undefined {
  return zones.getCardsInZone("championZone" as CoreZoneId, playerId as CorePlayerId)[0] as string | undefined;
}

/**
 * Play the Chosen Champion from the Champion Zone (rule 107.2.c / 108.3.d).
 */
export const playFromChampionZone: Defs["playFromChampionZone"] = {
  condition: (state, context) => {
    const playerId = context.params.playerId as string;
    const championId = championOf(context.zones, playerId);
    if (!championId) {
      return false;
    }
    return (
      resolveSubmittedUnitPlay(
        state,
        { cards: context.cards, counters: context.counters, zones: context.zones },
        playerId,
        championId,
        ORIGIN,
        context.params as SubmittedUnitPlay,
      ) !== undefined
    );
  },
  enumerator: (state, context) => {
    if (state.status !== "playing" || state.pendingChoice) {
      return [];
    }
    const playerId = context.playerId as string;
    const championId = championOf(context.zones, playerId);
    if (!championId) {
      return [];
    }
    const io = { cards: context.cards, counters: context.counters, zones: context.zones };
    return computeUnitPlayOptions(state, io, playerId, championId, ORIGIN).map(
      (option) => ({ playerId: playerId as PlayerId, ...unitPlayOptionParams(option) }) as unknown as RiftboundMoves["playFromChampionZone"],
    );
  },
  reducer: (draft, context) => {
    const playerId = context.params.playerId as string;
    const championId = championOf(context.zones, playerId);
    if (!championId) {
      return;
    }
    const io = { cards: context.cards, counters: context.counters, zones: context.zones };
    const option = resolveSubmittedUnitPlay(draft, io, playerId, championId, ORIGIN, context.params as SubmittedUnitPlay);
    if (!option) {
      // rule 358.5 — not a legal play: nothing happens.
      return;
    }
    // rule 340.2.a / 347.1 — an [Ambush] Champion-Zone play during a Showdown is a Focus action.
    const preInteraction = draft.interaction ?? createInteractionState();
    const wasFocusAction =
      !preInteraction.chain?.items.length &&
      getActiveShowdown(preInteraction)?.focusPlayer === playerId;
    // rule 357 — pay the option's total (resources as ONE assignment, XP, discard, …).
    const paid = payUnitPlayCosts(draft, io, option);
    const play = {
      cardId: championId,
      kind: "playUnit" as const,
      location: option.destination,
      paidAccelerate: paid.entersReady,
      paidAdditionalCost: paid.paidAdditionalCost,
      paidIds: paid.paidIds,
      playerId,
      wasFocusAction,
    };
    if (paid.suspended) {
      draft.suspendedPlay = play;
      return;
    }
    // rule 355.10.a.1 / 359.2 / 337.2 / 340.4 — enter through the ONE path (via
    // "champion"), reseat Priority on the newest remaining item, pass Focus, Cleanup.
    completeUnitPlay(draft, context, play);
  },
};
