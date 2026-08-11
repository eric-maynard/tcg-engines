/**
 * Riftbound Flow Definition
 *
 * Implements the official Riftbound turn structure using @tcg/core FlowDefinition.
 *
 * Turn phases (rules 315-317):
 *   1. Awaken     - Ready all game objects (315.1)
 *   2. Beginning  - Start of turn triggers, scoring/holding (315.2)
 *   3. Channel    - Channel 2 runes from rune deck (315.3)
 *   4. Draw       - Draw 1 card, rune pool empties (315.4)
 *   5. Main       - Main phase: play cards, move units, combat (316)
 *   6. Ending     - Ending Step: end of turn triggers (317.1)
 *   7. Expiration - Expiration Step: heal → expire → empty pools, re-looped
 *                   while it keeps putting items on the chain (317.2), then
 *                   the next player becomes Turn Player (317.3)
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
import { addToChain, createInteractionState } from "../../chain/chain-state";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { getChannelCountLimit } from "../../operations/channel-limits";
import { hasSkipDrawPhaseGrant, hasSkipPhaseGrant } from "../moves/play/cost";
import { orderBatchTriggersByTurnOrder } from "../../operations/leave-board";
import {
  finalizePendingItems,
  withinMoveReducer,
} from "../../abilities/trigger-finalization";
import { emptyRunePoolInPlace } from "../../operations/riftbound-operations";
import { resetPlaysThisTurn } from "../../operations/plays-this-turn";
import {
  beginAdditionalTurn,
  dequeueExtraTurn,
  resumeQueuedTurn,
} from "../../operations/turn-queue";
import type { PlayerId, RiftboundCardMeta, RiftboundGameState } from "../../types";
import {
  checkVictory,
  refillDeckOrBurnOut,
  scoreBattlefield,
  scoreEvents,
} from "../../operations/points";
import {
  type FlowStepContext,
  buildFlowTriggerContext,
  gameHasEnded,
  stepMustWaitForChain,
} from "./flow-context";
import { resetTurnTrace, runExpirationStep } from "./expiration-step";

/**
 * Marker keyword granted by cards whose text reads "Your [Temporary] effects at
 * my battlefield don't trigger" (rule 816.1) — checked in the Beginning-Phase
 * Temporary kill step.
 */
const SUPPRESS_TEMPORARY_KEYWORD = "SuppressTemporaryHere";

/**
 * rule 315.2.a→b: a step that follows a trigger step may not run until those
 * triggers have resolved. The phase's endIf already holds the phase open while
 * the chain lives; these helpers remember that the step still owes its work so
 * a later hook runs it exactly once. When nothing went on the chain the step
 * runs inline. (The Expiration Step keeps its own progress on
 * `state.turnTrace.expiration` instead — see `expiration-step.ts`.)
 */
type DeferredStep = "hold-scoring";
type DeferredStepState = { __deferredFlowSteps?: Record<string, boolean> };

function deferStep(state: RiftboundGameState, step: DeferredStep): void {
  const s = state as RiftboundGameState & DeferredStepState;
  s.__deferredFlowSteps = { ...(s.__deferredFlowSteps ?? {}), [step]: true };
}

function takeDeferredStep(state: RiftboundGameState, step: DeferredStep): boolean {
  const s = state as RiftboundGameState & DeferredStepState;
  if (s.__deferredFlowSteps?.[step] !== true) {
    return false;
  }
  s.__deferredFlowSteps = { ...s.__deferredFlowSteps, [step]: false };
  return true;
}

/**
 * rule 317.1 / 317.2.e / 460 — the Ending Phase may only move on when no chain
 * item, prompt, or contested battlefield (a showdown an end-of-turn effect
 * staged is fought inside this phase) is outstanding.
 */
function endingPhaseIsIdle(state: RiftboundGameState): boolean {
  return (
    !stepMustWaitForChain(state) &&
    !Object.values(state.battlefields ?? {}).some((bf) => bf.contested === true)
  );
}

