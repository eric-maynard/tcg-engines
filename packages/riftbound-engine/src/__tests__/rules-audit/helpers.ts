/**
 * Rules Audit Test Helpers
 *
 * Minimal-state helpers for constructing rule-focused unit tests.
 *
 * Design principles:
 * 1. Minimal state construction — only include what a specific rule needs.
 * 2. Bypass move validation for SETUP (direct state/zone mutation via engine
 *    internals). Use real engine code for the BEHAVIOR being tested.
 * 3. Readable, deterministic, no RNG surprises.
 *
 * IMPORTANT: These helpers intentionally reach into `RuleEngine.internalState`
 * (private) via a narrow type-cast. This is acceptable for tests because:
 *   - Direct state construction is required to test rules in isolation.
 *   - Tests must be able to place cards in arbitrary zones without going
 *     through the full "draw/play/channel" pipeline.
 *   - Helpers do NOT modify engine source code, so any engine bug will still
 *     surface as a failing test (not a hidden override).
 */

import { RuleEngine } from "@tcg/core";
import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId } from "@tcg/core";
import { recalculateStaticEffects } from "../../abilities/static-abilities";
import type { StaticAbilityContext } from "../../abilities/static-abilities";
import { fireTriggers as engineFireTriggers } from "../../abilities/trigger-runner";
import type { TriggerRunnerContext } from "../../abilities/trigger-runner";
import type { GameEvent } from "../../abilities/game-events";
import type { TurnInteractionState } from "../../chain/chain-state";
import { riftboundDefinition } from "../../game-definition/definition";
import {
  type CardDefinitionLookup,
  CardDefinitionRegistry,
  getGlobalCardRegistry,
  setGlobalCardRegistry,
} from "../../operations/card-lookup";
import type {
  CardId,
  Domain,
  GamePhase,
  PlayerId,
  RiftboundCardMeta,
  RiftboundGameState,
  RiftboundMoves,
} from "../../types";

/** Standard player IDs used throughout the rule-audit suite. */
export const P1: PlayerId = "player-1";
export const P2: PlayerId = "player-2";
/** Additional player IDs for 3/4-player rule tests (FFA3, FFA4, Magma Chamber). */
export const P3: PlayerId = "player-3";
export const P4: PlayerId = "player-4";

/** Zone names usable in helpers (non-battlefield). */
export type SimpleZone =
  | "base"
  | "hand"
  | "runePool"
  | "trash"
  | "banishment"
  | "legendZone"
  | "championZone"
  | "mainDeck"
  | "runeDeck";

export type ZoneName = SimpleZone | `battlefield-${string}`;

/**
 * Riftbound card types used by rule tests.
 */
export type RuleAuditCardType =
  | "unit"
  | "gear"
  | "spell"
  | "rune"
  | "battlefield"
  | "legend"
  | "equipment";

/** Engine tuple used throughout the helpers file. */
export type AuditEngine = RuleEngine<
  RiftboundGameState,
  RiftboundMoves,
  unknown,
  RiftboundCardMeta
>;

/**
 * A lightweight audit "state" object that bundles the RuleEngine
 * and a synthetic player context. Tests interact with this object
 * (not directly with RuleEngine) so we can swap internals later.
 */
export interface AuditState {
  /** The real RuleEngine with riftboundDefinition. */
  engine: AuditEngine;
  /** Shortcut to the live game state (immutable snapshot). */
  readonly state: RiftboundGameState;
}

/**
 * Internal view of RuleEngine's private state. Narrow-cast only.
 */
interface InternalEngineView {
  internalState: {
    zones: Record<
      string,
      {
        config: unknown;
        cardIds: CoreCardId[];
      }
    >;
    cards: Record<
      string,
      {
        definitionId: string;
        owner: CorePlayerId;
        controller: CorePlayerId;
        zone: ZoneId;
        position?: number;
      }
    >;
    cardMetas: Record<string, RiftboundCardMeta>;
  };
  currentState: RiftboundGameState;
}

/**
 * Pull the private `internalState` out of a RuleEngine for direct mutation.
 * Used for setup only; behavior is tested through the real engine.
 */
function asInternal(engine: AuditEngine): InternalEngineView {
  return engine as unknown as InternalEngineView;
}

/**
 * Options for createMinimalGameState.
 */
export interface MinimalStateOverrides {
  turn?: number;
  phase?: GamePhase;
  currentPlayer?: PlayerId;
  runePools?: Partial<Record<PlayerId, { energy?: number; power?: Record<string, number> }>>;
  victoryScore?: number;
  /**
   * Create battlefield entries on construction. Each entry is a battlefield ID.
   * Controllers default to null (uncontrolled).
   */
  battlefields?: string[];
  /**
   * Number of players in the game. Defaults to 2 (P1/P2). Set to 3 or 4 to
   * enable FFA3/FFA4/Magma Chamber style rule tests with P3/P4 seeded.
   */
  playerCount?: 2 | 3 | 4;
}

/**
 * Create a minimal, playable game state.
 *
 * Sets up 2 players, empty zones, an engine in the `mainGame` segment, and
 * turn 1 / main phase by default. Everything else is either empty or `0`.
 *
 * Overrides (phase, turn, rune pools) are applied on top of the default
 * state via direct state patching (tests bypass move validation).
 */
