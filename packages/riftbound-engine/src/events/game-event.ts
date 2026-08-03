/**
 * Game Event — the typed event vocabulary for the engine event bus.
 *
 * The canonical discriminated union {@link GameEvent} lives in
 * `abilities/game-events.ts` (the parser maps a card's `trigger.event`
 * string straight onto a `GameEvent.type`, so that file is the single
 * source of truth for "which event names exist"). This module re-exports
 * it under the `events/` namespace and layers on the event-log shape used
 * by the dispatcher.
 *
 * ## The vision (event bus + per-card listeners)
 *
 * Every state-changing thing in the game (a unit dies, a card is played,
 * damage is dealt, a phase begins, a battlefield is conquered, …) is meant
 * to flow through ONE chokepoint — {@link dispatchEvent} — which:
 *   1. records the event (optional event log),
 *   2. re-evaluates static / replacement effects affected by it,
 *   3. polls the listener registry (every live card's parsed abilities,
 *      keyed by event type) and queues the triggered ones onto the chain
 *      in turn / APNAP order,
 *   4. runs state-based checks (which may emit further events — a cascade).
 *
 * This replaces the pattern of ad-hoc `fireTriggers` / `fireDieTriggers`
 * calls scattered across move reducers, flow hooks and cleanup. There is
 * no `if (card.id === ...)` anywhere — bespoke cards just subscribe via
 * their parsed abilities.
 */

import type { GameEvent } from "../abilities/game-events";

export type { GameEvent } from "../abilities/game-events";

/** Every `GameEvent.type` literal. */
export type GameEventType = GameEvent["type"];

/**
 * An entry in the (optional) per-game event log. The dispatcher pushes one
 * of these for every event it processes when a log is attached to the
 * dispatch context. Mostly a debugging / replay aid today; future event-
 * sourced features (e.g. "this turn you played another card" without a
 * dedicated counter) can read it.
 */
export interface GameEventRecord {
  /** The event that occurred. */
  readonly event: GameEvent;
  /**
   * Monotonic sequence number within the game (0-based). Lets consumers
   * order events deterministically even when several fire in one tick.
   */
  readonly seq: number;
  /**
   * Number of listeners (triggered abilities) that matched this event —
   * the count `dispatchEvent` returns. Useful for assertions / tracing.
   */
  readonly listenersFired: number;
}

/** An ordered, append-only log of {@link GameEventRecord}s. */
export type EventLog = GameEventRecord[];
