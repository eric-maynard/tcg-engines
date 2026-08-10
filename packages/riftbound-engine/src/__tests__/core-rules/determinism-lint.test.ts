/**
 * LINT — game logic is a pure function of (state, move, seeded RNG).
 *
 * The engine's replay, undo/redo and snapshot-hash guarantees all rest on that:
 * `Date.now()`, `new Date()` and `Math.random()` inside a rule path make the
 * same game produce different positions on a re-issue or a replay. Randomness a
 * rule really calls for (rule 416.5's random recycle order, shuffles) must come
 * from the engine's seeded RNG (`context.rng` / `zones.shuffleZone`), and ids
 * must come from game state (see `create-token.ts nextTokenId`).
 *
 * This test scans the shipped source of the engine and core packages. Only
 * non-game-logic surfaces are allowlisted: test harnesses and playtest drivers,
 * the browser tooling, the heuristic bot's move sampling, and the timestamps
 * core stamps on history/telemetry records.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = [
  join(import.meta.dir, "../../../../riftbound-engine/src"),
  join(import.meta.dir, "../../../../core/src"),
];

/** Paths (substring match, POSIX separators) that are not game logic. */
const ALLOWLIST = [
  "/__tests__/",
  "/testing/",
  "/harness/",
  ".test.ts",
  "do_not_commit",
  // The bot is an OPPONENT sampling its own moves, not a rule: its randomness
  // never enters game state.
  "/bot/",
  // Telemetry / history bookkeeping: timestamps on records the rules never read.
  "/core/src/engine/rule-engine.ts",
  "/core/src/flow/flow-manager.ts",
  "/core/src/history/history-manager.ts",
];

const FORBIDDEN = /(?<![\w.])(Date\.now\(\)|new Date\(\)|Math\.random\(\))/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      out.push(path);
    }
  }
  return out;
}

describe("determinism — no wall clock and no unseeded randomness in game logic", () => {
  test("no Date.now() / new Date() / Math.random() outside the allowlisted non-rule surfaces", () => {
    const offenders: string[] = [];
    let scanned = 0;
    for (const root of ROOTS) {
      for (const file of sourceFiles(root)) {
        const posix = file.replaceAll("\\", "/");
        if (ALLOWLIST.some((allowed) => posix.includes(allowed))) {
          continue;
        }
        scanned++;
        const lines = readFileSync(file, "utf8").split("\n");
        for (const [i, line] of lines.entries()) {
          // A mention in a comment is documentation, not a call.
          const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
          if (FORBIDDEN.test(code)) {
            offenders.push(`${posix.slice(posix.indexOf("/packages/") + 1)}:${i + 1}: ${line.trim()}`);
          }
        }
      }
    }
    // Guard the guard: a broken root path would scan nothing and pass.
    expect(scanned).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  });
});
