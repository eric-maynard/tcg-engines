/**
 * Deck construction rules — the single source of truth for the numbers
 * (served to clients via GET /api/config `deckRules`) and the ADVISORY
 * legality report used by the builder, saved decks, import and lobbies.
 *
 * Policy: legality never blocks importing, saving, editing or playing a deck.
 * `validateDeckConfig()` reports `{legal, problems}`; callers surface it as
 * warnings. Only a lobby created with `enforceLegality: true` refuses to start
 * with an illegal deck (see server/ws-lobby.ts). Things that make a game
 * impossible to seat (0-card main deck) are handled where decks are loaded,
 * not here.
 */

import { validateDeck as engineValidateDeck } from "@tcg/riftbound";
import type { BattlefieldCard, Card, LegendCard, RuneCard, UnitCard } from "@tcg/riftbound-types/cards";
import { registry } from "./cards";

/** Rule 103 numbers + the organized-play sideboard cap (see server/pregame.ts §Sideboarding). */
export const DECK_RULES = {
  /** Rule 103.4 / 644.4.a: a deck provides exactly 3 battlefields. */
  battlefieldCount: 3,
  /** Rule 103.2.b: up to 3 copies of a named card across champion + main deck + sideboard. */
  copyLimit: 3,
  /** Rule 103.2: Main Deck of at least 40 cards, Chosen Champion included. */
  mainMin: 40,
  /** Rule 103.3.a: exactly 12 runes. */
  runeCount: 12,
  /** OP policy: sideboard of up to 10 main-deck-type cards. */
  sideboardMax: 10,
  /** Rule 103.2.d: at most 3 Signature cards. */
  signatureMax: 3,
} as const;

export const MIN_MAIN_DECK_SIZE = DECK_RULES.mainMin;
export const MAX_COPIES_PER_NAME = DECK_RULES.copyLimit;
export const MAX_SIDEBOARD_SIZE = DECK_RULES.sideboardMax;

/** Card types that may live in a main deck / sideboard (rule 103.2). */
export const SIDEBOARD_CARD_TYPES: ReadonlySet<string> = new Set(["unit", "spell", "gear", "equipment"]);

export interface DeckProblem {
  code: string;
  message: string;
  /** `warning` = could not be verified (incomplete card data) — never makes a deck illegal. */
  severity: "error" | "warning";
  cardIds?: string[];
}

export interface DeckLegality {
  legal: boolean;
  problems: DeckProblem[];
}

/** The id-level shape every deck source (saved deck, builder session, API body) reduces to. */
export interface DeckListIds {
  legendId?: string | null;
  championId?: string | null;
  /** Main deck WITHOUT the chosen champion's own copy. */
  mainDeckCardIds: readonly string[];
  runeDeckCardIds: readonly string[];
  battlefieldIds: readonly string[];
  sideboardCardIds?: readonly string[];
}

/**
 * Rule 103.2.b: names appearing more than `copyLimit` times in `cardIds`
 * (counted by card name, so alternate prints share a limit), as "Name (xN)".
 */
