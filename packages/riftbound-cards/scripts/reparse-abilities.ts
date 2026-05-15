/**
 * Re-parse abilities for every card in src/data/sets/*.json using the current
 * parser, WITHOUT touching any other field on each card.
 *
 * Why this exists:
 *   The full pipeline `generate-set-json.ts` requires
 *   `downloads/riftbound-cards.json` (a scrape of the official gallery) which
 *   is not present in the repo. But the existing per-set JSON files DO contain
 *   the canonical `rulesText` per card. So we can refresh the compiled
 *   `abilities` field in-place by re-running the parser over each card's
 *   rulesText. This is how parser changes (e.g. the new `minimum` field on
 *   modify-might effects, rule 472.3.b) get propagated to the JSON the engine
 *   actually reads at runtime.
 *
 * Behavior:
 *   - For each card with non-empty rulesText, calls parseAbilities() and
 *     replaces `card.abilities` with the fresh result. `parseSuccess` is
 *     updated to reflect the new outcome.
 *   - Every other field (id, name, rulesText, imageUrl, errata, etc.) is
 *     preserved byte-for-byte.
 *   - `set.parsedCount` is recomputed.
 *   - Output is formatted to match the existing on-disk style: 2-space indent,
 *     objects always multiline, arrays of primitives inline, arrays of
 *     objects multiline. Idempotent: re-running with no parser change
 *     produces no diff.
 *
 * Usage:
 *   bun packages/riftbound-cards/scripts/reparse-abilities.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { parseAbilities } from "../src/parser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SetCard {
  id: string;
  name: string;
  rulesText: string;
  abilities: unknown[];
  parseSuccess: boolean;
  [key: string]: unknown;
}

interface SetFile {
  set: {
    id: string;
    name: string;
    cardCount: number;
    parsedCount: number;
    errataCount: number;
    [key: string]: unknown;
  };
  cards: SetCard[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Custom serializer
//   Matches the existing on-disk format used by the cards package:
//     - 2-space indent
//     - Objects always multiline (even if they have a single key)
//     - Arrays of primitives (string/number/boolean/null) rendered inline
//       Like ["fury"], [], [1, 2, 3]
//     - Arrays containing any object/array rendered multiline
//     - Trailing newline at EOF
// ---------------------------------------------------------------------------

function isPrimitive(v: unknown): boolean {
  return v === null || typeof v !== "object";
}

function isArrayOfPrimitives(arr: unknown[]): boolean {
  return arr.every(isPrimitive);
}

function serialize(value: unknown, indent: number): string {
  const pad = "  ".repeat(indent);
  const padNext = "  ".repeat(indent + 1);

  if (value === null) {
    return "null";
  }
  // `undefined` should never appear at value position once we filter it out at
  // The object level below; arrays containing `undefined` get coerced to null
  // To match JSON semantics.
  if (value === undefined) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    if (isArrayOfPrimitives(value)) {
      // Inline: ["a", "b"]
      const parts = value.map((v) => serialize(v, indent));
      return `[${parts.join(", ")}]`;
    }
    // Multiline
    const parts = value.map((v) => `${padNext}${serialize(v, indent + 1)}`);
    return `[\n${parts.join(",\n")}\n${pad}]`;
  }
  // Object — skip keys whose value is `undefined` (JSON-compatible behavior).
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
  if (keys.length === 0) {
    return "{}";
  }
  const parts = keys.map(
    (k) => `${padNext}${JSON.stringify(k)}: ${serialize(obj[k], indent + 1)}`,
  );
  return `{\n${parts.join(",\n")}\n${pad}}`;
}

function stringify(value: unknown): string {
  return `${serialize(value, 0)}\n`;
}

// ---------------------------------------------------------------------------
// Stable abilities comparison helper for diff stats
// ---------------------------------------------------------------------------

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).toSorted()) {
        sorted[k] = (v as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return v;
  });
}

function hasMinimum(abilities: unknown[]): boolean {
  return canonical(abilities).includes('"minimum":');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const SETS_DIR = path.join(import.meta.dir, "../src/data/sets");

const setFiles = fs
  .readdirSync(SETS_DIR)
  .filter((f) => f.endsWith(".json"))
  .toSorted();

interface SetStats {
  setId: string;
  cardCount: number;
  changed: number;
  gainedMinimum: number;
  parseSuccess: number;
  newlyFailed: number;
}

const allStats: SetStats[] = [];
let totalChanged = 0;
let totalGainedMinimum = 0;
let sampleDiff: string | null = null;

for (const file of setFiles) {
  const filepath = path.join(SETS_DIR, file);
  const raw = fs.readFileSync(filepath, "utf8");
  const data = JSON.parse(raw) as SetFile;

  const stats: SetStats = {
    cardCount: data.cards.length,
    changed: 0,
    gainedMinimum: 0,
    newlyFailed: 0,
    parseSuccess: 0,
    setId: data.set.id,
  };

  for (const card of data.cards) {
    const oldAbilities = card.abilities;
    const oldHadMinimum = hasMinimum(oldAbilities);
    const oldParseSuccess = card.parseSuccess;

    let newAbilities: unknown[] = [];
    let newParseSuccess = false;

    if (card.rulesText && card.rulesText.trim().length > 0) {
      const result = parseAbilities(card.rulesText, {
        omitId: true,
        omitText: true,
      });
      if (result.success && result.abilities) {
        newAbilities = result.abilities as unknown[];
        newParseSuccess = true;
      }
    } else {
      // Empty rulesText: no abilities, parser considered successful (vacuous).
      newAbilities = [];
      newParseSuccess = true;
    }

    if (newParseSuccess) {
      stats.parseSuccess++;
    }
    if (oldParseSuccess && !newParseSuccess) {
      stats.newlyFailed++;
    }

    // Compare canonical forms to detect change
    if (canonical(oldAbilities) !== canonical(newAbilities)) {
      stats.changed++;
      if (totalChanged < 1 && sampleDiff === null) {
        sampleDiff =
          `Sample diff for ${card.name} (${card.id}):\n` +
          `  rulesText: ${JSON.stringify(card.rulesText).slice(0, 140)}\n` +
          `  before: ${canonical(oldAbilities).slice(0, 200)}\n` +
          `  after:  ${canonical(newAbilities).slice(0, 200)}`;
      }
      totalChanged++;
    }

    const newHadMinimum = hasMinimum(newAbilities);
    if (newHadMinimum && !oldHadMinimum) {
      stats.gainedMinimum++;
      totalGainedMinimum++;
    }

    card.abilities = newAbilities;
    card.parseSuccess = newParseSuccess;
  }

  // Refresh set.parsedCount
  data.set.parsedCount = stats.parseSuccess;
  data.set.cardCount = data.cards.length;

  const serialized = stringify(data);

  if (serialized !== raw) {
    fs.writeFileSync(filepath, serialized);
  }

  allStats.push(stats);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log("Reparse abilities — summary:");
console.log("set  cards  changed  gained-min  parseOK  newlyFailed");
for (const s of allStats) {
  console.log(
    `${s.setId.padEnd(4)} ${String(s.cardCount).padStart(5)}  ${String(s.changed).padStart(7)}  ${String(
      s.gainedMinimum,
    ).padStart(10)}  ${String(s.parseSuccess).padStart(7)}  ${String(s.newlyFailed).padStart(11)}`,
  );
}
console.log(
  `TOTAL cards-changed=${totalChanged} cards-gained-minimum=${totalGainedMinimum}`,
);
if (sampleDiff) {
  console.log("");
  console.log(sampleDiff);
}
