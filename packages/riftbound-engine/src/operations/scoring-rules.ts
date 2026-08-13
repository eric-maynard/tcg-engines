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
 * plumbing card-registry contexts through every call site. Point gains
 * themselves go through `operations/points.ts` (awardPoints).
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

/** rule 372 — a stable key for one matched `score` replacement. */
const scoreMatchKey = (m: { sourceCardId: string; abilityIndex: number }): string =>
  `${m.sourceCardId}#${m.abilityIndex}`;

/** rule 372.1 — the order slot is the SCORING player's, per gain method. */
export const scoreOrderKey = (playerId: PlayerId, method: "conquer" | "hold"): string =>
  `${playerId}|${method}`;

/**
 * What `applyScoreReplacement` did:
 *  - `"none"`     — no replacement applied; the point is gained as normal.
 *  - `"replaced"` — one replacement applied (370.2 — exactly one per event);
 *                   the point must NOT be awarded.
 *  - `"asked"`    — rule 372.1: several replacements qualified and the scoring
 *                   player has been asked which applies first. Nothing has been
 *                   applied and NO point is awarded yet; the answer records the
 *                   order and re-runs the award (`pending-choice.ts`
 *                   `resumePending` case "score-order").
 */
export type ScoreReplacementOutcome = "none" | "replaced" | "asked";

/**
 * Rule 443.1.a / 571.4: before a player scores a point from conquering/holding,
 * consult board `replaces: "score"` replacement abilities (e.g. Otterpus —
 * "they draw 1 instead"). Called only from `operations/points.ts awardPoints` —
 * the single point-gain choke point.
 *
 * rule 372 / 372.1 — when MORE THAN ONE qualifies for the same point, the
 * player being acted on (the SCORING player, not the replacements' controller)
 * decides which applies first. That is a real decision, so it is a
 * `pendingChoice` like every other: the award suspends, the answer is recorded
 * on `draft.scoreReplacementOrder` and the award re-runs. Exactly one of them
 * then applies (370.2), and the loser stays unconsumed for the next point.
 */
export function applyScoreReplacement(
  state: RiftboundGameState,
  playerId: PlayerId,
  io: ScoreReplacementIO,
  /**
   * rule 443.1.a: how the point is being gained. Replacements that declare a
   * `method` only match (and are only consumed by) the same method. rule 468:
   * only Hold / Conquer are Scoring, so points from effects or Burn Out are
   * never touched by a "would score" replacement.
   */
  method: "conquer" | "hold" | "effect" | "burn-out",
  /** rule 372.1 — what to re-run once the order is answered. */
  resume?: { readonly amount: number; readonly cause: unknown },
): ScoreReplacementOutcome {
  if (method !== "conquer" && method !== "hold") {
    return "none";
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
    { amount: 1, method, owner: playerId, playerId, type: "score" },
    ctx,
  );
  // Only the ones that could actually apply are candidates: a condition that
  // fails, or a shape this engine cannot execute, is not "a replacement that
  // applies to the event" and so is not part of the 372.1 question either.
  const eligible = matches.filter((m) => {
    if (!scoreReplacementConditionMet(m.condition, state, playerId)) {
      return false;
    }
    const r = m.replacement as { type?: string } | "prevent";
    return r === "prevent" || r?.type === "draw";
  });
  if (eligible.length === 0) {
    return "none";
  }
  const key = scoreOrderKey(playerId, method);
  const recorded = state.scoreReplacementOrder?.[key];
  if (eligible.length > 1 && recorded === undefined) {
    // rule 372.1 — ask, unless we cannot: another prompt already owns the one
    // pendingChoice slot, or the caller gave us nothing to re-run (a unit-test
    // stub). Then fall through to board order, which is what the engine did
    // before this question existed.
    if (state.pendingChoice === undefined && resume !== undefined) {
      (state as { pendingChoice?: unknown }).pendingChoice = {
        items: eligible.map((m) => ({ cardId: m.sourceCardId, key: scoreMatchKey(m) })),
        playerId,
        prompt: "Order the replacement effects that apply to this point (first = applied first)",
        resume: { amount: resume.amount, cause: resume.cause, kind: "score-order", method, playerId },
        type: "order",
      };
      return "asked";
    }
  }
  const ordered =
    recorded === undefined
      ? eligible
      : [...eligible].sort((a, b) => {
          const ia = recorded.indexOf(scoreMatchKey(a));
          const ib = recorded.indexOf(scoreMatchKey(b));
          return (ia < 0 ? Number.MAX_SAFE_INTEGER : ia) - (ib < 0 ? Number.MAX_SAFE_INTEGER : ib);
        });
  // rule 370.2 — exactly ONE replacement applies to the event; the rest are not
  // consumed and remain available for a later point.
  if (recorded !== undefined && state.scoreReplacementOrder !== undefined) {
    delete state.scoreReplacementOrder[key];
  }
  for (const match of ordered) {
    const replacement = match.replacement as { type?: string; amount?: number } | "prevent";
    if (replacement === "prevent") {
      markReplacementConsumed(state, match);
      return "replaced";
    }
    if (replacement?.type === "draw") {
      io.zones.drawCards({
        count: replacement.amount ?? 1,
        from: "mainDeck" as CoreZoneId,
        playerId: playerId as CorePlayerId,
        to: "hand" as CoreZoneId,
      });
      markReplacementConsumed(state, match);
      return "replaced";
    }
  }
  return "none";
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
