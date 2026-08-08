/**
 * Lobby WebSocket: upgrade route + open/message/close handlers.
 */

import type { ServerWebSocket } from "bun";
import { loadDeckConfig } from "./decks";
import { json } from "./http";
import { gameLogger } from "./log";
import { createGameFromDecks } from "./pregame";
import { type RouteCtx, type RouteResult, type WsData, broadcastLobby, gameSessions, lobbies } from "./state";

// GET /ws/lobby/:id?role=host|guest — upgrade to lobby WebSocket
export async function handleLobbyUpgrade(req: Request, url: URL, ctx: RouteCtx): RouteResult {
  const { pathname } = url;
  const { server } = ctx;

  if (pathname.match(/^\/ws\/lobby\/[^/]+$/)) {
    const upgradeHdr = req.headers.get("upgrade");
    const lobbyId = pathname.split("/")[3];
    console.log(`[WS] /ws/lobby/${lobbyId} upgrade='${upgradeHdr}' host='${req.headers.get("host")}' ua='${(req.headers.get("user-agent")||"").slice(0,40)}'`);
    if (upgradeHdr?.toLowerCase() !== "websocket") {
      return json({ error: "Expected WebSocket upgrade", got: upgradeHdr }, 426);
    }
    const role = url.searchParams.get("role") as "host" | "guest" ?? "host";
    const lobby = lobbies.get(lobbyId);
    if (!lobby) {console.log(`[WS] lobby ${lobbyId} not found (have ${lobbies.size})`); return json({ error: "Lobby not found" }, 404);}

    const connId = crypto.randomUUID();
    const upgraded = server.upgrade<WsData>(req, {
      data: { connId, gameId: "", lobbyId, lobbyRole: role, playerId: "" },
    });
    if (!upgraded) {
      return new Response("WebSocket upgrade failed", { status: 500 });
    }
    return undefined as unknown as Response;
  }

  return null;
}

export function lobbyWsClose(ws: ServerWebSocket<WsData>, _code: number, _reason: string): void {
  const lobby = lobbies.get(ws.data.lobbyId!);
  if (lobby) {
    if (ws.data.lobbyRole === "host") {lobby.host.ws = null;}
    if (ws.data.lobbyRole === "guest" && lobby.guest) {lobby.guest.ws = null;}
    console.log(`Lobby WS: ${ws.data.lobbyRole} disconnected from ${lobby.code}`);
  }
}