export function createMinimalGameState(overrides: MinimalStateOverrides = {}): AuditEngine {
  // Give each engine a fresh card registry so tests don't bleed into each other.
  setGlobalCardRegistry(new CardDefinitionRegistry());

  const playerCount = overrides.playerCount ?? 2;
  const playerDefs = [
    { id: P1, name: "Player One" },
    { id: P2, name: "Player Two" },
  ];
  if (playerCount >= 3) {
    playerDefs.push({ id: P3, name: "Player Three" });
  }
  if (playerCount >= 4) {
    playerDefs.push({ id: P4, name: "Player Four" });
  }

  const engine = new RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>(
    riftboundDefinition,
    playerDefs,
    { seed: "rules-audit" },
  );

  // Patch the currentState into a clean "playing" baseline BEFORE pushing
  // The flow manager into mainGame, so the flow manager's internal state
  // Captures our test overrides (rune pools, phase, etc.) from the start.
  // The engine's
  // CurrentState is produced via Immer (frozen) so direct field mutation is
  // Not allowed — we clone, mutate, and swap back in via the internal view.
  const internal = asInternal(engine);
  const st = structuredClone(internal.currentState) as RiftboundGameState & {
    status: string;
    turn: { number: number; phase: GamePhase; activePlayer: PlayerId };
    setup?: unknown;
    victoryScore: number;
  };

  st.status = "playing";
  st.turn = {
    activePlayer: overrides.currentPlayer ?? P1,
    number: overrides.turn ?? 1,
    phase: overrides.phase ?? "main",
  };
  st.setup = undefined;

  // Initialize rune pools for every player.
  const allPlayers: PlayerId[] = playerDefs.map((p) => p.id as PlayerId);
  for (const pid of allPlayers) {
    (st.runePools as Record<string, { energy: number; power: Record<string, number> }>)[pid] = {
      energy: 0,
      power: {},
    };
  }
  for (const [pid, pool] of Object.entries(overrides.runePools ?? {})) {
    if (!pool) {
      continue;
    }
    (st.runePools as Record<string, { energy: number; power: Record<string, number> }>)[pid] = {
      energy: pool.energy ?? 0,
      power: (pool.power ?? {}) as Record<string, number>,
    };
  }

  // Ensure per-turn tracking maps are initialized for every player.
  const cq = st.conqueredThisTurn as Record<string, CardId[]>;
  const sq = st.scoredThisTurn as Record<string, CardId[]>;
  const xg = st.xpGainedThisTurn as Record<string, number>;
  for (const pid of allPlayers) {
    cq[pid] = cq[pid] ?? [];
    sq[pid] = sq[pid] ?? [];
    xg[pid] = xg[pid] ?? 0;
  }
  // Rule 724 (Legion): per-player main-deck plays counter.
  if (!st.cardsPlayedThisTurn) {
    (st as RiftboundGameState & { cardsPlayedThisTurn: Record<string, number> }).cardsPlayedThisTurn = {};
  }
  const cp = st.cardsPlayedThisTurn as Record<string, number>;
  for (const pid of allPlayers) {
    cp[pid] = cp[pid] ?? 0;
  }

  if (overrides.victoryScore !== undefined) {
    st.victoryScore = overrides.victoryScore;
  }

  // Swap the new state into the engine.
  (internal as { currentState: RiftboundGameState }).currentState = st as RiftboundGameState;

  // Transition the flow manager into the `mainGame` segment so phase hooks
  // Fire on advancePhase() calls. The transitionToPlay move requires decks,
  // Which rule-audit tests don't want — so we drive the flow manager's
  // NextGameSegment() directly and then immediately sync our patched state
  // So hooks fire against the overridden values (rune pools, phase, etc.).
  const flowManager = engine.getFlowManager();
  if (flowManager && flowManager.getCurrentGameSegment?.() === "setup") {
    flowManager.nextGameSegment();
    // Re-sync: nextGameSegment ran mainGame.onBegin which set turn.phase to
    // "awaken" on a fresh draft. Push our user-overridden state (phase,
    // RunePools, currentPlayer) back into the flow manager.
    flowManager.syncState(internal.currentState);
  }
  // Set the flow manager's current player explicitly — bypassing the normal
  // Setup flow means currentPlayer is undefined by default, which causes
  // Phase hooks to index into `runePools[undefined]` and silently no-op.
  flowManager?.setCurrentPlayer(overrides.currentPlayer ?? P1);
  // Align the flow manager's internal turnNumber with the user-overridden
  // State.turn.number so hooks that read `context.getTurnNumber()` see the
  // Same value as `context.state.turn.number`. The flow manager has its own
  // Counter that is incremented on phase transitions and is NOT synced from
  // State — without this patch, tests that override `turn` get the default
  // TurnNumber=1 inside hooks.
  if (flowManager && overrides.turn !== undefined) {
    (flowManager as unknown as { turnNumber: number }).turnNumber = overrides.turn;
  }

  // Optional battlefields.
  for (const bfId of overrides.battlefields ?? []) {
    createBattlefield(engine, bfId, { controller: null });
  }

  return engine;
}

/**
 * Parameters for createCard.
 */
export interface CreateCardParams {
  zone: ZoneName;
  owner: PlayerId;
  cardType: RuleAuditCardType;
  might?: number;
  energyCost?: number;
  powerCost?: string[];
  domain?: string | string[];
  keywords?: string[];
  abilities?: CardDefinitionLookup["abilities"];
  meta?: Partial<RiftboundCardMeta>;
  /** Card name, defaults to cardId. */
  name?: string;
  /** Controller, defaults to owner. */
  controller?: PlayerId;
  /**
   * Spell timing. `"action"` (default) or `"reaction"`.
   * Only meaningful for cards of type `"spell"`. Consumed by
   * `registry.getSpellTiming` during playSpell validation.
   */
  timing?: "action" | "reaction";
}

/**
 * Register a card in the global CardDefinitionRegistry AND place it in a zone.
 *
 * This bypasses normal "play from hand" flow so tests can construct any
 * board configuration they need.
 */
