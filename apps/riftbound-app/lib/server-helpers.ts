/**
 * Pure helpers extracted from `server.ts` so they can be unit-tested
 * without booting Bun.serve (which would race port 3000).
 *
 * Phase B batch 23 (WW#2 / WW#3 / WW#4 / snapshot-lag).
 */

import type { EngineSession } from "./engine-session";

/* --- Goal A: playFromHand error routing ---------------------------------- */

/**
 * Map a card-pool `cardType` (e.g. "Unit", "Spell", "Gear", "Equipment") to
 * the engine move id that plays that kind of card. Case-insensitive. Returns
 * `undefined` if the card type is unknown / unspecified — callers should
 * fall back to trying all play-move kinds in order.
 *
 * Phase B batch 23 Goal A: by knowing the exact card type we can surface
 * the RIGHT engine error (e.g. "not enough energy" from `playUnit`) instead
 * of the misleading "Move 'playCard' not found".
 */
export function playMoveForCardType(cardType: string | undefined): string | undefined {
  if (!cardType) {return undefined;}
  switch (cardType.toLowerCase()) {
    case "unit":
    case "champion":
    case "legend": {
      return "playUnit";
    }
    case "spell": {
      return "playSpell";
    }
    case "gear": {
      return "playGear";
    }
    case "equipment": {
      return "playEquipment";
    }
    default: {
      return undefined;
    }
  }
}

/**
 * Result of attempting to play a card from hand via the `playFromHand` UI
 * alias. `ok` is true iff one of the engine-level play moves succeeded.
 * On failure, `error` carries the engine-derived error message for the
 * MATCHING play kind (resolved via `cardType` on the hand-view enrichment).
 * If `cardType` is unknown the error carries the last-attempt's message
 * with a helpful prefix so the operator can fix the routing.
 */
export interface PlayFromHandResult {
  readonly ok: boolean;
  readonly error?: string;
  /** Which engine move succeeded / was the last attempt. For debugging. */
  readonly attemptedMoveId?: string;
}

export function tryPlayFromHand(
  session: EngineSession,
  playerId: string,
  params: Record<string, unknown>,
): PlayFromHandResult {
  const cardId = params.cardId as string | undefined;

  // 1) Look up the card's type so we can attempt the RIGHT move first and
  // Surface its specific engine error message.
  let cardType: string | undefined;
  const hand = session.buildHandView();
  const ownerCards = hand[playerId] ?? [];
  for (const c of ownerCards) {
    if (c.id === cardId) {
      ({ cardType } = c);
      break;
    }
  }
  if (!cardType) {
    for (const pid of Object.keys(hand)) {
      for (const c of hand[pid] ?? []) {
        if (c.id === cardId) {
          ({ cardType } = c);
          break;
        }
      }
      if (cardType) {break;}
    }
  }

  const preferred = playMoveForCardType(cardType);

  // Order: preferred-first (so its error wins), then the remaining play
  // Moves in the legacy fallback order so weird/unknown card types still
  // Succeed if exactly one engine move accepts them.
  //
  // NOTE: `playCard` is intentionally NOT in this list. There is no engine
  // Move by that name — including it just polluted every fallback-failure
  // Message with the misleading "Move 'playCard' not found" string that
  // Motivated WW#2 in the first place.
  const fallback = ["playUnit", "playSpell", "playGear", "playEquipment"] as const;
  const seen = new Set<string>();
  const tryMoves: string[] = [];
  if (preferred) {
    tryMoves.push(preferred);
    seen.add(preferred);
  }
  for (const m of fallback) {
    if (!seen.has(m)) {
      tryMoves.push(m);
      seen.add(m);
    }
  }

  let preferredErr: string | undefined;
  let lastErr: string | undefined;
  for (const candidate of tryMoves) {
    const r = session.applyMove(playerId, {
      moveId: candidate,
      params: { cardId, playerId, ...params },
    });
    if (r.success) {
      return { attemptedMoveId: candidate, ok: true };
    }
    if (candidate === preferred && preferredErr === undefined) {
      preferredErr = r.error;
    }
    lastErr = r.error;
  }

  if (preferred) {
    return {
      attemptedMoveId: preferred,
      error: preferredErr ?? lastErr ?? "play move failed",
      ok: false,
    };
  }
  const fallbackErr = lastErr ?? "no candidate moves matched";
  return {
    attemptedMoveId: undefined,
    error: `All play moves failed for cardType=${cardType ?? "<unknown>"}; engine said: ${fallbackErr}`,
    ok: false,
  };
}

/* --- Goal B: Step-Bot human-guard --------------------------------------- */

/**
 * Per-session set of player IDs the *human* controls. Step-Bot must NEVER
 * advance these — otherwise the bot auto-plays the human's hand for them.
 * Defaults to `{"player-1"}` for any session not explicitly registered.
 */
const sessionHumanPlayerIds = new Map<string, Set<string>>();

export function getHumanPlayerIds(sessionId: string): Set<string> {
  return sessionHumanPlayerIds.get(sessionId) ?? new Set(["player-1"]);
}

