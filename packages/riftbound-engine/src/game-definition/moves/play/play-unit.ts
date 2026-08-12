/**
 * playUnit move — a unit played from hand (or from the trash under a standing
 * permission: ven-022-166 "You may play cards from your trash", unl-025-219 the
 * card's own [Legion] trash cost).
 *
 * Everything about WHERE the unit may go and WHAT the play costs comes from the
 * one play-options model (`play-options.ts`): the enumerator lists
 * `computeUnitPlayOptions`, the condition and the reducer resolve the submitted
 * params against the very same options (`resolveSubmittedUnitPlay`) and pay the
 * option's own total (`payUnitPlayCosts`). Enumerator ≡ reducer by construction.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { createInteractionState, getActiveShowdown } from "../../../chain";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import { enterPlayedPermanent } from "./play-pipeline";
import {
  cleanupAndFireDeaths,
  type PostMoveCleanupContext,
} from "../../../cleanup/post-move-cleanup";
import { hasPlayFromTrashGrant, reachableRuneAdds } from "./cost";
import { getSelfTrashPlayCost } from "./self-trash-play";
import {
  type SubmittedUnitPlay,
  type UnitPlayOrigin,
  computeUnitPlayOptions,
  payUnitPlayCosts,
  resolveSubmittedUnitPlay,
  unitPlayOptionParams,
} from "./play-options";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * rule 340.2.a / 347.1 — taking a Focus action in a Showdown passes Focus to
 * the next Relevant Player once that action finishes. Unlike a pass, the
 * passed-players list is cleared (rule 346), matching what happens when a
 * chain empties.
 */
export function advanceFocusAfterAction(
  state: RiftboundGameState["interaction"],
): RiftboundGameState["interaction"] {
  const showdown = getActiveShowdown(state);
  if (!showdown) {
    return state;
  }
  const idx = showdown.relevantPlayers.indexOf(showdown.focusPlayer);
  if (idx < 0) {
    return state;
  }
  const stack = [...state.showdownStack];
  stack[stack.length - 1] = {
    ...showdown,
    focusPlayer: showdown.relevantPlayers[(idx + 1) % showdown.relevantPlayers.length],
    passedPlayers: [],
  };
  return { ...state, showdownStack: stack };
}

/** The origin this move serves for `cardId`: the hand, or the trash under a standing permission. */
function handMoveOrigin(
  state: RiftboundGameState,
  zones: { getCardZone: (id: CoreCardId) => unknown; getCardsInZone: (z: CoreZoneId, p?: CorePlayerId) => readonly CoreCardId[] },
  playerId: string,
  cardId: string,
): UnitPlayOrigin | undefined {
  const zone = zones.getCardZone(cardId as CoreCardId) as string | undefined;
  if (zone === "hand") {
    return { kind: "hand" };
  }
  // rule 419.1 (ven-022-166) / 366.1 (unl-025-219) — the trash is a legal play-from
  // zone under a board-wide grant or the card's own permission.
  if (
    zone === "trash" &&
    (hasPlayFromTrashGrant(state, zones as never, playerId) || getSelfTrashPlayCost(state, playerId, cardId) !== undefined)
  ) {
    return { kind: "trash" };
  }
  return undefined;
}

/**
 * Play a unit (rules 354–359).
 */
