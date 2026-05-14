/**
 * Decklist Parser & Formatter
 *
 * Plain-text decklist format compatible with RiftAtlas-style sharing:
 *
 *   # Deck Name
 *
 *   ## Legends
 *   1 Trundle
 *
 *   ## Battlefields
 *   3 Altar to Unity
 *
 *   ## Main Deck
 *   3 Chemtech Enforcer
 *   ...
 *
 *   ## Rune Deck
 *   3 Body Rune
 *
 * Names map to card ids via the @tcg/riftbound-cards registry passed in.
 * Both directions (parse / format) round-trip cleanly when every card name
 * is unique within its zone (which it is in the current pool).
 */
import type { Card } from "@tcg/riftbound-types/cards";
import type { DeckCardEntry } from "./db/deck-repo";

export type DeckZone = DeckCardEntry["zone"];

export interface ParsedDeck {
  name: string;
  legendId: string | null;
  championId: string | null;
  battlefieldIds: string[]; // Raw ids, may include duplicates
  cards: DeckCardEntry[]; // Zone-tagged entries for deck_cards table
  warnings: string[];
}

/**
 * The (case-insensitive, trimmed) section markers we recognise. We accept a
 * few aliases each so users pasting decks from other tools don't trip on
 * trivial wording differences.
 */
const SECTION_LEGENDS = /^#{1,3}\s*legend[s]?\s*$/i;
const SECTION_BATTLEFIELDS = /^#{1,3}\s*battlefield[s]?\s*$/i;
const SECTION_MAIN = /^#{1,3}\s*(main(\s*deck)?|deck)\s*$/i;
const SECTION_RUNES = /^#{1,3}\s*rune[s]?(\s*deck)?\s*$/i;
const SECTION_CHAMPIONS = /^#{1,3}\s*champion[s]?\s*$/i;

type Section = "legends" | "champions" | "battlefields" | "main" | "runes" | null;

/** Match `3 Card Name`, `3x Card Name`, `3× Card Name`, `3 × Card Name`. */
const ENTRY_RE = /^(\d+)\s*[x×]?\s+(.+?)\s*$/i;

interface BuildLookup {
  /** Lower-cased name → first matching card. */
  byName: Map<string, Card>;
  /** Direct id → card (so a paste can mix names and ids). */
  byId: Map<string, Card>;
}

function buildLookup(cards: readonly Card[]): BuildLookup {
  const byName = new Map<string, Card>();
  const byId = new Map<string, Card>();
  for (const c of cards) {
    byId.set(c.id, c);
    const key = c.name.toLowerCase();
    if (!byName.has(key)) {byName.set(key, c);}
  }
  return { byId, byName };
}

function lookupCard(token: string, lookup: BuildLookup): Card | null {
  const trimmed = token.trim();
  const direct = lookup.byId.get(trimmed);
  if (direct) {return direct;}
  const byName = lookup.byName.get(trimmed.toLowerCase());
  return byName ?? null;
}

/**
 * Parse a plain-text decklist into a structured form. Unknown names are
 * collected into `warnings` and dropped — the caller decides whether to
 * reject the import or accept it partially.
 */
export function parseDecklist(text: string, cards: readonly Card[]): ParsedDeck {
  const lookup = buildLookup(cards);
  const out: ParsedDeck = {
    battlefieldIds: [],
    cards: [],
    championId: null,
    legendId: null,
    name: "",
    warnings: [],
  };

  const lines = text.split(/\r?\n/);
  let section: Section = null;
  let sawName = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {continue;}

    // Section headers.
    if (SECTION_LEGENDS.test(line)) {section = "legends"; continue;}
    if (SECTION_CHAMPIONS.test(line)) {section = "champions"; continue;}
    if (SECTION_BATTLEFIELDS.test(line)) {section = "battlefields"; continue;}
    if (SECTION_MAIN.test(line)) {section = "main"; continue;}
    if (SECTION_RUNES.test(line)) {section = "runes"; continue;}

    // Title line: first `# ...` we see that isn't a known section.
    if (line.startsWith("#") && !sawName) {
      out.name = line.replace(/^#+\s*/, "").trim();
      sawName = true;
      continue;
    }

    // Comment / unstructured noise above the first section.
    if (line.startsWith("//") || line.startsWith(";")) {continue;}
    if (section === null) {continue;}

    const match = ENTRY_RE.exec(line);
    if (!match) {
      out.warnings.push(`Unparseable line: "${line}"`);
      continue;
    }
    const qty = Math.max(1, Math.min(12, Number(match[1])));
    const token = match[2];
    const card = lookupCard(token, lookup);
    if (!card) {
      out.warnings.push(`Unknown card: "${token}"`);
      continue;
    }

    switch (section) {
      case "legends": {
        // First legend wins; extras are stored as warnings.
        if (out.legendId) {
          out.warnings.push(`Multiple legends; ignoring extra "${card.name}"`);
        } else {
          out.legendId = card.id;
        }
        break;
      }
      case "champions": {
        // Champion units are stored in main_deck zone but also recorded at the
        // Deck level so the engine can pull them into the Champion Zone.
        if (!out.championId) {out.championId = card.id;}
        out.cards.push({ cardId: card.id, quantity: qty, zone: "main" });
        break;
      }
      case "battlefields": {
        // Battlefields use a dedicated zone in the deck_cards table.
        for (let i = 0; i < qty; i++) {out.battlefieldIds.push(card.id);}
        out.cards.push({ cardId: card.id, quantity: qty, zone: "battlefield" });
        break;
      }
      case "main": {
        out.cards.push({ cardId: card.id, quantity: qty, zone: "main" });
        break;
      }
      case "runes": {
        out.cards.push({ cardId: card.id, quantity: qty, zone: "rune" });
        break;
      }
    }
  }

  return out;
}

