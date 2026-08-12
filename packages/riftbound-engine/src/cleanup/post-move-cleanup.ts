/**
 * Post-move cleanup hook (rules 518-526 + 540.x / 813 Deathknell).
 *
 * `performCleanup` runs the state-based checks (kill lethally-damaged units,
 * clear stale combat roles, recalc static effects, …). Historically only a
 * handful of move reducers opted into running it — so a state change that made
 * a unit lethal *after* an unrelated move (e.g. a static-ability Might shift
 * triggered by a movement or gear-equip) wasn't reaped until the next opt-in
 * move ran.
 *
 * `cleanupAndFireDeaths` centralises the post-mutation housekeeping:
 *   1. run `performCleanup`
 *   2. fire `die` triggers (Deathknell etc.) for everything it killed
 *   3. run one cascade pass for deaths caused by those triggers
 *
 * `withPostMoveCleanup` wraps a whole move-definition map so every reducer runs
 * `cleanupAndFireDeaths` after it returns. It is **idempotent**: a move that
 * already ran cleanup itself will simply find nothing left to do (cleanup
 * clears the damage on units it kills, so a second pass can't re-find them and
 * can't double-fire `die` triggers for the same death).
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import type { DispatchContext } from "../events/dispatcher";
import { runStateMaintenance } from "../events/dispatcher";
import type { CleanupOptions } from "./state-based-checks";
import type { RiftboundCardMeta } from "../types";

/**
 * The slice of a move reducer's `context` that the cleanup pass needs. Every
 * Riftbound move reducer's `context` is a superset of this, so it can be
 * passed straight through.
 */
export interface PostMoveCleanupContext {
  cards: {
    getCardMeta: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined;
    getCardOwner: (cardId: CoreCardId) => string | undefined;
    updateCardMeta: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void;
  };
  counters: {
    getCounter: (cardId: CoreCardId, counter: string) => number;
    clearCounter: (cardId: CoreCardId, counter: string) => void;
    setFlag: (cardId: CoreCardId, flag: string, value: boolean) => void;
  };
  zones: {
    moveCard: (params: { cardId: CoreCardId; targetZoneId: CoreZoneId }) => void;
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
  };
}

/**
 * Run static-effect recalc + state-based checks, then emit `die` events for
 * everything reaped (which re-enter the dispatcher → Deathknell etc. →
 * possible further deaths), looping until the state is stable.
 *
 * This is now a **thin delegate to {@link runStateMaintenance}** — the
 * dispatcher owns the "static recalc + SBA + death-emission" pipeline; this
 * wrapper just adapts a {@link PostMoveCleanupContext} (the slice a move
 * reducer's `context` exposes) to a {@link DispatchContext} and hands off.
 * Kept as a belt-and-suspenders post-move / post-effect / flow-hook hook for
 * the (few) state-changing paths that don't themselves emit a recalc-relevant
 * event through `dispatchEvent`; it's idempotent, so calling it after a path
 * that *did* run maintenance via the dispatcher finds nothing left to do.
 */
export function cleanupAndFireDeaths<TState>(
  draft: TState,
  context: PostMoveCleanupContext,
  opts: CleanupOptions = {},
): void {
  // Adapt the move/flow context slice to a `DispatchContext`. The structural
  // Shapes overlap (cards / counters / zones operation bags); cast bridges
  // Without dragging the full generics in. `runStateMaintenance` reads
  // `counters.getCounter`/`clearCounter`/`setFlag` and `zones.{moveCard,
  // GetCardsInZone}` — all present on a real move/flow context.
  const dispatchCtx = {
    cards: context.cards,
    counters: context.counters,
    draft,
    zones: context.zones,
  } as unknown as DispatchContext;
  runStateMaintenance(dispatchCtx, opts);
}

/**
 * Wrap every move in a move-definition map so that, after each reducer runs,
 * `cleanupAndFireDeaths` runs against the resulting state. This is the
 * engine-wide post-move state-based-checks hook (rules 518-526): it guarantees
 * a unit that becomes lethal as a side effect of *any* move is reaped (and
 * fires its Deathknell) before the next move begins, instead of only when a
 * move that happens to call cleanup itself runs next.
 *
 * Reducers that already call cleanup keep working unchanged — the wrapper's
 * extra pass is a no-op when there's nothing left to clean up.
 */
export function withPostMoveCleanup<
  // Biome-ignore lint/suspicious/noExplicitAny: structural pass-through wrapper
  TMoves extends Record<string, { reducer: (draft: any, context: any) => void } | undefined>,
>(moves: TMoves): TMoves {
  const wrapped = {} as Record<string, unknown>;
  for (const [name, move] of Object.entries(moves)) {
    if (!move) {
      wrapped[name] = move;
      continue;
    }
    const originalReducer = move.reducer;
    wrapped[name] = {
      ...move,
      // Biome-ignore lint/suspicious/noExplicitAny: structural pass-through wrapper
      reducer: (draft: any, context: any) => {
        originalReducer(draft, context);
        // `context` from a real move always carries the cards/counters/zones
        // Operation bags; guard anyway so unit-test stubs don't crash.
        if (context?.cards && context?.counters && context?.zones) {
          cleanupAndFireDeaths(draft, context as PostMoveCleanupContext);
        }
      },
    };
  }
  return wrapped as TMoves;
}
