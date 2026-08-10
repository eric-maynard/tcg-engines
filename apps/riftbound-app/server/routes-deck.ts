/**
 * Saved deck (SQLite-backed) routes under /api/saved-decks.
 */

import { createDeck, deleteDeck, getDeck, listDecks, listPublicDecks, updateDeck } from "../src/db/deck-repo";
import type { DeckCardEntry, GameVersion, SavedDeck } from "../src/db/deck-repo";
import { registry } from "./cards";
import type { DeckLegality } from "./deck-rules";
import { parseDeckText, savedDeckLegality, substituteLegendAndChampion } from "./decks";
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

/** Card totals per zone for list rows ("40 main · 8 side · 12 runes"). `main` includes the chosen champion's own copy (rule 103.2: the 40 counts it). */
export interface DeckCounts {
  main: number;
  sideboard: number;
  rune: number;
  battlefield: number;
}

export function deckCounts(cards: readonly DeckCardEntry[]): DeckCounts {
  const counts: DeckCounts = { battlefield: 0, main: 0, rune: 0, sideboard: 0 };
  for (const c of cards) {
    if (c.zone in counts) {counts[c.zone] += Math.max(0, Number(c.quantity) || 0);}
  }
  return counts;
}

/**
 * List/detail rows carry the ADVISORY legality report (`legality.legal`,
 * `legality.problems`) so pickers can badge "Legal ✓ / Not tournament-legal ⚠"
 * — it never gates saving, loading or playing — plus per-zone `counts`.
 */
function withMeta<T extends SavedDeck>(deck: T): T & DeckCardMeta & { legality: DeckLegality; counts: DeckCounts } {
  const full = "cards" in deck ? (deck as unknown as import("../src/db/deck-repo").FullDeck) : getDeck(deck.id);
  const legality = full ? savedDeckLegality(full) : { legal: true, problems: [] };
  return { ...deck, ...deckCardMeta(deck), counts: deckCounts(full?.cards ?? []), legality };
}

/** Group a card list into saved-deck entries for one zone. */
function toEntries(cards: readonly { id: string }[], zone: DeckCardEntry["zone"]): DeckCardEntry[] {
  const counts = new Map<string, number>();
  for (const c of cards) {counts.set(c.id, (counts.get(c.id) ?? 0) + 1);}
  return [...counts].map(([cardId, quantity]) => ({ cardId, quantity, zone }));
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

  // POST /api/saved-decks/import {text, name?, gameVersion?, isPublic?} —
  // paste/text import straight to a saved deck. ALWAYS 200 for a parseable
  // body: unrecognized lines come back in `errors`, construction problems in
  // `deck.legality` (advisory), a missing legend/champion is substituted
  // (`warnings`). The deck is saved either way.
  if (pathname === "/api/saved-decks/import" && req.method === "POST") {
    const userId = getUserIdFromRequest(req);
    if (!userId) {return json({ error: "Not authenticated" }, 401);}
    const body = (await req.json().catch(() => null)) as { text?: unknown; name?: unknown; gameVersion?: GameVersion; isPublic?: unknown } | null;
    if (!body || typeof body.text !== "string" || !body.text.trim()) {
      return json({ error: "text (the deck list) is required" }, 400);
    }
    const parsed = parseDeckText(body.text);
    if (!parsed.legend && !parsed.champion && parsed.main.length === 0 && parsed.runes.length === 0 && parsed.sideboard.length === 0) {
      return json({ error: "No cards recognized in the pasted list", errors: parsed.errors }, 400);
    }
    const sub = substituteLegendAndChampion({ championId: parsed.champion?.id, legendId: parsed.legend?.id, mainDeckCardIds: parsed.main.map((c) => c.id) });
    // Saved-deck convention (deck builder): the chosen champion's own copy is a "main" entry.
    const main = [...parsed.main, ...(sub.championId ? [{ id: sub.championId }] : [])];
    const cards: DeckCardEntry[] = [
      ...toEntries(main, "main"),
      ...toEntries(parsed.runes, "rune"),
      ...toEntries(parsed.battlefields, "battlefield"),
      ...toEntries(parsed.sideboard, "sideboard"),
    ];
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : (parsed.champion?.name ?? parsed.legend?.name ?? "Imported deck");
    const deck = createDeck({
      cards,
      championId: sub.championId ?? "",
      gameVersion: body.gameVersion === "preview" ? "preview" : "standard",
      isPublic: body.isPublic === true,
      legendId: sub.legendId ?? "",
      name,
      userId,
    });
    const out = withMeta(deck);
    return json({ deck: out, errors: parsed.errors, legal: out.legality.legal, legality: out.legality, warnings: sub.warnings });
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
