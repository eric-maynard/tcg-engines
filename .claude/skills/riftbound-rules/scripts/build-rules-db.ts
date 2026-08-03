#!/usr/bin/env bun
/**
 * Builds rules-db.json from the raw Core Rules reference chunks.
 * Pure mechanical parse: id, text, section, xref (auto-extracted "See rule NNN").
 * Re-run whenever the reference/*.md files change.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";

const HERE = dirname(new URL(import.meta.url).pathname);
const REF_DIR = join(HERE, "..", "references");
const OUT = join(HERE, "..", "rules-db.json");

type Rule = {
  id: string;
  text: string;
  section: number;
  sectionName: string;
  xref: string[];
};

const SECTIONS: Array<[number, number, number, string]> = [
  [0, 99, 1, "Golden & Silver Rules"],
  [100, 104, 2, "Game Concepts"],
  [105, 109, 3, "Zones & Spaces"],
  [110, 123, 2, "Game Concepts"],
  [124, 199, 4, "Cards & Types"],
  [500, 526, 5, "Turn Structure"],
  [527, 563, 6, "Chains & Showdowns"],
  [564, 585, 7, "Abilities"],
  [586, 619, 8, "Game Actions"],
  [620, 633, 9, "Combat & Scoring"],
  [634, 699, 10, "Additional Rules"],
  [700, 711, 10, "Additional Rules"],
  [712, 799, 11, "Keywords"],
];

function sectionFor(id: string): [number, string] {
  const top = parseInt(id.split(".")[0], 10);
  for (const [lo, hi, n, name] of SECTIONS) {
    if (top >= lo && top <= hi) return [n, name];
  }
  return [0, "Unknown"];
}

const ROW_RE = /<tr><td>([0-9]+(?:\.[0-9a-z]+)*)\.?<\/td><td>([\s\S]*?)<\/td><\/tr>/g;
const XREF_RE = /\b[Rr]ules?\s+([0-9]+(?:\.[0-9a-z]+)*)/g;

const rules: Record<string, Rule> = {};

const files = readdirSync(REF_DIR)
  .filter((f) => /Riftbound_Core_Rules.*\.md$/.test(f))
  .sort();

for (const f of files) {
  const raw = readFileSync(join(REF_DIR, f), "utf8");
  for (const m of raw.matchAll(ROW_RE)) {
    const id = m[1];
    const text = m[2].replace(/\s+/g, " ").trim();
    const xref = [...new Set([...text.matchAll(XREF_RE)].map((x) => x[1]))].filter(
      (r) => r !== id
    );
    const [section, sectionName] = sectionFor(id);
    rules[id] = { id, text, section, sectionName, xref };
  }
}

const ordered = Object.values(rules).sort((a, b) => {
  const pa = a.id.split(".");
  const pb = b.id.split(".");
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? "";
    const vb = pb[i] ?? "";
    const na = parseInt(va, 10);
    const nb = parseInt(vb, 10);
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
    if (va !== vb) return va < vb ? -1 : 1;
  }
  return 0;
});

writeFileSync(OUT, JSON.stringify({ count: ordered.length, rules: ordered }, null, 0));

console.log(`wrote ${ordered.length} rules -> ${OUT}`);
