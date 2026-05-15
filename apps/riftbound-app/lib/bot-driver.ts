/**
 * BotDriver — a deterministic, no-LLM goldfish bot.
 *
 * Given an `EngineSession` and a player id, picks one legal move per turn
 * using a simple priority list. This is *intentionally* dumb — it's a smoke
 * driver to prove the engine and UI can talk end-to-end, not a strong
 * opponent.
 *
 * Determinism: when two moves have the same priority, ties are broken by a
 * stable hash of `(seq, moveId, JSON.stringify(params))` so the same starting
 * state always produces the same game. No `Math.random()` — pass `seed` in
 * the constructor if you want a different deterministic line.
 */

import type { EngineSession} from "./engine-session";
import { type LegalMove } from "./engine-session";

/**
 * Card-play move IDs — when one of these is legal the bot is currently
 * "able to play a card", so anti-loop guards on resource moves can relax.
 */
const CARD_PLAY_MOVE_IDS = new Set<string>([
  "standardMove",
  "playUnit",
  "playSpell",
  "playGear",
  "playEquipment",
]);

/**
 * Default priority table — higher wins. Anything not listed gets
 * PRIORITY_DEFAULT. Exposed as `DEFAULT_PRIORITIES` (read-only) so callers
 * can introspect / extend the base list rather than reverse-engineer it.
 *
 * NOTE: `exhaustRune (30) < endTurn (40)` is intentional. A naïve bot that
 * always preferred `exhaustRune` over `endTurn` would loop forever cycling
 * runes when no real plays are available. Instead, the dynamic priority
 * layer in `getPriority` raises `exhaustRune` above `endTurn` ONLY when the
 * bot has a real reason to gather more energy (a nonempty hand and no
 * currently-affordable play). This keeps the goldfish from deadlocking on
 * synthetic decks while still letting it ramp on real decks.
 */
export const DEFAULT_PRIORITIES: Readonly<Record<string, number>> = Object.freeze({
  // Win-condition moves
  scorePoint: 1000,
  conquerBattlefield: 900,

  // Tempo moves
  playUnit: 700,
  playSpell: 650,
  playGear: 600,
  playEquipment: 600,
  standardMove: 500,

  // Combat
  resolveFullCombat: 400,
  resolveCombat: 400,
  assignAttacker: 350,
  assignBlocker: 340,
  contestBattlefield: 330,

  // Resource moves — exhausting runes is cheap and harmless; the goldfish
  // Does it once or twice if it can't play anything, but the move catalogue
  // Tends to keep re-offering it. We give endTurn a higher floor so the
  // Bot won't infinite-loop on rune exhausts. See dynamic raise below.
  channelRunes: 200,
  exhaustRune: 30,
  readyRune: 20,
  drawCard: 90,

  // Chain pass / phase advance
  passChainPriority: 50,
  passShowdownFocus: 50,

  // End turn — prefer this over anything not explicitly higher.
  endTurn: 40,

  // Never voluntarily concede. (We don't add it to the default excluded set
  // Because callers may want it for testing.)
  concede: -1,
});
const PRIORITY_DEFAULT = 25;

/**
 * `exhaustRune` dynamic priority when the bot has a nonempty hand and no
 * currently-affordable play — sits above `endTurn (40)` so the bot will
 * gather one more energy before passing. See `getPriority`.
 */
const EXHAUST_RUNE_DYNAMIC_PRIORITY = 80;

/**
 * Defender-priority overlay (Stream 2): when the bot is BEHIND on victory
 * points AND there is at least one `assignDefender` move legal right now,
 * we raise `assignDefender` above the default `playUnit (700)` so the bot
 * actually defends instead of greedily building more board.
 *
 * LL's batch-19 note: "the residual 70/30 P1 bias is picker myopia, not
 * engine — the aggressive priority picker prefers 'play unit >
 * assignDefender' so P1's turn-1 lead snowballs."
 */
