#!/usr/bin/env bun
/**
 * riftjudge-engine-bridge — agentic orchestrator.
 *
 * Coordinates the new CLI-based agentic flow under the Claude Code Max
 * subscription. Sub-agents are dispatched as Agents under Max (free), not via
 * the metered Anthropic API. This script does NOT dispatch the sub-agent
 * itself — the parent Claude Code session does that, by reading the prompt
 * this script prints and passing it to the Agent tool.
 *
 * Subcommands:
 *
 *   prep <pfile>          → generate a run-id, write the sub-agent prompt
 *                           (engine vocabulary + few-shot + question) to
 *                           /tmp/riftbridge/<run-id>/prompt.txt AND stdout.
 *                           Prints the run-id last so the parent can capture it.
 *
 *   harvest <run-id>      → after a sub-agent has finished, read finish.json
 *                           + log.txt, build a result record and emit it as JSON
 *                           on stdout. Includes a tool-mix summary and the
 *                           bot-answer match heuristic for the originating
 *                           p-file (if pfile was recorded during prep).
 *
 *   list                  → list known run-ids under /tmp/riftbridge/.
 *
 * Usage:
 *   bun agentic-orchestrator.ts prep ~/riftjudge-problems/p0001.md
 *   bun agentic-orchestrator.ts harvest <run-id>
 *   bun agentic-orchestrator.ts list
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

import { commandHelp } from "./riftbridge-state";

const ROOT = "/tmp/riftbridge";

// ---------------------------------------------------------------------------
// run-id allocation
// ---------------------------------------------------------------------------

function newRunId(pfileBase: string): string {
  const ts = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  // 4-byte random hex.
  const rand = Math.floor(Math.random() * 0xffff_ffff).toString(16).padStart(8, "0");
  return `${pfileBase}-${ts}-${rand}`;
}

// ---------------------------------------------------------------------------
// p-file parsing
// ---------------------------------------------------------------------------

interface ParsedPFile {
  path: string;
  premise: string;
  actions: string;
  question: string;
  botAnswer: string;
}

function parsePFile(path: string): ParsedPFile {
  const raw = readFileSync(path, "utf8");
  const grab = (label: string): string => {
    const re = new RegExp(`###\\s+${label}[^\\n]*\\n([\\s\\S]*?)(?=\\n###|\\n##|$)`, "i");
    const m = raw.match(re);
    return (m?.[1] ?? "").trim();
  };
  const botMatch = raw.match(/##\s+Answer[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i);
  return {
    path,
    premise: grab("Premise"),
    actions: grab("Action"),
    question: grab("Question"),
    botAnswer: botMatch ? botMatch[1].trim() : "",
  };
}

// ---------------------------------------------------------------------------
// Sub-agent prompt construction
// ---------------------------------------------------------------------------

const POLICY = `You are a Riftbound TCG rules engine driver, running as a sub-agent of a Claude Code parent session under the Max subscription. Your job: given a Riftbound rules question, drive the riftbridge CLI to construct a concrete scenario, run it through the engine, and call \`finish\` with a verdict.

The riftbridge CLI is a single Bun binary you invoke from the Bash tool:

    bun ~/code/tcg-engines/.claude/skills/riftjudge-engine-bridge/scripts/riftbridge.ts <RUN_ID> <subcommand> '<json-args>'

Each call mutates persisted state in /tmp/riftbridge/<RUN_ID>/ and prints a single-line JSON result to stdout. Errors land on stderr with exit 1; the JSON result still appears on stdout so you can parse it either way.

ALWAYS use the run-id given to you at the bottom of this prompt. Do not invent run-ids.

PREFERENCE — engine over rules-search:
  Prefer constructing a scenario over searching rules text. If the question
  names units, keywords, plays, attacks, damage, counters, on-play triggers,
  on-conquer triggers, deaths, or chain timing — build a small concrete board
  with create-battlefield + instantiate-card/play-card, run the action, then
  query-board. Use search-rules ONLY if the question is purely conceptual
  ("what is the difference between Open and Closed state?") and no engine
  demo is possible. NEVER answer with just search-rules + get-rules-text when
  a 5-call engine demo would settle it.

WORKFLOW for an engine-attemptable question:
  1. If the question mentions a card by a colloquial / partial name (e.g. "rocket",
     "the +1/+0 spell", "the legion guy"), call search-card-name FIRST to resolve
     the canonical name. Pass that resolved name to instantiate-card / play-card /
     get-rules-text. instantiate-card requires an exact-name match; fuzzy lookup
     is what turns a vague reference into a usable name.
  2. create-battlefield (one or more) if combat is involved.
  3. play-card or instantiate-card + place-on-battlefield to build the board.
  4. attack + resolve-combat to run combat.
  5. query-board to see the result.
  6. finish — you MUST call this exactly once with {"answer":"...","confidence":0..1}.

CONFIDENCE (0.0–1.0):
  - 0.9+   the engine ran a concrete demo and the answer is what it computed.
  - 0.6–0.8  partly engine-derived OR rules-grounded with high certainty.
  - 0.3–0.5  couldn't construct a demo and the rules don't clearly settle it.

CONSTRAINTS:
  - You MUST call finish exactly once; that's how this run ends.
  - HARD CAP: 20 riftbridge calls TOTAL. Most good runs are 5–12 calls.
  - If a named card isn't in the registry, fall back to a similarly-shaped card
    (any unit of the right Might) and document the substitution in your answer
    with "Assumed: substituted <X> for unmatched <Y>".
  - Costs (energy/runes) are skipped — focus on what happens after plays
    resolve.
  - Sides: "P1" = the asker; "P2" = the opponent.
`;

// Six mini few-shot examples — shape only, not literally replayable (cards
// vary). Inlined here so the sub-agent prompt is self-contained.
const FEWSHOT: string[] = [
  `EXAMPLE 1 — Concrete combat with a granted keyword
Question: "I have a 2 Might unit with Quick-Draw. I attack a 1 Might defender. What happens?"
Plan:
  bun riftbridge.ts $RID create-battlefield '{"id":"bf1","controller":"P2"}'
  bun riftbridge.ts $RID instantiate-card '{"name":"<2M unit>","side":"P1"}'   # -> cardId c0001
  bun riftbridge.ts $RID grant-keyword '{"cardId":"c0001","keyword":"Quick-Draw","duration":"combat"}'
  bun riftbridge.ts $RID place-on-battlefield '{"cardId":"c0001","battlefieldId":"bf1"}'
  bun riftbridge.ts $RID instantiate-card '{"name":"<1M unit>","side":"P2"}'   # -> cardId c0002
  bun riftbridge.ts $RID place-on-battlefield '{"cardId":"c0002","battlefieldId":"bf1"}'
  bun riftbridge.ts $RID set-active-player '{"side":"P1"}'
  bun riftbridge.ts $RID attack '{"battlefieldId":"bf1","attackerSide":"P1"}'
  bun riftbridge.ts $RID resolve-combat '{"battlefieldId":"bf1"}'
  bun riftbridge.ts $RID query-board
  bun riftbridge.ts $RID finish '{"answer":"Quick-Draw lets the attacker deal damage first; the defender dies before swinging. Attacker survives at 2 Might and conquers.","confidence":0.9}'`,

  `EXAMPLE 2 — On-play trigger (Legion-shaped)
Question: "My ability says 'when you play a second unit this turn, +1 Might to me'. I then play another 1M unit. What's the first unit's Might?"
Plan:
  bun riftbridge.ts $RID create-battlefield '{"id":"bf1","controller":"P1"}'
  bun riftbridge.ts $RID instantiate-card '{"name":"<Legion-shaped unit>","side":"P1"}'    # -> c0001
  bun riftbridge.ts $RID place-on-battlefield '{"cardId":"c0001","battlefieldId":"bf1"}'
  bun riftbridge.ts $RID play-card '{"name":"<any cheap unit>","side":"P1","to":"base"}'   # warmup = play #1
  bun riftbridge.ts $RID play-card '{"name":"<1M unit>","side":"P1","to":"base"}'           # play #2 -> trigger fires
  bun riftbridge.ts $RID query-board       # check c0001.effectiveMight
  bun riftbridge.ts $RID finish '{"answer":"...","confidence":0.85}'`,

  `EXAMPLE 3 — Abstract rules-demo
Question: "How does Hidden work?"
Plan:
  bun riftbridge.ts $RID search-rules '{"query":"Hidden","maxResults":6}'
  bun riftbridge.ts $RID finish '{"answer":"Hidden is a status keyword: a unit with Hidden can't be targeted by opposing abilities and isn't a legal blocker target until it attacks or activates. (Cite: 800-keywords.md.)","confidence":0.65}'`,

  `EXAMPLE 4 — Named-card lookup
Question: "What does Battering Ram do?"
Plan:
  bun riftbridge.ts $RID get-rules-text '{"cardName":"Battering Ram"}'
  bun riftbridge.ts $RID finish '{"answer":"<paraphrase of rulesText>","confidence":0.9}'`,

  `EXAMPLE 5 — Chain timing (LIFO)
Question: "I play spell Y; opp plays reaction Z. Which resolves first?"
Plan:
  bun riftbridge.ts $RID set-active-player '{"side":"P1"}'
  bun riftbridge.ts $RID play-card '{"name":"Y","side":"P1","to":"trash"}'
  bun riftbridge.ts $RID pass-focus '{"side":"P1"}'
  bun riftbridge.ts $RID play-card '{"name":"Z","side":"P2","to":"trash"}'
  bun riftbridge.ts $RID pass-focus '{"side":"P2"}'
  bun riftbridge.ts $RID pass-focus '{"side":"P1"}'
  bun riftbridge.ts $RID query-board
  bun riftbridge.ts $RID finish '{"answer":"LIFO (rule 342.1): Z resolves first, then Y.","confidence":0.85}'`,

  `EXAMPLE 6 — Fuzzy card-name resolution
Question: "Does the rocket spell kill a 3-might unit?"
Plan:
  bun riftbridge.ts $RID search-card-name '{"query":"rocket","maxResults":5}'   # find candidates
  bun riftbridge.ts $RID get-rules-text '{"cardName":"Super Mega Death Rocket!"}'
  bun riftbridge.ts $RID create-battlefield '{"id":"bf1","controller":"P1"}'
  bun riftbridge.ts $RID instantiate-card '{"name":"<any 3M unit>","side":"P2"}'   # -> c0001
  bun riftbridge.ts $RID place-on-battlefield '{"cardId":"c0001","battlefieldId":"bf1"}'
  bun riftbridge.ts $RID add-counter '{"cardId":"c0001","kind":"damage","n":<rocket damage>}'
  bun riftbridge.ts $RID query-board
  bun riftbridge.ts $RID finish '{"answer":"...","confidence":0.85}'`,

  `EXAMPLE 7 — Damage arithmetic
Question: "2M unit takes 1 damage, then I cast +1M buff. Alive?"
Plan:
  bun riftbridge.ts $RID create-battlefield '{"id":"bf1","controller":"P1"}'
  bun riftbridge.ts $RID instantiate-card '{"name":"<any 2M unit>","side":"P1"}'   # -> c0001
  bun riftbridge.ts $RID place-on-battlefield '{"cardId":"c0001","battlefieldId":"bf1"}'
  bun riftbridge.ts $RID add-counter '{"cardId":"c0001","kind":"damage","n":1}'
  bun riftbridge.ts $RID set-might '{"cardId":"c0001","delta":1}'
  bun riftbridge.ts $RID query-board    # damage=1, effectiveMight=3 -> alive
  bun riftbridge.ts $RID finish '{"answer":"Alive. effective Might 3, damage 1, no lethal SBA.","confidence":0.9}'`,
];

function buildSubAgentPrompt(runId: string, parsed: ParsedPFile): string {
  const help = commandHelp();
  const subcommandList = help.map((h) => `  - ${h.name.padEnd(22)} ${h.argShape}\n      ${h.description}`).join("\n");
  const fewshot = FEWSHOT.map((ex) => ex.replace(/\$RID/g, runId)).join("\n\n----\n\n");
  return `${POLICY}

=== AVAILABLE SUBCOMMANDS ===
${subcommandList}

=== WORKED EXAMPLES (shape only — adapt to the actual question) ===

${fewshot}

=== YOUR RUN ===

RUN_ID: ${runId}

PREMISE (initial board):
${parsed.premise || "(abstract — no specific board)"}

ACTION(S) IN QUESTION:
${parsed.actions || "(N/A — pure rules question)"}

QUESTION:
${parsed.question}

When you have an answer, finalize it with:
    bun ~/code/tcg-engines/.claude/skills/riftjudge-engine-bridge/scripts/riftbridge.ts ${runId} finish '{"answer":"<your-answer>","confidence":<0..1>}'
`;
}

// ---------------------------------------------------------------------------
// prep
// ---------------------------------------------------------------------------

interface PrepMeta {
  runId: string;
  pfile: string;
  preparedAt: string;
}

function cmdPrep(pfilePathRaw: string): number {
  const pfilePath = resolve(pfilePathRaw);
  if (!existsSync(pfilePath)) {
    process.stderr.write(`p-file not found: ${pfilePath}\n`);
    return 1;
  }
  const base = basename(pfilePath, ".md");
  const runId = newRunId(base);
  const dir = join(ROOT, runId);
  mkdirSync(dir, { recursive: true });

  const parsed = parsePFile(pfilePath);
  const prompt = buildSubAgentPrompt(runId, parsed);
  writeFileSync(join(dir, "prompt.txt"), prompt);
  const meta: PrepMeta = {
    runId,
    pfile: pfilePath,
    preparedAt: new Date().toISOString(),
  };
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2));

  // Print the prompt to stdout (parent dispatches the Agent with this).
  process.stdout.write(prompt);
  process.stdout.write(`\n--- RUN_ID ---\n${runId}\n`);
  return 0;
}

// ---------------------------------------------------------------------------
// harvest
// ---------------------------------------------------------------------------

const ENGINE_CMDS = new Set([
  "instantiate-card",
  "place-on-battlefield",
  "place-in-base",
  "place-in-hand",
  "place-in-trash",
  "create-battlefield",
  "set-might",
  "add-counter",
  "exhaust",
  "ready",
  "grant-keyword",
  "set-power",
  "set-runes",
  "set-active-player",
  "begin-phase",
  "advance-turn",
  "play-card",
  "activate-ability",
  "attack",
  "declare-defender",
  "resolve-combat",
  "pass-focus",
  "query-board",
]);
const RULES_CMDS = new Set([
  "search-rules",
  "get-rules-text",
  "get-abilities",
  "search-card-name",
]);

function looseMatch(bot: string, agent: string): boolean {
  if (!bot || !agent) return false;
  const b = bot.toLowerCase();
  const a = agent.toLowerCase();
  for (const sig of ["yes", "no", "die", "kill", "survive", "alive", "conquer", "trigger", "resolve"]) {
    if (b.includes(sig) && a.includes(sig)) return true;
  }
  return false;
}

function cmdHarvest(runId: string): number {
  const dir = join(ROOT, runId);
  if (!existsSync(dir)) {
    process.stderr.write(`no run dir for "${runId}" (looked at ${dir})\n`);
    return 1;
  }
  const finishFile = join(dir, "finish.json");
  let finish: { answer: string; confidence: number; finishedAt: string } | null = null;
  if (existsSync(finishFile)) {
    try {
      finish = JSON.parse(readFileSync(finishFile, "utf8"));
    } catch {
      // ignore
    }
  }
  const logFile = join(dir, "log.txt");
  const logText = existsSync(logFile) ? readFileSync(logFile, "utf8") : "";
  const logLines = logText.split("\n").filter((l) => l.length > 0);

  // Tool-mix counts from log.
  let engineCalls = 0;
  let rulesCalls = 0;
  let finishCalls = 0;
  for (const line of logLines) {
    const cmd = line.split(" ")[0];
    if (cmd === "finish") finishCalls++;
    else if (ENGINE_CMDS.has(cmd)) engineCalls++;
    else if (RULES_CMDS.has(cmd)) rulesCalls++;
  }
  const totalCalls = engineCalls + rulesCalls + finishCalls;

  // Bot-answer match if meta + pfile known.
  let pfile: string | null = null;
  let botAnswer = "";
  let matchBot = false;
  const metaFile = join(dir, "meta.json");
  if (existsSync(metaFile)) {
    try {
      const meta = JSON.parse(readFileSync(metaFile, "utf8")) as PrepMeta;
      pfile = meta.pfile;
      if (existsSync(meta.pfile)) {
        const parsed = parsePFile(meta.pfile);
        botAnswer = parsed.botAnswer;
        if (finish) matchBot = looseMatch(botAnswer, finish.answer);
      }
    } catch {
      // ignore
    }
  }

  const traceSummary = logLines.slice(0, 30).map((l) => l.slice(0, 200));

  const result = {
    runId,
    pfile,
    finished: !!finish,
    answer: finish?.answer ?? null,
    confidence: finish?.confidence ?? null,
    matchBot,
    botAnswerPreview: botAnswer.slice(0, 300).replace(/\n/g, " | "),
    toolMix: {
      total: totalCalls,
      engine: engineCalls,
      rules: rulesCalls,
      finish: finishCalls,
      enginePct: totalCalls > 0 ? Math.round((engineCalls / totalCalls) * 1000) / 10 : 0,
    },
    traceSummary,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

function cmdList(): number {
  if (!existsSync(ROOT)) {
    process.stdout.write("(no runs yet — /tmp/riftbridge does not exist)\n");
    return 0;
  }
  const entries = readdirSync(ROOT).sort();
  for (const e of entries) {
    const dir = join(ROOT, e);
    const finished = existsSync(join(dir, "finish.json"));
    process.stdout.write(`${e}${finished ? "  [finished]" : ""}\n`);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main(): number {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    process.stderr.write(`Usage:
  bun agentic-orchestrator.ts prep <pfile.md>
  bun agentic-orchestrator.ts harvest <run-id>
  bun agentic-orchestrator.ts list
`);
    return 2;
  }
  const cmd = argv[0];
  if (cmd === "prep") {
    if (!argv[1]) {
      process.stderr.write("prep: missing pfile path\n");
      return 2;
    }
    return cmdPrep(argv[1]);
  }
  if (cmd === "harvest") {
    if (!argv[1]) {
      process.stderr.write("harvest: missing run-id\n");
      return 2;
    }
    return cmdHarvest(argv[1]);
  }
  if (cmd === "list") return cmdList();
  process.stderr.write(`unknown subcommand "${cmd}"\n`);
  return 2;
}

try {
  process.exit(main());
} catch (e) {
  process.stderr.write(`orchestrator fatal: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
}
