#!/usr/bin/env bun
/**
 * File-based fix queue. One JSON file per item under .claude/fix-queue/<status>/<id>.json.
 * Claiming = atomic rename open/ → claimed/ (safe across concurrent lanes on one box).
 *
 *   bun fix-queue.ts enqueue-bugs                      # scan __tests__/cards/**.test.ts for test.failing("BUG…")
 *   bun fix-queue.ts enqueue-findings <pass.json> [--source playtest]   # confirmed findings from a tcg-test pass result
 *   bun fix-queue.ts list [open|claimed|done|failed] [--limit N] [--json]
 *   bun fix-queue.ts claim <id...> --by <lane>          # prints ids actually claimed
 *   bun fix-queue.ts done <id> --note "…" [--files a,b] # claimed → done
 *   bun fix-queue.ts fail <id> --note "…"              # claimed → failed (attempts++)
 *   bun fix-queue.ts release <id>                      # claimed → open
 *   bun fix-queue.ts requeue-failed [--max-attempts 3] # failed → open
 *   bun fix-queue.ts reap [--older-than-min 120]       # stale claimed → open
 *   bun fix-queue.ts stats
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const REPO = "/root/src/tcg/tcg-engines";
const ROOT = join(REPO, ".claude/fix-queue");
const STATUSES = ["open", "claimed", "done", "failed"] as const;
type Status = (typeof STATUSES)[number];
for (const s of STATUSES) mkdirSync(join(ROOT, s), { recursive: true });

interface Item {
  id: string; source: string; status?: Status;
  cardId?: string; title: string; expected?: string; observed?: string; layer?: string;
  fileHint?: string; rule?: string;
  repro?: { testFile: string; testName: string };
  createdAt: string; claimedBy?: string; claimedAt?: string; attempts?: number;
  resolution?: { note: string; files?: string[]; at: string };
  history?: { at: string; event: string; note?: string }[];
}
const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (n: string, d?: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const has = (n: string) => argv.includes(`--${n}`);
const now = () => new Date().toISOString();
const idOf = (key: string) => createHash("sha1").update(key).digest("hex").slice(0, 12);
const pathOf = (s: Status, id: string) => join(ROOT, s, `${id}.json`);
function find(id: string): { status: Status; item: Item } | undefined {
  for (const s of STATUSES) if (existsSync(pathOf(s, id))) return { status: s, item: JSON.parse(readFileSync(pathOf(s, id), "utf8")) };
}
function list(s: Status): Item[] {
  return readdirSync(join(ROOT, s)).filter((f) => f.endsWith(".json")).map((f) => ({ ...JSON.parse(readFileSync(join(ROOT, s, f), "utf8")), status: s }));
}
function put(s: Status, item: Item) { writeFileSync(pathOf(s, item.id), JSON.stringify({ ...item, status: s }, null, 2)); }
function move(id: string, from: Status, to: Status, patch: (i: Item) => Item): boolean {
  try { renameSync(pathOf(from, id), pathOf(to, id)); } catch { return false; }
  const item = JSON.parse(readFileSync(pathOf(to, id), "utf8")) as Item;
  put(to, patch(item)); return true;
}
function enqueue(item: Omit<Item, "createdAt" | "id"> & { key: string }): "new" | "dup" {
  const id = idOf(item.key);
  if (find(id)) return "dup";
  const { key, ...rest } = item;
  put("open", { ...(rest as Item), id, createdAt: now(), attempts: 0, history: [{ at: now(), event: `enqueued:${item.source}` }] });
  return "new";
}

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) { const p = join(dir, f); statSync(p).isDirectory() ? walk(p, out) : f.endsWith(".test.ts") && out.push(p); }
  return out;
}

switch (cmd) {
  case "enqueue-bugs": {
    const dir = join(REPO, "packages/riftbound-engine/src/__tests__/cards");
    let n = 0, d = 0;
    for (const file of walk(dir)) {
      const src = readFileSync(file, "utf8");
      const rel = relative(REPO, file);
      const cardId = /([a-z]{3}-\d{3}-\d{3})\.test\.ts$/.exec(file)?.[1];
      for (const m of src.matchAll(/test\.failing\(\s*(["'`])((?:BUG|GAP)[^]*?)\1/g)) {
        const testName = m[2];
        const r = enqueue({ key: `bug:${rel}:${testName}`, source: rel.includes("/interactions/") ? "interaction-bug" : "unit-bug", cardId, title: testName, layer: "engine", repro: { testFile: rel, testName } });
        r === "new" ? n++ : d++;
      }
    }
    console.log(JSON.stringify({ enqueued: n, duplicates: d }));
    break;
  }
  case "enqueue-findings": {
    const file = argv[1]; const source = flag("source", "playtest")!;
    const raw = JSON.parse(readFileSync(file, "utf8")); const res = raw.result ?? raw;
    const findings: any[] = [
      ...((res.monkey?.findings ?? []).map((f: any) => ({ ...f, _src: "monkey" }))),
      ...((res.rulings?.findings ?? res.rulings?.confirmed ?? []).map((f: any) => ({ ...f, _src: "ruling" }))),
      ...((res.cards?.confirmed ?? []).map((f: any) => ({ ...f, _src: "card-playtest" }))),
      ...((res.confirmed ?? []).map((f: any) => ({ ...f, _src: source }))),
    ].filter((f) => (f.verdict ?? "CONFIRMED") === "CONFIRMED");
    let n = 0, d = 0;
    for (const f of findings) {
      const title = String(f.what ?? f.title ?? "").slice(0, 400);
      const r = enqueue({ key: `${f._src}:${f.cardId ?? f.ruleOrCard ?? ""}:${title.toLowerCase().replace(/\W+/g, " ").slice(0, 80)}`, source: f._src, cardId: f.cardId ?? (Array.isArray(f.cards) ? f.cards[0] : undefined), title, expected: f.expected ?? f.why_wrong, observed: f.observed, layer: f.layer, fileHint: f.file, rule: f.ruleOrCard ?? f.rulingId });
      r === "new" ? n++ : d++;
    }
    console.log(JSON.stringify({ enqueued: n, duplicates: d, scanned: findings.length }));
    break;
  }
  case "list": {
    const s = (STATUSES as readonly string[]).includes(argv[1]) ? (argv[1] as Status) : "open";
    let items = list(s).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const lim = flag("limit"); if (lim) items = items.slice(0, parseInt(lim, 10));
    if (has("json")) console.log(JSON.stringify(items));
    else for (const i of items) console.log(`${i.id}  [${i.source}${i.cardId ? " " + i.cardId : ""}] ${i.title.slice(0, 110)}${i.repro ? "  ⟶ " + i.repro.testFile.split("/").pop() : i.fileHint ? "  @ " + String(i.fileHint).split("/").pop() : ""}`);
    break;
  }
  case "grab": {
    // Atomically claim up to N open items, preferring items related to the oldest one
    // (same cardId, same repro test file, same fileHint) so one worker gets a coherent batch.
    const n = parseInt(flag("n", "6")!, 10); const by = flag("by", "worker")!;
    const open = list("open").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const got: Item[] = [];
    const tryClaim = (i: Item) => got.length < n && !got.find((g) => g.id === i.id) &&
      move(i.id, "open", "claimed", (x) => ({ ...x, claimedBy: by, claimedAt: now(), history: [...(x.history ?? []), { at: now(), event: `grabbed:${by}` }] })) && got.push(i);
    for (const seed of open) {
      if (got.length >= n) break;
      if (!tryClaim(seed) && !got.find((g) => g.id === seed.id)) continue;
      const rel = (o: Item) => (seed.cardId && o.cardId === seed.cardId) || (seed.repro?.testFile && o.repro?.testFile === seed.repro?.testFile) || (seed.fileHint && o.fileHint && String(o.fileHint).split(":")[0] === String(seed.fileHint).split(":")[0]);
      for (const o of open) if (rel(o)) tryClaim(o);
    }
    console.log(JSON.stringify(got.map((i) => ({ id: i.id, source: i.source, cardId: i.cardId, title: i.title, expected: i.expected, observed: i.observed, layer: i.layer, fileHint: i.fileHint, rule: i.rule, testFile: i.repro?.testFile, testName: i.repro?.testName }))));
    break;
  }
  case "claim": {
    const by = flag("by", "lane")!; const ids = argv.slice(1).filter((a) => !a.startsWith("--") && a !== by);
    const got = ids.filter((id) => move(id, "open", "claimed", (i) => ({ ...i, claimedBy: by, claimedAt: now(), history: [...(i.history ?? []), { at: now(), event: `claimed:${by}` }] })));
    console.log(JSON.stringify({ claimed: got }));
    break;
  }
  case "done": {
    const id = argv[1]; const note = flag("note", "")!; const files = flag("files")?.split(",").filter(Boolean);
    const ok = move(id, "claimed", "done", (i) => ({ ...i, resolution: { note, files, at: now() }, history: [...(i.history ?? []), { at: now(), event: "done", note }] })) || move(id, "open", "done", (i) => ({ ...i, resolution: { note, files, at: now() }, history: [...(i.history ?? []), { at: now(), event: "done(unclaimed)", note }] }));
    console.log(JSON.stringify({ ok }));
    break;
  }
  case "fail": {
    const id = argv[1]; const note = flag("note", "")!;
    const ok = move(id, "claimed", "failed", (i) => ({ ...i, attempts: (i.attempts ?? 0) + 1, resolution: { note, at: now() }, history: [...(i.history ?? []), { at: now(), event: "failed", note }] }));
    console.log(JSON.stringify({ ok }));
    break;
  }
  case "release": {
    console.log(JSON.stringify({ ok: move(argv[1], "claimed", "open", (i) => ({ ...i, claimedBy: undefined, claimedAt: undefined, history: [...(i.history ?? []), { at: now(), event: "released" }] })) }));
    break;
  }
  case "requeue-failed": {
    const max = parseInt(flag("max-attempts", "3")!, 10); let n = 0;
    for (const i of list("failed")) if ((i.attempts ?? 0) < max && move(i.id, "failed", "open", (x) => ({ ...x, history: [...(x.history ?? []), { at: now(), event: "requeued" }] }))) n++;
    console.log(JSON.stringify({ requeued: n }));
    break;
  }
  case "reap": {
    const mins = parseInt(flag("older-than-min", "120")!, 10); let n = 0;
    for (const i of list("claimed")) if (i.claimedAt && Date.now() - Date.parse(i.claimedAt) > mins * 60_000 && move(i.id, "claimed", "open", (x) => ({ ...x, claimedBy: undefined, history: [...(x.history ?? []), { at: now(), event: "reaped" }] }))) n++;
    console.log(JSON.stringify({ reaped: n }));
    break;
  }
  case "stats": {
    const out: Record<string, any> = {};
    for (const s of STATUSES) { const items = list(s); out[s] = items.length; out[`${s}BySource`] = items.reduce((a: any, i) => ((a[i.source] = (a[i.source] ?? 0) + 1), a), {}); }
    console.log(JSON.stringify(out, null, 2));
    break;
  }
  default:
    console.error("usage: see header"); process.exit(2);
}