export function findCopyLimitViolations(cardIds: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const defId of cardIds) {
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
 * Human-readable reason a sideboard is not tournament-legal, or null. Size ≤
 * sideboardMax, main-deck card types only, and (with `withMainDeck`) the copy
 * limit across champion + main + sideboard. Advisory — callers warn, not refuse.
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

function domainsOf(card: { domain?: unknown } | undefined): string[] {
  const d = card?.domain;
  return typeof d === "string" ? [d] : Array.isArray(d) ? (d as string[]) : [];
}

/**
 * Full advisory legality report for a deck given as definition ids. Never
 * throws; unknown ids, a missing legend / champion etc. are reported as
 * problems. Checks that depend on card data this repo may not have complete
 * (champion tags, signature flags) degrade to `warning`s saying "unknown".
 */
export function validateDeckConfig(deck: DeckListIds, opts: { mode?: "duel" | "match" } = {}): DeckLegality {
  const problems: DeckProblem[] = [];
  const add = (p: DeckProblem) => {
    const existing = problems.find((q) => q.code === p.code && q.message === p.message);
    if (existing) {
      if (p.cardIds) {existing.cardIds = [...new Set([...(existing.cardIds ?? []), ...p.cardIds])];}
      return;
    }
    problems.push(p);
  };

  const resolve = (ids: readonly string[], where: string): Card[] => {
    const out: Card[] = [];
    const unknown: string[] = [];
    for (const id of ids) {
      const def = registry.get(id);
      if (def) {out.push(def);} else {unknown.push(id);}
    }
    if (unknown.length > 0) {
      add({ cardIds: [...new Set(unknown)], code: "UNKNOWN_CARD", message: `${unknown.length} unknown card id(s) in the ${where}: ${[...new Set(unknown)].join(", ")}`, severity: "error" });
    }
    return out;
  };

  const main = resolve(deck.mainDeckCardIds ?? [], "main deck");
  const runes = resolve(deck.runeDeckCardIds ?? [], "rune deck") as RuneCard[];
  const battlefields = resolve(deck.battlefieldIds ?? [], "battlefields") as BattlefieldCard[];
  const side = resolve(deck.sideboardCardIds ?? [], "sideboard");

  const legendDef = deck.legendId ? registry.get(deck.legendId) : undefined;
  const legend = legendDef?.cardType === "legend" ? (legendDef as LegendCard) : undefined;
  if (!legend) {
    add({ code: "NO_LEGEND", message: deck.legendId ? `Legend ${deck.legendId} is not a known legend card` : "No Champion Legend selected (rule 103.1)", severity: "error", ...(deck.legendId ? { cardIds: [deck.legendId] } : {}) });
  }
  const championDef = deck.championId ? registry.get(deck.championId) : undefined;
  const champion = championDef?.cardType === "unit" ? (championDef as UnitCard) : undefined;
  if (!champion) {
    add({ code: "NO_CHAMPION", message: deck.championId ? `Chosen Champion ${deck.championId} is not a known unit card` : "No Chosen Champion selected (rule 103.2.a)", severity: "error", ...(deck.championId ? { cardIds: [deck.championId] } : {}) });
  }

  // Wrong card types in the main deck (the engine validator assumes typed input).
  for (const c of main) {
    if (!SIDEBOARD_CARD_TYPES.has(c.cardType)) {
      add({ cardIds: [c.id], code: "MAIN_DECK_WRONG_TYPE", message: `${c.name} is a ${c.cardType} and cannot be in the main deck`, severity: "error" });
    }
  }

  // Rule 103.2.b across champion + main + sideboard (the engine check only sees the main deck).
  const byName = new Map<string, { count: number; ids: Set<string> }>();
  for (const c of [...(champion ? [champion as Card] : []), ...main, ...side]) {
    const e = byName.get(c.name) ?? { count: 0, ids: new Set<string>() };
    e.count++;
    e.ids.add(c.id);
    byName.set(c.name, e);
  }
  for (const [name, { count, ids }] of byName) {
    if (count > DECK_RULES.copyLimit) {
      add({ cardIds: [...ids], code: "TOO_MANY_COPIES", message: `${name}: ${count} copies (max ${DECK_RULES.copyLimit} across champion + main deck + sideboard, rule 103.2.b)`, severity: "error" });
    }
  }

  // Sideboard policy.
  if ((deck.sideboardCardIds?.length ?? 0) > DECK_RULES.sideboardMax) {
    add({ code: "SIDEBOARD_TOO_LARGE", message: `Sideboard has ${deck.sideboardCardIds?.length ?? 0} cards (max ${DECK_RULES.sideboardMax})`, severity: "error" });
  }
  for (const c of side) {
    if (!SIDEBOARD_CARD_TYPES.has(c.cardType)) {
      add({ cardIds: [c.id], code: "SIDEBOARD_WRONG_TYPE", message: `${c.name} is a ${c.cardType} — only units, spells and gear may be sideboarded`, severity: "error" });
    } else if (legend && domainsOf(c).length > 0 && !domainsOf(c).every((d) => domainsOf(legend).includes(d))) {
      add({ cardIds: [c.id], code: "SIDEBOARD_DOMAIN_VIOLATION", message: `Sideboard card ${c.name} [${domainsOf(c).join(", ")}] is outside the legend's domain identity [${domainsOf(legend).join(", ")}]`, severity: "error" });
    }
  }

  if (legend && champion) {
    const typedMain = main.filter((c) => SIDEBOARD_CARD_TYPES.has(c.cardType));
    const result = engineValidateDeck({
      battlefields,
      chosenChampion: champion,
      legend,
      mainDeck: [champion as Card, ...typedMain],
      mode: opts.mode ?? "duel",
      runeDeck: runes,
    });
    const championHasTags = (champion.tags?.length ?? 0) > 0;
    for (const e of result.errors) {
      // Combined copy limit above supersedes the engine's main-deck-only count.
      if (e.code === "TOO_MANY_COPIES") {continue;}
      if (e.code === "CHAMPION_TAG_MISMATCH" && (!championHasTags || !legend.championTag)) {
        add({ cardIds: [champion.id], code: "CHAMPION_TAG_UNKNOWN", message: `Cannot verify that ${champion.name} matches ${legend.name}: champion tag data unknown for this card`, severity: "warning" });
        continue;
      }
      if (e.code === "SIGNATURE_TAG_MISMATCH" && !legend.championTag) {
        add({ code: "SIGNATURE_DATA_UNKNOWN", message: `Cannot verify Signature cards: ${legend.name} has no champion tag data`, severity: "warning" });
        continue;
      }
      // The deck builder does not register battlefields (the game deals random
      // ones for such decks), so "none" is a note, not a violation; a wrong
      // non-zero count is.
      if (e.code === "WRONG_BATTLEFIELD_COUNT" && (deck.battlefieldIds?.length ?? 0) === 0) {
        add({ code: "BATTLEFIELDS_NOT_SET", message: `No battlefields registered (rule 103.4 wants ${DECK_RULES.battlefieldCount}) — random battlefields will be used`, severity: "warning" });
        continue;
      }
      const named = /"([^"]+)"/.exec(e.message)?.[1];
      const ids = named ? [...typedMain, ...runes, ...battlefields].filter((c) => c.name === named).map((c) => c.id) : [];
      add({ code: e.code, message: e.message, severity: "error", ...(ids.length > 0 ? { cardIds: [...new Set(ids)] } : {}) });
    }
  } else {
    // Without a legend/champion the engine validator cannot run; still report sizes.
    const mainSize = main.length + (champion ? 1 : 0);
    if (mainSize < DECK_RULES.mainMin) {
      add({ code: "MAIN_DECK_TOO_SMALL", message: `Main deck must contain at least ${DECK_RULES.mainMin} cards, but has ${mainSize}`, severity: "error" });
    }
    if (runes.length !== DECK_RULES.runeCount) {
      add({ code: "RUNE_DECK_WRONG_SIZE", message: `Rune deck must contain exactly ${DECK_RULES.runeCount} cards, but has ${runes.length}`, severity: "error" });
    }
  }

  return { legal: problems.every((p) => p.severity !== "error"), problems };
}

/** One-line summary for logs / lobby status ("3 issues: TOO_MANY_COPIES, …"). No card names (deck contents stay private). */
export function summarizeLegality(report: DeckLegality): string {
  if (report.legal) {return report.problems.length > 0 ? `legal (${report.problems.length} unverifiable)` : "legal";}
  const codes = [...new Set(report.problems.filter((p) => p.severity === "error").map((p) => p.code))];
  const n = report.problems.filter((p) => p.severity === "error").length;
  return `${n} issue${n === 1 ? "" : "s"}: ${codes.join(", ")}`;
}
