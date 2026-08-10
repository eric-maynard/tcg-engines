/**
 * Points / victory pipeline — the single choke point for every change to a
 * player's `victoryPoints` and for ending the game on points.
 *
 * rule 468–471: Scoring (Hold / Conquer) is one way of Gaining points; card
 * effects ("you gain 1 point") and Burn Out are the others. Every path funnels
 * through {@link awardPoints}, which applies, in order:
 *   (a) rule 054.1 — "can't gain points" statics deny the gain (except the
 *       unpreventable repeat Burn Out points, rule 431.3.b);
 *   (b) rule 443 / 367 — `score` replacement effects, matched per METHOD so a
 *       conquer-only skip never eats a Hold point;
 *   (c) rule 471.1.b — the Final Point restriction for Conquer (draw instead
 *       unless every battlefield was scored this turn);
 *   (d) the addition itself.
 * It never ends the game: rule 472 / 323.1 make that the first task of a
 * Cleanup, so {@link checkVictory} is the ONLY writer of `status`/`winner` for a
 * points win — called from `performCleanup`, the Beginning-Phase scoring step
 * and the Burn Out sequence (rule 431.3.c.1).
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import type { GameEvent } from "../abilities/game-events";
import {
  evaluateCondition as evaluateStaticCondition,
  recalculateStaticEffects,
  type StaticAbilityContext,
} from "../abilities/static-abilities";
import { isResolvingChainItem } from "../chain/resolution-guard";
import type { PlayerId, RiftboundGameState } from "../types";
import { getBattlefieldVictoryScoreBonus } from "./battlefield-setup-effects";
import { getGlobalCardRegistry } from "./card-lookup";
import { recordPublicReveal } from "./public-reveal";
import { applyScoreReplacement, canPlayerScoreAtBattlefield } from "./scoring-rules";
import { areAllies, isTeamGame } from "./teams";

/** rule 468.1 / 194.1: how a point is being gained. */
export type PointMethod = "hold" | "conquer" | "effect" | "burn-out";

export interface PointCause {
  readonly method: PointMethod;
  /** Battlefield that Scored (hold / conquer). */
  readonly battlefieldId?: string;
  /** Card whose effect grants the point (effect). */
  readonly sourceCardId?: string;
  /**
   * rule 431.3.b — 0-based position of this Burn Out within one uninterrupted
   * sequence of Burn Outs. Index 0 is an ordinary (deniable / replaceable)
   * gain; every later one can't be replaced or prevented and wins at once.
   */
  readonly sequenceIndex?: number;
}

/**
 * Engine surface the pipeline needs: board zones (denial statics, score
 * replacements, board-derived Victory Score) and `drawCards` (471.1.b.1 and
 * draw-instead replacements). Every move / flow / effect context is a
 * structural superset.
 */
export interface PointsIO extends BoardIO {
  readonly zones: BoardIO["zones"] & {
    drawCards: (params: {
      count: number;
      from: CoreZoneId;
      to: CoreZoneId;
      playerId: CorePlayerId;
    }) => unknown;
  };
}

/** Read-only view of the board: enough to evaluate board-derived statics. */
export interface BoardIO {
  readonly zones: {
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
  };
  readonly cards: {
    getCardOwner?: (cardId: CoreCardId) => string | undefined;
    getCardMeta?: (cardId: CoreCardId) => unknown;
  };
}

export interface AwardResult {
  /** Points actually added. */
  readonly gained: number;
  /** rule 471.1.b.1 — the Final Point restriction turned the point into a draw. */
  readonly drewInstead: boolean;
  /** rule 054.1 — a "can't gain points" static forbade the gain. */
  readonly denied: boolean;
  /** rule 443 / 367 — a `score` replacement effect replaced the point. */
  readonly replaced: boolean;
}

const NO_GAIN: AwardResult = { denied: false, drewInstead: false, gained: 0, replaced: false };

// ---------------------------------------------------------------------------
// Victory Score
// ---------------------------------------------------------------------------

interface VictoryScoreStatic {
  readonly type?: string;
  readonly amount?: number;
  /** Whose threshold moves: default everyone. */
  readonly player?: "self" | "controller" | "opponent" | "opponents" | "all";
}

