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
import { recalculateStaticEffects } from "../../abilities/static-abilities";
import { fireTriggers } from "../../abilities/trigger-runner";
import type { TriggerRunnerContext } from "../../abilities/trigger-runner";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { dequeueExtraTurn } from "../../operations/turn-queue";
import type { RiftboundCardMeta, RiftboundGameState } from "../../types";
import { hasPlayerWon } from "../win-conditions/victory";
import { applyScoreReplacement, canPlayerScoreAtBattlefield } from "../../operations/scoring-rules";

/**
 * Build a TriggerRunnerContext from a flow phase context.
 *
 * Flow hooks receive FlowContext (state, zones, cards) but NOT counters.
 * We provide no-op counter stubs so triggers can execute their effects.
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
    getCardController?: (cardId: CoreCardId) => string | undefined;
    updateCardMeta?: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void;
  };
}): TriggerRunnerContext {
  const noop = () => {};
  return {
    cards: {
      getCardMeta: context.cards.getCardMeta as TriggerRunnerContext["cards"]["getCardMeta"],
      getCardOwner: (context.cards.getCardOwner ??
        (() => undefined)) as TriggerRunnerContext["cards"]["getCardOwner"],
      getCardController: context.cards.getCardController,
      updateCardMeta: context.cards
        .updateCardMeta as TriggerRunnerContext["cards"]["updateCardMeta"],
    },
    counters: {
      addCounter: noop as TriggerRunnerContext["counters"]["addCounter"],
      setFlag: noop as TriggerRunnerContext["counters"]["setFlag"],
    },
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
          if (context.state.unitsMovedThisTurn) {
            context.state.unitsMovedThisTurn[currentPlayer] = 0;
          }
          // rule-id: ogn-019-298 — "this turn" event log (discards, …) is per turn
          // for every player, not just the turn player.
          (context.state as { turnEvents?: Record<string, string[]> }).turnEvents = {};
          // rule-id: ogn-118-298 — "the first time … each turn" tallies reset every turn.
          context.state.turnEventCounts = {};
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

        onEnd: (context) => {
          // Rule 734: an additional turn is inserted directly after the
          // current turn. If one is pending, its owner becomes the next turn
          // player; otherwise normal seat-order rotation (set by the caller
          // before endTurn) is left untouched.
          const extra = dequeueExtraTurn(context.state);
          if (extra !== undefined) {
            context.setCurrentPlayer(extra);
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

              // Ready ALL game objects controlled by the turn player (rule 515.1).
              // Exhausted is written via counters.setFlag → cardMeta.__flags.exhausted at
              // Runtime, but test helpers seed the top-level meta.exhausted; treat either
              // As exhausted and clear both. queryCards scans every cardMeta so this
              // Covers base, battlefields, and runePool in one pass.
              const playerId = context.getCurrentPlayer();
              const triggerCtx = buildFlowTriggerContext(context);
              const awakenRegistry = getGlobalCardRegistry();
              type Flagged = {
                __flags?: Record<string, boolean>;
                exhausted?: boolean;
                grantedKeywords?: { keyword: string }[];
              };
              const exhausted = context.cards.queryCards((_id, meta) => {
                const m = meta as Flagged;
                return m.__flags?.exhausted === true || m.exhausted === true;
              });
              for (const cardId of exhausted) {
                if (context.cards.getCardOwner?.(cardId) !== playerId) {
                  continue;
                }
                const meta = context.cards.getCardMeta(cardId) as Flagged;
                // rule-id: unl-144-219 — "I can't be readied." blocks the Awaken ready.
                if (awakenRegistry.cantReady(cardId as string, meta?.grantedKeywords)) {
                  continue;
                }
                context.cards.updateCardMeta(cardId, {
                  __flags: { ...(meta.__flags ?? {}), exhausted: false },
                  exhausted: false,
                } as Partial<RiftboundCardMeta>);
                fireTriggers(
                  { cardId: cardId as string, playerId: playerId as string, type: "ready" },
                  triggerCtx,
                );
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
            // rule-id: 515.2.a-beginning-step-triggers (Loose Cannon): start-of-turn
            // triggers go on the chain in onBegin; hold the Beginning Phase until
            // that chain (and any choice it opens) resolves so Channel/Draw don't
            // run with the trigger still pending.
            endIf: (context) =>
              !(context.state as RiftboundGameState).interaction?.chain?.active &&
              !(context.state as RiftboundGameState).pendingChoice,
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

              // Beginning step (rule 515.2.a): "At the start of your Beginning
              // Phase" / "At the start of your turn" triggers fire before the
              // scoring step. `beginning-phase` triggers alias to this event in
              // the trigger matcher.
              const playerId = context.getCurrentPlayer();
              const triggerCtx = buildFlowTriggerContext(context);
              fireTriggers({ playerId: playerId as string, type: "start-of-turn" }, triggerCtx);

              // Scoring step (rule 515.2.b): Holding
              // Score 1 point for each battlefield the turn player controls
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
                    // Rule 571.4: a board `score` replacement (e.g. Otterpus) substitutes for the point.
                    if (
                      player &&
                      scoringAllowed &&
                      !applyScoreReplacement(context.state, playerId, context)
                    ) {
                      player.victoryPoints += 1;
                    }

                    if (!context.state.scoredThisTurn[playerId]) {
                      context.state.scoredThisTurn[playerId] = [];
                    }
                    context.state.scoredThisTurn[playerId].push(bfId);

                    // Emit "hold" event so triggered abilities fire (e.g. Altar to Unity)
                    if (scoringAllowed) {
                      fireTriggers({ battlefieldId: bfId, playerId, type: "hold" }, triggerCtx);
                    }
                  }
                }
              }

              // rule 364: passive abilities track game state continuously — the
              // scoring step changed points outside any move, so re-apply statics
              // (e.g. "My Might is increased by your points") now rather than
              // waiting for the next move's cleanup pass.
              if (context.cards.updateCardMeta) {
                recalculateStaticEffects({
                  cards: {
                    getCardMeta: context.cards.getCardMeta,
                    getCardOwner: context.cards.getCardOwner ?? (() => undefined),
                    updateCardMeta: context.cards.updateCardMeta,
                  },
                  draft: context.state,
                  zones: context.zones,
                });
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
              // rule-id: 515.3.b-channel-turn-player — the Turn Player channels.
              // Read turn.activePlayer, not getCurrentPlayer(): callers may
              // pre-rotate the flow's current player while the Beginning Phase
              // is held on a start-of-turn chain.
              const playerId = (context.state.turn?.activePlayer ||
                context.getCurrentPlayer()) as CorePlayerId;
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

              // rule 364: the rune pool grew outside any move, so statics that
              // read it ("While you have 8+ runes, …") must be re-applied now.
              if (runesToChannel > 0 && context.cards.updateCardMeta) {
                recalculateStaticEffects({
                  cards: {
                    getCardMeta: context.cards.getCardMeta,
                    getCardOwner: context.cards.getCardOwner ?? (() => undefined),
                    updateCardMeta: context.cards.updateCardMeta,
                  },
                  draft: context.state,
                  zones: context.zones,
                });
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

              // rule-id: 515.4.b-draw-turn-player — the Turn Player draws; see
              // channel.onBegin for why this reads turn.activePlayer.
              const playerId = (context.state.turn?.activePlayer ||
                context.getCurrentPlayer()) as CorePlayerId;

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
                      if (hasPlayerWon(context.state, opponentId)) {
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
              const playerId = context.state.turn?.activePlayer || context.getCurrentPlayer();
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

              // rule-id: 516-main-phase-start (ven-067-166 Bottled
              // Constellation): "At the start of your Main Phase" triggers
              // fire for the turn player as the Main Phase opens.
              const mainPlayer = context.state.turn?.activePlayer || context.getCurrentPlayer();
              if (mainPlayer) {
                fireTriggers(
                  { playerId: mainPlayer as string, type: "main-phase" },
                  buildFlowTriggerContext(context),
                );
              }
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
            // rule-id: 517.1-end-of-turn-triggers (ogn-160-298 Dazzling Aurora):
            // end-of-turn triggers go on the chain in onBegin; hold the Ending
            // Step until that chain (and any choice it opens) has resolved so
            // the turn doesn't rotate with the trigger still pending.
            endIf: (context) =>
              !(context.state as RiftboundGameState).interaction?.chain?.active &&
              !(context.state as RiftboundGameState).pendingChoice,
            next: "cleanup",
            onBegin: (context) => {
              context.state.turn = {
                ...context.state.turn,
                phase: "ending",
              };

              // Rule 517.1: "At the end of your turn" triggers fire for the
              // turn player. Read turn.activePlayer, not getCurrentPlayer() —
              // callers pre-rotate the flow's current player before endTurn.
              const endingPlayer = context.state.turn.activePlayer;
              if (endingPlayer) {
                fireTriggers(
                  { playerId: endingPlayer as string, type: "end-of-turn" },
                  buildFlowTriggerContext(context),
                );
              }

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

                // Clear stun at Ending Step (rule 423.1.a.2) — the stun effect writes
                // counters.setFlag → __flags.stunned; seeds/mirrors use top-level stunned.
                const stunFlags = (meta as { __flags?: Record<string, boolean> }).__flags;
                if (meta.stunned || stunFlags?.stunned === true) {
                  context.cards.updateCardMeta(cardId, {
                    __flags: { ...(stunFlags ?? {}), stunned: false },
                    stunned: false,
                  } as Partial<RiftboundCardMeta>);
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

                // rule-id: ven-142-166 — expire turn-scoped granted abilities (rule 517.2.b)
                if (meta.grantedAbilities && meta.grantedAbilities.length > 0) {
                  const remaining = meta.grantedAbilities.filter(
                    (ga: { duration: string }) => ga.duration !== "turn",
                  );
                  context.cards.updateCardMeta(cardId, {
                    grantedAbilities: remaining.length > 0 ? remaining : undefined,
                  });
                }

                // rule-id: ogn-157-298 — "you've not chosen this turn" resets (rule 517.2.b)
                if (meta.modesChosenThisTurn && meta.modesChosenThisTurn.length > 0) {
                  context.cards.updateCardMeta(cardId, {
                    modesChosenThisTurn: [],
                  } as Partial<RiftboundCardMeta>);
                }

                // Reset turn-scoped Might modifier (rule 517.2.b)
                if (meta.mightModifier && meta.mightModifier !== 0) {
                  context.cards.updateCardMeta(cardId, { mightModifier: 0 });
                }
                // rule-id: sfd-110-221 — combat-scoped portion goes with it.
                if (meta.combatMightModifier) {
                  context.cards.updateCardMeta(cardId, { combatMightModifier: 0 });
                }
              }

              // rule-id: ogn-197-298 — "this turn" Might modifiers expire at
              // end of turn regardless of zone (rule 517.2.b). A unit that left
              // the board (hand / facedown / etc.) must not carry a stale
              // modifier into a later replay (e.g. Teemo revealed from Hidden).
              const staleMightCards = context.cards.queryCards(
                (_id, m) => ((m as Partial<RiftboundCardMeta>).mightModifier ?? 0) !== 0,
              );
              for (const cardId of staleMightCards) {
                context.cards.updateCardMeta(cardId, {
                  mightModifier: 0,
                } as Partial<RiftboundCardMeta>);
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
              // rule-id: ogn-026-298 — "can't play cards this turn" expires.
              if (context.state.cannotPlayCardsThisTurn) {
                context.state.cannotPlayCardsThisTurn = undefined;
              }
              // rule-id: unl-007-219 — expire "this turn" runtime replacements
              // (rule 517.2) so an unspent die→banish rider doesn't leak into
              // later turns.
              if (context.state.activeReplacements) {
                context.state.activeReplacements = (
                  context.state.activeReplacements as { duration?: string }[]
                ).filter((e) => e?.duration !== "turn" && e?.duration !== "next");
              }
              // rule 517.2.b (ogn-053-298) — "this turn" continuous effects expire;
              // the next static pass drops their Might/keyword contributions.
              if (context.state.turnStatics) {
                context.state.turnStatics = undefined;
              }
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
