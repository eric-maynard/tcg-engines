/**
 * Generate comprehensive per-set JSON files with:
 * - Full card stats (name, type, cost, might, domain, rarity, tags)
 * - Image URLs from the official gallery
 * - Parsed abilities (from the parser)
 * - Raw rules text
 * - Errata notes where applicable
 * - Collector number and set info
 *
 * Usage: bun scripts/generate-set-json.ts [--full] [--dry-run] [--out DIR]
 *
 * Default (merge) mode re-imports into the EXISTING set JSON: a row is only
 * rewritten when its stored rulesText is still an untouched earlier import
 * (see `legacyEquivalentText`) and the fresh import differs; its parsed
 * `abilities` follow only when the behavioural (reminder-stripped) text
 * changed. Hand-edited rows, extra rows and every other column are preserved.
 * `--full` regenerates every set file from scratch.
 */

import { parseAbilities } from "../src/parser";
import { parseEquipmentText, withoutEffectText } from "../src/parser/equipment";
import { stripReminders } from "../src/parser/impl/normalize";
import { composeRulesText, legacyEquivalentText, richTextToPlain } from "../src/data/import-text";
import rawGalleryData from "../../../downloads/riftbound-cards.json";
import * as fs from "node:fs";
import * as path from "node:path";

// ============================================================================
// Types
// ============================================================================

interface FullCard {
  id: string;
  name: string;
  collectorNumber: number;
  set: string;
  setName: string;
  cardType: string;
  domains: string[];
  rarity: string;
  energy: number | null;
  might: number | null;
  mightBonus: number | null;
  power: number | null;
  tags: string[];
  isChampion: boolean;
  /** Full printed text: rules text, then the Effect Text box (rule 136) if any. */
  rulesText: string;
  /** rule 136 / 150.2 — the Effect Text box alone (Equipment: conferred on the equipped unit). */
  effectText?: string;
  abilities: unknown[];
  parseSuccess: boolean;
  imageUrl: string | null;
  illustrator: string | null;
  errata: string | null;
}

// ============================================================================
// Config
// ============================================================================

const SET_NAMES: Record<string, string> = {
  OGN: "Origins",
  OGS: "Origins Showcase",
  SFD: "Spiritforged",
  UNL: "Unleashed",
  VEN: "Vendetta",
};

const OUTPUT_DIR = path.join(import.meta.dir, "../../riftbound-cards/src/data/sets");

// ============================================================================
// Errata data
// ============================================================================

