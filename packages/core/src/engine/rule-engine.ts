import { type Patch, enablePatches, applyPatches as immerApplyPatches, produce } from "immer";
import { FlowManager } from "../flow/flow-manager";
import type { GameDefinition, Player } from "../game-definition/game-definition";
import { type FormattedHistoryEntry, HistoryManager, type HistoryQueryOptions } from "../history";
import { createHistoryOperations } from "../history/history-operations";
import { Logger, type LoggerOptions } from "../logging";
import type { EnumeratedMove, MoveEnumerationOptions } from "../moves/move-enumeration";
import type { ConditionFailure, MoveContext, MoveContextInput } from "../moves/move-system";
import type { CardRegistry } from "../operations/card-registry";
import { createCardRegistry } from "../operations/card-registry-impl";
import {
  createCardOperations,
  createCounterOperations,
  createGameOperations,
  createZoneOperations,
} from "../operations/operations-impl";
import type { SerializedFlowState } from "../flow/flow-manager";
import { SeededRNG, type SeededRNGState } from "../rng/seeded-rng";
import { TelemetryManager, type TelemetryOptions } from "../telemetry";
import type { PlayerId } from "../types/branded";
import { createPlayerId } from "../types/branded-utils";
import type { InternalState } from "../types/state";
import { TrackerSystem } from "./tracker-system";

/**
 * RuleEngine Options
 *
 * Configuration options for RuleEngine initialization
 */
export interface RuleEngineOptions {
  /** Optional RNG seed for deterministic gameplay */
  seed?: string;
  /** Optional initial patches (for replay/restore) */
  initialPatches?: Patch[];
  /** Optional logger configuration for structured logging */
  logger?: LoggerOptions;
  /** Optional telemetry configuration for event tracking */
  telemetry?: TelemetryOptions;
  /** Optional player ID to designate as the choosing player (e.g., loser of previous game in best-of-three). If not provided, randomly selected. */
  choosingFirstPlayer?: string;
}

/**
 * Move Execution Result
 *
 * Result of executing a move through the engine
 */
export type MoveExecutionResult =
  | {
      success: true;
      patches: Patch[];
      inversePatches: Patch[];
    }
  | {
      success: false;
      error: string;
      errorCode: string;
      errorContext?: Record<string, unknown>;
    };

/**
 * Replay History Entry
 *
 * Record of a move execution for replay/undo functionality.
 * Contains full context, patches, and inverse patches for deterministic replay.
 *
 * Note: For user-facing history with localization, use HistoryEntry from @tcg/core/history
 */
export interface ReplayHistoryEntry<TParams = any, TCardMeta = any, TCardDefinition = any> {
  moveId: string;
  context: MoveContext<TParams, TCardMeta, TCardDefinition>;
  patches: Patch[];
  inversePatches: Patch[];
  timestamp: number;
  /** Snapshot of internalState before this move (for undo) */
  internalStateBefore?: unknown;
  /** Snapshot of internalState after this move (for redo) */
  internalStateAfter?: unknown;
  /** Everything that defines the position before this move (undo target). */
  before?: EngineCheckpoint;
  /** Everything that defines the position after this move and its flow transitions (redo target). */
  after?: EngineCheckpoint;
  /**
   * Undo group. Consecutive entries sharing a group are one player-facing
   * action (a move plus the automatic procedures a driver fired after it) and
   * are rewound / redone together.
   */
  group?: number;
  /**
   * Monotonic per-engine identity of this entry (never reused). After a
   * rewind + a new move, index N holds a DIFFERENT entry; consumers that key
   * side data "to the move at index N" compare the serial too.
   */
  serial?: number;
}

/**
 * A complete, detached engine position: game state, internal state (zones /
 * cards / metas), flow machine position, RNG cursor, trackers, game-over
 * latch and the game definition's `historyExtension` snapshot. Restoring one
 * is exact — the next shuffle after a rewind deals the same cards.
 */
export interface EngineCheckpoint<TState = unknown> {
  readonly state: TState;
  readonly internalState: unknown;
  readonly flow?: SerializedFlowState;
  readonly rng: SeededRNGState;
  readonly trackers: Record<string, (PlayerId | "global")[]>;
  readonly gameEnded: boolean;
  readonly gameEndResult?: {
    winner?: PlayerId;
    reason: string;
    metadata?: Record<string, unknown>;
  };
  readonly extension?: unknown;
}

/**
 * RuleEngine - Core game engine
 *
 * Task 11: Integrates all game systems:
 * - State management with Immer
 * - Move execution and validation
 * - Flow orchestration (turns/phases)
 * - History tracking (undo/redo)
 * - Patch generation (delta sync)
 * - RNG for determinism
 * - Player view filtering
 * - Internal state management (zones/cards)
 *
 * @example
 * ```typescript
 * const engine = new RuleEngine(gameDefinition, players);
 *
 * // Execute moves
 * const result = engine.executeMove('playCard', {
 *   playerId: 'p1',
 *   data: { cardId: 'card-123' }
 * });
 *
 * // Get player view
 * const playerState = engine.getPlayerView('p1');
 *
 * // Check game end
 * const gameEnd = engine.checkGameEnd();
 * ```
 */
export class RuleEngine<
  TState,
  TMoves extends Record<string, any>,
  TCardDefinition = any,
  TCardMeta = any,
