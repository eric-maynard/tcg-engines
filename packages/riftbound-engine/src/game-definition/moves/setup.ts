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
        // Determine winner (highest roll wins; ties go to first player alphabetically)
        let winner = playerIds[0] ?? "";
        let highestRoll = draft.setup.rolls[winner] ?? 0;

        for (const pid of playerIds) {
          const pidRoll = draft.setup.rolls[pid] ?? 0;
          if (pidRoll > highestRoll) {
            highestRoll = pidRoll;
            winner = pid;
          }
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
    reducer: (draft, context) => {
      const { battlefieldId, discardIds } = context.params;
      const { zones } = context;

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

      // Discard the unchosen battlefields
      for (const discardId of discardIds) {
        zones.moveCard({
          cardId: discardId as CoreCardId,
          targetZoneId: "trash" as CoreZoneId,
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
      const { cardIds } = context.params;
      const { zones } = context;

      // Add each card to the main deck
      for (const cardId of cardIds) {
        zones.moveCard({
          cardId: cardId as CoreCardId,
          position: "bottom",
          targetZoneId: "mainDeck" as CoreZoneId,
        });
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
      const { runeIds } = context.params;
      const { zones } = context;

      // Add each rune to the rune deck
      for (const runeId of runeIds) {
        zones.moveCard({
          cardId: runeId as CoreCardId,
          position: "bottom",
          targetZoneId: "runeDeck" as CoreZoneId,
        });
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
    reducer: (_draft, context) => {
      const { playerId, keepCards = [] } = context.params;
      const { zones } = context;

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
