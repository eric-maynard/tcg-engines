#!/usr/bin/env bun
/**
 * riftjudge-engine-bridge — driver (ALWAYS-ANSWER edition)
 *
 * Usage:
 *   bun run.ts <scenario.json>      # answer a scenario file (any kind)
 *   bun run.ts --demo               # the built-in Sacrifice+Stupefy demo
 *   bun run.ts --suite              # run the always-answer demo suite
 *
 * For an `engine-scenario` it prints the full pipeline: structured scenario →
 * engine moves applied → step-by-step state deltas → rendered answer. For
 * `rules-question` / `out-of-engine-scope` / variant Scenarios it prints the
 * scenario then jumps straight to the rendered answer (Track B / conditional).
 *
 * EVERY scenario produces an answer — never "out of scope".
 */

import { readFileSync } from "node:fs";
import { runScenario } from "./build-scenario";
import {
  answerScenario,
  engineAnswer,
  renderUnifiedAnswer,
} from "./render-answer";
import { scenarioKind, type Scenario } from "./scenario-schema";
import { demoScenario } from "./demo-scenario";
import { demoSuite } from "./demo-suite";

function hr(label: string): void {
  console.log("\n" + "=".repeat(72));
  console.log(label);
  console.log("=".repeat(72));
}

function describeAction(a: NonNullable<Scenario["actions"]>[number]): string {
  if (a.kind === "playSpell") {
    return `playSpell "${a.name}" by ${a.side}${a.condition ? ` (gated on ${a.condition.kind})` : ""}`;
  }
  return a.kind;
}

/** Run one scenario through the full reporting pipeline. */
export function reportScenario(scenario: Scenario): void {
  const kind = scenarioKind(scenario);

  hr(`STAGE 1 — STRUCTURED SCENARIO (kind: ${kind}${scenario.variants ? `, ${scenario.variants.length} variants` : ""})`);
  console.log(JSON.stringify(scenario, null, 2));

  // Track A single engine scenario (or a rules-demo, which expands into one):
  // show the engine plumbing.
  if ((kind === "engine-scenario" || kind === "rules-demo") && !scenario.variants) {
    if (kind === "rules-demo") {
      console.log(`\n  (rules-demo topic "${scenario.demoTopic ?? "(auto-detected from the question text)"}" — the bridge builds a concrete demo board below and runs it through the engine)`);
    }
    let run;
    try {
      run = runScenario(scenario);
    } catch (err) {
      hr("ENGINE RUN FAILED — falling back to Track B");
      console.log(`  ${err instanceof Error ? err.message : String(err)}`);
      hr("STAGE 4 — RENDERED ALWAYS-ANSWER");
      console.log(renderUnifiedAnswer(scenario, answerScenario(scenario)));
      console.log("");
      return;
    }

    hr("STAGE 2 — ENGINE MOVES APPLIED");
    for (const line of run.moveLog) {
      console.log("  " + line);
    }
    if (run.moveLog.length === 0) {
      console.log("  (no actions — just the premise board)");
    }

    hr("STAGE 3 — STEP-BY-STEP STATE DELTAS");
    console.log("Initial state:");
    for (const u of run.initialState.units) {
      console.log(`  ${u.id} (${u.side}): eff Might ${u.effectiveMight}, ${u.zone}, ${u.alive ? "alive" : "dead"}`);
    }
    for (const b of run.initialState.battlefields) {
      console.log(`  bf ${b.id}: controller=${b.controller ?? "uncontrolled"}, contested=${b.contested}`);
    }
    for (const step of run.steps) {
      console.log(`\n  -- Step ${step.step}: ${describeAction(step.action)} --`);
      for (const e of step.events) {
        console.log(`     [${e.kind}] ${e.detail}`);
      }
      console.log(
        `     state: ${step.after.units.map((u) => `${u.id}=${u.effectiveMight}M/${u.alive ? "alive" : "dead"}`).join(", ")} | bf: ${step.after.battlefields.map((b) => `${b.id}->${b.controller ?? "none"}`).join(", ") || "—"}${step.after.winner ? ` | winner=${step.after.winner}` : ""}`,
      );
    }

    hr("STAGE 4 — RENDERED ALWAYS-ANSWER");
    console.log(renderUnifiedAnswer(scenario, engineAnswer(run)));
    console.log("");
    return;
  }

  // Track B / variants: no engine plumbing to show — go straight to the answer.
  if (scenario.variants && scenario.variants.length) {
    hr("STAGE 2-3 — RUNNING EACH VARIANT");
    for (const v of scenario.variants) {
      const vk = scenarioKind(v.scenario);
      console.log(`  ▸ "${v.label}"  (kind: ${vk})`);
    }
  } else {
    hr("STAGE 2-3 — TRACK B (rules-text reasoning, no engine run)");
    console.log(`  This question is "${kind}".`);
    if (scenario.whatsUnsupported) {
      console.log(`  Engine can't model: ${scenario.whatsUnsupported}.`);
    }
    console.log("  Answer comes from reasoning over riftbound-rules/version-2026-03-30/.");
  }

  hr("STAGE 4 — RENDERED ALWAYS-ANSWER");
  console.log(renderUnifiedAnswer(scenario, answerScenario(scenario)));
  console.log("");
}

function main(): void {
  const arg = process.argv[2];
  if (arg === "--suite") {
    for (const s of demoSuite) {
      reportScenario(s);
    }
    return;
  }
  let scenario: Scenario;
  if (!arg || arg === "--demo") {
    scenario = demoScenario;
  } else {
    scenario = JSON.parse(readFileSync(arg, "utf8")) as Scenario;
  }
  reportScenario(scenario);
}

main();
