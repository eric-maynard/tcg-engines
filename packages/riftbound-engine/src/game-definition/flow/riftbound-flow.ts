/**
 * Riftbound Flow Definition
 *
 * Implements the official Riftbound turn structure using @tcg/core FlowDefinition.
 *
 * Turn phases (rules 514-517):
 *   1. Awaken     - Ready all game objects (515.1)
 *   2. Beginning  - Start of turn triggers, scoring/holding (515.2)
 *   3. Channel    - Channel 2 runes from rune deck (515.3)
 *   4. Draw       - Draw 1 card, rune pool empties (515.4)
 *   5. Main       - Main phase: play cards, move units, combat (516)
 *   6. Ending     - End of turn triggers, clear damage, cleanup (517)
 *   7. Cleanup    - State-based checks (518-526)
 *
 * Game segments:
 *   - setup: Place legends, champions, battlefields. Draw initial hand, mulligan.
 *   - mainGame: Normal turn cycle.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  FlowDefinition,
} from "@tcg/core";
import type { TriggerRunnerContext } from "../../abilities/trigger-runner";
import type { GameEvent } from "../../abilities/game-events";
import { getActiveShowdown } from "../../chain";
import { cleanupAndFireDeaths } from "../../cleanup";
import { dispatchEvent, dispatchUnitDied } from "../../events/dispatcher";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { getHuntValue } from "../../operations/hunt-keyword";
import { dequeueExtraTurn, seatOrderSuccessor } from "../../operations/turn-queue";
import type { RiftboundCardMeta, RiftboundGameState } from "../../types";
import { hasPlayerWonStrict } from "../win-conditions/victory";
import { canPlayerScoreAtBattlefield } from "../../operations/scoring-rules";

/**
 * `hold` events emitted by the flow phase hooks flow through the unified
 * event-bus chokepoint (`events/dispatcher.ts#dispatchEvent`). The old
 * `fireTriggers` call site took `(event, ctx)`; `dispatchEvent` is
 * `(ctx, event)` — this thin adapter preserves the call-site shape while
 * routing the emission through the bus.
 */
function fireTriggers(event: GameEvent, ctx: TriggerRunnerContext): number {
  return dispatchEvent(ctx, event);
}

/**
 * Build a `counters` operation bag for use inside a flow phase hook.
 *
 * Flow hook contexts carry `state`/`zones`/`cards` but **not** a `counters`
 * bag. The core counter system stores per-card counters in the reserved
 * `__counters` field on each card's meta — so we synthesise a counters bag
 * that reads/writes that field via `getCardMeta`/`updateCardMeta`. This is
 * the same field `performCleanup` reads for damage counters, so a flow-fired
 * `die`/Deathknell effect ("deal N damage") that writes through this bag is
 * picked up by the cleanup pass exactly as a move-fired one would be.
 */
function buildFlowCounters(context: {
  cards: {
    getCardMeta: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined;
    updateCardMeta?: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void;
  };
}) {
  interface CountersBag { __counters?: Record<string, number> }
  const update =
    context.cards.updateCardMeta ?? (() => {});
  const readCounters = (cardId: CoreCardId): Record<string, number> => {
    const meta = context.cards.getCardMeta(cardId) as CountersBag | undefined;
    return { ...meta?.__counters };
  };
  const writeCounters = (cardId: CoreCardId, bag: Record<string, number>): void => {
    update(cardId, { __counters: bag } as unknown as Partial<RiftboundCardMeta>);
  };
  return {
    addCounter: (cardId: CoreCardId, counter: string, amount: number): void => {
      const bag = readCounters(cardId);
      bag[counter] = (bag[counter] ?? 0) + amount;
      writeCounters(cardId, bag);
    },
    clearCounter: (cardId: CoreCardId, counter: string): void => {
      const bag = readCounters(cardId);
      if (bag[counter] !== undefined) {
        delete bag[counter];
        writeCounters(cardId, bag);
      }
    },
    getCounter: (cardId: CoreCardId, counter: string): number => {
      const meta = context.cards.getCardMeta(cardId) as CountersBag | undefined;
      return meta?.__counters?.[counter] ?? 0;
    },
    removeCounter: (cardId: CoreCardId, counter: string, amount: number): void => {
      const bag = readCounters(cardId);
      const next = (bag[counter] ?? 0) - amount;
      if (next <= 0) {
        delete bag[counter];
      } else {
        bag[counter] = next;
      }
      writeCounters(cardId, bag);
    },
    setFlag: (cardId: CoreCardId, flag: string, value: boolean): void => {
      // Write to `meta.__flags[flag]` to match the core counters bag
      // (`operations-impl.ts#setFlag` → `__flags[flag] = value`). Before
      // This fix `buildFlowCounters.setFlag` was writing to `meta[flag]`
      // Directly — a different storage from `counters.getFlag` reads — so
      // A flow-driven `setFlag("exhausted", false)` would NOT clear an
      // Exhausted flag set by `playUnit` / `standardMove` (both go through
      // The core counters bag's `__flags`). Surfaced by the random monkey:
      // 30 seeds × 41 turns produced 0 standardMoves / 0 conquers because
      // No unit ever became ready again after entry-exhaust.
      interface FlagsBag { __flags?: Record<string, boolean> }
      const meta = context.cards.getCardMeta(cardId) as
        | (Partial<RiftboundCardMeta> & FlagsBag)
        | undefined;
      const flags = { ...meta?.__flags };
      flags[flag] = value;
      update(cardId, { __flags: flags } as unknown as Partial<RiftboundCardMeta>);
    },
  };
}