export function lobbyWsMessage(ws: ServerWebSocket<WsData>, msg: Record<string, unknown>): void {
  const lobby = lobbies.get(ws.data.lobbyId!);
  if (!lobby) {return;}
  const role = ws.data.lobbyRole;
  const player = role === "host" ? lobby.host : lobby.guest;

  if (msg.type === "select_deck" && player) {
    player.deckId = msg.deckId as string;
    player.ready = Boolean(msg.deckId);
    broadcastLobby(lobby);
  }

  if (msg.type === "set_mode") {
    lobby.gameMode = msg.mode === "match" ? "match" : "duel";
    broadcastLobby(lobby);
  }

  // W11: Promote the lobby to Single Player (Goldfish) mode.
  // This is a first-class lobby mode and is NOT gated by
  // SANDBOX_ENABLED — that env flag still governs the legacy
  // Goldfish button / direct sandbox lobby creation path.
  // Only the host may toggle this, and only while the lobby is waiting.
  if (msg.type === "set_single_player" && role === "host" && lobby.status === "waiting") {
    const enable = msg.enabled !== false;
    if (enable) {
      lobby.sandbox = true;
      // Fill the opponent slot with a labeled Goldfish if empty.
      // If a human already joined, leave them in place — the host
      // Can kick them out by leaving the lobby.
      if (!lobby.guest) {
        lobby.guest = {
          connId: "",
          deckId: "default",
          name: "Goldfish",
          ready: true,
          ws: null,
        };
      }
    } else {
      // Demote back to a regular lobby: clear sandbox and drop
      // The auto-filled Goldfish guest if it's still there.
      lobby.sandbox = false;
      if (lobby.guest && lobby.guest.ws === null && lobby.guest.name === "Goldfish") {
        lobby.guest = null;
      }
    }
    broadcastLobby(lobby);
  }

  if (msg.type === "start_game" && role === "host" && lobby.guest && lobby.host.ready && lobby.guest.ready) {
    // D20 roll to determine who CHOOSES first player (rule 115)
    let p1Roll = 0;
    let p2Roll = 0;
    if (lobby.sandbox) {
      // In goldfish mode, rig so the host always wins (goldfish can't choose)
      p1Roll = 20;
      p2Roll = Math.floor(Math.random() * 19) + 1;
    } else {
      // Reroll on tie
      do {
        p1Roll = Math.floor(Math.random() * 20) + 1;
        p2Roll = Math.floor(Math.random() * 20) + 1;
      } while (p1Roll === p2Roll);
    }
    const flipWinner = p1Roll > p2Roll ? "player-1" : "player-2";
    lobby.coinFlip = { firstPlayer: "", p1Roll, p2Roll, winner: flipWinner };
    broadcastLobby(lobby);
  }

  // Flip winner chooses who goes first (rule 115)
  if (msg.type === "choose_first") {
    console.log("[Lobby] choose_first received:", { choice: msg.choice, coinFlip: lobby.coinFlip, role });
    if (!lobby.coinFlip || lobby.coinFlip.firstPlayer) {
      console.log("[Lobby] choose_first rejected: no coinFlip or already chosen");
      return;
    }
    const winnerRole = lobby.coinFlip.winner === "player-1" ? "host" : "guest";
    console.log("[Lobby] winnerRole:", winnerRole, "senderRole:", role);
    if (role !== winnerRole) { console.log("[Lobby] choose_first rejected: not winner"); return; }

    const chosen = msg.choice === "opponent"
      ? (role === "host" ? "player-2" : "player-1")
      : (role === "host" ? "player-1" : "player-2");
    lobby.coinFlip = { ...lobby.coinFlip, firstPlayer: chosen };

    // NOW start the game with the chosen first player
    const deck1 = loadDeckConfig(lobby.host.deckId);
    const deck2 = loadDeckConfig(lobby.guest.deckId);

    const gameId = crypto.randomUUID();
    const session = createGameFromDecks(deck1, deck2, undefined, {
      firstPlayer: chosen,
      gameMode: lobby.gameMode,
      initiativeRoll: {
        p1Roll: lobby.coinFlip.p1Roll,
        p2Roll: lobby.coinFlip.p2Roll,
        winner: lobby.coinFlip.winner,
      },
      names: {
        "player-1": lobby.host.name,
        "player-2": lobby.guest?.name ?? "Player 2",
      },
      sandbox: lobby.sandbox,
    });
    // Hand the solo opponent driver (Claude seat) over to the game session.
    if (lobby.opponent) {
      session.opponent = lobby.opponent;
      (lobby.opponent as { gameId?: string }).gameId = gameId;
      lobby.opponent = undefined;
    }
    gameSessions.set(gameId, session);
    gameLogger.logGameCreated(gameId, session.players, lobby.gameMode, "random", {
      firstPlayer: chosen,
      flipWinner: lobby.coinFlip.winner,
      guestDeckId: lobby.guest?.deckId,
      hostDeckId: lobby.host.deckId,
      lobbyCode: lobby.code,
      opponent: session.opponent ? `claude:${session.opponent.info.model ?? "?"}` : "goldfish",
      sandbox: lobby.sandbox,
      source: "lobby",
    });
    lobby.gameId = gameId;
    lobby.status = "started";
    broadcastLobby(lobby);
  }

  if (msg.type === "ping") {
    ws.send(JSON.stringify({ type: "pong" }));
  }
}

export function lobbyWsOpen(ws: ServerWebSocket<WsData>): void {
  const { connId, lobbyId, lobbyRole } = ws.data;
  const lobby = lobbies.get(lobbyId!);
  if (!lobby) { ws.close(4004, "Lobby not found"); return; }

  if (lobbyRole === "host") {
    lobby.host.connId = connId;
    lobby.host.ws = ws;
  } else if (lobbyRole === "guest" && lobby.guest) {
    lobby.guest.connId = connId;
    lobby.guest.ws = ws;
  }
  console.log(`Lobby WS: ${lobbyRole} connected to ${lobby.code}`);
  broadcastLobby(lobby);
}
