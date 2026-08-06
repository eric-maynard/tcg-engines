/**
 * Scoring Rules
 *
 * Helpers that read battlefield card abilities at runtime to answer
 * "can this player score at this battlefield right now?". Used by
 * battlefields like Forgotten Monument ("Players can't score here until
 * their third turn.") whose rules gate scoring on per-player state.
 *
 * This module intentionally consults the card registry directly so win
 * checks in movereducers and flow hooks can gate scoring without
 * plumbing card-registry contexts through every call site.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import {
  findAllReplacements,
  markReplacementConsumed,
  type ReplacementContext,
} from "../abilities/replacement-effects";
import type { PlayerId, RiftboundGameState } from "../types";
import { getGlobalCardRegistry } from "./card-lookup";

/**
 * Engine surface needed to look up and apply a `score` replacement.
 */
export interface ScoreReplacementIO {
  readonly zones: {
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
    drawCards: (params: {
      count: number;
      from: CoreZoneId;
      to: CoreZoneId;
      playerId: CorePlayerId;
    }) => unknown;
  };
  readonly cards: {
    getCardOwner?: (cardId: CoreCardId) => string | undefined;
    getCardMeta?: (cardId: CoreCardId) => unknown;
  };
}

/**
 * Evaluate a replacement ability's condition against the *scoring* player
 * (Otterpus: "during their first or second turn" is the scorer's turn count).
 */
function scoreReplacementConditionMet(
  condition: unknown,
  state: RiftboundGameState,
  playerId: PlayerId,
): boolean {
  if (!condition || typeof condition !== "object") {
    return true;
  }
  const c = condition as { type?: string; threshold?: number; condition?: unknown };
  if (c.type === "not") {
    return !scoreReplacementConditionMet(c.condition, state, playerId);
  }
  if (c.type === "turn-count-at-least") {
    return (state.players[playerId]?.turnsTaken ?? 0) >= (c.threshold ?? 0);
  }
  return true;
}

/**
 * Rule 571.4: before a player scores a point from conquering/holding, consult
 * board `replaces: "score"` replacement abilities (e.g. Otterpus — "they draw
 * 1 instead"). Returns `true` when the point was replaced and must NOT be
 * awarded; the replacement effect has already been applied.
 */
export function applyScoreReplacement(
  state: RiftboundGameState,
  playerId: PlayerId,
  io: ScoreReplacementIO,
): boolean {
  const ctx: ReplacementContext = {
    cards: {
      getCardMeta: (io.cards.getCardMeta ??
        (() => undefined)) as ReplacementContext["cards"]["getCardMeta"],
      getCardOwner: io.cards.getCardOwner ?? (() => undefined),
    },
    draft: state,
    zones: { getCardsInZone: io.zones.getCardsInZone },
  };
  const matches = findAllReplacements(
    { amount: 1, owner: playerId, playerId, type: "score" },
    ctx,
  );
  for (const match of matches) {
    if (!scoreReplacementConditionMet(match.condition, state, playerId)) {
      continue;
    }
    const replacement = match.replacement as { type?: string; amount?: number } | "prevent";
    if (replacement === "prevent") {
      markReplacementConsumed(state, match);
      return true;
    }
    if (replacement?.type === "draw") {
      io.zones.drawCards({
        count: replacement.amount ?? 1,
        from: "mainDeck" as CoreZoneId,
        playerId: playerId as CorePlayerId,
        to: "hand" as CoreZoneId,
      });
      markReplacementConsumed(state, match);
      return true;
    }
    // Unknown replacement shape: don't silently eat the point.
  }
  return false;
}

/**
 * A battlefield card ability with a static `prevent-score` effect blocks
 * scoring at the battlefield for any player whose state fails the ability's
 * condition. Conditions are matched by type below.
 */
interface PreventScoreCondition {
  readonly type?: string;
  readonly threshold?: number;
  readonly player?: "controller" | "any";
}

/**
 * Returns `true` if `playerId` is allowed to score at the battlefield
 * identified by `battlefieldId`, given the battlefield card's abilities.
 *
 * Defaults to `true` when no gating ability is present.
 */
export function canPlayerScoreAtBattlefield(
  state: RiftboundGameState,
  playerId: PlayerId,
  battlefieldId: string,
): boolean {
  // Battlefield cards share their card-instance ID with the battlefield key
  // In `state.battlefields`, so we can look up the card registry directly.
  const registry = getGlobalCardRegistry();
  const abilities = registry.getAbilities(battlefieldId) ?? [];

  for (const ability of abilities) {
    if (ability.type !== "static") {
      continue;
    }
    const effect = ability.effect as { type?: string } | undefined;
    if (effect?.type !== "prevent-score") {
      continue;
    }
    const condition = ability.condition as PreventScoreCondition | undefined;
    if (!condition) {
      // Unconditional prevent-score: always blocks.
      return false;
    }
    if (isBlockedBy(condition, state, playerId)) {
      return false;
    }
  }

  // Not blocked by this battlefield; other battlefields cannot block
  // Scoring at a different battlefield (rules text is "here"-scoped).
  return true;
}

/**
 * Returns `true` when the condition indicates scoring should be blocked
 * for the given player. Used by static `prevent-score` abilities.
 *
 * Supported condition types:
 *
 * - `turn-count-at-least`: blocks scoring until `player.turnsTaken >= threshold`.
 *   Used by Forgotten Monument ("Players can't score here until their third turn.")
 */
function isBlockedBy(
  condition: PreventScoreCondition,
  state: RiftboundGameState,
  playerId: PlayerId,
): boolean {
  const condType = condition.type ?? "";
  if (condType === "turn-count-at-least") {
    const threshold = condition.threshold ?? 0;
    const player = state.players[playerId];
    const turnsTaken = player?.turnsTaken ?? 0;
    // Block while below threshold.
    return turnsTaken < threshold;
  }
  // Unknown condition type: fail closed (do not block) so novel
  // Abilities don't silently hard-stop scoring.
  return false;
}