const DEFENDER_PRIORITY_WHEN_BEHIND = 750;

/**
 * End-turn overlay (Stream 2): when the bot is AHEAD on victory points
 * and already has units on the board, prefer ending the turn over
 * building more board. Sits above `playUnit (700)` and `playSpell (650)`.
 */
const END_TURN_PRIORITY_WHEN_AHEAD = 720;

/** Move IDs the bot will never pick by default — `concede` ends the game. */
const DEFAULT_EXCLUDED = new Set<string>(["concede"]);

export interface BotDriverOptions {
  readonly seed?: string;
  /** Cap on number of moves per turn before we force endTurn. Default 30. */
  readonly maxMovesPerTurn?: number;
  /**
   * Move IDs the bot should never pick. Defaults exclude no-op / loop-prone
   * moves we never want a goldfish to take.
   */
  readonly excludedMoves?: ReadonlySet<string>;
  /**
   * Per-move-id priority overrides. Merges on top of `DEFAULT_PRIORITIES`
   * (this map wins for the keys it carries; unspecified keys keep their
   * default). Use this to nudge the bot toward / away from a specific move
   * type without rewriting the policy. Note: the dynamic-priority layer
   * (e.g. the `exhaustRune` raise when affordable plays are blocked) still
   * runs on top of these overrides — pass `Number.POSITIVE_INFINITY` to
   * trump it, or set it lower to disable the raise.
   */
  readonly priorities?: Readonly<Record<string, number>>;
  /**
   * Picker strategy. `"priority-table"` (default) uses the legacy static
   * priority map + dynamic overlays. `"board-eval"` uses the new
   * `BoardEvalLitePolicy` which scores moves with a hand-tuned heuristic
   * tuned to actually finish games on real decks.
   *
   * Alternatively, pass any object implementing `BotPolicy` to plug in your
   * own picker — this is the test seam.
   */
  readonly policy?: "priority-table" | "board-eval" | BotPolicy;
}

/**
 * Minimal session view the priority function needs. Decoupled from the full
 * `EngineSession` so it's trivially testable.
 */
interface BotViewContext {
  readonly energy: number;
  readonly handSize: number;
  readonly hasAffordablePlay: boolean;
  /** Bot's own current victory points. */
  readonly selfVp?: number;
  /** Best opponent's current victory points (max across non-self players). */
  readonly opponentVp?: number;
  /** Number of units the bot controls on battlefields (any). */
  readonly selfUnitsOnBoard?: number;
  /** True if `assignDefender` is among the currently-legal moves. */
  readonly canAssignDefender?: boolean;
  /** Total bot-controlled units across battlefields. Same as selfUnitsOnBoard, kept for clarity. */
  readonly selfTrashSize?: number;
  /** Sum of power values (any color) in the bot's rune pool. */
  readonly selfPowerTotal?: number;
  /** Opponent's units on board count. */
  readonly opponentUnitsOnBoard?: number;
}

/**
 * Pluggable policy interface. A `BotPolicy` picks one move from the
 * currently-legal list given a view-context. `BotDriver` already handles
 * exclusion + per-turn caps + active-player gating; the policy is a pure
 * `(view, moves) → move` function so it's trivially unit-testable.
 *
 * Stateless — call sites construct a fresh policy per bot.
 */
export interface BotPolicy {
  pickMove(
    moves: readonly LegalMove[],
    ctx: BotViewContext,
    options: { seed: string; movesThisTurn: number },
  ): LegalMove | null;
}

