/**
 * Showdown moves: passShowdownFocus / startShowdown / endShowdown (split from chain-moves.ts).
 */

import type { ZoneId as CoreZoneId, GameMoveDefinitions } from "@tcg/core";
import {
  createInteractionState,
  endShowdown as endShowdownState,
  getActiveShowdown,
  getTurnState,
  isShowdownEnded,
  passFocus as passFocusState,
} from "../../../chain";
import {
  type ArrivalIO,
  beginShowdownAt,
  beginStagedShowdowns,
} from "../../../operations/arrive-at-battlefield";
import { fireTriggers } from "../../../abilities/trigger-runner";
import { cleanupAndFireDeaths } from "../../../cleanup/post-move-cleanup";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import type { GameEvent } from "../../../abilities/game-events";
import { scoreBattlefield, scoreEvents } from "../../../operations/points";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/** Minimal operation bag a reducer/cleanup context exposes. */
type ShowdownStagingContext = Omit<ArrivalIO, "draft">;

/**
 * rules 319.8 → 323.11–323.13 / 320.1 — the Cleanup that finds the turn back in
 * a Neutral Open State begins whatever Showdown / Combat a resolution staged
 * (see `operations/arrive-at-battlefield.ts beginStagedShowdowns`).
 */
export function openPendingContestedShowdown(
  draft: RiftboundGameState,
  context: ShowdownStagingContext,
): void {
  if (turnPlayerMustChooseStagedCombat(draft, context)) {
    return;
  }
  beginStagedShowdowns({ ...context, draft });
}

/**
 * rule 323.13 / 460 / 461.1 — only ONE Combat begins at a time and the TURN
 * PLAYER decides which. With two or more Combats staged for them (and no
 * Showdown-only battlefield, which 323.12 begins first) the Cleanup begins
 * none: the choice is made with their `startShowdown` step.
 */
export function turnPlayerMustChooseStagedCombat(
  draft: RiftboundGameState,
  context: ShowdownStagingContext,
): boolean {
  const turnPlayer = draft.turn.activePlayer;
  let combats = 0;
  for (const [battlefieldId, bf] of Object.entries(draft.battlefields ?? {})) {
    if (!bf?.contested || bf.showdownComplete === true || !bf.contestedBy) {
      continue;
    }
    const zone = `battlefield-${battlefieldId}` as CoreZoneId;
    const controllers = context.zones
      .getCardsInZone(zone)
      .map((id) => context.cards.getCardController?.(id as never) ?? context.cards.getCardOwner(id));
    const attacker = bf.contestedBy as string;
    if (!controllers.includes(attacker)) {
      return false; // 323.11 re-staging happens first — let the Cleanup run it
    }
    if (!controllers.some((c) => c !== undefined && c !== attacker)) {
      return false; // a staged Showdown-only battlefield goes first (323.12)
    }
    if (attacker === turnPlayer || bf.stagedBy === turnPlayer) {
      combats += 1;
    }
  }
  return combats > 1;
}

/**
 * Pass focus during a showdown (rule 553.4)
 *
 * The focus player passes. If all relevant players pass,
 * the showdown ends.
 */