export function createCard(engine: AuditEngine, cardId: CardId, params: CreateCardParams): void {
  const internal = asInternal(engine);

  // 1. Register the card definition in the global registry so abilities,
  //    Keyword checks, and cost lookups work during engine behavior tests.
  //    Note: we always use/ensure a fresh registry is set via
  //    SetGlobalCardRegistry in createMinimalGameState; we just register
  //    This specific card here.
  const registry =
    // Use the already-set global registry from createMinimalGameState.
    // Avoid importing getGlobalCardRegistry to dodge circular concerns.
    (() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getGlobalCardRegistry } = require("../../operations/card-lookup") as {
        getGlobalCardRegistry: () => CardDefinitionRegistry;
      };
      return getGlobalCardRegistry();
    })();

  registry.register(cardId, {
    abilities: params.abilities ?? [],
    cardType: params.cardType,
    domain: params.domain,
    energyCost: params.energyCost,
    id: cardId,
    keywords: params.keywords ?? [],
    might: params.might,
    name: params.name ?? cardId,
    powerCost: params.powerCost,
    timing: params.timing,
  });

  // 2. Ensure the target zone exists in the internalState. For battlefield
  //    Zones, we lazily create them.
  const zoneId = params.zone as string as ZoneId;
  if (!internal.internalState.zones[zoneId]) {
    if (params.zone.startsWith("battlefield-")) {
      internal.internalState.zones[zoneId] = {
        cardIds: [],
        config: {
          faceDown: false,
          id: zoneId,
          name: `Battlefield ${params.zone}`,
          ordered: false,
          visibility: "public",
        },
      };
    } else {
      throw new Error(
        `Zone "${params.zone}" does not exist on the engine. ` +
          `Only battlefield-* zones are auto-created; other zones come from riftboundDefinition.`,
      );
    }
  }

  // 3. Place the card instance in internalState.cards and the zone's cardIds.
  internal.internalState.cards[cardId] = {
    controller: (params.controller ?? params.owner) as CorePlayerId,
    definitionId: cardId,
    owner: params.owner as CorePlayerId,
    zone: zoneId,
  };
  internal.internalState.zones[zoneId]?.cardIds.push(cardId as CoreCardId);

  // 4. Initialize card metadata.
  internal.internalState.cardMetas[cardId] = {
    buffed: false,
    combatRole: null,
    damage: 0,
    exhausted: false,
    hidden: false,
    stunned: false,
    ...params.meta,
  };

  // 5. For runes, record domain on meta (some rules/effects check it).
  if (params.cardType === "rune" && params.domain) {
    const domain = Array.isArray(params.domain) ? params.domain[0] : params.domain;
    internal.internalState.cardMetas[cardId].domain = domain as Domain;
  }
}

/**
 * Parameters for createBattlefield.
 */
export interface CreateBattlefieldParams {
  controller: PlayerId | null;
  contested?: boolean;
  contestedBy?: PlayerId;
  abilities?: CardDefinitionLookup["abilities"];
  /** Place the battlefield card in the battlefieldRow zone. Default true. */
  placeInRow?: boolean;
}

/**
 * Create a battlefield state entry AND place a battlefield card in
 * battlefieldRow. Also creates the `battlefield-<id>` zone.
 */
export function createBattlefield(
  engine: AuditEngine,
  battlefieldId: CardId,
  params: CreateBattlefieldParams,
): void {
  const internal = asInternal(engine);

  // Rebuild state with the new battlefield entry (current state is Immer-frozen).
  const newState = structuredClone(internal.currentState) as RiftboundGameState & {
    battlefields: Record<string, unknown>;
  };
  (newState.battlefields as Record<string, unknown>)[battlefieldId] = {
    contested: params.contested ?? false,
    contestedBy: params.contestedBy,
    controller: params.controller,
    id: battlefieldId,
  };
  (internal as { currentState: RiftboundGameState }).currentState = newState as RiftboundGameState;

  // Register the battlefield card in the global registry.
  const registry = (() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getGlobalCardRegistry } = require("../../operations/card-lookup") as {
      getGlobalCardRegistry: () => CardDefinitionRegistry;
    };
    return getGlobalCardRegistry();
  })();
  registry.register(battlefieldId, {
    abilities: params.abilities ?? [],
    cardType: "battlefield",
    id: battlefieldId,
    name: battlefieldId,
  });

  // Create the battlefield zone.
  const bfZoneId = `battlefield-${battlefieldId}` as ZoneId;
  if (!internal.internalState.zones[bfZoneId]) {
    internal.internalState.zones[bfZoneId] = {
      cardIds: [],
      config: {
        faceDown: false,
        id: bfZoneId,
        name: `Battlefield ${battlefieldId}`,
        ordered: false,
        visibility: "public",
      },
    };
  }

  // Create the paired facedown zone (Hidden zone, rule 723). Each
  // Battlefield has exactly one associated facedown zone. Rule 106.4.b:
  // Max occupancy of 1 card.
  const facedownZoneId = `facedown-${battlefieldId}` as ZoneId;
  if (!internal.internalState.zones[facedownZoneId]) {
    internal.internalState.zones[facedownZoneId] = {
      cardIds: [],
      config: {
        faceDown: true,
        id: facedownZoneId,
        maxSize: 1,
        name: `Facedown ${battlefieldId}`,
        ordered: false,
        visibility: "private",
      },
    };
  }

  if (params.placeInRow !== false) {
    const rowId = "battlefieldRow" as ZoneId;
    if (internal.internalState.zones[rowId]) {
      internal.internalState.cards[battlefieldId] = {
        controller: (params.controller ?? P1) as CorePlayerId,
        definitionId: battlefieldId,
        owner: (params.controller ?? P1) as CorePlayerId,
        zone: rowId,
      };
      internal.internalState.zones[rowId].cardIds.push(battlefieldId as CoreCardId);
      internal.internalState.cardMetas[battlefieldId] = {
        buffed: false,
        combatRole: null,
        damage: 0,
        exhausted: false,
        hidden: false,
        stunned: false,
      };
    }
  }
}

