/**
 * Deck construction helpers (default/saved decks → DeckConfig) and the
 * in-memory deck-builder session routes under /api/deck/*.
 */

import type { Card } from "@tcg/riftbound-types/cards";
import { DeckBuilder } from "@tcg/riftbound";
import { getDeck } from "../src/db/deck-repo";
import type { FullDeck } from "../src/db/deck-repo";
import { allCards, registry } from "./cards";
import { PREVIEW_SETS, STANDARD_SETS } from "./config";
import { json } from "./http";
import type { DeckConfig, RouteCtx, RouteResult } from "./state";

// Active deck builder sessions (in-memory, keyed by session ID)
export const sessions = new Map<string, DeckBuilder>();

/**
 * Sideboards of the deck-builder sessions, keyed like `sessions`. Kept beside
 * the engine's DeckBuilder (which has no sideboard slot) so the engine
 * package stays untouched.
 */
export const sessionSideboards = new Map<string, Card[]>();

export function getOrCreateSession(sessionId: string): DeckBuilder {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, new DeckBuilder(allCards));
  }
  return sessions.get(sessionId)!;
}

export function getSideboard(sessionId: string): Card[] {
  let side = sessionSideboards.get(sessionId);
  if (!side) {
    side = [];
    sessionSideboards.set(sessionId, side);
  }
  return side;
}

/** Copies per card name across Chosen Champion + main deck + sideboard (rule 103.2.b). */
function combinedCopyCounts(sessionId: string, builder: DeckBuilder): Record<string, number> {
  const counts: Record<string, number> = {};
  const state = builder.getState();
  if (state.chosenChampion) {counts[state.chosenChampion.name] = 1;}
  for (const c of state.mainDeck) {counts[c.name] = (counts[c.name] ?? 0) + 1;}
  for (const c of getSideboard(sessionId)) {counts[c.name] = (counts[c.name] ?? 0) + 1;}
  return counts;
}

/**
 * `{state, stats}` for every builder response: the engine builder's state plus
 * `state.sideboard`, and stats whose `copies` count main + sideboard (so the
 * card grid's x/3 badge and the 3-copy limit cover both) plus `sideboardCount`
 * / `sideboardMax`.
 */
export function builderPayload(sessionId: string, builder: DeckBuilder) {
  const sideboard = getSideboard(sessionId);
  return {
    state: { ...builder.getState(), sideboard: [...sideboard] },
    stats: {
      ...builder.getStats(),
      copies: combinedCopyCounts(sessionId, builder),
      sideboardCount: sideboard.length,
      sideboardMax: MAX_SIDEBOARD_SIZE,
    },
  };
}

export type SideboardAddResult =
  | { success: true }
  | { success: false; error: { code: string; message: string } };

/**
 * Add a card to a builder session's sideboard: main-deck card types only,
 * within the legend's Domain Identity (rule 103.1.b), at most
 * MAX_SIDEBOARD_SIZE cards, and at most 3 copies per name across
 * champion + main + sideboard (rule 103.2.b).
 */
export function addToSideboard(sessionId: string, builder: DeckBuilder, card: Card): SideboardAddResult {
  const state = builder.getState();
  if (!state.legend) {
    return { error: { code: "NO_LEGEND", message: "Select a legend first" }, success: false };
  }
  if (!SIDEBOARD_CARD_TYPES.has(card.cardType)) {
    return { error: { code: "WRONG_TYPE", message: `${card.cardType} cards can't go in the sideboard` }, success: false };
  }
  const identity = builder.getDomainIdentity();
  const domains = Array.isArray(card.domain) ? card.domain : card.domain ? [card.domain] : [];
  if (identity.length > 0 && !domains.every((d) => identity.includes(d as string))) {
    return { error: { code: "DOMAIN_MISMATCH", message: `${card.name} doesn't match domain identity` }, success: false };
  }
  const side = getSideboard(sessionId);
  if (side.length >= MAX_SIDEBOARD_SIZE) {
    return { error: { code: "SIDEBOARD_FULL", message: `Sideboard is full (${MAX_SIDEBOARD_SIZE} cards)` }, success: false };
  }
  if ((combinedCopyCounts(sessionId, builder)[card.name] ?? 0) >= MAX_COPIES_PER_NAME) {
    return { error: { code: "MAX_COPIES", message: `Already have ${MAX_COPIES_PER_NAME} copies of ${card.name} (main deck + sideboard)` }, success: false };
  }
  side.push(card);
  return { success: true };
}

