/**
 * Lobby REST routes: /api/lobby/create, /api/lobby/join, /api/lobby/:id.
 */

import { getUserById } from "../src/db/user-repo";
import { createOpponent, parseOpponentSpec } from "./ai-opponent";
import { SANDBOX_ENABLED } from "./config";
import { json } from "./http";
import { getUserIdFromRequest } from "./routes-auth";
import { type Lobby, type RouteCtx, type RouteResult, broadcastLobby, generateLobbyCode, lobbies, lobbyByCode } from "./state";

export async function handleLobbyRoutes(req: Request, url: URL, _ctx: RouteCtx): RouteResult {
  const { pathname } = url;

  // POST /api/lobby/create — host creates a lobby
  if (pathname === "/api/lobby/create" && req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { name?: string; sandbox?: boolean; opponent?: unknown };

    if (body.sandbox && !SANDBOX_ENABLED) {
      return json({ error: "Sandbox mode is disabled" }, 403);
    }

    const isSandbox = body.sandbox === true && SANDBOX_ENABLED;
    // Solo opponent: Goldfish (default) or a Claude seat. A request-supplied
    // API key stays inside the driver instance in memory; nothing here logs,
    // persists or echoes it.
    const parsed = isSandbox ? parseOpponentSpec(body.opponent) : ({ ok: true, spec: { kind: "goldfish" } } as const);
    if (!parsed.ok) {
      return json({ error: parsed.error }, parsed.status);
    }
    const opponent = createOpponent(parsed.spec);
    const lobbyId = crypto.randomUUID();
    const code = generateLobbyCode();
    console.log(`[Lobby] create id=${lobbyId.slice(0,8)} sandbox=${isSandbox} opponent=${opponent ? `claude:${opponent.info.model}` : "goldfish"}`);
    const lobby: Lobby = {
      code,
      coinFlip: null,
      createdAt: Date.now(),
      gameId: null,
      gameMode: (body as Record<string, unknown>).gameMode === "match" ? "match" : "duel",
      guest: isSandbox
        ? { connId: "", deckId: "default", name: opponent?.info.label ?? "Goldfish", ready: true, ws: null }
        : null,
      // Never echo the client-supplied name (may be an email). Resolve the
      // authenticated user's stored displayName so opponents only ever see that.
      host: { connId: "", deckId: null, name: (getUserById(getUserIdFromRequest(req) ?? "")?.displayName) || (body.name?.split("@")[0]) || "Player 1", ready: false, ws: null },
      id: lobbyId,
      opponent,
      sandbox: isSandbox,
      status: "waiting",
    };
    lobbies.set(lobbyId, lobby);
    lobbyByCode.set(code, lobbyId);
    return json({ code, lobbyId });
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
      status: lobby.status,
    });
  }

  return null;
}