/**
 * Advance the game's phase up to (and including the `onBegin` of) the target
 * phase by driving the real flow manager's `nextPhase()` directly. All phase
 * hooks (`onEnd`, `onBegin`) fire through the real flow manager, and state
 * mutations inside those hooks are synced back onto the engine's
 * `currentState` so tests can assert on them.
 *
 * Limitation: advancePhase cannot move BACKWARDS. If the current phase is
 * already past the target phase, it will wrap around to the next turn.
 */
export function advancePhase(engine: AuditEngine, targetPhase: GamePhase): void {
  const flowManager = engine.getFlowManager();
  if (!flowManager) {
    return;
  }

  const internal = asInternal(engine);

  // Push the engine's current state into the flow manager so hooks see the
  // Right baseline (rune pools, damage, battlefields, etc.).
  flowManager.syncState(internal.currentState);

  // Also propagate the current phase/turn from state INTO the flow manager
  // By asking it where it is. If the flow manager is in a different phase
  // Than `state.turn.phase`, we trust state.turn.phase as the source of truth
  // For testing — walk the flow manager until it matches.
  const MAX_STEPS = 30;
  let steps = 0;

  // First, align flow manager phase with state.turn.phase if they drifted
  // (e.g. we set `phase: "draw"` in createMinimalGameState but the flow
  // Manager started in `awaken`).
  const desiredStart = internal.currentState.turn.phase;
  while (flowManager.getCurrentPhase?.() !== desiredStart && steps++ < MAX_STEPS) {
    const before = flowManager.getCurrentPhase?.();
    flowManager.nextPhase();
    if (flowManager.getCurrentPhase?.() === before) {
      // Couldn't make progress — break to avoid infinite loop.
      break;
    }
  }

  steps = 0;
  while (flowManager.getCurrentPhase?.() !== targetPhase && steps++ < MAX_STEPS) {
    const before = flowManager.getCurrentPhase?.();
    flowManager.nextPhase();
    if (flowManager.getCurrentPhase?.() === before) {
      break;
    }
  }

  // Sync the flow manager's state back to the engine so tests see the
  // Hook-induced mutations.
  const fmState = (
    flowManager as unknown as { getGameState: () => RiftboundGameState }
  ).getGameState();
  (internal as { currentState: RiftboundGameState }).currentState = fmState;
}

/**
 * Run a move through the real engine reducer. Does NOT perform the pre-move
 * condition check separately — the engine does both as one action. Returns a
 * success/error object.
 */
export function applyMove(
  engine: AuditEngine,
  moveName: string,
  params: Record<string, unknown>,
): { success: boolean; error?: string } {
  const playerId = (params.playerId as PlayerId) ?? engine.getState().turn.activePlayer;
  const result = engine.executeMove(moveName, {
    params: params as Record<string, unknown>,
    playerId: playerId as CorePlayerId,
  });
  return { error: "error" in result ? result.error : undefined, success: result.success };
}

/**
 * Check only the `canMake` / condition of a move; do not execute it.
 */
export function checkMoveLegal(
  engine: AuditEngine,
  moveName: string,
  params: Record<string, unknown>,
): boolean {
  const playerId = (params.playerId as PlayerId) ?? engine.getState().turn.activePlayer;
  return engine.canExecuteMove(moveName, {
    params,
    playerId: playerId as CorePlayerId,
  });
}

/**
 * Manually fire a game event through the trigger runner, bypassing moves.
 * Returns the number of triggers fired.
 */
export function fireTrigger(engine: AuditEngine, event: GameEvent): number {
  const internal = asInternal(engine);
  const ctx: TriggerRunnerContext = {
    cards: {
      getCardMeta: (cardId) => internal.internalState.cardMetas[cardId as string],
      getCardOwner: (cardId) => internal.internalState.cards[cardId as string]?.owner,
      updateCardMeta: (cardId, meta) => {
        const current = internal.internalState.cardMetas[cardId as string];
        if (current) {
          internal.internalState.cardMetas[cardId as string] = {
            ...current,
            ...meta,
          };
        }
      },
    },
    counters: {
      // AddCounter writes to `cardMetas[cardId].damage` for counter="damage",
      // Or to any other numeric meta field for named counters. Tests that
      // Observe the side effects of `damage` / `heal` / buff-counter effects
      // Need this to be a real mutator, otherwise the "trigger fired" can
      // Only be inferred from fireTriggers' numeric return.
      addCounter: (cardId, counter, amount) => {
        const meta = internal.internalState.cardMetas[cardId as string];
        if (!meta) {return;}
        if (counter === "damage") {
          meta.damage = (meta.damage ?? 0) + amount;
        } else {
          // Preserve the value on an ad-hoc field so tests can read it.
          (meta as unknown as Record<string, number>)[counter] =
            ((meta as unknown as Record<string, number>)[counter] ?? 0) + amount;
        }
      },
      clearCounter: (cardId, counter) => {
        const meta = internal.internalState.cardMetas[cardId as string];
        if (!meta) {return;}
        if (counter === "damage") {
          meta.damage = 0;
        } else {
          (meta as unknown as Record<string, number>)[counter] = 0;
        }
      },
      removeCounter: (cardId, counter, amount) => {
        const meta = internal.internalState.cardMetas[cardId as string];
        if (!meta) {return;}
        if (counter === "damage") {
          meta.damage = Math.max(0, (meta.damage ?? 0) - amount);
        } else {
          (meta as unknown as Record<string, number>)[counter] = Math.max(
            0,
            ((meta as unknown as Record<string, number>)[counter] ?? 0) - amount,
          );
        }
      },
      setFlag: (cardId, flag, value) => {
        const meta = internal.internalState.cardMetas[cardId as string];
        if (!meta) {return;}
        (meta as unknown as Record<string, boolean>)[flag] = value;
      },
    },
    draft: internal.currentState,
    zones: {
      drawCards: () => {
        // No-op for fireTrigger helper; tests that need real draws should
        // Use applyMove instead.
      },
      getCardZone: (cardId) => internal.internalState.cards[cardId as string]?.zone,
      getCardsInZone: (zoneId, playerId) => {
        const zone = internal.internalState.zones[zoneId as string];
        if (!zone) {return [];}
        if (!playerId) {return [...zone.cardIds];}
        return zone.cardIds.filter(
          (cardId) => internal.internalState.cards[cardId as string]?.owner === playerId,
        );
      },
      moveCard: ({ cardId, targetZoneId }) => {
        // Remove from current zone; push to target zone.
        const card = internal.internalState.cards[cardId as string];
        if (card) {
          const oldZone = internal.internalState.zones[card.zone];
          if (oldZone) {
            oldZone.cardIds = oldZone.cardIds.filter((id) => id !== cardId);
          }
          card.zone = targetZoneId;
          const newZone = internal.internalState.zones[targetZoneId];
          if (newZone) {
            newZone.cardIds.push(cardId);
          }
        }
      },
    },
  };
  return engineFireTriggers(event, ctx);
}