export const playUnit: Defs["playUnit"] = {
  condition: (state, context) => {
    const playerId = context.params.playerId as string;
    const cardId = context.params.cardId as string;
    if (getGlobalCardRegistry().getCardType(cardId) !== "unit") {
      return false;
    }
    const origin = handMoveOrigin(state, context.zones, playerId, cardId);
    if (!origin) {
      return false;
    }
    return (
      resolveSubmittedUnitPlay(
        state,
        { cards: context.cards, counters: context.counters, zones: context.zones },
        playerId,
        cardId,
        origin,
        context.params as SubmittedUnitPlay,
      ) !== undefined
    );
  },
  enumerator: (state, context) => {
    if (state.status !== "playing" || state.pendingChoice) {
      return [];
    }
    const playerId = context.playerId as string;
    if (!state.runePools[playerId]) {
      return [];
    }
    const registry = getGlobalCardRegistry();
    const io = { cards: context.cards, counters: context.counters, zones: context.zones };
    const hand = context.zones.getCardsInZone("hand" as CoreZoneId, playerId as CorePlayerId);
    const trash = context.zones.getCardsInZone("trash" as CoreZoneId, playerId as CorePlayerId);
    // rule 357.1.a / 429.3 — list what the player could pay for after one Add
    // (tap a ready rune, recycle any rune for its Domain, crack a Gold), not
    // just what the pool covers this instant. `condition` gets no such credit,
    // so paying stays manual and a premature attempt is still refused.
    const reach = reachableRuneAdds(state, playerId, context.zones, context.counters);
    const results: RiftboundMoves["playUnit"][] = [];
    for (const raw of [...hand, ...trash]) {
      const cardId = raw as string;
      if (registry.getCardType(cardId) !== "unit") {
        continue;
      }
      const origin = handMoveOrigin(state, context.zones, playerId, cardId);
      if (!origin) {
        continue;
      }
      for (const option of computeUnitPlayOptions(state, io, playerId, cardId, origin, reach)) {
        results.push({ cardId, playerId, ...unitPlayOptionParams(option) } as RiftboundMoves["playUnit"]);
      }
    }
    return results;
  },
  reducer: (draft, context) => {
    const playerId = context.params.playerId as string;
    const cardId = context.params.cardId as string;
    const io = { cards: context.cards, counters: context.counters, zones: context.zones };
    const origin = handMoveOrigin(draft, context.zones, playerId, cardId);
    if (!origin) {
      return;
    }
    const option = resolveSubmittedUnitPlay(draft, io, playerId, cardId, origin, context.params as SubmittedUnitPlay);
    if (!option) {
      // rule 358.5 — not a legal play: nothing happens (the condition already refused it).
      return;
    }
    // rule 340.2.a / 347.1 — playing this unit as a Focus action during a
    // Showdown passes Focus once it has landed (checked at the tail).
    const preInteraction = draft.interaction ?? createInteractionState();
    const wasFocusAction =
      !preInteraction.chain?.items.length &&
      getActiveShowdown(preInteraction)?.focusPlayer === playerId;

    // rule 357 — pay every cost of the option (resources as ONE assignment,
    // XP, discards, buffs, cost-kills, exhausts, returned gear).
    const paid = payUnitPlayCosts(draft, io, option);
    const play = {
      cardId,
      kind: "playUnit" as const,
      location: option.destination,
      paidAccelerate: paid.entersReady,
      paidAdditionalCost: paid.paidAdditionalCost,
      paidIds: paid.paidIds,
      playerId,
      wasFocusAction,
    };
    // rule 357.2 / 371.2 (ogn-208-298 × ogn-023-298) — a cost-kill met an
    // OPTIONAL costed die replacement: its controller answers now, mid-payment;
    // the unit enters once that prompt settles (`completeSuspendedPlay`).
    if (paid.suspended) {
      draft.suspendedPlay = play;
      return;
    }
    completeUnitPlay(draft, context, play);
  },
};

/**
 * rule 359.2 — the second half of a unit play, once every cost is paid: the
 * unit leaves its zone for the board (entry zone / exhausted / enter-ready
 * replacements), its play triggers fire, Legion counts it, an arrival contests
 * the battlefield, [Weaponmaster] is offered, and a Focus action passes Focus.
 * Split out so a play suspended mid-payment (`draft.suspendedPlay`) resumes
 * exactly here. The Champion-Zone play (`play-champion.ts`) ends here too.
 */
