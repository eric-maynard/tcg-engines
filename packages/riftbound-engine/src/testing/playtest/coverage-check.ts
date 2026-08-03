#!/usr/bin/env bun
/**
 * Coverage spectator: scan game traces for absence bugs.
 *
 *   bun coverage-check.ts /tmp/playtest-traces
 *
 * Reports (by card *definition* id, aggregated across all instances/games):
 *   - drawn-but-never-playable: card reached a hand but was never enumerated
 *     as a play* move — likely an engine/cost/registry bug.
 *   - never-drawn: card in a deck but never reached hand — variance, not a bug
 *     unless it persists at high game counts.
 *   - move-failed: engine enumerated a move as valid then rejected it.
 *   - enum-errors: enumerateMoves threw.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = process.argv[2] ?? "/tmp/playtest-traces";
const decks = JSON.parse(readFileSync(join(DIR, "decks.json"), "utf8"));

const PLAY_MOVES = new Set(["playUnit", "playSpell", "playGear", "playCard", "playFromChampionZone"]);

const defInDeck = new Set<string>();
const defEverInHand = new Set<string>();
const defEverPlayable = new Set<string>();
const defEverPlayed = new Set<string>();

for (const g of decks.games ?? []) {
  for (const d of [g.deck1, g.deck2]) {
    for (const id of d?.mainDeckCardIds ?? []) defInDeck.add(id);
  }
}

// Instance ids: player-1-main-0-<defId>, player-2-rune-5-<defId>, player-1-champion-<defId>, …
const INST_RE = /^player-\d+-(?:main|rune|champion|legend|bf)-?\d*-/;
const instToDef = (id: string) => id.replace(INST_RE, "") || id;

const moveFailed: any[] = [];
const enumErrors: any[] = [];

for (const f of readdirSync(DIR).filter((f) => f.startsWith("game-") && f.endsWith(".jsonl"))) {
  for (const line of readFileSync(join(DIR, f), "utf8").split("\n")) {
    if (!line) continue;
    const ev = JSON.parse(line);
    if (ev.deadlock) continue;
    if (ev.enumErr) enumErrors.push({ file: f, seq: ev.seq, err: ev.enumErr });
    for (const h of ev.hand ?? []) if (h.def) defEverInHand.add(h.def);
    for (const m of ev.available ?? []) {
      if (PLAY_MOVES.has(m.moveId)) {
        const cid = m.params?.cardId ?? m.params?.card ?? m.params?.id;
        if (cid) defEverPlayable.add(instToDef(String(cid)));
      }
    }
    if (PLAY_MOVES.has(ev.chosen?.moveId) && ev.success) {
      const cid = ev.chosen.params?.cardId ?? ev.chosen.params?.card;
      if (cid) defEverPlayed.add(instToDef(String(cid)));
    }
    if (ev.success === false) {
      moveFailed.push({ file: f, seq: ev.seq, move: ev.chosen, error: ev.error });
    }
  }
}

const drawnButNeverPlayable = [...defEverInHand].filter((d) => !defEverPlayable.has(d));
const neverDrawn = [...defInDeck].filter((d) => !defEverInHand.has(d));

const report = {
  summary: {
    defsInDecks: defInDeck.size,
    everInHand: defEverInHand.size,
    everPlayable: defEverPlayable.size,
    everPlayed: defEverPlayed.size,
    drawnButNeverPlayable: drawnButNeverPlayable.length,
    neverDrawn: neverDrawn.length,
    moveFailed: moveFailed.length,
    enumErrors: enumErrors.length,
  },
  drawnButNeverPlayable,
  neverDrawn,
  moveFailed: moveFailed.slice(0, 50),
  enumErrors: enumErrors.slice(0, 20),
};

writeFileSync(join(DIR, "coverage.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
if (drawnButNeverPlayable.length) {
  console.log("\ndrawn-but-never-playable (likely bugs):");
  console.log(drawnButNeverPlayable.slice(0, 30).join("\n"));
}