/**
 * Directly execute a single phase's `onBegin` (or `onEnd`) hook on the
 * engine, bypassing the flow manager's cascading `nextPhase()` behavior.
 *
 * Background: the real flow manager auto-cascades through every phase
 * with `endIf: () => true` in a single `nextPhase()` call, which means
 * helpers that walk phases by calling `nextPhase()` repeatedly can run
 * the same hook multiple times as they wrap through turns. For surgical
 * rule tests we need to run a single phase hook ONCE against a known
 * state.
 *
 * This helper reaches into the flow manager's private `executeHook`
 * method and runs the onBegin (or onEnd) of the requested phase from
 * `riftboundFlow.gameSegments.mainGame.turn.phases[phase]`. The flow
 * manager's `currentPhase` is NOT changed by the hook itself — only
 * the hook's state mutations are applied. After mutation we sync back
 * onto the engine.
 */
export function runPhaseHook(
  engine: AuditEngine,
  phase: GamePhase,
  hookName: "onBegin" | "onEnd" = "onBegin",
): void {
  const flowManager = engine.getFlowManager();
  if (!flowManager) {
    return;
  }
  const internal = asInternal(engine);

  // Sync state into flow manager so the hook sees our test-set rune
  // Pools, battlefields, cards, etc.
  flowManager.syncState(internal.currentState);

  // Align flow manager's currentPhase so `getCurrentPhase()` reads the
  // Right value inside the hook.
  const fmInternal = flowManager as unknown as {
    currentPhase?: string;
    isTransitioning?: boolean;
    executeHook: (hook: unknown) => void;
  };
  fmInternal.currentPhase = phase;
  // Prevent executeHook from cascading pending transitions after run.
  fmInternal.isTransitioning = true;

  const flowDef = riftboundDefinition.flow as unknown as {
    gameSegments?: Record<
      string,
      {
        turn?: {
          phases?: Record<string, { onBegin?: unknown; onEnd?: unknown }>;
        };
      }
    >;
  };
  const phaseDef = flowDef?.gameSegments?.mainGame?.turn?.phases?.[phase];
  if (phaseDef) {
    const hook = hookName === "onBegin" ? phaseDef.onBegin : phaseDef.onEnd;
    if (hook) {
      fmInternal.executeHook(hook);
    }
  }
  fmInternal.isTransitioning = false;

  // Sync flow manager's state back onto the engine so tests can read it.
  const newState = (
    flowManager as unknown as { getGameState: () => RiftboundGameState }
  ).getGameState();
  (internal as { currentState: RiftboundGameState }).currentState = newState;
}

// ---------------------------------------------------------------------------
// Static ability helpers (Wave 3E)
// ---------------------------------------------------------------------------

/**
 * Run the engine's static ability recalculation over the current state.
 *
 * This is the unit-level entry point used by `performCleanup` after every
 * state mutation. Calling it directly lets rule-audit tests observe the
 * pure static-ability layer without pulling in death checks, combat
 * bookkeeping, etc.
 *
 * Tests that want the full state-based check cycle should instead drive a
 * real move through the engine (which fires performCleanup automatically).
 */
export function recalculateStatics(engine: AuditEngine): void {
  const internal = asInternal(engine);
  const ctx: StaticAbilityContext = {
    cards: {
      getCardMeta: (cardId) =>
        internal.internalState.cardMetas[cardId as string] as
          | Partial<RiftboundCardMeta>
          | undefined,
      getCardOwner: (cardId) => internal.internalState.cards[cardId as string]?.owner,
      updateCardMeta: (cardId, meta) => {
        const current = internal.internalState.cardMetas[cardId as string];
        if (current) {
          internal.internalState.cardMetas[cardId as string] = {
            ...current,
            ...meta,
          };
        }
      },
    },
    draft: internal.currentState,
    zones: {
      getCardsInZone: (zoneId, playerId) => {
        const zone = internal.internalState.zones[zoneId as string];
        if (!zone) {
          return [];
        }
        if (!playerId) {
          return [...zone.cardIds];
        }
        return zone.cardIds.filter(
          (cardId) => internal.internalState.cards[cardId as string]?.owner === playerId,
        );
      },
    },
  };
  recalculateStaticEffects(ctx);
}

/**
 * Compute a unit's effective Might for the purposes of static ability
 * inspection tests (rule 637.3 — arithmetic layer).
 *
 * effective = baseMight + staticMightBonus + mightModifier + (buffed ? 1 : 0)
 *
 * NOTE: This does NOT include Assault/Shield, which are combat-specific
 * keywords applied by combat-resolver, not by the static layer itself.
 * Tests that validate combat might should use combat helpers directly.
 */