/** Remove one copy of `cardId` from a session's sideboard; false when absent. */
export function removeFromSideboard(sessionId: string, cardId: string): boolean {
  const side = getSideboard(sessionId);
  const idx = side.findIndex((c) => c.id === cardId);
  if (idx === -1) {return false;}
  side.splice(idx, 1);
  return true;
}

export type RuneAdjustResult =
  | { success: true }
  | { success: false; error: { code: string; message: string } };

/**
 * Shift the rune mix one step toward (`delta` = +1) or away from (-1)
 * `domain` while keeping the rune deck size fixed. The swapped rune comes
 * from / goes to the other available domain holding the most / fewest runes.
 * The deck is filled first if it isn't full yet.
 */
export function adjustRuneMix(builder: DeckBuilder, domain: string, delta: 1 | -1): RuneAdjustResult {
  const runeDomain = (r: { domain?: string | readonly string[] }) => (typeof r.domain === "string" ? r.domain : "");
  const byDomain = new Map<string, import("@tcg/riftbound-types/cards").RuneCard>();
  for (const rune of builder.getAvailableRunes()) {
    if (!byDomain.has(runeDomain(rune))) {byDomain.set(runeDomain(rune), rune);}
  }
  if (!byDomain.has(domain)) {
    return { error: { code: "RUNE_DOMAIN", message: `No ${domain || "such"} rune available for this deck` }, success: false };
  }
  if (byDomain.size < 2) {
    return { error: { code: "RUNE_SINGLE_DOMAIN", message: "Only one rune domain is available" }, success: false };
  }
  const current = builder.getState().runeDeck;
  if (current.length < 12 || current.some((r) => !byDomain.has(runeDomain(r)))) {builder.autoFillRuneDeck();}

  const runes = builder.getState().runeDeck;
  const counts = new Map<string, number>([...byDomain.keys()].map((d) => [d, 0]));
  for (const r of runes) {counts.set(runeDomain(r), (counts.get(runeDomain(r)) ?? 0) + 1);}
  const others = [...counts.entries()].filter(([d]) => d !== domain);

  const [takeFrom, giveTo] = delta === 1
    ? [others.toSorted((a, b) => b[1] - a[1])[0][0], domain]
    : [domain, others.toSorted((a, b) => a[1] - b[1])[0][0]];
  const idx = runes.findIndex((r) => runeDomain(r) === takeFrom);
  if (idx < 0) {
    return { error: { code: "RUNE_NONE_LEFT", message: `No ${takeFrom} runes left to remove` }, success: false };
  }
  builder.removeFromRuneDeck(idx);
  return builder.addToRuneDeck(byDomain.get(giveTo)!);
}

/** Rule 103.2: a Main Deck has at least 40 cards (Chosen Champion included). */
export const MIN_MAIN_DECK_SIZE = 40;

/** Rule 103.2.b: a Main Deck can include up to 3 copies of the same named card. */
export const MAX_COPIES_PER_NAME = 3;

/**
 * Rule 103.2.b: return the names of cards that appear more than
 * MAX_COPIES_PER_NAME times in the main deck (counted by card name, so
 * alternate prints of the same card share a limit). Empty when legal.
 */
export function findCopyLimitViolations(mainDeckCardIds: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const defId of mainDeckCardIds) {
    const name = registry.get(defId)?.name ?? defId;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const violations: string[] = [];
  for (const [name, count] of counts) {
    if (count > MAX_COPIES_PER_NAME) {violations.push(`${name} (x${count})`);}
  }
  return violations;
}

/**
 * Sideboard size cap. Not in the Core Rules (deck construction, rule 103,
 * only defines Legend / Main Deck / Rune Deck / Battlefields); this follows the
 * published organized-play policy — see the "Sideboarding" note at the top of
 * server/pregame.ts and README.md §Sideboarding.
 */
export const MAX_SIDEBOARD_SIZE = 8;

/** Card types that may live in a sideboard: exactly the Main Deck types (rule 103.2). */
export const SIDEBOARD_CARD_TYPES: ReadonlySet<string> = new Set(["unit", "spell", "gear", "equipment"]);

/**
 * Return a human-readable reason the sideboard is illegal, or null when it is
 * fine (or absent). Checks size ≤ MAX_SIDEBOARD_SIZE and that every card is a
 * main-deck card type (no legends / battlefields / runes). When
 * `withMainDeck` is given, the 3-copies-per-name limit (rule 103.2.b, Chosen
 * Champion included) is enforced across main deck + sideboard combined.
 */