const ERRATA: Record<string, string> = {
  "Arise!": "Changed 'ready two' to 'ready up to two'",
  "Ava, Achiever": "Clarified non-unit cards with [Hidden] can be played from hand",
  "Baited Hook": "Added 'banish' step before playing unit from deck",
  "Blind Fury": "Added 'banish' step before playing opponent cards from deck",
  "Blood Rush": "Added 'this turn' to Assault 2 effect",
  "Bone Skewer": "Changed 'When they do' to 'If they do, then do this:'",
  "Clockwork Keeper": "Restructured payment timing for optional cost mechanic",
  "Convergent Mutation": "Changed to 'increase its Might to' (this turn only)",
  "Dark Child": "Changed 'ready 2 runes' to 'ready up to 2 runes'",
  "Dazzling Aurora": "Added 'banish it' before playing revealed unit",
  "Death from Below": "Added 'Then do this:' for conditional effect timing",
  "Deathgrip": "Separated kill requirement with 'If you do'",
  "Disintegrate": "Restructured conditional damage effect wording",
  "Dragon's Rage": "Added 'do this:' to clarify move-then-choose sequence",
  "Dune Drake": "Specified bonus applies 'this turn' during attack",
  "Edge of Night": "Added '(here)' to clarify battlefield location",
  "Falling Star": "Changed from 'Do this twice' to listing effect twice separately",
  "Guards!": "Added 'Then do this:' before readying effect",
  "Highlander": "Expanded effect to heal and exhaust before recalling",
  "Icathian Rain": "Changed from 'Do this 6 times' to listing effect explicitly",
  "Janna, Savior": "Changed 'move an enemy unit' to 'move up to one enemy unit'",
  "Jax, Unmatched": "Expanded from 'in your hand' to 'everywhere'",
  "Karma, Channeler": "Clarified trigger applies to recycling 'to your Main Deck'",
  "Kato the Arm": "Changed 'a friendly unit' to 'another friendly unit'",
  "Keeper of Masks": "Added 'Then do this:' before token copying",
  "Kinkou Monk": "Changed 'buff two' to 'buff up to two'",
  "Leblanc, Deceiver": "Added 'Then do this:' before copying effect",
  "Mirror Image": "Added 'Then do this:' before unit copying",
  "Nocturne, Horrifying": "Broadened trigger to 'look at or reveal'; added banish option",
  "Pack of Wonders": "Changed 'facedown card' to '[Hidden] card'",
  "Portal Rescue": "Clarified unit goes to 'its owner's base'",
  "Promising Future": "Added 'banish one' before playing from deck",
  "Ravenborn Tome": "Limited bonus damage to 'the next spell you play this turn'",
  "Reinforce": "Updated to 'banish a unit from among them, then play it'",
  "Rek'Sai, Swarm Queen": "Added 'banish one, then play it'",
  "Relentless Pursuit": "Changed 'an Equipment' to 'up to one Equipment'",
  "Rell, Magnetic": "Restructured conditional phrasing",
  "Rengar, Trophy Hunter": "Reworded to use '[Ambush]' keyword",
  "Salvage": "Changed 'a gear' to 'up to one gear'",
  "Sigil of the Storm": "Added 'you must' and clarified rune recycling",
  "Sona, Harmonious": "Changed to conditional 'up to 4' runes when at battlefield",
  "Targon's Peak": "Changed 'ready 2' to 'ready up to 2' runes",
  "Teemo, Strategist": "Narrowed trigger to 'when I defend' only",
  "The Boss": "Expanded effect to heal and exhaust before recalling",
  "The Dreaming Tree": "Clarified trigger applies when 'a player' chooses",
  "The Syren": "Specified unit moves to 'its base' not 'your base'",
  "Tianna Crownguard": "Changed 'score points' to 'gain points'",
  "Tideturner": "Changed to require 'a unit you control at another location'",
  "Unforgiven": "Specified moving to/from 'its base'",
  "Unlicensed Armory": "Expanded effect to heal and exhaust before recalling",
  "Void Burrower": "Updated to 'banish one, then play it'",
  "Void Gate": "Clarified bonus damage applies 'to units here'",
  "Void Rush": "Clarified 'banish one, then play it'",
  "Yone, Blademaster": "Changed to 'conquer a battlefield that was uncontrolled'",
  "Zhonya's Hourglass": "Expanded effect to heal and exhaust before recalling",
};

// ============================================================================
// Helpers
// ============================================================================

function getType(c: Record<string, unknown>): string {
  const ct = c.cardType as Record<string, unknown>;
  const types = ct?.type as Record<string, string>[];
  return types?.[0]?.id ?? "unknown";
}

function getDomains(c: Record<string, unknown>): string[] {
  const d = c.domain as Record<string, unknown>;
  const vals = d?.values as Record<string, string>[];
  return vals?.map((v) => v.id) ?? [];
}

function getSet(c: Record<string, unknown>): string {
  const s = c.set as Record<string, unknown>;
  const v = s?.value as Record<string, string>;
  return v?.id ?? "UNK";
}

function getRarity(c: Record<string, unknown>): string {
  const r = c.rarity as Record<string, unknown>;
  const v = r?.value as Record<string, string>;
  return v?.id ?? "common";
}

function getEnergy(c: Record<string, unknown>): number | null {
  const e = c.energy as Record<string, unknown> | null;
  if (!e) {return null;}
  const v = e.value as Record<string, number>;
  return v?.id ?? null;
}

function getMight(c: Record<string, unknown>): number | null {
  const m = c.might as Record<string, unknown> | null;
  if (!m) {return null;}
  const v = m.value as Record<string, number>;
  return v?.id ?? null;
}