/**
 * Build a TriggerRunnerContext from a flow phase context.
 *
 * Flow hooks receive FlowContext (state, zones, cards) but NOT a counters
 * bag; we synthesise one via `buildFlowCounters` so triggers' counter-writing
 * effects (e.g. a Deathknell's "deal N damage") actually land — and are then
 * picked up by `runFlowCleanup`'s state-based checks.
 */
function buildFlowTriggerContext(context: {
  state: RiftboundGameState;
  zones: {
    moveCard: (params: { cardId: CoreCardId; targetZoneId: CoreZoneId }) => void;
    drawCards: (params: {
      count: number;
      from: CoreZoneId;
      to: CoreZoneId;
      playerId: CorePlayerId;
    }) => CoreCardId[];
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
    getCardZone?: (cardId: CoreCardId) => CoreZoneId | undefined;
  };
  cards: {
    getCardMeta: (cardId: CoreCardId) => Partial<RiftboundCardMeta>;
    getCardOwner?: (cardId: CoreCardId) => string | undefined;
    updateCardMeta?: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void;
  };
}): TriggerRunnerContext {
  return {
    cards: {
      getCardMeta: context.cards.getCardMeta as TriggerRunnerContext["cards"]["getCardMeta"],
      getCardOwner: (context.cards.getCardOwner ??
        (() => undefined)) as TriggerRunnerContext["cards"]["getCardOwner"],
      updateCardMeta: context.cards
        .updateCardMeta as TriggerRunnerContext["cards"]["updateCardMeta"],
    },
    counters: buildFlowCounters(context) as unknown as TriggerRunnerContext["counters"],
    draft: context.state,
    zones: {
      drawCards: context.zones.drawCards as TriggerRunnerContext["zones"]["drawCards"],
      getCardZone: context.zones.getCardZone as TriggerRunnerContext["zones"]["getCardZone"],
      getCardsInZone: context.zones.getCardsInZone,
      moveCard: context.zones.moveCard,
    },
  };
}

/**
 * Emit a `phaseBegan` engine-bus event through the dispatcher when a flow
 * phase starts. No card text subscribes to this today, but the event log /
 * future listeners see every phase transition — and it keeps the flow hooks
 * funnelling through the one chokepoint like the rest of the engine.
 *
 * Defensive: some unit tests drive flow hooks with stripped `context` mocks
 * that lack a full `zones`/`cards` bag — guarded so it's a silent no-op then.
 */
function emitPhaseBegan(
  // Biome-ignore lint/suspicious/noExplicitAny: structural flow-context pass-through
  context: any,
  phase: string,
): void {
  if (!context?.state || !context?.zones || !context?.cards) {
    return;
  }
  try {
    const playerId =
      typeof context.getCurrentPlayer === "function" ? context.getCurrentPlayer() : undefined;
    dispatchEvent(buildFlowTriggerContext(context), {
      ...(playerId ? { playerId } : {}),
      phase,
      type: "phaseBegan",
    });
  } catch {
    // Stripped mock contexts may make `buildFlowTriggerContext` throw; ignore.
  }
}

/**
 * Emit a `phaseEnded` engine-bus event through the dispatcher when a flow
 * phase finishes (its `onEnd` hook). Symmetric to {@link emitPhaseBegan};
 * same defensive guarding for stripped test contexts.
 */
function emitPhaseEnded(
  // Biome-ignore lint/suspicious/noExplicitAny: structural flow-context pass-through
  context: any,
  phase: string,
): void {
  if (!context?.state || !context?.zones || !context?.cards) {
    return;
  }
  try {
    const playerId =
      typeof context.getCurrentPlayer === "function" ? context.getCurrentPlayer() : undefined;
    dispatchEvent(buildFlowTriggerContext(context), {
      ...(playerId ? { playerId } : {}),
      phase,
      type: "phaseEnded",
    });
  } catch {
    // Stripped mock contexts may make `buildFlowTriggerContext` throw; ignore.
  }
}