function victoryScoreDelta(effect: VictoryScoreStatic | undefined): number {
  if (effect?.type === "increase-victory-score") {
    return effect.amount ?? 1;
  }
  if (effect?.type === "modify-victory-score") {
    return effect.amount ?? 0;
  }
  return 0;
}

function staticAppliesToPlayer(
  effect: VictoryScoreStatic,
  sourceOwner: string | undefined,
  playerId: string,
): boolean {
  switch (effect.player) {
    case "self":
    case "controller":
      return sourceOwner === playerId;
    case "opponent":
    case "opponents":
      return sourceOwner !== undefined && sourceOwner !== playerId;
    default:
      return true;
  }
}

/**
 * rule 194.3 / 194.3.a / 365.1 — the number of points `playerId` needs to win:
 * the Mode of Play's Victory Score, plus the player's setup-time modifier, plus
 * every "increase/modify the points needed to win" passive whose source is on
 * the board right now. Battlefields are always visible from `state`; other
 * permanents (base / battlefield zones / legend) are read when `io` is given.
 */
export function effectiveVictoryScore(
  state: RiftboundGameState,
  playerId: PlayerId,
  io?: BoardIO,
): number {
  const player = state.players[playerId];
  // Battlefields in play are known from `state` alone (Aspirant's Climb).
  let threshold =
    (state.victoryScore ?? 8) +
    (player?.victoryScoreModifier ?? 0) +
    getBattlefieldVictoryScoreBonus(state);

  if (io) {
    const registry = getGlobalCardRegistry();
    for (const card of collectBoardPermanents(state, io)) {
      for (const ability of registry.getAbilities(card.id) ?? []) {
        if (ability.type !== "static") {
          continue;
        }
        const effect = ability.effect as VictoryScoreStatic | undefined;
        const delta = victoryScoreDelta(effect);
        if (delta === 0 || !effect || !staticAppliesToPlayer(effect, card.owner, playerId)) {
          continue;
        }
        if (!boardStaticConditionMet(ability.condition, card, state, io)) {
          continue;
        }
        threshold += delta;
      }
    }
  }
  return threshold;
}

/**
 * rule 472 / 323.1 / 194.2: a player has won when their points reach their
 * Victory Score AND they have strictly more points than every opponent.
 */
export function hasReachedVictory(
  state: RiftboundGameState,
  playerId: PlayerId,
  io?: BoardIO,
): boolean {
  const player = state.players[playerId];
  if (!player) {
    return false;
  }
  if (player.victoryPoints < effectiveVictoryScore(state, playerId, io)) {
    return false;
  }
  return Object.entries(state.players).every(
    ([pid, other]) => pid === playerId || player.victoryPoints > (other?.victoryPoints ?? 0),
  );
}

/** The player who currently satisfies rule 472, if any (pure — no writes). */
export function findWinner(
  state: RiftboundGameState,
  io?: BoardIO,
): PlayerId | null {
  for (const playerId of Object.keys(state.players) as PlayerId[]) {
    if (hasReachedVictory(state, playerId, io)) {
      return playerId;
    }
  }
  return null;
}

/**
 * rule 472.2 — an ALTERNATE win condition ("you win the game"). It does not go
 * through the points check, so it is written here rather than by
 * {@link checkVictory}, and it applies immediately on resolution (rule 321's
 * "no Cleanup while a Chain Item resolves" gates the points check only).
 * First writer wins: a game already finished is never re-decided.
 */
export function declareWinner(draft: RiftboundGameState, playerId: string): PlayerId | null {
  if (draft.status !== "playing") {
    return (draft.winner as PlayerId | undefined) ?? null;
  }
  (draft as { status: string }).status = "finished";
  (draft as { winner?: PlayerId }).winner = playerId as PlayerId;
  return playerId as PlayerId;
}

/**
 * rule 472 / 323.1 — the victory check of a Cleanup. The ONLY place a points
 * win sets `status = "finished"` / `winner`. rule 320 / 321: no Cleanup happens
 * while a Chain Item is resolving, so by default this is a no-op mid-resolution
 * (the post-resolution Cleanup runs it); `immediate` overrides that for rule
 * 431.3.c.1 (repeat Burn Out wins without waiting for a Cleanup).
 *
 * @returns the winner written (or already recorded), else null.
 */