function getMightBonus(c: Record<string, unknown>): number | null {
  const m = c.mightBonus as Record<string, unknown> | null;
  if (!m) {return null;}
  const v = m.value as Record<string, number>;
  return v?.id ?? null;
}

function getPower(c: Record<string, unknown>): number | null {
  const p = c.power as Record<string, unknown> | null;
  if (!p) {return null;}
  const v = p.value as Record<string, number>;
  return v?.id ?? null;
}

function richTextField(c: Record<string, unknown>, field: "text" | "effect"): string {
  const t = c[field] as Record<string, unknown> | undefined;
  const rt = t?.richText as Record<string, string> | undefined;
  return richTextToPlain(rt?.body);
}

/** The card's own Rules Text box (gallery field `text`, labelled "Ability"). */
function getText(c: Record<string, unknown>): string {
  return richTextField(c, "text");
}

/**
 * rule 136 / 150.2 — the Effect Text box (gallery field `effect`). Only gear
 * print one; the field on any other type is gallery noise (a spell carrying
 * "1"), so it is ignored there.
 */
function getEffectText(c: Record<string, unknown>): string | undefined {
  if (getType(c) !== "gear") {return undefined;}
  const text = richTextField(c, "effect");
  return text.length > 0 ? text : undefined;
}

function getImageUrl(c: Record<string, unknown>): string | null {
  const img = c.cardImage as Record<string, string>;
  return img?.url ?? null;
}

function getIllustrator(c: Record<string, unknown>): string | null {
  const ill = c.illustrator as Record<string, unknown>;
  if (!ill) {return null;}
  const v = ill.value as Record<string, string>;
  return v?.label ?? null;
}

function extractChampionTag(name: string, cardType: string): string | null {
  if (cardType !== "unit") {return null;}
  if (!name.includes(",")) {return null;}
  return name.split(",")[0].trim();
}

function findErrata(name: string): string | null {
  if (ERRATA[name]) {return ERRATA[name];}
  // Try partial match
  for (const [key, val] of Object.entries(ERRATA)) {
    if (name.startsWith(key) || name.includes(key)) {return val;}
  }
  return null;
}

// ============================================================================
// Main
// ============================================================================

const argv = process.argv.slice(2);
const FULL_REGEN = argv.includes("--full");
const DRY_RUN = argv.includes("--dry-run");
const outFlag = argv.indexOf("--out");
const outputDir = outFlag !== -1 && argv[outFlag + 1] ? path.resolve(argv[outFlag + 1]) : OUTPUT_DIR;

const galleryCards = (rawGalleryData as Record<string, unknown>).props as Record<string, unknown>;
const pageProps = galleryCards.pageProps as Record<string, unknown>;
const page = pageProps.page as Record<string, unknown>;
const blades = page.blades as Record<string, unknown>[];
const galleryBlade = blades[2] as Record<string, unknown>;
const cardsData = galleryBlade.cards as Record<string, unknown>;
const items = cardsData.items as Record<string, unknown>[];

/**
 * Parse a card's printed text into the `abilities` column. A card with an
 * Effect Text box parses its two boxes apart (see src/parser/equipment.ts).
 */
function parseCardText(rulesText: string, effectText: string | undefined): { abilities: unknown[]; parseSuccess: boolean } {
  if (!rulesText && !effectText) {return { abilities: [], parseSuccess: false };}
  const options = { omitId: true, omitText: true } as const;
  const result = effectText
    ? parseEquipmentText(rulesText, effectText, options)
    : parseAbilities(rulesText, options);
  return result.success && result.abilities
    ? { abilities: result.abilities, parseSuccess: true }
    : { abilities: [], parseSuccess: false };
}

console.log(`Processing ${items.length} cards from gallery...`);

