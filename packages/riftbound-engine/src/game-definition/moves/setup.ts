/**
 * Riftbound Setup Moves
 *
 * Moves for game setup: placing legends, champions, battlefields,
 * initializing decks, and drawing initial hands.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import type { PlayerId, RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../types";
import { applyBattlefieldPermanentEffects } from "../../operations/battlefield-setup-effects";
import { GAME_MODES } from "../../modes/game-modes";

/**
 * Put a setup card into a deck zone AND record its owner (rule 100.4: every
 * card in the game belongs to the player whose deck it started in).
 *
 * `zones.moveCard` alone leaves an unregistered card id with no `owner`, and
 * every owner-scoped read — deck size, `drawCards`, the Draw Phase's Burn Out
 * check (431.1) — then sees an empty deck for that player.
 */
function seedDeckCard(
  zones: unknown,
  cardId: string,
  zoneId: string,
  playerId: string | undefined,
): void {
  const ops = zones as {
    moveCard: (p: { cardId: CoreCardId; position?: "top" | "bottom"; targetZoneId: CoreZoneId }) => void;
    getCardZone?: (cardId: CoreCardId) => string | undefined;
    createCardInZone?: (p: {
      cardId: CoreCardId;
      definitionId: string;
      zoneId: CoreZoneId;
      ownerId: CorePlayerId;
      controllerId?: CorePlayerId;
      position?: "top" | "bottom" | number;
    }) => void;
  };
  const known = ops.getCardZone?.(cardId as CoreCardId) !== undefined;
  if (!known && playerId && typeof ops.createCardInZone === "function") {
    ops.createCardInZone({
      cardId: cardId as CoreCardId,
      controllerId: playerId as CorePlayerId,
      definitionId: cardId,
      ownerId: playerId as CorePlayerId,
      position: "bottom",
      zoneId: zoneId as CoreZoneId,
    });
    return;
  }
  ops.moveCard({
    cardId: cardId as CoreCardId,
    position: "bottom",
    targetZoneId: zoneId as CoreZoneId,
  });
}


/**
 * Setup move definitions
 */
export const setupMoves: Partial<
  GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>
