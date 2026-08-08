/**
 * Contesting a battlefield on arrival (shared by Standard Move and by playing
 * a unit straight to a battlefield, e.g. "You may play me to an open
 * battlefield"). Thin adapter over `operations/arrive-at-battlefield.ts`, the
 * one helper every arrival path goes through.
 */

import type { RiftboundGameState } from "../../../types";
import type { fireTriggers } from "../../../abilities/trigger-runner";
import { type ArrivalIO, noteArrival } from "../../../operations/arrive-at-battlefield";

type TriggerCtx = Parameters<typeof fireTriggers>[1];

/**
 * rule 190.3.a.1 / 450: a unit arriving at a battlefield its controller does
 * not control makes that battlefield Contested — whether it arrived by a
 * Standard Move or by being played there directly (355.2.b).
 * rule 323.8 / 323.12 / 323.13 / 344: this only STAGES the Showdown; the
 * Cleanup that finds the turn in a Neutral Open State begins it (with no
 * opposing units a non-combat showdown that, once all players pass, hands
 * control and the conquer point to the sole occupant — 469.1, 466.5).
 */
export function contestBattlefieldOnArrival(args: {
  arrivingUnitIds: string[];
  /**
   * rule 344.2 — true when the arrival is an effect's doing (a resolution put
   * the unit there), so the Cleanup-begun Showdown is `autoBegun`; absent for
   * a player's own play (a Discretionary Action).
   */
  autoBegun?: boolean;
  battlefieldId: string;
  cards: TriggerCtx["cards"];
  /** Kept for callers' readability: every arrival now defers to the Cleanup. */
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
  const { arrivingUnitIds, autoBegun, battlefieldId, cards, counters, draft, playerId, stagedBy, zones } = args;
  const io = { cards, counters, draft, zones } as unknown as ArrivalIO;
  noteArrival(io, {
    at: battlefieldId,
    cause: "play",
    discretionary: autoBegun !== true,
    stagedBy: stagedBy ?? playerId,
    unitIds: arrivingUnitIds,
  });
}