export function findSideboardViolation(
  sideboardCardIds: readonly string[] | undefined,
  withMainDeck?: { mainDeckCardIds: readonly string[]; championId?: string },
): string | null {
  const side = sideboardCardIds ?? [];
  if (side.length === 0) {return null;}
  if (side.length > MAX_SIDEBOARD_SIZE) {
    return `sideboard has ${side.length} cards, at most ${MAX_SIDEBOARD_SIZE} allowed`;
  }
  for (const defId of side) {
    const def = registry.get(defId);
    if (!def) {return `unknown sideboard card ${defId}`;}
    if (!SIDEBOARD_CARD_TYPES.has(def.cardType)) {
      return `${def.name} is a ${def.cardType} — only units, spells and gear may be sideboarded`;
    }
  }
  if (withMainDeck) {
    // Saved decks may list the Chosen Champion inside their main entries too;
    // count it once, and only blame names the sideboard actually contributes to.
    const main = [...withMainDeck.mainDeckCardIds];
    if (withMainDeck.championId) {
      const dup = main.indexOf(withMainDeck.championId);
      if (dup !== -1) {main.splice(dup, 1);}
      main.push(withMainDeck.championId);
    }
    const sideNames = new Set(side.map((defId) => registry.get(defId)?.name ?? defId));
    const violations = findCopyLimitViolations([...main, ...side]).filter((v) => [...sideNames].some((n) => v.startsWith(`${n} (x`)));
    if (violations.length > 0) {
      return `more than ${MAX_COPIES_PER_NAME} copies across main deck + sideboard: ${violations.join(", ")} (rule 103.2.b)`;
    }
  }
  return null;
}

/** Build a default starter deck from the card pool — uses Fury/Chaos domain (Annie starter) */
export function buildDefaultDeck(domain1 = "fury", domain2 = "chaos"): DeckConfig {
  // Rule 302: a card is legal in a deck only if EVERY domain on the card is
  // within the deck's identity — a body/chaos card is not legal in a
  // fury/chaos deck. `.some()` here previously let Bullet Time (body/chaos)
  // into the Jinx starter.
  const matchesDomain = (c: { domain?: string | string[] }) =>
    c.domain && (Array.isArray(c.domain)
      ? c.domain.every((d: string) => d === domain1 || d === domain2)
      : c.domain === domain1 || c.domain === domain2);

  const units = allCards.filter((c) => c.cardType === "unit"
    && !("isChampion" in c && c.isChampion)
    && matchesDomain(c),
  );
  const spells = allCards.filter((c) => c.cardType === "spell" && matchesDomain(c));
  const gears = allCards.filter((c) => (c.cardType === "gear" || c.cardType === "equipment") && matchesDomain(c));

  // Build 40-card main deck — mix of units, spells, and gear
  const sortedUnits = [...units].toSorted((a, b) => (a.energyCost ?? 99) - (b.energyCost ?? 99));
  const sortedSpells = [...spells].toSorted((a, b) => (a.energyCost ?? 99) - (b.energyCost ?? 99));
  const sortedGears = [...gears].toSorted((a, b) => (a.energyCost ?? 99) - (b.energyCost ?? 99));
  const mainDeckCardIds: string[] = [];

  // Add up to 2 copies of each card (copy limit per Riftbound rules)
  const addCards = (pool: typeof units, limit: number) => {
    let added = 0;
    for (const card of pool) {
      if (added >= limit || mainDeckCardIds.length >= 40) {break;}
      const copies = mainDeckCardIds.filter((id) => id === card.id).length;
      if (copies < 2) {
        mainDeckCardIds.push(card.id);
        added++;
      }
    }
  };

  // Reserve slots: 28 units, 8 spells, 4 gear
  addCards(sortedUnits, 28);
  addCards(sortedSpells, 8);
  addCards(sortedGears, 4);

  // Fill remaining slots with any card type
  if (mainDeckCardIds.length < 40) {
    for (const card of [...sortedUnits, ...sortedSpells, ...sortedGears]) {
      if (mainDeckCardIds.length >= 40) {break;}
      const copies = mainDeckCardIds.filter((id) => id === card.id).length;
      if (copies < 2) {mainDeckCardIds.push(card.id);}
    }
  }

  // 12-card rune deck — mix of domain runes
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const rune1 = allCards.find((c) => c.name === `${capitalize(domain1)} Rune`);
  const rune2 = allCards.find((c) => c.name === `${capitalize(domain2)} Rune`);
  const runeDeckCardIds: string[] = [];
  for (let i = 0; i < 12; i++) {
    const rune = i < 6 ? rune1 : rune2;
    if (rune) {runeDeckCardIds.push(rune.id);}
  }

  // 3 battlefields
  const bfs = allCards.filter((c) => c.cardType === "battlefield");
  const battlefieldIds = bfs.slice(0, 3).map((bf) => bf.id);

  // Select a legend whose domains are a SUBSET of {domain1,domain2} — matching
  // "either" produced Kai'Sa (fury/mind) on a fury/chaos deck.
  let legendId: string | undefined;
  let championId: string | undefined;

  const domainsOf = (c: { domain?: string | string[] }) =>
    Array.isArray(c.domain) ? c.domain : c.domain ? [c.domain] : [];
  const legend =
    allCards.find((c) => c.cardType === "legend"
      && domainsOf(c).every((d) => d === domain1 || d === domain2)
      && domainsOf(c).length > 0) ??
    allCards.find((c) => c.cardType === "legend" && matchesDomain(c));
  if (legend) {
    legendId = legend.id;
    const tag = (legend as Record<string, unknown>).championTag as string | undefined;
    if (tag) {
      const champion = allCards.find((c) =>
        c.cardType === "unit"
        && "isChampion" in c && c.isChampion
        && "tags" in c && Array.isArray((c as Record<string, unknown>).tags)
        && ((c as Record<string, unknown>).tags as string[]).includes(tag),
      );
      if (champion) {
        championId = champion.id;
        // Exclude champion from the main deck (it goes to Champion Zone)
        const champIdx = mainDeckCardIds.indexOf(championId);
        if (champIdx !== -1) {
          mainDeckCardIds.splice(champIdx, 1);
        }
      }
    }
  }

  return { battlefieldIds, championId, legendId, mainDeckCardIds, runeDeckCardIds };
}

