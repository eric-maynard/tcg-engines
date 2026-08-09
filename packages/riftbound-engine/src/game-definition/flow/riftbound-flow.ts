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
import type { EffectContext } from "../../abilities/effect-executor";
import { recalculateStaticEffects } from "../../abilities/static-abilities";
import { fireTriggers } from "../../abilities/trigger-runner";
import type { TriggerRunnerContext } from "../../abilities/trigger-runner";
import { addToChain, createInteractionState } from "../../chain/chain-state";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { getChannelCountLimit } from "../../operations/channel-limits";
import { hasSkipDrawPhaseGrant } from "../moves/play/cost";
import { clearDamage, getDamage } from "../../operations/damage-store";
import { type LeaveBoardContext, removeFromBoard } from "../../operations/leave-board";
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
  clearPointsGainedThisTurn,
  refillDeckOrBurnOut,
  scoreBattlefield,
  scoreEvents,
} from "../../operations/points";

/**
 * Marker keyword granted by cards whose text reads "Your [Temporary] effects at
 * my battlefield don't trigger" (rule 816.1) — checked in the Beginning-Phase
 * Temporary kill step.
 */
const SUPPRESS_TEMPORARY_KEYWORD = "SuppressTemporaryHere";

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
 * rule 323.1 / 471.1.a.1 — a player reaching the Victory Score wins the game
 * immediately; the remaining phases of the current turn never happen.
 */
function gameHasEnded(state: { status?: string }): boolean {
  return state.status === "finished";
}

/**
 * rule 370.1 — replacement effects can run from the flow (the Beginning-Phase
 * Temporary kill). The flow context carries no counter store, so back the
 * counter API with card meta, which is what every reader consults.
 */
function buildFlowEffectContext(
  context: Parameters<typeof buildFlowTriggerContext>[0] & {
    cards: { updateCardMeta?: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void };
  },
): EffectContext {
  const base = buildFlowTriggerContext(context) as unknown as EffectContext;
  const setMeta = (cardId: CoreCardId, meta: Record<string, unknown>): void => {
    context.cards.updateCardMeta?.(cardId, meta as Partial<RiftboundCardMeta>);
  };
  const noop = () => {};
  return {
    ...base,
    counters: {
      addCounter: noop,
      clearCounter: (cardId: CoreCardId, counter: string) => setMeta(cardId, { [counter]: 0 }),
      // heal writes the resulting damage through updateCardMeta itself.
      removeCounter: noop,
      setFlag: (cardId: CoreCardId, flag: string, value: boolean) =>
        setMeta(cardId, { [flag]: value }),
    } as unknown as EffectContext["counters"],
  };
}

/** Context shape shared by the flow phase hooks that run a whole turn step. */
type FlowStepContext = Parameters<typeof buildFlowTriggerContext>[0] & {
  getCurrentPlayer: () => CorePlayerId;
  cards: {
    queryCards: (
      predicate: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => boolean,
    ) => CoreCardId[];
    setCardController?: (cardId: CoreCardId, playerId: CorePlayerId) => void;
    updateCardMeta?: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void;
  };
};

/**
 * rule 315.2.a→b / 317.1→317.2: a step that follows a trigger step may not run
 * until those triggers have resolved. The phase's endIf already holds the phase
 * open while the chain lives; these helpers remember that the step still owes
 * its work so the phase's onEnd runs it exactly once. When nothing went on the
 * chain the step runs inline, as before.
 */
type DeferredStep = "hold-scoring" | "expiration";
type DeferredStepState = { __deferredFlowSteps?: Record<string, boolean> };

function stepMustWaitForChain(state: RiftboundGameState): boolean {
  return (state.interaction?.chain?.active ?? false) || state.pendingChoice !== undefined;
}

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