/**
 * Run state-based checks (rules 518-526) + fire `die`/Deathknell triggers
 * (rule 540.x / 813) from inside a flow phase hook.
 *
 * The engine-wide post-move cleanup hook (`withPostMoveCleanup`) only fires
 * after *moves* — it does not see deaths caused by a phase-transition hook
 * (e.g. a "hold" triggered ability dealing lethal damage during scoring, or
 * the Cleanup phase running end-of-turn state-based checks). This helper
 * closes that gap; the synthesised `counters` bag is backed by each card's
 * reserved `__counters` meta field (see `buildFlowCounters`).
 */
function runFlowCleanup(context: {
  state: RiftboundGameState;
  zones: {
    moveCard: (params: { cardId: CoreCardId; targetZoneId: CoreZoneId }) => void;
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
  };
  cards: {
    getCardMeta: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined;
    getCardOwner?: (cardId: CoreCardId) => string | undefined;
    updateCardMeta: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void;
  };
}): void {
  cleanupAndFireDeaths(context.state, {
    cards: {
      getCardMeta: context.cards.getCardMeta,
      getCardOwner: context.cards.getCardOwner ?? (() => undefined),
      updateCardMeta: context.cards.updateCardMeta,
    },
    counters: buildFlowCounters(context),
    zones: {
      getCardsInZone: context.zones.getCardsInZone,
      moveCard: context.zones.moveCard,
    },
  });
}

/**
 * Riftbound flow definition
 *
 * Two game segments:
 * 1. setup - Initial game preparation (legends, champions, decks, mulligan)
 * 2. mainGame - Normal turn cycle with all phases
 */