> {
  private currentState: TState;
  protected readonly gameDefinition: GameDefinition<TState, TMoves, TCardDefinition, TCardMeta>;
  private readonly rng: SeededRNG;
  private readonly history: ReplayHistoryEntry<any, TCardMeta, TCardDefinition>[] = [];
  private historyIndex = -1;
  private readonly moveHistory: HistoryManager; // New move history system
  private flowManager?: FlowManager<TState, TCardMeta>;
  private readonly initialPlayers: Player[]; // Store for replay
  private readonly initialChoosingFirstPlayer?: string; // Store for replay
  private internalState: InternalState<TCardDefinition, TCardMeta>;
  private readonly cardRegistry: CardRegistry<TCardDefinition>;
  private trackerSystem: TrackerSystem;
  private readonly logger: Logger;
  private readonly telemetry: TelemetryManager;
  private gameEnded = false;
  private gameEndResult?: {
    winner?: PlayerId;
    reason: string;
    metadata?: Record<string, unknown>;
  };
  /** Undo grouping: nesting depth of beginUndoGroup(), the open group's id and its start checkpoint. */
  private undoGroupDepth = 0;
  private undoGroupCounter = 0;
  private entrySerial = 0;
  private openUndoGroup?: { id: number; before?: EngineCheckpoint<TState> };

  /**
   * Create a new RuleEngine instance
   *
   * Task 11.1, 11.2: Constructor with GameDefinition
   *
   * @param gameDefinition - Game definition with setup, moves, flow
   * @param players - Array of players for the game
   * @param options - Optional configuration (seed, patches)
   */
  constructor(
    gameDefinition: GameDefinition<TState, TMoves, TCardDefinition, TCardMeta>,
    players: Player[],
    options?: RuleEngineOptions,
  ) {
    // Enable Immer patches for state tracking
    enablePatches();

    // Initialize logging and telemetry FIRST (before any other operations)
    this.logger = new Logger(options?.logger ?? { level: "SILENT" });
    this.telemetry = new TelemetryManager(options?.telemetry ?? { enabled: false });

    this.gameDefinition = gameDefinition;
    this.initialPlayers = players;
    this.initialChoosingFirstPlayer = options?.choosingFirstPlayer;

    // Initialize RNG with optional seed
    this.rng = new SeededRNG(options?.seed);

    // Initialize move history manager
    this.moveHistory = new HistoryManager();

    // Initialize card registry from game definition
    this.cardRegistry = createCardRegistry(gameDefinition.cards);

    // Initialize tracker system from game definition
    this.trackerSystem = new TrackerSystem(gameDefinition.trackers);

    // Initialize internal state with zones from game definition
    this.internalState = {
      cardMetas: {},
      cards: {},
      zones: {},
    };

    // Create zone instances from zone configs (if provided)
    if (gameDefinition.zones) {
      for (const zoneId in gameDefinition.zones) {
        const zoneConfig = gameDefinition.zones[zoneId];
        if (zoneConfig) {
          this.internalState.zones[zoneId] = {
            cardIds: [],
            config: zoneConfig,
          };
        }
      }
    }

    // Set which player gets to choose who goes first
    // This follows TCG rules where one player is designated to make the choice
    // (e.g., via coin flip, dice roll, rock-paper-scissors, or loser of previous game)
    // IMPORTANT: This must happen BEFORE setup to ensure deterministic replay
    if (players.length > 0) {
      if (options?.choosingFirstPlayer) {
        // Use explicitly specified choosing player (e.g., loser of previous game in best-of-three)
        this.internalState.choosingFirstPlayer = createPlayerId(options.choosingFirstPlayer);
      } else {
        // Randomly select if not specified
        const randomIndex = Math.floor(this.rng.random() * players.length);
        const choosingPlayer = players[randomIndex];
        if (choosingPlayer) {
          this.internalState.choosingFirstPlayer = createPlayerId(choosingPlayer.id);
        }
      }
    }

    // Call setup to create initial state
    this.currentState = gameDefinition.setup(players);

    // Initialize flow manager if flow definition exists
    if (gameDefinition.flow) {
      // Create operations for flow manager
      const zoneOps = createZoneOperations(this.internalState, undefined, this.rng);
      const cardOps = createCardOperations<TCardDefinition, TCardMeta>(this.internalState);
      const gameOps = createGameOperations(this.internalState);

      this.flowManager = new FlowManager(gameDefinition.flow, this.currentState, {
        cardOperations: cardOps,
        gameOperations: gameOps,
        logger: this.logger.child("flow"),
        onPhaseEnd: (phaseName) => this.trackerSystem.resetPhase(phaseName),
        onTurnEnd: () => this.trackerSystem.resetTurn(),
        telemetry: this.telemetry,
        zoneOperations: zoneOps,
      });
    }

    // Register telemetry hooks from game definition
    if (gameDefinition.telemetryHooks) {
      if (gameDefinition.telemetryHooks.onPlayerAction) {
        this.telemetry.registerHook("onPlayerAction", gameDefinition.telemetryHooks.onPlayerAction);
      }
      if (gameDefinition.telemetryHooks.onStateChange) {
        this.telemetry.registerHook("onStateChange", gameDefinition.telemetryHooks.onStateChange);
      }
      if (gameDefinition.telemetryHooks.onRuleEvaluation) {
        this.telemetry.registerHook(
          "onRuleEvaluation",
          gameDefinition.telemetryHooks.onRuleEvaluation,
        );
      }
      if (gameDefinition.telemetryHooks.onFlowTransition) {
        this.telemetry.registerHook(
          "onFlowTransition",
          gameDefinition.telemetryHooks.onFlowTransition,
        );
      }
      if (gameDefinition.telemetryHooks.onEngineError) {
        this.telemetry.registerHook("onEngineError", gameDefinition.telemetryHooks.onEngineError);
      }
      if (gameDefinition.telemetryHooks.onPerformance) {
        this.telemetry.registerHook("onPerformance", gameDefinition.telemetryHooks.onPerformance);
      }
    }
  }

  /**
   * Get current game state
   *
   * Task 11.3, 11.4: getState method
   *
   * Returns immutable snapshot of current state.
   * Modifications to returned state do not affect engine.
   *
   * @returns Current game state (immutable)
   */
  getState(): TState {
    // Use structuredClone for deep cloning with better performance and type safety
    // Than JSON serialization. Note: structuredClone preserves more types (Date, Map, Set, etc.)
    // But still creates a deep copy to ensure immutability
    return structuredClone(this.currentState);
  }

  /**
   * Get player-specific view of game state
   *
   * Task 11.5, 11.6: getPlayerView with filtering
   *
   * Applies playerView filter from GameDefinition to hide private information.
   * If no playerView function defined, returns full state.
   *
   * @param playerId - Player requesting the view
   * @returns Filtered state for this player
   */
  getPlayerView(playerId: string): TState {
    if (this.gameDefinition.playerView) {
      const filteredState = this.gameDefinition.playerView(this.currentState, playerId);
      // Use structuredClone for deep cloning filtered state
      return structuredClone(filteredState);
    }

    // No filter defined, return full state
    return this.getState();
  }

  /**
   * Check if the game has ended
   *
   * @returns True if game has ended via endGame() call
   */
  hasGameEnded(): boolean {
    return this.gameEnded;
  }

  /**
   * Get move history with player-aware filtering and verbosity levels
   *
   * Returns formatted history entries with player-specific visibility filtering
   * and message formatting based on requested verbosity level.
   *
   * @param options - Query options for filtering and formatting
   * @returns Array of formatted history entries
   *
   * @example
   * ```typescript
   * // Get all history for a specific player (casual verbosity)
   * const history = engine.getHistory({
   *   playerId: 'player_one',
   *   verbosity: 'CASUAL'
   * });
   *
   * // Get recent history (since timestamp)
   * const recentHistory = engine.getHistory({
   *   since: Date.now() - 60000 // Last minute
   * });
   *
   * // Get technical details for debugging
   * const debugHistory = engine.getHistory({
   *   verbosity: 'DEVELOPER'
   * });
   * ```
   */
  getHistory(options?: HistoryQueryOptions): FormattedHistoryEntry[] {
    return this.moveHistory.query(options ?? {});
  }

  /**
   * Get the game end result
   *
   * @returns Game end result if game has ended, undefined otherwise
   */
  getGameEndResult():
    | {
        winner?: PlayerId;
        reason: string;
        metadata?: Record<string, unknown>;
      }
    | undefined {
    return this.gameEndResult;
  }

  /**
   * Execute a move
   *
   * Task 11.7, 11.8, 11.9, 11.10: executeMove with validation
   * Task 11.25, 11.26: RNG integration in move context
   *
   * Validates and executes a move, updating game state.
   * Returns patches for network synchronization.
   *
   * Process:
   * 1. Validate move exists
   * 2. Add RNG to context
   * 3. Check move condition
   * 4. Execute reducer with Immer
   * 5. Capture patches
   * 6. Update history
   * 7. Check game end condition
   *
   * @param moveId - Name of move to execute
   * @param context - Move context (player, typed params, targets)
   * @returns Execution result with patches or error
   */
  executeMove(moveId: string, contextInput: MoveContextInput<any>): MoveExecutionResult {
    const startTime = Date.now();

    // Log move execution start (INFO level)
    this.logger.info(`Executing move: ${moveId}`, {
      moveId,
      params: contextInput.params as Record<string, unknown>,
      playerId: contextInput.playerId,
    });

    // Task 11.7: Validate move exists
    const moveDef = this.gameDefinition.moves[moveId as keyof TMoves];
    if (!moveDef) {
      const error = `Move '${moveId}' not found`;
      this.logger.error(error, { moveId });
      return {
        error,
        errorCode: "MOVE_NOT_FOUND",
        success: false,
      };
    }

    // Check if game has already ended BEFORE checking move conditions
    // This ensures GAME_ENDED error takes precedence over condition failures
    if (this.gameEnded) {
      const error = "Game has already ended";
      this.logger.warn(error, { moveId });
      return {
        error,
        errorCode: "GAME_ENDED",
        success: false,
      };
    }

    // Task 11.8: Check move condition with detailed failure information
    const conditionResult = this.checkMoveCondition(moveId, contextInput);
    if (!conditionResult.success) {
      // Type narrow to failure case
      const failure = conditionResult as {
        success: false;
        error: string;
        errorCode: string;
        errorContext?: Record<string, unknown>;
      };

      // Log condition failure (WARN level)
      this.logger.warn(`Move condition failed: ${moveId}`, {
        error: failure.error,
        errorCode: failure.errorCode,
        moveId,
        playerId: contextInput.playerId,
      });

      // Add history entry for failed move
      this.moveHistory.addEntry({
        error: {
          code: failure.errorCode,
          context: failure.errorContext,
          message: failure.error,
        },
        messages: {
          messages: {
            advanced: {
              key: `moves.${moveId}.failure.detailed`,
              values: {
                error: failure.error,
                errorCode: failure.errorCode,
                playerId: contextInput.playerId,
              },
            },
            casual: {
              key: `moves.${moveId}.failure`,
              values: {
                error: failure.error,
                playerId: contextInput.playerId,
              },
            },
          },
          visibility: "PUBLIC",
        },
        moveId,
        params: contextInput.params,
        phase: this.flowManager?.getCurrentPhase(),
        playerId: contextInput.playerId,
        segment: this.flowManager?.getCurrentSegment(),
        success: false,
        timestamp: contextInput.timestamp ?? Date.now(),
        turn: this.flowManager?.getTurnNumber(),
      });

      // Emit telemetry event for failed move
      this.telemetry.emitEvent({
        duration: Date.now() - startTime,
        error: failure.error,
        errorCode: failure.errorCode,
        moveId,
        params: contextInput.params,
        playerId: contextInput.playerId,
        result: "failure",
        timestamp: startTime,
        type: "playerAction",
      });

      return failure;
    }

    // Task 11.25, 11.26: Add RNG to context for deterministic randomness
    // Also add operations API for zone and card management
    const zoneOps = createZoneOperations(this.internalState, this.logger.child("zones"), this.rng);
    const cardOps = createCardOperations(this.internalState, this.logger.child("cards"));
    const gameOps = createGameOperations(this.internalState, this.logger.child("game"));
    const counterOps = createCounterOperations(this.internalState, this.logger.child("counters"));

    // Track pending flow transitions
    let pendingPhaseEnd = false;
    let pendingSegmentEnd = false;
    let pendingTurnEnd = false;

    // Inject flow state from FlowManager if available
    const flowState = this.flowManager
      ? {
          currentPhase: this.flowManager.getCurrentPhase(),
          currentSegment: this.flowManager.getCurrentSegment(),
          turn: this.flowManager.getTurnNumber(),
          currentPlayer: this.flowManager.getCurrentPlayer() as PlayerId,
          isFirstTurn: this.flowManager.isFirstTurn(),
          // Provide flow control methods (deferred until after move completes)
          endPhase: () => {
            pendingPhaseEnd = true;
          },
          endSegment: () => {
            pendingSegmentEnd = true;
          },
          endTurn: () => {
            pendingTurnEnd = true;
          },
          setCurrentPlayer: (playerId?: PlayerId) => {
            this.flowManager?.setCurrentPlayer(playerId);
          },
        }
      : undefined;

    // Create endGame function to allow moves to end the game
    const endGame = (result: {
      winner?: PlayerId;
      reason: string;
      metadata?: Record<string, unknown>;
    }) => {
      this.gameEnded = true;
      this.gameEndResult = result;
    };

    // Create history operations for this move
    const historyOps = createHistoryOperations(this.moveHistory, {
      moveId,
      params: contextInput.params,
      phase: flowState?.currentPhase,
      playerId: contextInput.playerId,
      segment: flowState?.currentSegment,
      timestamp: contextInput.timestamp ?? Date.now(),
      turn: flowState?.turn,
    });

    const contextWithOperations: MoveContext<any, TCardMeta, TCardDefinition> = {
      ...contextInput,
      cards: cardOps,
      counters: counterOps,
      endGame,
      flow: flowState,
      game: gameOps,
      history: historyOps,
      registry: this.cardRegistry,
      rng: this.rng,
      trackers: {
        check: (name, playerId) => this.trackerSystem.check(name, playerId),
        mark: (name, playerId) => this.trackerSystem.mark(name, playerId),
        unmark: (name, playerId) => this.trackerSystem.unmark(name, playerId),
      },
      zones: zoneOps,
    };

    // Task 11.9: Execute reducer with Immer and capture patches
    let patches: Patch[] = [];
    let inversePatches: Patch[] = [];

    // Snapshot internalState before move for undo support (and for rolling a
    // throwing reducer back). Inside an undo group the group's start
    // checkpoint is the undo target of its first recorded move.
    const internalStateBefore = structuredClone(this.internalState);
    const groupBefore = this.openUndoGroup?.before;
    const before = groupBefore ?? this.checkpoint(internalStateBefore);

    try {
      this.currentState = produce(
        this.currentState,
        (draft) => {
          moveDef.reducer(draft, contextWithOperations);
        },
        (p, ip) => {
          patches = p;
          inversePatches = ip;
        },
      );

      if (this.openUndoGroup && groupBefore) {
        this.openUndoGroup.before = undefined;
      }

      // Task 11.10: Update history (store full context for replay). The
      // `after` checkpoint is completed below, once flow transitions ran.
      const historyEntry: ReplayHistoryEntry = {
        before,
        context: contextWithOperations,
        group: this.openUndoGroup?.id ?? ++this.undoGroupCounter,
        internalStateBefore: before.internalState,
        inversePatches,
        moveId,
        patches,
        serial: ++this.entrySerial,
        timestamp: Date.now(),
      };
      this.addToHistory(historyEntry);

      // Add automatic base history entry for successful move
      this.moveHistory.addEntry({
        messages: {
          messages: {
            casual: {
              key: `moves.${moveId}.success`,
              values: {
                params: contextInput.params,
                playerId: contextInput.playerId,
              },
            },
          },
          visibility: "PUBLIC",
        },
        moveId,
        params: contextInput.params,
        phase: flowState?.currentPhase,
        playerId: contextInput.playerId,
        segment: flowState?.currentSegment,
        success: true,
        timestamp: contextInput.timestamp ?? Date.now(),
        turn: flowState?.turn,
      });

      // Execute any pending flow transitions after move completes
      if (this.flowManager) {
        // Sync FlowManager state with new state after move execution
        // This ensures endIf conditions check against the latest state
        this.flowManager.syncState(this.currentState);

        if (pendingPhaseEnd) {
          this.flowManager.nextPhase();
        }
        if (pendingSegmentEnd) {
          this.flowManager.nextGameSegment();
        }
        if (pendingTurnEnd) {
          this.flowManager.nextTurn();
        }

        // Check automatic endIf transitions after move execution
        // This enables automatic phase/segment/turn transitions based on endIf conditions
        this.flowManager.checkEndConditions();

        // Flow hooks mutate a produce()'d copy of the state held by the
        // FlowManager; sync it back so those mutations (turn.phase, VP,
        // rune pools, per-turn tracking) are visible to getState().
        this.currentState = this.flowManager.getGameState();
      }

      // Redo target: the position AFTER the move and every transition it set
      // off (a turn's onBegin draw included), not just the reducer's patches.
      historyEntry.after = this.checkpoint();
      historyEntry.internalStateAfter = historyEntry.after.internalState;

      // Log successful completion (DEBUG level)
      const duration = Date.now() - startTime;
      this.logger.debug(`Move completed: ${moveId}`, {
        duration,
        moveId,
        patchCount: patches.length,
        playerId: contextInput.playerId,
      });

      // Emit telemetry events for successful move
      this.telemetry.emitEvent({
        duration,
        moveId,
        params: contextInput.params,
        playerId: contextInput.playerId,
        result: "success",
        timestamp: startTime,
        type: "playerAction",
      });

      this.telemetry.emitEvent({
        inversePatches,
        moveId,
        patches,
        timestamp: Date.now(),
        type: "stateChange",
      });

      return {
        inversePatches,
        patches,
        success: true,
      };
    } catch (error) {
      // A throwing reducer leaves `this.currentState` untouched (immer discards
      // the draft), but `internalState` — zones, card metas, counters — is
      // mutated in place through the operations handed to the reducer, so a
      // move that died halfway would otherwise keep whatever it had already
      // spent (a consumed buff, a discarded card). Roll it back to the
      // pre-move snapshot so a rejected move is a no-op on BOTH halves —
      // in place, because the FlowManager's operations close over this very
      // object.
      this.assignInternalState(internalStateBefore);
      if (this.flowManager) {
        this.flowManager.syncState(this.currentState);
      }

      // Log error (ERROR level)
      const errorMessage = error instanceof Error ? error.message : "Move execution failed";
      this.logger.error(`Move execution error: ${moveId}`, {
        error: errorMessage,
        moveId,
        playerId: contextInput.playerId,
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Emit telemetry error event
      this.telemetry.emitEvent({
        context: {
          moveId,
          params: contextInput.params,
          playerId: contextInput.playerId,
        },
        error: errorMessage,
        moveId,
        playerId: contextInput.playerId,
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: Date.now(),
        type: "engineError",
      });

      return {
        error: errorMessage,
        errorCode: "EXECUTION_ERROR",
        success: false,
      };
    }
  }

  /**
   * Build full move context with engine-provided services
   *
   * Centralizes context building logic used by condition checks and move execution.
   * Includes RNG, operations APIs, and flow state.
   *
   * @param contextInput - Base context from caller
   * @returns Full context with all engine services
   * @private
   */
  private buildMoveContext(
    contextInput: MoveContextInput<any>,
  ): MoveContext<any, TCardMeta, TCardDefinition> {
    const zoneOps = createZoneOperations(this.internalState, this.logger.child("zones"), this.rng);
    const cardOps = createCardOperations(this.internalState, this.logger.child("cards"));
    const gameOps = createGameOperations(this.internalState, this.logger.child("game"));
    const counterOps = createCounterOperations(this.internalState, this.logger.child("counters"));

    // Add flow state for condition checks
    const flowState = this.flowManager
      ? {
          currentPhase: this.flowManager.getCurrentPhase(),
          currentSegment: this.flowManager.getCurrentSegment(),
          turn: this.flowManager.getTurnNumber(),
          currentPlayer: this.flowManager.getCurrentPlayer() as PlayerId,
          isFirstTurn: this.flowManager.getTurnNumber() === 1,
          // Condition doesn't need control methods (endPhase, endSegment, endTurn)
          // As conditions should be side-effect free
          endPhase: () => {},
          endSegment: () => {},
          endTurn: () => {},
          setCurrentPlayer: () => {},
        }
      : undefined;

    // Create dummy history operations (conditions should be side-effect free)
    const dummyHistoryOps = {
      log: () => {
        // No-op: conditions shouldn't add history entries
      },
    };

    return {
      ...contextInput,
      cards: cardOps,
      counters: counterOps,
      flow: flowState,
      game: gameOps,
      history: dummyHistoryOps,
      registry: this.cardRegistry,
      rng: this.rng,
      trackers: {
        check: (name, playerId) => this.trackerSystem.check(name, playerId),
        mark: (name, playerId) => this.trackerSystem.mark(name, playerId),
        unmark: (name, playerId) => this.trackerSystem.unmark(name, playerId),
      },
      zones: zoneOps,
    };
  }

  /**
   * Check move condition and return detailed failure information
   *
   * Evaluates move condition and returns either success or detailed failure info.
   * Supports both legacy boolean conditions and new ConditionFailure returns.
   *
   * @param moveId - Name of move to check
   * @param contextInput - Move context with typed params
   * @returns Success indicator or detailed failure information
   * @private
   */
  private checkMoveCondition(
    moveId: string,
    contextInput: MoveContextInput<any>,
  ):
    | { success: true }
    | {
        success: false;
        error: string;
        errorCode: string;
        errorContext?: Record<string, unknown>;
      } {
    const moveDef = this.gameDefinition.moves[moveId as keyof TMoves];

    if (!moveDef?.condition) {
      return { success: true };
    }

    // Log condition evaluation (DEBUG level)
    this.logger.debug(`Evaluating move condition: ${moveId}`, {
      moveId,
      playerId: contextInput.playerId,
    });

    // A throwing condition must never escape executeMove: callers (HTTP/WS
    // handlers) treat an uncaught throw as a fatal error and can lose the
    // whole session. Surface it as an ordinary move rejection instead.
    let result: ReturnType<NonNullable<typeof moveDef.condition>>;
    try {
      const contextWithOperations = this.buildMoveContext(contextInput);
      result = moveDef.condition(this.currentState, contextWithOperations);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`Move condition threw: ${moveId}`, { moveId, reason });
      return {
        error: `Move '${moveId}' condition threw: ${reason}`,
        errorCode: "CONDITION_ERROR",
        success: false,
      };
    }

    if (result === true) {
      // Log success (TRACE level)
      this.logger.trace(`Condition passed: ${moveId}`, { moveId });
      return { success: true };
    }

    if (result === false) {
      // Legacy boolean false - return generic error for backward compatibility
      this.logger.debug(`Condition failed: ${moveId}`, {
        moveId,
        reason: "Condition returned false",
      });
      return {
        error: `Move '${moveId}' condition not met`,
        errorCode: "CONDITION_FAILED",
        success: false,
      };
    }

    // Detailed ConditionFailure object (result must be ConditionFailure here)
    const failure = result as ConditionFailure; // TypeScript narrowing
    this.logger.debug(`Condition failed: ${moveId}`, {
      errorCode: failure.errorCode,
      moveId,
      reason: failure.reason,
    });
    return {
      error: failure.reason,
      errorCode: failure.errorCode,
      errorContext: failure.context,
      success: false,
    };
  }

  /**
   * Check if a move can be executed
   *
   * Task 11.11, 11.12: canExecuteMove without side effects
   *
   * Validates move without actually executing it.
   * Used for UI state (enable/disable buttons) and AI move filtering.
   *
   * @param moveId - Name of move to check
   * @param context - Move context with typed params
   * @returns True if move can be executed, false otherwise
   */
  canExecuteMove(moveId: string, contextInput: MoveContextInput<any>): boolean {
    const moveDef = this.gameDefinition.moves[moveId as keyof TMoves];
    if (!moveDef) {
      return false;
    }

    // Build full context with engine-provided services
    const contextWithOperations = this.buildMoveContext(contextInput);

    if (!moveDef.condition) {
      return true;
    }

    const result = moveDef.condition(this.currentState, contextWithOperations);

    // Support both boolean and ConditionFailure returns
    return result === true;
  }

  /**
   * Get all valid moves for current state
   *
   * Task 11.13, 11.14: getValidMoves enumeration
   *
   * Framework hook that games can use to enumerate available moves.
   * Returns list of move IDs that pass their conditions.
   *
   * Note: This is a basic implementation. Games may want to use
   * enumerateMoves() for more sophisticated enumeration that includes
   * parameter combinations and full validation.
   *
   * @param playerId - Player to get moves for
   * @returns Array of valid move IDs
   */
  getValidMoves(playerId: PlayerId): string[] {
    const validMoves: string[] = [];

    for (const moveId of Object.keys(this.gameDefinition.moves)) {
      // Create a minimal context for validation (params will be empty object for moves requiring no params)
      const context: MoveContextInput<any> = {
        params: {},
        playerId, // Empty params - moves with required params won't validate with empty context
      };

      if (this.canExecuteMove(moveId, context)) {
        validMoves.push(moveId);
      }
    }

    return validMoves;
  }

  /**
   * Enumerate all valid moves with parameters
   *
   * Discovers all possible moves for a given player by invoking
   * each move's enumerator function (if provided). Each enumerated
   * parameter set is then validated against the move's condition.
   *
   * This is the primary API for AI agents and UI components to discover
   * available actions at any game state.
   *
   * @param playerId - Player to enumerate moves for
   * @param options - Optional configuration for enumeration
   * @returns Array of enumerated moves with parameters
   *
   * @example
   * ```typescript
   * // Get all valid moves with parameters
   * const moves = engine.enumerateMoves(playerId, {
   *   validOnly: true,  // Only return moves that pass condition
   *   includeMetadata: true
   * });
   *
   * for (const move of moves) {
   *   console.log(`${move.moveId}:`, move.params);
   *   if (move.isValid) {
   *     // Can execute this move
   *     engine.executeMove(move.moveId, {
   *       playerId: move.playerId,
   *       params: move.params,
   *       targets: move.targets
   *     });
   *   }
   * }
   *
   * // Enumerate specific moves only
   * const attackMoves = engine.enumerateMoves(playerId, {
   *   moveIds: ['attack', 'special-attack'],
   *   validOnly: true
   * });
   * ```
   */
  enumerateMoves(playerId: PlayerId, options?: MoveEnumerationOptions): EnumeratedMove<unknown>[] {
    const results: EnumeratedMove<unknown>[] = [];
    const validOnly = options?.validOnly ?? false;
    const includeMetadata = options?.includeMetadata ?? false;
    const moveIdsFilter = options?.moveIds;
    const maxPerMove = options?.maxPerMove;

    // Log enumeration start (DEBUG level)
    this.logger.debug("Enumerating moves", {
      includeMetadata,
      moveIdsFilter,
      playerId,
      validOnly,
    });

    // Build enumeration context (similar to move execution context)
    const context = this.buildEnumerationContext(playerId);

    // Iterate through all moves
    for (const [moveId, moveDef] of Object.entries(this.gameDefinition.moves)) {
      // Filter by moveIds if specified
      if (moveIdsFilter && !moveIdsFilter.includes(moveId)) {
        continue;
      }

      // If move has no enumerator, add a placeholder result
      if (!moveDef.enumerator) {
        if (!validOnly) {
          results.push({
            isValid: false,
            moveId,
            params: {} as any,
            playerId,
            validationError: {
              errorCode: "NO_ENUMERATOR",
              reason: "Move requires parameters but no enumerator provided",
            },
          });
        }
        continue;
      }

      try {
        // Invoke enumerator to get parameter combinations
        const paramCombinations = moveDef.enumerator(this.currentState, context);

        // Limit results per move if specified
        const limitedCombinations = maxPerMove
          ? paramCombinations.slice(0, maxPerMove)
          : paramCombinations;

        // Log parameter combinations (TRACE level)
        this.logger.trace(
          `Enumerated ${limitedCombinations.length} parameter combinations for ${moveId}`,
          {
            count: limitedCombinations.length,
            moveId,
          },
        );

        // Validate each parameter combination
        for (const params of limitedCombinations) {
          const contextInput: MoveContextInput<any> = {
            params,
            playerId,
          };

          // Check if this move is valid
          const conditionResult = this.checkMoveCondition(moveId, contextInput);

          const enumeratedMove: import("../moves/move-enumeration").EnumeratedMove<any> = {
            isValid: conditionResult.success,
            moveId,
            params,
            playerId,
          };

          // Add validation error if failed
          if (!conditionResult.success) {
            enumeratedMove.validationError = {
              context: conditionResult.errorContext,
              errorCode: conditionResult.errorCode,
              reason: conditionResult.error,
            };
          }

          // Add metadata if requested
          if (includeMetadata && moveDef.metadata) {
            enumeratedMove.metadata = moveDef.metadata;
          }

          // Add to results (filter by validOnly)
          if (!validOnly || enumeratedMove.isValid) {
            results.push(enumeratedMove);
          }
        }
      } catch (error) {
        // Log enumerator error (ERROR level)
        const errorMessage =
          error instanceof Error ? error.message : "Enumerator function threw an error";
        this.logger.error(`Enumerator error for move: ${moveId}`, {
          error: errorMessage,
          moveId,
          stack: error instanceof Error ? error.stack : undefined,
        });

        // Add error result if not validOnly
        if (!validOnly) {
          results.push({
            isValid: false,
            moveId,
            params: {} as any,
            playerId,
            validationError: {
              context: { error: errorMessage },
              errorCode: "ENUMERATOR_ERROR",
              reason: `Enumerator failed: ${errorMessage}`,
            },
          });
        }
      }
    }

    // Log completion (DEBUG level)
    this.logger.debug(`Enumeration complete: ${results.length} moves found`, {
      count: results.length,
      playerId,
      validCount: results.filter((m) => m.isValid).length,
    });

    return results;
  }

  /**
   * Build enumeration context for move enumerators
   *
   * Creates a context with all necessary operations for parameter discovery.
   * Similar to buildMoveContext but focused on enumeration needs.
   *
   * @param playerId - Player to enumerate for
   * @returns Enumeration context
   * @private
   */
  private buildEnumerationContext(
    playerId: PlayerId,
  ): import("../moves/move-enumeration").MoveEnumerationContext<TCardMeta, TCardDefinition> {
    const zoneOps = createZoneOperations(this.internalState, this.logger.child("zones"), this.rng);
    const cardOps = createCardOperations(this.internalState, this.logger.child("cards"));
    const gameOps = createGameOperations(this.internalState, this.logger.child("game"));
    const counterOps = createCounterOperations(this.internalState, this.logger.child("counters"));

    // Add flow state if available
    const flowState = this.flowManager
      ? {
          currentPhase: this.flowManager.getCurrentPhase(),
          currentPlayer: this.flowManager.getCurrentPlayer() as PlayerId,
          currentSegment: this.flowManager.getCurrentSegment(),
          isFirstTurn: this.flowManager.isFirstTurn(),
          turn: this.flowManager.getTurnNumber(),
        }
      : undefined;

    return {
      cards: cardOps,
      counters: counterOps,
      flow: flowState,
      game: gameOps,
      playerId,
      registry: this.cardRegistry,
      rng: this.rng,
      zones: zoneOps,
    };
  }

  /**
   * Check if game has ended
   *
   * Task 10.10: Evaluate endIf condition
   *
   * Checks game end condition from GameDefinition.
   * Should be called after each move execution.
   *
   * @returns Game end result if ended, undefined otherwise
   */
  checkGameEnd() {
    if (this.gameDefinition.endIf) {
      return this.gameDefinition.endIf(this.currentState);
    }
    return undefined;
  }

  /**
   * Get game history for replay and undo
   *
   * Task 11.17, 11.18: getReplayHistory
   *
   * Returns full move history with context for replay and undo features.
   * Contains complete move context, patches, and inverse patches for deterministic replay.
   *
   * **Breaking Change**: This method was previously named `getHistory()`.
   *
   * **Migration Guide**:
   * - For replay/undo functionality: Use `getReplayHistory()` (this method)
   * - For user-facing history display: Use `getHistory()` with query options
   *
   * @example
   * ```typescript
   * // Before (old API):
   * const history = engine.getHistory();
   *
   * // After (new API):
   * // For replay/undo:
   * const replayHistory = engine.getReplayHistory();
   *
   * // For UI display:
   * const displayHistory = engine.getHistory({
   *   playerId: 'player_one',
   *   verbosity: 'CASUAL',
   *   includeFailures: false
   * });
   * ```
   *
   * @returns Array of history entries with full context, patches, and inverse patches
   */
  getReplayHistory(): readonly ReplayHistoryEntry<any, TCardMeta, TCardDefinition>[] {
    // Only the APPLIED prefix: entries past the cursor were rewound and are
    // kept solely so redo() can re-apply them.
    if (this.historyIndex >= this.history.length - 1) {
      return this.history;
    }
    return this.history.slice(0, this.historyIndex + 1);
  }

  /**
   * Cursor into the replay history: `applied` entries are in effect,
   * `redoable` more were rewound and can be re-applied (until a new move
   * truncates them). `undoGroups` / `redoGroups` count player-facing actions
   * (see `beginUndoGroup`).
   */
  getHistoryPosition(): { applied: number; redoable: number; undoGroups: number; redoGroups: number } {
    const countGroups = (from: number, to: number): number => {
      let n = 0;
      let last: number | undefined;
      for (let i = from; i < to; i++) {
        const g = this.history[i]?.group;
        if (g === undefined || g !== last) {
          n++;
        }
        last = g;
      }
      return n;
    };
    return {
      applied: this.historyIndex + 1,
      redoGroups: countGroups(this.historyIndex + 1, this.history.length),
      redoable: this.history.length - 1 - this.historyIndex,
      undoGroups: countGroups(0, this.historyIndex + 1),
    };
  }

  /** True when undo() has something to rewind. */
  canUndo(): boolean {
    return this.historyIndex >= 0;
  }

  /** True when redo() has a rewound action to re-apply. */
  canRedo(): boolean {
    return this.historyIndex < this.history.length - 1;
  }

  /** The first rewound entry redo() would re-apply (its whole group follows), if any. */
  peekRedo(): ReplayHistoryEntry<any, TCardMeta, TCardDefinition> | undefined {
    return this.canRedo() ? this.history[this.historyIndex + 1] : undefined;
  }

  /**
   * Open an undo group: every move executed until the matching
   * `endUndoGroup()` is ONE player-facing action for undo()/redo() (a driver
   * wraps "the move + the automatic procedures it fires" in one). Nested
   * calls join the outer group. The group's undo target is the position at
   * THIS call, so out-of-move adjustments a driver makes before the first
   * move (e.g. pointing the flow at the next player) are rewound too.
   */
  beginUndoGroup(): void {
    this.undoGroupDepth++;
    if (this.undoGroupDepth === 1) {
      this.openUndoGroup = { before: this.checkpoint(), id: ++this.undoGroupCounter };
    }
  }

  /**
   * Close the group opened by `beginUndoGroup()`. The redo target of the
   * group's last recorded move is refreshed to the position NOW, so
   * out-of-move adjustments made after it are re-applied by redo() as well.
   */
  endUndoGroup(): void {
    if (this.undoGroupDepth === 0) {
      return;
    }
    this.undoGroupDepth--;
    if (this.undoGroupDepth > 0) {
      return;
    }
    const group = this.openUndoGroup;
    this.openUndoGroup = undefined;
    const last = this.history[this.historyIndex];
    if (group && last && last.group === group.id && this.historyIndex === this.history.length - 1) {
      last.after = this.checkpoint();
      last.internalStateAfter = last.after.internalState;
    }
  }

  /** Run `fn` inside an undo group (see `beginUndoGroup`). */
  withUndoGroup<T>(fn: () => T): T {
    this.beginUndoGroup();
    try {
      return fn();
    } finally {
      this.endUndoGroup();
    }
  }

  /**
   * Capture the complete engine position. `internalState` may be supplied
   * when the caller already holds a fresh clone.
   */
  private checkpoint(internalState?: unknown): EngineCheckpoint<TState> {
    return {
      extension: this.gameDefinition.historyExtension?.snapshot(),
      flow: this.flowManager?.serializeFlowState(),
      gameEndResult: this.gameEndResult ? structuredClone(this.gameEndResult) : undefined,
      gameEnded: this.gameEnded,
      internalState: internalState ?? structuredClone(this.internalState),
      rng: this.rng.getState(),
      state: this.currentState,
      trackers: this.trackerSystem.getState(),
    };
  }

  /** Put the engine at `cp` — every part of the position, atomically. */
  private restoreCheckpoint(cp: EngineCheckpoint<TState>): void {
    this.currentState = cp.state;
    this.assignInternalState(cp.internalState as InternalState<TCardDefinition, TCardMeta>);
    if (this.flowManager && cp.flow) {
      this.flowManager.restoreFlowState(cp.flow, this.currentState);
    } else if (this.flowManager) {
      this.flowManager.syncState(this.currentState);
    }
    this.rng.setState(cp.rng);
    this.trackerSystem.setState(cp.trackers);
    this.gameEnded = cp.gameEnded;
    this.gameEndResult = cp.gameEndResult ? structuredClone(cp.gameEndResult) : undefined;
    if (this.gameDefinition.historyExtension) {
      this.gameDefinition.historyExtension.restore(cp.extension);
    }
  }

  /**
   * Replace the CONTENTS of `internalState` with a copy of `snapshot`, keeping
   * the object itself: the FlowManager's zone/card operations were created
   * once over this object, so swapping the reference would leave every later
   * flow hook (channel, draw…) mutating an orphan.
   */
  private assignInternalState(snapshot: InternalState<TCardDefinition, TCardMeta>): void {
    const copy = structuredClone(snapshot) as unknown as Record<string, unknown>;
    const live = this.internalState as unknown as Record<string, unknown>;
    for (const key of Object.keys(live)) {
      if (!(key in copy)) {
        delete live[key];
      }
    }
    Object.assign(live, copy);
  }

  /**
   * Get patches since a specific point
   *
   * Task 11.21, 11.22: getPatches
   *
   * Returns all patches accumulated since the given history index.
   * Used for incremental network synchronization.
   *
   * @param sinceIndex - History index to get patches from (default: 0)
   * @returns Array of patches
   */
  getPatches(sinceIndex = 0): Patch[] {
    const patches: Patch[] = [];

    for (let i = sinceIndex; i <= this.historyIndex; i++) {
      const entry = this.history[i];
      if (entry) {
        patches.push(...entry.patches);
      }
    }

    return patches;
  }

  /**
   * Apply patches to state
   *
   * Task 11.23, 11.24: applyPatches for network sync
   *
   * Applies a set of patches from the server to update local state.
   * Used by clients to stay in sync with authoritative server state.
   *
   * @param patches - Patches to apply
   */
  applyPatches(patches: Patch[]): void {
    // Use Immer's built-in applyPatches for correct patch application
    // Type assertion is safe here because Immer patches preserve the type
    this.currentState = immerApplyPatches(this.currentState as object, patches) as TState;
  }

  /**
   * Undo last move
   *
   * Task 11.15, 11.16: Undo with inverse patches
   *
   * Reverts the last move using inverse patches.
   * Updates history index to enable redo.
   *
   * @returns True if undo succeeded, false if no moves to undo
   */
  undo(): boolean {
    if (this.historyIndex < 0 || this.undoGroupDepth > 0) {
      return false;
    }

    const entry = this.history[this.historyIndex];
    if (!entry) {
      return false;
    }

    // Rewind the whole group (the move + the automatic procedures recorded
    // with it) to the position before its first move.
    let first = this.historyIndex;
    while (first > 0 && entry.group !== undefined && this.history[first - 1]?.group === entry.group) {
      first--;
    }
    const target = this.history[first];
    if (!target?.before) {
      return false;
    }

    this.restoreCheckpoint(target.before as EngineCheckpoint<TState>);
    this.historyIndex = first - 1;
    return true;
  }

  /**
   * Redo previously undone move
   *
   * Task 11.15, 11.16: Redo with forward patches
   *
   * Re-applies a move that was undone.
   *
   * @returns True if redo succeeded, false if no moves to redo
   */
  redo(): boolean {
    if (this.historyIndex >= this.history.length - 1 || this.undoGroupDepth > 0) {
      return false;
    }

    const entry = this.history[this.historyIndex + 1];
    if (!entry) {
      return false;
    }

    // Re-apply the whole group: jump to the position after its last move.
    let last = this.historyIndex + 1;
    while (
      last < this.history.length - 1 &&
      entry.group !== undefined &&
      this.history[last + 1]?.group === entry.group
    ) {
      last++;
    }
    const target = this.history[last];
    if (!target?.after) {
      return false;
    }

    this.restoreCheckpoint(target.after as EngineCheckpoint<TState>);
    this.historyIndex = last;
    return true;
  }

  /**
   * Replay game from history
   *
   * Task 11.19, 11.20: Replay with deterministic execution
   *
   * Replays the game from initial state using recorded history.
   * Useful for game analysis, bug reproduction, and verification.
   *
   * @param upToIndex - Optional index to replay up to (default: all)
   * @returns Final state after replay
   */
  replay(upToIndex?: number): TState {
    // Reset RNG to initial seed for deterministic replay
    const originalSeed = this.rng.getSeed();
    this.rng.setSeed(originalSeed);

    // Reset internal state (zones, cards, choosingFirstPlayer, etc.)
    this.internalState = {
      cardMetas: {},
      cards: {},
      zones: {},
    };

    // Recreate zones from game definition
    if (this.gameDefinition.zones) {
      for (const zoneId in this.gameDefinition.zones) {
        const zoneConfig = this.gameDefinition.zones[zoneId];
        if (zoneConfig) {
          this.internalState.zones[zoneId] = {
            cardIds: [],
            config: zoneConfig,
          };
        }
      }
    }

    // Set which player gets to choose who goes first
    // This must match the original constructor behavior for deterministic replay
    if (this.initialPlayers.length > 0) {
      if (this.initialChoosingFirstPlayer) {
        // Use explicitly specified choosing player (stored from initial options)
        this.internalState.choosingFirstPlayer = createPlayerId(this.initialChoosingFirstPlayer);
      } else {
        // Randomly select if not specified (must match constructor)
        const randomIndex = Math.floor(this.rng.random() * this.initialPlayers.length);
        const choosingPlayer = this.initialPlayers[randomIndex];
        if (choosingPlayer) {
          this.internalState.choosingFirstPlayer = createPlayerId(choosingPlayer.id);
        }
      }
    }

    // Reset to initial state
    this.currentState = this.gameDefinition.setup(this.initialPlayers);

    const endIndex = upToIndex ?? this.history.length;

    for (let i = 0; i < endIndex; i++) {
      const entry = this.history[i];
      if (!entry) {
        break;
      }

      // Re-execute the move
      this.executeMove(entry.moveId, entry.context);
    }

    return this.getState();
  }

  /**
   * Get RNG instance
   *
   * Task 11.25, 11.26: RNG integration
   *
   * Provides access to the seeded RNG for deterministic random operations.
   * Games should use this RNG (not Math.random()) for all randomness.
   *
   * @returns Seeded RNG instance
   */
  getRNG(): SeededRNG {
    return this.rng;
  }

  /**
   * Get flow manager
   *
   * Task 11.27, 11.28: Flow integration
   *
   * Provides access to the flow orchestration system.
   * Returns undefined if no flow definition in GameDefinition.
   *
   * @returns FlowManager instance or undefined
   */
  getFlowManager(): FlowManager<TState> | undefined {
    return this.flowManager;
  }

  /**
   * Get logger instance
   *
   * Provides access to the engine's logger for custom logging.
   * Useful for game-specific logging or debugging.
   *
   * @returns Logger instance
   *
   * @example
   * ```typescript
   * const engine = new RuleEngine(gameDefinition, players, {
   *   logger: { level: 'DEVELOPER', pretty: true }
   * });
   *
   * const logger = engine.getLogger();
   * logger.info('Custom game event', { eventId: 'custom-123' });
   * ```
   */
  getLogger(): Logger {
    return this.logger;
  }

  /**
   * Get telemetry manager instance
   *
   * Provides access to the telemetry system for custom event tracking.
   * Useful for analytics, monitoring, and debugging integrations.
   *
   * @returns TelemetryManager instance
   *
   * @example
   * ```typescript
   * const engine = new RuleEngine(gameDefinition, players, {
   *   telemetry: { enabled: true }
   * });
   *
   * const telemetry = engine.getTelemetry();
   * telemetry.on('playerAction', (event) => {
   *   analytics.track('game.move', event);
   * });
   * ```
   */
  getTelemetry(): TelemetryManager {
    return this.telemetry;
  }

  /**
   * Add entry to history
   *
   * Internal method to manage history tracking.
   * Truncates forward history when new move is made after undo.
   */
  private addToHistory(entry: ReplayHistoryEntry): void {
    // Truncate forward history if we're not at the end
    if (this.historyIndex < this.history.length - 1) {
      this.history.splice(this.historyIndex + 1);
    }

    this.history.push(entry);
    this.historyIndex = this.history.length - 1;
  }
}
