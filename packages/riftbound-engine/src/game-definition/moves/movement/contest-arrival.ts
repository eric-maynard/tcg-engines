/**
 * Contesting a battlefield on arrival (shared by Standard Move and by playing
 * a unit straight to a battlefield, e.g. "You may play me to an open
 * battlefield"). Thin adapter over `operations/arrive-at-battlefield.ts`, the
 * one helper every arrival path goes through.
 */

import { createInteractionState } from "../../../chain";
import type { RiftboundGameState } from "../../../types";
import type { fireTriggers } from "../../../abilities/trigger-runner";
import {
  type ArrivalIO,
  beginShowdownAt,
  noteArrival,
} from "../../../operations/arrive-at-battlefield";

type TriggerCtx = Parameters<typeof fireTriggers>[1];

/**
 * rule 190.3.a.1 / 450: a unit arriving at a battlefield its controller does
 * not control makes that battlefield Contested — whether it arrived by a
 * Standard Move or by being played there directly (355.2.b).
 * rule 323.11.a / 323.13: the following cleanup stages the showdown, so open
 * it here; with no opposing units it is a non-combat showdown that, once all
 * players pass, hands control (and the conquer point) to the sole occupant
 * (469.1, 466.5).
 */
export function contestBattlefieldOnArrival(args: {
  arrivingUnitIds: string[];
  /** rule 344.2 — true when a Cleanup begins this showdown, not a player's step. */
  autoBegun?: boolean;
  battlefieldId: string;
  cards: TriggerCtx["cards"];
  /**
   * rule 323.12 / 323.13 — set by callers that arrive DURING a resolution: the
   * Showdown is only staged here and the following Cleanup
   * (`openPendingContestedShowdown`) begins it, in the mandated order
   * (showdown-only battlefields before staged Combats).
   */
  deferToCleanup?: boolean;
  counters: TriggerCtx["counters"];
  draft: RiftboundGameState;
  playerId: string;
  /**
   * rule 323.13 (unl-202-219) — the player whose action caused the arrival when
   * that is not the arriving unit's controller (a spell dragging an ENEMY unit
   * in). The Cleanup begins the staged Combat on THIS player's turn.
   */
  stagedBy?: string;
  zones: TriggerCtx["zones"];
}): void {
  const { arrivingUnitIds, autoBegun, battlefieldId, cards, counters, deferToCleanup, draft, playerId, stagedBy, zones } = args;
  const io = { cards, counters, draft, zones } as unknown as ArrivalIO;
  const interaction = draft.interaction ?? createInteractionState();
  const hadShowdownHere = interaction.showdownStack.some(
    (sd) => sd.active && sd.battlefieldId === battlefieldId,
  );
  const { staged } = noteArrival(io, {
    at: battlefieldId,
    cause: "play",
    stagedBy: stagedBy ?? playerId,
    unitIds: arrivingUnitIds,
  });
  if (!staged || hadShowdownHere) {
    return;
  }
  // rule 323.6 → 323.12 / 323.13 — a Showdown staged part-way through a
  // resolution does not begin here: the Cleanup that follows first drops
  // control of emptied battlefields, then opens it in the mandated order
  // (showdown-only battlefields before staged Combats).
  if (deferToCleanup) {
    return;
  }
  beginShowdownAt(io, battlefieldId, { autoBegun });
}
