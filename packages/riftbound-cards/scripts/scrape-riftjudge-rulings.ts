/**
 * RiftJudge FAQ Rulings Scraper
 *
 * Scrapes verified rulings from https://app.riftjudge.com/faq.
 *
 * The site is a server-rendered FastHTML/htmx app (no JSON API) behind a
 * Caddy rate limiter (~100-request burst, then roughly 25 req/min per IP).
 * Fetching all ~7.8k permalink pages one by one would take hours, so:
 *   1. /sitemap.xml lists every verified ruling permalink
 *      `/rulings/<id>/<slug>` — the count matches the "N verified questions"
 *      figure on /questions. slug = python-slugify(question)[:80].
 *   2. /faq?page=N serves 50 entries per page with the full question and the
 *      raw markdown answer (but no id). ~150 requests covers everything.
 *   3. Join (2) to (1) on the slug to recover ids/permalinks. Only entries
 *      whose slug is ambiguous or missing from /faq are fetched individually
 *      from their permalink page (`h1.ruling-question`, `div.ruling-answer`
 *      rendered HTML, `div.ruling-meta` id/date/staleness badges).
 *
 * Two phases so the network step runs separately from normalization:
 *   bun packages/riftbound-cards/scripts/scrape-riftjudge-rulings.ts fetch [--pace-ms 700]
 *     -> packages/riftbound-cards/downloads/riftjudge-faq-raw.json (resumable)
 *   bun packages/riftbound-cards/scripts/scrape-riftjudge-rulings.ts build
 *     -> src/data/rulings/riftjudge-{all,train,test}.json
 *        and merges into all-rulings.json / train.json / test.json
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { getAllCards } from "../src/data/all-cards";
import { decodeHtmlEntities } from "../src/data/decode-entities";

const BASE = "https://app.riftjudge.com";
const SOURCE = "riftjudge";
const PKG_DIR = path.join(import.meta.dir, "..");
const RAW_OUT = path.join(PKG_DIR, "downloads/riftjudge-faq-raw.json");
const OUT_DIR = path.join(PKG_DIR, "src/data/rulings");

const args = process.argv.slice(2);
const mode = args[0] ?? "build";
const flag = (name: string, dflt: string) => args.find((_, i) => args[i - 1] === `--${name}`) ?? dflt;

/** One entry parsed from a /rulings/<id>/<slug> permalink page. */
interface PageEntry {
  rjId: number;
  url: string;
  questionHtml: string;
  answerHtml: string;
  date: string;
  staleness: string;
  stalenessUrl: string;
  badges: string[];
  fetchedAt: string;
}

/** One entry parsed from a /faq?page=N list page. */
interface ListEntry {
  page: number;
  idx: number;
  questionRaw: string;
  answerRaw: string;
}

interface RawFile {
  source: string;
  fetchedAt: string;
  sitemap: Array<{ rjId: number; url: string }>;
  faqPages: Array<{ page: number; pageOf: string; items: ListEntry[] }>;
  rulingPages: PageEntry[];
}

interface Ruling {
  id: string;
  cardId: string;
  cardName: string;
  cardSlug: string;
  cards: string[];
  cardCandidates: string[];
  cardRefsRaw: string[];
  question: string;
  answer: string;
  ruleRefs: string[];
  sourceUrl: string;
  source: string;
  sourceId: string;
  date: string;
  staleness: string;
  tags: string[];
  split?: "train" | "test";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Pace request starts globally so we rarely trip the rate limiter, and when we
// do, honour Retry-After instead of burning retry attempts.
let paceMs = 700;
let nextSlot = 0;
async function paced(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + paceMs;
  if (wait) await sleep(wait);
}

/** Log-safe identifier for a URL (ruling slugs carry question text). */
function idOf(url: string): string {
  return url.match(/\/rulings\/(\d+)\//)?.[1] ?? url.replace(/^https?:\/\/[^/]+/, "").slice(0, 24);
}

async function fetchText(url: string): Promise<string> {
  let lastErr: unknown;
  let throttled = 0;
  for (let attempt = 0; attempt < 5; ) {
    await paced();
    try {
      const res = await fetch(url, { headers: { "User-Agent": "tcg-engines-rulings-scraper/1.0" }, redirect: "follow" });
      if (res.status === 429 && throttled < 60) {
        throttled++;
        const ra = Number(res.headers.get("retry-after") ?? "3");
        await sleep((Number.isFinite(ra) ? ra : 3) * 1000 + Math.random() * 1000);
        continue;
      }
      if (res.status === 429 || res.status >= 500) throw new Error(`GET ${idOf(url)} -> ${res.status}`);
      if (!res.ok) throw Object.assign(new Error(`GET ${idOf(url)} -> ${res.status}`), { fatal: true });
      return await res.text();
    } catch (e) {
      lastErr = e;
      if ((e as { fatal?: boolean }).fatal) throw e;
      attempt++;
      await sleep(500 * 2 ** attempt + Math.random() * 500);
    }
  }
  throw lastErr;
}

function sha1_16(s: string): string {
  return crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);
}

/** The site's permalink slug: python-slugify semantics, truncated to 80. */
export function siteSlug(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_\s-]/gu, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

export function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, "")).trim();
}

