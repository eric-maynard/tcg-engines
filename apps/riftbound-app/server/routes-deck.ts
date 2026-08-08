/**
 * Saved deck (SQLite-backed) routes under /api/saved-decks.
 */

import { createDeck, deleteDeck, getDeck, listDecks, listPublicDecks, updateDeck } from "../src/db/deck-repo";
import type { DeckCardEntry, GameVersion, SavedDeck } from "../src/db/deck-repo";
import { registry } from "./cards";
import { json } from "./http";
import { getUserIdFromRequest } from "./routes-auth";
import type { RouteCtx, RouteResult } from "./state";

/** Display metadata resolved from the card registry (not stored in the DB). */
interface DeckCardMeta {
  legendName: string | null;
  championName: string | null;
  domains: string[];
}

export function deckCardMeta(deck: Pick<SavedDeck, "legendId" | "championId">): DeckCardMeta {
  const legend = registry.get(deck.legendId);
  const champion = registry.get(deck.championId);
  const d = legend?.domain;
  const domains = typeof d === "string" ? [d] : Array.isArray(d) ? [...d] : [];
  return { championName: champion?.name ?? null, domains, legendName: legend?.name ?? null };
}

function withMeta<T extends SavedDeck>(deck: T): T & DeckCardMeta {
  return { ...deck, ...deckCardMeta(deck) };
}

export async function handleSavedDeckRoutes(req: Request, url: URL, _ctx: RouteCtx): RouteResult {
  const { pathname } = url;

  // POST /api/saved-decks — create a saved deck
  if (pathname === "/api/saved-decks" && req.method === "POST") {
    const userId = getUserIdFromRequest(req);
    if (!userId) {return json({ error: "Not authenticated" }, 401);}

    const body = (await req.json()) as {
      name: string;
      description?: string;
      format?: string;
      gameVersion?: GameVersion;
      legendId: string;
      championId: string;
      isPublic?: boolean;
      cards: DeckCardEntry[];
    };

    if (!body.name || !body.legendId || !body.championId) {
      return json({ error: "Name, legendId, and championId required" }, 400);
    }

    const deck = createDeck({ userId, ...body });
    return json(withMeta(deck), 201);
  }

  // GET /api/saved-decks — list user's decks
  if (pathname === "/api/saved-decks" && req.method === "GET") {
    const userId = getUserIdFromRequest(req);
    if (!userId) {return json({ error: "Not authenticated" }, 401);}
    return json(listDecks(userId).map(withMeta));
  }

  // GET /api/saved-decks/public — list public decks
  if (pathname === "/api/saved-decks/public") {
    return json(listPublicDecks().map(withMeta));
  }

  // GET /api/saved-decks/:id — get a single deck
  if (pathname.match(/^\/api\/saved-decks\/[^/]+$/) && req.method === "GET") {
    const deckId = pathname.split("/")[3];
    const deck = getDeck(deckId);
    if (!deck) {return json({ error: "Deck not found" }, 404);}
    return json(withMeta(deck));
  }

  // PUT /api/saved-decks/:id — update a deck
  if (pathname.match(/^\/api\/saved-decks\/[^/]+$/) && req.method === "PUT") {
    const userId = getUserIdFromRequest(req);
    if (!userId) {return json({ error: "Not authenticated" }, 401);}

    const deckId = pathname.split("/")[3];
    const body = (await req.json()) as {
      name?: string;
      description?: string;
      format?: string;
      gameVersion?: GameVersion;
      legendId?: string;
      championId?: string;
      isPublic?: boolean;
      cards?: DeckCardEntry[];
    };

    const deck = updateDeck(deckId, userId, body);
    if (!deck) {return json({ error: "Deck not found or not owned by you" }, 404);}
    return json(withMeta(deck));
  }

  // DELETE /api/saved-decks/:id — delete a deck
  if (pathname.match(/^\/api\/saved-decks\/[^/]+$/) && req.method === "DELETE") {
    const userId = getUserIdFromRequest(req);
    if (!userId) {return json({ error: "Not authenticated" }, 401);}

    const deckId = pathname.split("/")[3];
    const deleted = deleteDeck(deckId, userId);
    if (!deleted) {return json({ error: "Deck not found or not owned by you" }, 404);}
    return json({ success: true });
  }

  return null;
}