/**
 * Format a structured deck back into the canonical plain-text format. Card
 * ids are resolved to names via the lookup table. Unknown ids round-trip as
 * their raw id (so a paste-and-export cycle is lossless even if the pool
 * changes between releases).
 */
export interface FormatInput {
  name: string;
  legendId?: string | null;
  championId?: string | null;
  cards: readonly DeckCardEntry[];
}

export function formatDecklist(input: FormatInput, cards: readonly Card[]): string {
  const lookup = buildLookup(cards);
  const nameFor = (id: string): string => lookup.byId.get(id)?.name ?? id;

  const lines: string[] = [];
  lines.push(`# ${input.name || "Untitled Deck"}`, "");

  const legend = input.legendId ? lookup.byId.get(input.legendId) : null;
  lines.push("## Legends");
  if (legend) {lines.push(`1 ${legend.name}`);}
  lines.push("");

  // Group by zone.
  const battlefields = input.cards.filter((c) => c.zone === "battlefield");
  const mains = input.cards.filter((c) => c.zone === "main");
  const runes = input.cards.filter((c) => c.zone === "rune");

  lines.push("## Battlefields");
  for (const c of battlefields) {lines.push(`${c.quantity} ${nameFor(c.cardId)}`);}
  lines.push("");

  if (input.championId) {
    lines.push("## Champions", `1 ${nameFor(input.championId)}`, "");
  }

  lines.push("## Main Deck");
  for (const c of mains) {
    if (c.cardId === input.championId) {continue;} // Already in champions
    lines.push(`${c.quantity} ${nameFor(c.cardId)}`);
  }
  lines.push("");

  lines.push("## Rune Deck");
  for (const c of runes) {lines.push(`${c.quantity} ${nameFor(c.cardId)}`);}

  return lines.join("\n");
}

// ============================================================================
// Validator
// ============================================================================

export interface DeckValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  mainCount: number;
  runeCount: number;
}

const MAIN_TARGET = 40;
const RUNE_TARGET = 12;
const MAX_COPIES = 3;

/**
 * Format-validate a deck against current Riftbound duel rules:
 *   - main deck must be exactly 40 cards
 *   - rune deck must be exactly 12 cards
 *   - no more than 3 copies of any single card per zone
 *   - must have one legend
 *   - must have at least 3 battlefields
 *
 * Unknown card ids are reported as warnings but don't fail validation —
 * that's a "pool drift" signal rather than a user error.
 */
export function validateDeck(
  input: FormatInput,
  cards: readonly Card[],
): DeckValidationResult {
  const lookup = buildLookup(cards);
  const errors: string[] = [];
  const warnings: string[] = [];

  let mainCount = 0;
  let runeCount = 0;
  let battlefieldCount = 0;

  for (const entry of input.cards) {
    const card = lookup.byId.get(entry.cardId);
    if (!card) {warnings.push(`Unknown card id: ${entry.cardId}`);}
    if (entry.quantity > MAX_COPIES && entry.zone !== "rune") {
      errors.push(
        `Too many copies of ${card?.name ?? entry.cardId}: ${entry.quantity} (max ${MAX_COPIES})`,
      );
    }
    if (entry.zone === "main") {mainCount += entry.quantity;}
    else if (entry.zone === "rune") {runeCount += entry.quantity;}
    else if (entry.zone === "battlefield") {battlefieldCount += entry.quantity;}
  }

  if (!input.legendId) {errors.push("Deck must have a legend");}
  if (mainCount !== MAIN_TARGET) {
    errors.push(`Main deck must be ${MAIN_TARGET} cards (currently ${mainCount})`);
  }
  if (runeCount !== RUNE_TARGET) {
    errors.push(`Rune deck must be ${RUNE_TARGET} cards (currently ${runeCount})`);
  }
  if (battlefieldCount < 3) {
    errors.push(`Need at least 3 battlefields (currently ${battlefieldCount})`);
  }

  return { errors, mainCount, runeCount, valid: errors.length === 0, warnings };
}