export function getEffectiveMight(engine: AuditEngine, cardId: CardId): number {
  const registry = getGlobalCardRegistry();
  const def = registry.get(cardId);
  const baseMight = def?.might ?? 0;
  const meta = getCardMeta(engine, cardId);
  const staticBonus = (meta?.staticMightBonus as number | undefined) ?? 0;
  const mightMod = (meta?.mightModifier as number | undefined) ?? 0;
  const buffBonus = meta?.buffed ? 1 : 0;
  return baseMight + staticBonus + mightMod + buffBonus;
}

/**
 * Check whether a card has a keyword granted to it by a static ability (or
 * any other source). Returns `true` if the keyword is present in the card's
 * `grantedKeywords` meta array OR in its base `keywords` list.
 */
export function hasKeyword(engine: AuditEngine, cardId: CardId, keyword: string): boolean {
  const registry = getGlobalCardRegistry();
  const def = registry.get(cardId);
  const baseKeywords = (def?.keywords ?? []) as string[];
  if (baseKeywords.includes(keyword)) {
    return true;
  }
  const meta = getCardMeta(engine, cardId);
  const granted = (meta?.grantedKeywords ?? []) as { keyword: string }[];
  return granted.some((gk) => gk.keyword === keyword);
}

/**
 * Remove a card from its current zone (mutates internal state directly).
 * Used by static-ability aura-removal tests to simulate the source leaving
 * the board, without going through a full recall/kill move.
 */
export function removeCardFromZone(engine: AuditEngine, cardId: CardId): void {
  const internal = asInternal(engine);
  const card = internal.internalState.cards[cardId as string];
  if (!card) {
    return;
  }
  const zone = internal.internalState.zones[card.zone];
  if (zone) {
    zone.cardIds = zone.cardIds.filter((id) => id !== (cardId as CoreCardId));
  }
  delete internal.internalState.cards[cardId as string];
  delete internal.internalState.cardMetas[cardId as string];
}

/**
 * Enumerate all currently-legal moves for a player via the engine's own
 * enumerator. Returns an array of `{ moveId, params }` shaped entries for
 * `validOnly: true`.
 *
 * Used by activated-ability tests to verify that the `activateAbility` move
 * is (or is not) offered as a legal move from a given zone.
 */
export function enumerateLegalMoves(
  engine: AuditEngine,
  player: PlayerId,
): { moveId: string; params?: Record<string, unknown> }[] {
  return (
    engine as unknown as {
      enumerateMoves: (
        pid: string,
        options?: { validOnly?: boolean },
      ) => { moveId: string; params?: Record<string, unknown> }[];
    }
  ).enumerateMoves(player, { validOnly: true });
}

/**
 * Seed a list of cards directly into a deck (or other shared) zone for
 * a specific player. Each card is registered in the card registry with
 * the given cardType and placed in the zone.
 *
 * This is the minimal deck-seeding helper needed by turn-structure tests
 * (channel phase pulls from `runeDeck`, draw phase pulls from `mainDeck`).
 *
 * Unlike `createCard`, this takes an array of card IDs and always places
 * them in the same zone with the same owner. The order they're passed in
 * is the order they end up in the zone's cardIds list (the "top" of the
 * deck is index 0 by convention — matches how the flow manager reads it).
 */
export function createDeck(
  engine: AuditEngine,
  player: PlayerId,
  zone: SimpleZone,
  cards: {
    id: CardId;
    cardType: RuleAuditCardType;
    domain?: string;
    name?: string;
  }[],
): void {
  for (const card of cards) {
    createCard(engine, card.id, {
      cardType: card.cardType,
      domain: card.domain,
      name: card.name ?? card.id,
      owner: player,
      zone,
    });
  }
}

/**
 * Read cards in a zone for a specific player.
 */
export function getZone(engine: AuditEngine, player: PlayerId, zone: ZoneName): CardId[] {
  const internal = asInternal(engine);
  const z = internal.internalState.zones[zone as string];
  if (!z) {
    return [];
  }
  return z.cardIds.filter(
    (cardId) => internal.internalState.cards[cardId as string]?.owner === player,
  ) as CardId[];
}

/**
 * General-purpose zone reader (optionally filtered by player).
 */
export function getCardsInZone(engine: AuditEngine, zone: ZoneName, player?: PlayerId): CardId[] {
  const internal = asInternal(engine);
  const z = internal.internalState.zones[zone as string];
  if (!z) {
    return [];
  }
  const ids = z.cardIds as CardId[];
  if (!player) {
    return [...ids];
  }
  return ids.filter((cardId) => internal.internalState.cards[cardId as string]?.owner === player);
}

/**
 * Get all physical rune cards on the board (in runePool zone) for a player.
 *
 * NOTE: Per rule 159 the "Rune Pool" is a conceptual resource, NOT the zone
 * where rune cards physically sit. However the engine models the zone named
 * `runePool` as where channeled rune CARDS live. This helper returns those
 * physical cards — use `state.runePools[player].energy` for the conceptual
 * resource reserve.
 */
export function getRunesOnBoard(engine: AuditEngine, player: PlayerId): CardId[] {
  const internal = asInternal(engine);
  const { base } = internal.internalState.zones;
  const { runePool } = internal.internalState.zones;
  const cards: CardId[] = [];
  const collect = (zone: { cardIds: CoreCardId[] } | undefined) => {
    if (!zone) {
      return;
    }
    for (const cardId of zone.cardIds) {
      const card = internal.internalState.cards[cardId as string];
      if (card?.owner !== player) {
        continue;
      }
      // Check registry for card type.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getGlobalCardRegistry } = require("../../operations/card-lookup") as {
        getGlobalCardRegistry: () => CardDefinitionRegistry;
      };
      const reg = getGlobalCardRegistry();
      if (reg.getCardType(cardId as string) === "rune") {
        cards.push(cardId as CardId);
      }
    }
  };
  collect(base);
  collect(runePool);
  return cards;
}

