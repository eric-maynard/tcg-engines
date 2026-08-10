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
import {
  DECK_RULES,
  type DeckLegality,
  MAX_COPIES_PER_NAME,
  MAX_SIDEBOARD_SIZE,
  MIN_MAIN_DECK_SIZE,
  SIDEBOARD_CARD_TYPES,
  findCopyLimitViolations,
  findSideboardViolation,
  validateDeckConfig,
} from "./deck-rules";
import { json } from "./http";
import type { DeckConfig, RouteCtx, RouteResult } from "./state";

// Rule numbers + advisory checks live in ./deck-rules (single source, also
// served as /api/config deckRules); re-exported for existing importers.
export {
  DECK_RULES,
  MAX_COPIES_PER_NAME,
  MAX_SIDEBOARD_SIZE,
  MIN_MAIN_DECK_SIZE,
  SIDEBOARD_CARD_TYPES,
  findCopyLimitViolations,
  findSideboardViolation,
  validateDeckConfig,
};
export type { DeckLegality, DeckProblem } from "./deck-rules";

// Active deck builder sessions (in-memory, keyed by session ID)
export const sessions = new Map<string, DeckBuilder>();

/**
 * Sideboards of the deck-builder sessions, keyed like `sessions`. Kept beside
 * the engine's DeckBuilder (which has no sideboard slot) so the engine
 * package stays untouched.
 */
export const sessionSideboards = new Map<string, Card[]>();

/**
 * Builder sessions are LENIENT: construction rules (domain identity, copy
 * limit, champion tag, sideboard cap…) never refuse an add — they surface as
 * `legality.problems` on every payload instead, so illegal lists can be
 * imported, saved and play-tested.
 */
export function getOrCreateSession(sessionId: string): DeckBuilder {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, new DeckBuilder(allCards, "duel", { lenient: true }));
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

/** Advisory legality of a builder session's current list (legend/champion may still be unset). */
export function builderLegality(sessionId: string, builder: DeckBuilder): DeckLegality {
  const state = builder.getState();
  return validateDeckConfig({
    battlefieldIds: state.battlefields.map((c) => c.id),
    championId: state.chosenChampion?.id,
    legendId: state.legend?.id,
    mainDeckCardIds: state.mainDeck.map((c) => c.id),
    runeDeckCardIds: state.runeDeck.map((c) => c.id),
    sideboardCardIds: getSideboard(sessionId).map((c) => c.id),
  }, { mode: state.mode === "match" ? "match" : "duel" });
}

/**
 * `{state, stats, legality}` for every builder response: the engine builder's
 * state plus `state.sideboard`, stats whose `copies` count main + sideboard
 * (so the card grid's x/3 badge covers both) plus `sideboardCount` /
 * `sideboardMax`, and the advisory legality report (warnings panel + badge).
 */
