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

// Section boundaries for the 2026-03-30 (Unleashed) renumbering.
const SECTIONS: Array<[number, number, number, string]> = [
  [0, 99, 1, "Golden & Silver Rules"],
  [100, 299, 2, "Game Concepts / Cards & Types"],
  [300, 324, 3, "Turn Structure"],
  [325, 348, 4, "Chains & Showdowns"],
  [349, 359, 5, "Playing Cards"],
  [360, 406, 6, "Abilities"],
  [407, 439, 7, "Game Actions"],
  [440, 453, 8, "Movement"],
  [454, 467, 9, "Combat & Scoring"],
  [468, 648, 10, "Layers & Modes of Play"],
  [649, 799, 11, "Additional Rules"],
  [800, 899, 12, "Keywords"],
];

function sectionFor(id: string): [number, string] {
  const top = parseInt(id.split(".")[0], 10);
  for (const [lo, hi, n, name] of SECTIONS) {
    if (top >= lo && top <= hi) return [n, name];
  }
  return [0, "Unknown"];
}

const ROW_RE = /<tr><td>([0-9]+(?:\.[0-9a-z]+)*)\.?<\/td><td>([\s\S]*?)<\/td><\/tr>/g;
// Plain-text format (2026+): "NNN. text" or "NNN.N.a. text" at line start.
const LINE_RE = /^([0-9]{3}(?:\.[0-9a-z]+)*)\.\s+(.+)$/;
const XREF_RE = /\b[Rr]ules?\s+([0-9]+(?:\.[0-9a-z]+)*)/g;

const rules: Record<string, Rule> = {};

// Prefer the newest rules version present (later versions renumber rules).
const allFiles = readdirSync(REF_DIR).filter((f) => /Riftbound_Core_Rules.*\.md$/.test(f));
const versions = [...new Set(allFiles.map((f) => f.match(/(\d{4}_\d{2}_\d{2})/)?.[1] ?? ""))].sort();
const latest = versions[versions.length - 1];
const files = allFiles.filter((f) => f.includes(latest)).sort();
console.log(`using rules version ${latest} (${files.length} files)`);

function addRule(id: string, text: string) {
  const xref = [...new Set([...text.matchAll(XREF_RE)].map((x) => x[1]))].filter((r) => r !== id);
  const [section, sectionName] = sectionFor(id);
  rules[id] = { id, text, section, sectionName, xref };
}

for (const f of files) {
  const raw = readFileSync(join(REF_DIR, f), "utf8");
  if (raw.includes("<tr><td>")) {
    for (const m of raw.matchAll(ROW_RE)) {
      addRule(m[1], m[2].replace(/\s+/g, " ").trim());
    }
  } else {
    // Plain-text: rule id starts a line; subsequent non-id lines continue the text.
    let curId: string | null = null;
    let curText: string[] = [];
    const flush = () => {
      if (curId) addRule(curId, curText.join(" ").replace(/\s+/g, " ").trim());
      curId = null;
      curText = [];
    };
    for (const line of raw.split("\n")) {
      const m = line.match(LINE_RE);
      if (m) {
        flush();
        curId = m[1];
        curText = [m[2]];
      } else if (curId && line.trim() && !/^(Riftbound Core Rules|Last Updated:)/.test(line)) {
        curText.push(line.trim());
      }
    }
    flush();
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
