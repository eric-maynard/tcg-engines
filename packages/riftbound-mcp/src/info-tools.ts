/**
 * Read-only "info tools": tree-structured rules lookup, card search and
 * per-seat PUBLIC game information.
 *
 * Everything here is a pure function over (the rules db, card definitions, one
 * seat's redacted `Observation`) plus `infoToolSpecs` — a single array of
 * `{ name, description, input_schema, handler(ctx, args) → string }` that the
 * MCP server registers as tools and the web app's Claude opponent hands to the
 * Anthropic Messages API as `tools`.
 *
 * Hidden information is safe by construction: game tools only read the
 * viewer's `Observation` (harness `observe(engine, seat, …)` / `backend.view(seat)`),
 * in which the opponent's hand, every deck and foreign facedown cards are
 * already `HiddenCardView`s — there is no code path from these tools to raw
 * engine state.
 *
 * Outputs are compact strings (≤ ~1.5k chars); long lists are cut with
 * "…(+N more; refine your query)".
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CardDefLike, CardState, CardView, Observation, Seat } from "@tcg/riftbound/harness";
import { isHiddenView } from "@tcg/riftbound/harness";
import { getAllCards, SETS } from "@tcg/riftbound-cards/data";

// ---------------------------------------------------------------------------
// public types
// ---------------------------------------------------------------------------

export type JsonSchema = Record<string, unknown>;

/** What a handler may need. Game tools require `view` + `viewer`. */
export interface InfoContext {
  /** Redacted per-seat observation provider (harness observe / backend.view). */
  view?: (viewer: Seat) => Observation;
  /** The seat asking (its own hand is visible to it; nothing else private is). */
  viewer?: Seat;
  /** Seats in turn order (default: the players in the observation). */
  seats?: readonly Seat[];
  /** Card definitions (default: `getAllCards()` from @tcg/riftbound-cards). */
  cards?: () => readonly CardDefLike[];
  /** Rules database override (default: .claude/skills/riftbound-rules/rules-db.json). */
  rules?: () => RulesDb | undefined;
}

export type InfoScope = "rules" | "cards" | "game";

export interface InfoToolSpec {
  name: string;
  description: string;
  /** JSON Schema (type: object) — valid both as MCP `inputSchema` and Messages API `input_schema`. */
  input_schema: JsonSchema;
  scope: InfoScope;
  handler: (ctx: InfoContext, args: Record<string, unknown>) => string;
}

/** Thrown for bad arguments / unknown ids; the message is meant for the model. */
export class InfoError extends Error {
  readonly code: string;
  constructor(message: string, code = "BAD_REQUEST") {
    super(message);
    this.code = code;
  }
}

export const MAX_CHARS = 1500;

// ---------------------------------------------------------------------------
// output helpers
// ---------------------------------------------------------------------------

/** Cut a single text to `max` chars. */
export function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * Join header lines + as many rows as fit in `max` chars; when rows are
 * dropped, append "…(+N more; refine your query)".
 */
export function limitLines(
  head: readonly string[],
  rows: readonly string[],
  opts: { max?: number; tail?: readonly string[]; hint?: string; more?: number } = {},
): string {
  const max = opts.max ?? MAX_CHARS;
  const tail = opts.tail ?? [];
  const extra = Math.max(0, opts.more ?? 0);
  const moreLine = (n: number) => `…(+${n} more; ${opts.hint ?? "refine your query"})`;
  const out = [...head];
  let used = out.join("\n").length + (tail.length ? tail.join("\n").length + 1 : 0);
  const reserve = moreLine(rows.length + extra).length + 1;
  let shown = 0;
  for (const raw of rows) {
    const isLast = shown === rows.length - 1;
    const closing = isLast && extra === 0 ? 0 : reserve;
    let row = raw;
    if (used + row.length + 1 + closing > max) {
      if (shown > 0) {
        break;
      }
      // the very first row always shows, clipped to whatever room is left
      row = clip(row, Math.max(40, max - used - closing - 1));
    }
    out.push(row);
    used += row.length + 1;
    shown += 1;
    if (row !== raw) {
      break;
    }
  }
  const dropped = rows.length - shown + extra;
  if (dropped > 0) {
    out.push(moreLine(dropped));
  }
  out.push(...tail);
  return out.join("\n");
}

const LIGATURES: Record<string, string> = {
  ﬀ: "ff",
  ﬁ: "fi",
  ﬂ: "fl",
  ﬃ: "ffi",
  ﬄ: "ffl",
  " ": " ",
};

/** PDF-extracted rules text carries ligature glyphs (ﬁ, ﬂ); fold them so "Deflect" matches "Deﬂect". */
export function normalizeText(s: string): string {
  return s.replace(/[ﬀﬁﬂﬃﬄ ]/g, (m) => LIGATURES[m] ?? m);
}

function lc(s: unknown): string {
  return typeof s === "string" ? s.toLowerCase() : "";
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function int(v: unknown, dflt: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : dflt;
}

// ---------------------------------------------------------------------------
// A. Rules — tree over the flat rules-db.json
// ---------------------------------------------------------------------------

export interface RuleRecord {
  id: string;
  text: string;
  section: number;
  sectionName: string;
  xref: string[];
}

export interface RulesDb {
  count?: number;
  rules: RuleRecord[];
}

export interface RuleNode {
  /** Rule id ("323.12.a") or section id ("S3"). */
  id: string;
  title: string;
  text: string;
  section: number;
  sectionName: string;
  xref: readonly string[];
  /** true for short heading-like top-level rules ("Setup", "Deflect") and sections. */
  heading: boolean;
  kind: "section" | "rule";
}

export interface RulesIndex {
  nodes: Map<string, RuleNode>;
  parent: Map<string, string | undefined>;
  children: Map<string, string[]>;
  sections: RuleNode[];
  /** rules in document order */
  order: string[];
}

const HERE = import.meta.dir;
const REPO_ROOT = resolve(HERE, "../../..");
const RULES_REL = ".claude/skills/riftbound-rules/rules-db.json";

/** Where the rules db is looked for (first hit wins). */
export function rulesDbCandidates(): string[] {
  const out: string[] = [];
  if (process.env.RIFTBOUND_RULES_DB) {
    out.push(process.env.RIFTBOUND_RULES_DB);
  }
  out.push(resolve(REPO_ROOT, RULES_REL));
  out.push(resolve(process.cwd(), RULES_REL));
  return out;
}

export function readRulesDb(): RulesDb | undefined {
  for (const p of rulesDbCandidates()) {
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, "utf8")) as RulesDb;
      } catch {
        /* try next */
      }
    }
  }
  return undefined;
}

function isHeadingText(text: string): boolean {
  const t = text.trim();
  return t.length < 48 && !/[.:;]$/.test(t);
}

function titleOf(text: string): string {
  const t = normalizeText(text).replace(/\s+/g, " ").trim();
  if (isHeadingText(t)) {
    return t;
  }
  const firstSentence = /^(.{12,70}?[.:])\s/.exec(t)?.[1];
  return clip(firstSentence ?? t, 64);
}

export function buildRulesIndex(db: RulesDb): RulesIndex {
  const nodes = new Map<string, RuleNode>();
  const parent = new Map<string, string | undefined>();
  const children = new Map<string, string[]>();
  const sections: RuleNode[] = [];
  const order: string[] = [];
  const bySection = new Map<number, RuleRecord[]>();
  for (const r of db.rules) {
    const list = bySection.get(r.section) ?? [];
    list.push(r);
    bySection.set(r.section, list);
  }
  for (const [n, rules] of [...bySection.entries()].sort((a, b) => a[0] - b[0])) {
    const tops = rules.filter((r) => !r.id.includes("."));
    const sid = `S${n}`;
    const first = tops[0]?.id ?? rules[0]?.id ?? "?";
    const last = tops[tops.length - 1]?.id ?? first;
    const sec: RuleNode = {
      heading: true,
      id: sid,
      kind: "section",
      section: n,
      sectionName: rules[0]?.sectionName ?? `Section ${n}`,
      text: `${rules[0]?.sectionName ?? `Section ${n}`} (rules ${first}–${last}, ${rules.length} entries)`,
      title: rules[0]?.sectionName ?? `Section ${n}`,
      xref: [],
    };
    nodes.set(sid, sec);
    parent.set(sid, undefined);
    sections.push(sec);
  }
  // rule nodes
  for (const r of db.rules) {
    const text = normalizeText(r.text);
    const top = !r.id.includes(".");
    nodes.set(r.id, {
      heading: top && isHeadingText(text),
      id: r.id,
      kind: "rule",
      section: r.section,
      sectionName: r.sectionName,
      text,
      title: titleOf(text),
      xref: r.xref ?? [],
    });
    order.push(r.id);
  }
  // parents: dotted → longest existing prefix; top-level heading → section; other top-level → preceding heading in section (else section)
  const lastHeadingBySection = new Map<number, string>();
  for (const r of db.rules) {
    const node = nodes.get(r.id) as RuleNode;
    const sid = `S${r.section}`;
    if (r.id.includes(".")) {
      const parts = r.id.split(".");
      let p: string | undefined;
      for (let k = parts.length - 1; k >= 1; k--) {
        const cand = parts.slice(0, k).join(".");
        if (nodes.has(cand)) {
          p = cand;
          break;
        }
      }
      parent.set(r.id, p ?? lastHeadingBySection.get(r.section) ?? sid);
    } else if (node.heading) {
      parent.set(r.id, sid);
      lastHeadingBySection.set(r.section, r.id);
    } else {
      parent.set(r.id, lastHeadingBySection.get(r.section) ?? sid);
    }
  }
  for (const id of [...sections.map((s) => s.id), ...order]) {
    const p = parent.get(id);
    if (p !== undefined) {
      const list = children.get(p) ?? [];
      list.push(id);
      children.set(p, list);
    }
  }
  return { children, nodes, order, parent, sections };
}