export function checkVictory(
  draft: RiftboundGameState,
  opts: { readonly immediate?: boolean; readonly io?: BoardIO } = {},
): PlayerId | null {
  if (draft.status === "finished") {
    return (draft.winner as PlayerId | undefined) ?? null;
  }
  if (draft.status !== "playing") {
    return null;
  }
  if (!opts.immediate && isResolvingChainItem()) {
    return null;
  }
  // rule 321 / 359.3.d — a spell whose effect suspended on a prompt has NOT
  // finished resolving: it still sits in the chain zone owing its "and then
  // trash it" step (`deferredSpellSettle`). The synchronous guard above is
  // already released by then, so the parked settle is what marks the item as
  // still resolving — no Cleanup, hence no victory check, until it is flushed.
  if (!opts.immediate && draft.deferredSpellSettle !== undefined) {
    return null;
  }
  // rule 466.4 / 466.5 — a combat Resolution Step parked on the chain items its
  // result produced has not Established Control yet. No Cleanup interrupts a
  // step in progress (320 / 321), so the victory check waits for 466.5 to run:
  // a "when I win a combat" point must not end the game before the Conquer that
  // follows it is even attempted.
  if (
    !opts.immediate &&
    Object.values(draft.battlefields ?? {}).some((bf) => bf?.combatWinTriggersFired === true)
  ) {
    return null;
  }
  const winner = findWinner(draft, opts.io);
  if (winner) {
    (draft as { status: string }).status = "finished";
    (draft as { winner?: PlayerId }).winner = winner;
    revealFacedownCardsAtGameEnd(draft, opts.io);
  }
  return winner;
}

/**
 * rule 421.4 — "if a facedown card would change zones or if the game ends, its
 * owner reveals it to all players": the game ending is a reveal to everyone, so
 * it lands on the shared public-reveal record (rule 424.1) like every other
 * reveal path.
 */
export function revealFacedownCardsAtGameEnd(draft: RiftboundGameState, io?: BoardIO): void {
  if (!io) {
    return;
  }
  for (const bfId of Object.keys(draft.battlefields ?? {})) {
    for (const cardId of io.zones.getCardsInZone(`facedown-${bfId}` as CoreZoneId)) {
      recordPublicReveal({ draft }, io.cards.getCardOwner?.(cardId) ?? "", [cardId as string]);
    }
  }
}

// ---------------------------------------------------------------------------
// Gaining / losing points
// ---------------------------------------------------------------------------

interface BoardPermanent {
  readonly id: string;
  readonly owner: string | undefined;
  readonly zone: string;
}

function collectBoardPermanents(
  state: RiftboundGameState,
  io: BoardIO,
): BoardPermanent[] {
  const getOwner = io.cards.getCardOwner ?? (() => undefined);
  const out: BoardPermanent[] = [];
  for (const pid of Object.keys(state.players)) {
    for (const zone of ["base", "legendZone"]) {
      for (const cardId of io.zones.getCardsInZone(zone as CoreZoneId, pid as CorePlayerId)) {
        out.push({ id: cardId as string, owner: pid, zone });
      }
    }
  }
  for (const bfId of Object.keys(state.battlefields ?? {})) {
    const zone = `battlefield-${bfId}`;
    for (const cardId of io.zones.getCardsInZone(zone as CoreZoneId)) {
      out.push({ id: cardId as string, owner: getOwner(cardId as CoreCardId), zone });
    }
  }
  return out;
}

/**
 * rule 365.1 — a conditional passive only applies while its condition holds,
 * evaluated with the static-ability condition machinery against the source.
 */
function boardStaticConditionMet(
  condition: unknown,
  source: BoardPermanent,
  state: RiftboundGameState,
  io: BoardIO,
): boolean {
  if (condition === undefined || condition === null || typeof condition !== "object") {
    return true;
  }
  return evaluateStaticCondition(
    condition as Record<string, unknown>,
    { id: source.id, owner: source.owner ?? "", zone: source.zone },
    {
      cards: {
        getCardMeta: (io.cards.getCardMeta ?? (() => undefined)) as never,
        getCardOwner: io.cards.getCardOwner ?? (() => undefined),
        updateCardMeta: () => {},
      },
      draft: state,
      zones: { getCardsInZone: io.zones.getCardsInZone },
    },
  );
}