export const riftboundFlow: FlowDefinition<RiftboundGameState, RiftboundCardMeta> = {
  gameSegments: {
    /**
     * Setup segment
     *
     * Players place legends, champions, battlefields, initialize decks,
     * draw initial hands, and perform mulligans.
     *
     * Setup is driven by moves (placeLegend, placeChampion, etc.)
     * and transitions to mainGame when a player executes transitionToPlay.
     */
    setup: {
      next: "mainGame",
      onBegin: (context) => {
        context.state.status = "setup";
        context.state.turn = {
          activePlayer: context.getCurrentPlayer(),
          number: 0,
          phase: "setup",
        };
      },

      order: 1,

      turn: {
        initialPhase: "setupPhase",
        phases: {
          setupPhase: {
            order: 1,
            // Setup phase doesn't auto-end - players drive it with moves
            endIf: () => false,
          },
        },
      },
    },

    /**
     * Main game segment
     *
     * Normal turn cycle: Awaken -> Beginning -> Channel -> Draw -> Main -> Ending -> Cleanup
     * Players take turns in order until someone wins.
     */
    mainGame: {
      onBegin: (context) => {
        context.state.status = "playing";
        context.state.turn = {
          activePlayer: context.getCurrentPlayer(),
          number: 1,
          phase: "awaken",
        };
      },

      order: 2,

      turn: {
        initialPhase: "awaken",

        // Rule 510 / 734: the turn player rotates in seat order at the end of
        // Each turn. The core flow manager bumps the turn *number* but does
        // Not rotate `currentPlayer`, so we do it here in `turn.onEnd` (which
        // Runs before the next turn's `onBegin`). If an additional turn is
        // Queued, `turn.onBegin` below overrides this with the extra-turn
        // Owner (rule 734: additional turns are inserted, they do not change
        // The underlying seat-order rotation).
        onEnd: (context) => {
          const endingPlayer = context.getCurrentPlayer();
          const successor = seatOrderSuccessor(context.state, endingPlayer);
          if (successor !== endingPlayer) {
            context.setCurrentPlayer?.(successor);
          }
        },

        onBegin: (context) => {
          // Rule 734 (Additional Turns): if a player was told to take an
          // Additional turn, it is inserted directly after the current turn.
          // Dequeue it here and make that player the turn player for this
          // Turn instead of the normal seat-order successor (which `turn.onEnd`
          // Already set via `setCurrentPlayer`).
          const extraTurnPlayer = dequeueExtraTurn(context.state);
          let currentPlayer = context.getCurrentPlayer();
          if (extraTurnPlayer) {
            currentPlayer = extraTurnPlayer as typeof currentPlayer;
            context.setCurrentPlayer?.(extraTurnPlayer);
          }

          // Update turn tracking in game state
          const turnNumber = context.getTurnNumber();
          context.state.turn = {
            activePlayer: currentPlayer,
            number: turnNumber,
            phase: "awaken",
          };

          // Clear per-turn tracking
          context.state.conqueredThisTurn[currentPlayer] = [];
          context.state.scoredThisTurn[currentPlayer] = [];
          if (context.state.unitsMovedThisTurn) {
            context.state.unitsMovedThisTurn[currentPlayer] = 0;
          }
          if (context.state.cardsPlayedThisTurn) {
            // Rule 724 (Legion): reset main-deck cards-played counter at
            // The start of the turn player's turn so Legion conditions
            // Fire only on plays made during the current turn.
            context.state.cardsPlayedThisTurn[currentPlayer] = 0;
          }

          // Increment per-player turn count (used by Forgotten Monument etc.)
          const turnPlayer = context.state.players[currentPlayer];
          if (turnPlayer) {
            turnPlayer.turnsTaken = (turnPlayer.turnsTaken ?? 0) + 1;
          }
        },

        phases: {
          /**
           * Awaken Phase (rule 515.1)
           *
           * Ready all game objects controlled by the turn player.
           * Auto-advances to beginning phase.
           */
          awaken: {
            endIf: () => true,
            next: "beginning",
            onBegin: (context) => {
              context.state.turn = {
                ...context.state.turn,
                phase: "awaken",
              };
              emitPhaseBegan(context, "awaken");

              // Rule 415.3.a / 515.1 — "A player Readies all non-spell Game
              // Objects they CONTROL during the Ready Step of the Beginning
              // Phase on their turn." Sweep every board zone unfiltered and
              // Pick CONTROLLER-matching cards (post-take-control an enemy
              // Unit Readies on the new controller's turn, not the original
              // Owner's — rule 187 / 323.6 / 415.3.a). Falls back to owner
              // When the controller getter isn't wired (test stubs).
              const playerId = context.getCurrentPlayer();
              const ctrlCards = context.cards as {
                getCardController?: (id: CoreCardId) => string | undefined;
                getCardOwner?: (id: CoreCardId) => string | undefined;
              };
              const readyCandidates: CoreCardId[] = [];
              readyCandidates.push(...context.zones.getCardsInZone("base" as CoreZoneId));
              for (const bfId of Object.keys(context.state.battlefields)) {
                readyCandidates.push(
                  ...context.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId),
                );
              }
              // Both `meta.exhausted` (used by some legacy paths /
              // Setup default-state writes) AND `meta.__flags.exhausted`
              // (the canonical core-counters flag — written by
              // `counters.setFlag("exhausted", true)` in `playUnit`,
              // `standardMove`, `exhaust` effect, etc.) need to be
              // Cleared. Until this fix the awaken phase only cleared the
              // Former, so units played by `playUnit` (which sets the flag
              // Via the counter API) stayed exhausted forever and
              // `standardMove`'s legality check (which reads
              // `counters.getFlag("exhausted")`) never offered them as
              // Legal-move candidates. Surfaced by the random-monkey: 30
              // Seeds × 41 turns produced 0 standardMoves / 0 conquers /
              // 0 contestBattlefields.
              const flowCounters = buildFlowCounters(context);
              for (const cardId of readyCandidates) {
                const controller =
                  ctrlCards.getCardController?.(cardId) ?? ctrlCards.getCardOwner?.(cardId);
                if (controller !== playerId) {
                  continue;
                }
                const meta = context.cards.getCardMeta(cardId) as
                  | (Partial<RiftboundCardMeta> & { __flags?: { exhausted?: boolean } })
                  | undefined;
                if (meta?.exhausted) {
                  context.cards.updateCardMeta(cardId, { exhausted: false });
                }
                if (meta?.__flags?.exhausted) {
                  flowCounters.setFlag(cardId, "exhausted", false);
                }
              }

              // Reset per-unit "moved this turn" counters for ALL board cards
              // (every player's). A new turn means no unit has moved yet this
              // Turn (rule 616-619); abilities like Kayn, Unleashed read this.
              const allBoardCards: CoreCardId[] = [];
              for (const pid of Object.keys(context.state.players)) {
                for (const cardId of context.zones.getCardsInZone(
                  "base" as CoreZoneId,
                  pid as CorePlayerId,
                )) {
                  allBoardCards.push(cardId);
                }
              }
              for (const bfId of Object.keys(context.state.battlefields)) {
                for (const cardId of context.zones.getCardsInZone(
                  `battlefield-${bfId}` as CoreZoneId,
                )) {
                  allBoardCards.push(cardId);
                }
              }
              for (const cardId of allBoardCards) {
                const meta = context.cards.getCardMeta(cardId);
                if (meta?.movedThisTurnCount) {
                  context.cards.updateCardMeta(cardId, { movedThisTurnCount: 0 });
                }
              }
            },

            onEnd: (context) => {
              emitPhaseEnded(context, "awaken");
            },

            order: 1,
          },

          /**
           * Beginning Phase (rule 515.2)
           *
           * Scoring step: "Holding" occurs - score at controlled battlefields.
           * Temporary permanents are killed.
           * Start-of-turn triggers fire.
           * Auto-advances to channel phase.
           */
          beginning: {
            endIf: () => true,
            next: "channel",
            onBegin: (context) => {
              context.state.turn = {
                ...context.state.turn,
                phase: "beginning",
              };
              emitPhaseBegan(context, "beginning");

              // Kill Temporary permanents before scoring (rule 728.1.b)
              const turnPlayerId = context.getCurrentPlayer();
              const tempKillCards: CoreCardId[] = [];

              for (const pid of Object.keys(context.state.players)) {
                const baseCards = context.zones.getCardsInZone(
                  "base" as CoreZoneId,
                  pid as CorePlayerId,
                );
                for (const cardId of baseCards) {
                  tempKillCards.push(cardId);
                }
              }
              for (const bfId of Object.keys(context.state.battlefields)) {
                const bfCards = context.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId);
                for (const cardId of bfCards) {
                  tempKillCards.push(cardId);
                }
              }

              const tempRegistry = getGlobalCardRegistry();
              // Capture (cardId, owner) of each Temporary permanent trashed
              // Here so its `die`/Deathknell triggers (rule 813) fire — a
              // Temporary permanent leaving the Board is "dying".
              const trashedTemps: { cardId: string; owner: string }[] = [];
              for (const cardId of tempKillCards) {
                const owner = context.cards.getCardOwner?.(cardId);
                if (owner !== turnPlayerId) {
                  continue;
                }

                const hasTemp = tempRegistry.hasKeyword(cardId as string, "Temporary");
                const meta = context.cards.getCardMeta(cardId);
                const grantedTemp = (meta?.grantedKeywords ?? []).some(
                  (gk: { keyword: string }) => gk.keyword === "Temporary",
                );
                if (hasTemp || grantedTemp) {
                  context.zones.moveCard({
                    cardId,
                    targetZoneId: "trash" as CoreZoneId,
                  });
                  trashedTemps.push({ cardId: cardId as string, owner: owner ?? turnPlayerId });
                }
              }
              if (trashedTemps.length > 0) {
                // A Temporary permanent leaving the Board "dies" (rule
                // 728.1.b → 813) — emit through the single `unitDied`
                // Event-bus point so its Deathknell fires.
                dispatchUnitDied(buildFlowTriggerContext(context), trashedTemps);
              }

              // Scoring step (rule 515.2.b): Holding
              // Score 1 point for each battlefield the turn player controls
              const playerId = context.getCurrentPlayer();
              const triggerCtx = buildFlowTriggerContext(context);
              for (const [bfId, bf] of Object.entries(context.state.battlefields)) {
                if (bf.controller === playerId) {
                  const scored = context.state.scoredThisTurn[playerId] ?? [];
                  if (!scored.includes(bfId)) {
                    // Blocked if a battlefield ability (e.g. Forgotten Monument)
                    // Prevents this player from scoring here right now.
                    const scoringAllowed = canPlayerScoreAtBattlefield(
                      context.state,
                      playerId,
                      bfId,
                    );
                    const player = context.state.players[playerId];
                    if (player && scoringAllowed) {
                      player.victoryPoints += 1;
                    }

                    if (!context.state.scoredThisTurn[playerId]) {
                      context.state.scoredThisTurn[playerId] = [];
                    }
                    context.state.scoredThisTurn[playerId].push(bfId);

                    // Hunt keyword (rule 823): [Hunt N] units the player
                    // Controls here grant N XP "when I conquer or hold".
                    if (scoringAllowed) {
                      const heldUnitIds = context.zones.getCardsInZone(
                        `battlefield-${bfId}` as CoreZoneId,
                      );
                      let huntXp = 0;
                      // Rule 823 + 187 / 323.6 — Hunt XP accrues for units
                      // The SCORING PLAYER controls at this battlefield (a
                      // Post-`take-control` unit at my held bf grants its
                      // [Hunt] XP to me, not to its owner). Was reading
                      // Owner; fixed to controller.
                      const huntCards = context.cards as {
                        getCardController?: (id: CoreCardId) => string | undefined;
                        getCardOwner?: (id: CoreCardId) => string | undefined;
                      };
                      for (const cardId of heldUnitIds) {
                        const controller =
                          huntCards.getCardController?.(cardId) ??
                          huntCards.getCardOwner?.(cardId);
                        if (controller !== undefined && controller !== playerId) {
                          continue;
                        }
                        huntXp += getHuntValue(
                          cardId as string,
                          context.cards.getCardMeta(cardId) as {
                            grantedKeywords?: { keyword: string; value?: number }[];
                          },
                        );
                      }
                      if (huntXp > 0) {
                        const holdingPlayer = context.state.players[playerId];
                        if (holdingPlayer) {
                          holdingPlayer.xp += huntXp;
                        }
                        if (context.state.xpGainedThisTurn[playerId] !== undefined) {
                          context.state.xpGainedThisTurn[playerId] =
                            (context.state.xpGainedThisTurn[playerId] ?? 0) + huntXp;
                        } else {
                          context.state.xpGainedThisTurn[playerId] = huntXp;
                        }
                      }
                    }

                    // Emit "hold" event so triggered abilities fire (e.g. Altar to Unity)
                    if (scoringAllowed) {
                      fireTriggers({ battlefieldId: bfId, playerId, type: "hold" }, triggerCtx);
                    }
                  }
                }
              }

              // State-based checks for deaths caused inside this hook —
              // Temporary permanents trashed above (rule 728.1.b), or units
              // Killed by a "hold" triggered ability during scoring — plus
              // Their `die`/Deathknell triggers (rule 540.x / 813).
              runFlowCleanup(context);

              // Phase B batch 14 finding X-2 (monkey-rescan): the Hold
              // Scoring step above increments `victoryPoints` directly
              // Without checking the win condition, so games where a
              // Player accumulates VP via Hold (not Conquer) never end.
              // Burn-Out scoring (line 748) checks `hasPlayerWonStrict`;
              // Conquer paths in combat.ts do too. The Hold path was the
              // Only VP-grant site missing the check. Mirror the same gate
              // Here so Hold-only wins finish the game.
              for (const pid of Object.keys(context.state.players)) {
                if (
                  context.state.status !== "finished" &&
                  hasPlayerWonStrict(context.state, pid)
                ) {
                  context.state.status = "finished";
                  context.state.winner = pid;
                  break;
                }
              }
            },

            onEnd: (context) => {
              emitPhaseEnded(context, "beginning");
            },

            order: 2,
          },

          /**
           * Channel Phase (rule 515.3)
           *
           * Channel 2 runes from rune deck.
           * Rule 644.7: second player channels extra rune on first turn.
           * Auto-advances to draw phase.
           */
          channel: {
            endIf: () => true,
            next: "draw",
            onBegin: (context) => {
              context.state.turn = {
                ...context.state.turn,
                phase: "channel",
              };
              emitPhaseBegan(context, "channel");

              // Channel 2 runes (rule 515.3.b)
              // Rule 644.7: second player channels extra rune on first turn
              const playerId = context.getCurrentPlayer();
              let baseChannelCount = 2;

              const isFirstTurn =
                context.state.firstTurnNumber?.[playerId] === context.getTurnNumber();
              if (isFirstTurn && context.state.secondPlayerExtraRune) {
                baseChannelCount = 3;
              }

              const runesInDeck = context.zones.getCardsInZone(
                "runeDeck" as CoreZoneId,
                playerId as CorePlayerId,
              );

              const runesToChannel = Math.min(baseChannelCount, runesInDeck.length);
              for (let i = 0; i < runesToChannel; i++) {
                const topRune = context.zones.getCardsInZone(
                  "runeDeck" as CoreZoneId,
                  playerId as CorePlayerId,
                )[0];

                if (topRune) {
                  // Channeled runes go to the runePool zone (not base, which
                  // Is for units/gear). They enter ready and the player must
                  // Exhaust them via the exhaustRune move to get energy.
                  context.zones.moveCard({
                    cardId: topRune,
                    targetZoneId: "runePool" as CoreZoneId,
                  });
                }
              }
            },

            onEnd: (context) => {
              emitPhaseEnded(context, "channel");
            },

            order: 3,
          },

          /**
           * Draw Phase (rule 515.4)
           *
           * Draw 1 card from main deck.
           * Handles Burn Out (rule 518) when deck is empty.
           * Rune pool empties at end of draw phase (rule 515.4.d).
           * Auto-advances to action phase.
           */
          draw: {
            endIf: () => true,
            next: "main",
            onBegin: (context) => {
              context.state.turn = {
                ...context.state.turn,
                phase: "draw",
              };
              emitPhaseBegan(context, "draw");

              const playerId = context.getCurrentPlayer();

              // Check for empty deck -> Burn Out (rule 518)
              const deckCards = context.zones.getCardsInZone(
                "mainDeck" as CoreZoneId,
                playerId as CorePlayerId,
              );
              if (deckCards.length === 0) {
                // Burn Out: shuffle trash into deck, opponent scores 1 point
                const trashCards = context.zones.getCardsInZone(
                  "trash" as CoreZoneId,
                  playerId as CorePlayerId,
                );
                for (const cardId of trashCards) {
                  context.zones.moveCard({
                    cardId,
                    targetZoneId: "mainDeck" as CoreZoneId,
                  });
                }
                context.zones.shuffleZone("mainDeck" as CoreZoneId, playerId as CorePlayerId);

                // Opponent scores 1 point
                for (const opponentId of Object.keys(context.state.players)) {
                  if (opponentId !== playerId) {
                    const opponent = context.state.players[opponentId];
                    if (opponent) {
                      opponent.victoryPoints += 1;
                      if (hasPlayerWonStrict(context.state, opponentId)) {
                        context.state.status = "finished";
                        context.state.winner = opponentId;
                      }
                    }
                  }
                }
              }

              // Draw 1 card (rule 515.4.b)
              context.zones.drawCards({
                count: 1,
                from: "mainDeck" as CoreZoneId,
                playerId: playerId as CorePlayerId,
                to: "hand" as CoreZoneId,
              });
            },

            onEnd: (context) => {
              emitPhaseEnded(context, "draw");
              // Rune pool empties at end of draw phase (rule 515.4.d)
              const playerId = context.getCurrentPlayer();
              const pool = context.state.runePools[playerId];
              if (pool) {
                pool.energy = 0;
                pool.power = {};
              }
            },

            order: 4,
          },

          /**
           * Main Phase (rule 516)
           *
           * Main phase - player can take any discretionary actions.
           * Does NOT auto-advance - player must explicitly end turn.
           */
          main: {
            endIf: () => false,
            next: "ending",
            onBegin: (context) => {
              context.state.turn = {
                ...context.state.turn,
                phase: "main",
              };
              emitPhaseBegan(context, "main");
            },

            onEnd: (context) => {
              emitPhaseEnded(context, "main");
            },

            order: 5,
          },

          /**
           * Ending Phase (rule 517)
           *
           * End of turn triggers fire.
           * Clear all damage from units, expire turn-scoped effects.
           * Empty all rune pools.
           * Auto-advances to cleanup.
           */
          ending: {
            endIf: () => true,
            next: "cleanup",
            onBegin: (context) => {
              context.state.turn = {
                ...context.state.turn,
                phase: "ending",
              };
              emitPhaseBegan(context, "ending");

              // Collect all board cards for cleanup
              const allBoardCards: CoreCardId[] = [];
              for (const pid of Object.keys(context.state.players)) {
                allBoardCards.push(
                  ...context.zones.getCardsInZone("base" as CoreZoneId, pid as CorePlayerId),
                );
              }
              for (const bfId of Object.keys(context.state.battlefields)) {
                allBoardCards.push(
                  ...context.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId),
                );
              }

              for (const cardId of allBoardCards) {
                const meta = context.cards.getCardMeta(cardId);
                if (!meta) {
                  continue;
                }

                // Clear all damage from units (rule 517.2.a)
                if (meta.damage && meta.damage > 0) {
                  context.cards.updateCardMeta(cardId, { damage: 0 });
                }

                // Clear stun at Ending Step (rule 599.1.a.2)
                if (meta.stunned) {
                  context.cards.updateCardMeta(cardId, { stunned: false });
                }

                // Expire turn-scoped granted keywords (rule 517.2.b)
                if (meta.grantedKeywords && meta.grantedKeywords.length > 0) {
                  const remaining = meta.grantedKeywords.filter(
                    (gk: { duration: string }) => gk.duration !== "turn",
                  );
                  context.cards.updateCardMeta(cardId, {
                    grantedKeywords: remaining.length > 0 ? remaining : undefined,
                  });
                }

                // Reset turn-scoped Might modifier (rule 517.2.b)
                if (meta.mightModifier && meta.mightModifier !== 0) {
                  context.cards.updateCardMeta(cardId, { mightModifier: 0 });
                }
              }

              // Empty all rune pools (rule 517.2.c)
              for (const playerId of Object.keys(context.state.runePools)) {
                const pool = context.state.runePools[playerId];
                if (pool) {
                  pool.energy = 0;
                  pool.power = {};
                }
              }

              // Clear turn-based tracking
              const currentPlayer = context.getCurrentPlayer();
              context.state.conqueredThisTurn[currentPlayer] = [];
              context.state.scoredThisTurn[currentPlayer] = [];

              // Clear consumed-next replacement markers so turn-scoped
              // Single-fire replacements (Tactical Retreat, Highlander, etc.)
              // Start fresh next turn.
              if (context.state.consumedNextReplacements) {
                context.state.consumedNextReplacements = {};
              }

              // Rule 187.4 / 323.6 — temporary control granted by an effect
              // (Hostile Takeover, "take control of … until end of turn")
              // Reverts to the original controller in the Ending step. We
              // Walk `pendingControlReverts` and restore each entry tagged
              // `expires:"end-of-turn"`. Entries tagged
              // `expires:"until-leaves"` are left in place; they're cleared
              // By the per-move cleanup hook when the card actually leaves
              // The board.
              const stateWithReverts = context.state as typeof context.state & {
                pendingControlReverts?: {
                  cardId: string;
                  originalController: string;
                  expires: "end-of-turn" | "until-leaves";
                }[];
              };
              const reverts = stateWithReverts.pendingControlReverts ?? [];
              if (reverts.length > 0) {
                const remaining: typeof reverts = [];
                for (const r of reverts) {
                  if (r.expires === "end-of-turn") {
                    if (typeof context.cards.setCardController === "function") {
                      context.cards.setCardController(
                        r.cardId as CoreCardId,
                        r.originalController as CorePlayerId,
                      );
                    }
                    // Hostile Takeover: "Lose control of that unit AND
                    // Recall it at end of turn." The recall (move-to-base)
                    // Is encoded as a separate sequence step on the spell's
                    // Effect text and runs at resolution; here we only
                    // Revert control.
                  } else {
                    remaining.push(r);
                  }
                }
                stateWithReverts.pendingControlReverts = remaining;
              }
            },

            onEnd: (context) => {
              emitPhaseEnded(context, "ending");
            },

            order: 6,
          },

          /**
           * Cleanup Phase (rules 518-526)
           *
           * Run state-based checks: kill units with damage >= might,
           * remove stale combat roles, recalculate static effects,
           * remove orphaned hidden cards.
           * Auto-advances (ends the turn).
           */
          cleanup: {
            order: 7,
            // No 'next' - FlowManager will call transitionToNextTurn()
            endIf: () => true,

            onBegin: (context) => {
              context.state.turn = {
                ...context.state.turn,
                phase: "cleanup",
              };
              emitPhaseBegan(context, "cleanup");

              // Run end-of-turn state-based checks (rules 518-526) for real,
              // Here, instead of relying solely on the post-move hook: a unit
              // That became lethal as a side effect of an Ending-phase hook
              // (turn-scoped Might buff expiry, etc.) must be reaped and fire
              // Its `die`/Deathknell triggers before the turn transitions.
              runFlowCleanup(context);

              // Rule 323.6 / 187.4.c — "If the turn is in an Open State,
              // Battlefields with no Units occupying them and no Showdown or
              // Combat ongoing become Uncontrolled." The end-of-turn Cleanup
              // Is the canonical Open-State cleanup; resolve it here. (We
              // Deliberately do NOT run this inside the per-move
              // `performCleanup` state-based-checks loop — that is not a
              // Cleanup-phase context, and the engine elsewhere relies on
              // Control persisting through combat/showdown resolution.)
              {
                const {interaction} = context.state;
                const sd = interaction ? getActiveShowdown(interaction) : null;
                const showdownBfId =
                  sd && sd.active ? (sd.battlefieldId as string | undefined) : undefined;
                for (const bfId of Object.keys(context.state.battlefields)) {
                  const bf = context.state.battlefields[bfId];
                  if (!bf || !bf.controller) {
                    continue;
                  }
                  // A Showdown/Combat is ongoing here if the bf is Contested
                  // (a combat is staged) or it is the active Showdown's bf.
                  if (bf.contested || showdownBfId === bfId) {
                    continue;
                  }
                  const unitsHere = context.zones.getCardsInZone(
                    `battlefield-${bfId}` as CoreZoneId,
                  );
                  const hasUnit = unitsHere.some((cardId) => {
                    const def = getGlobalCardRegistry().get(cardId as string);
                    return def?.cardType === "unit";
                  });
                  if (!hasUnit) {
                    bf.controller = null;
                  }
                }
              }
            },

            onEnd: (context) => {
              emitPhaseEnded(context, "cleanup");
            },
          },
        },
      },
    },
  },

  initialGameSegment: "setup",
};
