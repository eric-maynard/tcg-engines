/**
 * Lobby REST routes: /api/lobby/create, /api/lobby/join, /api/lobby/:id.
 */

import { getUserById } from "../src/db/user-repo";
import { createOpponent, parseOpponentSpec } from "./ai-opponent";
import { SANDBOX_ENABLED } from "./config";
import { json } from "./http";
import { parseOpponentDeck, syncOpponentSeatDeck } from "./opponent-deck";
import { getUserIdFromRequest } from "./routes-auth";
import { type Lobby, type RouteCtx, type RouteResult, broadcastLobby, generateLobbyCode, lobbies, lobbyByCode } from "./state";

export interface CreateLobbyBody {
  name?: string;
  sandbox?: boolean;
  gameMode?: string;
  /** {kind:"goldfish", mode?:"passive"|"active"} | {kind:"claude", model, apiKey?} plus optional `deck` (server/opponent-deck.ts). */
  opponent?: unknown;
  /** Tournament switch: refuse to start with a not-tournament-legal deck (default false — warn only). */
  enforceLegality?: boolean;
  /** Kitchen-table switch: allow sideboarding before game 1 (default false — sideboards only between games). */
  sideboardBeforeGame1?: boolean;
}

/**
 * Validate a create request and register the lobby. Everything is checked
 * BEFORE the lobby is inserted, so a rejected request leaves no lobby behind.
 * `userId` is the authenticated requester (null when anonymous) — the only
 * identity used for deck ownership. The SANDBOX_ENABLED gate lives in the
 * route so tests can exercise sandbox lobbies directly.
 */
export function createLobby(body: CreateLobbyBody, userId: string | null): { status: number; body: { error: string } | { code: string; lobbyId: string } } {
  const isSandbox = body.sandbox === true;
  // Solo opponent: Goldfish (passive = auto-passes, default; active = the host
  // plays both seats) or a Claude seat. A request-supplied API key stays inside
  // the driver instance in memory; nothing here logs, persists or echoes it.
  const parsed = isSandbox ? parseOpponentSpec(body.opponent) : ({ ok: true, spec: { kind: "goldfish", mode: "passive" } } as const);
  if (!parsed.ok) {
    return { body: { error: parsed.error }, status: parsed.status };
  }
  const hotSeat = isSandbox && parsed.spec.kind === "goldfish" && parsed.spec.mode === "active";
  // Which deck the practice seat plays — ownership resolved from `userId`, never the body.
  const deckRaw = isSandbox && body.opponent && typeof body.opponent === "object" ? (body.opponent as { deck?: unknown }).deck : undefined;
  const oppDeck = parseOpponentDeck(deckRaw, userId);
  if (!oppDeck.ok) {
    return { body: { error: oppDeck.error }, status: oppDeck.status };
  }
  const opponent = createOpponent(parsed.spec);
  const lobbyId = crypto.randomUUID();
  const code = generateLobbyCode();
  console.log(`[Lobby] create id=${lobbyId.slice(0, 8)} sandbox=${isSandbox} opponent=${opponent ? `claude:${opponent.info.model}` : hotSeat ? "goldfish:active" : "goldfish"} oppDeck=${oppDeck.spec.mode}`);
  const lobby: Lobby = {
    code,
    coinFlip: null,
    createdAt: Date.now(),
    enforceLegality: body.enforceLegality === true,
    gameId: null,
    gameMode: body.gameMode === "match" ? "match" : "duel",
    // Active Goldfish: the seat is played by the host, so it is named as a seat
    // ("Player 2") — match-log lines attribute its actions to the seat.
    guest: isSandbox
      ? { connId: "", deckId: "default", name: opponent?.info.label ?? (hotSeat ? "Player 2" : "Goldfish"), ready: true, ws: null }
      : null,
    // Never echo the client-supplied name (may be an email). Resolve the
    // authenticated user's stored displayName so opponents only ever see that.
    host: { connId: "", deckId: null, name: (getUserById(userId ?? "")?.displayName) || (body.name?.split("@")[0]) || "Player 1", ready: false, ws: null },
    ...(hotSeat ? { hotSeat: true } : {}),
    id: lobbyId,
    opponent,
    ...(isSandbox ? { opponentDeck: oppDeck.spec } : {}),
    sandbox: isSandbox,
    ...(body.sideboardBeforeGame1 === true ? { sideboardBeforeGame1: true } : {}),
    status: "waiting",
  };
  syncOpponentSeatDeck(lobby);
  lobbies.set(lobbyId, lobby);
  lobbyByCode.set(code, lobbyId);
  return { body: { code, lobbyId }, status: 200 };
}

export async function handleLobbyRoutes(req: Request, url: URL, _ctx: RouteCtx): RouteResult {
  const { pathname } = url;

  // POST /api/lobby/create — host creates a lobby
  if (pathname === "/api/lobby/create" && req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as CreateLobbyBody;

    if (body.sandbox && !SANDBOX_ENABLED) {
      return json({ error: "Sandbox mode is disabled" }, 403);
    }
    const result = createLobby({ ...body, sandbox: body.sandbox === true && SANDBOX_ENABLED }, getUserIdFromRequest(req));
    return json(result.body, result.status);
  }

  // POST /api/lobby/join — guest joins a lobby by code
  if (pathname === "/api/lobby/join" && req.method === "POST") {
    const body = (await req.json()) as { code: string; name?: string };
    const code = (body.code || "").toUpperCase().trim();
    const lobbyId = lobbyByCode.get(code);
    if (!lobbyId) {return json({ error: "Lobby not found" }, 404);}
    const lobby = lobbies.get(lobbyId);
    if (!lobby) {return json({ error: "Lobby not found" }, 404);}
    if (lobby.guest) {return json({ error: "Lobby is full" }, 400);}
    if (lobby.status !== "waiting") {return json({ error: "Lobby already started" }, 400);}

    lobby.guest = { connId: "", deckId: null, name: (getUserById(getUserIdFromRequest(req) ?? "")?.displayName) || (body.name?.split("@")[0]) || "Player 2", ready: false, ws: null };
    broadcastLobby(lobby);
    return json({ code, lobbyId });
  }

  // GET /api/lobby/:id — get lobby state
  if (pathname.match(/^\/api\/lobby\/[^/]+$/) && req.method === "GET") {
    const lobbyId = pathname.split("/")[3];
    const lobby = lobbies.get(lobbyId);
    if (!lobby) {return json({ error: "Lobby not found" }, 404);}
    return json({
      code: lobby.code,
      gameId: lobby.gameId,
      guest: lobby.guest ? { hasDeck: Boolean(lobby.guest.deckId), name: lobby.guest.name, ready: lobby.guest.ready } : null,
      host: { hasDeck: Boolean(lobby.host.deckId), name: lobby.host.name, ready: lobby.host.ready },
      id: lobby.id,
      ...(lobby.sandbox ? { opponentDeck: { mode: lobby.opponentDeck?.mode ?? "default" } } : {}),
      status: lobby.status,
    });
  }

  return null;
}
