/**
 * scorePoint move (split from combat.ts).
 */

import type { GameMoveDefinitions } from "@tcg/core";
import { fireTriggers } from "../../../abilities/trigger-runner";
import { createInteractionState, getTurnState } from "../../../chain";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { checkVictory, scoreBattlefield, scoreEvents } from "../../../operations/points";
import { canPlayerScoreAtBattlefield } from "../../../operations/scoring-rules";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * Score Point
 *
 * Award a victory point to a player.
 * Two ways to score:
 * - Conquer: Gain control of a battlefield
 * - Hold: Control a battlefield during Beginning Phase
 */
export const scorePoint: Defs["scorePoint"] = {
  condition: (state, context) => {
    if (state.pendingChoice) {
      return false;
    }
    if (state.status !== "playing") {
      return false;
    }
    if (state.turn.activePlayer !== context.params.playerId) {
      return false;
    }
    // Rule 140.1.b/c + 589.1.a: Scoring is a Discretionary Action,
    // legal only in a Neutral Open state (no chain, no showdown).
    const interaction = state.interaction ?? createInteractionState();
    if (getTurnState(interaction) !== "neutral-open") {
      return false;
    }

    const { playerId, battlefieldId } = context.params;

    // Must not have already scored this battlefield this turn
    if (state.scoredThisTurn?.[playerId]?.includes(battlefieldId)) {
      return false;
    }

    // Player must control this battlefield
    const bf = state.battlefields[battlefieldId];
    if (!bf || bf.controller !== playerId) {
      return false;
    }

    // Battlefield abilities (e.g. Forgotten Monument) can block scoring
    if (!canPlayerScoreAtBattlefield(state, playerId, battlefieldId)) {
      return false;
    }

    return true;
  },
  // rule 468 / 469 / 410.2: Scoring is a Limited Action that happens only as
  // part of a Hold (Scoring Step) or a Conquer (establishing Control) — it is
  // never a discretionary action a player may take on demand. This move stays
  // as the engine-internal entry point those two paths use, but it is never
  // offered as a choice.
  enumerator: () => [],
  reducer: (draft, context) => {
    const { playerId, method, battlefieldId } = context.params;
    const { cards, counters, zones } = context;
    const prevController = context.params.previousController ?? null;

    // rule 469 / 471: a Hold or Conquer of a battlefield not yet scored this
    // turn is a Score worth up to one point. scoreBattlefield gates on "can't
    // score here" statics (Forgotten Monument), marks the battlefield, and runs
    // the point through awardPoints (054.1 denial, 443.1.a method-scoped skips,
    // 471.1.b Final Point → draw instead, 630.1.a teammate conquer).
    const { isScore } = scoreBattlefield(
      draft,
      playerId,
      battlefieldId,
      method,
      { cards, zones },
      { previousController: prevController },
    );

    // Rule 632.2 / 471.2: emit the score event so battlefield score abilities
    // (on-conquer / on-hold) fire — only when the battlefield actually Scored.
    if (isScore) {
      for (const event of scoreEvents(playerId, battlefieldId, method, {
        previousController: prevController,
      })) {
        fireTriggers(event, { cards, counters, draft, zones });
      }
    }

    // rule 472 / 319.1 — the Cleanup after this action checks victory.
    checkVictory(draft, { io: context });
  },
};
