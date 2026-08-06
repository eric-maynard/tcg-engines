/**
 * Showdown moves: passShowdownFocus / startShowdown / endShowdown (split from chain-moves.ts).
 */

import type {
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import {
  createInteractionState,
  endShowdown as endShowdownState,
  getActiveShowdown,
  getTurnState,
  isShowdownEnded,
  passFocus as passFocusState,
  startShowdown as startShowdownState,
} from "../../../chain";
import { fireTriggers } from "../../../abilities/trigger-runner";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { hasPlayerWon } from "../../win-conditions/victory";
import { applyScoreReplacement } from "../../../operations/scoring-rules";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * Pass focus during a showdown (rule 553.4)
 *
 * The focus player passes. If all relevant players pass,
 * the showdown ends.
 */
export const passShowdownFocus: Defs["passShowdownFocus"] = {
  condition: (state, context) => {
    if (state.pendingChoice) {
      return false;
    }
    const interaction = state.interaction ?? createInteractionState();
    // Rule 509.1: focus cannot pass while a chain is active on top of the
    // showdown — the chain must fully resolve first.
    if (interaction.chain?.active) {
      return false;
    }
    const activeShowdown = getActiveShowdown(interaction);
    if (!activeShowdown?.active) {
      return false;
    }
    return activeShowdown.focusPlayer === context.params.playerId;
  },
  enumerator: (state, context) => {
    if (state.pendingChoice) {
      return [];
    }
    const interaction = state.interaction ?? createInteractionState();
    if (interaction.chain?.active) {
      return [];
    }
    const activeShowdown = getActiveShowdown(interaction);
    if (!activeShowdown?.active) {
      return [];
    }
    if (activeShowdown.focusPlayer !== (context.playerId as string)) {
      return [];
    }
    return [{ playerId: context.playerId as string }];
  },
  reducer: (draft, context) => {
    if (!draft.interaction) {
      return;
    }

    const before = getActiveShowdown(draft.interaction);
    draft.interaction = passFocusState(draft.interaction);

    // If showdown ended (all passed), clean up.
    if (isShowdownEnded(draft.interaction)) {
      let conquerEvent: { type: "conquer"; playerId: string; battlefieldId: string } | undefined;
      const bf = before?.battlefieldId ? draft.battlefields[before.battlefieldId] : undefined;
      if (bf) {
        if (before?.isCombatShowdown) {
          // Rule 348.1 → resolveFullCombat becomes legal (Combat Damage Step).
          bf.showdownComplete = true;
        } else {
          // Rule 348.2 / 316.8.b / 466.5.a: Non-Combat Showdown close — mark
          // the battlefield's showdown complete so startShowdown does not
          // re-stage the same battlefield this turn.
          bf.showdownComplete = true;
          // Rule 348.2 / 181.4: a Non-Combat Showdown closing means no combat
          // is pending here — the battlefield is no longer Contested. Leaving
          // it set blocks endTurn and lets resolveFullCombat recall the
          // mover's own units.
          bf.contested = false;
          bf.contestedBy = undefined;
          // Rule 348.2.a: Non-Combat Showdown close — if only one player's
          // units remain and they don't already control it, they establish
          // Control. 348.2.a.1: this is a Conquer if not yet scored.
          const bfZone = `battlefield-${before!.battlefieldId}` as CoreZoneId;
          const owners = new Set<string>();
          for (const cid of context.zones.getCardsInZone(bfZone)) {
            const o = context.cards.getCardOwner(cid);
            if (o) owners.add(o as string);
          }
          if (owners.size === 1) {
            const solo = [...owners][0];
            if (bf.controller !== solo) {
              bf.controller = solo;
              if (!draft.conqueredThisTurn[solo]) draft.conqueredThisTurn[solo] = [];
              draft.conqueredThisTurn[solo].push(before!.battlefieldId);
              // Rule 348.2.a.1: this is a Conquer — emit the "conquer" event
              // (as conquerBattlefield / resolveFullCombat do) so [Hunt] and
              // "When you conquer" triggers fire.
              conquerEvent = {
                battlefieldId: before!.battlefieldId,
                playerId: solo,
                type: "conquer",
              };
              const scored = draft.scoredThisTurn[solo] ?? [];
              if (!scored.includes(before!.battlefieldId)) {
                const p = draft.players[solo];
                // Rule 571.4: a board `score` replacement (e.g. Otterpus) substitutes for the point.
                if (p && !applyScoreReplacement(draft, solo, context)) p.victoryPoints += 1;
                if (!draft.scoredThisTurn[solo]) draft.scoredThisTurn[solo] = [];
                draft.scoredThisTurn[solo].push(before!.battlefieldId);
                if (hasPlayerWon(draft, solo)) {
                  draft.status = "finished";
                  draft.winner = solo;
                  context.endGame?.({
                    metadata: { finalScore: p?.victoryPoints ?? 0, method: "conquer" },
                    reason: "victory_points",
                    winner: solo as CorePlayerId,
                  });
                }
              }
            }
          }
        }
      }
      draft.interaction = endShowdownState(draft.interaction);
      if (conquerEvent) {
        fireTriggers(conquerEvent, {
          cards: context.cards,
          counters: context.counters,
          draft,
          zones: context.zones,
        });
      }
    }
  },
};

/**
 * Start a showdown at a battlefield (rule 548)
 *
 * Triggered when a battlefield becomes contested.
 */
export const startShowdown: Defs["startShowdown"] = {
  condition: (state, context) => {
    if (state.status !== "playing") {
      return false;
    }
    if (state.pendingChoice) {
      return false;
    }
    // Rule 548: Starting a Showdown is a Discretionary Action, legal only
    // in a Neutral Open state (no chain, no showdown). Also blocks nested
    // showdowns — a second showdown cannot stack while one is already open.
    const interaction = state.interaction ?? createInteractionState();
    if (getTurnState(interaction) !== "neutral-open") {
      return false;
    }
    if (getActiveShowdown(interaction)?.active) {
      return false;
    }
    const bf = state.battlefields[context.params.battlefieldId];
    if (!bf) {
      return false;
    }
    // Rule 548: Showdowns begin when a battlefield is contested
    if (!bf.contested) {
      return false;
    }
    // Rule 348.1/465.2: once the Combat Showdown has closed, the remaining
    // combat steps are Outstanding — the same showdown cannot be reopened.
    if (bf.showdownComplete) {
      return false;
    }
    return true;
  },
  enumerator: (state, context) => {
    if (state.status !== "playing") {
      return [];
    }
    if (state.pendingChoice) {
      return [];
    }
    const interaction = state.interaction ?? createInteractionState();
    if (getTurnState(interaction) !== "neutral-open") {
      return [];
    }
    if (getActiveShowdown(interaction)?.active) {
      return [];
    }
    // Rule 548: Only contested battlefields can have showdowns
    const results: { playerId: string; battlefieldId: string }[] = [];
    for (const bfId of Object.keys(state.battlefields ?? {})) {
      const bf = state.battlefields[bfId];
      if (bf?.contested && !bf.showdownComplete) {
        results.push({ battlefieldId: bfId, playerId: context.playerId as string });
      }
    }
    return results;
  },
  reducer: (draft, context) => {
    const { playerId, battlefieldId } = context.params;
    const playerIds = Object.keys(draft.players);

    const bf = draft.battlefields[battlefieldId];
    const isCombat = bf?.contested ?? false;
    // Rule 464.2.c (Vendetta): Attacker = player who applied Contested;
    // Defender = the player who did NOT apply Contested (bf.controller when
    // set, otherwise the other player). Rule 550.2: non-combat → all players.
    const attacker = bf?.contestedBy ?? playerId;
    const defender =
      bf?.controller ?? playerIds.find((p) => p !== attacker) ?? undefined;
    const relevantPlayers =
      isCombat && defender ? [...new Set([attacker, defender])] : playerIds;

    const interaction = draft.interaction ?? createInteractionState();
    draft.interaction = startShowdownState(
      interaction,
      battlefieldId,
      playerId,
      relevantPlayers,
      isCombat,
      attacker,
      defender,
    );
  },
};

/**
 * End a showdown (rule 553.4.a)
 *
 * Called when all relevant players have passed focus.
 */
export const endShowdown: Defs["endShowdown"] = {
  condition: (state) => {
    if (state.pendingChoice) {
      return false;
    }
    const interaction = state.interaction ?? createInteractionState();
    const activeShowdown = getActiveShowdown(interaction);
    return activeShowdown?.active === false || isShowdownEnded(interaction);
  },
  enumerator: (state) => {
    if (state.pendingChoice) {
      return [];
    }
    const interaction = state.interaction ?? createInteractionState();
    if (!interaction.showdownStack?.length) {
      return [];
    }
    const activeShowdown = getActiveShowdown(interaction);
    if (activeShowdown?.active === false || isShowdownEnded(interaction)) {
      return [{}];
    }
    return [];
  },
  reducer: (draft) => {
    if (!draft.interaction) {
      return;
    }
    draft.interaction = endShowdownState(draft.interaction);
  },
};
