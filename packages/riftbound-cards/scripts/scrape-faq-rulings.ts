/**
 * Riftbound FAQ Rulings Scraper
 *
 * Scrapes card rulings from https://www.riftboundfaq.com/cards/.
 *
 * The FAQ site is a Next.js/Fumadocs app backed by MDX files in a public
 * GitHub repo (each card page has an "Edit this page" link pointing at it).
 * Rather than parsing React Server Component flight data, we:
 *   1. Fetch the /cards/ index and extract the card-slug list from the
 *      embedded RSC payload.
 *   2. Fetch the underlying MDX source for each slug from GitHub raw
 *      (the same file the site renders).
 *   3. Parse frontmatter + `## question` sections into structured rulings.
 *
 * Output:
 *   packages/riftbound-cards/src/data/rulings/all-rulings.json
 *   packages/riftbound-cards/src/data/rulings/train.json
 *   packages/riftbound-cards/src/data/rulings/test.json
 *
 * Usage:
 *   bun packages/riftbound-cards/scripts/scrape-faq-rulings.ts [--delay 250]
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

const FAQ_BASE = "https://www.riftboundfaq.com";
const MDX_BASE =
  "https://raw.githubusercontent.com/ChristianIvicevic/riftboundfaq/main/content/(rulings)/cards";

const OUT_DIR = path.join(import.meta.dir, "../src/data/rulings");
const ALL_OUT = path.join(OUT_DIR, "all-rulings.json");
const TRAIN_OUT = path.join(OUT_DIR, "train.json");
const TEST_OUT = path.join(OUT_DIR, "test.json");

const args = process.argv.slice(2);
const delayMs = Number(args.find((_, i) => args[i - 1] === "--delay") ?? "250");

interface Ruling {
  id: string;
  cardId: string;
  cardName: string;
  cardSlug: string;
  question: string;
  answer: string;
  ruleRefs: string[];
  sourceUrl: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url: string, opts: { allow404?: boolean } = {}): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "tcg-engines-faq-scraper/1.0" },
  });
  if (!res.ok && !(opts.allow404 && res.status === 404)) {
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  }
  return res.text();
}

/** Extract the list of card slugs from the /cards/ index RSC payload. */
function extractSlugs(indexHtml: string): string[] {
  // Card links appear in the RSC flight data as "/cards/<slug>".
  const slugs = new Set<string>();
  for (const m of indexHtml.matchAll(/"\/cards\/([a-z0-9-]+)\\?"/g)) {
    slugs.add(m[1]);
  }
  return [...slugs].sort();
}

/** Parse a very small YAML frontmatter block (string scalars only). */
function parseFrontmatter(mdx: string): {
  meta: Record<string, string>;
  body: string;
} {
  const m = mdx.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: mdx };
  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-zA-Z_]+):\s*"?([^"\n]*)"?\s*$/);
    if (kv) meta[kv[1]] = kv[2];
  }
  return { meta, body: mdx.slice(m[0].length) };
}

/** Derive a card ID like "OGN-236" from a playriftbound gallery link. */
function cardIdFromGalleryLink(link: string | undefined): string {
  if (!link) return "";
  const m = link.match(/#card-gallery--([a-z0-9]+)-(\d+)-\d+/i);
  if (!m) return "";
  return `${m[1].toUpperCase()}-${m[2]}`;
}

/** Strip inline MDX components to plain text and collect rule refs. */
function cleanAnswer(raw: string): { text: string; ruleRefs: string[] } {
  const ruleRefs: string[] = [];
  let text = raw;

  text = text.replace(/<Rule\s+number="([^"]+)"\s*\/>/g, (_s, num: string) => {
    ruleRefs.push(num);
    return ` [${num}]`;
  });
  text = text.replace(/<Card\s+name="([^"]+)"\s*\/>/g, (_s, name: string) => name);
  // Drop any remaining self-closing/simple JSX components.
  text = text.replace(/<[A-Z][A-Za-z0-9]*(?:\s+[^>]*)?\/>/g, "");
  // Collapse hard-wrapped lines within a paragraph, keep paragraph breaks.
  text = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0)
    .join("\n\n");

  return { text, ruleRefs };
}

/** Split an MDX body into (question, answerRaw) pairs on `## ` headers. */
function splitQuestions(body: string): Array<{ anchor: string; question: string; answerRaw: string }> {
  const out: Array<{ anchor: string; question: string; answerRaw: string }> = [];
  const re = /^##\s+(.+?)(?:\s*\[#([a-z0-9-]+)\])?\s*$/gm;
  const matches = [...body.matchAll(re)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : body.length;
    out.push({
      question: m[1].trim(),
      anchor: m[2] ?? "",
      answerRaw: body.slice(start, end).trim(),
    });
  }
  return out;
}

function hashId(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
}

async function main(): Promise<void> {
  console.error(`[scrape] fetching index ${FAQ_BASE}/cards/ ...`);
  // The /cards/ route has no index page of its own; Next.js serves a 404
  // whose layout still embeds the full sidebar nav with every card link.
  const indexHtml = await fetchText(`${FAQ_BASE}/cards/`, { allow404: true });
  const slugs = extractSlugs(indexHtml);
  console.error(`[scrape] found ${slugs.length} card slugs`);

  const rulings: Ruling[] = [];
  for (const slug of slugs) {
    const mdxUrl = `${MDX_BASE}/${slug}.mdx`;
    let mdx: string;
    try {
      mdx = await fetchText(mdxUrl);
    } catch (e) {
      console.error(`[scrape]   ! ${slug}: ${(e as Error).message}`);
      continue;
    }
    const { meta, body } = parseFrontmatter(mdx);
    const cardName = meta.title ?? slug;
    const cardId = cardIdFromGalleryLink(meta.galleryLink) || slug.toUpperCase();
    const qs = splitQuestions(body);
    for (const q of qs) {
      const { text, ruleRefs } = cleanAnswer(q.answerRaw);
      const id = hashId(`${cardId}::${q.question}`);
      rulings.push({
        id,
        cardId,
        cardName,
        cardSlug: slug,
        question: q.question,
        answer: text,
        ruleRefs,
        sourceUrl: `${FAQ_BASE}/cards/${slug}#${q.anchor || id}`,
      });
    }
    console.error(`[scrape]   ${slug}: ${qs.length} ruling(s)`);
    await sleep(delayMs);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(ALL_OUT, JSON.stringify(rulings, null, 2) + "\n");
  console.error(`[scrape] wrote ${rulings.length} rulings -> ${ALL_OUT}`);

  // Deterministic 50/50 split: first hex digit of sha256(cardId+question) parity.
  const train: Ruling[] = [];
  const test: Ruling[] = [];
  for (const r of rulings) {
    const bucket = parseInt(r.id[0], 16) % 2 === 0 ? train : test;
    bucket.push(r);
  }
  const strip = (r: Ruling) => ({
    id: r.id,
    cardId: r.cardId,
    cardName: r.cardName,
    question: r.question,
    answer: r.answer,
  });
  fs.writeFileSync(TRAIN_OUT, JSON.stringify(train.map(strip), null, 2) + "\n");
  fs.writeFileSync(TEST_OUT, JSON.stringify(test.map(strip), null, 2) + "\n");
  console.error(
    `[scrape] split -> train=${train.length} test=${test.length} (train+test=${train.length + test.length})`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
