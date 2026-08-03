#!/usr/bin/env bun
/**
 * Coverage spectator: scan game traces for absence bugs.
 *
 *   bun coverage-check.ts /tmp/playtest-traces
 *
 * Reports:
 *   - never-playable: card in deck, seen in hand-zone params, never in a play* available move
 *   - move-failed:    engine enumerated a move as valid, then rejected it
 *   - enum-error:     enumerateMoves threw
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = process.argv[2] ?? "/tmp/playtest-traces";
const decks = JSON.parse(readFileSync(join(DIR, "decks.json"), "utf8"));

const deckCards = new Set<string>(decks.allDeckCards ?? []);
const everPlayable = new Set<string>();
const everChosen = new Set<string>();
const moveFailed: any[] = [];
const enumErrors: any[] = [];

const PLAY_MOVES = new Set(["playUnit", "playSpell", "playGear", "playCard"]);

for (const f of readdirSync(DIR).filter((f) => f.startsWith("game-") && f.endsWith(".jsonl"))) {
  for (const line of readFileSync(join(DIR, f), "utf8").split("\n")) {
    if (!line) continue;
    const ev = JSON.parse(line);
    for (const m of ev.available ?? []) {
      if (m._enumErr) enumErrors.push({ file: f, seq: ev.seq, err: m._enumErr });
      if (PLAY_MOVES.has(m.moveId)) {
        const cid = m.params?.cardId ?? m.params?.card ?? m.params?.id;
        if (cid) everPlayable.add(String(cid));
      }
    }
    if (PLAY_MOVES.has(ev.chosen?.moveId)) {
      const cid = ev.chosen.params?.cardId ?? ev.chosen.params?.card;
      if (cid) everChosen.add(String(cid));
    }
    if (ev.success === false) {
      moveFailed.push({ file: f, seq: ev.seq, move: ev.chosen, error: ev.error });
    }
  }
}

const neverPlayable = [...deckCards].filter((c) => !everPlayable.has(c));

const report = {
  deckCardCount: deckCards.size,
  everPlayable: everPlayable.size,
  everChosen: everChosen.size,
  neverPlayable,
  moveFailed: moveFailed.slice(0, 50),
  moveFailedCount: moveFailed.length,
  enumErrors: enumErrors.slice(0, 20),
};

writeFileSync(join(DIR, "coverage.json"), JSON.stringify(report, null, 2));
console.log(
  `deck cards: ${deckCards.size}  ever-playable: ${everPlayable.size}  never-playable: ${neverPlayable.length}  move-failed: ${moveFailed.length}`
);
if (neverPlayable.length) console.log("never-playable:", neverPlayable.slice(0, 20));
