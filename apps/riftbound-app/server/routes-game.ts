/**
 * Game engine REST routes: /api/game/create, /api/game/:id/{state,moves,move,
 * history,undo,redo,tutor}.
 */

import { getGlobalCardRegistry } from "@tcg/riftbound";
import type { PlayerId } from "@tcg/core";
import { allCards } from "./cards";
import { SANDBOX_ENABLED, SERVER_ONLY_MOVES } from "./config";
import { buildDefaultDeck } from "./decks";
import { type DeckLegality, summarizeLegality, validateDeckConfig } from "./deck-rules";
import { json } from "./http";
import { gameLogger } from "./log";
import { createGameFromDecks } from "./pregame";
import {
  buildAvailableMoves,
  buildGameSnapshot,
  buildHistoryLog,
  buildReachablePlays,
  buildUnaffordableTargets,
} from "./snapshot";
import { type DeckConfig, type GameSession, type RouteCtx, type RouteResult, gameSessions } from "./state";
import { aiStatus, attachOpponent, parseOpponentSpec, runOpponent } from "./ai-opponent";
import { rewindSession } from "./rewind";
import { applySessionMove } from "./turn";

/**
 * rule 108.7.c / 128.4 / 723 — the REST surface has no user→seat binding, so a
 * duel snapshot served here is served to an unauthenticated caller: it must
 * never carry the identity of anyone's private cards (hands, decks, facedown).
 * `SPECTATOR` is a viewer that owns no card, so every private zone redacts to
 * the opaque `hidden-…` stand-in. Sandbox sessions (goldfish/hotseat, one human
 * driving both seats) keep the full state the UI needs.
 */
const SPECTATOR = "spectator";

function restSnapshot(session: GameSession, url: URL) {
  // A Claude seat is a real opponent, so its cards stay private too (snapshot.ts).
  const redacted = !session.sandbox || session.opponent?.info.kind === "claude";
  const snapshot = buildGameSnapshot(session, redacted ? SPECTATOR : undefined);
  if (redacted) {
    return snapshot;
  }
  // rule 357.1.a / 809.1.d — "what could I still pay for?" is a per-SEAT
  // question, and this view has no seat, so both lists came back empty for
  // every caller: the hand reads as inert on this surface whatever the pool
  // holds. A sandbox caller names its seat exactly as /moves does
  // (`?playerId=` / `?player=`); a seatless caller keeps the seatless answer.
  const seat = url.searchParams.get("playerId") ?? url.searchParams.get("player");
  if (!seat || !session.players.includes(seat) || session.engine.getState().status !== "playing") {
    return snapshot;
  }
  return {
    ...snapshot,
    reachablePlays: buildReachablePlays(session, seat),
    unaffordableTargets: buildUnaffordableTargets(session, seat),
  };
}