/** Convert a saved deck from the database into a DeckConfig for the game engine */
export function savedDeckToDeckConfig(deck: FullDeck): DeckConfig | null {
  const mainDeckCardIds: string[] = [];
  const runeDeckCardIds: string[] = [];
  const battlefieldIds: string[] = [];
  let sideboardCardIds: string[] = [];

  for (const entry of deck.cards) {
    // Rule 103.2: only "main" zone entries form the Main Deck — sideboard
    // cards must not be shuffled in (that yielded a 4th copy in hand). They
    // travel separately and only enter the deck through pregame sideboarding.
    const target =
      entry.zone === "sideboard" ? sideboardCardIds :
      entry.zone === "rune" ? runeDeckCardIds :
      (entry.zone === "battlefield" ? battlefieldIds :
      mainDeckCardIds);

    for (let i = 0; i < entry.quantity; i++) {
      target.push(entry.cardId);
    }
  }

  // Validate minimum requirements
  if (mainDeckCardIds.length === 0) {
    console.warn(`Saved deck "${deck.name}" (${deck.id}) has no main deck cards`);
    return null;
  }
  if (runeDeckCardIds.length === 0) {
    console.warn(`Saved deck "${deck.name}" (${deck.id}) has no rune deck cards`);
    return null;
  }

  // Use deck-level legend/champion IDs (DB stores them separately from deck_cards)
  let legendId: string | undefined = deck.legendId || undefined;
  let championId: string | undefined = deck.championId || undefined;

  // Fallback: scan mainDeckCardIds if deck-level IDs are missing (e.g., legacy data)
  if (!legendId || !championId) {
    for (let i = mainDeckCardIds.length - 1; i >= 0; i--) {
      const defId = mainDeckCardIds[i];
      const def = registry.get(defId);
      if (!def) {continue;}

      if (def.cardType === "legend" && !legendId) {
        legendId = defId;
        mainDeckCardIds.splice(i, 1);
      } else if ("isChampion" in def && def.isChampion && !championId) {
        championId = defId;
        mainDeckCardIds.splice(i, 1);
      }
    }
  }

  // Rules 103.1.a / 111 / 112: setup requires a Champion Legend and a Chosen
  // Champion — a deck without both cannot start a legal game.
  if (!legendId) {
    console.warn(`Saved deck "${deck.name}" (${deck.id}) has no legend`);
    return null;
  }
  if (!championId) {
    console.warn(`Saved deck "${deck.name}" (${deck.id}) has no chosen champion`);
    return null;
  }

  // Rule 103.2.b: up to 3 copies of the same named card in the Main Deck.
  const copyViolations = findCopyLimitViolations(mainDeckCardIds);
  if (copyViolations.length > 0) {
    console.warn(`Saved deck "${deck.name}" (${deck.id}) exceeds copy limit: ${copyViolations.join(", ")}`);
    return null;
  }

  // Rule 103.2 / 103.2.a: Main Deck of at least 40 cards, and the Chosen
  // Champion counts toward it (it starts in the Champion Zone, 103.2.a.1).
  const mainDeckSize = mainDeckCardIds.length + 1;
  if (mainDeckSize < MIN_MAIN_DECK_SIZE) {
    console.warn(`Saved deck "${deck.name}" (${deck.id}) main deck too small: ${mainDeckSize} < ${MIN_MAIN_DECK_SIZE}`);
    return null;
  }

  // An illegal sideboard (oversized / wrong types / copy limit across
  // main+side) is dropped rather than failing the deck: the main deck still plays.
  const sideboardProblem = findSideboardViolation(sideboardCardIds, { championId, mainDeckCardIds });
  if (sideboardProblem) {
    console.warn(`Saved deck "${deck.name}" (${deck.id}) sideboard ignored: ${sideboardProblem}`);
    sideboardCardIds = [];
  }

  return {
    battlefieldIds,
    championId,
    legendId,
    mainDeckCardIds,
    runeDeckCardIds,
    ...(sideboardCardIds.length > 0 ? { sideboardCardIds } : {}),
  };
}