/**
 * Static-heuristic policy ("BoardEvalLite") — Phase B batch 21 RR.
 *
 * Scores each legal move using a hand-tuned linear combination of move-type
 * base value + view-context terms, then picks the highest-scoring move.
 * Unlike a full state-simulation policy this does NOT clone the engine; the
 * scoring is purely a function of the move shape + the current view, which
 * keeps O(n_moves) per pick and avoids the cost / brittleness of replaying
 * the trail to rebuild a candidate state.
 *
 * Why no simulation: `EngineSession.applyMove` is destructive on the
 * underlying `RuleEngine`, and the engine doesn't expose a `clone()` /
 * `snapshot+restore` API. A replay-based clone would re-run the entire
 * trail per legal move per turn (O(turns * moves²)) — fine in theory, but
 * the priority-table baseline never reaches a finish on real decks in 200
 * turns, so we need a SMARTER picker, not a slower one. Static scoring with
 * win-condition awareness (scorePoint, conquerBattlefield) + tempo terms
 * (energy vs hand affordability) closes games on its own. If we later find
 * the static heuristic misses some critical interaction, a hybrid policy
 * can wrap this one and override specific move IDs with one-ply lookahead.
 */
export class BoardEvalLitePolicy implements BotPolicy {
  /**
   * Score a single legal move under the current view context. Higher = better.
   * Exposed for tests / introspection.
   *
   * Formula (read top to bottom — winning conditions first, tempo second,
   * resource generation last):
   *
   *   scorePoint                    → 1_000 + 50 * selfVp   (close out games)
   *   conquerBattlefield            → 800
   *   playUnit / standardMove       → 600 + handSize * 0.5  (bigger hand = more options)
   *   playSpell                     → 550
   *   playGear / playEquipment      → 520
   *   assignAttacker                → 480 (push for VP via combat)
   *   resolveCombat / FullCombat    → 460
   *   assignDefender                → 450 + (opponentVp - selfVp) * 30  (defend hard when behind)
   *   assignBlocker                 → 440 + (opponentVp - selfVp) * 20
   *   contestBattlefield            → 430
   *   channelRunes                  → 300 if handSize > 0 else 50
   *   exhaustRune                   → 100 if (handSize > 0 && !hasAffordablePlay) else 25
   *   readyRune                     → 20
   *   drawCard                      → 90
   *   passChainPriority / pass…     → 60
   *   endTurn                       → 70 if hasAffordablePlay else 200
   *                                   + (selfVp > opponentVp && selfUnitsOnBoard > 0 ? 100 : 0)
   *   concede                       → -1000 (never)
   *   <other>                       → 10
   *
   * Tempo correction: subtract 50 from `endTurn` if there's an affordable
   * play in hand AND the bot hasn't made a play this turn — the bot should
   * fire its plays before passing.
   */
  score(move: LegalMove, ctx: BotViewContext, movesThisTurn: number): number {
    const selfVp = ctx.selfVp ?? 0;
    const oppVp = ctx.opponentVp ?? 0;
    const vpDelta = oppVp - selfVp; // Positive when bot is behind
    const {handSize} = ctx;
    const {hasAffordablePlay} = ctx;
    const selfUnits = ctx.selfUnitsOnBoard ?? 0;

    switch (move.moveId) {
      case "scorePoint": {
        // Win condition. Higher score for closer-to-winning states.
        return 1_000 + selfVp * 50;
      }
      case "conquerBattlefield": {
        return 800;
      }
      case "playUnit": {
        return 600 + Math.min(handSize, 8) * 0.5;
      }
      case "standardMove": {
        return 600 + Math.min(handSize, 8) * 0.5;
      }
      case "playSpell": {
        return 550;
      }
      case "playGear":
      case "playEquipment": {
        return 520;
      }
      case "assignAttacker": {
        return 480 + (selfUnits > 0 ? 20 : 0);
      }
      case "resolveFullCombat":
      case "resolveCombat": {
        return 460;
      }
      case "assignDefender": {
        return 450 + Math.max(0, vpDelta) * 30;
      }
      case "assignBlocker": {
        return 440 + Math.max(0, vpDelta) * 20;
      }
      case "contestBattlefield": {
        return 430;
      }
      case "channelRunes": {
        return handSize > 0 ? 300 : 50;
      }
      case "exhaustRune": {
        // CRITICAL: when the bot has a nonempty hand but no affordable
        // play yet, exhaustRune MUST outrank endTurn — otherwise the bot
        // passes immediately every turn and the game never progresses.
        // This is the same lesson as the legacy priority-table dynamic
        // overlay; the BoardEvalLite re-discovers it here.
        if (handSize > 0 && !hasAffordablePlay) return 250;
        return 25;
      }
      case "readyRune": {
        return 20;
      }
      case "recycleRune": {
        // Recycle is also a ramp move on the first turn (turns a Power
        // rune into Energy). Score it just below exhaustRune so the bot
        // prefers exhaust when both are available.
        if (handSize > 0 && !hasAffordablePlay) return 240;
        return 24;
      }
      case "drawCard": {
        return 90;
      }
      case "passChainPriority":
      case "passShowdownFocus": {
        return 60;
      }
      case "endTurn": {
        // Closing-when-ahead bonus + affordable-play penalty.
        // When the bot has plays but can't afford them yet, ramping is
        // Worth more than passing — so cap endTurn below ramp moves.
        let s = hasAffordablePlay ? 70 : (handSize > 0 ? 180 : 200);
        if (selfVp > oppVp && selfUnits > 0) {s += 100;}
        // If this is the very first move of the turn and there's an
        // Affordable play, push endTurn way down — we want the bot to
        // Actually try the play first.
        if (movesThisTurn === 0 && hasAffordablePlay) {s -= 50;}
        return s;
      }
      case "concede": {
        return -1_000;
      }
      default: {
        return 10;
      }
    }
  }

