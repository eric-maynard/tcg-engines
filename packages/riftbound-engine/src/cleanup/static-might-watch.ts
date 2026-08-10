/**
 * "Becomes [Mighty]" for Might a MOVE changes through a static ability.
 *
 * rule 522 / 709 / 780 — a location-scoped static ("Units here have +1
 * [Might]") applies continuously, so a unit that moves onto that battlefield
 * crosses the Mighty threshold WHILE IN PLAY: it "becomes Mighty" and Grand
 * Duelist-style triggers fire. Effect-driven Might writes report their own
 * crossing at the write site (`abilities/effects/_helpers.ts
 * checkBecomesMighty`); a static has no write site — the number changes
 * because the board changed — so the crossing is spotted here, around the
 * move: snapshot the board's effective Mights BEFORE the reducer, compare
 * after its Cleanup has re-applied the statics (rule 319.8).
 *
 * Only units already on the board before the move are watched: a unit that
 * ARRIVES already over the threshold never changed from below it while in
 * play, so it did not "become" Mighty (the FAQ's Fiora-onto-War-Camp case).
 */

import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { fireTriggers } from "../abilities/trigger-runner";
import { getCardEffectiveMight } from "../game-definition/moves/play/cost";
import type { RiftboundCardMeta, RiftboundGameState } from "../types";

/** rule 780 — [Mighty] is 5 or more Might. */
const MIGHTY_THRESHOLD = 5;

interface MightWatchContext {
  cards: {
    getCardMeta: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined;
    getCardOwner: (cardId: CoreCardId) => string | undefined;
    getCardController?: (cardId: CoreCardId) => string | undefined;
  };
  zones: {
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
  };
}

/** Every unit currently in a base or at a battlefield. */
function boardUnitIds(draft: RiftboundGameState, context: MightWatchContext): string[] {
  const ids: string[] = [];
  for (const playerId of Object.keys(draft.players ?? {})) {
    ids.push(
      ...(context.zones.getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId) ?? []).map(
        (id) => id as string,
      ),
    );
  }
  for (const bfId of Object.keys(draft.battlefields ?? {})) {
    ids.push(
      ...(context.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId) ?? []).map(
        (id) => id as string,
      ),
    );
  }
  return ids;
}

function snapshotBoardMight(
  draft: RiftboundGameState,
  context: MightWatchContext,
): Map<string, number> {
  const getMeta = (id: CoreCardId) => context.cards.getCardMeta(id);
  const snapshot = new Map<string, number>();
  for (const id of boardUnitIds(draft, context)) {
    snapshot.set(id, getCardEffectiveMight(id, getMeta));
  }
  return snapshot;
}

/**
 * Fire `become-mighty` for every watched unit that is still on the board and
 * crossed the threshold upward since the snapshot.
 */
function fireStaticBecomeMighty(
  draft: RiftboundGameState,
  context: MightWatchContext,
  before: Map<string, number>,
): void {
  const getMeta = (id: CoreCardId) => context.cards.getCardMeta(id);
  for (const id of boardUnitIds(draft, context)) {
    const was = before.get(id);
    if (was === undefined || was >= MIGHTY_THRESHOLD) {
      continue;
    }
    if (getCardEffectiveMight(id, getMeta) < MIGHTY_THRESHOLD) {
      continue;
    }
    const owner =
      context.cards.getCardController?.(id as CoreCardId) ??
      context.cards.getCardOwner(id as CoreCardId) ??
      "";
    fireTriggers({ cardId: id, owner, type: "become-mighty" }, {
      ...(context as object),
      draft,
    } as unknown as Parameters<typeof fireTriggers>[1]);
  }
}

/**
 * Wrap a move-definition map so each reducer runs inside the snapshot →
 * reducer (+ its Cleanup) → compare watch above. Apply OUTSIDE
 * `withPostMoveCleanup` so the statics have already been re-applied when the
 * comparison runs.
 */
export function withStaticMightWatch<
  // biome-ignore lint/suspicious/noExplicitAny: structural pass-through wrapper
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
      // biome-ignore lint/suspicious/noExplicitAny: structural pass-through wrapper
      reducer: (draft: any, context: any) => {
        const watchable = Boolean(context?.cards?.getCardMeta && context?.zones?.getCardsInZone);
        const before = watchable
          ? snapshotBoardMight(draft as RiftboundGameState, context as MightWatchContext)
          : undefined;
        originalReducer(draft, context);
        if (before) {
          fireStaticBecomeMighty(draft as RiftboundGameState, context as MightWatchContext, before);
        }
      },
    };
  }
  return wrapped as TMoves;
}