/**
 * Assert that a trigger matching the given source card and trigger type
 * is currently in the chain/pending. Returns true if such a trigger exists.
 *
 * NOTE: This helper is a placeholder. The real engine currently fires
 * triggers immediately via the trigger runner and does not queue them on
 * a per-test log. Tests that need trigger assertions should check the
 * resulting state mutations directly, or call `fireTrigger` and assert
 * side effects.
 */
export function assertTriggered(
  engine: AuditEngine,
  sourceCardId: CardId,
  triggerType: string,
): boolean {
  const { interaction } = engine.getState();
  if (!interaction) {
    return false;
  }
  // Look for any item on the chain whose source matches.
  const allItems = [...(interaction.chain?.items ?? [])];
  return allItems.some(
    (item) =>
      (item as { sourceCardId?: string }).sourceCardId === sourceCardId &&
      (item as { type?: string }).type === triggerType,
  );
}

/**
 * Returns pending-trigger items currently on the chain, if any.
 */
export function getPendingTriggers(
  engine: AuditEngine,
): readonly { sourceCardId?: string; type?: string }[] {
  const { interaction } = engine.getState();
  if (!interaction) {
    return [];
  }
  return (interaction.chain?.items ?? []) as readonly {
    sourceCardId?: string;
    type?: string;
  }[];
}

/**
 * Get the current chain/showdown interaction state.
 */
export function getInteractionState(engine: AuditEngine): TurnInteractionState | undefined {
  return engine.getState().interaction;
}

/**
 * Shortcut: get the current game state snapshot.
 */
export function getState(engine: AuditEngine): RiftboundGameState {
  return engine.getState();
}

/**
 * Return the items currently on the chain (top-of-stack is the last element).
 * Returns an empty array when no chain exists.
 */
export function getChainItems(engine: AuditEngine): readonly {
  id: string;
  type: string;
  cardId: string;
  controller: string;
  effect?: unknown;
  countered?: boolean;
  triggered?: boolean;
}[] {
  const { interaction } = engine.getState();
  if (!interaction?.chain) {
    return [];
  }
  return interaction.chain.items as readonly {
    id: string;
    type: string;
    cardId: string;
    controller: string;
    effect?: unknown;
    countered?: boolean;
    triggered?: boolean;
  }[];
}

/**
 * Whether a chain currently exists (rule 532.2 — Closed vs Open state).
 */
export function isChainActive(engine: AuditEngine): boolean {
  return engine.getState().interaction?.chain?.active === true;
}

/**
 * The player currently holding priority on the chain (or undefined if the
 * chain is empty or everyone has passed).
 */
export function getChainActivePlayer(engine: AuditEngine): string | undefined {
  const { interaction } = engine.getState();
  return interaction?.chain?.activePlayer || undefined;
}

/**
 * Pass chain priority for the given player by calling `passChainPriority`.
 * Returns whether the move succeeded.
 */
export function passChainPriority(
  engine: AuditEngine,
  player: PlayerId,
): { success: boolean; error?: string } {
  return applyMove(engine, "passChainPriority", { playerId: player });
}

/**
 * Directly place a card into a zone, bypassing createCard's registry
 * registration. Used to construct "card in hand" setups for playSpell tests.
 *
 * NOTE: For spell tests you should always use `createCard` first (which
 * also registers the card in the global registry with its abilities), then
 * — if you need it in hand — set `zone: "hand"` in the createCard call.
 */

/**
 * Read a card's runtime meta from the engine (damage, buffed, exhausted, etc).
 * Returns undefined if the card does not exist.
 */
export function getCardMeta(
  engine: AuditEngine,
  cardId: CardId,
): Partial<RiftboundCardMeta> | undefined {
  const internal = asInternal(engine);
  return internal.internalState.cardMetas[cardId as string];
}

/**
 * Read a card's current zone name from the engine.
 * Returns undefined if the card does not exist.
 */
export function getCardZone(engine: AuditEngine, cardId: CardId): string | undefined {
  const internal = asInternal(engine);
  return internal.internalState.cards[cardId as string]?.zone as string | undefined;
}

/**
 * Read a card's owner (not controller) from the engine.
 */
export function getCardOwner(engine: AuditEngine, cardId: CardId): string | undefined {
  const internal = asInternal(engine);
  return internal.internalState.cards[cardId as string]?.owner as string | undefined;
}

// ---------------------------------------------------------------------------
// Scoring / Win-condition helpers (Wave 2D)
// ---------------------------------------------------------------------------

/**
 * Directly set a player's victory points. Used to set up "1 point from
 * victory" scenarios (rule 632.1.b) without running a full game.
 *
 * NOTE: This mutates the (Immer-frozen) currentState via a fresh clone and
 * swaps it back in through the internal view. Safe for rule-audit tests.
 */
export function setVictoryPoints(engine: AuditEngine, playerId: PlayerId, points: number): void {
  const internal = asInternal(engine);
  const newState = structuredClone(internal.currentState) as RiftboundGameState;
  const player = newState.players[playerId];
  if (player) {
    player.victoryPoints = points;
  }
  (internal as { currentState: RiftboundGameState }).currentState = newState;
  engine.getFlowManager()?.syncState(newState);
}

/**
 * Set a battlefield's controller (used for Hold tests during the Beginning
 * Phase). The battlefield must already exist (via `createBattlefield`).
 */
export function setBattlefieldController(
  engine: AuditEngine,
  battlefieldId: string,
  controller: PlayerId | null,
): void {
  const internal = asInternal(engine);
  const newState = structuredClone(internal.currentState) as RiftboundGameState & {
    battlefields: Record<string, { controller: PlayerId | null; [key: string]: unknown }>;
  };
  const bf = newState.battlefields[battlefieldId];
  if (bf) {
    bf.controller = controller;
  }
  (internal as { currentState: RiftboundGameState }).currentState = newState as RiftboundGameState;
  engine.getFlowManager()?.syncState(newState);
}

/**
 * Get the winner ID from the game state, or `undefined` if game is not
 * finished or has no winner.
 */