// Deduplicate: one row per (name, set). Showcase printings are dropped, and
// among the rest the canonical id (`set-NNN-TTT`, no `a`/`-star` art suffix)
// wins regardless of gallery order — that is the id the set JSON and the typed
// definitions are keyed by.
const isArtVariantId = (id: string): boolean => /-\d+[a-z]+-|-star-/.test(id);
const byKey = new Map<string, Record<string, unknown>>();
for (const c of items) {
  if (getRarity(c) === "showcase") {continue;}
  const key = `${c.name}-${getSet(c)}`;
  const kept = byKey.get(key);
  if (!kept || (isArtVariantId(kept.id as string) && !isArtVariantId(c.id as string))) {
    byKey.set(key, c);
  }
}
const uniqueCards = [...byKey.values()];

console.log(`${uniqueCards.length} unique cards after dedup`);

// Build champion tags
const championTags = new Set<string>();
for (const c of uniqueCards) {
  const tag = extractChampionTag(c.name as string, getType(c));
  if (tag) {championTags.add(tag);}
}

// Process each card
const bySet = new Map<string, FullCard[]>();

for (const c of uniqueCards) {
  const name = c.name as string;
  const cardType = getType(c);
  const setId = getSet(c);
  const text = getText(c);
  const effectText = getEffectText(c);
  const championTag = extractChampionTag(name, cardType);

  const { abilities, parseSuccess } = parseCardText(text, effectText);

  const tags: string[] = [];
  if (championTag) {tags.push(championTag);}

  const card: FullCard = {
    id: c.id as string,
    name,
    collectorNumber: (c.collectorNumber as number) ?? 0,
    set: setId,
    setName: SET_NAMES[setId] ?? setId,
    cardType,
    domains: getDomains(c),
    rarity: getRarity(c),
    energy: getEnergy(c),
    might: getMight(c),
    mightBonus: getMightBonus(c),
    power: getPower(c),
    tags,
    isChampion: championTag !== null && championTags.has(championTag),
    rulesText: composeRulesText(text, effectText),
    ...(effectText ? { effectText } : {}),
    abilities,
    parseSuccess,
    imageUrl: getImageUrl(c),
    illustrator: getIllustrator(c),
    errata: findErrata(name),
  };

  if (!bySet.has(setId)) {bySet.set(setId, []);}
  bySet.get(setId)!.push(card);
}

// Write per-set JSON files
if (!DRY_RUN) {fs.mkdirSync(outputDir, { recursive: true });}

type JsonRow = Record<string, unknown> & { id: string; rulesText?: string };

/**
 * Decide the merged form of one stored row given its fresh import, or
 * `undefined` when the row must be left exactly as it is.
 */
function mergeRow(row: JsonRow, next: FullCard): JsonRow | undefined {
  const stored = typeof row.rulesText === "string" ? row.rulesText : "";
  // Untouched earlier import? (equal to the fresh OWN text or full text once
  // known legacy defects are mapped away.)
  const storedNorm = legacyEquivalentText(stored);
  const ownText = withoutEffectText(next.rulesText, next.effectText);
  const pristine = storedNorm === ownText || storedNorm === next.rulesText;
  if (!pristine) {
    // Hand-edited wording stays; only known glyph/entity defects are healed.
    return storedNorm === stored ? undefined : { ...row, rulesText: storedNorm };
  }
  if (stored === next.rulesText && row.effectText === next.effectText) {return undefined;}
  // Keep column order stable: rebuild with rulesText/effectText in place.
  const rebuilt: JsonRow = { id: row.id };
  for (const [k, v] of Object.entries(row)) {
    if (k === "effectText") {continue;}
    rebuilt[k] = k === "rulesText" ? next.rulesText : v;
    if (k === "rulesText" && next.effectText) {rebuilt.effectText = next.effectText;}
  }
  // Abilities follow behavioural text only; a reminder-only rewrite keeps
  // whatever the row carries (possibly hand-authored).
  if (stripReminders(stored) !== stripReminders(next.rulesText)) {
    rebuilt.abilities = next.abilities;
    rebuilt.parseSuccess = next.parseSuccess;
  }
  return rebuilt;
}

/**
 * [start, end) text spans of the elements of the top-level `"cards"` array, in
 * order. Set files are partly hand-formatted, so unchanged rows are kept
 * byte-for-byte and only rewritten rows are re-serialised.
 */