  pickMove(
    moves: readonly LegalMove[],
    ctx: BotViewContext,
    options: { seed: string; movesThisTurn: number },
  ): LegalMove | null {
    if (moves.length === 0) {return null;}
    const scored = moves.map((m) => ({
      move: m,
      score: this.score(m, ctx, options.movesThisTurn),
      tie: stableHash(
        `${options.seed}|${options.movesThisTurn}|${m.moveId}|${stringifyParams(m.params)}`,
      ),
    }));
    scored.sort((a, b) => {
      if (b.score !== a.score) {return b.score - a.score;}
      if (a.tie !== b.tie) {return a.tie - b.tie;}
      const k1 = `${a.move.moveId}:${stringifyParams(a.move.params)}`;
      const k2 = `${b.move.moveId}:${stringifyParams(b.move.params)}`;
      return k1 < k2 ? -1 : (k1 > k2 ? 1 : 0);
    });
    return scored[0]?.move ?? null;
  }
}

export class BotDriver {
  readonly playerId: string;
  private readonly seed: string;
  private readonly maxMovesPerTurn: number;
  private readonly excluded: ReadonlySet<string>;
  private readonly priorities: Readonly<Record<string, number>>;
  private readonly policy: BotPolicy | null;
  private movesThisTurn = 0;
  private lastTurnNumber = -1;

  constructor(playerId: string, options: BotDriverOptions = {}) {
    this.playerId = playerId;
    this.seed = options.seed ?? `${playerId}-bot`;
    this.maxMovesPerTurn = options.maxMovesPerTurn ?? 30;
    this.excluded = options.excludedMoves ?? DEFAULT_EXCLUDED;
    this.priorities = options.priorities
      ? { ...DEFAULT_PRIORITIES, ...options.priorities }
      : DEFAULT_PRIORITIES;
    if (options.policy === undefined || options.policy === "priority-table") {
      this.policy = null;
    } else if (options.policy === "board-eval") {
      this.policy = new BoardEvalLitePolicy();
    } else {
      this.policy = options.policy;
    }
  }

