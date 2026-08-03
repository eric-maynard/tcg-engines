#!/usr/bin/env bun
/**
 * Context-cheap rule lookup CLI. Reads rules-db.json (built by build-rules-db.ts).
 *
 *   bun rule.ts 515.4.d              # one rule + its xrefs
 *   bun rule.ts 515.4.d --tree       # + xrefs-of-xrefs (depth 2)
 *   bun rule.ts 515                  # all rules under 515.*
 *   bun rule.ts --grep "rune pool"   # case-insensitive text search
 *   bun rule.ts --section 6          # all rules in section 6 (Chains & Showdowns)
 *   bun rule.ts --range 620-633      # inclusive top-level range
 *   bun rule.ts --list               # section map only
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

type Rule = { id: string; text: string; section: number; sectionName: string; xref: string[] };

const HERE = dirname(new URL(import.meta.url).pathname);
const DB = join(HERE, "..", "rules-db.json");

if (!existsSync(DB)) {
  console.error(`rules-db.json not found. Run: bun ${join(HERE, "build-rules-db.ts")}`);
  process.exit(1);
}

const db = JSON.parse(readFileSync(DB, "utf8")) as { count: number; rules: Rule[] };
const byId = new Map(db.rules.map((r) => [r.id, r]));

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};

const tree = args.includes("--tree");
if (tree) args.splice(args.indexOf("--tree"), 1);

function fmt(r: Rule, indent = ""): string {
  const x = r.xref.length ? `  [see: ${r.xref.join(", ")}]` : "";
  return `${indent}${r.id}  (${r.sectionName})${x}\n${indent}  ${r.text}`;
}

function printRules(rs: Rule[], withXref = false) {
  for (const r of rs) {
    console.log(fmt(r));
    if (withXref) {
      for (const xid of r.xref) {
        const xr = byId.get(xid);
        if (xr) console.log(fmt(xr, "    > "));
      }
    }
    console.log();
  }
  console.log(`(${rs.length} rule${rs.length === 1 ? "" : "s"})`);
}

const grep = opt("--grep");
const section = opt("--section");
const range = opt("--range");
const list = args.includes("--list");

if (list) {
  const seen = new Map<number, string>();
  for (const r of db.rules) if (!seen.has(r.section)) seen.set(r.section, r.sectionName);
  for (const [n, name] of [...seen.entries()].sort((a, b) => a[0] - b[0])) {
    const inSec = db.rules.filter((r) => r.section === n);
    const tops = [...new Set(inSec.map((r) => r.id.split(".")[0]))];
    console.log(`§${n}  ${name}  (rules ${tops[0]}–${tops[tops.length - 1]}, ${inSec.length} entries)`);
  }
  process.exit(0);
}

if (grep) {
  const re = new RegExp(grep, "i");
  printRules(db.rules.filter((r) => re.test(r.text) || re.test(r.id)));
  process.exit(0);
}

if (section) {
  printRules(db.rules.filter((r) => r.section === parseInt(section, 10)));
  process.exit(0);
}

if (range) {
  const [lo, hi] = range.split("-").map((n) => parseInt(n, 10));
  printRules(db.rules.filter((r) => {
    const t = parseInt(r.id.split(".")[0], 10);
    return t >= lo && t <= (hi ?? lo);
  }));
  process.exit(0);
}

if (args.length === 0) {
  console.error("usage: bun rule.ts <id> [--tree] | --grep <regex> | --section <n> | --range <lo-hi> | --list");
  process.exit(1);
}

for (const q of args) {
  const matches = db.rules.filter((r) => r.id === q || r.id.startsWith(q + "."));
  if (matches.length === 0) {
    console.log(`no rule matching '${q}'`);
    continue;
  }
  const exact = byId.get(q);
  if (matches.length === 1 && exact) {
    printRules([exact], true);
    if (tree) {
      const seen = new Set([q, ...exact.xref]);
      const second: Rule[] = [];
      for (const xid of exact.xref) {
        for (const x2 of byId.get(xid)?.xref ?? []) {
          if (!seen.has(x2) && byId.has(x2)) {
            seen.add(x2);
            second.push(byId.get(x2)!);
          }
        }
      }
      if (second.length) {
        console.log("--- depth-2 xrefs ---");
        printRules(second);
      }
    }
  } else {
    printRules(matches);
  }
}
