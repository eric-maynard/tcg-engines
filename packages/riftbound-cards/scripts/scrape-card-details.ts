/**
 * Card Detail Scraper
 *
 * Fetches individual card pages from the official Riftbound site to get
 * detailed card data that may not be in the gallery JSON (flavor text,
 * full-resolution images, related cards, etc.)
 *
 * Throttled to avoid rate limiting:
 * - 1 request per 2 seconds by default
 * - Saves progress after each card so it can resume
 * - Writes results to downloads/card-details/
 *
 * Usage:
 *   bun packages/riftbound-cards/scripts/scrape-card-details.ts [--delay 2000] [--set OGN] [--resume]
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ============================================================================
// Config
// ============================================================================

const BASE_URL = "https://riftbound.leagueoflegends.com";
const GALLERY_JSON = path.join(import.meta.dir, "../../../downloads/riftbound-cards.json");
const OUTPUT_DIR = path.join(import.meta.dir, "../../../downloads/card-details");
const PROGRESS_FILE = path.join(OUTPUT_DIR, "_progress.json");

// Parse CLI args
const args = process.argv.slice(2);
const delayMs = Number(args.find((_, i) => args[i - 1] === "--delay") ?? "2000");
const filterSet = args.find((_, i) => args[i - 1] === "--set") ?? null;
const resumeMode = args.includes("--resume");
const dryRun = args.includes("--dry-run");

// ============================================================================
// Types
// ============================================================================

interface CardEntry {
  id: string;
  name: string;
  set: string;
  collectorNumber: number;
  publicCode: string;
}

interface ScrapeProgress {
  completed: string[];
  failed: string[];
  lastRun: string;
}

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadProgress(): ScrapeProgress {
  if (resumeMode && fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
  }
  return { completed: [], failed: [], lastRun: new Date().toISOString() };
}

function saveProgress(progress: ScrapeProgress): void {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function extractCardsFromGallery(): CardEntry[] {
  const raw = JSON.parse(fs.readFileSync(GALLERY_JSON, "utf8"));
  const items = raw.props.pageProps.page.blades[2].cards.items as Record<string, unknown>[];

  const seen = new Set<string>();
  const cards: CardEntry[] = [];

  for (const item of items) {
    const rarity = (item.rarity as Record<string, unknown>)?.value as Record<string, string>;
    if (rarity?.id === "showcase") {continue;}

    const setVal = (item.set as Record<string, unknown>)?.value as Record<string, string>;
    const setId = setVal?.id ?? "UNK";

    if (filterSet && setId !== filterSet) {continue;}

    const id = item.id as string;
    if (seen.has(id)) {continue;}
    seen.add(id);

    cards.push({
      collectorNumber: (item.collectorNumber as number) ?? 0,
      id,
      name: item.name as string,
      publicCode: (item.publicCode as string) ?? "",
      set: setId,
    });
  }

  cards.sort((a, b) => {
    if (a.set !== b.set) {return a.set.localeCompare(b.set);}
    return a.collectorNumber - b.collectorNumber;
  });

  return cards;
}

async function fetchCardPage(cardId: string): Promise<Record<string, unknown> | null> {
  // The card gallery uses Next.js — individual card data is embedded in the gallery page.
  // We already have it in the gallery JSON. But for future card-specific pages,
  // The URL pattern would be: /en-us/card-gallery/?card=<id>
  //
  // For now, extract the full card data from the gallery JSON for each card.
  // This script is structured so it can be upgraded to fetch individual pages later.

  const raw = JSON.parse(fs.readFileSync(GALLERY_JSON, "utf8"));
  const items = raw.props.pageProps.page.blades[2].cards.items as Record<string, unknown>[];

  const card = items.find((c) => c.id === cardId);
  if (!card) {return null;}

  return card as Record<string, unknown>;
}

function extractDetailedCard(raw: Record<string, unknown>): Record<string, unknown> {
  // Extract everything we can from the raw gallery data
  const getText = (t: unknown): string => {
    if (!t || typeof t !== "object") {return "";}
    const obj = t as Record<string, unknown>;
    const rt = obj.richText as Record<string, string>;
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
  };

  const getNestedId = (obj: unknown): string | null => {
    if (!obj || typeof obj !== "object") {return null;}
    const o = obj as Record<string, unknown>;
    const v = o.value as Record<string, string>;
    return v?.id ?? null;
  };

  const getNestedLabel = (obj: unknown): string | null => {
    if (!obj || typeof obj !== "object") {return null;}
    const o = obj as Record<string, unknown>;
    const v = o.value as Record<string, string>;
    return v?.label ?? null;
  };

  const getValues = (obj: unknown): Record<string, string>[] => {
    if (!obj || typeof obj !== "object") {return [];}
    const o = obj as Record<string, unknown>;
    return (o.values as Record<string, string>[]) ?? [];
  };

  const img = raw.cardImage as Record<string, unknown>;

  return {
    cardType: ((raw.cardType as Record<string, unknown>)?.type as Array<Record<string, string>>)?.map(
      (t) => t.id,
    ),
    collectorNumber: raw.collectorNumber,
    domains: getValues(raw.domain).map((v) => v.id),
    effectText: getText(raw.effect),
    energy: getNestedId(raw.energy),
    flags: (() => { try { return getValues(raw.flags).map((v) => v.id ?? v.label); } catch { return []; } })(),
    id: raw.id,
    illustrator: getNestedLabel(raw.illustrator),
    imageHeight: (img?.dimensions as Record<string, number>)?.height ?? null,
    imageMimeType: img?.mimeType ?? null,
    imageUrl: (img?.url as string) ?? null,
    imageWidth: (img?.dimensions as Record<string, number>)?.width ?? null,
    might: getNestedId(raw.might),
    mightBonus: getNestedId(raw.mightBonus),
    name: raw.name,
    orientation: raw.orientation,
    power: getValues(raw.power).map((v) => v.id),
    publicCode: raw.publicCode,
    rarity: getNestedId(raw.rarity),
    rulesText: getText(raw.text),
    set: getNestedId(raw.set),
    setLabel: getNestedLabel(raw.set),
    tags: (() => { try { return getValues(raw.tags).map((v) => v.id ?? v.label); } catch { return []; } })(),
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const cards = extractCardsFromGallery();
  const progress = loadProgress();

  const remaining = cards.filter((c) => !progress.completed.includes(c.id));

  console.log(`=== Riftbound Card Detail Scraper ===`);
  console.log(`Total cards: ${cards.length}`);
  console.log(`Already completed: ${progress.completed.length}`);
  console.log(`Remaining: ${remaining.length}`);
  console.log(`Delay: ${delayMs}ms`);
  console.log(`Filter set: ${filterSet ?? "all"}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(``);

  if (remaining.length === 0) {
    console.log("All cards already scraped!");
    return;
  }

  let processed = 0;
  let errors = 0;

  for (const card of remaining) {
    processed++;
    const pct = ((processed / remaining.length) * 100).toFixed(1);
    process.stdout.write(`[${pct}%] ${card.set}-${card.collectorNumber} ${card.name}...`);

    if (dryRun) {
      console.log(" (dry run, skipped)");
      continue;
    }

    try {
      const raw = await fetchCardPage(card.id);
      if (!raw) {
        console.log(" NOT FOUND");
        progress.failed.push(card.id);
        continue;
      }

      const detailed = extractDetailedCard(raw);

      // Write individual card file
      const setDir = path.join(OUTPUT_DIR, card.set.toLowerCase());
      fs.mkdirSync(setDir, { recursive: true });
      const filename = `${String(card.collectorNumber).padStart(3, "0")}-${card.id}.json`;
      fs.writeFileSync(path.join(setDir, filename), JSON.stringify(detailed, null, 2));

      progress.completed.push(card.id);
      console.log(" OK");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(` ERROR: ${msg}`);
      progress.failed.push(card.id);
      errors++;
    }

    // Save progress after each card
    progress.lastRun = new Date().toISOString();
    saveProgress(progress);

    // Throttle
    if (processed < remaining.length) {
      await sleep(delayMs);
    }
  }

  // Write combined per-set files
  console.log(`\nWriting combined set files...`);
  const setGroups = new Map<string, Record<string, unknown>[]>();

  for (const card of cards) {
    const setDir = path.join(OUTPUT_DIR, card.set.toLowerCase());
    const filename = `${String(card.collectorNumber).padStart(3, "0")}-${card.id}.json`;
    const filepath = path.join(setDir, filename);

    if (!fs.existsSync(filepath)) {continue;}

    const data = JSON.parse(fs.readFileSync(filepath, "utf8"));
    if (!setGroups.has(card.set)) {setGroups.set(card.set, []);}
    setGroups.get(card.set)!.push(data);
  }

  for (const [setId, setCards] of setGroups) {
    const outfile = path.join(OUTPUT_DIR, `${setId.toLowerCase()}-full.json`);
    fs.writeFileSync(
      outfile,
      JSON.stringify({ cardCount: setCards.length, cards: setCards, set: setId }, null, 2),
    );
    console.log(`  ${setId}: ${setCards.length} cards → ${path.basename(outfile)}`);
  }

  console.log(`\n=== Done ===`);
  console.log(`Processed: ${processed}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total completed: ${progress.completed.length}`);
}

main().catch(console.error);
