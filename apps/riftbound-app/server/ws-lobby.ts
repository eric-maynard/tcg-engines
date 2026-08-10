/**
 * Lobby WebSocket: upgrade route + open/message/close handlers.
 */

import type { ServerWebSocket } from "bun";
import { summarizeLegality } from "./deck-rules";
import { deckLegalityForId, loadDeckConfig } from "./decks";
import { json } from "./http";
import { gameLogger } from "./log";
import { maySelectDeck, parseOpponentDeck, syncOpponentSeatDeck } from "./opponent-deck";
import { createGameFromDecks } from "./pregame";
import { getUserIdFromRequest } from "./routes-auth";
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
    // The session cookie rides on the upgrade request: remember WHO this socket
    // is so deck picks can be checked against ownership (never trust a deck id alone).
    const upgraded = server.upgrade<WsData>(req, {
      data: { connId, gameId: "", lobbyId, lobbyRole: role, playerId: "", userId: getUserIdFromRequest(req) },
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
    const deckId = typeof msg.deckId === "string" ? msg.deckId : "";
    // Own decks, public decks or the starter only — same rule as the practice seat's deck.
    if (deckId && !maySelectDeck(deckId, ws.data.userId)) {
      player.deckId = null;
      player.ready = false;
      sendLobbyError(ws, "Deck not found — pick one of your saved decks, a public deck, or the starter deck");
      broadcastLobby(lobby);
      return;
    }
    player.deckId = deckId || null;
    player.ready = Boolean(deckId);
    // "mirror" follows the host's pick.
    if (role === "host") {syncOpponentSeatDeck(lobby);}
    broadcastLobby(lobby);
  }

  // Host picks the practice seat's deck from the lobby room (Single Player /
  // hot-seat sandbox): same modes + ownership rule as `opponent.deck` on create.
  if (msg.type === "select_opponent_deck" && role === "host" && lobby.status === "waiting") {
    if (!lobby.sandbox) {
      sendLobbyError(ws, "The opponent's deck can only be chosen in Single Player mode");
      return;
    }
    const parsed = parseOpponentDeck(msg.deck, ws.data.userId);
    if (!parsed.ok) {
      sendLobbyError(ws, parsed.error);
      broadcastLobby(lobby);
      return;
    }
    lobby.opponentDeck = parsed.spec;
    syncOpponentSeatDeck(lobby);
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
      syncOpponentSeatDeck(lobby);
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

  // Tournament switch (host only, while waiting). Default off: legality is advisory.
  if (msg.type === "set_enforce_legality" && role === "host" && lobby.status === "waiting") {
    lobby.enforceLegality = msg.enabled === true;
    broadcastLobby(lobby);
  }

  if (msg.type === "start_game" && role === "host" && lobby.guest && lobby.host.ready && lobby.guest.ready) {
    // Deck legality (server/deck-rules.ts) is advisory unless this lobby opted
    // into enforcement: then refuse to start and name each flagged seat's
    // problems (the requester sees codes only for the other seat's deck).
    if (lobby.enforceLegality) {
      syncOpponentSeatDeck(lobby);
      const seats = [["host", lobby.host] as const, ["guest", lobby.guest] as const];
      const flagged = seats
        .map(([seat, p]) => ({ name: p.name, report: deckLegalityForId(p.deckId), seat }))
        .filter((x) => !x.report.legal);
      if (flagged.length > 0) {
        const problems = flagged.flatMap((x) => x.report.problems
          .filter((pr) => pr.severity === "error")
          .map((pr) => ({ code: pr.code, message: x.seat === role ? pr.message : pr.code, seat: x.seat })));
        const summary = flagged.map((x) => `${x.name}: ${summarizeLegality(x.report)}`).join("; ");
        try {
          ws.send(JSON.stringify({ error: `This lobby enforces deck legality — cannot start: ${summary}`, problems, type: "lobby_error" }));
        } catch { /* disconnected */ }
        // Tell the other seat too, so a flagged guest knows why nothing happens.
        const other = role === "host" ? lobby.guest.ws : lobby.host.ws;
        if (other && other !== ws) {
          try { other.send(JSON.stringify({ error: `Host tried to start, but this lobby enforces deck legality: ${summary}`, type: "lobby_error" })); } catch { /* */ }
        }
        return;
      }
    }
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

    // NOW start the game with the chosen first player. The practice seat's
    // deck was validated at create/select time; re-sync so "mirror" reflects
    // the host's final pick.
    syncOpponentSeatDeck(lobby);
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
      ...(lobby.sandbox ? { opponentDeckMode: lobby.opponentDeck?.mode ?? "default" } : {}),
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

function sendLobbyError(ws: ServerWebSocket<WsData>, error: string): void {
  try { ws.send(JSON.stringify({ error, type: "lobby_error" })); } catch { /* disconnected */ }
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
