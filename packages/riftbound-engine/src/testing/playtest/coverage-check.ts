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
const costViolations: any[] = [];

for (const f of readdirSync(DIR).filter((f) => f.startsWith("game-") && f.endsWith(".jsonl"))) {
  for (const line of readFileSync(join(DIR, f), "utf8").split("\n")) {
    if (!line) continue;
    const ev = JSON.parse(line);
    if (ev.deadlock) continue;
    if (ev.enumErr) enumErrors.push({ file: f, seq: ev.seq, err: ev.enumErr });
    if (ev.costViolation) costViolations.push({ file: f, seq: ev.seq, err: ev.costViolation });
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

let getAllCards: (() => any[]) | undefined;
try {
  ({ getAllCards } = await import("../../../../riftbound-cards/src/data/all-cards"));
} catch {}
const cardById = new Map((getAllCards?.() ?? []).map((c: any) => [c.id, c]));

const drawnButNeverPlayable = [...defEverInHand].filter((d) => !defEverPlayable.has(d));
const neverDrawn = [...defInDeck].filter((d) => !defEverInHand.has(d));

// Triage: high-cost cards are usually variance (tracer never saved enough energy).
// Reaction-only spells need a Closed state. What's left is suspicious.
const suspicious = drawnButNeverPlayable.filter((id) => {
  const c = cardById.get(id);
  if (!c) return true;
  if ((c.energyCost ?? 0) >= 5) return false;
  if (c.timing === "reaction") return false;
  return true;
});

// Cards whose rulesText should have produced an ability but didn't — these
// silently do nothing when their trigger fires. Scan the WHOLE pool (not just
// played) since a card being un-implemented is a bug regardless of whether
// this run happened to draw it.
function hasNoImpl(c: any) {
  if (!c?.rulesText?.trim()) return false;
  if (/^\s*\[/.test(c.rulesText) && !/\bwhen\b|\bat the\b|:/i.test(c.rulesText)) return false;
  return !c.abilities || c.abilities.length === 0;
}
const unimplementedAbility = [...cardById.values()].filter(hasNoImpl).map((c: any) => c.id);
const unimplementedAndPlayed = [...defEverPlayed].filter((id) => hasNoImpl(cardById.get(id)));

const report = {
  summary: {
    defsInDecks: defInDeck.size,
    everInHand: defEverInHand.size,
    everPlayable: defEverPlayable.size,
    everPlayed: defEverPlayed.size,
    drawnButNeverPlayable: drawnButNeverPlayable.length,
    suspicious: suspicious.length,
    unimplementedAbilityTotal: unimplementedAbility.length,
    unimplementedAndPlayed: unimplementedAndPlayed.length,
    neverDrawn: neverDrawn.length,
    moveFailed: moveFailed.length,
    enumErrors: enumErrors.length,
    costViolations: costViolations.length,
  },
  suspicious: suspicious.map((id) => {
    const c = cardById.get(id);
    return { id, name: c?.name, type: c?.cardType, cost: c?.energyCost, timing: c?.timing };
  }),
  drawnButNeverPlayable,
  neverDrawn,
  moveFailed: moveFailed.slice(0, 50),
  enumErrors: enumErrors.slice(0, 20),
};

writeFileSync(join(DIR, "coverage.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
if (costViolations.length) {
  console.log(`\n${costViolations.length} COST VIOLATIONS (played for less than energyCost):`);
  for (const v of costViolations.slice(0, 15)) console.log(`  ${v.file} seq=${v.seq}: ${v.err}`);
}
if (unimplementedAbility.length) {
  console.log(`\n${unimplementedAbility.length} cards PLAYED with rulesText but NO abilities[] (effect never fires):`);
  for (const id of unimplementedAbility.slice(0, 20)) {
    const c = cardById.get(id);
    console.log(`  ${id}  ${c?.name}: "${(c?.rulesText || "").slice(0, 70)}"`);
  }
}
if (suspicious.length) {
  console.log("\nsuspicious (cheap, non-reaction, drawn but never playable):");
  for (const s of report.suspicious) console.log(`  ${s.id}  ${s.name}  ${s.type} cost=${s.cost}`);
}
