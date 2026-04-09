/**
 * Card Image Downloader
 *
 * Downloads card images from the official CDN one at a time with throttling.
 * Saves to downloads/card-images/{set}/{collector-number}-{id}.png
 *
 * Features:
 * - 1.5 second delay between requests (configurable)
 * - Resumable: skips already-downloaded images
 * - Progress tracking with ETA
 * - Retries failed downloads once
 *
 * Usage:
 *   bun packages/riftbound-cards/scripts/download-card-images.ts
 *   bun packages/riftbound-cards/scripts/download-card-images.ts --delay 2000
 *   bun packages/riftbound-cards/scripts/download-card-images.ts --set OGN
 */

import * as fs from "node:fs";
import * as path from "node:path";

const OUTPUT_DIR = path.join(import.meta.dir, "../../../downloads/card-images");
const PROGRESS_FILE = path.join(OUTPUT_DIR, "_progress.json");

// CLI args
const args = process.argv.slice(2);
const delayMs = Number(args.find((_, i) => args[i - 1] === "--delay") ?? "1500");
const filterSet = args.find((_, i) => args[i - 1] === "--set") ?? null;

interface CardImage {
  id: string;
  name: string;
  set: string;
  collectorNumber: number;
  imageUrl: string;
}

interface Progress {
  downloaded: string[];
  failed: string[];
  totalBytes: number;
  lastRun: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadProgress(): Progress {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
  }
  return { downloaded: [], failed: [], lastRun: "", totalBytes: 0 };
}

function saveProgress(p: Progress): void {
  p.lastRun = new Date().toISOString();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {return `${bytes}B`;}
  if (bytes < 1024 * 1024) {return `${(bytes / 1024).toFixed(1)}KB`;}
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatTime(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) {return `${s}s`;}
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

// Load card data with image URLs from the combined set files
function loadCards(): CardImage[] {
  const detailsDir = path.join(import.meta.dir, "../../../downloads/card-details");
  const cards: CardImage[] = [];

  for (const file of fs.readdirSync(detailsDir)) {
    if (!file.endsWith("-full.json")) {continue;}

    const data = JSON.parse(fs.readFileSync(path.join(detailsDir, file), "utf8"));
    const setId = data.set as string;

    if (filterSet && setId !== filterSet) {continue;}

    for (const card of data.cards) {
      if (!card.imageUrl) {continue;}
      cards.push({
        collectorNumber: card.collectorNumber ?? 0,
        id: card.id,
        imageUrl: card.imageUrl,
        name: card.name,
        set: setId,
      });
    }
  }

  cards.sort((a, b) => {
    if (a.set !== b.set) {return a.set.localeCompare(b.set);}
    return a.collectorNumber - b.collectorNumber;
  });

  return cards;
}

function getOutputPath(card: CardImage): string {
  const setDir = path.join(OUTPUT_DIR, card.set.toLowerCase());
  const num = String(card.collectorNumber).padStart(3, "0");
  return path.join(setDir, `${num}-${card.id}.png`);
}

async function downloadImage(url: string, outputPath: string): Promise<number> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, Buffer.from(buffer));
  return buffer.byteLength;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const cards = loadCards();
  const progress = loadProgress();

  // Filter out already downloaded
  const remaining = cards.filter((c) => {
    if (progress.downloaded.includes(c.id)) {return false;}
    // Also skip if file already exists on disk
    if (fs.existsSync(getOutputPath(c))) {return false;}
    return true;
  });

  console.log("=== Riftbound Card Image Downloader ===");
  console.log(`Total cards with images: ${cards.length}`);
  console.log(`Already downloaded: ${cards.length - remaining.length}`);
  console.log(`Remaining: ${remaining.length}`);
  console.log(`Delay between requests: ${delayMs}ms`);
  console.log(`Estimated time: ${formatTime(remaining.length * delayMs)}`);
  console.log(`Filter set: ${filterSet ?? "all"}`);
  console.log("");

  if (remaining.length === 0) {
    console.log("All images already downloaded!");
    return;
  }

  const startTime = Date.now();
  let downloaded = 0;
  let errors = 0;
  let bytesThisRun = 0;

  for (const card of remaining) {
    downloaded++;
    const pct = ((downloaded / remaining.length) * 100).toFixed(1);
    const elapsed = Date.now() - startTime;
    const avgPerCard = elapsed / downloaded;
    const eta = formatTime((remaining.length - downloaded) * avgPerCard);

    process.stdout.write(
      `[${pct}% ETA ${eta}] ${card.set}-${String(card.collectorNumber).padStart(3, "0")} ${card.name}... `,
    );

    const outputPath = getOutputPath(card);

    try {
      const bytes = await downloadImage(card.imageUrl, outputPath);
      bytesThisRun += bytes;
      progress.downloaded.push(card.id);
      progress.totalBytes += bytes;
      console.log(`${formatBytes(bytes)}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`FAILED: ${msg}`);

      // Retry once after a short delay
      await sleep(3000);
      try {
        process.stdout.write(`  retrying... `);
        const bytes = await downloadImage(card.imageUrl, outputPath);
        bytesThisRun += bytes;
        progress.downloaded.push(card.id);
        progress.totalBytes += bytes;
        console.log(`${formatBytes(bytes)} (retry OK)`);
      } catch {
        console.log(`FAILED again, skipping`);
        progress.failed.push(card.id);
        errors++;
      }
    }

    // Save progress after each card
    saveProgress(progress);

    // Throttle
    if (downloaded < remaining.length) {
      await sleep(delayMs);
    }
  }

  const totalTime = Date.now() - startTime;
  console.log(`\n=== Done ===`);
  console.log(`Downloaded: ${downloaded - errors} images`);
  console.log(`Failed: ${errors}`);
  console.log(`Size this run: ${formatBytes(bytesThisRun)}`);
  console.log(`Total size all runs: ${formatBytes(progress.totalBytes)}`);
  console.log(`Time: ${formatTime(totalTime)}`);
  console.log(`Total completed: ${progress.downloaded.length}/${cards.length}`);
}

main().catch(console.error);
