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
  isPresenceUnit,
} from "../../../operations/arrive-at-battlefield";
import { fireTriggers } from "../../../abilities/trigger-runner";
import { cleanupAndFireDeaths, type PostMoveCleanupContext } from "../../../cleanup/post-move-cleanup";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import type { GameEvent } from "../../../abilities/game-events";
import { settleControlByRemainingUnits } from "../../../operations/battlefield-control";

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
): boolean {
  if (turnPlayerMustChooseStagedCombat(draft, context)) {
    return false;
  }
  if (!beginStagedShowdowns({ ...context, draft })) {
    return false;
  }
  refreshAfterShowdownBegan(draft, context);
  return true;
}

/**
 * rule 464.2 / 322.3 — designations and "in a showdown / in combat" just
 * changed, so continuous effects conditioned on them (Akali's "unless I'm in
 * combat", combat-only Might) are re-applied before anyone receives Focus.
 */
export function refreshAfterShowdownBegan(draft: RiftboundGameState, context: ShowdownStagingContext): void {
  const ctx = context as unknown as PostMoveCleanupContext;
  if (ctx.cards?.getCardMeta && ctx.counters && ctx.zones?.getCardsInZone) {
    cleanupAndFireDeaths(draft, ctx);
  }
}

/**
 * rule 323.12 / 323.13 / 460 / 461.1 — only ONE Showdown begins at a time and
 * the TURN PLAYER decides which. Showdown-only battlefields go first (323.12)
 * and Combats after (323.13), but each step is itself a Turn Player choice
 * whenever two or more of that kind are staged — by either player; an off-turn
 * Reaction stages one just the same — so the Cleanup begins none and the choice
 * is made with the Turn Player's `startShowdown` step. Exactly one staged
 * battlefield of the leading kind leaves nothing to choose, so the Cleanup
 * opens it.
 */
export function turnPlayerMustChooseStagedCombat(
  draft: RiftboundGameState,
  context: ShowdownStagingContext,
): boolean {
  let combats = 0;
  let showdownOnly = 0;
  for (const [battlefieldId, bf] of Object.entries(draft.battlefields ?? {})) {
    if (!bf?.contested || bf.showdownComplete === true || !bf.contestedBy) {
      continue;
    }
    const zone = `battlefield-${battlefieldId}` as CoreZoneId;
    const controllers = context.zones
      .getCardsInZone(zone)
      .filter((id) => isPresenceUnit(id as string))
      .map((id) => context.cards.getCardController?.(id as never) ?? context.cards.getCardOwner(id));
    const attacker = bf.contestedBy as string;
    if (!controllers.includes(attacker)) {
      return false; // 323.11 re-staging happens first — let the Cleanup run it
    }
    if (!controllers.some((c) => c !== undefined && c !== attacker)) {
      showdownOnly += 1; // a staged Showdown-only battlefield goes first (323.12)
      continue;
    }
    combats += 1;
  }
  // rule 323.12 — the Showdown-only step runs before the Combat step, and it is
  // the Turn Player who names which of those battlefields opens; only a lone
  // one is begun by the Cleanup without asking.
  if (showdownOnly > 0) {
    return showdownOnly > 1;
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
          // Rule 348.2 / 348.2.a / 348.2.a.1: Non-Combat Showdown close — the
          // battlefield stops being Contested and, if only ONE player's units
          // remain and they don't already control it, they establish Control
          // (a Conquer, scored unless already scored here this turn — 471.2.c).
          // Nobody / both remaining ⇒ nothing is established (the next Open
          // Cleanup's 323.6 then applies). One model:
          // operations/battlefield-control.ts (units = presence, 190.3; the
          // CONTROLLER of a borrowed unit conquers, 469.1).
          conquerEvents = settleControlByRemainingUnits(
            { cards: context.cards, draft, zones: context.zones } as never,
            before!.battlefieldId,
            "showdown",
          ).events;
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
    const io = { cards: context.cards, counters: context.counters, draft, zones: context.zones } as ArrivalIO;
    if (beginShowdownAt(io, battlefieldId)) {
      refreshAfterShowdownBegan(draft, io);
    }
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