export function getWinner(engine: AuditEngine): PlayerId | undefined {
  return engine.getState().winner as PlayerId | undefined;
}

/**
 * Get the current game status string ("playing" | "finished" | etc).
 */
export function getStatus(engine: AuditEngine): string {
  return engine.getState().status;
}

/**
 * Place a main-deck card directly into the mainDeck zone. Used by burn-out
 * tests that need a non-empty deck / controlled trash state.
 */
export function placeInMainDeck(
  engine: AuditEngine,
  cardId: CardId,
  owner: PlayerId,
  cardType: RuleAuditCardType = "spell",
): void {
  createCard(engine, cardId, {
    cardType,
    owner,
    zone: "mainDeck",
  });
}

// ---------------------------------------------------------------------------
// Replacement-effects helpers (Wave 3F)
// ---------------------------------------------------------------------------

/**
 * Build a `ReplacementContext` backed by the audit engine's internal state.
 *
 * Mirrors the context produced in production code at the call sites of
 * `checkReplacement` (state-based checks + effect executor) but is driven
 * entirely from `internalState` so rule tests can construct boards without
 * going through moves.
 *
 * The returned context shares state with the engine: mutations to
 * `ctx.draft` (e.g. via `markReplacementConsumed`) are visible to subsequent
 * `engine.getState()` reads because we write back through the internal view.
 */
export function buildReplacementContext(engine: AuditEngine): {
  draft: RiftboundGameState;
  zones: {
    getCardsInZone: (zoneId: string, playerId?: string) => string[];
  };
  cards: {
    getCardOwner: (cardId: string) => string | undefined;
    getCardMeta: (cardId: string) => Partial<RiftboundCardMeta> | undefined;
  };
} {
  const internal = asInternal(engine);
  return {
    cards: {
      getCardMeta: (cardId: string) => internal.internalState.cardMetas[cardId],
      getCardOwner: (cardId: string) => internal.internalState.cards[cardId]?.owner,
    },
    draft: internal.currentState,
    zones: {
      getCardsInZone: (zoneId: string, playerId?: string) => {
        const zone = internal.internalState.zones[zoneId];
        if (!zone) {
          return [];
        }
        if (!playerId) {
          return [...zone.cardIds] as string[];
        }
        return zone.cardIds.filter(
          (cardId) => internal.internalState.cards[cardId as string]?.owner === playerId,
        ) as string[];
      },
    },
  };
}

/**
 * Read `consumedNextReplacements` from the engine, returning an empty object
 * if unset. Helper for assertions in replacement-effect tests.
 */
export function getConsumedNextReplacements(engine: AuditEngine): Record<string, true> {
  return (engine.getState().consumedNextReplacements ?? {}) as Record<string, true>;
}

// ---------------------------------------------------------------------------
// Cleanup helpers (Wave 2E: state-based-check observation)
// ---------------------------------------------------------------------------

/**
 * Run the engine's cleanup / state-based-check pipeline once over the current
 * state. Mirrors what `executeMove` calls after every move, but tests can
 * call it directly to observe rule-specific cleanup behavior (rule 520 kills
 * damaged units, rule 521 clears combat roles, rule 619.1 recalls gear).
 *
 * Reaches into `internalState` the same way `fireTrigger` does.
 */
export function runCleanup(engine: AuditEngine): {
  killed: string[];
  hiddenRemoved: string[];
  combatPending: string[];
  stateChanged: boolean;
} {
  // Avoid top-level import to dodge any circular dependency with cleanup.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { performCleanup } = require("../../cleanup") as {
    performCleanup: (ctx: unknown) => {
      killed: string[];
      hiddenRemoved: string[];
      combatPending: string[];
      stateChanged: boolean;
    };
  };
  const internal = asInternal(engine);
  const ctx = {
    cards: {
      getCardMeta: (cardId: string) => internal.internalState.cardMetas[cardId],
      getCardOwner: (cardId: string) => internal.internalState.cards[cardId]?.owner,
      updateCardMeta: (cardId: string, meta: Partial<RiftboundCardMeta>) => {
        const cur = internal.internalState.cardMetas[cardId];
        if (cur) {
          internal.internalState.cardMetas[cardId] = { ...cur, ...meta };
        }
      },
    },
    counters: {
      clearCounter: (_cardId: string, _counter: string) => {
        // No-op: tests rely on `updateCardMeta` for damage clears.
      },
      getCounter: (cardId: string, counter: string) => {
        const meta = internal.internalState.cardMetas[cardId];
        if (!meta) {
          return 0;
        }
        return ((meta as unknown as Record<string, number>)[counter] ?? 0) as number;
      },
      setFlag: (cardId: string, flag: string, value: boolean) => {
        const meta = internal.internalState.cardMetas[cardId];
        if (meta) {
          (meta as unknown as Record<string, boolean>)[flag] = value;
        }
      },
    },
    draft: internal.currentState,
    zones: {
      getCardsInZone: (zoneId: string, playerId?: string) => {
        const zone = internal.internalState.zones[zoneId];
        if (!zone) {
          return [];
        }
        if (!playerId) {
          return [...zone.cardIds];
        }
        return zone.cardIds.filter(
          (cardId) => internal.internalState.cards[cardId as string]?.owner === playerId,
        );
      },
      moveCard: ({ cardId, targetZoneId }: { cardId: string; targetZoneId: string }) => {
        const card = internal.internalState.cards[cardId];
        if (card) {
          const oldZone = internal.internalState.zones[card.zone as string];
          if (oldZone) {
            oldZone.cardIds = oldZone.cardIds.filter((id) => id !== cardId);
          }
          card.zone = targetZoneId as ZoneId;
          const newZone = internal.internalState.zones[targetZoneId];
          if (newZone) {
            newZone.cardIds.push(cardId as CoreCardId);
          }
        }
      },
    },
  };
  return performCleanup(ctx);
}
