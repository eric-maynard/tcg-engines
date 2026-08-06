/**
 * Event Dispatcher — the single chokepoint for engine events.
 *
 * Goal (the repo owner's vision): "every time anything happens, the engine
 * pokes every card in the game to see if it has anything to do in
 * response." `dispatchEvent` is that poke. Every state-changing thing in
 * the game should flow through here rather than calling `fireTriggers` /
 * `fireDieTriggers` ad-hoc from move reducers, flow hooks and cleanup.
 *
 * What `dispatchEvent` does, in order:
 *   1. **Record** the event in the optional event log (`ctx.eventLog`).
 *   2. **Poll the listener registry** — `fireTriggers` enumerates every
 *      live card, finds the triggered abilities that match this event
 *      type/subject, orders them by rule 585 (turn player first; APNAP for
 *      different controllers), and either resolves them inline or queues
 *      them onto the chain as new chain items (rule 541) if a chain is
 *      active. (The listener registry is `events/listener-registry.ts`;
 *      `fireTriggers` is its consumer today.)
 *   3. Return the number of listeners that fired.
 *
 * State-based checks (rules 518-526) and static/replacement re-evaluation
 * are *not yet* folded into `dispatchEvent` for arbitrary events — that is
 * the Phase-4 work. For the migrated **die path** the pipeline
 * (state-based checks → emit `die` per killed unit → cascade) lives in
 * `cleanup/post-move-cleanup.ts#cleanupAndFireDeaths`, which now emits its
 * `die` events through {@link dispatchUnitDied} so there is a single
 * emission point for "a unit died".
 *
 * Migration status (see `.ai_memory/unleashed-import-progress.md`):
 *   - `die` (unit death): MIGRATED. `cleanupAndFireDeaths`, the combat
 *     Damage Step, and the flow Temporary-trash hook all emit via
 *     `dispatchUnitDied`. `fireDieTriggers` is a thin shim over it.
 *   - `play-self` / `play-card` / `play-spell` / `gain-xp`: MIGRATED to
 *     `dispatchEvent` (still emitted from their respective sites, but the
 *     emission goes through the bus chokepoint, so an event log / future
 *     centralised handling sees them).
 *   - Everything else still calls `fireTriggers` directly for now.
 */

import {
  type TriggerRunnerContext,
  fireTriggers,
} from "../abilities/trigger-runner";
import type { CleanupContext } from "../cleanup/state-based-checks";
import { performCleanup } from "../cleanup/state-based-checks";
import type { GameEvent, GameEventRecord, GameEventType } from "./game-event";

/**
 * Context for an event dispatch. A superset of `TriggerRunnerContext`
 * (so every move-reducer / flow context that already produces a trigger
 * context passes straight through), plus an optional event log.
 */
export interface DispatchContext extends TriggerRunnerContext {
  /**
   * Optional append-only event log. When present, `dispatchEvent` pushes a
   * {@link GameEventRecord} for every event it processes. Most callers
   * don't supply one; it's a tracing / future-event-sourcing aid.
   */
  eventLog?: GameEventRecord[];
}

/**
 * Event types after which the dispatcher re-runs static-effect recalc +
 * state-based checks (rules 518-526 / 540.x / 522). Deliberately *coarse*:
 * any event that can change a zone, Might / buff, counter, control,
 * exhaustion, attachment, hidden-card placement, or combat staging is in
 * the set — we don't track fine-grained dependencies. Events that are
 * purely informational (a player drew, chose, channelled a rune, …) are
 * left out so the maintenance pass isn't run pointlessly.
 *
 * After processing one of these events, {@link dispatchEvent} calls
 * {@link runStateMaintenance}: it re-runs `performCleanup` (which itself
 * re-applies static abilities — rule 522 — and reaps lethally-damaged
 * units, stale combat roles, orphaned hidden cards, …), then emits a
 * `die` event for each unit it killed via {@link dispatchUnitDied} — which
 * re-enters the dispatcher (Deathknell / "when a unit dies" → potential
 * further deaths) — looping until the state is stable (with an iteration
 * cap). So static recalc + SBA + death emission happen *because the
 * dispatcher saw an event*, not because a move reducer wrapped itself in a
 * cleanup hook.
 */
export const EVENT_TYPES_NEEDING_RECALC: ReadonlySet<GameEventType> = new Set<GameEventType>([
  // Zone / play / death — all change what's on the board
  "play-self",
  "play-card",
  "play-spell",
  "hide",
  "die",
  "move",
  "discard",
  // Combat designation / staging / control
  "attack",
  "defend",
  "conquer",
  "hold",
  "win-combat",
  "combatStaged",
  "combatOpened",
  "combatResolved",
  "controlChanged",
  "cardControlChanged",
  // Might / buff / counter / damage / exhaustion / keyword mutations
  "buff",
  "become-mighty",
  "heal",
  "stun",
  "grant-keyword",
  "take-damage",
  "damageDealt",
  "counterChanged",
  // Chain item resolution can move cards / change state
  "chainItemResolved",
  // Phase transitions run end-of-turn / temporary-permanent / scoring SBA
  "phaseBegan",
  "phaseEnded",
  "start-of-turn",
  "end-of-turn",
]);