export function setHumanPlayerIds(sessionId: string, ids: ReadonlySet<string>): void {
  sessionHumanPlayerIds.set(sessionId, new Set(ids));
}

/* --- Phase B batch 26 GGG: combat-move routing --------------------------- */

/**
 * Result of routing a combat / chain move through the v2 `/api/v2/move`
 * handler. Mirrors `PlayFromHandResult` shape for symmetry. Callers use
 * `routeCombatOrChainMove` instead of calling `session.applyMove` directly
 * so we can centralize validation (e.g. "is this an allow-listed move id")
 * and unit-test the routing without booting Bun.serve.
 */
export interface CombatRouteResult {
  readonly ok: boolean;
  readonly error?: string;
  /** True iff `moveId` was in the combat/chain allow-list and forwarded. */
  readonly routed: boolean;
}

/**
 * Route a combat / chain move to `session.applyMove`. Returns
 * `{ok:false, routed:false}` for unknown move ids so the v2 handler can
 * fall through to the generic engine-dispatch path. This keeps the
 * combat-move surface explicit (and audit-able) while still letting
 * generic engine moves pass through.
 *
 * `params.playerId` is auto-filled from `playerId` if absent — every combat
 * move except `resolveCombat` / `resolveFullCombat` requires it.
 */
export function routeCombatOrChainMove(
  session: EngineSession,
  playerId: string,
  moveId: string,
  params: Record<string, unknown>,
): CombatRouteResult {
  if (!COMBAT_AND_CHAIN_MOVE_IDS.has(moveId)) {
    return { ok: false, routed: false };
  }
  const merged: Record<string, unknown> = { ...params };
  if (merged.playerId === undefined) {
    merged.playerId = playerId;
  }
  const r = session.applyMove(playerId, { moveId, params: merged });
  return { error: r.error, ok: r.success, routed: true };
}

/* --- Goal C: actionsLegal ------------------------------------------------ */

export interface ActionsLegal {
  readonly endTurn: boolean;
  readonly stepBot: boolean;
  /**
   * Phase B batch 26 GGG — combat / chain action legality flags. Derived from
   * the engine's per-player `legalMoves` enumeration so the SPA can enable
   * the corresponding CombatPanel / ChainPanel buttons up front instead of
   * round-tripping a doomed move. Each flag is true iff the active player
   * has at least one matching move in `legalMoves`.
   *
   * - `contestBattlefield`: player has units at a contestable battlefield.
   * - `startShowdown`: player can open a showdown right now.
   * - `passShowdownFocus`: player currently has focus on the showdown.
   * - `passChainPriority`: player currently has priority on the chain.
   * - `resolveCombat`: a combat is ready to resolve.
   * - `assignAttacker`: player has at least one unit eligible to mark as attacker.
   * - `assignDefender`: player has at least one unit eligible to mark as defender.
   */
  readonly contestBattlefield: boolean;
  readonly startShowdown: boolean;
  readonly passShowdownFocus: boolean;
  readonly passChainPriority: boolean;
  readonly resolveCombat: boolean;
  readonly assignAttacker: boolean;
  readonly assignDefender: boolean;
}

/**
 * Set of move ids the SPA's `/api/v2/move` handler accepts as combat / chain
 * moves and forwards through to the engine without playFromHand routing.
 * Exported so server.ts and tests share the same allow-list.
 */
export const COMBAT_AND_CHAIN_MOVE_IDS = new Set<string>([
  "assignAttacker",
  "assignDefender",
  "assignDamage",
  "contestBattlefield",
  "startShowdown",
  "endShowdown",
  "passShowdownFocus",
  "passChainPriority",
  "resolveChain",
  "resolveCombat",
  "resolveFullCombat",
  "conquerBattlefield",
]);

/**
 * Compute the SPA-facing `actionsLegal` flags for a session. The SPA uses
 * these to disable buttons up-front rather than round-tripping a move
 * just to surface a "condition not met" error.
 */
export function computeActionsLegal(
  session: EngineSession,
  sessionId: string,
): { actionsLegal: ActionsLegal; whoseTurnNow: "human" | "bot" } {
  const view = session.getView();
  const {activePlayer} = view.turn;
  const activeLegal = session.legalMoves(activePlayer);
  const has = (id: string): boolean => activeLegal.some((m) => m.moveId === id);
  const endTurnLegal = has("endTurn");
  const humanIds = getHumanPlayerIds(sessionId);
  const whoseTurnNow: "human" | "bot" = humanIds.has(activePlayer) ? "human" : "bot";
  const stepBotLegal = whoseTurnNow === "bot" && view.status === "playing";
  return {
    actionsLegal: {
      assignAttacker: has("assignAttacker"),
      assignDefender: has("assignDefender"),
      contestBattlefield: has("contestBattlefield"),
      endTurn: endTurnLegal,
      passChainPriority: has("passChainPriority"),
      passShowdownFocus: has("passShowdownFocus"),
      resolveCombat: has("resolveCombat") || has("resolveFullCombat"),
      startShowdown: has("startShowdown"),
      stepBot: stepBotLegal,
    },
    whoseTurnNow,
  };
}