export function builderPayload(sessionId: string, builder: DeckBuilder) {
  const sideboard = getSideboard(sessionId);
  return {
    legality: builderLegality(sessionId, builder),
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
 * Add a card to a builder session's sideboard. Only structural sanity is
 * enforced (main-deck card types); the sideboard cap (DECK_RULES.sideboardMax),
 * domain identity and the combined copy limit are advisory and reported via
 * `builderLegality` — see the policy note in ./deck-rules.
 */
export function addToSideboard(sessionId: string, _builder: DeckBuilder, card: Card): SideboardAddResult {
  if (!SIDEBOARD_CARD_TYPES.has(card.cardType)) {
    return { error: { code: "WRONG_TYPE", message: `${card.cardType} cards can't go in the sideboard` }, success: false };
  }
  getSideboard(sessionId).push(card);
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

const domainsOf = (c: { domain?: unknown } | undefined): string[] => {
  const d = c?.domain;
  return typeof d === "string" ? [d] : Array.isArray(d) ? (d as string[]) : [];
};

/**
 * A game cannot be seated without a Champion Legend and a Chosen Champion
 * (rules 111 / 112). When a deck lacks a usable one, pick sensible defaults
 * rather than refusing: the legend whose domains cover most of the main deck,
 * and a champion unit carrying that legend's tag (preferring one the deck
 * already runs). Returns the ids plus human-readable warnings.
 */
export function substituteLegendAndChampion(deck: { legendId?: string; championId?: string; mainDeckCardIds: readonly string[] }): { legendId?: string; championId?: string; warnings: string[] } {
  const warnings: string[] = [];
  let legend = deck.legendId ? registry.get(deck.legendId) : undefined;
  if (legend?.cardType !== "legend") {
    const weight = new Map<string, number>();
    for (const id of deck.mainDeckCardIds) {
      for (const d of domainsOf(registry.get(id))) {weight.set(d, (weight.get(d) ?? 0) + 1);}
    }
    const legends = allCards.filter((c) => c.cardType === "legend");
    const score = (c: Card) => domainsOf(c).reduce((n, d) => n + (weight.get(d) ?? 0), 0);
    legend = legends.toSorted((a, b) => score(b) - score(a))[0];
    if (legend) {warnings.push(`no usable legend${deck.legendId ? ` (${deck.legendId})` : ""} — using ${legend.name}`);}
  }
  let champion = deck.championId ? registry.get(deck.championId) : undefined;
  if (champion?.cardType !== "unit") {
    const tag = (legend as { championTag?: string } | undefined)?.championTag;
    const isChampionFor = (c: Card | undefined) => c?.cardType === "unit" && "isChampion" in c && c.isChampion === true && (!tag || (c.tags ?? []).includes(tag));
    champion = deck.mainDeckCardIds.map((id) => registry.get(id)).find(isChampionFor)
      ?? allCards.find(isChampionFor)
      ?? allCards.find((c) => c.cardType === "unit" && "isChampion" in c && c.isChampion === true);
    if (champion) {warnings.push(`no usable chosen champion${deck.championId ? ` (${deck.championId})` : ""} — using ${champion.name}`);}
  }
  return { championId: champion?.id, legendId: legend?.id, warnings };
}

/**
 * Convert a saved deck into a DeckConfig for the game engine. Construction
 * legality is ADVISORY (see ./deck-rules): over-limit copies, short main
 * decks, off-identity cards and oversized sideboards all load as saved. Only
 * decks that cannot be seated at all return null — no main-deck cards or no
 * runes. A missing/unknown legend or champion is substituted with a warning.
 */
export function savedDeckToDeckConfig(deck: FullDeck): DeckConfig | null {
  const mainDeckCardIds: string[] = [];
  const runeDeckCardIds: string[] = [];
  const battlefieldIds: string[] = [];
  const sideboardCardIds: string[] = [];

  for (const entry of deck.cards) {
    // Rule 103.2: only "main" zone entries form the Main Deck — sideboard
    // cards travel separately and only enter the deck through pregame sideboarding.
    const target =
      entry.zone === "sideboard" ? sideboardCardIds :
      entry.zone === "rune" ? runeDeckCardIds :
      (entry.zone === "battlefield" ? battlefieldIds :
      mainDeckCardIds);

    for (let i = 0; i < entry.quantity; i++) {
      target.push(entry.cardId);
    }
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
  } else {
    // The deck builder saves the Chosen Champion's own copy inside the "main"
    // entries (rule 103.2.a: it counts toward the 40). It starts in the
    // Champion Zone (103.2.a.1), so take exactly one copy out of the deck.
    const own = mainDeckCardIds.indexOf(championId);
    if (own !== -1) {mainDeckCardIds.splice(own, 1);}
  }

  if (mainDeckCardIds.length === 0) {
    console.warn(`Saved deck "${deck.name}" (${deck.id}) has no main deck cards`);
    return null;
  }
  if (runeDeckCardIds.length === 0) {
    console.warn(`Saved deck "${deck.name}" (${deck.id}) has no rune deck cards`);
    return null;
  }

  // Rules 111 / 112: a game needs a legend and a chosen champion — substitute defaults.
  const sub = substituteLegendAndChampion({ championId, legendId, mainDeckCardIds });
  for (const w of sub.warnings) {console.warn(`Saved deck "${deck.name}" (${deck.id}): ${w}`);}
  legendId = sub.legendId;
  championId = sub.championId;

  // Advisory only: log, never refuse or strip.
  const legality = validateDeckConfig({ battlefieldIds, championId, legendId, mainDeckCardIds, runeDeckCardIds, sideboardCardIds });
  if (!legality.legal) {
    console.warn(`Saved deck "${deck.name}" (${deck.id}) is not tournament-legal (allowed): ${legality.problems.filter((p) => p.severity === "error").map((p) => p.code).join(", ")}`);
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

/** Advisory legality of a saved deck exactly as stored (no substitution). */
export function savedDeckLegality(deck: FullDeck): DeckLegality {
  const ids = { battlefieldIds: [] as string[], mainDeckCardIds: [] as string[], runeDeckCardIds: [] as string[], sideboardCardIds: [] as string[] };
  for (const entry of deck.cards) {
    const target = entry.zone === "sideboard" ? ids.sideboardCardIds : entry.zone === "rune" ? ids.runeDeckCardIds : entry.zone === "battlefield" ? ids.battlefieldIds : ids.mainDeckCardIds;
    for (let i = 0; i < entry.quantity; i++) {target.push(entry.cardId);}
  }
  // One "main" copy of the chosen champion is the champion itself (see savedDeckToDeckConfig).
  const own = ids.mainDeckCardIds.indexOf(deck.championId);
  if (own !== -1) {ids.mainDeckCardIds.splice(own, 1);}
  return validateDeckConfig({ ...ids, championId: deck.championId || undefined, legendId: deck.legendId || undefined }, { mode: deck.format === "match" ? "match" : "duel" });
}

/**
 * Legality of whatever a lobby seat selected: "default"/empty → the starter
 * (legal by construction); a saved deck id → its stored list. Unknown ids
 * report legal (loadDeckConfig falls back to the starter for them).
 */
export function deckLegalityForId(deckId: string | null | undefined): DeckLegality {
  if (!deckId || deckId === "default") {return { legal: true, problems: [] };}
  try {
    const saved = getDeck(deckId);
    return saved ? savedDeckLegality(saved) : { legal: true, problems: [] };
  } catch {
    return { legal: true, problems: [] };
  }
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

/** A text deck list resolved against the card pool. `errors` = unrecognized lines only. */
export interface ParsedDeckList {
  legend?: Card;
  champion?: Card;
  main: Card[];
  battlefields: Card[];
  runes: Card[];
  sideboard: Card[];
  errors: string[];
}

const SECTION_ALIASES: Record<string, keyof Omit<ParsedDeckList, "errors"> | "legend" | "champion"> = {
  battlefield: "battlefields", battlefields: "battlefields",
  champion: "champion", chosenchampion: "champion",
  legend: "legend", championlegend: "legend",
  main: "main", maindeck: "main", deck: "main",
  rune: "runes", runedeck: "runes", runes: "runes",
  side: "sideboard", sideboard: "sideboard",
};

/**
 * Parse a pasted deck list ("Section:" headers, then "N Card Name" / "Nx Card
 * Name" lines; a trailing "(SET 123)" print marker is ignored). Tolerant by
 * design: nothing about construction legality is checked here — every
 * recognized card is kept, however many copies or whatever its domain.
 */
export function parseDeckText(text: string): ParsedDeckList {
  const out: ParsedDeckList = { battlefields: [], errors: [], main: [], runes: [], sideboard: [] };
  const byName = (name: string, type?: string) => {
    const want = name.toLowerCase();
    const pool = type ? allCards.filter((c) => c.cardType === type) : allCards;
    return pool.find((c) => c.name.toLowerCase() === want)
      ?? pool.find((c) => c.name.toLowerCase() === want.replace(/\s*\([^)]*\)\s*$/, ""));
  };
  // Legend lines are often "ChampionTag, Legend Name".
  const findLegend = (name: string) => {
    const exact = byName(name, "legend");
    if (exact) {return exact;}
    const commaIdx = name.indexOf(",");
    if (commaIdx > 0) {
      const found = byName(name.slice(commaIdx + 1).trim(), "legend");
      if (found) {return found;}
    }
    const lower = name.toLowerCase();
    return allCards.find((c) => c.cardType === "legend" && lower.includes(c.name.toLowerCase()));
  };

  let section: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {continue;}
    const header = trimmed.match(/^([A-Za-z ]+):\s*$/);
    if (header) {
      section = SECTION_ALIASES[header[1]!.toLowerCase().replace(/\s+/g, "")] ?? null;
      if (!section) {out.errors.push(`Unknown section: ${header[1]}`);}
      continue;
    }
    if (!section) {continue;}
    const m = trimmed.match(/^(\d+)\s*x?\s+(.+)$/i);
    const count = m ? Number(m[1]) : 1;
    const name = (m ? m[2]! : trimmed).trim();
    if (section === "legend") {
      const legend = findLegend(name);
      if (legend) {out.legend = legend;} else {out.errors.push(`Legend not found: ${name}`);}
      continue;
    }
    if (section === "champion") {
      const champ = byName(name, "unit");
      if (champ) {out.champion = champ;} else {out.errors.push(`Champion not found: ${name}`);}
      continue;
    }
    const type = section === "battlefields" ? "battlefield" : section === "runes" ? "rune" : undefined;
    const card = byName(name, type) ?? (type ? undefined : byName(name));
    if (!card) {
      out.errors.push(`${section === "sideboard" ? "Sideboard card" : section === "battlefields" ? "Battlefield" : section === "runes" ? "Rune" : "Card"} not found: ${name}`);
      continue;
    }
    const bucket = out[section as "main" | "battlefields" | "runes" | "sideboard"];
    for (let i = 0; i < count; i++) {bucket.push(card);}
  }
  return out;
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

    // Copy limit / domain identity are advisory (payload.legality), never refused.
    const result = builder.addToMainDeck(card);
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

  // POST /api/deck/:session/sideboard/add {cardId} — add a card to the sideboard (cap is advisory)
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

  // POST /api/deck/:session/import — import deck from text. Never refuses a
  // list: `errors` holds only unrecognized names; construction problems are in
  // `legality` (advisory).
  if (pathname.match(/^\/api\/deck\/[^/]+\/import$/) && req.method === "POST") {
    const sessionId = pathname.split("/")[3];
    const builder = getOrCreateSession(sessionId);
    const body = (await req.json().catch(() => ({}))) as { text?: string };
    const parsed = parseDeckText(body.text ?? "");

    // Clear and rebuild
    builder.clear();
    getSideboard(sessionId).length = 0;

    if (parsed.legend) {builder.setLegend(parsed.legend as import("@tcg/riftbound-types/cards").LegendCard);}
    if (parsed.champion) {builder.setChampion(parsed.champion as import("@tcg/riftbound-types/cards").UnitCard);}
    for (const card of parsed.main) {builder.addToMainDeck(card);}
    for (const bf of parsed.battlefields) {builder.addBattlefield(bf as import("@tcg/riftbound-types/cards").BattlefieldCard);}
    for (const rune of parsed.runes) {builder.addToRuneDeck(rune as import("@tcg/riftbound-types/cards").RuneCard);}
    for (const card of parsed.sideboard) {addToSideboard(sessionId, builder, card);}

    return json({
      errors: parsed.errors,
      ...builderPayload(sessionId, builder),
      validation: builder.validate(),
    });
  }

  return null;
}
