/**
 * Game engine REST routes: /api/game/create, /api/game/:id/{state,moves,move,
 * history,undo,redo,tutor}.
 */

import { getGlobalCardRegistry } from "@tcg/riftbound";
import type { PlayerId } from "@tcg/core";
import { makeLogEntry } from "../src/narrator";
import { allCards } from "./cards";
import { SANDBOX_ENABLED, SERVER_ONLY_MOVES } from "./config";
import { MIN_MAIN_DECK_SIZE, buildDefaultDeck, findCopyLimitViolations } from "./decks";
import { json } from "./http";
import { gameLogger } from "./log";
import { createGameFromDecks } from "./pregame";
import { buildAvailableMoves, buildGameSnapshot, buildHistoryLog } from "./snapshot";
import { type DeckConfig, type RouteCtx, type RouteResult, gameSessions } from "./state";
import { applySessionMove } from "./turn";

export async function handleGameRoutes(req: Request, url: URL, _ctx: RouteCtx): RouteResult {
  const { pathname } = url;

  // POST /api/game/create — create a game from deck configs
  if (pathname === "/api/game/create" && req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as {
      seed?: string;
      deck1?: DeckConfig;
      deck2?: DeckConfig;
      sandbox?: boolean;
    };

    if (body.sandbox && !SANDBOX_ENABLED) {
      return json({ error: "Sandbox mode is disabled" }, 403);
    }

    const deck1 = body.deck1 ?? buildDefaultDeck();
    const deck2 = body.deck2 ?? buildDefaultDeck();
    // Rule 103.2.b: reject decks with more than 3 copies of a named card.
    for (const [label, deck] of [["deck1", deck1], ["deck2", deck2]] as const) {
      const violations = findCopyLimitViolations(deck.mainDeckCardIds ?? []);
      if (violations.length > 0) {
        return json({ error: `${label} exceeds the 3-copy limit (rule 103.2.b): ${violations.join(", ")}` }, 400);
      }
      // Rule 103.2 / 103.2.a.1: at least 40 Main Deck cards, Chosen Champion included.
      const mainDeckSize = (deck.mainDeckCardIds ?? []).length + (deck.championId ? 1 : 0);
      if (mainDeckSize < MIN_MAIN_DECK_SIZE) {
        return json({ error: `${label} main deck has ${mainDeckSize} cards, needs at least ${MIN_MAIN_DECK_SIZE} (rule 103.2)` }, 400);
      }
    }
    const gameId = crypto.randomUUID();
    const session = createGameFromDecks(deck1, deck2, body.seed, { gameMode: "duel", sandbox: (body.sandbox ?? false) && SANDBOX_ENABLED });
    gameSessions.set(gameId, session);
    gameLogger.logGameCreated(gameId, session.players, "duel", body.seed ?? "random", {
      sandbox: body.sandbox ?? false,
      source: "api",
    });
    return json({ gameId, state: buildGameSnapshot(session) });
  }

  // GET /api/game/:id/state — get full game state snapshot
  if (pathname.match(/^\/api\/game\/[^/]+\/state$/) && req.method === "GET") {
    const gameId = pathname.split("/")[3];
    const session = gameSessions.get(gameId);
    if (!session) {return json({ error: "Game not found" }, 404);}
    return json(buildGameSnapshot(session));
  }

  // GET /api/game/:id/moves — enumerate available moves for a player
  if (pathname.match(/^\/api\/game\/[^/]+\/moves$/) && req.method === "GET") {
    const gameId = pathname.split("/")[3];
    const playerId = url.searchParams.get("player") ?? "player-1";
    const session = gameSessions.get(gameId);
    if (!session) {return json({ error: "Game not found" }, 404);}
    // REST move surface is a sandbox/test hook only: there is no user→seat
    // binding on this path (body.playerId / ?player= are caller-supplied), so
    // host/join games must use the authenticated WebSocket path instead.
    if (!session.sandbox) {return json({ error: "REST moves are sandbox-only; use the game WebSocket" }, 403);}

    const moves = buildAvailableMoves(session, playerId);
    return json(moves);
  }

  // POST /api/game/:id/move — execute a move
  if (pathname.match(/^\/api\/game\/[^/]+\/move$/) && req.method === "POST") {
    const gameId = pathname.split("/")[3];
    const session = gameSessions.get(gameId);
    if (!session) {return json({ error: "Game not found" }, 404);}
    // REST move surface is a sandbox/test hook only: there is no user→seat
    // binding on this path (body.playerId / ?player= are caller-supplied), so
    // host/join games must use the authenticated WebSocket path instead.
    if (!session.sandbox) {return json({ error: "REST moves are sandbox-only; use the game WebSocket" }, 403);}

    const body = (await req.json()) as { moveId: string; playerId: string; params: Record<string, unknown> };

    if (SERVER_ONLY_MOVES.has(body.moveId)) {
      return json({ error: `Move '${body.moveId}' is server-driven only` }, 403);
    }

    // Capture previous phase for phase change detection
    const prevPhase = session.engine.getState().turn.phase;

    // Same sequencing path as the WebSocket handler: the engine's shared TurnDriver.
    const result = applySessionMove(session, body.playerId, body.moveId, body.params ?? {});

    if (result.success) {
      // Move narration is produced from engine replay history in buildHistoryLog
      gameLogger.logMove(gameId, body.moveId, body.playerId, body.params, { success: true });
      for (const run of result.procedures) {
        gameLogger.logMove(gameId, run.moveId, run.seat, run.params, { success: run.success });
      }

      // Detect game completion
      const stateAfterMove = session.engine.getState();
      if (stateAfterMove.status === "finished" && prevPhase !== "finished") {
        const startTime = gameLogger.getGameStartTime(gameId);
        const durationMs = startTime ? Date.now() - startTime : 0;
        gameLogger.logStateChange(gameId, "playing", "finished");
        gameLogger.logGameCompleted(
          gameId,
          stateAfterMove.turn.activePlayer ?? null,
          stateAfterMove.victoryScore ?? {},
          session.engine.getReplayHistory().length,
          durationMs,
        );
      }

      // Broadcast to connected WebSocket clients so they stay in sync
      session.seq++;
      const newPhase = session.engine.getState().turn.phase;
      const phaseChange = prevPhase !== newPhase
        ? { from: prevPhase, to: newPhase }
        : undefined;

      for (const [, client] of session.clients) {
        const clientMoves = buildAvailableMoves(session, client.playerId);
        try {
          client.ws.send(JSON.stringify({
            moveId: body.moveId,
            moves: clientMoves,
            phaseChange,
            playerId: body.playerId,
            seq: session.seq,
            state: buildGameSnapshot(session, client.playerId),
            type: "state_update",
          }));
        } catch { /* Disconnected */ }
      }

      return json({ phaseChange, state: buildGameSnapshot(session, body.playerId), success: true });
    }

    const moveError = result.error;
    const moveErrorCode = result.errorCode;
    gameLogger.logMoveRejected(gameId, body.moveId, body.playerId, body.params, moveError ?? "unknown");
    return json({ error: moveError, errorCode: moveErrorCode, success: false }, 400);
  }

  // GET /api/game/:id/history — get game history
  if (pathname.match(/^\/api\/game\/[^/]+\/history$/) && req.method === "GET") {
    const gameId = pathname.split("/")[3];
    const session = gameSessions.get(gameId);
    if (!session) {return json({ error: "Game not found" }, 404);}
    return json({ log: buildHistoryLog(session) });
  }

  // POST /api/game/:id/undo — undo last move
  if (pathname.match(/^\/api\/game\/[^/]+\/undo$/) && req.method === "POST") {
    const gameId = pathname.split("/")[3];
    const session = gameSessions.get(gameId);
    if (!session) {return json({ error: "Game not found" }, 404);}
    // REST move surface is a sandbox/test hook only: there is no user→seat
    // binding on this path (body.playerId / ?player= are caller-supplied), so
    // host/join games must use the authenticated WebSocket path instead.
    if (!session.sandbox) {return json({ error: "REST moves are sandbox-only; use the game WebSocket" }, 403);}

    const state = session.engine.getState();
    if (state.status !== "playing") {
      return json({ error: "Can only rewind during active gameplay" }, 400);
    }

    if (session.engine.getReplayHistory().length === 0) {
      return json({ error: "Nothing to rewind" }, 400);
    }

    const success = session.engine.undo();
    if (!success) {return json({ error: "Nothing to rewind" }, 400);}

    session.log.push(makeLogEntry("Rewound their last action.", { rewindable: false }));
    return json({ state: buildGameSnapshot(session), success: true });
  }

  // POST /api/game/:id/redo — redo undone move
  if (pathname.match(/^\/api\/game\/[^/]+\/redo$/) && req.method === "POST") {
    const gameId = pathname.split("/")[3];
    const session = gameSessions.get(gameId);
    if (!session) {return json({ error: "Game not found" }, 404);}
    // REST move surface is a sandbox/test hook only: there is no user→seat
    // binding on this path (body.playerId / ?player= are caller-supplied), so
    // host/join games must use the authenticated WebSocket path instead.
    if (!session.sandbox) {return json({ error: "REST moves are sandbox-only; use the game WebSocket" }, 403);}

    const success = session.engine.redo();
    if (!success) {return json({ error: "Nothing to redo" }, 400);}

    session.log.push(makeLogEntry("Move redone."));
    return json({ state: buildGameSnapshot(session), success: true });
  }

  // POST /api/game/:id/tutor {defId, playerId?} — sandbox-only test hook.
  // Moves the first deck card whose id ends with defId into that player's
  // hand. Lets the per-card playtest agent guarantee the card under test is
  // in hand instead of relying on shuffle luck.
  if (pathname.match(/^\/api\/game\/[^/]+\/tutor$/) && req.method === "POST") {
    if (!SANDBOX_ENABLED) return json({ error: "sandbox disabled" }, 403);
    const gameId = pathname.split("/")[3];
    const session = gameSessions.get(gameId);
    if (!session || !session.sandbox) return json({ error: "sandbox game not found" }, 404);
    const body = (await req.json().catch(() => ({}))) as { defId?: string; playerId?: string };
    if (!body.defId) return json({ error: "defId required" }, 400);
    const pid = body.playerId || "player-1";
    const internal = (session.engine as any).internalState as {
      zones: Record<string, { cardIds: string[] }>;
    };
    const deck = internal.zones["mainDeck"];
    const hand = internal.zones["hand"];
    if (!deck || !hand) return json({ error: "zones missing" }, 500);
    const idx = deck.cardIds.findIndex(
      (c) => c.startsWith(pid) && c.endsWith(body.defId!),
    );
    let found: string;
    if (idx >= 0) {
      [found] = deck.cardIds.splice(idx, 1);
      (internal as any).cards[found].zone = "hand";
    } else {
      // Spawn: any of the ~1000 defs is testable regardless of loaded deck.
      const def = allCards.find((c) => c.id === body.defId);
      if (!def) return json({ error: "unknown defId" }, 404);
      found = `${pid}-main-999-${body.defId}`;
      (internal as any).cards[found] = { controller: pid, definitionId: body.defId, owner: pid, position: undefined, zone: "hand" };
      (internal as any).cardMetas[found] = { buffed: false, combatRole: null, damage: 0, exhausted: false, hidden: false, stunned: false };
      getGlobalCardRegistry().register(found, def as any);
    }
    hand.cardIds.push(found);
    // Grant enough energy+power via addResources (goes through the engine so
    // getState()/undo/snapshot all see it).
    const def = allCards.find((c) => c.id === body.defId) as any;
    session.engine.executeMove("addResources", {
      params: {
        energy: (def?.energyCost ?? 0) + 4,
        playerId: pid,
        // rule-id: tutor-power-grant-counts-duplicate-pips
        power: (def?.powerCost ?? []).reduce(
          (acc: Record<string, number>, d: string) => ({ ...acc, [d]: (acc[d] ?? 0) + 1 }),
          {},
        ),
      },
      playerId: pid as PlayerId,
    });
    // Push a full state_update including per-client availableMoves so the
    // agent's `pw moves` reflects the tutored hand immediately.
    for (const [, client] of session.clients) {
      const clientMoves = buildAvailableMoves(session, client.playerId);
      client.ws.send(
        JSON.stringify({
          log: session.log,
          moves: clientMoves,
          seq: ++session.seq,
          state: buildGameSnapshot(session, client.playerId),
          type: "state_update",
        }),
      );
    }
    return json({ ok: true, cardId: found });
  }

  return null;
}
