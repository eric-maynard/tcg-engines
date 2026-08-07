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
 * rule 471.1.b.1: a player at match point only takes the Final Point by
 * conquering if they have scored EVERY battlefield on the board this turn —
 * including any token battlefield such as the Baron Pit. Otherwise they draw a
 * card instead of scoring. Winning by hold carries no such requirement
 * (rule 471.1.a.1), so this gate is only consulted on conquer paths.
 *
 * Returns `true` when the point must NOT be awarded: the replacement draw has
 * already happened, and the caller must also skip recording the battlefield in
 * `scoredThisTurn` (it was conquered, not scored, so scoring it later this turn
 * after the remaining battlefields is still legal).
 */
export function finalPointConquerDrawsInstead(
  state: RiftboundGameState,
  playerId: PlayerId,
  battlefieldId: string,
  io: ScoreReplacementIO,
): boolean {
  const player = state.players[playerId];
  if (!player) {
    return false;
  }
  // Same threshold as win-conditions/victory.getEffectiveVictoryScore, inlined
  // to keep operations/ free of a game-definition/ import cycle.
  const threshold = (state.victoryScore ?? 8) + (player.victoryScoreModifier ?? 0);
  if (player.victoryPoints !== threshold - 1) {
    return false;
  }
  const scored = state.scoredThisTurn[playerId] ?? [];
  const allScored = Object.keys(state.battlefields ?? {}).every(
    (bfId) => bfId === battlefieldId || scored.includes(bfId),
  );
  if (allScored) {
    return false;
  }
  io.zones.drawCards({
    count: 1,
    from: "mainDeck" as CoreZoneId,
    playerId: playerId as CorePlayerId,
    to: "hand" as CoreZoneId,
  });
  return true;
}

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
 * rule 054.1 / 365.1: is `playerId` forbidden from gaining points right now by a
 * static restriction on a card that is currently ON THE BOARD (base or a
 * battlefield)? The shape the parser emits for "Opponents can't gain points."
 * is `{type:"static", effect:{type:"restriction", restriction:"opponents can't
 * gain points."}}`. Nothing is retroactive: the denial only counts while the
 * card is on the board, which is why this is evaluated at the moment of the gain.
 *
 * Conditional deniers ("while I'm at a battlefield") are NOT evaluated here and
 * fail open, so a novel condition never silently stops scoring.
 */
export function pointGainDenied(
  state: RiftboundGameState,
  playerId: PlayerId,
  io: ScoreReplacementIO,
): boolean {
  const registry = getGlobalCardRegistry();
  const getOwner = io.cards.getCardOwner ?? (() => undefined);

  const boardCards: { id: string; owner: string | undefined }[] = [];
  for (const pid of Object.keys(state.players)) {
    for (const cardId of io.zones.getCardsInZone("base" as CoreZoneId, pid as CorePlayerId)) {
      boardCards.push({ id: cardId as string, owner: pid });
    }
  }
  for (const bfId of Object.keys(state.battlefields ?? {})) {
    for (const cardId of io.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId)) {
      boardCards.push({ id: cardId as string, owner: getOwner(cardId as CoreCardId) });
    }
  }

  for (const card of boardCards) {
    for (const ability of registry.getAbilities(card.id) ?? []) {
      if (ability.type !== "static" || ability.condition !== undefined) {
        continue;
      }
      const effect = ability.effect as { type?: string; restriction?: unknown } | undefined;
      if (effect?.type !== "restriction" || typeof effect.restriction !== "string") {
        continue;
      }
      const text = effect.restriction.toLowerCase();
      if (!/can'?t gain points/.test(text)) {
        continue;
      }
      const targetsOpponents = text.includes("opponent") || text.includes("enemy");
      if (targetsOpponents ? card.owner !== undefined && card.owner !== playerId : true) {
        return true;
      }
    }
  }
  return false;
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
  // rule 054.1: a static "opponents can't gain points" beats "can"; it removes
  // the POINT only — the Score itself still happened, so callers keep recording
  // scoredThisTurn and still fire Conquer/Hold triggers (383.4.c.2.c).
  if (pointGainDenied(state, playerId, io)) {
    return true;
  }
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