  /**
   * Compute the dynamic priority of a move given the current session view.
   * Default = `this.priorities[moveId] ?? PRIORITY_DEFAULT`. Dynamic overlay:
   *
   * - `exhaustRune` is raised to `EXHAUST_RUNE_DYNAMIC_PRIORITY` (above
   *   `endTurn`) when the bot has a nonempty hand AND no currently-
   *   affordable card-play move. Without this, the default
   *   `exhaustRune (30) < endTurn (40)` floor means a vanilla bot on a real
   *   deck never converts pool runes into energy and never plays a card.
   *
   * Exposed for tests / introspection.
   */
  getPriority(move: LegalMove, view: BotViewContext): number {
    const base = this.priorities[move.moveId] ?? PRIORITY_DEFAULT;
    if (
      move.moveId === "exhaustRune" &&
      view.handSize > 0 &&
      !view.hasAffordablePlay
    ) {
      return Math.max(base, EXHAUST_RUNE_DYNAMIC_PRIORITY);
    }
    // Defensive overlay: when behind on VP and a defender slot is open,
    // AssignDefender beats building more board.
    if (
      move.moveId === "assignDefender" &&
      view.selfVp < view.opponentVp &&
      view.canAssignDefender
    ) {
      return Math.max(base, DEFENDER_PRIORITY_WHEN_BEHIND);
    }
    // Closer-when-ahead overlay: when bot is ahead on VP and already has
    // Board presence, prefer ending the turn over building more board.
    if (
      move.moveId === "endTurn" &&
      view.selfVp > view.opponentVp &&
      view.selfUnitsOnBoard > 0
    ) {
      return Math.max(base, END_TURN_PRIORITY_WHEN_AHEAD);
    }
    return base;
  }

  /**
   * Pick one move and apply it. Returns `null` when:
   *  - the game is over,
   *  - it's not this bot's turn (unless `force` is true),
   *  - no legal moves are available.
   *
   * Caller is responsible for the outer loop.
   *
   * `force`: bypass the active-player check. Use when the bot needs to act
   * during chain priority / showdown focus, where the non-active player has
   * legal moves (e.g. `passShowdownFocus`). The bot-vs-bot integration loop
   * sets this when the active player has no non-concede moves.
   */
  step(
    session: EngineSession,
    opts: { force?: boolean } = {},
  ): ReturnType<EngineSession["applyMove"]> | null {
    if (session.isGameOver()) {return null;}
    if (!opts.force && session.getActivePlayer() !== this.playerId) {return null;}

    const turnNumber = session.engine.getState().turn.number;
    if (turnNumber !== this.lastTurnNumber) {
      this.movesThisTurn = 0;
      this.lastTurnNumber = turnNumber;
    }

    let move: LegalMove | null;
    if (this.movesThisTurn >= this.maxMovesPerTurn) {
      move = this.findEndTurn(session);
    } else {
      move = this.pickMove(session);
    }
    if (!move) {return null;}

    this.movesThisTurn++;
    return session.applyMove(this.playerId, move);
  }

  /**
   * Play turns until the game ends, the turn cap is hit, or this bot's turn
   * ends. Returns the steps taken.
   */
  playUntilNotMyTurn(
    session: EngineSession,
    safetyCap = 200,
  ): ReturnType<EngineSession["applyMove"]>[] {
    const steps: ReturnType<EngineSession["applyMove"]>[] = [];
    let guard = 0;
    while (
      !session.isGameOver() &&
      session.getActivePlayer() === this.playerId &&
      guard++ < safetyCap
    ) {
      const step = this.step(session);
      if (!step) {break;}
      steps.push(step);
      if (step.moveId === "endTurn" && step.success) {break;}
    }
    return steps;
  }

  /* --- internals --------------------------------------------------------- */