function cardElementSpans(text: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  const arrayStart = text.indexOf("[", text.indexOf('"cards"'));
  let depth = 0;
  let inString = false;
  let start = -1;
  for (let i = arrayStart + 1; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") {i++;} else if (ch === '"') {inString = false;}
      continue;
    }
    if (ch === '"') {inString = true;} else if (ch === "{" || ch === "[") {
      if (depth === 0) {start = i;}
      depth++;
    } else if (ch === "}" || ch === "]") {
      if (depth === 0) {break;} // end of the cards array
      depth--;
      if (depth === 0) {spans.push({ end: i + 1, start });}
    }
  }
  return spans;
}

/** Serialise one row the way the generator always has, at array-element indent. */
function serialiseRow(row: JsonRow): string {
  return JSON.stringify(row, null, 2).replace(/\n/g, "\n    ");
}

for (const [setId, cards] of bySet) {
  cards.sort((a, b) => a.collectorNumber - b.collectorNumber);

  const setName = SET_NAMES[setId] ?? setId;
  const filename = `${setId.toLowerCase()}.json`;
  const filepath = path.join(outputDir, filename);
  const existingPath = path.join(OUTPUT_DIR, filename);

  if (!FULL_REGEN && fs.existsSync(existingPath)) {
    let text = fs.readFileSync(existingPath, "utf8");
    const existing = JSON.parse(text) as { cards: JsonRow[]; set?: Record<string, unknown> };
    const spans = cardElementSpans(text);
    if (spans.length !== existing.cards.length) {
      throw new Error(`${filename}: located ${spans.length} card spans for ${existing.cards.length} rows`);
    }
    const freshById = new Map(cards.map((c) => [c.id, c]));
    const changed: string[] = [];
    const rows = existing.cards.map((row) => {
      const next = freshById.get(row.id);
      const merged = next ? mergeRow(row, next) : undefined;
      if (merged) {changed.push(row.id);}
      return merged ?? row;
    });
    // Splice back to front so earlier offsets stay valid.
    for (let i = spans.length - 1; i >= 0; i--) {
      if (rows[i] !== existing.cards[i]) {
        text = text.slice(0, spans[i].start) + serialiseRow(rows[i]) + text.slice(spans[i].end);
      }
    }
    const parsed = rows.filter((c) => c.parseSuccess).length;
    text = text.replace(/("parsedCount":\s*)\d+/, `$1${parsed}`);
    if (!DRY_RUN && changed.length > 0) {fs.writeFileSync(filepath, text);}
    console.log(`${setId} (${setName}): merge — ${changed.length} row(s) updated${changed.length ? `: ${changed.join(", ")}` : ""}${DRY_RUN ? " (dry run)" : ""}`);
    continue;
  }

  const parsed = cards.filter((c) => c.parseSuccess).length;
  const withErrata = cards.filter((c) => c.errata).length;
  const output = {
    cards,
    set: { id: setId, name: setName, cardCount: cards.length, parsedCount: parsed, errataCount: withErrata },
  };
  if (!DRY_RUN) {fs.writeFileSync(filepath, JSON.stringify(output, null, 2));}
  console.log(`${setId} (${setName}): ${cards.length} cards, ${parsed} parsed, ${withErrata} errata → ${DRY_RUN ? "(dry run)" : filename}`);
}

// Write index (full regeneration only — merge mode never adds or drops sets)
if (FULL_REGEN && !DRY_RUN) {
  const indexContent = `/**
 * Set JSON data index
 */
${[...bySet.keys()].toSorted().map((s) => `export { default as ${s.toLowerCase()} } from "./${s.toLowerCase()}.json";`).join("\n")}
`;
  fs.writeFileSync(path.join(outputDir, "index.ts"), indexContent);
}

// ============================================================================
// --defs: sync printed text into the typed card definitions (src/cards/<set>/)
// ============================================================================
//
// The .ts definitions are hand-maintained overlays (explicit `abilities`,
// engine markers), so only their printed-text fields are re-imported, and only
// where the stored `rulesText` is still an untouched earlier import — the same
// rule as the JSON merge. `abilities` arrays are never rewritten here.