/** Scoring Step of the Beginning Phase (rule 315.2.b / 515.2.b). */
function runHoldScoringStep(context: FlowStepContext): void {
        const playerId = context.getCurrentPlayer();
        const triggerCtx = buildFlowTriggerContext(context);

        // Scoring step (rule 315.2.b / 469.2): the Turn Player Holds each
        // battlefield they control and did not yet score this turn — a Score
        // worth up to one point. scoreBattlefield gates on "can't score here"
        // statics, marks the battlefield and runs the point through awardPoints
        // (054.1 denial, 443.1.a hold-scoped skips; no Final Point restriction
        // for a Hold, 471.1.a.1). rule 383.4.d.2.c: the Hold trigger fires even
        // when the point itself was denied or replaced.
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
              getCardMeta: context.cards.getCardMeta,
              getCardOwner: context.cards.getCardOwner ?? (() => undefined),
              updateCardMeta: context.cards.updateCardMeta,
            },
            draft: context.state,
            zones: context.zones,
          });
        }
}

/** Expiration Step of the Ending Phase (rule 317.2 / 517.2). */
function runExpirationStep(context: FlowStepContext): void {
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

        const flowCards = context.cards as unknown as {
          getCardMeta(cardId: CoreCardId): object | undefined;
          updateCardMeta(cardId: CoreCardId, meta: Record<string, unknown>): void;
        };
        // rule 364 — [Empowered] statics are dependent on the status, so an
        // expiry here has to be re-layered before anything reads Might again.
        let empowerStatusChanged = false;
        for (const cardId of allBoardCards) {
          const meta = context.cards.getCardMeta(cardId);
          if (!meta) {
            continue;
          }

          // Clear all damage from units (rule 517.2.a / 317.2.b) through the
          // single damage store (counter bag + meta mirror in one write; the
          // flow has no counter ops, so the store patches the bag via meta).
          if (getDamage({ cards: flowCards }, cardId as string) > 0) {
            clearDamage({ cards: flowCards }, cardId as string);
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

          // rule-id: unl-095-219 — expire turn-scoped delayed triggers (rule 517.2.b)
          if (meta.delayedTriggers && meta.delayedTriggers.length > 0) {
            const remaining = meta.delayedTriggers.filter(
              (dt: { duration: string }) => dt.duration !== "turn",
            );
            context.cards.updateCardMeta(cardId, {
              delayedTriggers: remaining.length > 0 ? remaining : undefined,
            });
          }

          // rule-id: ven-126-166 — a "this turn" numeric Prevent shield (rule 437.1.b.1.a)
          // expires unused in the Expiration Step (rule 517.2.b).
          if ((meta as { damagePreventionShield?: unknown }).damagePreventionShield !== undefined) {
            context.cards.updateCardMeta(cardId, {
              damagePreventionShield: undefined,
              damagePreventionSource: undefined,
            } as unknown as Partial<RiftboundCardMeta>);
          }

          // rule-id: ogn-157-298 — "you've not chosen this turn" resets (rule 517.2.b)
          if (meta.modesChosenThisTurn && meta.modesChosenThisTurn.length > 0) {
            context.cards.updateCardMeta(cardId, {
              modesChosenThisTurn: [],
            } as Partial<RiftboundCardMeta>);
          }

          // rule 517.2.b — "haven't been dealt damage this turn" gates read this
          // marker; it is turn-scoped, so forget it once the turn ends.
          // rule-id: ven-024-166
          if ((meta as { dealtDamageThisTurn?: boolean }).dealtDamageThisTurn) {
            context.cards.updateCardMeta(cardId, {
              dealtDamageThisTurn: false,
            } as Partial<RiftboundCardMeta>);
          }

          // rule-id: ven-099-166 — "Disempower it at end of turn" (rule 517.2.b)
          if ((meta as { empoweredUntilEndOfTurn?: boolean }).empoweredUntilEndOfTurn) {
            // rule 441.1.c.1 (rule-id: ven-134-166) — losing the status also
            // zeroes the count, exactly as handle_empower's disempower path
            // does; otherwise "+2 [Might] for each time I'm [Empowered]"
            // statics keep paying out on a no-longer-Empowered permanent.
            context.cards.updateCardMeta(cardId, {
              empowered: false,
              empowerCount: 0,
              empoweredUntilEndOfTurn: false,
            } as unknown as Partial<RiftboundCardMeta>);
            empowerStatusChanged = true;
          }

          // rule-id: ven-035-166 — the mirror "Empower it at end of turn" after
          // a Disempower (rule 517.2.b); the status returns with no duration.
          if ((meta as { disempoweredUntilEndOfTurn?: boolean }).disempoweredUntilEndOfTurn) {
            context.cards.updateCardMeta(cardId, {
              disempoweredUntilEndOfTurn: false,
              empowered: true,
              empowerCount: Math.max(
                1,
                (meta as { empowerCount?: number }).empowerCount ?? 0,
              ),
            } as unknown as Partial<RiftboundCardMeta>);
            empowerStatusChanged = true;
          }

          // rule-id: sfd-194-221 — "the next time … this turn, prevent it" is a
          // delayed replacement with a turn duration (rule 437.7): an UNUSED
          // one-shot shield expires now (rule 517.2.b) instead of eating a
          // later turn's damage.
          if ((meta as { preventNextDamageInstance?: boolean }).preventNextDamageInstance === true) {
            context.cards.updateCardMeta(cardId, {
              preventNextDamageInstance: false,
            } as unknown as Partial<RiftboundCardMeta>);
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

        // rule 364 / 828.1.c — [Empowered] came or went above; re-apply statics
        // now so count-based bonuses ("+2 for each time I'm Empowered") follow.
        if (empowerStatusChanged && context.cards.updateCardMeta) {
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

        // rule 317.1 / 455 (sfd-202-221 Hostile Takeover) — "…at end of
        // turn" control changes expire now: the permanent re-layers to
        // the next surviving control effect (else its owner) and, when
        // the effect said so, is recalled to its controller's base.
        // Recall is not a move (rule 458.1), so board state is kept.
        for (const cardId of allBoardCards) {
          const meta = context.cards.getCardMeta(cardId) as
            | Partial<RiftboundCardMeta>
            | undefined;
          const effects = meta?.controlEffects;
          if (!effects || effects.length === 0) {
            continue;
          }
          const expiring = effects.filter((e) => e.duration === "end-of-turn");
          if (expiring.length === 0) {
            continue;
          }
          const surviving = effects.filter((e) => e.duration !== "end-of-turn");
          context.cards.updateCardMeta(cardId, {
            controlEffects: surviving.length > 0 ? surviving : undefined,
          } as Partial<RiftboundCardMeta>);
          const owner = context.cards.getCardOwner?.(cardId);
          const desired = surviving[surviving.length - 1]?.controllerId ?? owner;
          if (desired) {
            context.cards.setCardController?.(cardId, desired as CorePlayerId);
          }
          if (expiring.some((e) => e.recallOnExpiry === true)) {
            const from = context.zones.getCardZone?.(cardId);
            context.zones.moveCard({ cardId, targetZoneId: "base" as CoreZoneId });
            // rule 323.6 / 190.4.c — a battlefield left without a unit
            // its controller controls is lost immediately (the Ending
            // Step is an Open State).
            if (from?.startsWith("battlefield-")) {
              const bf = context.state.battlefields[from.slice("battlefield-".length)];
              const stillThere = context.zones
                .getCardsInZone(from as CoreZoneId)
                .some(
                  (id) =>
                    (context.cards.getCardController?.(id) ??
                      context.cards.getCardOwner?.(id)) === bf?.controller,
                );
              if (bf?.controller && !stillThere) {
                bf.controller = null;
              }
            }
          }
        }

        // rule-id: ven-113-166 (rule 517.2.b) — turn-scoped granted
        // [Flow] expires at end of turn. The card sits in the trash, not
        // on the board, so sweep every card that carries the grant.
        const flowGrantCards = context.cards.queryCards(
          (_id, m) => (m as Partial<RiftboundCardMeta>).grantedFlow?.duration === "turn",
        );
        for (const cardId of flowGrantCards) {
          context.cards.updateCardMeta(cardId, {
            grantedFlow: undefined,
          } as Partial<RiftboundCardMeta>);
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

        // rule 323.5 / 517.2.b (ven-116-166) — "its base Might becomes N THIS
        // TURN" ends now: the printed base returns.
        const setBaseMightCards = context.cards.queryCards(
          (_id, m) => (m as Partial<RiftboundCardMeta>).baseMightOverride !== undefined,
        );
        for (const cardId of setBaseMightCards) {
          context.cards.updateCardMeta(cardId, {
            baseMightOverride: undefined,
          } as Partial<RiftboundCardMeta>);
        }

        // Empty all rune pools (rule 517.2.c)
        for (const playerId of Object.keys(context.state.runePools)) {
          emptyRunePoolInPlace(context.state, playerId);
        }

        // Clear turn-based tracking
        const currentPlayer = context.getCurrentPlayer();
        context.state.conqueredThisTurn[currentPlayer] = [];
        context.state.scoredThisTurn[currentPlayer] = [];
        clearPointsGainedThisTurn(context.state);
        // rule 517.2.b / 364.3.a (unl-108-219 Wily Newtfish) — "you've gained XP
        // this turn" is turn-scoped tracking and resets with the turn, though the
        // XP itself persists. getCurrentPlayer() may already be rotated here, and
        // the turn is over for everyone, so clear the whole ledger.
        if (context.state.xpGainedThisTurn) {
          const xpLedger = context.state.xpGainedThisTurn as Record<string, number>;
          for (const playerId of Object.keys(xpLedger)) {
            xpLedger[playerId] = 0;
          }
        }

        // Clear consumed-next replacement markers so turn-scoped
        // Single-fire replacements (Tactical Retreat, Highlander, etc.)
        // Start fresh next turn.
        if (context.state.consumedNextReplacements) {
          context.state.consumedNextReplacements = {};
        }
        // rule 127 (unl-053-219) — "you can look at their facedown cards THIS
        // TURN": turn-scoped information grants expire with the turn.
        if (context.state.visibilityGrants) {
          const lasting = context.state.visibilityGrants.filter(
            (g) => g.duration === "permanent",
          );
          context.state.visibilityGrants = lasting.length > 0 ? lasting : undefined;
        }
        // rule-id: ogn-026-298 — "can't play cards this turn" expires.
        if (context.state.cannotPlayCardsThisTurn) {
          context.state.cannotPlayCardsThisTurn = undefined;
        }
        // rule-id: sfd-078-221 — an unused "next spell has [Repeat]"
        // grant expires with the turn.
        if (context.state.nextSpellRepeat) {
          context.state.nextSpellRepeat = undefined;
        }
        // rule 419.4.a (rule-id: ven-044-166) — per-turn play ordinals of
        // pending spells do not outlive the turn that recorded them.
        if ((context.state as { spellPlayOrdinals?: unknown }).spellPlayOrdinals) {
          (context.state as { spellPlayOrdinals?: unknown }).spellPlayOrdinals = undefined;
        }
        // rule-id: unl-007-219 — expire "this turn" runtime replacements
        // (rule 517.2) so an unspent die→banish rider doesn't leak into
        // later turns.
        if (context.state.activeReplacements) {
          context.state.activeReplacements = (
            context.state.activeReplacements as { duration?: string }[]
          ).filter((e) => {
            if (e?.duration !== "turn" && e?.duration !== "next") {
              return true;
            }
            // rule 391 / 392 (rule-id: ven-044-166) — an untargeted "your next
            // card costs … less" discount prints no "this turn", so it is a
            // delayed one-shot that waits for the next card its owner plays
            // even across the turn boundary. Targeted "next … this turn"
            // permissions (Jayce, Raging Firebrand) still lapse here (517.2).
            const entry = e as { replaces?: string; target?: unknown };
            return e.duration === "next" && entry.replaces === "play-cost" && entry.target === undefined;
          });
        }
        // rule 517.2.b (ogn-053-298) — "this turn" continuous effects expire;
        // the next static pass drops their Might/keyword contributions.
        if (context.state.turnStatics) {
          context.state.turnStatics = undefined;
        }
        // rule 517.2.b (rule-id: sfd-166-221) — "this turn" player-scoped
        // delayed triggers expire with the turn that installed them.
        if (context.state.playerDelayedTriggers) {
          const remaining = context.state.playerDelayedTriggers.filter(
            (e) => e?.duration !== "turn",
          );
          context.state.playerDelayedTriggers = remaining.length > 0 ? remaining : undefined;
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

              // rule 323.6 / 190.4.c — every turn re-checks Battlefield occupancy: arm the
              // vacancy check on all controlled Battlefields so control with none of the
              // controller's Units there lapses in this turn's first Cleanup, even if no
              // Unit was ever seen holding it (state-based-checks step 6).
              for (const bf of Object.values(
                (context.state as RiftboundGameState).battlefields ?? {},
              )) {
                if (bf.controller) {
                  bf.controllerOccupied = true;
                }
              }

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
              // Battlefields a Temporary permanent left during this step.
              const vacatedBattlefields = new Set<string>();

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
                if (hasTemp && meta?.attachedTo) {
                  continue;
                }
                const grantedTemp = (meta?.grantedKeywords ?? []).some(
                  (gk: { keyword: string }) => gk.keyword === "Temporary",
                );
                if (hasTemp || grantedTemp) {
                  const fromBattlefield = battlefieldOfCard.get(cardId as string);
                  if (fromBattlefield && suppressedBattlefields.has(fromBattlefield)) {
                    continue;
                  }
                  if (fromBattlefield) {
                    vacatedBattlefields.add(fromBattlefield);
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
              if (temporaryIds.length > 0) {
                const state = context.state as RiftboundGameState;
                if (!state.interaction) {
                  (state as RiftboundGameState & {
                    interaction: NonNullable<RiftboundGameState["interaction"]>;
                  }).interaction = createInteractionState();
                }
                const turnOrder = Object.keys(state.players ?? {});
                for (const cardId of temporaryIds) {
                  (state as RiftboundGameState & {
                    interaction: NonNullable<RiftboundGameState["interaction"]>;
                  }).interaction = addToChain(
                    state.interaction!,
                    {
                      cardId,
                      controller: turnPlayerId as string,
                      effect: { type: "temporary-kill" } as never,
                      triggered: true,
                      type: "ability",
                    },
                    turnOrder,
                  );
                }
              }

              // rule 323.6: control of a Battlefield is lost as soon as the
              // controller has no Unit there. The Temporary kill (and any
              // replacement that moves the unit off the Battlefield instead)
              // happens before the scoring step, so re-check control now —
              // otherwise a Hold would be scored for a Battlefield that is no
              // longer controlled (rule 469.2).
              for (const bfId of vacatedBattlefields) {
                const bf = context.state.battlefields[bfId];
                if (!bf?.controller) {
                  continue;
                }
                const unitsAtBf = context.zones.getCardsInZone(
                  `battlefield-${bfId}` as CoreZoneId,
                );
                const stillHolds = unitsAtBf.some(
                  (id) =>
                    context.cards.getCardOwner?.(id) === bf.controller &&
                    getGlobalCardRegistry().getCardType(id as string) === "unit",
                );
                if (!stillHolds) {
                  bf.controller = null;
                }
              }

              // Beginning step (rule 515.2.a): "At the start of your Beginning
              // Phase" / "At the start of your turn" triggers fire before the
              // scoring step. `beginning-phase` triggers alias to this event in
              // the trigger matcher.
              const playerId = context.getCurrentPlayer();
              const triggerCtx = buildFlowTriggerContext(context);
              fireTriggers({ playerId: playerId as string, type: "start-of-turn" }, triggerCtx);

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

              // rule 317.1 before 317.2 — "this turn" effects stay live while
              // an end-of-turn trigger is still on the chain.
              if (stepMustWaitForChain(context.state)) {
                deferStep(context.state, "expiration");
              } else {
                runExpirationStep(context);
              }
            },

            onEnd: (context) => {
              if (takeDeferredStep(context.state, "expiration")) {
                runExpirationStep(context);
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
