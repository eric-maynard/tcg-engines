/**
 * Riftbound App Server
 *
 * Bun HTTP server that provides:
 * - Static file serving for the UI
 * - REST API for deck builder and game engine
 * - Card image proxy (serves downloaded images)
 * - User auth + saved decks (SQLite)
 *
 * This file is a thin entry point: it wires Bun.serve, tries each route
 * module in order (order matters — several routes are regex-matched), and
 * delegates WebSocket open/message/close to the lobby/game ws modules.
 * See ./server/* for the actual handlers.
 */

import type { ServerWebSocket } from "bun";
// Side-effect imports first: logger dirs, then card pool load (keeps the
// original startup log order).
import "./server/log";
import "./server/cards";
import { PORT } from "./server/config";
import { corsHeaders } from "./server/http";
import { handleLogRoutes } from "./server/log";
import { handleDeckBuilderRoutes } from "./server/decks";
import { handleCardRoutes } from "./server/routes-cards";
import { handleLobbyRoutes } from "./server/routes-lobby";
import { handleGameRoutes } from "./server/routes-game";
import { handleAuthRoutes } from "./server/routes-auth";
import { handleSavedDeckRoutes } from "./server/routes-deck";
import { handleImageRoutes, handleStaticRoutes } from "./server/routes-static";
import { handleLobbyUpgrade, lobbyWsClose, lobbyWsMessage, lobbyWsOpen } from "./server/ws-lobby";
import { gameWsClose, gameWsMessage, gameWsOpen, handleGameUpgrade } from "./server/ws-game";
import type { RouteCtx, RouteHandler, WsData } from "./server/state";

/**
 * Route modules, tried in the same order as the original monolithic if-chain.
 * Each returns a Response, or null if the path is not its own.
 */
const ROUTE_HANDLERS: RouteHandler[] = [
  // API: card catalogue (/api/cards, /api/config, /api/sets, /api/legends)
  handleCardRoutes,
  // API: deck builder sessions (/api/deck/*)
  handleDeckBuilderRoutes,
  // API: lobbies (/api/lobby/*)
  handleLobbyRoutes,
  // API: game engine (/api/game/*, incl. sandbox tutor)
  handleGameRoutes,
  // WebSocket upgrades (/ws/lobby/:id, /ws/game/:id)
  handleLobbyUpgrade,
  handleGameUpgrade,
  // Card image proxy (/images/*, /card-image/*)
  handleImageRoutes,
  // API: auth (/api/auth/*)
  handleAuthRoutes,
  // API: saved decks (/api/saved-decks*)
  handleSavedDeckRoutes,
  // API: game logs (/api/logs/:id, /api/archive-logs)
  handleLogRoutes,
  // Static pages + files (/login, /decks, /, /builder, /play/test, /play, public/*)
  handleStaticRoutes,
];

const server = Bun.serve({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders, status: 204 });
    }

    const ctx: RouteCtx = { server };
    for (const handler of ROUTE_HANDLERS) {
      const res = await handler(req, url, ctx);
      // `undefined` (successful ws upgrade) must be returned as-is; only
      // `null` means "not this handler's route".
      if (res !== null) {return res;}
    }

    return new Response("Not Found", { status: 404 });
  },

  // ========================================
  // WebSocket Handlers
  // ========================================
  websocket: {
    close(ws: ServerWebSocket<WsData>, code: number, reason: string) {
      // ---- Lobby disconnect ----
      if (ws.data.lobbyId) {
        lobbyWsClose(ws, code, reason);
        return;
      }
      // ---- Game disconnect ----
      gameWsClose(ws, code, reason);
    },

    message(ws: ServerWebSocket<WsData>, raw: string | Buffer) {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
      } catch {
        ws.send(JSON.stringify({ error: "Invalid JSON", type: "error" }));
        return;
      }

      // ---- Lobby messages ----
      if (ws.data.lobbyId) {
        lobbyWsMessage(ws, msg);
        return;
      }

      // ---- Game messages ----
      gameWsMessage(ws, msg);
    },

    open(ws: ServerWebSocket<WsData>) {
      // ---- Lobby connection ----
      if (ws.data.lobbyId) {
        lobbyWsOpen(ws);
        return;
      }
      // ---- Game connection ----
      gameWsOpen(ws);
    },
  },
});

console.log(`\nRiftbound App running at http://localhost:${PORT}`);
console.log(`  UI:  http://localhost:${PORT}/`);
console.log(`  Play: http://localhost:${PORT}/play`);
console.log(`  WS:  ws://localhost:${PORT}/ws/game/:id?player=X`);
console.log(`  API: http://localhost:${PORT}/api/cards`);

void server;
