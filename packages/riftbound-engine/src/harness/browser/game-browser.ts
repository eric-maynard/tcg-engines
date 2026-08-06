/**
 * L2 over the browser: wrap a BrowserBackend in the ordinary `Game` /
 * `SeatHandle` API.
 *
 * `Game` was written against EngineBackend; BrowserBackend provides the same
 * surface structurally (`activate()`, a read-only `engine` façade over the UI
 * snapshot, `hasCard`, `raw`, `violations`, `transcript`), so the whole verb
 * vocabulary (play/cast/tapRune/endTurn/answer/settle/advanceTurn/state/…)
 * runs unchanged against the live app. Engine-only pieces: `game.engine` is
 * read-only (no executeMove), invariants are not evaluated, `stateHash()` is a
 * snapshot hash (not comparable with EngineBackend's).
 */

import type { EngineBackend } from "../engine-backend";
import { Game } from "../game";
import { BrowserBackend } from "./browser-backend";
import type { BrowserLaunchOptions } from "./browser-backend";

/** Wrap an already-launched BrowserBackend. */
export function attachBrowserGame(backend: BrowserBackend): Game {
  return new Game(backend as unknown as EngineBackend);
}

/** Launch (or attach to) a browser game and return the L2 `Game`. */
export async function launchBrowserGame(opts: BrowserLaunchOptions = {}): Promise<Game> {
  const backend = await BrowserBackend.launch(opts);
  return attachBrowserGame(backend);
}

/** The BrowserBackend behind a Game created by launchBrowserGame / Game.fromBrowser (else undefined). */
export function browserBackendOf(game: Game): BrowserBackend | undefined {
  const b = game.backend as unknown;
  return b instanceof BrowserBackend ? b : undefined;
}