/**
 * Re-entrancy / cascade-depth guard for {@link runStateMaintenance}. The
 * maintenance pass emits `die` events, which re-enter {@link dispatchEvent};
 * `die` is in {@link EVENT_TYPES_NEEDING_RECALC}, so without a guard each
 * nested death would kick off its own maintenance loop. Instead: while a
 * maintenance loop is already running, `dispatchEvent` skips starting a new
 * one — the running loop's next `performCleanup` pass will pick up whatever
 * the nested events changed. (The engine is single-threaded, so a module
 * level counter is sufficient and matches the existing `cleanupAndFireDeaths`
 * cascade semantics.)
 */
let maintenanceDepth = 0;

/** Iteration cap for the recalc → SBA → death cascade (matches the old
 * `performFullCleanup` / `cleanupAndFireDeaths` cap; deep cascades beyond
 * this are pathological). */
const MAX_MAINTENANCE_ITERATIONS = 16;

/**
 * Run static-effect recalc + state-based checks until the state is stable,
 * emitting `die` events for everything reaped along the way. Called by
 * {@link dispatchEvent} after a state-changing event, and exported so the
 * (now-thin) post-move cleanup wrapper can delegate to it.
 *
 * The loop: `performCleanup` (re-applies static abilities, kills lethal
 * units, clears stale combat roles, removes orphaned hidden cards, recalls
 * gear, marks combat pending) → if it killed anything, `dispatchUnitDied`
 * for that batch (which re-enters the dispatcher → Deathknell etc.) →
 * repeat. Stops when a pass reports no state change, or after
 * {@link MAX_MAINTENANCE_ITERATIONS} passes.
 *
 * @returns the total number of units reaped across all passes.
 */
export function runStateMaintenance(ctx: DispatchContext): number {
  // `performCleanup` wants the `CleanupContext` shape (it reads
  // `counters.getCounter`/`clearCounter`/`setFlag`); every real dispatch
  // Context is a structural superset, so cast — the established pattern
  // (see `cleanup/post-move-cleanup.ts#cleanupAndFireDeaths`).
  const cleanupCtx = ctx as unknown as CleanupContext;

  maintenanceDepth += 1;
  let totalKilled = 0;
  // `performCleanup` does its kill step (rule 520) *then* its static-ability
  // Re-application step (rule 522) in one call — so a unit pushed lethal *by*
  // A static recalc needs a *second* `performCleanup` pass to be reaped. We
  // Therefore keep going until TWO consecutive passes both kill nothing: the
  // First no-kill pass might just have (re-)applied the statics; the second
  // Confirms the resulting board has nothing left to reap. Deaths reset the
  // Counter (each death's Deathknell may have changed the state again). The
  // Hard iteration cap bounds pathological cascades (e.g. a Deathknell that
  // Regenerates the dying unit).
  let consecutiveNoKillPasses = 0;
  try {
    for (let i = 0; i < MAX_MAINTENANCE_ITERATIONS; i += 1) {
      const result = performCleanup(cleanupCtx);
      if (result.killed.length === 0) {
        consecutiveNoKillPasses += 1;
        if (consecutiveNoKillPasses >= 2) {
          break;
        }
        continue;
      }
      consecutiveNoKillPasses = 0;
      totalKilled += result.killed.length;
      // Emit `die` for the reaped units through the single emission point.
      // Each re-enters `dispatchEvent` (Deathknell / "when a unit dies" → may
      // Change the state / kill more) but won't recurse into this loop —
      // `maintenanceDepth > 0` — so we re-run `performCleanup` here to catch
      // The next layer.
      dispatchUnitDied(ctx, result.deaths ?? result.killed);
    }
  } finally {
    maintenanceDepth -= 1;
  }
  return totalKilled;
}

/**
 * Dispatch a single {@link GameEvent}: record it, poll the listener
 * registry, queue / resolve the triggered abilities that match, then — if
 * the event can affect static effects or state-based checks
 * ({@link EVENT_TYPES_NEEDING_RECALC}) — run the maintenance pass
 * ({@link runStateMaintenance}: static recalc → SBA → emit deaths → loop).
 *
 * @returns the number of listener abilities that fired (matches
 *   `fireTriggers`' return).
 */
export function dispatchEvent(ctx: DispatchContext, event: GameEvent): number {
  const listenersFired = fireTriggers(event, ctx);

  if (ctx.eventLog) {
    ctx.eventLog.push({
      event,
      listenersFired,
      seq: ctx.eventLog.length,
    });
  }

  // Static recalc + state-based checks as a dispatcher concern: after a
  // State-changing event, re-run them and reap whatever became dead (which
  // Re-enters here for Deathknell etc.). Skipped while a maintenance loop is
  // Already in flight (the running loop will pick up the change) — see
  // `maintenanceDepth`. Also skipped when the context lacks the operation
  // Bags a real game context carries (some unit tests drive `dispatchEvent`
  // With stripped stubs); `performCleanup` needs `zones`/`cards`/`counters`.
  if (
    maintenanceDepth === 0 &&
    EVENT_TYPES_NEEDING_RECALC.has(event.type) &&
    hasCleanupCapableContext(ctx)
  ) {
    runStateMaintenance(ctx);
  }

  return listenersFired;
}

