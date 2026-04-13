/**
 * Player Removal Pipeline (rules 651-652).
 *
 * When a player is removed from the game (via concede, repeated burn-out,
 * or a future "removed from the game" effect), this pipeline performs the
 * rule-mandated cleanup:
 *
 *   - Rule 652.1: Banish every permanent the removed player controls and
 *     every rune/card they own.
 *   - Rule 652.2: Redistribute battlefields they controlled to the
 *     uncontrolled state.
 *   - Rule 652.4: Counter all chain items whose controller is the removed
 *     player.
 *   - Rule 652.5.a: If the removed player was the turn player, advance
 *     the turn to the next non-removed player. The caller is responsible
 *     for wiring the actual flow transition when needed; this function
 *     updates `state.turn.activePlayer` so reads reflect reality.
 *   - Rule 652.5.b / 652.5.c: If the removed player held Focus or
 *     Priority on an active showdown/chain, advance it past them.
 *
 * The function operates on an `Immer` draft so callers in move reducers
 * can invoke it directly with their `context.draft` and context APIs.
 *
 * NOTE: The pipeline is intentionally conservative about which zones it
 * scans — it walks a known list of non-shared zones plus every
 * `battlefield-*` zone that appears on the draft. This matches the
 * engine's fixed zone catalog in `riftbound-operations.ts`.
 */

import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import type { PlayerId, RiftboundCardMeta, RiftboundGameState } from "../types/game-state";

/**
 * Context APIs the removal pipeline needs. Mirrors the move-reducer
 * context shape so the pipeline can be invoked from `concede` and
 * `burnOut` reducers directly.
 */
export interface PlayerRemovalContext {
  /** Live Immer draft of the game state. */
  draft: RiftboundGameState;

  zones: {
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
    moveCard: (args: {
      cardId: CoreCardId;
      targetZoneId: CoreZoneId;
      position?: "top" | "bottom";
    }) => void;
  };

  cards: {
    getCardOwner: (cardId: CoreCardId) => CorePlayerId | undefined;
    updateCardMeta: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void;
  };

  counters: {
    clearAllCounters: (cardId: CoreCardId) => void;
  };
}

/**
 * Zones scanned during removal. Shared/global zones such as
 * `battlefieldRow` and `banishment` are intentionally omitted because
 * they either hold shared cards or are the destination of the pipeline.
 */
const PLAYER_SCOPED_ZONES: readonly string[] = [
  "base",
  "hand",
  "trash",
  "mainDeck",
  "runeDeck",
  "runePool",
  "legendZone",
  "championZone",
];

/**
 * Remove a player from the game and run the 652.x cleanup pipeline.
 *
 * Returns the list of remaining (non-removed) player IDs in their
 * original turn order.
 *
 * This function is idempotent: calling it on an already-removed player
 * is a no-op and returns the current list of active players.
 */