export const passShowdownFocus: Defs["passShowdownFocus"] = {
  condition: (state, context) => {
    if (state.pendingChoice) {
      return false;
    }
    const interaction = state.interaction ?? createInteractionState();
    // Rule 509.1: focus cannot pass while a chain is active on top of the
    // showdown — the chain must fully resolve first.
    if (interaction.chain?.active) {
      return false;
    }
    const activeShowdown = getActiveShowdown(interaction);
    if (!activeShowdown?.active) {
      return false;
    }
    return activeShowdown.focusPlayer === context.params.playerId;
  },
  enumerator: (state, context) => {
    if (state.pendingChoice) {
      return [];
    }
    const interaction = state.interaction ?? createInteractionState();
    if (interaction.chain?.active) {
      return [];
    }
    const activeShowdown = getActiveShowdown(interaction);
    if (!activeShowdown?.active) {
      return [];
    }
    if (activeShowdown.focusPlayer !== (context.playerId as string)) {
      return [];
    }
    return [{ playerId: context.playerId as string }];
  },
  reducer: (draft, context) => {
    if (!draft.interaction) {
      return;
    }

    const before = getActiveShowdown(draft.interaction);
    draft.interaction = passFocusState(draft.interaction);

    // If showdown ended (all passed), clean up.
    if (isShowdownEnded(draft.interaction)) {
      let conquerEvents: GameEvent[] = [];
      const bf = before?.battlefieldId ? draft.battlefields[before.battlefieldId] : undefined;
      if (bf) {
        if (before?.isCombatShowdown) {
          // Rule 348.1 → resolveFullCombat becomes legal (Combat Damage Step).
          bf.showdownComplete = true;
        } else {
          // Rule 348.2 / 316.8.b / 466.5.a: Non-Combat Showdown close — mark
          // the battlefield's showdown complete so startShowdown does not
          // re-stage the same battlefield this turn.
          bf.showdownComplete = true;
          // Rule 348.2 / 181.4: a Non-Combat Showdown closing means no combat
          // is pending here — the battlefield is no longer Contested. Leaving
          // it set blocks endTurn and lets resolveFullCombat recall the
          // mover's own units.
          bf.contested = false;
          bf.contestedBy = undefined;
          // Rule 348.2.a: Non-Combat Showdown close — if only one player's
          // units remain and they don't already control it, they establish
          // Control. 348.2.a.1: this is a Conquer if not yet scored.
          const bfZone = `battlefield-${before!.battlefieldId}` as CoreZoneId;
          // rule 469.1 / 477.1.a: Control of a battlefield is established (and the
          // point scored) by the CONTROLLER of the units left there — a borrowed
          // unit conquers for the player controlling it, never for its owner.
          const owners = new Set<string>();
          for (const cid of context.zones.getCardsInZone(bfZone)) {
            const o = context.cards.getCardController?.(cid as never) ?? context.cards.getCardOwner(cid);
            if (o) owners.add(o as string);
          }
          if (owners.size === 1) {
            const solo = [...owners][0];
            if (bf.controller !== solo) {
              // rule 188: pre-conquer controller — `null` means Uncontrolled.
              const previousController = bf.controller ?? null;
              bf.controller = solo;
              // rule 469.1 / 471: a Conquer worth up to one point (denial,
              // skips and the Final Point restriction applied by awardPoints);
              // the victory check waits for the next Cleanup (rule 472).
              // rule 471.2.c: Conquer abilities trigger only when the
              // Battlefield SCORES — re-taking a battlefield this player
              // already scored this turn is not a Conquer, so no event.
              const { isScore } = scoreBattlefield(
                draft,
                solo,
                before!.battlefieldId,
                "conquer",
                context,
                { previousController },
              );
              if (isScore) {
                // Rule 348.2.a.1: this is a Conquer — emit the "conquer" event
                // (as conquerBattlefield / resolveFullCombat do) so [Hunt] and
                // "When you conquer" triggers fire.
                conquerEvents = scoreEvents(solo, before!.battlefieldId, "conquer", {
                  previousController,
                });
              }
            }
          }
        }
      }
      draft.interaction = endShowdownState(draft.interaction);
      for (const event of conquerEvents) {
        fireTriggers(event, {
          cards: context.cards,
          counters: context.counters,
          draft,
          zones: context.zones,
        });
      }
      // rule 323.13 / 344.2 — the Cleanup that follows a closed Showdown begins
      // the next staged one (e.g. a Combat that waited behind a Non-Combat
      // Showdown at another battlefield).
      openPendingContestedShowdown(
        draft,
        context as unknown as Parameters<typeof openPendingContestedShowdown>[1],
      );
      // rule 323.6 / 323.13 — the Cleanup that follows a closed Showdown runs
      // the state-based checks: a battlefield whose controller no longer has a
      // unit there (both sides traded before combat damage) becomes
      // Uncontrolled. Chain moves are not wrapped by withPostMoveCleanup, so
      // without this the stale controller survives into the open state.
      cleanupAndFireDeaths(draft, context as unknown as Parameters<typeof cleanupAndFireDeaths>[1]);
    }
  },
};

/**
 * Start a showdown at a battlefield (rule 548)
 *
 * Triggered when a battlefield becomes contested.
 */