// ---------------------------------------------------------------- fetch

function parseRulingPage(html: string, rjId: number, url: string): PageEntry {
  const q = html.match(/<h1 class="ruling-question">([\s\S]*?)<\/h1>/);
  const a = html.match(/<div class="ruling-answer">([\s\S]*?)<\/div>\s*<div class="ruling-meta">/);
  const meta = html.match(/<div class="ruling-meta">([\s\S]*?)<\/div>/);
  if (!(q && a && meta)) throw new Error(`parse failure for ruling ${rjId}`);
  const date = meta[1].match(/date-badge">([^<]*)</)?.[1]?.trim() ?? "";
  const stale = meta[1].match(/<a href="([^"]*)"[^>]*class="staleness-badge">([^<]*)</);
  return {
    rjId,
    url,
    questionHtml: q[1],
    answerHtml: a[1],
    date,
    staleness: stale ? decodeHtmlEntities(stale[2].trim()) : "",
    stalenessUrl: stale ? decodeHtmlEntities(stale[1]) : "",
    badges: [...meta[1].matchAll(/<span class="meta-badge ([^"]*)">([\s\S]*?)<\/span>/g)]
      .filter((m) => !/id-badge|date-badge/.test(m[1]))
      .map((m) => `${m[1].trim()}:${stripTags(m[2])}`),
    fetchedAt: new Date().toISOString(),
  };
}

function parseFaqPage(html: string, page: number): { pageOf: string; items: ListEntry[] } {
  const items: ListEntry[] = [];
  const re =
    /<div class="collapse-title[^"]*">([\s\S]*?)<\/div>\s*<div class="collapse-content[^"]*">([\s\S]*?)<\/div>\s*<\/div>/g;
  let idx = 0;
  for (const m of html.matchAll(re)) items.push({ page, idx: idx++, questionRaw: m[1], answerRaw: m[2] });
  const pageOf = html.match(/Page (\d+) of (\d+)/)?.[0] ?? "";
  return { pageOf, items };
}

