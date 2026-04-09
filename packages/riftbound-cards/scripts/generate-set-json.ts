/**
 * Generate comprehensive per-set JSON files with:
 * - Full card stats (name, type, cost, might, domain, rarity, tags)
 * - Image URLs from the official gallery
 * - Parsed abilities (from the parser)
 * - Raw rules text
 * - Errata notes where applicable
 * - Collector number and set info
 */

import { parseAbilities } from "../src/parser";
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
  power: string[] | null;
  tags: string[];
  isChampion: boolean;
  rulesText: string;
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

function getText(c: Record<string, unknown>): string {
  const t = c.text as Record<string, unknown>;
  if (!t) {return "";}
  const rt = t.richText as Record<string, string>;
  if (!rt) {return "";}
  let html = rt.body ?? "";
  html = html.replace(/<br\s*\/?>/g, "\n");
  html = html.replace(/<\/?p>/g, "");
  html = html.replace(/<[^>]+>/g, "");
  html = html.replace(/:rb_might:/g, "[Might]");
  html = html.replace(/:rb_exhaust:/g, "[Exhaust]");
  for (let i = 1; i <= 12; i++) {
    html = html.replace(new RegExp(`:rb_energy_${i}:`, "g"), `[${i}]`);
  }
  html = html.replace(/:rb_rune_(\w+):/g, "[$1]");
  html = html.replace(/:rb_(\w+):/g, "[$1]");
  return html.trim();
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

const galleryCards = (rawGalleryData as Record<string, unknown>).props as Record<string, unknown>;
const pageProps = galleryCards.pageProps as Record<string, unknown>;
const page = pageProps.page as Record<string, unknown>;
const blades = page.blades as Record<string, unknown>[];
const galleryBlade = blades[2] as Record<string, unknown>;
const cardsData = galleryBlade.cards as Record<string, unknown>;
const items = cardsData.items as Record<string, unknown>[];

console.log(`Processing ${items.length} cards from gallery...`);

// Deduplicate (remove showcase variants)
const seen = new Set<string>();
const uniqueCards: Record<string, unknown>[] = [];
for (const c of items) {
  const rarity = getRarity(c);
  if (rarity === "showcase") {continue;}
  const key = `${c.name}-${getSet(c)}`;
  if (seen.has(key)) {continue;}
  seen.add(key);
  uniqueCards.push(c);
}

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
  const championTag = extractChampionTag(name, cardType);

  // Parse abilities
  let abilities: unknown[] = [];
  let parseSuccess = false;
  if (text) {
    const result = parseAbilities(text, { omitId: true, omitText: true });
    if (result.success && result.abilities) {
      abilities = result.abilities.map((a) => a.ability);
      parseSuccess = true;
    }
  }

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
    power: null, // Power costs aren't in the gallery data directly
    tags,
    isChampion: championTag !== null && championTags.has(championTag),
    rulesText: text,
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
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

for (const [setId, cards] of bySet) {
  cards.sort((a, b) => a.collectorNumber - b.collectorNumber);

  const setName = SET_NAMES[setId] ?? setId;
  const parsed = cards.filter((c) => c.parseSuccess).length;
  const withErrata = cards.filter((c) => c.errata).length;

  const output = {
    cards,
    set: {
      id: setId,
      name: setName,
      cardCount: cards.length,
      parsedCount: parsed,
      errataCount: withErrata,
    },
  };

  const filename = `${setId.toLowerCase()}.json`;
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(output, null, 2));
  console.log(`${setId} (${setName}): ${cards.length} cards, ${parsed} parsed, ${withErrata} errata → ${filename}`);
}

// Write index
const indexContent = `/**
 * Set JSON data index
 */
${[...bySet.keys()].toSorted().map((s) => `export { default as ${s.toLowerCase()} } from "./${s.toLowerCase()}.json";`).join("\n")}
`;
fs.writeFileSync(path.join(OUTPUT_DIR, "index.ts"), indexContent);

console.log("\nDone!");