/** Scoring Step of the Beginning Phase (rule 315.2.b / 515.2.b). */
function runHoldScoringStep(context: FlowStepContext): void {
        // rule 323.1 / 431.3.c.1 — a win reached earlier in the Beginning Phase
        // (an opponent's Burn Out point during the Beginning Step) ends the game
        // at once: the Scoring Step never runs, so nothing Holds and no Hold
        // trigger is queued onto the chain of a finished game.
        if (gameHasEnded(context.state)) {
          return;
        }
        const playerId = context.getCurrentPlayer();
        const triggerCtx = buildFlowTriggerContext(context);

        // Scoring step (rule 315.2.b / 469.2): the Turn Player Holds each
        // battlefield they control and did not yet score this turn — a Score
        // worth up to one point. scoreBattlefield gates on "can't score here"
        // statics, marks the battlefield and runs the point through awardPoints
        // (054.1 denial, 443.1.a hold-scoped skips; no Final Point restriction
        // for a Hold, 471.1.a.1). rule 383.4.d.2.c: the Hold trigger fires even
        // when the point itself was denied or replaced.
        // rule 315.2.b.2 — "the Turn Player Holds every Battlefield they Control"
        // is ONE task, so every Hold trigger of every battlefield is simultaneous
        // (383.3.d.1). Queue them all as one batch (no per-event finalization),
        // sort the batch by turn order, then finalize once.
        const chainLenBefore = context.state.interaction?.chain?.items.length ?? 0;
        withinMoveReducer(() => {
          for (const [bfId, bf] of Object.entries(context.state.battlefields)) {
            if (bf.controller === playerId) {
              const { isScore } = scoreBattlefield(
                context.state,
                playerId as PlayerId,
                bfId,
                "hold",
                context,
              );
              if (isScore) {
                // Emit "hold" (+ "score") so triggered abilities fire (e.g. Altar to Unity)
                for (const event of scoreEvents(playerId as PlayerId, bfId, "hold")) {
                  fireTriggers(event, triggerCtx);
                }
              }
            }
          }
        });
        orderBatchTriggersByTurnOrder(context.state, chainLenBefore);
        if (context.state.pendingChoice === undefined) {
          finalizePendingItems(context.state, triggerCtx);
        }

        // rule 472 / 319.2: the Cleanup at the end of the Scoring Step checks
        // victory — a Hold can be the winning point. The step runs outside any
        // move reducer, so the check is made here.
        checkVictory(context.state, { io: context });

        // rule 364: passive abilities track game state continuously — the
        // scoring step changed points outside any move, so re-apply statics
        // (e.g. "My Might is increased by your points") now rather than
        // waiting for the next move's cleanup pass.
        if (context.cards.updateCardMeta) {
          recalculateStaticEffects({
            cards: {
              // rule 108.2 — "friendly"/"your" reads CONTROL, not ownership.
              getCardController: context.cards.getCardController,
              getCardMeta: context.cards.getCardMeta,
              getCardOwner: context.cards.getCardOwner ?? (() => undefined),
              updateCardMeta: context.cards.updateCardMeta,
            },
            draft: context.state,
            zones: context.zones,
          });
        }
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
          // rule-id: unl-089-219 — "spent [4] or more to play a spell this turn"
          // is per turn for every player.
          (context.state as { spellEnergySpentThisTurn?: Record<string, number> })
            .spellEnergySpentThisTurn = {};
          // rule 135.2 (rule-id: unl-005-219) — per-spell payments are only ever
          // read by the trigger of the spell being played; clear them each turn.
          (context.state as { spellEnergySpentByCard?: Record<string, number> })
            .spellEnergySpentByCard = {};
          // rule 364.3.a (rule-id: sfd-143-221) — "spent … this turn" power tallies
          // reset for every player at the start of each turn.
          (context.state as { powerSpentThisTurn?: Record<string, number> })
            .powerSpentThisTurn = {};
          if (context.state.cardsPlayedThisTurn) {
            // Rule 724 (Legion): reset main-deck cards-played counter at
            // The start of the turn player's turn so Legion conditions
            // Fire only on plays made during the current turn.
            context.state.cardsPlayedThisTurn[currentPlayer] = 0;
          }
          // rule 356.4 — the matching identity ledger refreshes with it, so
          // "the first … played each turn" slots reopen every turn.
          resetPlaysThisTurn(context.state, currentPlayer);

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
            // rule 737: the additional turn is INSERTED, not substituted — the
            // turn it displaces is remembered and resumes once the run of
            // additional turns finishes.
            beginAdditionalTurn(context.state, context.getCurrentPlayer());
            // rule 738: turn numbers past an additional turn are shifted by one
            // while Turn Order is unchanged — first-turn bookkeeping (485.7)
            // reads this offset.
            context.state.additionalTurnsTaken = (context.state.additionalTurnsTaken ?? 0) + 1;
            context.setCurrentPlayer(extra);
          } else {
            const queued = resumeQueuedTurn(context.state);
            if (queued !== undefined) {
              context.setCurrentPlayer(queued);
            }
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
                // rule 315.1.b / 515.1: Awaken readies what the turn player
                // CONTROLS — a borrowed permanent readies for its controller,
                // not for its owner.
                const holder =
                  context.cards.getCardController?.(cardId) ?? context.cards.getCardOwner?.(cardId);
                if (holder !== playerId) {
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
            // The Scoring Step is its own phase (see `scoring` below) so the
            // Hold triggers it fires can hold the turn open too.
            next: "scoring",
            onBegin: (context) => {
              context.state.turn = {
                ...context.state.turn,
                phase: "beginning",
              };

              // rule 443.1.a.2 / 443.2.a — "Skip your Beginning Phase" replaces
              // the whole phase with nothing, the Scoring Step included: no
              // [Temporary] kills, no start-of-phase triggers, no Hold scored
              // (so 470's once-per-battlefield allowance stays available), and
              // the skip itself triggers nothing. One-sided, like the Draw skip.
              const beginningPlayer = (context.state.turn?.activePlayer ||
                context.getCurrentPlayer()) as string;
              if (hasSkipPhaseGrant(context.state, context.zones, beginningPlayer, "beginning")) {
                return;
              }

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
              const battlefieldOfCard = new Map<string, string>();
              for (const bfId of Object.keys(context.state.battlefields)) {
                const bfCards = context.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId);
                for (const cardId of bfCards) {
                  tempKillCards.push(cardId);
                  battlefieldOfCard.set(cardId as string, bfId);
                }
              }
              const tempRegistry = getGlobalCardRegistry();

              // rule 816.1 — "Your [Temporary] effects at my battlefield don't
              // trigger" (LeBlanc, Everywhere at Once): the kill simply never
              // happens for that player's permanents at that battlefield.
              const suppressedBattlefields = new Set<string>();
              for (const [cardId, bfId] of battlefieldOfCard) {
                const suppressorController =
                  context.cards.getCardController?.(cardId as CoreCardId) ??
                  context.cards.getCardOwner?.(cardId as CoreCardId);
                if (suppressorController !== turnPlayerId) {
                  continue;
                }
                const suppressorMeta = context.cards.getCardMeta(cardId as CoreCardId);
                const granted = (suppressorMeta?.grantedKeywords ?? []).some(
                  (gk: { keyword: string }) => gk.keyword === SUPPRESS_TEMPORARY_KEYWORD,
                );
                const printed = (tempRegistry.getAbilities(cardId) ?? []).some(
                  (a: { type?: string; effect?: { type?: string; keyword?: string } }) =>
                    a.type === "static" &&
                    a.effect?.type === "grant-keyword" &&
                    a.effect?.keyword === SUPPRESS_TEMPORARY_KEYWORD,
                );
                if (granted || printed) {
                  suppressedBattlefields.add(bfId);
                }
              }

              const temporaryIds: string[] = [];
              for (const cardId of tempKillCards) {
                // rule 816.1.b/c — [Temporary] kills at the start of the
                // permanent's CONTROLLER's Beginning Phase, not its owner's: a
                // stolen Temporary unit dies on the thief's turn.
                const controller =
                  context.cards.getCardController?.(cardId) ??
                  context.cards.getCardOwner?.(cardId);
                if (controller !== turnPlayerId) {
                  continue;
                }

                const hasTemp = tempRegistry.hasKeyword(cardId as string, "Temporary");
                const meta = context.cards.getCardMeta(cardId);
                // rule 718.2 / 721.2 — an ATTACHED card's rules text is Inactive,
                // so a printed [Temporary] on equipment does not trigger while it
                // is attached ("if this is unattached"). A granted [Temporary]
                // comes from an active outside effect and still applies.
                const grantedTemp = (meta?.grantedKeywords ?? []).some(
                  (gk: { keyword: string }) => gk.keyword === "Temporary",
                );
                const printedTempActive = hasTemp && meta?.attachedTo === undefined;
                if (printedTempActive || grantedTemp) {
                  const fromBattlefield = battlefieldOfCard.get(cardId as string);
                  if (fromBattlefield && suppressedBattlefields.has(fromBattlefield)) {
                    continue;
                  }
                  temporaryIds.push(cardId as string);
                }
              }
              // rule 728.1.b / 428.1 — the [Temporary] kill is a death like any
              // other: one simultaneous batch through the leave-board choke
              // point, so board die replacements apply (370.1 — forced, no
              // prompt), Equipment detaches (457.1), the card resets (124.1),
              // tokens cease (186.1) and `die` fires with last-known
              // information so Deathknells go on the chain (held by endIf).
              //
              // rule 816.1 — [Temporary] is a TRIGGERED ability, so each kill
              // goes on the Chain as its own item and both players get Priority
              // over it (the permanent's controller may respond, e.g. Retreat
              // it in answer to the trigger). Resolution runs
              // `handle_temporaryKill`, which performs the removal above.
              //
              // rule 383.3.d — the [Temporary] kill triggers "at the start of
              // your Beginning Phase", exactly when every other start-of-phase
              // ability does, so all of them form ONE simultaneous batch whose
              // order their controller chooses: the kills carry the same
              // `triggerBatch` stamp as the start-of-turn triggers fired below.
              if (temporaryIds.length > 0) {
                const state = context.state as RiftboundGameState;
                if (!state.interaction) {
                  (state as RiftboundGameState & {
                    interaction: NonNullable<RiftboundGameState["interaction"]>;
                  }).interaction = createInteractionState();
                }
                const turnOrder = Object.keys(state.players ?? {});
                // The start-of-phase triggers fired below are stamped with the
                // chain id that is next once these kills are queued; share it so
                // the whole instant is one orderable batch.
                const temporaryBatch = `batch-${state.interaction!.nextChainItemId + temporaryIds.length}`;
                for (const cardId of temporaryIds) {
                  (state as RiftboundGameState & {
                    interaction: NonNullable<RiftboundGameState["interaction"]>;
                  }).interaction = addToChain(
                    state.interaction!,
                    {
                      cardId,
                      controller: turnPlayerId as string,
                      effect: { type: "temporary-kill" } as never,
                      // rule 402.4 — the kill has no objects or costs to settle,
                      // so the item is finalized the moment it is queued.
                      status: "finalized",
                      triggerBatch: temporaryBatch,
                      triggered: true,
                      type: "ability",
                    },
                    turnOrder,
                  );
                }
              }

              // rule 323.6 / 190.4.c: the [Temporary] kills above are chain items;
              // the Cleanup after they resolve (state-based-checks step 6 →
              // operations/battlefield-control.ts) drops control of a Battlefield
              // left without a unit of its controller BEFORE the deferred scoring
              // step runs, so no Hold is scored for it (469.2).

              // Beginning step (rule 515.2.a): "At the start of your Beginning
              // Phase" / "At the start of your turn" triggers fire before the
              // scoring step. `beginning-phase` triggers alias to this event in
              // the trigger matcher.
              const playerId = context.getCurrentPlayer();
              const triggerCtx = buildFlowTriggerContext(context);
              fireTriggers({ playerId: playerId as string, type: "start-of-turn" }, triggerCtx);
              // rule 383.3.d — the [Temporary] kills queued above are Chain items
              // of this same instant, but they are added by the flow, not by a
              // trigger match, so nothing has run the finalization sweep when no
              // other start-of-phase ability fired. Run it here so their
              // controller is offered their order.
              finalizePendingItems(context.state, triggerCtx);

              // rule 315.2.a before 315.2.b — the Scoring Step waits for the
              // Beginning Step's triggers, so a battlefield vacated by such a
              // trigger earns no Hold point.
              if (stepMustWaitForChain(context.state)) {
                deferStep(context.state, "hold-scoring");
              } else {
                runHoldScoringStep(context);
              }
            },

            order: 2,
          },

          /**
           * Scoring Step of the Beginning Phase (rule 315.2.b), modelled as its
           * own flow phase.
           *
           * rule 315.2.a→b / 317.1: the Scoring Step may not run until the
           * Beginning Step's triggers have resolved, and the Hold triggers IT
           * fires must resolve before the Channel Phase begins. A phase's onEnd
           * cannot hold its own phase open (the transition is already under
           * way), so the deferred scoring runs here instead, where `endIf` can
           * keep the turn parked until the Hold chain empties.
           *
           * `turn.phase` is deliberately NOT written: this is still the
           * Beginning Phase as far as the rules and the game state are
           * concerned.
           */
          scoring: {
            endIf: (context) =>
              !(context.state as RiftboundGameState).interaction?.chain?.active &&
              !(context.state as RiftboundGameState).pendingChoice,
            next: "channel",
            onBegin: (context) => {
              if (takeDeferredStep(context.state, "hold-scoring")) {
                runHoldScoringStep(context);
              }
            },

            order: 2.5,
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
              // rule 323.1: once a player has won the game ends immediately —
              // the rest of the turn (Channel/Draw/Main) never happens.
              if (gameHasEnded(context.state)) {
                return;
              }
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

              // rule 485.7 / 738: the bonus belongs to the player's OWN first
              // turn. Additional Turns are inserted into the queue without
              // changing Turn Order, so every later turn number is shifted by
              // the number of additional turns already taken.
              const isFirstTurn =
                context.state.firstTurnNumber?.[playerId] !== undefined &&
                context.state.firstTurnNumber[playerId] + (context.state.additionalTurnsTaken ?? 0) ===
                  context.getTurnNumber();
              // rule 487.7: only the LAST player in Turn Order gets the extra
              // rune; middle players in a multiplayer game channel the normal 2.
              const isExtraRunePlayer =
                context.state.extraRunePlayerId === undefined ||
                context.state.extraRunePlayerId === playerId;
              if (isFirstTurn && context.state.secondPlayerExtraRune && isExtraRunePlayer) {
                baseChannelCount = 3;
              }

              // rule 515.3.b: a static on the board may cap the channel count
              // (ven-036-166 Sandstone Chimera: "players only channel 1 rune").
              const channelLimit = getChannelCountLimit(
                Object.keys(context.state.battlefields ?? {}),
                (zoneId) => context.zones.getCardsInZone(zoneId as CoreZoneId) ?? [],
              );
              if (channelLimit !== undefined) {
                baseChannelCount = Math.min(baseChannelCount, channelLimit);
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
                    // rule 108.2 — "friendly"/"your" reads CONTROL, not ownership.
                    getCardController: context.cards.getCardController,
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
              // rule 323.1: the game already ended — no Draw Phase happens.
              if (gameHasEnded(context.state)) {
                return;
              }
              context.state.turn = {
                ...context.state.turn,
                phase: "draw",
              };

              // rule-id: 515.4.b-draw-turn-player — the Turn Player draws; see
              // channel.onBegin for why this reads turn.activePlayer.
              const playerId = (context.state.turn?.activePlayer ||
                context.getCurrentPlayer()) as CorePlayerId;

              // rule 487.7: in the multiplayer modes the player going first
              // skips their first Draw Phase — no draw, so no Burn Out either.
              if (context.state.skipFirstDrawFor === (playerId as unknown as string)) {
                context.state.skipFirstDrawFor = undefined;
                return;
              }

              // rule 315.4 (rule-id: ven-022-166) — "Skip your Draw Phase"
              // removes the phase for its controller only: no draw, and so no
              // Burn Out from an empty deck either.
              if (hasSkipDrawPhaseGrant(context.state, context.zones, playerId as string)) {
                return;
              }

              // rule 431 / 431.3: an empty Main Deck burns out — trash shuffled
              // in, an opponent gains 1 point (through awardPoints); with the
              // trash empty too it repeats until an opponent wins (431.3.c.1,
              // immediately) or the no-progress guard gives up. rule 323.1: if
              // the game ended, or the deck is still empty, no card is drawn.
              if (!refillDeckOrBurnOut(context.state, playerId as PlayerId, context)) {
                return;
              }

              // Draw 1 card (rule 515.4.b)
              context.zones.drawCards({
                count: 1,
                from: "mainDeck" as CoreZoneId,
                playerId: playerId as CorePlayerId,
                to: "hand" as CoreZoneId,
              });
              // rule 317 — the Draw Phase card is a draw like any other, so it
              // is the turn player's FIRST draw of the turn for "when you draw
              // your Nth card each turn" tallies.
              fireTriggers(
                { playerId: playerId as string, type: "draw" },
                buildFlowTriggerContext(context),
              );
            },

            onEnd: (context) => {
              // Rune pool empties at end of draw phase (rule 515.4.d)
              const playerId = context.state.turn?.activePlayer || context.getCurrentPlayer();
              emptyRunePoolInPlace(context.state, playerId);
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
              // rule 323.1: the game already ended — the Main Phase never opens.
              if (gameHasEnded(context.state)) {
                return;
              }
              context.state.turn = {
                ...context.state.turn,
                phase: "main",
              };

              // rule 316.3: as the Main Phase begins EACH player's Rune Pool
              // empties — not just the turn player's (draw.onEnd covers only
              // that one), so energy an opponent floated for a Reaction during
              // the Beginning/Channel/Draw Phases is lost here.
              for (const poolPlayerId of Object.keys(context.state.runePools)) {
                emptyRunePoolInPlace(context.state, poolPlayerId);
              }

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
           * Ending Phase — Ending Step (rule 317.1)
           *
           * "At the end of turn" triggers fire and resolve. When nothing went on
           * the chain the Expiration Step (317.2) starts right here; otherwise
           * the `expiration` phase picks it up once the chain is gone.
           */
          ending: {
            // rule-id: 517.1-end-of-turn-triggers (ogn-160-298 Dazzling Aurora):
            // end-of-turn triggers go on the chain in onBegin; hold the Ending
            // Step until that chain (and any choice it opens) has resolved so
            // the turn doesn't rotate with the trigger still pending.
            // rule 460 / 461 (same rule the `endTurn` move applies): a showdown
            // an end-of-turn trigger staged — Aurora playing ogn-161-298 to an
            // occupied enemy battlefield — is fought inside THIS ending phase,
            // so the phase also waits while any battlefield is contested.
            endIf: (context) => endingPhaseIsIdle(context.state as RiftboundGameState),
            next: "expiration",
            onBegin: (context) => {
              context.state.turn = {
                ...context.state.turn,
                phase: "ending",
              };
              resetTurnTrace(context.state);

              // Rule 317.1: "At the end of your turn" triggers fire for the
              // turn player. Read turn.activePlayer, not getCurrentPlayer() —
              // callers pre-rotate the flow's current player before endTurn.
              const endingPlayer = context.state.turn.activePlayer;
              if (endingPlayer) {
                fireTriggers(
                  { playerId: endingPlayer as string, type: "end-of-turn" },
                  buildFlowTriggerContext(context),
                );
              }

              // rule 317.1 before 317.2 — "this turn" effects stay live while
              // an end-of-turn trigger is still on the chain; the Expiration
              // Step then begins in `expiration.onBegin`.
              if (endingPhaseIsIdle(context.state)) {
                runExpirationStep(context);
              }
            },

            order: 6,
          },

          /**
           * Ending Phase — Expiration Step (rule 317.2), continued.
           *
           * Entered whenever the Ending Phase's chain has emptied: runs the
           * next Expiration pass(es). A pass that put items on the chain
           * (317.2.e — e.g. "when a unit becomes [Mighty]" off a lapsed
           * -Might) parks here until they are resolved, then the phase
           * RE-ENTERS ITSELF (`next: "expiration"`) for the following pass
           * (317.2.f). Only a pass that processed no item hands the turn to
           * the next player (317.3) — the next turn never begins while an
           * expiration-created chain is open. `turn.phase` stays "ending".
           */
          expiration: {
            endIf: (context) => endingPhaseIsIdle(context.state as RiftboundGameState),
            next: "expiration",
            onBegin: (context) => {
              if (runExpirationStep(context) === "done") {
                // rule 317.3 — the Ending Phase is complete.
                context.state.turn = {
                  ...context.state.turn,
                  phase: "cleanup",
                };
                context.endTurn();
              }
            },

            order: 7,
          },
        },
      },
    },
  },

  initialGameSegment: "setup",
};
