/**
 * Card catalogue routes: /api/cards, /api/cards/:id, /api/config, /api/sets,
 * /api/sets/:id, /api/legends.
 */

import { allCards, loadSetJson, registry } from "./cards";
import { PREVIEW_SETS, SANDBOX_ENABLED, STANDARD_SETS } from "./config";
import { DECK_RULES } from "./deck-rules";
import { json } from "./http";
import type { RouteCtx, RouteResult } from "./state";

export async function handleCardRoutes(req: Request, url: URL, _ctx: RouteCtx): RouteResult {
  const { pathname } = url;

  // GET /api/cards — all cards (with optional filters)
  if (pathname === "/api/cards") {
    const type = url.searchParams.get("type");
    const set = url.searchParams.get("set");
    const domain = url.searchParams.get("domain");
    const search = url.searchParams.get("search");
    const gameVersion = url.searchParams.get("game_version");

    let cards = allCards;
    if (gameVersion === "standard") {
      cards = cards.filter((c) => STANDARD_SETS.has(c.setId ?? ""));
    } else if (gameVersion === "preview") {
      cards = cards.filter((c) => PREVIEW_SETS.has(c.setId ?? ""));
    }
    if (type) {cards = cards.filter((c) => c.cardType === type);}
    if (set) {cards = cards.filter((c) => (c.setId ?? "") === set);}
    if (domain) {
      cards = cards.filter((c) => {
        const d = c.domain;
        if (!d) {return false;}
        if (typeof d === "string") {return d === domain;}
        return d.includes(domain as typeof d[number]);
      });
    }
    if (search) {
      const s = search.toLowerCase();
      cards = cards.filter(
        (c) => c.name.toLowerCase().includes(s) || (c.rulesText ?? "").toLowerCase().includes(s),
      );
    }

    // Return lightweight card list (no abilities blob)
    const result = cards.map((c) => ({
      cardType: c.cardType,
      domain: c.domain,
      energyCost: c.energyCost,
      id: c.id,
      isChampion: "isChampion" in c ? c.isChampion : undefined,
      might: "might" in c ? c.might : undefined,
      name: c.name,
      rarity: c.rarity,
      rulesText: c.rulesText,
      setId: c.setId,
      tags: c.tags,
    }));

    return json(result);
  }

  // GET /api/cards/:id — single card with full detail
  if (pathname.startsWith("/api/cards/") && pathname.split("/").length === 4) {
    const cardId = pathname.split("/")[3];
    const card = registry.get(cardId);
    if (!card) {return json({ error: "Card not found" }, 404);}
    return json(card);
  }

  // GET /api/config — client feature flags + deck construction numbers (the
  // builder / pregame overlay read caps from here instead of hardcoding them).
  // Legality is advisory everywhere: `deckRules.enforced` is false.
  if (pathname === "/api/config") {
    return json({ deckRules: { ...DECK_RULES, enforced: false }, sandboxEnabled: SANDBOX_ENABLED });
  }

  // GET /api/sets — available sets
  if (pathname === "/api/sets") {
    return json([
      { count: 298, id: "OGN", name: "Origins" },
      { count: 222, id: "SFD", name: "Spiritforged" },
      { count: 225, id: "UNL", name: "Unleashed" },
    ]);
  }

  // GET /api/sets/:id — full set data with images and abilities
  if (pathname.startsWith("/api/sets/") && pathname.split("/").length === 4) {
    const setId = pathname.split("/")[3].toUpperCase();
    const data = loadSetJson(setId);
    if (!data) {return json({ error: "Set not found" }, 404);}
    return json(data);
  }

  // GET /api/legends — all legend cards
  if (pathname === "/api/legends") {
    const legends = allCards.filter((c) => c.cardType === "legend");
    return json(legends);
  }

  return null;
}
