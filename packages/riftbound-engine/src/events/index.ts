/**
 * Event bus module — the unified typed-event dispatcher + per-card listener
 * registry. See `dispatcher.ts` for the design narrative.
 */

export type {
  GameEvent,
  GameEventType,
  GameEventRecord,
  EventLog,
} from "./game-event";
export {
  EVENT_TYPES_NEEDING_RECALC,
  dispatchEvent,
  dispatchUnitDied,
  runStateMaintenance,
} from "./dispatcher";
export type { DispatchContext } from "./dispatcher";
export { buildListenerRegistry } from "./listener-registry";
export type { CardListener, ListenerRegistry } from "./listener-registry";
