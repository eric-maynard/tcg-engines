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
import { createInteractionState } from "../chain/chain-state";
import { getGlobalCardRegistry } from "./card-lookup";
import { recordDepartedOwner } from "./leave-board";
import { recordPublicReveal } from "./public-reveal";

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
    /** rule 652.3 — take a card out of the game entirely (absent in reduced harnesses). */
    removeCardFromGame?: (params: { cardId: CoreCardId }) => void;
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
  "battlefieldRow",
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
  // rule 652.2 — battlefields are NOT banished with the rest of the removed
  // player's cards: the slot stays on the board and is replaced in place by a
  // token battlefield below (652.2.a/652.2.b).
  const battlefieldIds = new Set<string>(Object.keys(draft.battlefields ?? {}));
  for (const zid of zoneIds) {
    const owned = zones.getCardsInZone(zid as CoreZoneId, playerId as CorePlayerId);
    for (const cid of owned) {
      if (battlefieldIds.has(cid as string)) {
        continue;
      }
      toBanish.push(cid);
    }
  }

  // rule 421.4 — a facedown card that changes zones is revealed by its owner to
  // all players. 652.1 banishes them on the way out, so the identity lands on
  // the shared public-reveal record (424.1) before 652.3 takes the card out of
  // the game and no zone can name it any more.
  for (const bfId of Object.keys(draft.battlefields ?? {})) {
    for (const cid of zones.getCardsInZone(`facedown-${bfId}` as CoreZoneId, playerId as CorePlayerId)) {
      recordPublicReveal({ draft }, playerId, [cid as string]);
    }
  }

  for (const cid of toBanish) {
    counters.clearAllCounters(cid);
    cards.updateCardMeta(cid, {
      buffed: false,
      combatMightModifier: 0,
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
    // rule 652.3 — "Remove all cards they own from the game": after the 652.1
    // banish the cards are not objects in any zone any more. Ownership survives
    // the object (rule 183) so later clauses can still read it.
    recordDepartedOwner(draft, cid as string, cards.getCardOwner(cid) as string | undefined);
    zones.removeCardFromGame?.({ cardId: cid });
  }

  // rule 652.2 / 652.2.a — the battlefield the removed player CONTRIBUTED (the
  // one they own), if it is in use, is REPLACED by a token battlefield with no
  // abilities. Ownership is what 652.2 keys on, not control: a battlefield of
  // theirs that an opponent has conquered is still the one they contributed,
  // and a battlefield they merely control belongs to someone else and only
  // loses its controller (below). The replacement is a definition swap in
  // place: the id stays, so the units and hidden cards there keep pointing at
  // the same slot and do not move (652.2.b), while the emptied ability list
  // ends any continuous effect the printed battlefield was applying (652.2.c)
  // and `isToken` makes it a real token — of the one card type that is never
  // "played" (rule 186 / 185.2.a, ruling 91af2468caa0cf8c).
  const registry = getGlobalCardRegistry();
  for (const [bfId, bf] of Object.entries(draft.battlefields ?? {})) {
    if (cards.getCardOwner(bfId as CoreCardId) === (playerId as CorePlayerId)) {
      const printed = registry.get(bfId);
      registry.register(bfId, {
        ...(printed ?? { cardType: "battlefield", id: bfId, name: "Battlefield" }),
        abilities: [],
        isToken: true,
      });
    }
    // rule 652.1 — every permanent they controlled is banished, so a
    // battlefield they controlled has no unit of theirs left to hold it.
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

  // rule 651.3 — the removed player is no longer a Relevant Player anywhere.
  // Stamping the set on the interaction is what keeps every LATER rotation
  // honest: `chain-state.ts eligibleSeats` reads it, so a chain opened after
  // the removal never seats them even though the callers of `addToChain` build
  // their turn order from the full player registry.
  if (draft.interaction === undefined) {
    (draft as { interaction?: unknown }).interaction = createInteractionState();
  }
  const { interaction } = draft;
  (interaction as { removedPlayers?: string[] }).removedPlayers = [...removed];

  // Rule 652.4: Counter all chain items whose controller is the removed
  // Player. We flag them as countered so the chain resolver will skip
  // Their effects when they pop.
  if (interaction?.chain) {
    for (const item of interaction.chain.items) {
      if (item.controller === playerId) {
        (item as { countered?: boolean }).countered = true;
      }
    }
    // Rule 652.5.c.1: If the removed player held chain priority,
    // Advance it to the next turn-order entry that is still present.
    // The chain interaction types declare these fields as readonly on the
    // Public surface; we're mutating an Immer draft so a narrow cast is
    // Safe.
    const chainMutable = interaction.chain as {
      activePlayer: string;
      turnOrder: string[];
      passedPlayers: string[];
      relevantPlayers: string[];
    };
    const order = [...chainMutable.turnOrder];
    const heldPriority = chainMutable.activePlayer === playerId;
    chainMutable.turnOrder = order.filter((p) => p !== playerId);
    chainMutable.passedPlayers = chainMutable.passedPlayers.filter(
      (p) => p !== playerId,
    );
    chainMutable.relevantPlayers = chainMutable.relevantPlayers.filter(
      (p) => p !== playerId,
    );
    if (heldPriority) {
      // rule 652.5.c.1 — Priority goes to the NEXT Relevant Player in order
      // after the one who left, not back to the head of the seat list; and
      // 652.5.c.2 — if everyone still Relevant has already passed, nobody
      // holds Priority and the top item resolves.
      chainMutable.activePlayer = nextInOrder(
        order,
        playerId,
        (p) => chainMutable.relevantPlayers.includes(p) && !chainMutable.passedPlayers.includes(p),
      );
    }
  }

  // Rule 652.5.b: Same handling for showdown focus stack.
  if (interaction?.showdownStack && interaction.showdownStack.length > 0) {
    for (const showdown of interaction.showdownStack) {
      const mutable = showdown as {
        relevantPlayers: string[];
        passedPlayers: string[];
        focusPlayer: string;
        focusOrder?: string[];
        active: boolean;
      };
      // rule 652.5.b.1 — Focus goes to the NEXT player in order after the
      // removed one, not back to the head of the list (a player who may have
      // already passed this round). rule 347.2.b — the order Focus walks is
      // the full turn-order rotation stamped on the showdown, not only its
      // participants; fall back to the participants when it is absent.
      const order = [...(mutable.focusOrder ?? mutable.relevantPlayers)];
      mutable.relevantPlayers = mutable.relevantPlayers.filter((p) => p !== playerId);
      mutable.passedPlayers = mutable.passedPlayers.filter((p) => p !== playerId);
      if (mutable.focusOrder !== undefined) {
        mutable.focusOrder = mutable.focusOrder.filter((p) => p !== playerId);
      }
      if (mutable.focusPlayer === playerId) {
        mutable.focusPlayer = nextInOrder(order, playerId, (p) => p !== playerId);
      }
      // rule 652.5.b.2 — if no Relevant Player remains, the showdown ends.
      // rule 652.5.b.3 — so does a removal that leaves everyone still in it
      // already Passed: there is nobody left to break the sequence.
      const remainingFocus = order.filter((p) => p !== playerId);
      const allPassed =
        remainingFocus.length > 0 &&
        remainingFocus.every((p) => mutable.passedPlayers.includes(p));
      if (mutable.relevantPlayers.length === 0 || allPassed) {
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
    // rule 652.5.a.1 — "play proceeds in Turn Order to the NEXT available
    // player": the successor of the seat that left, not the head of the
    // registry. With two players those are the same seat, which is why this
    // only ever mattered from three seats up.
    const seats = seatOrder(draft);
    const remaining = new Set(getActivePlayers(draft, removed));
    const next = nextInOrder(seats, playerId, (p) => remaining.has(p as PlayerId));
    if (next !== "") {
      (draft.turn as { activePlayer: PlayerId }).activePlayer = next as PlayerId;
    }
  }

  return getActivePlayers(draft, removed);
}

/**
 * Seat order for a game: the player registry, rotated so the player who took
 * the first turn leads it when that is recorded (rule 510 / 734).
 */
function seatOrder(state: RiftboundGameState): string[] {
  const ids = Object.keys(state.players);
  const first = state.setup?.firstPlayer;
  return first !== undefined && ids.includes(first)
    ? [first, ...ids.filter((p) => p !== first)]
    : ids;
}

/**
 * The first entry strictly AFTER `from` in `order` (wrapping) that satisfies
 * `accept`, or `""` when none does. `from` itself is never returned.
 *
 * Every "who acts next" clause of rule 652.5 is this walk: turn (652.5.a.1),
 * Focus (652.5.b.1) and Priority (652.5.c.1) all resume at the seat after the
 * one that left rather than at the head of the list.
 */
function nextInOrder(
  order: readonly string[],
  from: string,
  accept: (playerId: string) => boolean,
): string {
  const at = order.indexOf(from);
  for (let step = 1; step <= order.length; step += 1) {
    const candidate = order[(at + step) % order.length];
    if (candidate !== undefined && candidate !== from && accept(candidate)) {
      return candidate;
    }
  }
  return "";
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
