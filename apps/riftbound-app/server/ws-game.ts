/**
 * Game WebSocket: upgrade route + open/message/close handlers (moves, resync,
 * undo/redo, pings, leave).
 */

import type { PlayerId } from "@tcg/core";
import type { ServerWebSocket } from "bun";
import { actorName, makeLogEntry } from "../src/narrator";
import { SERVER_ONLY_MOVES } from "./config";
import { json } from "./http";
import { gameLogger } from "./log";
import { buildPregamePayload, handlePregameMessage } from "./pregame";
import { buildAvailableMoves, buildGameSnapshot } from "./snapshot";
import { type RouteCtx, type RouteResult, type WsData, broadcast, gameSessions } from "./state";
import { autoResolveCombat, finalizeEndTurn, preparePlayerRotation, sandboxAutoPlay } from "./turn";

// GET /ws/game/:id?player=X — upgrade to game WebSocket
export async function handleGameUpgrade(req: Request, url: URL, ctx: RouteCtx): RouteResult {
  const { pathname } = url;
  const { server } = ctx;

  if (pathname.match(/^\/ws\/game\/[^/]+$/) && req.headers.get("upgrade")?.toLowerCase() === "websocket") {
    const gameId = pathname.split("/")[3];
    const playerId = url.searchParams.get("player") ?? "player-1";
    const session = gameSessions.get(gameId);
    if (!session) {return json({ error: "Game not found" }, 404);}

    const connId = crypto.randomUUID();
    const upgraded = server.upgrade<WsData>(req, {
      data: { connId, gameId, playerId },
    });
    if (!upgraded) {
      return new Response("WebSocket upgrade failed", { status: 500 });
    }
    return undefined as unknown as Response;
  }

  return null;
}

export function gameWsClose(ws: ServerWebSocket<WsData>, code: number, reason: string): void {
  const { gameId, playerId, connId } = ws.data;
  const session = gameSessions.get(gameId);
  if (!session) {return;}

  session.clients.delete(connId);
  console.log(`WS disconnected: ${connId} (${playerId}) code=${code} reason=${reason} (${session.clients.size} clients left)`);
  gameLogger.logPlayerDisconnected(gameId, playerId, connId, reason || `code=${code}`);

  broadcast(session, {
    clientCount: session.clients.size,
    playerId,
    type: "player_disconnected",
  });
}

