/**
 * invitePlayer move (split from chain-moves.ts).
 */

import type { GameMoveDefinitions } from "@tcg/core";
import { getActiveShowdown } from "../../../chain";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * Invite a non-relevant player into the current chain or showdown
 * (rule 528.3.a / 553.3).
 *
 * The inviter must themselves be a Relevant Player for the active
 * chain/showdown (since only relevant players take discretionary
 * actions). The invited player becomes Relevant for the remainder of
 * this chain/showdown and is appended to the rotation so they get
 * priority/focus after everyone ahead of them has passed.
 */
export const invitePlayer: Defs["invitePlayer"] = {
  condition: (state, context) => {
    if (state.status !== "playing") {
      return false;
    }
    if (state.pendingChoice) {
      return false;
    }
    const {interaction} = state;
    if (!interaction) {
      return false;
    }
    const activeShowdown = getActiveShowdown(interaction);
    const {chain} = interaction;
    // Must have either an active chain or an active showdown
    if (!chain?.active && !activeShowdown?.active) {
      return false;
    }
    const { playerId, invitedPlayerId } = context.params;
    if (playerId === invitedPlayerId) {
      return false;
    }
    if (!state.players[invitedPlayerId]) {
      return false;
    }
    // Inviter must be relevant in the current chain or showdown
    const chainRelevant = chain?.relevantPlayers ?? [];
    const showdownRelevant = activeShowdown?.relevantPlayers ?? [];
    const inviterRelevant =
      chainRelevant.includes(playerId) || showdownRelevant.includes(playerId);
    if (!inviterRelevant) {
      return false;
    }
    // Cannot invite someone already relevant
    if (chainRelevant.includes(invitedPlayerId)) {
      return false;
    }
    if (showdownRelevant.includes(invitedPlayerId)) {
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
    const {interaction} = state;
    if (!interaction) {
      return [];
    }
    const activeShowdown = getActiveShowdown(interaction);
    const {chain} = interaction;
    if (!chain?.active && !activeShowdown?.active) {
      return [];
    }
    const inviter = context.playerId as string;
    const chainRelevant = chain?.relevantPlayers ?? [];
    const showdownRelevant = activeShowdown?.relevantPlayers ?? [];
    const inviterRelevant =
      chainRelevant.includes(inviter) || showdownRelevant.includes(inviter);
    if (!inviterRelevant) {
      return [];
    }
    const results: { playerId: string; invitedPlayerId: string }[] = [];
    for (const pid of Object.keys(state.players)) {
      if (pid === inviter) {
        continue;
      }
      if (chainRelevant.includes(pid) || showdownRelevant.includes(pid)) {
        continue;
      }
      results.push({ invitedPlayerId: pid, playerId: inviter });
    }
    return results;
  },
  reducer: (draft, context) => {
    if (!draft.interaction) {
      return;
    }
    const { invitedPlayerId } = context.params;
    const activeShowdown = getActiveShowdown(draft.interaction);
    const {chain} = draft.interaction;

    // Append to chain's relevant players (rule 528.3.a)
    if (chain?.active) {
      const chainRelevant = chain.relevantPlayers;
      if (!chainRelevant.includes(invitedPlayerId)) {
        (
          chain as unknown as { relevantPlayers: string[] }
        ).relevantPlayers = [...chainRelevant, invitedPlayerId];
      }
    }

    // Append to the top-of-stack showdown's relevant players (rule 553.3)
    if (activeShowdown?.active) {
      const stack = draft.interaction.showdownStack;
      const topIdx = stack.length - 1;
      if (topIdx >= 0) {
        const sd = stack[topIdx];
        if (sd && !sd.relevantPlayers.includes(invitedPlayerId)) {
          (sd as unknown as { relevantPlayers: string[] }).relevantPlayers = [
            ...sd.relevantPlayers,
            invitedPlayerId,
          ];
        }
      }
    }
  },
};
