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
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { RiftboundCardMeta, RiftboundGameState } from "../../types";

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

        onBegin: (context) => {
          // Update turn tracking in game state
          const currentPlayer = context.getCurrentPlayer();
          const turnNumber = context.getTurnNumber();
          context.state.turn = {
            activePlayer: currentPlayer,
            number: turnNumber,
            phase: "awaken",
          };

          // Clear per-turn tracking
          context.state.conqueredThisTurn[currentPlayer] = [];
          context.state.scoredThisTurn[currentPlayer] = [];
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

              // Ready ALL game objects controlled by the turn player (rule 515.1)
              const playerId = context.getCurrentPlayer();

              // Collect cards from base
              const baseCards = context.zones.getCardsInZone(
                "base" as CoreZoneId,
                playerId as CorePlayerId,
              );

              // Collect cards from all battlefields
              const bfCards: CoreCardId[] = [];
              for (const bfId of Object.keys(context.state.battlefields)) {
                const cards = context.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId);
                for (const cardId of cards) {
                  const owner = context.cards.getCardOwner?.(cardId);
                  if (owner === playerId) {
                    bfCards.push(cardId);
                  }
                }
              }

              // Ready all exhausted cards
              for (const cardId of [...baseCards, ...bfCards]) {
                const meta = context.cards.getCardMeta(cardId);
                if (meta?.exhausted) {
                  context.cards.updateCardMeta(cardId, { exhausted: false });
                }
              }
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
                }
              }

              // Scoring step (rule 515.2.b): Holding
              // Score 1 point for each battlefield the turn player controls
              const playerId = context.getCurrentPlayer();
              for (const [bfId, bf] of Object.entries(context.state.battlefields)) {
                if (bf.controller === playerId) {
                  const scored = context.state.scoredThisTurn[playerId] ?? [];
                  if (!scored.includes(bfId)) {
                    const player = context.state.players[playerId];
                    if (player) {
                      player.victoryPoints += 1;
                    }

                    if (!context.state.scoredThisTurn[playerId]) {
                      context.state.scoredThisTurn[playerId] = [];
                    }
                    context.state.scoredThisTurn[playerId].push(bfId);
                  }
                }
              }
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
                  context.zones.moveCard({
                    cardId: topRune,
                    targetZoneId: "base" as CoreZoneId,
                  });

                  const pool = context.state.runePools[playerId];
                  if (pool) {
                    pool.energy += 1;
                  }
                }
              }
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
                      if (opponent.victoryPoints >= context.state.victoryScore) {
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

              // State-based checks are run by the engine after each move
              // Via performFullCleanup. The cleanup phase signals that
              // End-of-turn cleanup is complete and the turn can transition.
            },
          },
        },
      },
    },
  },

  initialGameSegment: "setup",
};
