#!/usr/bin/env bun
/**
 * riftjudge-engine-bridge — riftbridge CLI.
 *
 * A single-binary, per-process command interface for the Riftbound engine.
 * Designed for the new agentic flow: a Claude Code sub-agent dispatched under
 * the Max subscription invokes `bun riftbridge.ts <run-id> <cmd> '<jsonArgs>'`
 * repeatedly via Bash. State is persisted to `/tmp/riftbridge/<run-id>/` so the
 * series of invocations forms a coherent engine session.
 *
 * Usage:
 *   bun riftbridge.ts <run-id> <subcommand> [json-args]
 *   bun riftbridge.ts --help                 (lists all subcommands)
 *   bun riftbridge.ts <run-id> --log         (dumps the log of issued commands)
 *
 * Examples:
 *   bun riftbridge.ts r1 new
 *   bun riftbridge.ts r1 create-battlefield '{"id":"bf1","controller":"P1"}'
 *   bun riftbridge.ts r1 instantiate-card '{"name":"Akali","side":"P1"}'
 *     → {"cardId":"c0001",...}
 *   bun riftbridge.ts r1 place-on-battlefield '{"cardId":"c0001","battlefieldId":"bf1"}'
 *   bun riftbridge.ts r1 query-board
 *   bun riftbridge.ts r1 finish '{"answer":"...","confidence":0.7}'
 *
 * Errors → stderr with the message, plus stdout `{"error":"..."}` and exit 1.
 * No uncaught throws.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import {
  commandHelp,
  READ_ONLY_COMMANDS,
  replayCommands,
  runCommand,
  type RunState,
} from "./riftbridge-state";

const ROOT = "/tmp/riftbridge";

function runDir(runId: string): string {
  return join(ROOT, runId);
}
function statePath(runId: string): string {
  return join(runDir(runId), "state.json");
}
function logPath(runId: string): string {
  return join(runDir(runId), "log.txt");
}
function finishPath(runId: string): string {
  return join(runDir(runId), "finish.json");
}

function loadState(runId: string): RunState {
  const path = statePath(runId);
  if (!existsSync(path)) return { commands: [], finished: false };
  try {
    return JSON.parse(readFileSync(path, "utf8")) as RunState;
  } catch {
    return { commands: [], finished: false };
  }
}

function saveState(runId: string, state: RunState): void {
  mkdirSync(runDir(runId), { recursive: true });
  writeFileSync(statePath(runId), JSON.stringify(state, null, 2));
}

function appendLog(runId: string, line: string): void {
  mkdirSync(runDir(runId), { recursive: true });
  appendFileSync(logPath(runId), `${line}\n`);
}

function printHelp(): void {
  const help = commandHelp();
  console.log("riftbridge CLI — subcommands:\n");
  for (const h of help) {
    console.log(`  ${h.name.padEnd(22)} ${h.argShape}`);
    console.log(`    ${h.description}`);
  }
  console.log("\nUsage: bun riftbridge.ts <run-id> <subcommand> [json-args]");
  console.log("       bun riftbridge.ts --help");
  console.log("       bun riftbridge.ts <run-id> --log");
}

function emitOk(obj: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}
function emitErr(msg: string): void {
  process.stderr.write(`${msg}\n`);
  process.stdout.write(`${JSON.stringify({ error: msg })}\n`);
}

function main(): number {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    printHelp();
    return 0;
  }
  const runId = argv[0];
  if (!/^[A-Za-z0-9._-]+$/.test(runId)) {
    emitErr(`invalid run-id "${runId}" — use [A-Za-z0-9._-]+`);
    return 1;
  }
  if (argv.length < 2) {
    emitErr(`missing subcommand. Usage: bun riftbridge.ts ${runId} <subcommand> [json-args]`);
    return 1;
  }

  const sub = argv[1];

  // Special: dump the log for a run.
  if (sub === "--log") {
    if (!existsSync(logPath(runId))) {
      emitErr(`no log for run "${runId}" yet`);
      return 1;
    }
    process.stdout.write(readFileSync(logPath(runId), "utf8"));
    return 0;
  }

  // Parse args JSON if present.
  let args: Record<string, unknown> = {};
  if (argv.length >= 3 && argv[2].length > 0) {
    try {
      const parsed = JSON.parse(argv[2]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      } else {
        emitErr(`args must be a JSON object, got ${typeof parsed}`);
        return 1;
      }
    } catch (e) {
      emitErr(`failed to parse args JSON: ${e instanceof Error ? e.message : String(e)}`);
      return 1;
    }
  }

  const state = loadState(runId);

  // `finish` is special — it writes finish.json and marks state.finished.
  if (sub === "finish") {
    const answer = typeof args.answer === "string" ? args.answer : "";
    const confidence =
      typeof args.confidence === "number" ? args.confidence : 0;
    if (!answer) {
      emitErr(`finish: missing/empty "answer"`);
      return 1;
    }
    mkdirSync(runDir(runId), { recursive: true });
    writeFileSync(
      finishPath(runId),
      JSON.stringify({ answer, confidence, finishedAt: new Date().toISOString() }, null, 2),
    );
    state.commands.push({ name: "finish", args });
    state.finished = true;
    saveState(runId, state);
    appendLog(runId, `finish ${JSON.stringify(args)} -> {"ok":true}`);
    emitOk({ ok: true, accepted: true });
    return 0;
  }

  // Replay then apply.
  const t0 = performance.now();
  const ctx = replayCommands(state);
  const result = runCommand(ctx, sub, args);
  const elapsed = Math.round((performance.now() - t0) * 100) / 100;

  // Persist mutation if not a read-only command and not an error.
  if (!READ_ONLY_COMMANDS.has(sub) && !result.error) {
    state.commands.push({ name: sub, args });
    saveState(runId, state);
  }
  appendLog(
    runId,
    `${sub} ${JSON.stringify(args)} -> ${JSON.stringify(result)}  (${elapsed}ms)`,
  );

  if (result.error) {
    emitErr(`${sub}: ${result.error}`);
    return 1;
  }
  emitOk(result);
  return 0;
}

try {
  const code = main();
  process.exit(code);
} catch (e) {
  emitErr(`riftbridge fatal: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