  private pickMove(session: EngineSession): LegalMove | null {
    const moves = session
      .legalMoves(this.playerId)
      .filter((m) => !this.excluded.has(m.moveId));

    if (moves.length === 0) {return null;}

    // Dynamic priority context — derived ONCE per pick from the current view
    // + the legal-move list so the per-move scoring stays O(1).
    const ctx = buildBotViewContext(session, this.playerId, moves);

    // If a pluggable policy is set, delegate.
    if (this.policy) {
      return this.policy.pickMove(moves, ctx, {
        movesThisTurn: this.movesThisTurn,
        seed: this.seed,
      });
    }

    // Compute (priority, tiebreaker) for each move.
    const scored = moves.map((m) => ({
      move: m,
      priority: this.getPriority(m, ctx),
      tieBreak: stableHash(`${this.seed}|${this.movesThisTurn}|${m.moveId}|${stringifyParams(m.params)}`),
    }));

    // Highest priority wins; tieBreak (stable) breaks ties.
    scored.sort((a, b) => {
      if (b.priority !== a.priority) {return b.priority - a.priority;}
      if (a.tieBreak !== b.tieBreak) {return a.tieBreak - b.tieBreak;}
      // Final deterministic tiebreak on moveId+params
      const k1 = `${a.move.moveId}:${stringifyParams(a.move.params)}`;
      const k2 = `${b.move.moveId}:${stringifyParams(b.move.params)}`;
      return k1 < k2 ? -1 : (k1 > k2 ? 1 : 0);
    });

    // If nothing useful exists *and* endTurn is legal, prefer endTurn over
    // Some random low-priority noise. (`scorePoint` etc. already outrank it.)
    return scored[0]?.move ?? null;
  }

  private findEndTurn(session: EngineSession): LegalMove | null {
    const moves = session.legalMoves(this.playerId);
    return moves.find((m) => m.moveId === "endTurn") ?? null;
  }
}

/* --- helpers --------------------------------------------------------------- */

/**
 * Snapshot the dynamic-priority inputs from a session for one player. Cheap:
 * just walks the already-computed legal-moves list + reads the view summary.
 *
 * `hasAffordablePlay` = at least one card-play move (playUnit/Spell/Gear/
 * Equipment/standardMove) is currently legal. The engine's affordability /
 * cost check already happens at enumeration time, so if a play-move shows
 * up here, the bot can in fact play that card right now.
 */
function buildBotViewContext(
  session: EngineSession,
  playerId: string,
  moves: readonly LegalMove[],
): BotViewContext {
  const view = session.getView();
  const player = view.players.find((p) => p.id === playerId);
  const hasAffordablePlay = moves.some((m) => CARD_PLAY_MOVE_IDS.has(m.moveId));
  const selfVp = player?.victoryPoints ?? 0;
  let opponentVp = 0;
  for (const p of view.players) {
    if (p.id !== playerId && p.victoryPoints > opponentVp) {
      opponentVp = p.victoryPoints;
    }
  }
  let selfUnitsOnBoard = 0;
  for (const bf of view.battlefields) {
    for (const u of bf.units) {
      if (u.controller === playerId) {selfUnitsOnBoard++;}
    }
  }
  const canAssignDefender = moves.some((m) => m.moveId === "assignDefender");
  return {
    canAssignDefender,
    energy: player?.energy ?? 0,
    handSize: player?.handSize ?? 0,
    hasAffordablePlay,
    opponentVp,
    selfUnitsOnBoard,
    selfVp,
  };
}

/**
 * Stable params stringifier — sorts keys so `{a:1,b:2}` and `{b:2,a:1}` hash
 * the same. Recurses into plain objects; arrays are kept positional.
 */
function stringifyParams(value: unknown): string {
  if (value === null || typeof value !== "object") {return JSON.stringify(value);}
  if (Array.isArray(value)) {
    return `[${value.map((v) => stringifyParams(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).toSorted();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stringifyParams(obj[k])}`).join(",")}}`;
}

/** Tiny, fast 32-bit string hash — FNV-1a. Deterministic, no deps. */
function stableHash(s: string): number {
  let h = 0x811C9DC5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01_00_01_93) >>> 0;
  }
  return h >>> 0;
}