const CARDS_DIR = path.join(import.meta.dir, "../src/cards");
const PRINT_WIDTH = 100;

/** `  key: "value",` or the wrapped two-line form the formatter uses past PRINT_WIDTH. */
function propertyLines(key: string, value: string): string {
  const literal = JSON.stringify(value);
  const oneLine = `  ${key}: ${literal},`;
  return oneLine.length <= PRINT_WIDTH ? oneLine : `  ${key}:\n    ${literal},`;
}

const STRING_PROP = (key: string) =>
  new RegExp(`\\n  ${key}:\\s*\\n?\\s*("(?:[^"\\\\]|\\\\.)*"),?`);

function syncDefinitionText(file: string, next: FullCard): boolean {
  const source = fs.readFileSync(file, "utf8");
  const exportAt = source.search(/\nexport const \w+: \w+ = \{/);
  if (exportAt === -1) {return false;}
  const head = source.slice(0, exportAt);
  let body = source.slice(exportAt);

  const rulesMatch = STRING_PROP("rulesText").exec(body);
  if (!rulesMatch) {return false;}
  let stored: string;
  let storedEffect: string | undefined;
  const effectMatch = STRING_PROP("effectText").exec(body);
  try {
    stored = JSON.parse(rulesMatch[1]) as string;
    storedEffect = effectMatch ? (JSON.parse(effectMatch[1]) as string) : undefined;
  } catch {
    return false; // a literal JSON can't read is hand-written — leave it
  }
  const storedNorm = legacyEquivalentText(stored);
  const pristine = storedNorm === withoutEffectText(next.rulesText, next.effectText) || storedNorm === next.rulesText;
  if (pristine && stored === next.rulesText && storedEffect === next.effectText) {return false;}
  if (!pristine && storedNorm === stored) {return false;}
  // Hand-edited wording stays (only known glyph/entity defects are healed);
  // an untouched import takes the fresh text and its effect-text box.
  const rulesText = pristine ? next.rulesText : storedNorm;
  body = body.replace(STRING_PROP("rulesText"), () => `\n${propertyLines("rulesText", rulesText)}`);
  if (pristine && next.effectText) {
    const line = `\n${propertyLines("effectText", next.effectText)}`;
    if (effectMatch) {
      body = body.replace(STRING_PROP("effectText"), () => line);
    } else {
      // Definitions keep their keys sorted; insert before the first later key.
      const keys = [...body.matchAll(/\n  ([A-Za-z]\w*)(?=[:,\n])/g)];
      const after = keys.find((m) => m[1].localeCompare("effectText") > 0);
      body = after ? body.slice(0, after.index) + line + body.slice(after.index) : body.replace(/\n\};/, `${line}\n};`);
    }
  }
  if (!DRY_RUN) {fs.writeFileSync(file, head + body);}
  return true;
}

if (argv.includes("--defs")) {
  const files = new Map<string, string>();
  for (const dir of fs.readdirSync(CARDS_DIR)) {
    const setDir = path.join(CARDS_DIR, dir);
    if (!fs.statSync(setDir).isDirectory()) {continue;}
    for (const f of fs.readdirSync(setDir)) {
      if (!f.endsWith(".ts") || f === "index.ts") {continue;}
      const file = path.join(setDir, f);
      const id = /createCardId\("([^"]+)"\)/.exec(fs.readFileSync(file, "utf8"))?.[1];
      if (id) {files.set(id, file);}
    }
  }
  const synced: string[] = [];
  for (const setCards of bySet.values()) {
    for (const card of setCards) {
      const file = files.get(card.id);
      if (file && syncDefinitionText(file, card)) {synced.push(path.relative(process.cwd(), file));}
    }
  }
  console.log(`defs: ${synced.length} definition(s) updated${DRY_RUN ? " (dry run)" : ""}`);
  for (const f of synced) {console.log(`  ${f}`);}
}

console.log("\nDone!");