/** Load a deck config by ID, falling back to default deck on error */
export function loadDeckConfig(deckId: string): DeckConfig {
  if (deckId === "default") {
    return buildDefaultDeck();
  }

  try {
    const savedDeck = getDeck(deckId);
    if (!savedDeck) {
      console.warn(`Saved deck ${deckId} not found, using default deck`);
      return buildDefaultDeck();
    }

    const config = savedDeckToDeckConfig(savedDeck);
    if (!config) {
      console.warn(`Saved deck ${deckId} is invalid, using default deck`);
      return buildDefaultDeck();
    }

    return config;
  } catch (error) {
    console.warn(`Failed to load saved deck ${deckId}, using default deck:`, error);
    return buildDefaultDeck();
  }
}

export async function handleDeckBuilderRoutes(req: Request, url: URL, _ctx: RouteCtx): RouteResult {
  const { pathname } = url;

  // GET /api/deck/prebuilt — get prebuilt deck configurations
  if (pathname === "/api/deck/prebuilt" && req.method === "GET") {
    const prebuilts = [
      { deck: buildDefaultDeck("fury", "chaos"), domains: ["fury", "chaos"], name: "Fury / Chaos Aggro" },
      { deck: buildDefaultDeck("calm", "mind"), domains: ["calm", "mind"], name: "Calm / Mind Control" },
      { deck: buildDefaultDeck("body", "order"), domains: ["body", "order"], name: "Body / Order Fortress" },
    ];
    return json(prebuilts);
  }

  // POST /api/deck/create — create a new deck builder session
  if (pathname === "/api/deck/create" && req.method === "POST") {
    const sessionId = crypto.randomUUID();
    getOrCreateSession(sessionId);
    return json({ sessionId });
  }

  // POST /api/deck/:session/legend — set legend
  if (pathname.match(/^\/api\/deck\/[^/]+\/legend$/) && req.method === "POST") {
    const sessionId = pathname.split("/")[3];
    const body = (await req.json()) as { legendId: string };
    const builder = getOrCreateSession(sessionId);

    const legend = allCards.find((c) => c.id === body.legendId && c.cardType === "legend");
    if (!legend || legend.cardType !== "legend") {return json({ error: "Legend not found" }, 404);}

    builder.setLegend(legend as import("@tcg/riftbound-types/cards").LegendCard);
    return json({
      champions: builder.getLegalChampions(),
      domainIdentity: builder.getDomainIdentity(),
      ...builderPayload(sessionId, builder),
    });
  }

  // POST /api/deck/:session/champion — set champion
  if (pathname.match(/^\/api\/deck\/[^/]+\/champion$/) && req.method === "POST") {
    const sessionId = pathname.split("/")[3];
    const body = (await req.json()) as { championId: string };
    const builder = getOrCreateSession(sessionId);

    const champ = allCards.find((c) => c.id === body.championId);
    if (!champ || champ.cardType !== "unit") {return json({ error: "Champion not found" }, 404);}

    const result = builder.setChampion(champ as import("@tcg/riftbound-types/cards").UnitCard);
    return json({ result, ...builderPayload(sessionId, builder) });
  }

  // POST /api/deck/:session/add — add card to main deck
  if (pathname.match(/^\/api\/deck\/[^/]+\/add$/) && req.method === "POST") {
    const sessionId = pathname.split("/")[3];
    const body = (await req.json()) as { cardId: string };
    const builder = getOrCreateSession(sessionId);

    const card = registry.get(body.cardId);
    if (!card) {return json({ error: "Card not found" }, 404);}

    // Rule 103.2.b counted across main deck + sideboard.
    const result = (combinedCopyCounts(sessionId, builder)[card.name] ?? 0) >= MAX_COPIES_PER_NAME
      ? { error: { code: "MAX_COPIES", message: `Already have ${MAX_COPIES_PER_NAME} copies of ${card.name} (main deck + sideboard)` }, success: false }
      : builder.addToMainDeck(card);
    return json({ result, ...builderPayload(sessionId, builder) });
  }

  // POST /api/deck/:session/remove — remove card from main deck
  if (pathname.match(/^\/api\/deck\/[^/]+\/remove$/) && req.method === "POST") {
    const sessionId = pathname.split("/")[3];
    const body = (await req.json()) as { cardId: string };
    const builder = getOrCreateSession(sessionId);

    builder.removeFromMainDeckById(body.cardId);
    return json({ ...builderPayload(sessionId, builder) });
  }

  // POST /api/deck/:session/sideboard/add {cardId} — add a card to the sideboard (≤ MAX_SIDEBOARD_SIZE)
  if (pathname.match(/^\/api\/deck\/[^/]+\/sideboard\/add$/) && req.method === "POST") {
    const sessionId = pathname.split("/")[3];
    const body = (await req.json().catch(() => ({}))) as { cardId?: string };
    const builder = getOrCreateSession(sessionId);
    const card = registry.get(body.cardId ?? "");
    if (!card) {return json({ error: "Card not found" }, 404);}
    const result = addToSideboard(sessionId, builder, card);
    return json({ result, ...builderPayload(sessionId, builder) });
  }

  // POST /api/deck/:session/sideboard/remove {cardId} — remove one copy from the sideboard
  if (pathname.match(/^\/api\/deck\/[^/]+\/sideboard\/remove$/) && req.method === "POST") {
    const sessionId = pathname.split("/")[3];
    const body = (await req.json().catch(() => ({}))) as { cardId?: string };
    const builder = getOrCreateSession(sessionId);
    removeFromSideboard(sessionId, body.cardId ?? "");
    return json({ ...builderPayload(sessionId, builder) });
  }

  // GET /api/deck/:session/available — get available cards for main deck
  if (pathname.match(/^\/api\/deck\/[^/]+\/available$/)) {
    const sessionId = pathname.split("/")[3];
    const builder = getOrCreateSession(sessionId);

    const type = url.searchParams.get("type") ?? undefined;
    const search = url.searchParams.get("search") ?? undefined;
    const energy = url.searchParams.get("energy");
    const setFilter = url.searchParams.get("set");
    const domain = url.searchParams.get("domain");
    const gv = url.searchParams.get("game_version");

    let available = builder.getAvailableMainDeckCards({
      cardType: type,
      energy: energy ? Number(energy) : undefined,
      nameSearch: search,
    });

    if (gv === "standard") {
      available = available.filter((c) => STANDARD_SETS.has(c.setId ?? ""));
    } else if (gv === "preview") {
      available = available.filter((c) => PREVIEW_SETS.has(c.setId ?? ""));
    }
    if (setFilter) {
      available = available.filter((c) => (c.setId ?? "") === setFilter);
    }
    if (domain) {
      available = available.filter((c) => {
        const d = c.domain;
        if (!d) {return false;}
        if (typeof d === "string") {return d === domain;}
        return Array.isArray(d) && d.includes(domain as (typeof d)[number]);
      });
    }

    const result = available.map((c) => ({
      cardNumber: c.cardNumber,
      cardType: c.cardType,
      domain: c.domain,
      energyCost: c.energyCost,
      id: c.id,
      might: "might" in c ? c.might : undefined,
      name: c.name,
      rarity: c.rarity,
      rulesText: c.rulesText,
      setId: c.setId,
      tags: c.tags,
    }));

    return json(result);
  }

  // GET /api/deck/:session/state — get current deck state
  if (pathname.match(/^\/api\/deck\/[^/]+\/state$/)) {
    const sessionId = pathname.split("/")[3];
    const builder = getOrCreateSession(sessionId);
    return json({ ...builderPayload(sessionId, builder), validation: builder.validate() });
  }

  // POST /api/deck/:session/runes/autofill — auto-fill rune deck
  if (pathname.match(/^\/api\/deck\/[^/]+\/runes\/autofill$/) && req.method === "POST") {
    const sessionId = pathname.split("/")[3];
    const builder = getOrCreateSession(sessionId);
    builder.autoFillRuneDeck();
    return json({ ...builderPayload(sessionId, builder) });
  }

  // POST /api/deck/:session/runes/adjust {domain, delta} — shift one rune
  // toward (+1) or away from (-1) `domain`, keeping the deck at 12: the
  // counterpart comes from / goes to the other identity domain with the
  // most / fewest runes.
  if (pathname.match(/^\/api\/deck\/[^/]+\/runes\/adjust$/) && req.method === "POST") {
    const sessionId = pathname.split("/")[3];
    const body = (await req.json()) as { domain?: string; delta?: number };
    const builder = getOrCreateSession(sessionId);
    const result = adjustRuneMix(builder, body.domain ?? "", body.delta === -1 ? -1 : 1);
    return json({ result, ...builderPayload(sessionId, builder) });
  }

  // POST /api/deck/:session/runes/set {cardIds} — replace the rune deck
  // (used when loading a saved deck so its rune mix survives).
  if (pathname.match(/^\/api\/deck\/[^/]+\/runes\/set$/) && req.method === "POST") {
    const sessionId = pathname.split("/")[3];
    const body = (await req.json()) as { cardIds?: string[] };
    const builder = getOrCreateSession(sessionId);
    const runes = (body.cardIds ?? []).map((id) => registry.get(id)).filter((c) => c?.cardType === "rune");
    if (runes.length > 0) {
      while (builder.getState().runeDeck.length > 0) {builder.removeFromRuneDeck(0);}
      for (const rune of runes) {
        builder.addToRuneDeck(rune as import("@tcg/riftbound-types/cards").RuneCard);
      }
    }
    return json({ ...builderPayload(sessionId, builder) });
  }

  // POST /api/deck/:session/battlefield — add battlefield
  if (pathname.match(/^\/api\/deck\/[^/]+\/battlefield$/) && req.method === "POST") {
    const sessionId = pathname.split("/")[3];
    const body = (await req.json()) as { battlefieldId: string };
    const builder = getOrCreateSession(sessionId);

    const bf = allCards.find((c) => c.id === body.battlefieldId && c.cardType === "battlefield");
    if (!bf) {return json({ error: "Battlefield not found" }, 404);}

    const result = builder.addBattlefield(bf as import("@tcg/riftbound-types/cards").BattlefieldCard);
    return json({ result, ...builderPayload(sessionId, builder) });
  }

  // GET /api/deck/:session/battlefields — available battlefields
  if (pathname.match(/^\/api\/deck\/[^/]+\/battlefields$/)) {
    const sessionId = pathname.split("/")[3];
    const builder = getOrCreateSession(sessionId);
    return json(builder.getAvailableBattlefields());
  }

  // GET /api/deck/:session/export — export deck as text
  if (pathname.match(/^\/api\/deck\/[^/]+\/export$/)) {
    const sessionId = pathname.split("/")[3];
    const builder = getOrCreateSession(sessionId);
    const state = builder.getState();

    function groupCards(cards: typeof allCards): string {
      const counts = new Map<string, number>();
      for (const c of cards) {
        counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
      }
      return [...counts.entries()].map(([name, count]) => `${count} ${name}`).join("\n");
    }

    const sections: string[] = [];

    if (state.legend) {
      const legendDisplay = state.legend.championTag
        ? `${state.legend.championTag}, ${state.legend.name}`
        : state.legend.name;
      sections.push(`Legend:\n1 ${legendDisplay}`);
    }
    if (state.chosenChampion) {
      sections.push(`Champion:\n1 ${state.chosenChampion.name}`);
    }
    if (state.mainDeck.length > 0) {
      sections.push(`MainDeck:\n${groupCards(state.mainDeck)}`);
    }
    if (state.battlefields.length > 0) {
      sections.push(`Battlefields:\n${groupCards(state.battlefields)}`);
    }
    if (state.runeDeck.length > 0) {
      sections.push(`Runes:\n${groupCards(state.runeDeck)}`);
    }
    const sideboard = getSideboard(sessionId);
    if (sideboard.length > 0) {
      sections.push(`Sideboard:\n${groupCards(sideboard)}`);
    }

    return new Response(sections.join("\n\n") + "\n", {
      headers: { "Content-Type": "text/plain" },
    });
  }

  // POST /api/deck/:session/import — import deck from text
  if (pathname.match(/^\/api\/deck\/[^/]+\/import$/) && req.method === "POST") {
    const sessionId = pathname.split("/")[3];
    const builder = getOrCreateSession(sessionId);
    const body = (await req.json()) as { text: string };
    const text = body.text ?? "";

    // Parse sections
    const sections: Record<string, { count: number; name: string }[]> = {};
    let currentSection: string | null = null;

    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {continue;}

      const sectionMatch = trimmed.match(/^(Legend|Champion|MainDeck|Battlefields|Runes|Sideboard):$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1];
        sections[currentSection] = [];
        continue;
      }

      if (currentSection) {
        const cardMatch = trimmed.match(/^(\d+)\s+(.+)$/);
        if (cardMatch) {
          sections[currentSection].push({ count: Number(cardMatch[1]), name: cardMatch[2].trim() });
        }
      }
    }

    // Helper: find card by name (case-insensitive)
    function findCard(name: string) {
      return allCards.find((c) => c.name.toLowerCase() === name.toLowerCase());
    }

    // Helper: find legend by "ChampionTag, LegendName" or just name
    function findLegend(name: string) {
      // Try exact match first
      const exact = allCards.find((c) => c.cardType === "legend" && c.name.toLowerCase() === name.toLowerCase());
      if (exact) {return exact;}
      // Try "Tag, Name" format (e.g., "Sivir, Battle Mistress")
      const commaIdx = name.indexOf(",");
      if (commaIdx > 0) {
        const legendName = name.slice(commaIdx + 1).trim().toLowerCase();
        const found = allCards.find((c) => c.cardType === "legend" && c.name.toLowerCase() === legendName);
        if (found) {return found;}
      }
      // Try partial match on legend name
      const lower = name.toLowerCase();
      return allCards.find((c) => c.cardType === "legend" && lower.includes(c.name.toLowerCase()));
    }

    const errors: string[] = [];

    // Clear and rebuild
    builder.clear();
    getSideboard(sessionId).length = 0;

    // Set legend
    if (sections.Legend?.[0]) {
      const legend = findLegend(sections.Legend[0].name);
      if (legend && legend.cardType === "legend") {
        builder.setLegend(legend as import("@tcg/riftbound-types/cards").LegendCard);
      } else {
        errors.push(`Legend not found: ${sections.Legend[0].name}`);
      }
    }

    // Set champion
    if (sections.Champion?.[0]) {
      const champ = findCard(sections.Champion[0].name);
      if (champ && champ.cardType === "unit") {
        const result = builder.setChampion(champ as import("@tcg/riftbound-types/cards").UnitCard);
        if (!result.success) {errors.push(`Champion error: ${result.error.message}`);}
      } else {
        errors.push(`Champion not found: ${sections.Champion[0].name}`);
      }
    }

    // Add main deck cards
    for (const entry of sections.MainDeck ?? []) {
      const card = findCard(entry.name);
      if (!card) {
        errors.push(`Card not found: ${entry.name}`);
        continue;
      }
      for (let i = 0; i < entry.count; i++) {
        const result = builder.addToMainDeck(card);
        if (!result.success) {
          errors.push(`${entry.name}: ${result.error.message}`);
          break;
        }
      }
    }

    // Add battlefields
    for (const entry of sections.Battlefields ?? []) {
      const bf = findCard(entry.name);
      if (!bf || bf.cardType !== "battlefield") {
        errors.push(`Battlefield not found: ${entry.name}`);
        continue;
      }
      for (let i = 0; i < entry.count; i++) {
        builder.addBattlefield(bf as import("@tcg/riftbound-types/cards").BattlefieldCard);
      }
    }

    // Add runes
    for (const entry of sections.Runes ?? []) {
      const rune = findCard(entry.name);
      if (!rune || rune.cardType !== "rune") {
        errors.push(`Rune not found: ${entry.name}`);
        continue;
      }
      for (let i = 0; i < entry.count; i++) {
        builder.addToRuneDeck(rune as import("@tcg/riftbound-types/cards").RuneCard);
      }
    }

    // Sideboard (after the main deck so the combined copy limit sees it)
    for (const entry of sections.Sideboard ?? []) {
      const card = findCard(entry.name);
      if (!card) {
        errors.push(`Sideboard card not found: ${entry.name}`);
        continue;
      }
      for (let i = 0; i < entry.count; i++) {
        const result = addToSideboard(sessionId, builder, card);
        if (!result.success) {
          errors.push(`Sideboard ${entry.name}: ${result.error.message}`);
          break;
        }
      }
    }

    return json({
      errors,
      ...builderPayload(sessionId, builder),
      validation: builder.validate(),
    });
  }

  return null;
}