/**
 * rule 054.1 / 365.1: is `playerId` forbidden from gaining points right now by
 * a "can't gain points" static on a permanent currently on the board? The
 * parser emits `{type:"static", effect:{type:"restriction", restriction:
 * "opponents can't gain points."}, condition?}` (Tianna Crownguard). The
 * denial removes the POINT only — a Hold/Conquer under it is still a Score
 * (rule 383.4.d.2.c), which is why callers keep marking the battlefield and
 * firing the Hold/Conquer trigger.
 */
export function isPointGainDenied(
  state: RiftboundGameState,
  playerId: PlayerId,
  io: BoardIO,
): boolean {
  const registry = getGlobalCardRegistry();
  for (const card of collectBoardPermanents(state, io)) {
    for (const ability of registry.getAbilities(card.id) ?? []) {
      if (ability.type !== "static") {
        continue;
      }
      const effect = ability.effect as { type?: string; restriction?: unknown } | undefined;
      const isDenial =
        effect?.type === "cant-gain-points" ||
        (effect?.type === "restriction" &&
          typeof effect.restriction === "string" &&
          /can(?:'|no)?t gain points/i.test(effect.restriction));
      if (!isDenial) {
        continue;
      }
      const text = typeof effect?.restriction === "string" ? effect.restriction.toLowerCase() : "";
      const targetsOpponents =
        effect?.type === "cant-gain-points"
          ? (effect as { player?: string }).player !== "all"
          : text.includes("opponent") || text.includes("enem");
      if (targetsOpponents && (card.owner === undefined || card.owner === playerId)) {
        continue;
      }
      if (!boardStaticConditionMet(ability.condition, card, state, io)) {
        continue;
      }
      return true;
    }
  }
  return false;
}

/**
 * rule 471.1.b — a Conquer at (Victory Score − 1) or higher only yields the
 * Final Point if the player has Scored EVERY battlefield this turn (the one
 * being conquered included); otherwise they draw 1 instead (471.1.b.1).
 */
function finalPointRestrictionApplies(
  state: RiftboundGameState,
  playerId: PlayerId,
  battlefieldId: string | undefined,
  io: PointsIO,
): boolean {
  const player = state.players[playerId];
  if (!player) {
    return false;
  }
  if (player.victoryPoints < effectiveVictoryScore(state, playerId, io) - 1) {
    return false;
  }
  const scored = state.scoredThisTurn[playerId] ?? [];
  const everyBattlefieldScored = Object.keys(state.battlefields ?? {}).every(
    (bfId) => bfId === battlefieldId || scored.includes(bfId),
  );
  return !everyBattlefieldScored;
}

/**
 * Give `playerId` up to `n` points for `cause`. See the module doc for the
 * order of the gates. Never checks victory (rule 472: that is a Cleanup task).
 */
export function awardPoints(
  draft: RiftboundGameState,
  playerId: PlayerId,
  n: number,
  cause: PointCause,
  io: PointsIO,
): AwardResult {
  const player = draft.players[playerId];
  if (!player || n <= 0) {
    return NO_GAIN;
  }
  // rule 431.3.b — points from a repeat Burn Out can't be replaced or prevented.
  const unpreventable = cause.method === "burn-out" && (cause.sequenceIndex ?? 0) > 0;

  if (!unpreventable && isPointGainDenied(draft, playerId, io)) {
    return { ...NO_GAIN, denied: true };
  }

  if (!unpreventable && applyScoreReplacement(draft, playerId, io, cause.method)) {
    return { ...NO_GAIN, replaced: true };
  }

  if (
    cause.method === "conquer" &&
    finalPointRestrictionApplies(draft, playerId, cause.battlefieldId, io)
  ) {
    // rule 471.1.b.1 — "draw a card instead" is a real draw, so rule 431
    // applies: an empty Main Deck burns out (trash recycled, an opponent gains
    // a point) and only then is the card drawn. A caller whose zones cannot
    // move cards (unit-test stubs) just performs the raw draw.
    const burnIo = io as BurnOutIO;
    if (typeof burnIo.zones.moveCard !== "function" || refillDeckOrBurnOut(draft, playerId, burnIo)) {
      io.zones.drawCards({
        count: 1,
        from: "mainDeck" as CoreZoneId,
        playerId: playerId as CorePlayerId,
        to: "hand" as CoreZoneId,
      });
    }
    return { ...NO_GAIN, drewInstead: true };
  }

  player.victoryPoints += n;
  recordPointsGained(draft, playerId, cause.method, n);
  refreshScoreDependentStatics(draft, io);
  return { ...NO_GAIN, gained: n };
}

/**
 * rule 710 — static abilities apply continuously, so a static whose amount
 * reads a player's points ("My Might is increased by your points") must be
 * re-evaluated the instant the score moves, not at the next player move. Points
 * change inside the turn flow too (Burn Out in the Draw Phase), where no move
 * reducer runs afterwards — and after an immediate win no move ever runs again.
 *
 * `PointsIO` only promises the read side of `cards`; every real engine context
 * is a structural superset that also carries `updateCardMeta`, so the recalc is
 * attempted only when the context can actually write meta.
 */
function refreshScoreDependentStatics(draft: RiftboundGameState, io: PointsIO): void {
  const cards = io.cards as Partial<StaticAbilityContext["cards"]>;
  if (!cards.updateCardMeta || !cards.getCardMeta || !cards.getCardOwner) {
    return;
  }
  recalculateStaticEffects({
    cards: cards as StaticAbilityContext["cards"],
    draft,
    zones: io.zones,
  });
}

// ---------------------------------------------------------------------------
// Per-turn bookkeeping of points actually gained, by method
// ---------------------------------------------------------------------------

type PointsLedger = Partial<Record<PointMethod, number>>;
type PointsLedgerState = { pointsGainedThisTurn?: Record<string, PointsLedger> };

function recordPointsGained(
  draft: RiftboundGameState,
  playerId: PlayerId,
  method: PointMethod,
  n: number,
): void {
  const s = draft as RiftboundGameState & PointsLedgerState;
  const ledger = { ...(s.pointsGainedThisTurn?.[playerId] ?? {}) };
  ledger[method] = (ledger[method] ?? 0) + n;
  s.pointsGainedThisTurn = { ...(s.pointsGainedThisTurn ?? {}), [playerId]: ledger };
}

/**
 * Points `playerId` actually GAINED this turn (after denial / skips / the
 * Final Point draw), optionally for one method — e.g. "for each point you
 * scored from holding this turn" reads `pointsGainedThisTurn(s, p, "hold")`.
 */
export function pointsGainedThisTurn(
  state: RiftboundGameState,
  playerId: PlayerId,
  method?: PointMethod,
): number {
  const ledger = (state as RiftboundGameState & PointsLedgerState).pointsGainedThisTurn?.[
    playerId
  ];
  if (!ledger) {
    return 0;
  }
  if (method) {
    return ledger[method] ?? 0;
  }
  return Object.values(ledger).reduce((a: number, b) => a + (b ?? 0), 0);
}

/** rule 317.2 — the ledger is turn-scoped: cleared with `scoredThisTurn` in the Ending Phase. */
export function clearPointsGainedThisTurn(draft: RiftboundGameState, playerId?: PlayerId): void {
  const s = draft as RiftboundGameState & PointsLedgerState;
  if (!s.pointsGainedThisTurn) {
    return;
  }
  if (playerId === undefined) {
    s.pointsGainedThisTurn = undefined;
    return;
  }
  const { [playerId]: _dropped, ...rest } = s.pointsGainedThisTurn;
  s.pointsGainedThisTurn = rest;
}

/**
 * rule 194.4 — remove up to `n` points, never going below 0 (194.4.a: at 0
 * nothing occurs). Returns the number of points actually lost.
 */
export function losePoints(draft: RiftboundGameState, playerId: PlayerId, n: number): number {
  const player = draft.players[playerId];
  if (!player || n <= 0) {
    return 0;
  }
  const lost = Math.min(n, Math.max(0, player.victoryPoints));
  player.victoryPoints -= lost;
  return lost;
}

// ---------------------------------------------------------------------------
// Burn Out (rule 431)
// ---------------------------------------------------------------------------

export interface BurnOutIO extends PointsIO {
  readonly zones: PointsIO["zones"] & {
    moveCard: (params: { cardId: CoreCardId; targetZoneId: CoreZoneId }) => unknown;
    shuffleZone?: (zoneId: CoreZoneId, playerId?: CorePlayerId) => unknown;
  };
}

/**
 * rule 431.2 — one Burn Out for `playerId`: shuffle their trash into their Main
 * Deck, then an opponent gains 1 point (every opponent in the engine's
 * multiplayer approximation; `opponentId` narrows it to the chosen one).
 * `sequenceIndex` > 0 marks a repeat Burn Out of one uninterrupted sequence:
 * its point is unpreventable (431.3.b) and wins immediately (431.3.c.1).
 *
 * @returns whether the game ended.
 */
export function burnOut(
  draft: RiftboundGameState,
  playerId: PlayerId,
  io: BurnOutIO,
  opts: { readonly sequenceIndex?: number; readonly opponentId?: PlayerId } = {},
): { gameEnded: boolean } {
  const trashCards = io.zones.getCardsInZone("trash" as CoreZoneId, playerId as CorePlayerId);
  for (const cardId of trashCards) {
    io.zones.moveCard({ cardId, targetZoneId: "mainDeck" as CoreZoneId });
  }
  io.zones.shuffleZone?.("mainDeck" as CoreZoneId, playerId as CorePlayerId);

  const sequenceIndex = opts.sequenceIndex ?? 0;
  const opponents = (Object.keys(draft.players) as PlayerId[]).filter(
    (pid) => pid !== playerId && (opts.opponentId === undefined || pid === opts.opponentId),
  );
  for (const opponentId of opponents) {
    awardPoints(draft, opponentId, 1, { method: "burn-out", sequenceIndex }, io);
  }
  const winner = checkVictory(draft, { immediate: sequenceIndex > 0, io });
  return { gameEnded: winner !== null || draft.status !== "playing" };
}

/**
 * rule 431.3 / 431.3.a — a player about to draw with an empty Main Deck burns
 * out; if the trash was empty too the deck stays empty and the retried draw
 * burns out again, repeatedly, until an opponent wins (431.3.c.1). Returns once
 * the deck has cards or the game is over. No-progress guard: with nobody able
 * to reach a win this way the loop stops after a bounded number of repeats and
 * the deck simply stays empty.
 *
 * @returns `true` when a card can now be drawn.
 */
export function refillDeckOrBurnOut(
  draft: RiftboundGameState,
  playerId: PlayerId,
  io: BurnOutIO,
): boolean {
  const cap = 4 * (draft.victoryScore || 8) + 8;
  for (let i = 0; i < cap; i++) {
    if (io.zones.getCardsInZone("mainDeck" as CoreZoneId, playerId as CorePlayerId).length > 0) {
      return true;
    }
    if (draft.status !== "playing") {
      return false;
    }
    if (i > 0 && !Object.keys(draft.players).some((pid) => pid !== playerId)) {
      return false;
    }
    if (burnOut(draft, playerId, io, { sequenceIndex: i }).gameEnded) {
      // rule 315.4.b.2 / 431.2.d — a Burn Out INTERRUPTS the draw, it does not
      // cancel it: the recycled deck is drawn from even when that Burn Out's
      // point was the winning one (431.3.c: only a repeat Burn Out of the same
      // sequence, which leaves the deck empty, ends things before the draw).
      return io.zones.getCardsInZone("mainDeck" as CoreZoneId, playerId as CorePlayerId).length > 0;
    }
  }
  return io.zones.getCardsInZone("mainDeck" as CoreZoneId, playerId as CorePlayerId).length > 0;
}

// ---------------------------------------------------------------------------
// Scoring (Hold / Conquer)
// ---------------------------------------------------------------------------

/**
 * rule 469 / 470 — record that `playerId` Scored `battlefieldId` this turn
 * (and, for a conquer, that they conquered it). Independent of whether the
 * point was gained. A battlefield can only be Scored once per player per turn,
 * so a repeat is reported and not recorded again.
 */
export function markScored(
  draft: RiftboundGameState,
  playerId: PlayerId,
  battlefieldId: string,
  method: "hold" | "conquer",
): { wasAlreadyScoredThisTurn: boolean } {
  if (method === "conquer") {
    const conquered = (draft.conqueredThisTurn[playerId] ??= []);
    if (!conquered.includes(battlefieldId as never)) {
      conquered.push(battlefieldId as never);
    }
  }
  const scored = (draft.scoredThisTurn[playerId] ??= []);
  if (scored.includes(battlefieldId as never)) {
    return { wasAlreadyScoredThisTurn: true };
  }
  scored.push(battlefieldId as never);
  return { wasAlreadyScoredThisTurn: false };
}

export interface ScoreBattlefieldResult extends AwardResult {
  /**
   * rule 471.2 / 471.2.c — this Hold/Conquer was a Score, so its Hold /
   * Conquer abilities trigger (even when the point itself was denied, replaced
   * or drawn instead — 383.4.d.2.c, 471.2.a). False when the battlefield was
   * already scored by this player this turn, or scoring here is prevented
   * outright (Forgotten Monument).
   */
  readonly isScore: boolean;
}

/**
 * A player Holds (Beginning Phase) or Conquers (establishes control of)
 * `battlefieldId`: gate on "can't score here" battlefield statics, mark it
 * scored, and award up to one point through {@link awardPoints}. The caller
 * fires the `hold` / `conquer` trigger event when `isScore` is true — the event
 * payload differs per site (excess damage, previous controller, …).
 */
export function scoreBattlefield(
  draft: RiftboundGameState,
  playerId: PlayerId,
  battlefieldId: string,
  method: "hold" | "conquer",
  io: PointsIO,
  opts: { readonly previousController?: string | null } = {},
): ScoreBattlefieldResult {
  // rule 469.1 — control is (re-)established either way; only the Score is
  // gated. A "players can't score here" battlefield (Forgotten Monument) is
  // conquered/held without being Scored, so it is not marked either.
  if (!canPlayerScoreAtBattlefield(draft, playerId, battlefieldId)) {
    if (method === "conquer") {
      const conquered = (draft.conqueredThisTurn[playerId] ??= []);
      if (!conquered.includes(battlefieldId as never)) {
        conquered.push(battlefieldId as never);
      }
    }
    return { ...NO_GAIN, isScore: false };
  }
  if (markScored(draft, playerId, battlefieldId, method).wasAlreadyScoredThisTurn) {
    return { ...NO_GAIN, isScore: false };
  }
  // rule 469.1.a / 630.1.a — in team modes, taking a battlefield from a
  // teammate is not worth a point to the team.
  const prev = opts.previousController ?? null;
  const teamDisqualified =
    method === "conquer" &&
    prev !== null &&
    prev !== playerId &&
    isTeamGame(draft) &&
    areAllies(draft, playerId, prev);
  const award = teamDisqualified
    ? NO_GAIN
    : awardPoints(draft, playerId, 1, { battlefieldId, method }, io);
  return { ...award, isScore: true };
}

/**
 * rule 471.2 / 468 — the trigger events of one Score: the method's own event
 * (`hold` / `conquer`, with any site-specific payload such as excess damage or
 * the previous controller) followed by the generic `score` event ("When an
 * opponent scores"). Callers fire them only when `scoreBattlefield` reported
 * `isScore` (471.2.c).
 */
export function scoreEvents(
  playerId: PlayerId,
  battlefieldId: string,
  method: "hold" | "conquer",
  extras: {
    readonly afterAttack?: boolean;
    readonly excessDamage?: number;
    readonly previousController?: string | null;
  } = {},
): GameEvent[] {
  const own: GameEvent =
    method === "conquer"
      ? { battlefieldId, playerId, type: "conquer", ...extras }
      : { battlefieldId, playerId, type: "hold" };
  return [own, { battlefieldId, method, playerId, type: "score" }];
}