let rulesCache: { index?: RulesIndex; tried: boolean } = { tried: false };

/** Lazily load + index the rules once per process (ctx.rules overrides and is not cached). */
export function rulesIndex(ctx: InfoContext = {}): RulesIndex | undefined {
  if (ctx.rules) {
    const db = ctx.rules();
    return db ? buildRulesIndex(db) : undefined;
  }
  if (!rulesCache.tried) {
    const db = readRulesDb();
    rulesCache = { index: db ? buildRulesIndex(db) : undefined, tried: true };
  }
  return rulesCache.index;
}

/** Test hook: forget the cached rules index. */
export function resetInfoCaches(): void {
  rulesCache = { tried: false };
  rowsCache = new WeakMap();
  defaultRows = undefined;
}

function needRules(ctx: InfoContext): RulesIndex {
  const idx = rulesIndex(ctx);
  if (!idx) {
    throw new InfoError(
      `Rules database not found (looked in ${rulesDbCandidates().join(", ")}); set RIFTBOUND_RULES_DB.`,
      "RULES_UNAVAILABLE",
    );
  }
  return idx;
}

/** "§3" / "s3" / "3" / "section 3" → "S3"; "rule 323.12.a." → "323.12.a". */
export function resolveRuleId(idx: RulesIndex, raw: unknown): string | undefined {
  if (typeof raw !== "string" && typeof raw !== "number") {
    return undefined;
  }
  let s = String(raw).trim();
  const sec = /^(?:§|s|sec(?:tion)?\s*)?(\d{1,2})$/i.exec(s);
  if (sec && idx.nodes.has(`S${Number(sec[1])}`)) {
    return `S${Number(sec[1])}`;
  }
  s = s.replace(/^rule\s+/i, "").replace(/\.$/, "");
  if (idx.nodes.has(s)) {
    return s;
  }
  if (/^\d{1,2}$/.test(s) && idx.nodes.has(s.padStart(3, "0"))) {
    return s.padStart(3, "0");
  }
  return undefined;
}

/** " Did you mean: 323.12, 323.11, …?" — the nearest existing ancestor prefix and its neighbours. */
function nearIds(idx: RulesIndex, raw: string): string {
  const parts = raw.replace(/\.$/, "").split(".");
  for (let k = parts.length - 1; k >= 1; k--) {
    const prefix = parts.slice(0, k).join(".");
    if (idx.nodes.has(prefix)) {
      const sibs = (idx.children.get(prefix) ?? []).slice(0, 5);
      return ` Nearest existing ancestor: ${prefix}${sibs.length ? ` (children: ${sibs.join(", ")})` : " (a leaf)"}.`;
    }
  }
  const starts = idx.order.filter((r) => r.startsWith(parts[0] ?? "\u0000")).slice(0, 6);
  return starts.length ? ` Did you mean: ${starts.join(", ")}?` : "";
}

export function ruleAncestors(idx: RulesIndex, id: string): RuleNode[] {
  const out: RuleNode[] = [];
  let p = idx.parent.get(id);
  const guard = new Set<string>();
  while (p && !guard.has(p)) {
    guard.add(p);
    const n = idx.nodes.get(p);
    if (n) {
      out.unshift(n);
    }
    p = idx.parent.get(p);
  }
  return out;
}

export function ruleChildren(idx: RulesIndex, id: string): RuleNode[] {
  return (idx.children.get(id) ?? []).map((c) => idx.nodes.get(c) as RuleNode);
}

function childLine(n: RuleNode, idx: RulesIndex): string {
  const kids = idx.children.get(n.id)?.length ?? 0;
  return `  ${n.id} · ${n.heading ? n.title : clip(n.text, 84)}${kids ? ` (+${kids})` : ""}`;
}

export function rulesToc(ctx: InfoContext = {}): string {
  const idx = needRules(ctx);
  const rows = idx.sections.map((s) => `  ${s.id} · ${s.text}`);
  return limitLines(["Riftbound Core Rules — top-level sections (ids are tree nodes):"], rows, {
    tail: [
      'Drill down: rule_children{id:"S4"} → headings; rule{id:"340"} → text + parent chain + children; rule_search{query:"hidden"} for keywords.',
    ],
  });
}

export function ruleLookup(ctx: InfoContext, args: { id?: unknown }): string {
  const idx = needRules(ctx);
  const id = resolveRuleId(idx, args.id);
  if (!id) {
    const raw = String(args.id ?? "").trim();
    throw new InfoError(
      `No rule "${raw}".${nearIds(idx, raw)} Use rules_toc / rule_search to find ids.`,
      "RULE_NOT_FOUND",
    );
  }
  const node = idx.nodes.get(id) as RuleNode;
  const chain = ruleAncestors(idx, id);
  const kids = ruleChildren(idx, id);
  const head: string[] = [];
  const path = chain.map((a) => `${a.id} ${clip(a.title, 40)}`).join(" › ");
  head.push(`${node.id} — ${node.sectionName}${path ? `  [path: ${path}]` : ""}`);
  if (node.kind === "rule") {
    head.push(clip(node.text, kids.length ? 700 : 1100));
    if (node.xref.length) {
      head.push(`see also: ${node.xref.slice(0, 8).join(", ")}`);
    }
  } else {
    head.push(node.text);
  }
  if (kids.length === 0) {
    return head.join("\n");
  }
  head.push(`children (${kids.length}):`);
  return limitLines(
    head,
    kids.map((k) => childLine(k, idx)),
    { hint: `rule_children{id:"${id}"} lists all` },
  );
}