export function completeUnitPlay(
  draft: RiftboundGameState,
  // biome-ignore lint/suspicious/noExplicitAny: engine move context is framework-typed
  context: any,
  play: NonNullable<RiftboundGameState["suspendedPlay"]>,
): void {
  const { cardId, playerId, location, paidAccelerate, wasFocusAction } = play;
  const { zones, counters } = context as {
    zones: Parameters<NonNullable<Defs["playUnit"]["reducer"]>>[1]["zones"];
    counters: Parameters<NonNullable<Defs["playUnit"]["reducer"]>>[1]["counters"];
  };
  // rule 359.2 — the ONE enter path (`play-pipeline.ts`): battlefield-token
  // entry replacement, exhausted / enter-ready / Accelerate, play triggers with
  // the paid additional costs, Legion count, arrival contest, [Weaponmaster].
  const from = zones.getCardZone(cardId as CoreCardId) as string | undefined;
  enterPlayedPermanent(
    { cards: context.cards, counters, draft, zones },
    {
      cardId,
      entersReady: paidAccelerate,
      entryZone: location,
      from,
      paidAdditionalCost: play.paidAdditionalCost,
      paidIds: play.paidIds,
      playerId,
      // rule 419.1 / 366.1 — a hand move made from the trash is a PERMISSION play;
      // rule 108.3.d / 419.1.a — the Chosen Champion is played from the Champion Zone.
      via: from === "trash" ? "permission" : from === "championZone" ? "champion" : "hand",
    },
  );

  // rule 337.2 / 339.1 / 340.4 — a unit item resolves the instant it is
  // finalized and so never sits on the Chain: playing it still restarts the run
  // of passes, and once nothing is Pending the controller of the newest
  // REMAINING item (not this player) gains Priority. `finalizeSweepTouched` is
  // what the end-of-move finalization sweep reads to reseat Priority.
  if (draft.interaction?.chain?.items.length) {
    draft.finalizeSweepTouched = true;
  }

  // rule 340.2.a / 347.1 — the unit resolved on finalize with nothing left
  // on the chain and no prompt outstanding: Focus passes to the next
  // Relevant Player. A play-trigger chain keeps Focus where it is (346.1).
  // rule 347.1.b / 340.2.a — the unit resolved immediately, so a chain that
  // exists now was OPENED by this card's own play triggers as part of a Focus
  // action of playing a card. That is not a trigger-opened chain for rule
  // 346.1 purposes: Focus must still pass when it empties.
  if (wasFocusAction && draft.interaction?.chain?.openedByTrigger) {
    draft.interaction.chain.openedByTrigger = false;
  }
  if (wasFocusAction && !draft.pendingChoice && draft.interaction) {
    const post = draft.interaction;
    if (!post.chain?.items.length && getActiveShowdown(post)?.focusPlayer === playerId) {
      draft.interaction = advanceFocusAfterAction(post);
    }
  }

  // rule 323.6 / 190.4.c — the Cleanup that follows the play. A non-standard
  // cost (Cruel Patron's kill) can empty a battlefield its payer controls, and
  // the play moves are not wrapped by `withPostMoveCleanup`, so without this
  // pass control there never lapses. Idempotent; a Closed state (play triggers
  // still on the chain) keeps control, as the one control model requires.
  if (context?.cards && context?.counters && context?.zones) {
    cleanupAndFireDeaths(draft, context as PostMoveCleanupContext);
  }
}

/**
 * rule 357.2.a — finish a unit play that was suspended while one of its object
 * costs waited on a prompt (see `draft.suspendedPlay`). Called from the prompt
 * layer once no choice is open; a replaced cost-kill still counts as paid.
 */
export function completeSuspendedPlay(
  draft: RiftboundGameState,
  // biome-ignore lint/suspicious/noExplicitAny: engine move context is framework-typed
  context: any,
): void {
  const play = draft.suspendedPlay;
  if (!play || draft.pendingChoice) {
    return;
  }
  draft.suspendedPlay = undefined;
  if (play.kind === "playUnit") {
    completeUnitPlay(draft, context, play);
  }
}