/**
 * Does this dispatch context carry the operation bags `performCleanup`
 * needs? Real game / flow contexts always do; stripped test stubs may not,
 * and we must not crash them.
 */
function hasCleanupCapableContext(ctx: DispatchContext): boolean {
  const c = ctx as unknown as Partial<CleanupContext>;
  return (
    Boolean(c.draft) &&
    Boolean(c.zones) &&
    typeof c.zones.getCardsInZone === "function" &&
    typeof c.zones.moveCard === "function" &&
    Boolean(c.cards) &&
    typeof c.cards.getCardMeta === "function" &&
    Boolean(c.counters) &&
    typeof c.counters.getCounter === "function" &&
    typeof c.counters.clearCounter === "function"
  );
}

/**
 * Emit `die` events for a batch of units that have just been killed — the
 * **single emission point** for "a unit died". Replaces the scattered
 * `fireDieTriggers` call sites (combat Damage Step, chain cleanup, counter-
 * mutation moves, phase hooks): each death-causing path marks its units
 * dead, then calls this once.
 *
 * Per unit it dispatches `{ type: "die", cardId, owner }` through
 * {@link dispatchEvent}, so Deathknell (rule 813), "when I die" and "when
 * a friendly/enemy unit dies" triggered abilities all fire through the same
 * listener poll, and any event log sees the deaths.
 *
 * Owner is resolved via `ctx.cards.getCardOwner` unless the caller already
 * knows it (a unit is in the trash by the time `die` fires, but its meta /
 * owner mapping is still intact — callers that snapshot the owner *before*
 * moving the card pass it explicitly to be safe).
 *
 * @param killed - card ids, or `{ cardId, owner }` pairs.
 * @returns total number of listener abilities that fired across all deaths.
 */
export function dispatchUnitDied(
  ctx: DispatchContext,
  killed: readonly (
    | string
    | {
        cardId: string;
        owner?: string;
        // rule 428.5: kill attribution forwarded onto the `die` event.
        killedBy?: string;
        killSource?: "spell" | "ability" | "combat";
        wasStunned?: boolean;
      }
  )[],
): number {
  let total = 0;
  // Maintain a recent-deaths log on the draft so the target resolver's
  // `just-died-trash` mode (rule 813 Deathknell + "play me from trash"
  // Shapes — Glasc Mixologist, Heedless Resurrection, p0639) can target
  // The dying card itself. We BUFFER entries before dispatching, then
  // Truncate the log when the outermost dispatch returns. We use a stack
  // Depth on the draft to know when the cascade settles.
  const draftWithLog = ctx.draft as RecentDeathsDraft;
  const isOutermost = !draftWithLog.__recentDeathsDepth;
  draftWithLog.__recentDeathsDepth = (draftWithLog.__recentDeathsDepth ?? 0) + 1;
  if (!draftWithLog.recentDeaths) {
    draftWithLog.recentDeaths = [];
  }
  const startLen = draftWithLog.recentDeaths.length;
  for (const entry of killed) {
    const cardId = typeof entry === "string" ? entry : entry.cardId;
    const explicitOwner = typeof entry === "string" ? undefined : entry.owner;
    const owner =
      explicitOwner ??
      ctx.cards.getCardOwner(cardId as Parameters<TriggerRunnerContext["cards"]["getCardOwner"]>[0]) ??
      "";
    draftWithLog.recentDeaths.push({
      cardId: cardId as string,
      owner: owner as string,
    });
    const attribution =
      typeof entry === "string"
        ? {}
        : {
            ...(entry.killedBy !== undefined ? { killedBy: entry.killedBy } : {}),
            ...(entry.killSource !== undefined ? { killSource: entry.killSource } : {}),
            ...(entry.wasStunned !== undefined ? { wasStunned: entry.wasStunned } : {}),
          };
    total += dispatchEvent(ctx, { cardId, owner, type: "die", ...attribution });
  }
  draftWithLog.__recentDeathsDepth = (draftWithLog.__recentDeathsDepth ?? 1) - 1;
  if (isOutermost) {
    // Cascade has settled — trim back to what existed before this
    // Outermost call so the next batch sees a clean log. We don't simply
    // `length = 0` because a re-entrant Deathknell might `play` from the
    // Log; truncating to startLen is correct (start was 0 for outermost,
    // So this effectively clears it).
    draftWithLog.recentDeaths.length = startLen;
  }
  return total;
}

/**
 * Internal shape we attach to the draft for the recent-deaths bookkeeping —
 * mirrors what's declared in `types/game-state.ts` but adds the cascade-depth
 * counter (kept off the public type because it's a dispatcher implementation
 * detail).
 */
interface RecentDeathsDraft {
  recentDeaths?: { cardId: string; owner: string }[];
  __recentDeathsDepth?: number;
}
