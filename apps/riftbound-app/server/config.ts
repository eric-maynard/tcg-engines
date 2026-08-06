/**
 * Server-wide constants and env handling.
 */

import * as path from "node:path";

/** apps/riftbound-app/ — the directory containing server.ts */
export const APP_DIR = path.join(import.meta.dir, "..");

/** Sets that belong to each game version. Preview is a superset of standard. */
export const STANDARD_SETS = new Set(["OGN", "OGS", "SFD"]);
export const PREVIEW_SETS = new Set(["OGN", "OGS", "SFD", "UNL"]);

/**
 * Moves the server drives on behalf of the flow (channel/draw/ready/etc).
 * A client that sends one of these can act on the opponent or grant itself
 * resources — the engine's `directed:true` param is client-suppliable and is
 * NOT an authorization boundary. Reject these in the ws "move" handler.
 */
export const SERVER_ONLY_MOVES = new Set([
  "channelRunes",
  "emptyRunePool",
  "readyAll",
  "drawCard",
  "advancePhase",
  "clearDamage",
  "initializeMainDeck",
  "initializeRuneDeck",
  "shuffleDecks",
  "drawInitialHand",
  "placeBattlefields",
  "placeLegend",
  "placeChampion",
  "transitionToPlay",
  "scorePoint",
  "removePlayer",
]);

export const PORT = Number(process.env.PORT) || 3000;
export const STATIC_DIR = path.join(APP_DIR, "public");
export const IMAGES_DIR = path.join(APP_DIR, "../../downloads/card-images");
export const SANDBOX_ENABLED = process.env.SANDBOX_ENABLED === "true";
export const SETS_DIR = path.join(APP_DIR, "../../packages/riftbound-cards/src/data/sets");