export async function handleGameRoutes(req: Request, url: URL, _ctx: RouteCtx): RouteResult {
  const { pathname } = url;

  // GET /api/ai/status — can a Claude seat be offered? (env key present, model list; never key material)
  if (pathname === "/api/ai/status" && req.method === "GET") {
    return json(aiStatus());
  }

  // POST /api/game/create — create a game from deck configs
  if (pathname === "/api/game/create" && req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as {
      seed?: string;
      deck1?: DeckConfig;
      deck2?: DeckConfig;
      sandbox?: boolean;
      /** Opt-in tournament enforcement, like a lobby's `enforceLegality` (server/ws-lobby.ts). */
      enforceLegality?: boolean;
      /** Open the sideboard swap window before game 1 (default false — OP policy sideboards only between games; server/pregame.ts). */
      sideboardBeforeGame1?: boolean;
      /** {kind:"goldfish"} | {kind:"claude", model, apiKey?} — the key is held in memory only. */
      opponent?: unknown;
    };

    if (body.sandbox && !SANDBOX_ENABLED) {
      return json({ error: "Sandbox mode is disabled" }, 403);
    }
    const opponent = parseOpponentSpec(body.opponent);
    if (!opponent.ok) {
      return json({ error: opponent.error }, opponent.status);
    }
    if (opponent.spec.kind === "claude" && !(body.sandbox && SANDBOX_ENABLED)) {
      return json({ error: "A Claude opponent needs a sandbox game" }, 400);
    }

    const deck1 = body.deck1 ?? buildDefaultDeck();
    const deck2 = body.deck2 ?? buildDefaultDeck();
    // Construction legality (rule 103) is ADVISORY here, exactly as in the lobby
    // path (server/ws-lobby.ts): the game is built either way and each seat's
    // `{legal, problems}` report rides along on the response. Only a structurally
    // unplayable deck (no main-deck cards at all) and an explicit
    // `enforceLegality: true` refuse.
    const legality: Record<"deck1" | "deck2", DeckLegality> = {
      deck1: validateDeckConfig(deck1),
      deck2: validateDeckConfig(deck2),
    };
    for (const [label, deck] of [["deck1", deck1], ["deck2", deck2]] as const) {
      if (deck.sideboardCardIds !== undefined && !Array.isArray(deck.sideboardCardIds)) {
        return json({ error: `${label}.sideboardCardIds must be an array of card ids` }, 400);
      }
      if ((deck.mainDeckCardIds ?? []).length === 0 && !deck.championId) {
        return json({ error: `${label} has an empty main deck — nothing to play`, legality }, 400);
      }
    }
    if (body.enforceLegality === true) {
      const flagged = (["deck1", "deck2"] as const).filter((k) => !legality[k].legal);
      if (flagged.length > 0) {
        return json(
          {
            error: `This game enforces deck legality — ${flagged.map((k) => `${k}: ${summarizeLegality(legality[k])}`).join("; ")}`,
            legality,
          },
          400,
        );
      }
    }
    const gameId = crypto.randomUUID();
    const session = createGameFromDecks(deck1, deck2, body.seed, { gameMode: "duel", sandbox: (body.sandbox ?? false) && SANDBOX_ENABLED, sideboardBeforeGame1: body.sideboardBeforeGame1 === true });
    attachOpponent(session, opponent.spec, { gameId });
    gameSessions.set(gameId, session);
    gameLogger.logGameCreated(gameId, session.players, "duel", body.seed ?? "random", {
      opponent: opponent.spec.kind === "claude" ? `claude:${opponent.spec.model}` : "goldfish",
      sandbox: body.sandbox ?? false,
      source: "api",
    });
    return json({ gameId, legality, state: restSnapshot(session, url) });
  }

  // GET /api/game/:id/state — get full game state snapshot
  if (pathname.match(/^\/api\/game\/[^/]+\/state$/) && req.method === "GET") {
    const gameId = pathname.split("/")[3];
    const session = gameSessions.get(gameId);
    if (!session) {return json({ error: "Game not found" }, 404);}
    return json(restSnapshot(session, url));
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

      const response = json({ phaseChange, state: buildGameSnapshot(session, body.playerId), success: true });
      // A Claude seat answers REST-driven games too (the Goldfish historically
      // does not act on this test surface — callers drive both seats).
      runOpponent(session, { gameId, goldfish: false, humanSeat: body.playerId });
      return response;
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

  // POST /api/game/:id/undo|redo — rewind / re-apply the last action (server/rewind.ts)
  if (pathname.match(/^\/api\/game\/[^/]+\/(undo|redo)$/) && req.method === "POST") {
    const gameId = pathname.split("/")[3];
    const kind = pathname.endsWith("/redo") ? "redo" : "undo";
    const session = gameSessions.get(gameId);
    if (!session) {return json({ error: "Game not found" }, 404);}
    // REST move surface is a sandbox/test hook only: there is no user→seat
    // binding on this path (body.playerId / ?player= are caller-supplied), so
    // host/join games must use the authenticated WebSocket path instead.
    if (!session.sandbox) {return json({ error: "REST moves are sandbox-only; use the game WebSocket" }, 403);}
    const body = (await req.json().catch(() => ({}))) as { playerId?: string };
    const actor = body.playerId || url.searchParams.get("player") || session.players[0];
    const r = rewindSession(session, kind, { actor, gameId });
    if (!r.ok) {return json({ error: r.error }, 400);}
    return json({ state: buildGameSnapshot(session, actor), steps: r.steps, success: true });
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
      // Ids must stay unique: a second spawn of the same defId would otherwise
      // overwrite the copy already on board and double its triggers.
      let seq = 999;
      while ((internal as any).cards[`${pid}-main-${seq}-${body.defId}`]) {seq++;}
      found = `${pid}-main-${seq}-${body.defId}`;
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