export function ruleChildrenText(
  ctx: InfoContext,
  args: { id?: unknown; offset?: unknown },
): string {
  const idx = needRules(ctx);
  const id = resolveRuleId(idx, args.id);
  if (!id) {
    throw new InfoError(
      `No rule/section "${String(args.id ?? "")}". Sections are S1…S${idx.sections.length}; try rules_toc.`,
      "RULE_NOT_FOUND",
    );
  }
  const node = idx.nodes.get(id) as RuleNode;
  const offset = Math.max(0, int(args.offset, 0));
  const kids = ruleChildren(idx, id);
  if (kids.length === 0) {
    return `${node.id} (${clip(node.title, 50)}) has no children — it is a leaf; call rule{id:"${node.id}"} for its text.`;
  }
  const rows = kids.slice(offset).map((k) => childLine(k, idx));
  return limitLines(
    [
      `${node.id} · ${clip(node.title, 60)} — ${kids.length} children${offset ? ` (from #${offset})` : ""}:`,
    ],
    rows,
    { hint: `pass offset:${offset}+shown to page, or rule{id} on one child` },
  );
}

export interface RuleHit {
  id: string;
  score: number;
  snippet: string;
}

export function searchRules(idx: RulesIndex, query: string, limit = 8): RuleHit[] {
  const q = normalizeText(query).toLowerCase().trim();
  if (!q) {
    return [];
  }
  const terms = [...new Set(q.split(/[^a-z0-9'-]+/).filter((t) => t.length >= 2))];
  const hits: RuleHit[] = [];
  for (const id of idx.order) {
    const n = idx.nodes.get(id) as RuleNode;
    const text = n.text.toLowerCase();
    let score = 0;
    if (id === q || id.startsWith(`${q}.`)) {
      score += 20;
    }
    const phraseAt = terms.length > 1 ? text.indexOf(q) : -1;
    if (phraseAt >= 0) {
      score += 6;
    }
    let matched = 0;
    let firstAt = phraseAt;
    for (const t of terms) {
      let at = text.indexOf(t);
      if (at < 0) {
        continue;
      }
      matched += 1;
      if (firstAt < 0) {
        firstAt = at;
      }
      let count = 0;
      while (at >= 0 && count < 3) {
        count += 1;
        at = text.indexOf(t, at + t.length);
      }
      score += count;
      if (n.heading && n.title.toLowerCase().includes(t)) {
        score += 4;
      }
    }
    if (terms.length > 0 && matched === 0 && score === 0) {
      continue;
    }
    if (terms.length > 1 && matched === terms.length) {
      score += 3;
    }
    if (score <= 0) {
      continue;
    }
    const start = Math.max(0, (firstAt < 0 ? 0 : firstAt) - 30);
    const snippet = `${start > 0 ? "…" : ""}${clip(n.text.slice(start), 96)}`;
    hits.push({ id, score, snippet });
  }
  hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id, undefined, { numeric: true }));
  return hits.slice(0, Math.max(1, limit));
}

export function ruleSearchText(
  ctx: InfoContext,
  args: { query?: unknown; limit?: unknown },
): string {
  const idx = needRules(ctx);
  const query = str(args.query);
  if (!query) {
    throw new InfoError(
      'rule_search needs {query:"…"} (e.g. "deflect", "rune pool", "showdown focus")',
    );
  }
  const limit = Math.min(25, Math.max(1, int(args.limit, 8)));
  const hits = searchRules(idx, query, limit);
  if (hits.length === 0) {
    return `No rules mention "${query}". Try fewer/other words, or rules_toc → rule_children to browse.`;
  }
  return limitLines(
    [`Rules matching "${query}" (best first; open one with rule{id}):`],
    hits.map((h) => `  ${h.id} · ${h.snippet}`),
  );
}

// ---------------------------------------------------------------------------
// B. Cards
// ---------------------------------------------------------------------------

export interface CardRow {
  id: string;
  name: string;
  /** unit | spell | gear | equipment | legend | battlefield | rune */
  type: string;
  isChampion: boolean;
  isToken: boolean;
  domains: string[];
  energy: number | undefined;
  pips: string[];
  might: number | undefined;
  mightBonus: number | undefined;
  keywords: string[];
  text: string;
  set: string;
  tags: string[];
  championTag: string | undefined;
  timing: string | undefined;
  abilityCount: number;
  def: CardDefLike;
}

function toRow(def: CardDefLike): CardRow {
  const domains =
    def.domain === undefined
      ? []
      : Array.isArray(def.domain)
        ? [...(def.domain as readonly string[])]
        : [def.domain as string];
  const abilityKeywords = (def.abilities ?? [])
    .filter(
      (a): a is { type: string; keyword: string } =>
        typeof a === "object" &&
        a !== null &&
        (a as { type?: unknown }).type === "keyword" &&
        typeof (a as { keyword?: unknown }).keyword === "string",
    )
    .map((a) => a.keyword);
  const keywords = [...new Set([...(def.keywords ?? []), ...abilityKeywords])];
  const id = String(def.id ?? "?");
  const set = String((def as { setId?: unknown }).setId ?? id.split("-")[0] ?? "?").toUpperCase();
  return {
    abilityCount: def.abilities?.length ?? 0,
    championTag: typeof def.championTag === "string" ? def.championTag : undefined,
    def,
    domains,
    energy: def.energyCost,
    id,
    isChampion: def.isChampion === true,
    isToken: (def as { isToken?: unknown }).isToken === true,
    keywords,
    might: def.might,
    mightBonus: def.mightBonus,
    name: String(def.name ?? id),
    pips: [...(def.powerCost ?? [])],
    set,
    tags: [...(def.tags ?? [])],
    text: decodeEntities(def.rulesText ?? "").trim(),
    timing: def.timing,
    type: def.cardType,
  };
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&gt;": ">",
  "&lt;": "<",
  "&quot;": '"',
  "&#39;": "'",
};

function decodeEntities(s: string): string {
  return s.replace(/&(?:amp|gt|lt|quot|#39);/g, (m) => ENTITIES[m] ?? m);
}

let rowsCache = new WeakMap<readonly CardDefLike[], CardRow[]>();
let defaultRows: CardRow[] | undefined;

export function cardRows(ctx: InfoContext = {}): CardRow[] {
  if (!ctx.cards) {
    defaultRows ??= (getAllCards() as unknown as readonly CardDefLike[]).map(toRow);
    return defaultRows;
  }
  const defs = ctx.cards();
  let rows = rowsCache.get(defs);
  if (!rows) {
    rows = defs.map(toRow);
    rowsCache.set(defs, rows);
  }
  return rows;
}

export function costLabel(energy: number | undefined, pips: readonly string[]): string {
  if (energy === undefined && pips.length === 0) {
    return "-";
  }
  const p = pips.map((x) => `[${x}]`).join("");
  return `${energy ?? 0}${p ? `+${p}` : ""}`;
}

function typeLabel(r: CardRow): string {
  if (r.isToken) {
    return `${r.type}(token)`;
  }
  if (r.isChampion) {
    return `${r.type}(champion)`;
  }
  return r.type;
}

export function cardRowLine(r: CardRow): string {
  const bits = [r.id, r.name, typeLabel(r), costLabel(r.energy, r.pips)];
  if (r.might !== undefined && (r.type === "unit" || r.might > 0)) {
    bits.push(`${r.might}M`);
  } else if (r.mightBonus) {
    bits.push(`+${r.mightBonus}M`);
  }
  if (r.domains.length) {
    bits.push(r.domains.join("/"));
  }
  if (r.keywords.length) {
    bits.push(r.keywords.join(","));
  }
  bits.push(r.text ? clip(r.text.replace(/\n/g, " / "), 70) : "(no text)");
  return bits.join(" · ");
}

interface Range {
  min?: number;
  max?: number;
}

function range(v: unknown): Range | undefined {
  if (typeof v === "number") {
    return { max: v, min: v };
  }
  if (v && typeof v === "object") {
    const o = v as { min?: unknown; max?: unknown; eq?: unknown };
    if (typeof o.eq === "number") {
      return { max: o.eq, min: o.eq };
    }
    const r: Range = {};
    if (typeof o.min === "number") {
      r.min = o.min;
    }
    if (typeof o.max === "number") {
      r.max = o.max;
    }
    return r.min !== undefined || r.max !== undefined ? r : undefined;
  }
  return undefined;
}

function inRange(n: number | undefined, r: Range | undefined): boolean {
  if (!r) {
    return true;
  }
  const v = n ?? 0;
  return (r.min === undefined || v >= r.min) && (r.max === undefined || v <= r.max);
}

const TYPE_ALIASES: Record<string, string> = {
  battlefields: "battlefield",
  champions: "champion",
  equip: "equipment",
  equipments: "equipment",
  gears: "gear",
  legends: "legend",
  runes: "rune",
  spells: "spell",
  tokens: "token",
  units: "unit",
};

export interface CardSearchArgs {
  text?: unknown;
  name?: unknown;
  domain?: unknown;
  domains?: unknown;
  type?: unknown;
  energy?: unknown;
  power?: unknown;
  might?: unknown;
  keyword?: unknown;
  set?: unknown;
  champion?: unknown;
  tag?: unknown;
  timing?: unknown;
  includeTokens?: unknown;
  limit?: unknown;
  sort?: unknown;
}

function typeMatches(r: CardRow, type: string): boolean {
  switch (type) {
    case "gear": {
      return r.type === "gear" || r.type === "equipment";
    }
    case "champion": {
      return r.type === "unit" && r.isChampion;
    }
    case "token": {
      return r.isToken;
    }
    default: {
      return r.type === type;
    }
  }
}

/** Pure filter: every returned row satisfies every given criterion. */
export function filterCards(rows: readonly CardRow[], a: CardSearchArgs): CardRow[] {
  const text = str(a.text)?.toLowerCase();
  const name = str(a.name)?.toLowerCase();
  const domainList = [
    ...(str(a.domain) ? [String(a.domain)] : []),
    ...(Array.isArray(a.domains)
      ? (a.domains as unknown[]).map(String)
      : str(a.domains)
        ? [String(a.domains)]
        : []),
  ].map((d) => d.toLowerCase());
  let type = str(a.type)?.toLowerCase();
  type = type ? (TYPE_ALIASES[type] ?? type) : undefined;
  const energy = range(a.energy);
  const power = range(a.power);
  const might = range(a.might);
  const keyword = str(a.keyword)?.toLowerCase();
  const set = str(a.set)?.toLowerCase();
  const tag = (str(a.champion) ?? str(a.tag))?.toLowerCase();
  const timing = str(a.timing)?.toLowerCase();
  const includeTokens = a.includeTokens === true || type === "token";
  return rows.filter((r) => {
    if (!includeTokens && r.isToken) {
      return false;
    }
    if (type && !typeMatches(r, type)) {
      return false;
    }
    if (domainList.length && !domainList.some((d) => r.domains.includes(d))) {
      return false;
    }
    if (!inRange(r.energy, energy) || !inRange(r.pips.length, power)) {
      return false;
    }
    if (
      might &&
      (r.might === undefined
        ? !(might.min === undefined || might.min <= 0)
        : !inRange(r.might, might))
    ) {
      return false;
    }
    if (
      keyword &&
      !r.keywords.some((k) => k.toLowerCase() === keyword || k.toLowerCase().startsWith(keyword))
    ) {
      return false;
    }
    if (set && r.set.toLowerCase() !== set) {
      return false;
    }
    if (
      tag &&
      !r.tags.some((t) => t.toLowerCase().includes(tag)) &&
      !(r.championTag ?? "").toLowerCase().includes(tag)
    ) {
      return false;
    }
    if (timing && (r.timing ?? (r.type === "spell" ? "standard" : "")).toLowerCase() !== timing) {
      return false;
    }
    if (name && !r.name.toLowerCase().includes(name)) {
      return false;
    }
    if (text && !r.text.toLowerCase().includes(text) && !r.name.toLowerCase().includes(text)) {
      return false;
    }
    return true;
  });
}

function sortRows(rows: CardRow[], sort: string | undefined): CardRow[] {
  const byName = (x: CardRow, y: CardRow) => x.name.localeCompare(y.name);
  const key = (sort ?? "energy").toLowerCase();
  const cmp: Record<string, (x: CardRow, y: CardRow) => number> = {
    energy: (x, y) =>
      (x.energy ?? -1) - (y.energy ?? -1) || x.pips.length - y.pips.length || byName(x, y),
    id: (x, y) => x.id.localeCompare(y.id, undefined, { numeric: true }),
    might: (x, y) => (y.might ?? -1) - (x.might ?? -1) || byName(x, y),
    name: byName,
    power: (x, y) =>
      x.pips.length - y.pips.length || (x.energy ?? -1) - (y.energy ?? -1) || byName(x, y),
    set: (x, y) =>
      x.set.localeCompare(y.set) || x.id.localeCompare(y.id, undefined, { numeric: true }),
  };
  return [...rows].sort(cmp[key] ?? cmp.energy);
}

function describeQuery(a: CardSearchArgs): string {
  const bits: string[] = [];
  for (const k of [
    "type",
    "domain",
    "domains",
    "energy",
    "power",
    "might",
    "keyword",
    "set",
    "champion",
    "tag",
    "timing",
    "name",
    "text",
  ] as const) {
    const v = (a as Record<string, unknown>)[k];
    if (v !== undefined && v !== null && v !== "") {
      bits.push(`${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
    }
  }
  return bits.join(" ") || "(no filters)";
}

export function searchCardsText(ctx: InfoContext, args: CardSearchArgs): string {
  const limit = Math.min(40, Math.max(1, int(args.limit, 15)));
  const rows = sortRows(filterCards(cardRows(ctx), args), str(args.sort));
  if (rows.length === 0) {
    return `No cards match ${describeQuery(args)}. Loosen a filter (list_domains / list_keywords / list_sets show valid values).`;
  }
  const shown = rows.slice(0, limit);
  return limitLines(
    [
      `${rows.length} card${rows.length === 1 ? "" : "s"} match ${describeQuery(args)} — id · name · type · cost · might · domains · keywords · text:`,
    ],
    shown.map(cardRowLine),
    { hint: "refine your query or raise limit", more: rows.length - shown.length },
  );
}

function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "player-1-main-3-ogn-004-298" → "ogn-004-298". */
export function extractDefId(s: string): string | undefined {
  const m = /([a-z]{3}-\d{3}(?:-\d{1,3}|-[a-z0-9]+)?)$/i.exec(s);
  return m ? (m[1] as string).toLowerCase() : undefined;
}

/** Case-insensitive name lookup with fuzzy fallback: exact → startsWith → includes → all words present. */
export function findCards(rows: readonly CardRow[], query: string): CardRow[] {
  const q = query.trim();
  if (!q) {
    return [];
  }
  const ql = q.toLowerCase();
  const byId = rows.filter((r) => r.id.toLowerCase() === ql);
  if (byId.length) {
    return byId;
  }
  const defId = extractDefId(ql);
  if (defId) {
    const viaDef = rows.filter((r) => r.id.toLowerCase() === defId);
    if (viaDef.length) {
      return viaDef;
    }
  }
  const n = normName(q);
  if (!n) {
    return [];
  }
  const exact = rows.filter((r) => normName(r.name) === n);
  if (exact.length) {
    return exact;
  }
  const starts = rows.filter((r) => normName(r.name).startsWith(n));
  if (starts.length) {
    return starts;
  }
  const incl = rows.filter((r) => normName(r.name).includes(n));
  if (incl.length) {
    return incl;
  }
  const words = n.split(" ").filter((w) => w.length >= 2);
  return words.length ? rows.filter((r) => words.every((w) => normName(r.name).includes(w))) : [];
}

export function cardDetail(r: CardRow): string {
  const head = [
    `${r.name} (${r.id}) — ${typeLabel(r)}`,
    r.domains.length ? r.domains.join("/") : undefined,
    `cost ${costLabel(r.energy, r.pips)}`,
    r.might !== undefined && (r.type === "unit" || r.might > 0) ? `might ${r.might}` : undefined,
    r.mightBonus ? `might bonus +${r.mightBonus}` : undefined,
    r.timing ? `timing ${r.timing}` : undefined,
    `set ${r.set}${SETS[r.set] ? ` (${SETS[r.set]?.name})` : ""}`,
    r.tags.length ? `tags ${r.tags.join(", ")}` : undefined,
    r.championTag ? `champion tag ${r.championTag}` : undefined,
    r.keywords.length ? `keywords ${r.keywords.join(", ")}` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  const text = r.text ? clip(r.text.replace(/\n/g, " ¶ "), 900) : "(no rules text)";
  return `${head}\n${text}\n(parsed abilities: ${r.abilityCount}${r.keywords.length ? `; keyword rules: rule_search{query:"${r.keywords[0]}"}` : ""})`;
}

export function cardText(
  ctx: InfoContext,
  args: { id?: unknown; name?: unknown; card?: unknown; query?: unknown },
): string {
  const q = str(args.id) ?? str(args.name) ?? str(args.card) ?? str(args.query);
  if (!q) {
    throw new InfoError(
      'card needs {id:"ogn-004-298"} or {name:"cleave"} (fuzzy, case-insensitive)',
    );
  }
  const rows = cardRows(ctx);
  const found = findCards(rows, q);
  if (found.length === 0) {
    throw new InfoError(
      `No card matches "${q}". Try search_cards{name:"${q.split(/\s+/)[0]}"} or search_cards{text:"…"}.`,
      "CARD_NOT_FOUND",
    );
  }
  const nonToken = found.filter((r) => !r.isToken);
  const best = (nonToken.length ? nonToken : found)[0] as CardRow;
  const others = found.filter((r) => r !== best);
  const detail = cardDetail(best);
  if (others.length === 0) {
    return detail;
  }
  return limitLines(
    [detail, `Other matches (${others.length}):`],
    others.map((o) => `  ${o.id} · ${o.name} · ${typeLabel(o)}`),
    {
      hint: "be more specific or pass the id",
    },
  );
}

export function keywordCounts(rows: readonly CardRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.isToken) {
      continue;
    }
    for (const k of r.keywords) {
      m.set(k, (m.get(k) ?? 0) + 1);
    }
  }
  return m;
}

/** Keyword name → its glossary rule id (§ Keywords headings), when the rules db is available. */
export function keywordRuleIds(idx: RulesIndex | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!idx) {
    return out;
  }
  for (const id of idx.order) {
    const n = idx.nodes.get(id) as RuleNode;
    if (n.heading && /keyword/i.test(n.sectionName)) {
      out.set(n.title.toLowerCase(), id);
    }
  }
  return out;
}

export function listKeywordsText(ctx: InfoContext): string {
  const counts = keywordCounts(cardRows(ctx));
  const ruleIds = keywordRuleIds(rulesIndex(ctx));
  const rows = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k, n]) => {
      const rid = ruleIds.get(k.toLowerCase());
      return `  ${k} (${n} cards)${rid ? ` — rule ${rid}` : ""}`;
    });
  return limitLines(
    [`${counts.size} keywords (filter with search_cards{keyword}; rules text via rule{id}):`],
    rows,
  );
}

export function listSetsText(ctx: InfoContext): string {
  const rows = cardRows(ctx);
  const bySet = new Map<string, { total: number; tokens: number }>();
  for (const r of rows) {
    const e = bySet.get(r.set) ?? { tokens: 0, total: 0 };
    e.total += 1;
    if (r.isToken) {
      e.tokens += 1;
    }
    bySet.set(r.set, e);
  }
  const ids = [...new Set([...Object.keys(SETS), ...bySet.keys()])];
  const lines = ids.map((id) => {
    const info = SETS[id];
    const e = bySet.get(id);
    return `  ${id}${info ? ` · ${info.name} (${info.cardCount} printed)` : ""} · ${e ? `${e.total} in pool${e.tokens ? ` incl. ${e.tokens} tokens` : ""}` : "not in pool"}`;
  });
  return limitLines(
    ['Sets (filter with search_cards{set:"OGN"}; card ids are <set>-<number>-<total>):'],
    lines,
  );
}

export const DOMAINS = ["fury", "calm", "mind", "body", "chaos", "order"] as const;

export function listDomainsText(ctx: InfoContext): string {
  const rows = cardRows(ctx).filter((r) => !r.isToken);
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const d of r.domains) {
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
  }
  const all = [...new Set([...DOMAINS, ...counts.keys()])];
  return [
    "Domains (a deck uses its legend's two; runes make power of their domain; power pips in costs are shown as [domain]):",
    ...all.map((d) => `  ${d} · ${counts.get(d) ?? 0} cards`),
    'e.g. search_cards{domain:"chaos",type:"spell",energy:{min:2,max:3}}',
  ].join("\n");
}

// ---------------------------------------------------------------------------
// C. Public game info for one viewer seat
// ---------------------------------------------------------------------------

export interface GameView {
  obs: Observation;
  viewer: Seat;
  seats: readonly Seat[];
}

export function gameView(ctx: InfoContext): GameView {
  if (!ctx.view || !ctx.viewer) {
    throw new InfoError("This tool needs a game context (gameId + seat).", "NO_GAME");
  }
  const obs = ctx.view(ctx.viewer);
  const seats = ctx.seats && ctx.seats.length ? ctx.seats : Object.keys(obs.points);
  return { obs, seats, viewer: ctx.viewer };
}

const SEAT_ALIASES: Record<string, Seat> = {
  p1: "player-1",
  p2: "player-2",
  p3: "player-3",
  p4: "player-4",
};

export function resolvePlayer(gv: GameView, raw: unknown): Seat {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!s || s === "me" || s === "self" || s === "you" || s === "mine") {
    return gv.viewer;
  }
  if (s === "opponent" || s === "opp" || s === "them" || s === "enemy" || s === "their") {
    const o = gv.seats.find((x) => x !== gv.viewer);
    if (!o) {
      throw new InfoError("No opponent seat in this game.");
    }
    return o;
  }
  const direct =
    gv.seats.find((x) => x.toLowerCase() === s) ?? SEAT_ALIASES[s.replace(/[-_\s]|layer/g, "")];
  if (direct && gv.seats.includes(direct)) {
    return direct;
  }
  throw new InfoError(
    `Unknown player "${String(raw)}"; use "me", "opponent" or one of ${gv.seats.join(", ")}.`,
  );
}

function visibleOf(views: readonly CardView[]): CardState[] {
  return views.filter((v): v is CardState => !isHiddenView(v));
}

function hiddenCount(views: readonly CardView[]): number {
  return views.filter((v) => isHiddenView(v)).length;
}

/** Per-player slice of a shared zone list: board zones follow control, others ownership. */
function ofPlayer(views: readonly CardView[], player: Seat, byController = false): CardView[] {
  return views.filter(
    (v) => (byController && !isHiddenView(v) ? (v.controller ?? v.owner) : v.owner) === player,
  );
}

function who(gv: GameView, seat: Seat): string {
  return seat === gv.viewer ? `${seat} (you)` : seat;
}

/** Compact board label: "Name [id] 3M dmg1 exhausted {Assault,Tank}". */
export function permanentLabel(c: CardState): string {
  const bits = [`${c.name} [${c.id}]`];
  if (c.cardType === "unit" || c.might > 0) {
    bits.push(`${c.might}M`);
  } else {
    bits.push(`(${c.cardType}${c.attachedTo ? ` on ${c.attachedTo}` : ""})`);
  }
  if (c.damage > 0) {
    bits.push(`dmg${c.damage}`);
  }
  if (c.isExhausted) {
    bits.push("exhausted");
  }
  if (c.isStunned) {
    bits.push("stunned");
  }
  if (c.isBuffed) {
    bits.push("buffed");
  }
  if (c.keywords.length) {
    bits.push(`{${c.keywords.join(",")}}`);
  }
  return bits.join(" ");
}

function pileLabel(c: CardState): string {
  return `${c.name} [${c.id}] ${c.cardType}`;
}

function handLabel(c: CardState): string {
  const cost = costLabel(c.energyCost, c.powerCost);
  return `${c.name} [${c.id}] ${c.cardType} ${cost}${c.cardType === "unit" ? ` ${c.might}M` : ""}`;
}

function fmtPower(p: Readonly<Record<string, number>>): string {
  const e = Object.entries(p).filter(([, n]) => n > 0);
  return e.length ? e.map(([k, n]) => `${k}:${n}`).join(",") : "-";
}

function runeSummary(runes: readonly CardState[]): string {
  if (runes.length === 0) {
    return "no runes";
  }
  const by = new Map<string, { ready: number; total: number }>();
  for (const r of runes) {
    const d = r.domains[0] ?? "?";
    const e = by.get(d) ?? { ready: 0, total: 0 };
    e.total += 1;
    if (r.isReady) {
      e.ready += 1;
    }
    by.set(d, e);
  }
  const ready = runes.filter((r) => r.isReady).length;
  return `${ready}/${runes.length} ready (${[...by.entries()].map(([d, e]) => `${d} ${e.ready}/${e.total}`).join(", ")})`;
}

/** Names with ×n for duplicates, in first-seen order. */
function compactNames(cards: readonly CardState[]): string[] {
  const m = new Map<string, number>();
  for (const c of cards) {
    m.set(c.name, (m.get(c.name) ?? 0) + 1);
  }
  return [...m.entries()].map(([n, k]) => (k > 1 ? `${n}×${k}` : n));
}

function pointsLine(gv: GameView, player: Seat): string {
  const st = gv.obs.state;
  const ps = st.players[player];
  const target = st.victoryScore + (ps?.victoryScoreModifier ?? 0);
  return `${gv.obs.points[player] ?? 0}/${target} points${ps && ps.xp > 0 ? `, xp ${ps.xp}` : ""}`;
}

function zoneViews(gv: GameView, zone: string): readonly CardView[] {
  return gv.obs.zones[zone] ?? [];
}

function findBattlefield(gv: GameView, raw: string) {
  const q = raw
    .trim()
    .toLowerCase()
    .replace(/^battlefield-/, "");
  return (
    gv.obs.battlefields.find((b) => b.id.toLowerCase() === q) ??
    gv.obs.battlefields.find((b) => b.name.toLowerCase() === q) ??
    gv.obs.battlefields.find(
      (b) => b.name.toLowerCase().includes(q) || b.id.toLowerCase().endsWith(q),
    )
  );
}

function facedownLines(gv: GameView, bfId: string, onlyPlayer?: Seat): string[] {
  const views = zoneViews(gv, `facedown-${bfId}`).filter(
    (v) =>
      !onlyPlayer || v.owner === onlyPlayer || (!isHiddenView(v) && v.controller === onlyPlayer),
  );
  const out: string[] = [];
  for (const v of views) {
    if (isHiddenView(v)) {
      out.push(`facedown card (hidden by ${who(gv, v.owner)})`);
    } else {
      out.push(`facedown (yours): ${v.name} [${v.id}]`);
    }
  }
  return out;
}

function battlefieldText(gv: GameView, ctx: InfoContext, bfId: string): string | undefined {
  const row = visibleOf(zoneViews(gv, "battlefieldRow")).find((c) => c.id === bfId);
  if (row?.rulesText) {
    return row.rulesText;
  }
  const defId = extractDefId(bfId);
  if (defId) {
    const r = cardRows(ctx).find((x) => x.id.toLowerCase() === defId);
    return r?.text || undefined;
  }
  return undefined;
}

const ZONE_HELP =
  "zone must be one of: hand, deck, trash, banishment, base, legend, champion, runes, pool, points, board, battlefield:<id or name>, facedown:<battlefield id>";

export function zoneText(ctx: InfoContext, args: { player?: unknown; zone?: unknown }): string {
  const gv = gameView(ctx);
  const zoneRaw = str(args.zone)?.toLowerCase();
  if (!zoneRaw) {
    throw new InfoError(ZONE_HELP);
  }
  const explicitPlayer = str(args.player) !== undefined;
  const player = resolvePlayer(gv, args.player);
  const P = who(gv, player);
  const zone = zoneRaw.replace(/\s+/g, "");

  const bfMatch = /^(?:battlefield|bf)[:-](.+)$/.exec(zone);
  if (bfMatch) {
    const bf = findBattlefield(gv, bfMatch[1] as string);
    if (!bf) {
      throw new InfoError(
        `No battlefield "${bfMatch[1]}"; battlefields: ${gv.obs.battlefields.map((b) => `${b.name} [${b.id}]`).join(", ") || "(none)"}.`,
      );
    }
    const units = visibleOf(bf.units);
    const sides = (explicitPlayer ? [player] : gv.seats).map((s) => {
      const mine = units.filter((u) => (u.controller ?? u.owner) === s);
      return `${who(gv, s)}: ${mine.map(permanentLabel).join("; ") || "-"}`;
    });
    const fd = facedownLines(gv, bf.id, explicitPlayer ? player : undefined);
    return limitLines(
      [
        `${bf.name} [${bf.id}] — ctrl ${bf.controller ?? "none"}${bf.contested ? `, CONTESTED by ${bf.contestedBy}` : ""}`,
      ],
      [...sides, ...(fd.length ? [`facedown: ${fd.join("; ")}`] : [])],
    );
  }
  const fdMatch = /^facedown[:-](.+)$/.exec(zone);
  if (fdMatch) {
    const bf = findBattlefield(gv, fdMatch[1] as string);
    if (!bf) {
      throw new InfoError(`No battlefield "${fdMatch[1]}".`);
    }
    const fd = facedownLines(gv, bf.id, explicitPlayer ? player : undefined);
    return `${bf.name} [${bf.id}] facedown: ${fd.join("; ") || "none"}`;
  }

  switch (zone) {
    case "hand": {
      const views = ofPlayer(zoneViews(gv, "hand"), player);
      const vis = visibleOf(views);
      const hid = hiddenCount(views);
      if (vis.length === 0) {
        return `${P} hand: ${views.length} card${views.length === 1 ? "" : "s"}${views.length ? " (identities hidden)" : ""}`;
      }
      return limitLines(
        [`${P} hand (${views.length}):`],
        vis.map((c) => `  ${handLabel(c)}`),
        {
          tail: hid ? [`  +${hid} hidden`] : [],
        },
      );
    }
    case "deck":
    case "maindeck":
    case "runedeck":
    case "decks": {
      const main = ofPlayer(zoneViews(gv, "mainDeck"), player).length;
      const runes = ofPlayer(zoneViews(gv, "runeDeck"), player).length;
      return `${P} main deck: ${main} cards; rune deck: ${runes} (order and identities are hidden for everyone)`;
    }
    case "trash":
    case "graveyard":
    case "discard": {
      const cards = visibleOf(ofPlayer(zoneViews(gv, "trash"), player));
      return cards.length
        ? limitLines(
            [`${P} trash (${cards.length}, newest last):`],
            cards.map((c) => `  ${pileLabel(c)}`),
          )
        : `${P} trash: empty`;
    }
    case "banishment":
    case "banish":
    case "banished": {
      const cards = visibleOf(ofPlayer(zoneViews(gv, "banishment"), player));
      return cards.length
        ? limitLines(
            [`${P} banishment (${cards.length}):`],
            cards.map((c) => `  ${pileLabel(c)}`),
          )
        : `${P} banishment: empty`;
    }
    case "base": {
      const cards = visibleOf(ofPlayer(zoneViews(gv, "base"), player, true));
      return cards.length
        ? limitLines(
            [`${P} base (${cards.length}):`],
            cards.map((c) => `  ${permanentLabel(c)}`),
          )
        : `${P} base: empty`;
    }
    case "legend":
    case "legendzone": {
      const c = visibleOf(ofPlayer(zoneViews(gv, "legendZone"), player))[0];
      if (!c) {
        return `${P} legend: none`;
      }
      return `${P} legend: ${c.name} [${c.id}]${c.domains.length ? ` (${c.domains.join("/")})` : ""}${c.isExhausted ? " exhausted" : ""}\n${clip(c.rulesText ?? "(no text)", 600)}`;
    }
    case "champion":
    case "championzone": {
      const c = visibleOf(ofPlayer(zoneViews(gv, "championZone"), player))[0];
      if (!c) {
        return `${P} champion zone: empty (champion already played or none set)`;
      }
      return `${P} champion zone (not yet played): ${c.name} [${c.id}] cost ${costLabel(c.energyCost, c.powerCost)} ${c.might}M${c.keywords.length ? ` {${c.keywords.join(",")}}` : ""}\n${clip(c.rulesText ?? "(no text)", 500)}`;
    }
    case "runes":
    case "runepool": {
      const runes = visibleOf(ofPlayer(zoneViews(gv, "runePool"), player));
      const deck = ofPlayer(zoneViews(gv, "runeDeck"), player).length;
      return limitLines(
        [`${P} runes: ${runeSummary(runes)} | rune deck ${deck}`],
        runes.map((r) => `  ${r.name} [${r.id}] ${r.isReady ? "ready" : "exhausted"}`),
      );
    }
    case "pool":
    case "resources":
    case "energy": {
      const r = gv.obs.resources[player] ?? { energy: 0, power: {} };
      return `${P} pool: energy ${r.energy}, power ${fmtPower(r.power)} (runes: ${runeSummary(visibleOf(ofPlayer(zoneViews(gv, "runePool"), player)))})`;
    }
    case "points":
    case "score":
    case "vp": {
      return `${P}: ${pointsLine(gv, player)} | ${gv.seats
        .filter((s) => s !== player)
        .map((s) => `${who(gv, s)} ${pointsLine(gv, s)}`)
        .join(" | ")}`;
    }
    case "board":
    case "units":
    case "battlefields": {
      const rows: string[] = [];
      const base = visibleOf(ofPlayer(zoneViews(gv, "base"), player, true));
      rows.push(`  base: ${base.map(permanentLabel).join("; ") || "-"}`);
      for (const bf of gv.obs.battlefields) {
        const units = visibleOf(bf.units).filter((u) => (u.controller ?? u.owner) === player);
        const fd = facedownLines(gv, bf.id, player);
        if (units.length || fd.length || bf.controller === player) {
          rows.push(
            `  ${bf.name} [${bf.id}]${bf.controller === player ? " (controls)" : ""}: ${units.map(permanentLabel).join("; ") || "-"}${fd.length ? ` | ${fd.join("; ")}` : ""}`,
          );
        }
      }
      return limitLines([`${P} board:`], rows);
    }
    default: {
      throw new InfoError(`Unknown zone "${zoneRaw}"; ${ZONE_HELP}`);
    }
  }
}

export function opponentSummaryText(ctx: InfoContext, args: { player?: unknown } = {}): string {
  const gv = gameView(ctx);
  const player = resolvePlayer(gv, args.player ?? "opponent");
  const P = who(gv, player);
  const z = (name: string, byController = false) =>
    ofPlayer(zoneViews(gv, name), player, byController);
  const legend = visibleOf(z("legendZone"))[0];
  const champion = visibleOf(z("championZone"))[0];
  const res = gv.obs.resources[player] ?? { energy: 0, power: {} };
  const runes = visibleOf(z("runePool"));
  const handViews = z("hand");
  const handVis = visibleOf(handViews);
  const trash = visibleOf(z("trash"));
  const banish = visibleOf(z("banishment"));
  const base = visibleOf(z("base", true));
  let handNote = "";
  if (handVis.length > 0) {
    handNote = ` (visible: ${handVis.map((c) => c.name).join(", ")})`;
  } else if (handViews.length > 0) {
    handNote = " (hidden)";
  }
  const lines: string[] = [];
  lines.push(
    `${P} — legend: ${legend ? `${legend.name}${legend.domains.length ? ` (${legend.domains.join("/")})` : ""}` : "none"} | champion: ${champion ? `${champion.name} [${champion.id}] in champion zone (not yet played)` : "champion zone empty (played or none)"} | ${pointsLine(gv, player)}`,
  );
  lines.push(
    `pool: energy ${res.energy}, power ${fmtPower(res.power)} | runes ${runeSummary(runes)} | rune deck ${z("runeDeck").length}`,
  );
  lines.push(
    `hand ${handViews.length}${handNote} | main deck ${z("mainDeck").length} | trash (${trash.length}): ${clip(compactNames(trash).join(", ") || "-", 260)} | banishment (${banish.length}): ${clip(compactNames(banish).join(", ") || "-", 160)}`,
  );
  const board: string[] = [`  base: ${base.map(permanentLabel).join("; ") || "-"}`];
  for (const bf of gv.obs.battlefields) {
    const units = visibleOf(bf.units).filter((u) => (u.controller ?? u.owner) === player);
    const fd = facedownLines(gv, bf.id, player);
    if (units.length || fd.length || bf.controller === player) {
      board.push(
        `  ${bf.name} [${bf.id}]${bf.controller === player ? " (controls)" : ""}${bf.contested ? " CONTESTED" : ""}: ${units.map(permanentLabel).join("; ") || "-"}${fd.length ? ` | ${fd.join("; ")}` : ""}`,
      );
    }
  }
  return limitLines([...lines, "board:"], board, {
    hint: 'use zone{player,zone:"battlefield:<id>"} for one location',
  });
}

export function battlefieldsText(ctx: InfoContext): string {
  const gv = gameView(ctx);
  const sd = gv.obs.state.interaction?.showdownStack ?? [];
  const showdown = sd[sd.length - 1];
  if (gv.obs.battlefields.length === 0) {
    return "No battlefields in play.";
  }
  const blocks: string[] = [];
  for (const bf of gv.obs.battlefields) {
    const text = battlefieldText(gv, ctx, bf.id);
    const here = showdown?.active && showdown.battlefieldId === bf.id;
    const head = `${bf.name} [${bf.id}] — ctrl ${bf.controller ? who(gv, bf.controller) : "none"}${bf.contested ? `, CONTESTED by ${bf.contestedBy}` : ""}${here ? ` — SHOWDOWN here (focus ${showdown.focusPlayer}${showdown.isCombatShowdown ? `; ${showdown.attackingPlayer} attacking ${showdown.defendingPlayer}` : ""})` : ""}${text ? ` — "${clip(text, 110)}"` : ""}`;
    const units = visibleOf(bf.units);
    const sides = gv.seats.map((s) => {
      const mine = units.filter((u) => (u.controller ?? u.owner) === s);
      return `    ${who(gv, s)}: ${mine.map(permanentLabel).join("; ") || "-"}`;
    });
    const fd = facedownLines(gv, bf.id);
    blocks.push(
      [head, ...sides, ...(fd.length ? [`    facedown: ${fd.join("; ")}`] : [])].join("\n"),
    );
  }
  return limitLines([`Battlefields (${gv.obs.battlefields.length}):`], blocks, {
    hint: 'zone{zone:"battlefield:<id>"} for one',
  });
}

function turnStateName(gv: GameView): string {
  const it = gv.obs.state.interaction;
  const chain = Boolean(it?.chain?.active && (it?.chain?.items.length ?? 0) > 0);
  const sd = it?.showdownStack ?? [];
  const showdown = Boolean(sd[sd.length - 1]?.active);
  return `${showdown ? "showdown" : "neutral"}-${chain ? "closed" : "open"}`;
}

export function chainStatusText(ctx: InfoContext): string {
  const gv = gameView(ctx);
  const { obs } = gv;
  const it = obs.state.interaction;
  const lines: string[] = [];
  lines.push(
    `Turn ${obs.turn.number}, ${who(gv, obs.turn.activePlayer)} ${obs.turn.phase} phase — turn state ${turnStateName(gv)}${obs.status !== "playing" ? ` — status ${obs.status}` : ""}`,
  );
  const items = [...obs.chain].reverse();
  if (items.length === 0) {
    lines.push("Chain: empty (nothing to respond to).");
  } else {
    lines.push(`Chain (${items.length}; #1 resolves first):`);
    items.forEach((c, i) => {
      lines.push(
        `  #${i + 1} ${c.name} [${c.cardId}] — ${c.type}${c.triggered ? " (triggered)" : ""} by ${who(gv, c.controller)}${c.mode !== undefined ? `, mode ${c.mode}` : ""}${c.targets?.length ? `, targets ${c.targets.join(",")}` : ""}${c.countered ? " — COUNTERED" : ""}`,
      );
    });
    if (it?.chain) {
      lines.push(
        `  priority: ${who(gv, it.chain.activePlayer)}${it.chain.passedPlayers.length ? ` (passed: ${it.chain.passedPlayers.join(", ")})` : ""}; relevant: ${it.chain.relevantPlayers.join(", ")}`,
      );
    }
  }
  const sd = it?.showdownStack ?? [];
  const showdown = sd[sd.length - 1];
  if (showdown?.active) {
    const bf = obs.battlefields.find((b) => b.id === showdown.battlefieldId);
    lines.push(
      `Showdown at ${bf ? `${bf.name} [${bf.id}]` : showdown.battlefieldId}: focus ${who(gv, showdown.focusPlayer)}${showdown.passedPlayers.length ? ` (passed: ${showdown.passedPlayers.join(", ")})` : ""}${showdown.isCombatShowdown ? `; combat — ${showdown.attackingPlayer} attacking ${showdown.defendingPlayer}` : "; non-combat"}${sd.length > 1 ? ` (${sd.length - 1} more stacked)` : ""}`,
    );
  } else {
    lines.push("Showdown: none.");
  }
  const pc = obs.state.pendingChoice as
    | { type?: string; playerId?: string; prompter?: string; sourceCardId?: string }
    | undefined;
  if (pc) {
    lines.push(
      `Pending choice: ${pc.type ?? "?"} for ${who(gv, String(pc.playerId ?? pc.prompter ?? "?"))}${pc.sourceCardId ? ` (source ${pc.sourceCardId})` : ""}`,
    );
  }
  const d = obs.decision;
  lines.push(
    d
      ? `Decision: ${who(gv, d.seat)} ${d.kind}${"context" in d && d.context ? `/${String(d.context)}` : ""} — ${clip(d.prompt, 120)}`
      : "Decision: none pending.",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tool specs (MCP inputSchema == Messages API input_schema)
// ---------------------------------------------------------------------------

const rangeSchema = (what: string): JsonSchema => ({
  description: `${what}: a number (exact) or {min?, max?}`,
  oneOf: [
    { type: "integer" },
    {
      additionalProperties: false,
      properties: { max: { type: "integer" }, min: { type: "integer" } },
      type: "object",
    },
  ],
});

const obj = (properties: JsonSchema, required: string[] = []): JsonSchema => ({
  additionalProperties: false,
  properties,
  required,
  type: "object",
});

const playerProp: JsonSchema = {
  description:
    '"me" (default for zone), "opponent" (default for opponent_summary), or a player id such as "player-2"',
  type: "string",
};

export const infoToolSpecs: InfoToolSpec[] = [
  // ---- rules ----
  {
    description:
      'Riftbound Core Rules table of contents: the top-level sections (S1…S12) with rule-number ranges. Start here, then rule_children{id:"S4"} → headings → rule{id}. Never dumps whole chapters.',
    handler: (ctx) => rulesToc(ctx),
    input_schema: obj({}),
    name: "rules_toc",
    scope: "rules",
  },
  {
    description:
      'One rule by id (e.g. "323.12.a", "809", or a section "S9"): its text, the ancestor chain (section › heading › parent rules) and its immediate children (id + first line). Example: rule{id:"340"} → "Step 4: Resolve" with 340.1… listed.',
    handler: (ctx, a) => ruleLookup(ctx, a),
    input_schema: obj(
      { id: { description: 'Rule id ("323.12.a", "809.1") or section id ("S3")', type: "string" } },
      ["id"],
    ),
    name: "rule",
    scope: "rules",
  },
  {
    description:
      'List the immediate children of a rule/heading/section (id + first line), paged with `offset`. Example: rule_children{id:"S12"} → keyword glossary headings (805 Accelerate, 809 Deflect, …).',
    handler: (ctx, a) => ruleChildrenText(ctx, a),
    input_schema: obj(
      {
        id: { description: 'Rule id or section id ("S7")', type: "string" },
        offset: { description: "Skip this many children (paging)", type: "integer" },
      },
      ["id"],
    ),
    name: "rule_children",
    scope: "rules",
  },
  {
    description:
      'Search rule text by simple term match; returns rule ids + one-line snippets ranked best-first (open one with rule{id}). Examples: rule_search{query:"deflect"}, rule_search{query:"showdown focus pass"}, rule_search{query:"hidden facedown"}.',
    handler: (ctx, a) => ruleSearchText(ctx, a),
    input_schema: obj(
      {
        limit: { description: "Max hits (default 8, max 25)", type: "integer" },
        query: { description: "Words or a phrase", type: "string" },
      },
      ["query"],
    ),
    name: "rule_search",
    scope: "rules",
  },
  // ---- cards ----
  {
    description:
      'Search the full card pool; every filter is optional and all given filters must match. Rows: id · name · type · cost (energy+[power pips]) · might · domains · keywords · one-line text. Examples: "what 2–3 cost Chaos spells exist?" → search_cards{domain:"chaos",type:"spell",energy:{min:2,max:3}}; "fury units with Assault" → {domain:"fury",type:"unit",keyword:"Assault"}; "Jinx cards" → {champion:"Jinx"}; "cards that mention recycle" → {text:"recycle"}. type: unit|spell|gear|equipment|legend|champion|battlefield|rune|token. sort: energy (default)|name|might|power|set|id.',
    handler: (ctx, a) => searchCardsText(ctx, a),
    input_schema: obj({
      champion: {
        description:
          'Champion tag, e.g. "Jinx" (units tagged Jinx, legends whose champion is Jinx)',
        type: "string",
      },
      domain: { description: "fury|calm|mind|body|chaos|order", type: "string" },
      domains: { description: "Any of these domains", items: { type: "string" }, type: "array" },
      energy: rangeSchema("Energy cost"),
      includeTokens: { description: "Include token cards (default false)", type: "boolean" },
      keyword: { description: 'Keyword, e.g. "Deflect", "Hidden", "Accelerate"', type: "string" },
      limit: { description: "Max rows (default 15, max 40)", type: "integer" },
      might: rangeSchema("Might (units)"),
      name: { description: "Substring of the card name (case-insensitive)", type: "string" },
      power: rangeSchema("Number of power pips in the cost"),
      set: { description: "Set id: OGN|OGS|SFD|UNL|VEN", type: "string" },
      sort: { description: "energy|name|might|power|set|id", type: "string" },
      tag: { description: "Unit tag / tribe substring (alias of champion)", type: "string" },
      text: { description: "Substring of rules text (or name)", type: "string" },
      timing: { description: "Spell timing: action|reaction|standard", type: "string" },
      type: {
        description: "unit|spell|gear|equipment|legend|champion|battlefield|rune|token",
        type: "string",
      },
    }),
    name: "search_cards",
    scope: "cards",
  },
  {
    description:
      'Full text of one card definition: type, domains, cost, might, set, tags, keywords and complete rules text (all abilities). Lookup by set id ("ogn-004-298"; instance ids ending in one also work) or by name — case-insensitive with fuzzy fallback (exact → starts-with → contains). Examples: card{name:"cleave"}, card{id:"ogn-027-298"}, card{name:"darius"} (lists the other Darius cards too).',
    handler: (ctx, a) => cardText(ctx, a),
    input_schema: obj({
      id: { description: 'Card definition id, e.g. "ogn-004-298"', type: "string" },
      name: { description: "Card name (fuzzy, case-insensitive)", type: "string" },
    }),
    name: "card",
    scope: "cards",
  },
  {
    description:
      'All keywords that appear on cards, with card counts and (when available) the glossary rule id for each — e.g. "Deflect (31 cards) — rule 809".',
    handler: (ctx) => listKeywordsText(ctx),
    input_schema: obj({}),
    name: "list_keywords",
    scope: "cards",
  },
  {
    description:
      "Card sets (id, name, printed size, cards in this pool). Card ids are <set>-<number>-<total>, e.g. ogn-004-298.",
    handler: (ctx) => listSetsText(ctx),
    input_schema: obj({}),
    name: "list_sets",
    scope: "cards",
  },
  {
    description:
      "The six domains (fury, calm, mind, body, chaos, order) with card counts; power pips in costs are written [domain].",
    handler: (ctx) => listDomainsText(ctx),
    input_schema: obj({}),
    name: "list_domains",
    scope: "cards",
  },
  // ---- game (public info for the viewer seat) ----
  {
    description:
      'Contents of one zone as YOUR seat may see it. Public zones (trash, banishment, base, battlefield:<id>, legend, champion, runes, pool, points, board) list cards with ids/state; `hand` lists cards only for you — the opponent\'s hand is a COUNT; `deck` is always a count; facedown cards read "facedown card" unless you control them. Examples: zone{player:"opponent",zone:"trash"}, zone{zone:"hand"}, zone{player:"opponent",zone:"runes"}, zone{zone:"battlefield:bf1"}.',
    handler: (ctx, a) => zoneText(ctx, a),
    input_schema: obj(
      {
        player: playerProp,
        zone: {
          description:
            "hand|deck|trash|banishment|base|legend|champion|runes|pool|points|board|battlefield:<id or name>|facedown:<battlefield id>",
          type: "string",
        },
      },
      ["zone"],
    ),
    name: "zone",
    scope: "game",
  },
  {
    description:
      'Everything public about the opponent in one call: legend + champion (and whether it has left the champion zone), domains, points, energy/power pool, runes ready/total by domain, hand COUNT, deck count, trash and banishment (compact names), and their units/gear by location. `player` defaults to the opponent; pass "me" for your own summary.',
    handler: (ctx, a) => opponentSummaryText(ctx, a),
    input_schema: obj({ player: playerProp }),
    name: "opponent_summary",
    scope: "game",
  },
  {
    description:
      "Every battlefield: name + card text, controller, contested flag, whether the current showdown is there, units on each side (might / damage / exhausted / keywords) and facedown cards (identity only if you control them).",
    handler: (ctx) => battlefieldsText(ctx),
    input_schema: obj({}),
    name: "battlefields",
    scope: "game",
  },
  {
    description:
      "The interaction state: turn state (neutral/showdown × open/closed), chain items top-first (controller, card, chosen mode / targets, countered), who holds priority and who passed, the active showdown (where, focus, attacker/defender), any pending engine choice, and whose decision it is.",
    handler: (ctx) => chainStatusText(ctx),
    input_schema: obj({}),
    name: "chain_status",
    scope: "game",
  },
];

export const INFO_TOOL_NAMES = infoToolSpecs.map((t) => t.name);

/** Run one spec, turning InfoError / unexpected errors into a short model-facing string. */
export function runInfoTool(
  spec: InfoToolSpec,
  ctx: InfoContext,
  args: Record<string, unknown> = {},
): { text: string; isError: boolean; code?: string } {
  try {
    const text = spec.handler(ctx, args ?? {});
    return {
      isError: false,
      text: text.length > MAX_CHARS + 200 ? `${text.slice(0, MAX_CHARS + 160)}…(truncated)` : text,
    };
  } catch (error) {
    if (error instanceof InfoError) {
      return { code: error.code, isError: true, text: error.message };
    }
    return {
      code: "INTERNAL",
      isError: true,
      text: `lookup failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** The specs as plain Anthropic Messages API tool definitions (no handler/scope). */
export function infoToolsForModel(
  names?: readonly string[],
): { name: string; description: string; input_schema: JsonSchema }[] {
  return infoToolSpecs
    .filter((s) => !names || names.includes(s.name))
    .map(({ name, description, input_schema }) => ({ description, input_schema, name }));
}

/**
 * Bind the specs to a caller-specific context (e.g. the web app's
 * `{ engine, seat }`): returns `{ name, description, input_schema, handler(input, outer) }[]`
 * — the LookupTool shape the AI opponent's step loop consumes.
 */
export function bindInfoTools<C>(
  toCtx: (outer: C) => InfoContext,
  opts: { names?: readonly string[] } = {},
): {
  name: string;
  description: string;
  input_schema: JsonSchema;
  handler: (input: Record<string, unknown>, outer: C) => string;
}[] {
  return infoToolSpecs
    .filter((s) => !opts.names || opts.names.includes(s.name))
    .map((spec) => ({
      description: spec.description,
      handler: (input: Record<string, unknown>, outer: C) => {
        const r = runInfoTool(spec, toCtx(outer), input);
        if (r.isError) {
          throw new InfoError(r.text, r.code);
        }
        return r.text;
      },
      input_schema: spec.input_schema,
      name: spec.name,
    }));
}
