/**
 * Riftbound Game Definition
 *
 * The main game definition implementing GameDefinition<TState, TMoves>.
 * This is a tabletop simulator - moves handle card manipulation without rule validation.
 */

import type { GameDefinition } from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../types";
import { createPlayerView } from "../views/player-view";
import { riftboundZones } from "../zones/zone-configs";
import { riftboundFlow } from "./flow/riftbound-flow";
import { riftboundMoves } from "./moves";
import { createInitialState } from "./setup/game-setup";
import { hasPlayerWon } from "./win-conditions/victory";

/**
 * Re-export RiftboundMoves from types for convenience
 */
export type { RiftboundMoves } from "../types";

/**
 * Riftbound game definition
 *
 * Complete game definition with all manual moves for the tabletop simulator.
 */
export const riftboundDefinition: GameDefinition<
  RiftboundGameState,
  RiftboundMoves,
  unknown,
  RiftboundCardMeta
> = {
  name: "Riftbound TCG",

  setup: createInitialState,

  moves: riftboundMoves,

  zones: riftboundZones,

  flow: riftboundFlow,

  trackers: {
    perPlayer: true,
    perTurn: ["hasChanneled", "hasDrawn"],
  },

  // Win condition based on victory points
  endIf: (state) => {
    for (const playerId of Object.keys(state.players)) {
      if (hasPlayerWon(state, playerId)) {
        return {
          reason: "victory_points",
          winner: playerId,
        };
      }
    }
    return undefined;
  },

  // Player view - in tabletop simulator, most info is public
  // Only hide opponent's hand and facedown cards
  playerView: (state, playerId) => createPlayerView(state, playerId),
};