export const startShowdown: Defs["startShowdown"] = {
  condition: (state, context) => {
    if (state.status !== "playing") {
      return false;
    }
    if (state.pendingChoice) {
      return false;
    }
    // Rule 548: Starting a Showdown is a Discretionary Action, legal only
    // in a Neutral Open state (no chain, no showdown). Also blocks nested
    // showdowns — a second showdown cannot stack while one is already open.
    const interaction = state.interaction ?? createInteractionState();
    const openNow = getActiveShowdown(interaction);
    if (openNow?.active) {
      // rule 344.2 — the Cleanup already began this Non-Combat Showdown on its
      // own; the Turn Player confirming it is a no-op. Any other battlefield,
      // an open Combat, or a non-turn player still gets nothing.
      return (
        openNow.isCombatShowdown !== true &&
        openNow.battlefieldId === context.params.battlefieldId &&
        state.turn.activePlayer === context.params.playerId
      );
    }
    if (getTurnState(interaction) !== "neutral-open") {
      return false;
    }
    // rule 323.12 — beginning a staged Showdown is the TURN player's step;
    // a non-turn player never chooses it (e.g. after an off-turn Reaction move).
    if (state.turn.activePlayer !== context.params.playerId) {
      return false;
    }
    const bf = state.battlefields[context.params.battlefieldId];
    if (!bf) {
      return false;
    }
    // Rule 548: Showdowns begin when a battlefield is contested
    if (!bf.contested) {
      return false;
    }
    // Rule 348.1/465.2: once the Combat Showdown has closed, the remaining
    // combat steps are Outstanding — the same showdown cannot be reopened.
    if (bf.showdownComplete) {
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
    // rule 344.2 — a Showdown the Cleanup already began is in progress; there
    // is nothing to start, so nothing is offered (the condition still tolerates
    // a stale confirm of that same Non-Combat Showdown as a no-op).
    if (getActiveShowdown(interaction)?.active) {
      return [];
    }
    if (getTurnState(interaction) !== "neutral-open") {
      return [];
    }
    // rule 323.12 — only the turn player is offered the staged-showdown choice.
    if (state.turn.activePlayer !== (context.playerId as string)) {
      return [];
    }
    // Rule 548: Only contested battlefields can have showdowns
    const results: { playerId: string; battlefieldId: string }[] = [];
    for (const bfId of Object.keys(state.battlefields ?? {})) {
      const bf = state.battlefields[bfId];
      if (bf?.contested && !bf.showdownComplete) {
        results.push({ battlefieldId: bfId, playerId: context.playerId as string });
      }
    }
    return results;
  },
  reducer: (draft, context) => {
    const { battlefieldId } = context.params;

    // rule 344.2 — Cleanup already opened this Showdown; nothing to redo.
    const already = getActiveShowdown(draft.interaction ?? createInteractionState());
    if (already?.active && already.battlefieldId === battlefieldId) {
      return;
    }

    // rule 345 / 464.2 — same opening as the Cleanup's, minus the auto-begun mark.
    beginShowdownAt(
      { cards: context.cards, counters: context.counters, draft, zones: context.zones } as ArrivalIO,
      battlefieldId,
    );
  },
};

/**
 * End a showdown (rule 553.4.a)
 *
 * Called when all relevant players have passed focus.
 */
export const endShowdown: Defs["endShowdown"] = {
  condition: (state) => {
    if (state.pendingChoice) {
      return false;
    }
    const interaction = state.interaction ?? createInteractionState();
    const activeShowdown = getActiveShowdown(interaction);
    return activeShowdown?.active === false || isShowdownEnded(interaction);
  },
  enumerator: (state) => {
    if (state.pendingChoice) {
      return [];
    }
    const interaction = state.interaction ?? createInteractionState();
    if (!interaction.showdownStack?.length) {
      return [];
    }
    const activeShowdown = getActiveShowdown(interaction);
    if (activeShowdown?.active === false || isShowdownEnded(interaction)) {
      return [{}];
    }
    return [];
  },
  reducer: (draft) => {
    if (!draft.interaction) {
      return;
    }
    draft.interaction = endShowdownState(draft.interaction);
  },
};