export function gameWsMessage(ws: ServerWebSocket<WsData>, msg: Record<string, unknown>): void {
  const { gameId, playerId, connId } = ws.data;
  const session = gameSessions.get(gameId);
  if (!session) {return;}

  // ---- Pregame message handlers ----
  if (session.pregame) {
    if (handlePregameMessage(ws, msg, session, gameId, playerId)) {return;}
  }

  if (msg.type === "move") {
    const { moveId, params, requestId } = msg;
    if (!moveId || !params) {
      ws.send(JSON.stringify({ error: "Missing moveId or params", requestId, type: "error" }));
      return;
    }
    // System-driven moves are never legal from a client message. The
    // engine's `directed:true` param on channelRunes/emptyRunePool is
    // client-suppliable, so it is not an authorization boundary — this
    // denylist is.
    if (SERVER_ONLY_MOVES.has(moveId as string)) {
      ws.send(JSON.stringify({ error: `Move '${moveId}' is server-driven only`, requestId, type: "error" }));
      return;
    }

    // Capture previous phase for phase change detection
    const prevPhase = session.engine.getState().turn.phase;

    // For endTurn, set the next player on the flow manager BEFORE executing
    // So the flow's phase callbacks (channel, draw, ready) target the right player.
    const isEndTurn = moveId === "endTurn";
    const nextPlayer = isEndTurn ? preparePlayerRotation(session, playerId) : undefined;

    const result = session.engine.executeMove(moveId, {
      params,
      playerId: playerId as PlayerId,
    });

    if (!result.success) {
      // If endTurn failed, restore the current player on the flow manager
      if (isEndTurn) {
        session.engine.getFlowManager()?.setCurrentPlayer(playerId as PlayerId);
      }
      const wsError = (result as { error: string }).error;
      const wsErrorCode = (result as { errorCode: string }).errorCode;
      gameLogger.logMoveRejected(gameId, moveId as string, playerId, params as Record<string, unknown>, wsError ?? "unknown");
      ws.send(JSON.stringify({
        error: wsError,
        errorCode: wsErrorCode,
        requestId,
        type: "move_rejected",
      }));
      return;
    }

    // Move narration is produced from engine replay history in buildHistoryLog
    gameLogger.logMove(gameId, moveId as string, playerId, params as Record<string, unknown>, { success: true });

    // After unit movement, auto-detect and resolve contested battlefields
    if (moveId === "standardMove" || moveId === "gankingMove") {
      autoResolveCombat(session, playerId);
    }

    // Detect game completion
    const stateAfterWsMove = session.engine.getState();
    if (stateAfterWsMove.status === "finished") {
      const startTime = gameLogger.getGameStartTime(gameId);
      const durationMs = startTime ? Date.now() - startTime : 0;
      gameLogger.logStateChange(gameId, "playing", "finished");
      gameLogger.logGameCompleted(
        gameId,
        stateAfterWsMove.turn.activePlayer ?? null,
        stateAfterWsMove.victoryScore ?? {},
        session.engine.getReplayHistory().length,
        durationMs,
      );
    }

    // Finalize turn cycling (same logic as REST endpoint)
    if (isEndTurn && nextPlayer) {
      finalizeEndTurn(session, nextPlayer);
    }

    session.seq++;
    const snapshot = buildGameSnapshot(session, playerId);

    // Detect phase change for WebSocket messages
    const newPhase = session.engine.getState().turn.phase;
    const phaseChange = prevPhase !== newPhase
      ? { from: prevPhase, to: newPhase }
      : undefined;

    // Send confirmation to the acting player with their updated moves
    const actorMoves = buildAvailableMoves(session, playerId);

    ws.send(JSON.stringify({
      moveId,
      moves: actorMoves,
      phaseChange,
      playerId,
      requestId,
      seq: session.seq,
      state: snapshot,
      type: "move_accepted",
    }));

    // Broadcast to other clients with their own available moves
    for (const [cid, client] of session.clients) {
      if (cid === connId) {continue;}
      const clientMoves = buildAvailableMoves(session, client.playerId);
      try {
        client.ws.send(JSON.stringify({
          moveId,
          moves: clientMoves,
          phaseChange,
          playerId,
          seq: session.seq,
          state: buildGameSnapshot(session, client.playerId),
          type: "state_update",
        }));
      } catch { /* Disconnected */ }
    }

    // Sandbox auto-play: handle chain priority, showdown focus, and turn for Goldfish
    if (session.sandbox) {
      const humanPlayer = playerId;
      const goldfish = session.players.find((p) => p !== humanPlayer);
      if (goldfish) {
        sandboxAutoPlay(session, goldfish);
      }
    }
  }

  if (msg.type === "resync") {
    // Client explicitly requests full state (e.g., after detecting gap in seq)
    const snapshot = buildGameSnapshot(session, playerId);
    const moves = buildAvailableMoves(session, playerId);

    ws.send(JSON.stringify({
      moves,
      seq: session.seq,
      state: snapshot,
      type: "sync",
    }));
  }

  if (msg.type === "ping") {
    ws.send(JSON.stringify({ type: "pong" }));
  }

  if (msg.type === "game_ping") {
    const pingMsg = {
      message: (msg as Record<string, unknown>).message,
      playerId,
      target: (msg as Record<string, unknown>).target,
      targetType: (msg as Record<string, unknown>).targetType,
      type: "game_ping",
    };
    broadcast(session, pingMsg);
  }

  if (msg.type === "undo") {
    const undoState = session.engine.getState();
    if (undoState.status !== "playing") {
      ws.send(JSON.stringify({ error: "Can only rewind during active gameplay", type: "error" }));
      return;
    }
    if (session.engine.getReplayHistory().length === 0) {
      ws.send(JSON.stringify({ error: "Nothing to rewind", type: "error" }));
      return;
    }
    const success = session.engine.undo();
    if (!success) {
      ws.send(JSON.stringify({ error: "Nothing to rewind", type: "error" }));
      return;
    }
    // W8: emit the canonical "Rewound their last action." line (non-rewindable
    // So rewinding a rewind is impossible) with a fresh timestamp. This matches
    // The REST handler path above and gives the client a stable sentinel to
    // Detect and clear in-progress UI state on.
    session.log.push(makeLogEntry("Rewound their last action.", { rewindable: false }));
    session.seq++;
    // Broadcast updated state to all clients
    for (const [, client] of session.clients) {
      const clientMoves = buildAvailableMoves(session, client.playerId);
      try {
        client.ws.send(JSON.stringify({
          moveId: "undo",
          moves: clientMoves,
          playerId,
          seq: session.seq,
          state: buildGameSnapshot(session, client.playerId),
          type: "state_update",
        }));
      } catch { /* Disconnected */ }
    }
  }

  if (msg.type === "redo") {
    const success = session.engine.redo();
    if (!success) {
      ws.send(JSON.stringify({ error: "Nothing to redo", type: "error" }));
      return;
    }
    session.log.push(makeLogEntry("Move redone."));
    session.seq++;
    for (const [, client] of session.clients) {
      const clientMoves = buildAvailableMoves(session, client.playerId);
      try {
        client.ws.send(JSON.stringify({
          moveId: "redo",
          moves: clientMoves,
          playerId,
          seq: session.seq,
          state: buildGameSnapshot(session, client.playerId),
          type: "state_update",
        }));
      } catch { /* Disconnected */ }
    }
  }

  if (msg.type === "leave_game") {
    const isHost = playerId === session.players[0];
    session.log.push(
      makeLogEntry(
        `${actorName(playerId, session.playerNames)} left the game.`,
      ),
    );
    gameLogger.logPlayerDisconnected(gameId, playerId, connId, "voluntary_leave");

    if (isHost) {
      // Host leaving ends the game — notify all clients and clean up
      gameLogger.logStateChange(gameId, "playing", "ended_host_left");
      broadcast(session, { reason: "host_left", type: "game_ended" });
      // Close all client connections
      for (const [cid, client] of session.clients) {
        try { client.ws.close(1000, "Host left"); } catch { /* */ }
      }
      session.clients.clear();
      gameSessions.delete(gameId);
    } else {
      // Guest leaving — they can rejoin later. Just notify other clients.
      broadcast(session, {
        clientCount: session.clients.size - 1,
        playerId,
        type: "player_disconnected",
        voluntary: true,
      }, connId);
      // Close this client's connection
      ws.close(1000, "Player left");
    }
  }
}

export function gameWsOpen(ws: ServerWebSocket<WsData>): void {
  const { connId } = ws.data;
  const { gameId, playerId } = ws.data;
  const session = gameSessions.get(gameId);
  if (!session) {
    ws.close(4004, "Game not found");
    return;
  }

  session.clients.set(connId, { playerId, ws });
  console.log(`WS connected: ${connId} as ${playerId} in game ${gameId} (${session.clients.size} clients)`);
  gameLogger.logPlayerConnected(gameId, playerId, connId);

  // Send full state snapshot on connect (enables reconnection resync)
  const snapshot = buildGameSnapshot(session, playerId);
  const moves = buildAvailableMoves(session, playerId);

  ws.send(JSON.stringify({
    moves,
    pregame: buildPregamePayload(session, playerId),
    seq: session.seq,
    state: snapshot,
    type: "sync",
  }));

  // Notify other clients
  broadcast(session, {
    clientCount: session.clients.size,
    playerId,
    type: "player_connected",
  }, connId);
}