> = {
  /**
   * Roll d20 for turn order determination (rule 115)
   *
   * Each player rolls once. After all players roll, the step advances to
   * "chooseFirst" and the roll winner is recorded in setup state.
   */
  rollForFirst: {
    condition: (state, context) => {
      const { playerId } = context.params;

      // Must be in setup phase
      if (state.status !== "setup" || !state.setup) {
        return false;
      }

      // Must be in the rollForFirst step
      if (state.setup.step !== "rollForFirst") {
        return false;
      }

      // Player cannot roll twice
      if (state.setup.rolls[playerId] !== undefined) {
        return false;
      }

      return true;
    },

    reducer: (draft, context) => {
      const { playerId } = context.params;

      if (!draft.setup) {
        return;
      }

      // Roll a d20 (1-20)
      const roll = context.rng.rollDice(20) as number;
      draft.setup.rolls[playerId] = roll;

      // Check if all players have rolled
      const playerIds = Object.keys(draft.players);
      const allRolled = playerIds.every((pid) => draft.setup!.rolls[pid] !== undefined);

      if (allRolled) {
        // Determine winner: the strictly highest roll wins.
        let winner = playerIds[0] ?? "";
        let highestRoll = draft.setup.rolls[winner] ?? 0;
        let tied = false;

        for (const pid of playerIds) {
          if (pid === winner) {
            continue;
          }
          const pidRoll = draft.setup.rolls[pid] ?? 0;
          if (pidRoll > highestRoll) {
            highestRoll = pidRoll;
            winner = pid;
            tied = false;
          } else if (pidRoll === highestRoll) {
            tied = true;
          }
        }

        if (tied) {
          // rule 115: turn order is decided by a fair random method — a tie for
          // the highest roll picks nobody, so every player rolls again.
          draft.setup.rolls = {};
          draft.setup.step = "rollForFirst";
          return;
        }

        draft.setup.rollWinner = winner as PlayerId;
        draft.setup.step = "chooseFirst";
      }
    },
  },

  /**
   * Roll winner chooses who goes first (rule 115.2)
   *
   * The player who won the roll decides which player goes first.
   * After this choice, the step advances to "placeLegends".
   */
  chooseFirstPlayer: {
    condition: (state, context) => {
      const { playerId } = context.params;

      // Must be in setup phase with chooseFirst step
      if (state.status !== "setup" || !state.setup) {
        return false;
      }

      if (state.setup.step !== "chooseFirst") {
        return false;
      }

      // Only the roll winner can choose
      if (state.setup.rollWinner !== playerId) {
        return false;
      }

      return true;
    },

    reducer: (draft, context) => {
      const { firstPlayerId } = context.params;

      if (!draft.setup) {
        return;
      }

      const playerIds = Object.keys(draft.players);
      const secondPlayerId = playerIds.find((pid) => pid !== firstPlayerId) ?? "";

      draft.setup.firstPlayer = firstPlayerId as PlayerId;
      draft.setup.secondPlayer = secondPlayerId as PlayerId;
      draft.setup.step = "placeLegends";
    },
  },

  /**
   * Select 1 battlefield from 3 options (rule 644.5)
   *
   * Each player keeps one battlefield and discards the other two.
   * Selected battlefields are placed in play during transitionToPlay.
   */
  selectBattlefield: {
    // rule 485.4.a / 485.5: a player picks exactly one of their three battlefields —
    // "only 1 will be used". A second selection by the same player is illegal.
    condition: (state, context) => {
      if (state.status !== "setup" || !state.setup) {
        return false;
      }
      const { playerId } = context.params;
      return state.setup.battlefieldChoices?.[playerId] === undefined;
    },

    reducer: (draft, context) => {
      const { playerId, battlefieldId, discardIds } = context.params;
      const { zones } = context;

      if (draft.setup) {
        draft.setup.battlefieldChoices ??= {};
        draft.setup.battlefieldChoices[playerId] = battlefieldId;
      }

      // Move selected battlefield to battlefield row
      zones.moveCard({
        cardId: battlefieldId as CoreCardId,
        targetZoneId: "battlefieldRow" as CoreZoneId,
      });

      // Initialize battlefield state
      draft.battlefields[battlefieldId] = {
        contested: false,
        controller: null,
        id: battlefieldId,
      };

      // rule 113 / 485.5 / 486.5: the unselected battlefields are SET ASIDE (removed
      // from the game), not trashed — trash is a public, countable zone and its cards
      // remain interactable.
      for (const discardId of discardIds) {
        zones.moveCard({
          cardId: discardId as CoreCardId,
          targetZoneId: "setAside" as CoreZoneId,
        });
      }
    },
  },

  /**
   * Place Champion Legend in Legend Zone
   *
   * The Champion Legend determines domain identity and stays in the Legend Zone
   * for the entire game. It cannot be removed, moved, or displaced.
   */
  placeLegend: {
    reducer: (_draft, context) => {
      const { legendId } = context.params;
      const { zones } = context;

      // Move legend from hand/staging to legend zone
      zones.moveCard({
        cardId: legendId as CoreCardId,
        targetZoneId: "legendZone" as CoreZoneId,
      });
    },
  },

  /**
   * Place Chosen Champion in Champion Zone
   *
   * The Chosen Champion is a Champion Unit that matches the Legend's tag.
   * It starts in the Champion Zone and can be played normally from there.
   */
  placeChampion: {
    reducer: (_draft, context) => {
      const { championId } = context.params;
      const { zones } = context;

      // Move champion from hand/staging to champion zone
      zones.moveCard({
        cardId: championId as CoreCardId,
        targetZoneId: "championZone" as CoreZoneId,
      });
    },
  },

  /**
   * Place battlefields in play
   *
   * Places the selected battlefields in the battlefield row.
   * Number of battlefields depends on game mode (2 for 1v1).
   */
  placeBattlefields: {
    reducer: (draft, context) => {
      const { battlefieldIds } = context.params;
      const { zones } = context;

      for (const battlefieldId of battlefieldIds) {
        // Move battlefield to battlefield row
        zones.moveCard({
          cardId: battlefieldId as CoreCardId,
          targetZoneId: "battlefieldRow" as CoreZoneId,
        });

        // Initialize battlefield state
        draft.battlefields[battlefieldId] = {
          contested: false,
          controller: null,
          id: battlefieldId,
        };
      }
    },
  },

  /**
   * Initialize main deck with cards
   *
   * Creates the main deck with the provided card IDs.
   * The deck should have at least 40 cards.
   */
  initializeMainDeck: {
    reducer: (_draft, context) => {
      const { cardIds, playerId } = context.params;
      const { zones } = context;

      // Add each card to the main deck, owned by this player.
      for (const cardId of cardIds) {
        seedDeckCard(zones, cardId as string, "mainDeck", playerId as string | undefined);
      }
    },
  },

  /**
   * Initialize rune deck
   *
   * Creates the rune deck with exactly 12 runes.
   */
  initializeRuneDeck: {
    reducer: (_draft, context) => {
      const { runeIds, playerId } = context.params;
      const { zones } = context;

      // Add each rune to the rune deck, owned by this player.
      for (const runeId of runeIds) {
        seedDeckCard(zones, runeId as string, "runeDeck", playerId as string | undefined);
      }
    },
  },

  /**
   * Shuffle both decks
   *
   * Shuffles the main deck and rune deck for a player.
   */
  shuffleDecks: {
    reducer: (_draft, context) => {
      const { playerId } = context.params;
      const { zones } = context;

      zones.shuffleZone("mainDeck" as CoreZoneId, playerId as CorePlayerId);
      zones.shuffleZone("runeDeck" as CoreZoneId, playerId as CorePlayerId);
    },
  },

  /**
   * Draw initial hand
   *
   * Draws 4 cards from the main deck to form the starting hand (Rule 116).
   */
  drawInitialHand: {
    // rule 116: the opening draw happens exactly once per player. A player who
    // already holds cards has drawn (or mulliganed) — drawing again is illegal.
    condition: (_state, context) => {
      const { playerId } = context.params;
      const hand = context.zones.getCardsInZone(
        "hand" as CoreZoneId,
        playerId as CorePlayerId,
      );
      return (hand?.length ?? 0) === 0;
    },

    reducer: (_draft, context) => {
      const { playerId } = context.params;
      const { zones } = context;

      // Draw 4 cards for initial hand (Rule 116)
      zones.drawCards({
        count: 4,
        from: "mainDeck" as CoreZoneId,
        playerId: playerId as CorePlayerId,
        to: "hand" as CoreZoneId,
      });
    },
  },

  /**
   * Mulligan (Rule 117)
   *
   * Player chooses up to 2 cards from their hand to set aside.
   * They draw that many replacements, then Recycle (return to
   * bottom of Main Deck) the set-aside cards.
   *
   * @param keepCards - Array of card IDs to keep (rest are mulliganed, max 2 returned)
   */
  mulligan: {
    // rule 117: mulligans are taken "in turn order" — the First Player goes
    // first and no later player may act until they have. A player also
    // mulligans only once.
    condition: (state, context) => {
      const playerId = context.params.playerId as string;

      // rule 117.1: the set-aside cards must be "cards in their hand" — a card
      // in any other zone, or another player's hand card, is not a legal choice
      // (hand is a shared zone, so the lookup is owner-scoped).
      const requested = (context.params.keepCards ?? []) as string[];

      // rule 117.1: "up to two" — naming more than two cards is not a legal
      // mulligan request; it is refused, never silently truncated.
      if (requested.length > 2) {
        return false;
      }

      if (requested.length > 0 && typeof context.zones?.getCardsInZone === "function") {
        const hand = new Set<string>(
          context.zones
            .getCardsInZone("hand" as CoreZoneId, playerId as CorePlayerId)
            .map((id) => id as string),
        );
        if (!requested.every((cardId) => hand.has(cardId))) {
          return false;
        }
      }

      const setup = state.setup;
      const first = setup?.firstPlayer;
      // rule 117: each player mulligans exactly once — a completed mulligan is
      // final, so no "London"-style chaining. This holds even before a First
      // Player is known, so it is checked ahead of the turn-order gate.
      const done = setup?.mulliganedBy ?? [];
      if (done.includes(playerId as never)) {
        return false;
      }
      if (!setup || first === undefined) {
        return true;
      }
      return playerId === first || done.includes(first);
    },

    reducer: (draft, context) => {
      const { playerId, keepCards = [] } = context.params;
      const { zones } = context;

      if (draft.setup) {
        draft.setup.mulliganedBy ??= [];
        if (!draft.setup.mulliganedBy.includes(playerId as never)) {
          draft.setup.mulliganedBy.push(playerId as never);
        }
      }

      // Cap at 2 cards returned (Rule 117.1)
      const toReturn = (keepCards as string[]).slice(0, 2);
      if (toReturn.length === 0) {
        return;
      } // Keeping entire hand

      // Set aside the selected cards (move to a temp holding — bottom of deck)
      // First draw replacements, then recycle
      const drawCount = toReturn.length;

      // Draw replacement cards first (Rule 117.2)
      zones.drawCards({
        count: drawCount,
        from: "mainDeck" as CoreZoneId,
        playerId: playerId as CorePlayerId,
        to: "hand" as CoreZoneId,
      });

      // Recycle the set-aside cards to bottom of Main Deck (Rule 117.3, 594)
      for (const cardId of toReturn) {
        zones.moveCard({
          cardId: cardId as CoreCardId,
          position: "bottom",
          targetZoneId: "mainDeck" as CoreZoneId,
        });
      }
    },
  },

  /**
   * Transition from setup to main game
   *
   * Sets game status to playing, configures first player and turn state,
   * and triggers the flow system to advance from setup to mainGame segment.
   * Also sets up first-turn rules (rule 644.7: second player channels extra rune).
   */
  transitionToPlay: {
    reducer: (draft, context) => {
      // Determine first player from setup state or fallback to first player ID
      const firstPlayer = (draft.setup?.firstPlayer ??
        Object.keys(draft.players)[0] ??
        "") as PlayerId;

      // Set up turn state for the start of play. The server bridge calls
      // ChannelRunes + drawCard explicitly after this move completes (see
      // Server.ts finalizePregame), so phase starts at "main".
      draft.turn = {
        activePlayer: firstPlayer,
        number: 1,
        phase: "main",
      };

      // Tell the flow system who the current player is
      context.flow?.setCurrentPlayer?.(firstPlayer as CorePlayerId);

      // Rule 644.7: the second player channels one extra rune on their first
      // Channel phase. Each non-first player's "first turn number" is set to
      // The turn they first become active (turn 2 in 1v1, turn 2/3/4 in FFA).
      // The first player is intentionally omitted from `firstTurnNumber` so
      // They never receive the catch-up bonus (they go first, so there is
      // Nothing to catch up from).
      //
      // The flow's channel phase reads `firstTurnNumber[playerId] === turnNumber`
      // To decide whether to grant the extra rune. For the first player this
      // Check returns `undefined === 1`, which is false, so no bonus fires.
      if (draft.setup?.secondPlayer) {
        draft.secondPlayerExtraRune = true;
        draft.firstTurnNumber = {};
        const playerIds = Object.keys(draft.players);
        // Order players by turn order (first player first), then assign each
        // Non-first player the turn on which they will first be active.
        const ordered = [firstPlayer, ...playerIds.filter((p) => p !== firstPlayer)];
        for (let i = 1; i < ordered.length; i++) {
          const pid = ordered[i];
          if (pid) {
            draft.firstTurnNumber[pid] = i + 1;
          }
        }

        // rule 487.7: in a multiplayer game only the LAST player in Turn Order
        // channels the extra rune — a player who is neither first nor last
        // channels the normal 2. In a duel the last player IS the second player,
        // so rule 644.7 is the same statement.
        draft.extraRunePlayerId = ordered[ordered.length - 1] as PlayerId;

        // rule 487.7: in the multiplayer modes the player going FIRST skips
        // their first Draw Phase entirely (they already act first).
        const mode =
          ordered.length >= 4
            ? Object.keys(draft.teams ?? {}).length > 0
              ? "magmaChamber"
              : "ffa4"
            : ordered.length === 3
              ? "ffa3"
              : "duel";
        if (GAME_MODES[mode].firstPlayerSkipsDraw) {
          draft.skipFirstDrawFor = firstPlayer;
        }
      }

      draft.status = "playing";
      draft.setup = undefined;

      // Apply permanent battlefield static effects (e.g. Aspirant's Climb
      // Victory-score modifier, Bandle Tree hidden-capacity bonus). Runs
      // Once now because the set of in-play battlefields is fixed after
      // Setup.
      applyBattlefieldPermanentEffects(draft);

      // Transition flow from setup segment to mainGame segment
      context.flow?.endSegment();
    },
  },
};
