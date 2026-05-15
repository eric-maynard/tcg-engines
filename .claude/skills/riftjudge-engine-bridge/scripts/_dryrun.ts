#!/usr/bin/env bun
/**
 * riftjudge-engine-bridge — _dryrun.ts
 *
 * Simulates the role a Claude Code sub-agent would play in the new agentic
 * flow. Takes a run-id + a short "case" key and issues a sequence of CLI calls
 * to `riftbridge.ts` via Bun's $.shell. Demonstrates that:
 *   1. The CLI is callable cross-process.
 *   2. State persists across invocations (replay log).
 *   3. The orchestrator's `harvest` produces a coherent scored record.
 *
 * Usage:
 *   bun _dryrun.ts <run-id> <case>
 *
 * Cases:
 *   concrete    — 2v2 combat (Chemtech Enforcer vs Legion Rearguard), full
 *                 attack → resolve-combat → query-board → finish.
 *   abstract    — rules-search for "Hidden", finish with a rule-grounded
 *                 answer (no engine demo).
 */

import { spawnSync } from "node:child_process";
import { join } from "node:path";

const RB = join(__dirname, "riftbridge.ts");

function call(runId: string, sub: string, args?: Record<string, unknown>): {
  ok: boolean;
  out: Record<string, unknown>;
  elapsedMs: number;
} {
  const argv = [RB, runId, sub];
  if (args !== undefined) argv.push(JSON.stringify(args));
  const t0 = performance.now();
  const r = spawnSync("bun", argv, { encoding: "utf8" });
  const elapsed = Math.round((performance.now() - t0) * 100) / 100;
  const stdoutLine = (r.stdout ?? "").trim().split("\n").pop() ?? "{}";
  let out: Record<string, unknown> = {};
  try {
    out = JSON.parse(stdoutLine) as Record<string, unknown>;
  } catch {
    out = { raw: stdoutLine };
  }
  const ok = r.status === 0;
  process.stdout.write(`  ${sub.padEnd(22)} ${JSON.stringify(args ?? {}).padEnd(50)} -> ${JSON.stringify(out).slice(0, 100)}  [${elapsed}ms]\n`);
  return { ok, out, elapsedMs: elapsed };
}

function dryrunConcrete(runId: string): void {
  process.stdout.write(`\n=== DRYRUN concrete (run-id=${runId}) ===\n`);
  call(runId, "create-battlefield", { id: "bf1", controller: "P2" });
  const r1 = call(runId, "instantiate-card", { name: "Chemtech Enforcer", side: "P1" });
  const cid1 = (r1.out as { cardId?: string }).cardId ?? "c0001";
  call(runId, "place-on-battlefield", { cardId: cid1, battlefieldId: "bf1" });
  const r2 = call(runId, "instantiate-card", { name: "Legion Rearguard", side: "P2" });
  const cid2 = (r2.out as { cardId?: string }).cardId ?? "c0002";
  call(runId, "place-on-battlefield", { cardId: cid2, battlefieldId: "bf1" });
  call(runId, "set-active-player", { side: "P1" });
  call(runId, "attack", { battlefieldId: "bf1", attackerSide: "P1" });
  call(runId, "resolve-combat", { battlefieldId: "bf1" });
  const q = call(runId, "query-board");
  // Interpret result and call finish.
  const units = (q.out as { units?: { id: string; alive: boolean; effectiveMight: number }[] }).units ?? [];
  const attacker = units.find((u) => u.id === cid1);
  const defender = units.find((u) => u.id === cid2);
  const answer =
    `2 Might vs 2 Might trade: both units take 2 damage and die simultaneously (alive: attacker=${attacker?.alive}, defender=${defender?.alive}). Battlefield is uncontested afterward.`;
  call(runId, "finish", { answer, confidence: 0.9 });
}

function dryrunAbstract(runId: string): void {
  process.stdout.write(`\n=== DRYRUN abstract (run-id=${runId}) ===\n`);
  call(runId, "search-rules", { query: "Hidden", maxResults: 4 });
  const answer =
    "Hidden is a status keyword: a unit with Hidden cannot be targeted by opposing abilities and isn't a legal blocker target until it attacks or activates. It loses Hidden the first time it attacks/activates. (Cite: 800-keywords.md.)";
  call(runId, "finish", { answer, confidence: 0.65 });
}

function main(): number {
  const argv = process.argv.slice(2);
  if (argv.length < 2) {
    process.stderr.write("Usage: bun _dryrun.ts <run-id> <concrete|abstract>\n");
    return 2;
  }
  const [runId, kase] = argv;
  if (kase === "concrete") dryrunConcrete(runId);
  else if (kase === "abstract") dryrunAbstract(runId);
  else {
    process.stderr.write(`unknown case "${kase}" — use "concrete" or "abstract"\n`);
    return 2;
  }
  return 0;
}

process.exit(main());