export function removePlayer(
  ctx: PlayerRemovalContext,
  playerId: PlayerId,
): PlayerId[] {
  const { draft, zones, cards, counters } = ctx;

  // Build current removed-player set. `removedPlayers` is readonly on the
  // RiftboundGameState public shape; we narrow it to a mutable array here
  // Since we're operating on an Immer draft.
  const removedDraft = draft as unknown as {
    removedPlayers?: PlayerId[];
  };
  const removed = new Set<PlayerId>(removedDraft.removedPlayers ?? []);

  if (removed.has(playerId)) {
    return getActivePlayers(draft, removed);
  }

  removed.add(playerId);
  removedDraft.removedPlayers = [...removed];

  // Rule 652.1 / 652.3: Banish every card the removed player owns.
  // Walk the fixed per-player zones plus every battlefield-* zone on the
  // Draft. We cannot enumerate zones from the public APIs, so we scan
  // The known static list plus the derived battlefield zones.
  const zoneIds: string[] = [...PLAYER_SCOPED_ZONES];
  for (const bfId of Object.keys(draft.battlefields ?? {})) {
    zoneIds.push(`battlefield-${bfId}`);
    zoneIds.push(`facedown-${bfId}`);
  }

  // Collect all owned cards first; then banish. We avoid mutating a zone
  // While iterating its ids.
  const toBanish: CoreCardId[] = [];
  for (const zid of zoneIds) {
    const owned = zones.getCardsInZone(zid as CoreZoneId, playerId as CorePlayerId);
    for (const cid of owned) {
      toBanish.push(cid);
    }
  }

  for (const cid of toBanish) {
    counters.clearAllCounters(cid);
    cards.updateCardMeta(cid, {
      buffed: false,
      combatRole: null,
      damage: 0,
      equippedWith: undefined,
      exhausted: false,
      grantedKeywords: undefined,
      hidden: false,
      mightModifier: 0,
      staticMightBonus: 0,
      stunned: false,
    } as Partial<RiftboundCardMeta>);
    zones.moveCard({
      cardId: cid,
      targetZoneId: "banishment" as CoreZoneId,
    });
  }

  // Rule 652.2: Battlefields previously controlled by the removed player
  // Revert to an uncontrolled state. Rule 652.2.a would replace them with
  // A token battlefield with no abilities — the engine does not yet model
  // Dynamic battlefield creation, so the closest rule-compliant fallback
  // Is to flip the controller to `null` so no one scores from it.
  for (const bf of Object.values(draft.battlefields ?? {})) {
    if (bf.controller === playerId) {
      bf.controller = null;
      bf.contested = false;
      bf.contestedBy = undefined;
    }
    if (bf.contestedBy === playerId) {
      bf.contestedBy = undefined;
      bf.contested = false;
    }
  }

  // Clear the removed player's rune pool (rule 652.1 covers runes they
  // Own; the conceptual reserve is wiped too).
  if (draft.runePools?.[playerId]) {
    draft.runePools[playerId].energy = 0;
    draft.runePools[playerId].power = {};
  }

  // Rule 652.4: Counter all chain items whose controller is the removed
  // Player. We flag them as countered so the chain resolver will skip
  // Their effects when they pop.
  const {interaction} = draft;
  if (interaction?.chain) {
    for (const item of interaction.chain.items) {
      if (item.controller === playerId) {
        (item as { countered?: boolean }).countered = true;
      }
    }
    // Rule 652.5.c.1: If the removed player held chain priority,
    // Advance it to the next turn-order entry that is still present.
    if (interaction.chain.activePlayer === playerId) {
      const remaining = interaction.chain.turnOrder.filter((p) => p !== playerId);
      interaction.chain.turnOrder = remaining;
      interaction.chain.activePlayer = remaining[0] ?? "";
      interaction.chain.passedPlayers = interaction.chain.passedPlayers.filter(
        (p) => p !== playerId,
      );
    } else {
      // Drop from the turn order regardless so subsequent rotations skip.
      interaction.chain.turnOrder = interaction.chain.turnOrder.filter(
        (p) => p !== playerId,
      );
      interaction.chain.passedPlayers = interaction.chain.passedPlayers.filter(
        (p) => p !== playerId,
      );
    }
    interaction.chain.relevantPlayers = interaction.chain.relevantPlayers.filter(
      (p) => p !== playerId,
    );
  }

  // Rule 652.5.b: Same handling for showdown focus stack.
  if (interaction?.showdownStack && interaction.showdownStack.length > 0) {
    for (const showdown of interaction.showdownStack) {
      const mutable = showdown as {
        relevantPlayers: string[];
        passedPlayers: string[];
        focusPlayer: string;
        active: boolean;
      };
      mutable.relevantPlayers = mutable.relevantPlayers.filter((p) => p !== playerId);
      mutable.passedPlayers = mutable.passedPlayers.filter((p) => p !== playerId);
      if (mutable.focusPlayer === playerId) {
        mutable.focusPlayer = mutable.relevantPlayers[0] ?? "";
      }
      // If no relevant players remain, end the showdown.
      if (mutable.relevantPlayers.length === 0) {
        mutable.active = false;
      }
    }
    // Drop inactive showdowns from the stack.
    interaction.showdownStack = interaction.showdownStack.filter((s) => s.active);
  }

  // Rule 652.5.a.1: If the removed player was the active/turn player,
  // Advance the turn indicator to the next non-removed player in the
  // Player registry order. Callers that drive the flow manager should
  // Follow up with a proper turn transition; we patch the state so
  // Any test or consumer reading `state.turn.activePlayer` sees the
  // Correct next player.
  if (draft.turn.activePlayer === playerId) {
    const remaining = getActivePlayers(draft, removed);
    if (remaining.length > 0) {
      (draft.turn as { activePlayer: PlayerId }).activePlayer =
        remaining[0] as PlayerId;
    }
  }

  return getActivePlayers(draft, removed);
}

/**
 * Return the list of player ids that are still active (not in
 * `removedPlayers`) in deterministic player-order.
 */
export function getActivePlayers(
  state: RiftboundGameState,
  removedOverride?: Set<PlayerId>,
): PlayerId[] {
  const removed = removedOverride ?? new Set<PlayerId>(state.removedPlayers ?? []);
  return Object.keys(state.players).filter(
    (pid) => !removed.has(pid as PlayerId),
  ) as PlayerId[];
}

/**
 * Return `true` if `playerId` has been removed from the game.
 */
export function isPlayerRemoved(
  state: RiftboundGameState,
  playerId: PlayerId,
): boolean {
  return (state.removedPlayers ?? []).includes(playerId);
}