/** Which sitemap ids can be recovered from list entries by slug, and which need a page fetch. */
export function joinBySlug(sitemap: Array<{ rjId: number; url: string }>, lists: ListEntry[]) {
  const idsBySlug = new Map<string, number[]>();
  for (const s of sitemap) {
    const slug = decodeURIComponent(s.url.replace(/^.*\/rulings\/\d+\//, ""));
    if (!idsBySlug.has(slug)) idsBySlug.set(slug, []);
    idsBySlug.get(slug)!.push(s.rjId);
  }
  const listsBySlug = new Map<string, ListEntry[]>();
  for (const l of lists) {
    const slug = siteSlug(stripTags(l.questionRaw));
    if (!listsBySlug.has(slug)) listsBySlug.set(slug, []);
    listsBySlug.get(slug)!.push(l);
  }
  const matched = new Map<number, ListEntry>();
  const needPage = new Set<number>();
  const unmatchedLists: ListEntry[] = [];
  for (const [slug, ids] of idsBySlug) {
    const ls = listsBySlug.get(slug) ?? [];
    if (ids.length === 1 && ls.length === 1) matched.set(ids[0], ls[0]);
    else for (const id of ids) needPage.add(id);
  }
  for (const [slug, ls] of listsBySlug) if (!idsBySlug.has(slug)) unmatchedLists.push(...ls);
  return { matched, needPage, unmatchedLists };
}

async function runFetch(): Promise<void> {
  paceMs = Number(flag("pace-ms", "700"));
  const raw: RawFile = fs.existsSync(RAW_OUT)
    ? (JSON.parse(fs.readFileSync(RAW_OUT, "utf8")) as RawFile)
    : { source: BASE, fetchedAt: "", sitemap: [], faqPages: [], rulingPages: [] };
  raw.faqPages ??= [];
  raw.rulingPages ??= [];
  const save = () => {
    raw.fetchedAt = new Date().toISOString();
    raw.faqPages.sort((a, b) => a.page - b.page);
    raw.rulingPages.sort((a, b) => a.rjId - b.rjId);
    fs.mkdirSync(path.dirname(RAW_OUT), { recursive: true });
    fs.writeFileSync(RAW_OUT, JSON.stringify(raw, null, 1) + "\n");
  };

  console.error(`[fetch] sitemap ...`);
  const sitemapXml = await fetchText(`${BASE}/sitemap.xml`);
  raw.sitemap = [...sitemapXml.matchAll(/<loc>(https:\/\/app\.riftjudge\.com\/rulings\/(\d+)\/[^<]*)<\/loc>/g)].map(
    (m) => ({ rjId: Number(m[2]), url: decodeHtmlEntities(m[1]) }),
  );
  const sitemapIds = new Set(raw.sitemap.map((s) => s.rjId));
  console.error(`[fetch] sitemap lists ${raw.sitemap.length} verified rulings`);

  // /faq list pages: refetch from scratch each run (cheap; ordering shifts as entries are added).
  if (flag("refetch-lists", raw.faqPages.length ? "no" : "yes") === "yes") {
    raw.faqPages = [];
    for (let page = 1; ; page++) {
      const { pageOf, items } = parseFaqPage(await fetchText(`${BASE}/faq?page=${page}`), page);
      if (!items.length) break;
      raw.faqPages.push({ page, pageOf, items });
      if (page % 10 === 0) {
        save();
        console.error(`[fetch]   faq page ${page} (${pageOf}); ${raw.faqPages.reduce((n, p) => n + p.items.length, 0)} items`);
      }
    }
    save();
  }
  const lists = raw.faqPages.flatMap((p) => p.items);
  console.error(`[fetch] faq list pages: ${raw.faqPages.length}, items: ${lists.length}`);

  const { matched, needPage, unmatchedLists } = joinBySlug(raw.sitemap, lists);
  console.error(
    `[fetch] slug join: matched=${matched.size} needPage=${needPage.size} listWithoutSitemap=${unmatchedLists.length}`,
  );

  const have = new Map(raw.rulingPages.map((e) => [e.rjId, e]));
  const urlOf = new Map(raw.sitemap.map((s) => [s.rjId, s.url]));
  const todo = [...needPage].filter((id) => !have.has(id)).sort((a, b) => a - b);
  console.error(`[fetch] permalink pages to fetch: ${todo.length} (cached ${have.size})`);
  let done = 0;
  let failed = 0;
  for (const id of todo) {
    try {
      const html = await fetchText(urlOf.get(id)!);
      raw.rulingPages.push(parseRulingPage(html, id, urlOf.get(id)!));
      done++;
    } catch (e) {
      failed++;
      console.error(`[fetch]   ! ${id}: ${(e as Error).message.replace(urlOf.get(id)!, "")}`);
    }
    if ((done + failed) % 50 === 0) {
      save();
      console.error(`[fetch]   pages ${done + failed}/${todo.length} (failed=${failed})`);
    }
  }
  raw.rulingPages = raw.rulingPages.filter((e) => sitemapIds.has(e.rjId));
  save();
  console.error(`[fetch] wrote ${RAW_OUT}: faqItems=${lists.length} rulingPages=${raw.rulingPages.length} failed=${failed}`);
}

// ---------------------------------------------------------------- build

/** Merge blank-line-separated list items back into a tight list. */
function tightenLists(s: string): string {
  const paras = s.split("\n\n");
  const isItem = (p: string) => /^(- |\d+\. )/.test(p);
  let out = paras[0] ?? "";
  for (let i = 1; i < paras.length; i++) {
    out += (isItem(paras[i]) && isItem(paras[i - 1].split("\n").pop()!) ? "\n" : "\n\n") + paras[i];
  }
  return out;
}

export function cleanLines(s: string): string {
  s = s
    .split(/\n/)
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .join("\n");
  return tightenLists(s.replace(/\n{3,}/g, "\n\n").trim());
}

export function htmlToText(html: string): string {
  let s = html.replace(/\r/g, "");
  s = s.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/g, (_m, inner: string) => {
    let n = 0;
    return "\n\n" + inner.replace(/<li[^>]*>\s*/g, () => `\n${++n}. `) + "\n\n";
  });
  s = s.replace(/<li[^>]*>\s*/g, "\n- ");
  s = s.replace(/<br\s*\/?>/g, "\n");
  s = s.replace(/<\/(p|h[1-6]|ul|ol|blockquote|pre|table|tr)>/g, "\n\n");
  s = s.replace(/<(p|h[1-6]|ul|blockquote|pre|table|tr|hr)[^>]*>/g, "\n\n");
  s = s.replace(/<[^>]+>/g, "");
  return cleanLines(decodeHtmlEntities(s));
}

/** Raw markdown (as served HTML-escaped inside the /faq list) -> plain text. */
export function markdownToText(raw: string): string {
  let s = decodeHtmlEntities(raw.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "")).replace(/\r/g, "");
  s = s.replace(/^```[a-z]*\s*$/gim, "");
  s = s.replace(/^\s{0,3}#{1,6}\s*(.*?)\s*#*\s*$/gm, "\n$1\n");
  s = s.replace(/^\s{0,3}>\s?/gm, "");
  s = s.replace(/^\s*(?:[-*_]\s*){3,}$/gm, "");
  s = s.replace(/^(\s*)[*+]\s+/gm, "$1- ");
  s = s.replace(/^\s+(- |\d+\. )/gm, "$1");
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/\[([^\]]+)\]\((?:[^()]|\([^)]*\))*\)/g, "$1");
  s = s.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2");
  s = s.replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, "$1$2");
  s = s.replace(/(^|[^\w_])_(?=\S)([^_\n]*?\S)_(?!\w)/g, "$1$2");
  s = s.replace(/`([^`\n]+)`/g, "$1");
  // A list item directly after a paragraph line is still a new block.
  s = s.replace(/([^\n])\n(- |\d+\. )/g, "$1\n\n$2");
  return cleanLines(s);
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normQuestion(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractRuleRefs(text: string): string[] {
  const refs: string[] = [];
  const seen = new Set<string>();
  const push = (r: string) => {
    r = r.replace(/\.$/, "");
    if (!seen.has(r)) {
      seen.add(r);
      refs.push(r);
    }
  };
  // Dotted refs like 441.3.c / 419.4.a.1 are unambiguous on their own.
  for (const m of text.matchAll(/\b([1-9]\d{2}(?:\.(?:\d+|[a-z]))+)\b/g)) push(m[1]);
  // Bare 3-digit refs only when introduced as a rule.
  for (const m of text.matchAll(/\b(?:rules?|CR)\s*#?\s*([1-9]\d{2})\b(?!\.\d|\.[a-z]\b)/gi)) push(m[1]);
  return refs;
}

/** Rule numbers from any `rules` meta badges on the page. */
function badgeRules(badges: string[]): string[] {
  return badges.filter((b) => b.startsWith("rules")).flatMap((b) => extractRuleRefs(`Rule ${b.slice(b.indexOf(":") + 1)}`));
}

interface CardIndexEntry {
  id: string;
  name: string;
  re: RegExp;
  singleWord: boolean;
  csRe?: RegExp;
}

const SET_ORDER = ["OGN", "OGS", "SFD", "UNL", "VEN"];

export function buildResolver() {
  const cards = [...getAllCards()].sort(
    (a, b) => SET_ORDER.indexOf(a.setId) - SET_ORDER.indexOf(b.setId) || a.cardNumber - b.cardNumber,
  );
  const byName = new Map<string, { id: string; name: string }>();
  for (const c of cards) if (!byName.has(norm(c.name))) byName.set(norm(c.name), { id: c.id, name: c.name });

  // Capitalised, non-sentence-initial occurrence of `word` in original text.
  const properNounRe = (word: string) =>
    new RegExp(`(?<!(?:^|[.!?:\\n]\\s*|Ruling:\\s*))\\b${escapeRe(word)}(?:['’]?s)?\\b`);
  // Multi-word names tolerate a dropped space ("Smokescreen", "Warcamp").
  const phraseRe = (n: string) => new RegExp(`\\b${n.split(" ").map(escapeRe).join(" ?")}s?\\b`);

  const index: CardIndexEntry[] = [];
  const addEntry = (id: string, name: string, n: string, csWord?: string) => {
    if (!n) return;
    const singleWord = !n.includes(" ");
    const entry: CardIndexEntry = { id, name, re: singleWord ? new RegExp(`\\b${escapeRe(n)}s?\\b`) : phraseRe(n), singleWord };
    // Single-word names (Gust, Charm, Block…) collide with prose; require a
    // capitalised, non-sentence-initial occurrence in the original text.
    if (singleWord) entry.csRe = properNounRe(csWord ?? name.replace(/[!]/g, ""));
    index.push(entry);
  };
  const allTokens = new Map<string, number>();
  for (const n of byName.keys()) for (const t of new Set(n.split(" "))) allTokens.set(t, (allTokens.get(t) ?? 0) + 1);
  const tokenTaken = (t: string) =>
    (allTokens.get(t) ?? 0) + (allTokens.get(t.replace(/s$/, "")) ?? 0) + (allTokens.get(`${t}s`) ?? 0) > 1;
  for (const [n, { id, name }] of byName) {
    addEntry(id, name, n);
    // "The Dreaming Tree" is usually just "Dreaming Tree".
    if (n.startsWith("the ")) addEntry(id, name, n.slice(4), name.slice(4));
    // "Zhonya's Hourglass" is usually just "Zhonya's" — first possessive token,
    // when nothing else in the card pool shares it.
    const first = name.split(" ")[0];
    if (/['’]s$/.test(first) && name.includes(" ")) {
      const t = norm(first);
      if (t.length >= 6 && !tokenTaken(t)) addEntry(id, name, t, first.replace(/['’]s$/, ""));
    }
  }
  // Longest patterns first so "Darius, Trifarian" claims before tag "Darius".
  index.sort((a, b) => b.re.source.length - a.re.source.length);

  // Players name champion versions by domain colour ("green Yasuo", "Jinx red").
  const COLOURS: Record<string, string> = { red: "fury", green: "calm", blue: "mind", orange: "body", purple: "chaos", yellow: "order" };
  const champUnitsByTag = new Map<string, Map<string, string[]>>(); // tag -> name -> domains
  const legendsByTag = new Map<string, Map<string, string[]>>();
  const tagOfCard = new Map<string, string>();
  for (const c of cards) {
    const domains = (Array.isArray(c.domain) ? c.domain : [c.domain]).filter(Boolean) as string[];
    if (c.isChampion) for (const t of c.tags ?? []) {
      if (!champUnitsByTag.has(t)) champUnitsByTag.set(t, new Map());
      if (!champUnitsByTag.get(t)!.has(norm(c.name))) champUnitsByTag.get(t)!.set(norm(c.name), domains);
      tagOfCard.set(c.id, t);
    }
    if (c.cardType === "legend" && c.championTag) {
      if (!legendsByTag.has(c.championTag)) legendsByTag.set(c.championTag, new Map());
      if (!legendsByTag.get(c.championTag)!.has(norm(c.name))) legendsByTag.get(c.championTag)!.set(norm(c.name), domains);
      tagOfCard.set(c.id, c.championTag);
    }
  }
  // Longest first so "Master Yi" shadows the starter-deck tag "Yi".
  const tags = [...new Set([...champUnitsByTag.keys(), ...legendsByTag.keys()])].sort((a, b) => b.length - a.length);

  // Frequent community misspellings of card names.
  const SPELLING: Array<[RegExp, string]> = [
    [/\bstupify\b/gi, "stupefy"],
    [/\bdeathbloom\b/gi, "deadbloom"],
    [/\btravelling\b/gi, "traveling"],
    [/\bjudgement\b/gi, "judgment"],
    [/\bthousand[- ]tail(?:ed|s)?(?![- ]watcher)\b/gi, "thousand-tailed watcher"],
    [/\bthousand[- ]tail(?:s)?[- ]watcher\b/gi, "thousand-tailed watcher"],
  ];
  const matchCase = (to: string, from: string) => (/^[A-Z]/.test(from) ? to[0].toUpperCase() + to.slice(1) : to);
  const fixSpelling = (s: string) => SPELLING.reduce((acc, [re, to]) => acc.replace(re, (m) => matchCase(to, m)), s);

  return function resolve(question: string, answer: string) {
    question = fixSpelling(question);
    answer = fixSpelling(answer);
    const nq = norm(question);
    const na = norm(answer);
    const found = new Map<string, number>(); // id -> sort key
    const raw: string[] = [];
    const candidates = new Set<string>();
    const pos = (re: RegExp) => {
      const iq = nq.search(re);
      if (iq >= 0) return iq;
      const ia = na.search(re);
      return ia >= 0 ? 1e7 + ia : -1;
    };
    for (const e of index) {
      const p = pos(e.re);
      if (p < 0) continue;
      if (e.singleWord && !(e.csRe!.test(question) || e.csRe!.test(answer))) continue;
      if (!found.has(e.id)) found.set(e.id, p);
    }
    const tagsCovered = new Set([...found.keys()].map((id) => tagOfCard.get(id)).filter(Boolean));
    const tagsSeen: string[] = [];
    for (const t of tags) {
      const nt = norm(t);
      const re = new RegExp(`\\b${escapeRe(nt)}s?\\b`);
      const p = pos(re);
      if (p < 0) continue;
      const shadowed = tagsSeen.some((seen) => new RegExp(`\\b${escapeRe(nt)}\\b`).test(seen));
      tagsSeen.push(nt);
      if (shadowed || tagsCovered.has(t)) continue;
      const legendRe = new RegExp(`\\b${escapeRe(nt)}s? legend\\b|\\blegend ${escapeRe(nt)}\\b`);
      const isLegend = legendRe.test(nq) || legendRe.test(na);
      const pool = (isLegend ? legendsByTag.get(t) : champUnitsByTag.get(t)) ?? new Map<string, string[]>();
      let names = [...pool.keys()];
      if (names.length > 1) {
        const colourRe = new RegExp(`\\b(red|green|blue|orange|purple|yellow) ${escapeRe(nt)}s?\\b|\\b${escapeRe(nt)}s? (red|green|blue|orange|purple|yellow)\\b`, "g");
        const colours = new Set([...nq.matchAll(colourRe), ...na.matchAll(colourRe)].map((m) => COLOURS[m[1] ?? m[2]]));
        const byColour = names.filter((n) => pool.get(n)!.some((d) => colours.has(d)));
        if (colours.size && byColour.length === colours.size) names = byColour;
      }
      if (names.length === 1 || (names.length > 1 && names.length < pool.size)) {
        for (const n of names) {
          const c = byName.get(n)!;
          if (!found.has(c.id)) found.set(c.id, p);
        }
      } else {
        raw.push(isLegend ? `${t} (Legend)` : t);
        for (const n of names) candidates.add(byName.get(n)!.id);
      }
    }
    const ids = [...found.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
    return { ids, raw, candidates: [...candidates].filter((id) => !found.has(id)) };
  };
}

function readJson<T>(p: string, dflt: T): T {
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf8")) as T) : dflt;
}

function writeJson(p: string, v: unknown): void {
  if (flag("dry", "no") === "yes") return;
  fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n");
}

interface Interim {
  sourceId: string;
  sourceUrl: string;
  question: string;
  answer: string;
  date: string;
  staleness: string;
  badges: string[];
}

function runBuild(): void {
  const raw = JSON.parse(fs.readFileSync(RAW_OUT, "utf8")) as RawFile;
  const lists = raw.faqPages.flatMap((p) => p.items);
  const pages = new Map(raw.rulingPages.map((e) => [e.rjId, e]));
  const { matched, needPage, unmatchedLists } = joinBySlug(raw.sitemap, lists);
  console.error(
    `[build] sitemap=${raw.sitemap.length} faqItems=${lists.length} matchedBySlug=${matched.size} needPage=${needPage.size} pagesCached=${pages.size} listWithoutSitemap=${unmatchedLists.length}`,
  );

  // Assemble one interim record per verified (sitemap) ruling, plus any /faq
  // entries the sitemap does not know about.
  const interim: Interim[] = [];
  let missing = 0;
  for (const s of raw.sitemap) {
    const pg = pages.get(s.rjId);
    const ls = matched.get(s.rjId);
    if (pg) {
      interim.push({
        sourceId: String(s.rjId),
        sourceUrl: s.url,
        question: cleanLines(stripTags(pg.questionHtml.replace(/<br\s*\/?>/g, "\n"))),
        answer: htmlToText(pg.answerHtml),
        date: pg.date,
        staleness: pg.staleness,
        badges: pg.badges ?? [],
      });
    } else if (ls) {
      interim.push({
        sourceId: String(s.rjId),
        sourceUrl: s.url,
        question: cleanLines(stripTags(ls.questionRaw.replace(/<br\s*\/?>/g, "\n"))),
        answer: markdownToText(ls.answerRaw),
        date: "",
        staleness: "",
        badges: [],
      });
    } else missing++;
  }
  for (const ls of unmatchedLists) {
    const question = cleanLines(stripTags(ls.questionRaw.replace(/<br\s*\/?>/g, "\n")));
    interim.push({
      sourceId: `q:${sha1_16(normQuestion(question))}`,
      sourceUrl: `${BASE}/faq#${sha1_16(normQuestion(question))}`,
      question,
      answer: markdownToText(ls.answerRaw),
      date: "",
      staleness: "",
      badges: ["listing:faq-list-only"],
    });
  }
  if (missing) console.error(`[build] WARNING: ${missing} sitemap rulings have neither a list match nor a cached page (run fetch)`);

  const cardsById = new Map(getAllCards().map((c) => [c.id, c]));
  const resolve = buildResolver();
  let normalized: Ruling[] = interim.map((e) => {
    const { ids, raw: cardRefsRaw, candidates } = resolve(e.question, e.answer);
    const primary = ids[0] ? cardsById.get(ids[0]) : undefined;
    return {
      id: sha1_16(`${SOURCE}:${e.sourceId}`),
      cardId: primary?.id ?? "",
      cardName: primary?.name ?? "",
      cardSlug: primary ? slugify(primary.name) : "",
      cards: ids,
      cardCandidates: candidates,
      cardRefsRaw,
      question: e.question,
      answer: e.answer,
      ruleRefs: [...new Set([...extractRuleRefs(e.answer), ...extractRuleRefs(e.question), ...badgeRules(e.badges)])],
      sourceUrl: e.sourceUrl,
      source: SOURCE,
      sourceId: e.sourceId,
      date: e.date,
      staleness: e.staleness,
      tags: e.badges.filter((b) => !b.startsWith("rules")),
    };
  });
  const empty = normalized.filter((r) => !r.question || !r.answer);
  if (empty.length) console.error(`[build] dropping ${empty.length} entries with empty question/answer`);
  normalized = normalized.filter((r) => r.question && r.answer);

  // Internal dedupe: identical question text -> keep the newest ruling (highest id).
  const byQ = new Map<string, Ruling>();
  const idNum = (r: Ruling) => (/^\d+$/.test(r.sourceId) ? Number(r.sourceId) : -1);
  for (const r of [...normalized].sort((a, b) => idNum(a) - idNum(b))) byQ.set(normQuestion(r.question), r);
  const internalDup = normalized.length - byQ.size;
  normalized = [...byQ.values()];

  // Dedupe against existing (non-riftjudge) rulings.
  const allPath = path.join(OUT_DIR, "all-rulings.json");
  const trainPath = path.join(OUT_DIR, "train.json");
  const testPath = path.join(OUT_DIR, "test.json");
  const existingAll = readJson<Array<Record<string, unknown>>>(allPath, []).filter((r) => r.source !== SOURCE);
  const existingTrain = readJson<Array<Record<string, unknown>>>(trainPath, []).filter((r) => r.source !== SOURCE);
  const existingTest = readJson<Array<Record<string, unknown>>>(testPath, []).filter((r) => r.source !== SOURCE);
  const trainIds = new Set(existingTrain.map((r) => r.id as string));
  const testIds = new Set(existingTest.map((r) => r.id as string));
  const existingQs = new Set(existingAll.map((r) => normQuestion(String(r.question))));
  const existingIds = new Set(existingAll.map((r) => r.id as string));
  const isDup = (r: Ruling) => existingQs.has(normQuestion(r.question)) || existingIds.has(r.id);
  const overlap = normalized.filter(isDup);
  const fresh = normalized.filter((r) => !isDup(r));

  // Deterministic ~50/50 split on hash parity.
  fresh.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const r of fresh) {
    r.split = parseInt(crypto.createHash("sha1").update(r.id).digest("hex").slice(0, 8), 16) % 2 === 0 ? "train" : "test";
  }
  const train = fresh.filter((r) => r.split === "train");
  const test = fresh.filter((r) => r.split === "test");

  writeJson(path.join(OUT_DIR, "riftjudge-all.json"), fresh);
  writeJson(path.join(OUT_DIR, "riftjudge-train.json"), train);
  writeJson(path.join(OUT_DIR, "riftjudge-test.json"), test);

  const strip = (r: Ruling) => ({
    id: r.id,
    cardId: r.cardId,
    cardName: r.cardName,
    cards: r.cards,
    question: r.question,
    answer: r.answer,
    source: r.source,
  });
  writeJson(trainPath, [...existingTrain, ...train.map(strip)]);
  writeJson(testPath, [...existingTest, ...test.map(strip)]);

  const taggedExisting = existingAll.map((r) => ({
    ...r,
    source: (r.source as string) ?? "riftfaq",
    split: (r.split as string) ?? (trainIds.has(r.id as string) ? "train" : testIds.has(r.id as string) ? "test" : ""),
  }));
  writeJson(allPath, [...taggedExisting, ...fresh]);

  // Report (counts only — test split text is held out).
  const resolved = fresh.filter((r) => r.cards.length > 0).length;
  const unresolvedNames = new Map<string, number>();
  for (const r of fresh) for (const n of r.cardRefsRaw) unresolvedNames.set(n, (unresolvedNames.get(n) ?? 0) + 1);
  const cardFreq = new Map<string, number>();
  for (const r of fresh) for (const id of r.cards) cardFreq.set(id, (cardFreq.get(id) ?? 0) + 1);
  const report = {
    sitemapCount: raw.sitemap.length,
    faqListItems: lists.length,
    matchedBySlug: matched.size,
    fromPermalinkPages: [...pages.keys()].filter((id) => !matched.has(id) || needPage.has(id)).length,
    listWithoutSitemap: unmatchedLists.length,
    sitemapMissing: missing,
    assembled: interim.length,
    droppedEmpty: empty.length,
    internalDuplicateQuestions: internalDup,
    overlapWithExisting: overlap.length,
    new: fresh.length,
    train: train.length,
    test: test.length,
    trainJsonTotal: existingTrain.length + train.length,
    testJsonTotal: existingTest.length + test.length,
    allRulingsTotal: taggedExisting.length + fresh.length,
    withResolvedCard: resolved,
    resolvedRate: +(resolved / fresh.length).toFixed(4),
    withResolvedOrCandidates: fresh.filter((r) => r.cards.length || r.cardCandidates.length).length,
    resolvedOrCandidateRate: +(fresh.filter((r) => r.cards.length || r.cardCandidates.length).length / fresh.length).toFixed(4),
    withRawOnly: fresh.filter((r) => !r.cards.length && r.cardRefsRaw.length).length,
    withNoCardRef: fresh.filter((r) => !r.cards.length && !r.cardRefsRaw.length).length,
    withRuleRefs: fresh.filter((r) => r.ruleRefs.length).length,
    withTags: fresh.filter((r) => r.tags.length).length,
    unresolvedNames: [...unresolvedNames.entries()].sort((a, b) => b[1] - a[1]),
    topCards: [...cardFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([id, n]) => [id, cardsById.get(id)?.name, n]),
    exampleTrain: train.slice(0, 3),
  };
  console.log(JSON.stringify(report, null, 2));
}

if (!import.meta.main) {
  // imported for helpers only
} else if (mode === "fetch") {
  await runFetch();
} else if (mode === "build") {
  runBuild();
} else {
  console.error(`unknown mode ${mode}; use fetch|build`);
  process.exit(2);
}
