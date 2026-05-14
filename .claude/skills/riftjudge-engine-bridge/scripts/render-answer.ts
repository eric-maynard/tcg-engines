/**
 * riftjudge-engine-bridge — Stage 4 (ALWAYS-ANSWER edition)
 *
 * Normalizes every answer — Track A (engine), Track B (rules-reasoning), single
 * or conditional — into a `UnifiedAnswer` object, then renders it to clean text.
 *
 * The render surfaces assumptions and conditionals PROMINENTLY ("⚠️ Assumed: …" /
 * "It depends: …") and always includes a confidence line. It never asserts
 * anything not derivable from the engine state + event log (Track A) or not
 * present in the LLM-authored `rulesAnswer` (Track B).
 *
 * The whole point: there is always an output. Never "out of scope / can't
 * answer" — Track B fills the gap with a best-effort, honestly-flagged answer.
 */

import type { RunResult, UnitSummary } from "./build-scenario";
import { runScenario } from "./build-scenario";
import {
  scenarioKind,
  type Confidence,
  type Scenario,
  type UnifiedAnswer,
} from "./scenario-schema";

// ===========================================================================
// Track A — engine result -> UnifiedAnswer
// ===========================================================================

function unitLine(u: UnitSummary): string {
  const where =
    u.zone === "base"
      ? "in base"
      : u.zone?.startsWith("battlefield-")
        ? `at ${u.zone.replace("battlefield-", "")}`
        : u.zone === "trash"
          ? "in trash"
          : `in ${u.zone ?? "?"}`;
  if (!u.alive) {
    // Dead units have their temporary meta (mightModifier, buff, damage) wiped
    // when they hit the trash, so the "effective Might" reading would be stale —
    // just report it's dead.
    return `${u.id} (${u.side}): DEAD (${where})`;
  }
  const mods: string[] = [];
  if (u.mightModifier !== 0) {
    mods.push(`${u.mightModifier > 0 ? "+" : ""}${u.mightModifier} this turn`);
  }
  if (u.buffed) {
    mods.push("+1 buff");
  }
  if (u.damage > 0) {
    mods.push(`${u.damage} dmg`);
  }
  const modStr = mods.length ? ` [${mods.join(", ")}]` : "";
  return `${u.id} (${u.side}): printed ${u.printedMight} Might → effective ${u.effectiveMight}${modStr}, ${where}, alive`;
}

function deaths(run: RunResult): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of run.allEvents) {
    if (e.kind === "death") {
      const id = e.detail.split(" ")[0]!;
      if (!seen.has(id)) {
        seen.add(id);
        out.push(e.detail);
      }
    }
  }
  return out;
}

function fizzles(run: RunResult): string[] {
  return run.allEvents.filter((e) => e.kind === "spellFizzled").map((e) => e.detail);
}

function combats(run: RunResult): { detail: string; data?: Record<string, unknown> }[] {
  return run.allEvents.filter((e) => e.kind === "combat").map((e) => ({ detail: e.detail, data: e.data }));
}

function conquers(run: RunResult): string[] {
  return run.allEvents.filter((e) => e.kind === "conquer").map((e) => e.detail);
}

/** Decide a yes/no/depends verdict heuristically from the question + outcome. */
function engineVerdict(question: string, run: RunResult): string {
  const q = question.toLowerCase();
  const finalUnits = run.finalState.units;
  const someoneDied = finalUnits.some((u) => !u.alive);
  const myUnitDied = finalUnits.some((u) => u.side === "me" && !u.alive);
  const oppUnitDied = finalUnits.some((u) => u.side === "opp" && !u.alive);
  const fizzled = run.allEvents.some((e) => e.kind === "spellFizzled");
  const costPaid = run.allEvents.some((e) => e.kind === "costPaid");

  const hasDieReplacement = run.allEvents.some((e) => e.kind === "replaceDeath");

  // Compound "does my unit die AND does <spell> still resolve / go through"
  // (e.g. Sacrifice + Stupefy / Sacrifice + Tactical Retreat): a cost-paid kill
  // means the spell still resolves (the cost was paid before the chain — a
  // later Reaction can't undo it). If the unit had a die-replacement, the unit
  // SURVIVES (the kill cost is replaced — but still considered paid, rule
  // 357.2.a), so the spell resolves AND the unit lives.
  if (
    /\b(die|dies|killed|destroyed)\b/.test(q) &&
    /\b(still|go through|resolve|resolves|works?|happen|value)\b/.test(q)
  ) {
    if (costPaid && hasDieReplacement && !myUnitDied) {
      return "your unit survives — the 'kill' cost is replaced (heal/exhaust/recall it instead), but a cost whose kill was replaced still counts as paid (rule 357.2.a), so the spell resolves for full value";
    }
    if (costPaid && myUnitDied) {
      return "yes — your unit dies (it's paid as the spell's additional cost, before the chain), and the spell still resolves; a later Reaction can't undo a cost already paid";
    }
    const dieWord = /\bmy\b/.test(q) ? (myUnitDied ? "your unit dies" : "your unit doesn't die") : someoneDied ? "something dies" : "nothing dies";
    const resWord = fizzled ? "the spell fizzles" : "the spell still resolves";
    return `${dieWord}; ${resWord}`;
  }

  // "does the unit die / get saved / survive" when a die-replacement is in play.
  if (hasDieReplacement && /\b(die|dies|killed|destroyed|save|saved|survive|survives|value)\b/.test(q)) {
    if (!myUnitDied && !someoneDied) {
      if (costPaid) {
        return "your unit survives AND the spell resolves for full value — the 'would die' event (here, the spell's 'kill' cost) is replaced (it's healed, exhausted, and recalled to base instead), and a cost whose kill was replaced still counts as paid (rule 357.2.a). The unit never enters the trash, so a [Deathknell] on it won't fire either (rule 808.1.d.1)";
      }
      return "no — the unit doesn't die; its 'would die' event is replaced (it's healed, exhausted, and recalled to base instead), so it never enters the trash (and a [Deathknell] on it won't fire — rule 808.1.d.1)";
    }
  }

  const survivePhrase = /\bmy\b/.test(q)
    ? myUnitDied
      ? "your unit doesn't survive"
      : "your unit survives"
    : someoneDied
      ? "not everything survives"
      : "nothing dies";

  // Compound "who wins AND does my unit survive"
  if (/\b(win|wins)\b/.test(q) && /\bsurvive|survives\b/.test(q)) {
    const conq = conquers(run)[0];
    const m = conq ? /controlled by (me|opp)/.exec(conq) : null;
    const who = m?.[1] === "me" ? "you win the battlefield" : m?.[1] === "opp" ? "the opponent wins the battlefield" : "see breakdown for the outcome";
    return `${who}; ${survivePhrase}`;
  }

  // "does my unit survive" / "does my unit die"
  if (/\bsurvive|survives\b/.test(q)) {
    if (/\bmy\b/.test(q)) {
      return myUnitDied ? "no — your unit doesn't survive" : "yes — your unit survives";
    }
    return someoneDied ? "no — not everything survives (something dies)" : "yes — it survives, nothing dies";
  }
  if (/\b(die|dies|killed|destroyed)\b/.test(q)) {
    if (/\b(opponent|opponent's|their|enemy)\b/.test(q)) {
      return oppUnitDied ? "yes — the opponent's unit dies" : "no — the opponent's unit doesn't die";
    }
    if (/\bmy\b/.test(q)) {
      return myUnitDied ? "yes — your unit dies" : "no — your unit doesn't die";
    }
    return someoneDied ? "yes — something dies" : "no — nothing dies";
  }
  if (/\b(move|moves|moved|relocat)\b/.test(q)) {
    const moved = run.allEvents.some((e) => e.kind === "move");
    const moveFailed = run.allEvents.some((e) => e.kind === "moveFailed" && /standardMove/.test(e.detail));
    if (moved) {
      return "yes — the unit moves (and a Standard Move exhausts it)";
    }
    if (moveFailed) {
      return "no — the move can't happen";
    }
  }
  if (/\b(exhaust|exhausted)\b/.test(q)) {
    const exhausted = run.allEvents.some((e) => e.kind === "exhaust" || (e.kind === "move"));
    return exhausted ? "yes — the unit is exhausted" : "see breakdown";
  }
  if (/\b(recall|recalled|flash)\b/.test(q) && /\bbase\b/.test(q)) {
    if (run.allEvents.some((e) => e.kind === "recall")) {
      return "yes — the unit is recalled to base (it leaves any combat it was in; a recall isn't a Move, so it doesn't exhaust)";
    }
  }
  if (/\b(gain|gains|granted|keyword|tank|assault|shield|backline)\b/.test(q)) {
    const granted = run.allEvents.filter((e) => e.kind === "grantKeyword");
    if (granted.length) {
      return `yes — ${granted.map((e) => e.detail).join("; ")}`;
    }
  }
  if (/\b(valid target|target)\b/.test(q)) {
    return fizzled ? "no — not a valid target (the spell fizzles)" : "yes — it's a valid target";
  }
  if (/\b(still|go through|resolve|resolves|works?|happen)\b/.test(q)) {
    return fizzled ? "no — it doesn't go through (it fizzles)" : "yes — it goes through";
  }
  if (/\b(win|wins|who wins)\b/.test(q)) {
    const conq = conquers(run)[0];
    if (conq) {
      // e.g. "Battlefield bf is now controlled by me." -> "you win the battlefield (you take control of it)"
      const m = /controlled by (me|opp)/.exec(conq);
      const who = m?.[1] === "me" ? "you" : m?.[1] === "opp" ? "the opponent" : "see breakdown";
      return `${who} win${who === "you" ? "" : "s"} the battlefield — see breakdown`;
    }
    const combat = combats(run)[0];
    return combat ? `see breakdown — ${combat.detail}` : "no combat occurred";
  }
  return "see breakdown";
}

function engineNarrative(run: RunResult): string {
  const lines: string[] = [];
  for (const cp of run.allEvents.filter((e) => e.kind === "costPaid")) {
    lines.push(`• ${cp.detail}`);
  }
  for (const f of fizzles(run)) {
    lines.push(`• ${f}`);
  }
  for (const it of run.allEvents.filter((e) => e.kind === "illegalTarget")) {
    lines.push(`• ${it.detail}`);
  }
  for (const gk of run.allEvents.filter((e) => e.kind === "grantKeyword")) {
    lines.push(`• ${gk.detail}`);
  }
  for (const pc of run.allEvents.filter((e) => e.kind === "playCard")) {
    lines.push(`• ${pc.detail}`);
  }
  for (const pf of run.allEvents.filter((e) => e.kind === "playFailed")) {
    lines.push(`• ${pf.detail}`);
  }
  for (const rc of run.allEvents.filter((e) => e.kind === "recall")) {
    lines.push(`• ${rc.detail}`);
  }
  for (const rd of run.allEvents.filter((e) => e.kind === "replaceDeath")) {
    lines.push(`• ${rd.detail}`);
  }
  for (const dr of run.allEvents.filter((e) => e.kind === "deathReplaced")) {
    lines.push(`• ${dr.detail}`);
  }
  for (const c of combats(run)) {
    lines.push(`• ${c.detail}`);
  }
  for (const d of deaths(run)) {
    lines.push(`• ${d}`);
  }
  for (const cq of conquers(run)) {
    lines.push(`• ${cq}`);
  }
  for (const w of run.allEvents.filter((e) => e.kind === "win")) {
    lines.push(`• ${w.detail}`);
  }
  if (lines.length === 0) {
    for (const e of run.allEvents) {
      lines.push(`• ${e.detail}`);
    }
  }
  // Final board.
  lines.push("Final board:");
  for (const u of run.finalState.units) {
    lines.push(`  ${unitLine(u)}`);
  }
  for (const b of run.finalState.battlefields) {
    lines.push(`  Battlefield ${b.id}: controller=${b.controller ?? "uncontrolled"}${b.contested ? " (still contested)" : ""}`);
  }
  if (run.finalState.winner) {
    lines.push(`  Game winner: ${run.finalState.winner}`);
  }
  return lines.join("\n");
}

/**
 * Confidence for an engine answer. The engine is exact on the mechanics it
 * models, but the *Scenario* may rest on assumptions/stand-ins. Heuristic:
 *  - synthesized stand-in cards or premise notes about un-modeled mechanics
 *    => medium; otherwise high.
 */
function engineConfidence(run: RunResult): Confidence {
  const notes = run.built.buildNotes.join(" ").toLowerCase();
  const pnote = (run.built.scenario.premise?.notes ?? "").toLowerCase();
  const flags = [
    "not modeled",
    "not model",
    "out of",
    "approximat",
    "limitation",
    "mismatch",
    "stand-in",
    "synthesized",
    "assumed",
    "not the real",
  ];
  if (flags.some((f) => notes.includes(f) || pnote.includes(f))) {
    return "medium";
  }
  return "high";
}

export function engineAnswer(run: RunResult): UnifiedAnswer {
  const assumptions: string[] = [];
  for (const n of run.built.buildNotes) {
    assumptions.push(n);
  }
  if (run.built.scenario.assumptions) {
    assumptions.push(...run.built.scenario.assumptions);
  }
  if (run.built.scenario.premise?.notes) {
    assumptions.push(`Premise note: ${run.built.scenario.premise.notes}`);
  }
  return {
    verdict: engineVerdict(run.built.scenario.question, run),
    reasoning: engineNarrative(run),
    assumptions,
    confidence: engineConfidence(run),
    source: "engine",
  };
}

// ===========================================================================
// Track B — rules-reasoning -> UnifiedAnswer
// ===========================================================================

export function rulesReasoningAnswer(scenario: Scenario): UnifiedAnswer {
  const ra = scenario.rulesAnswer;
  if (!ra) {
    // Fail-safe: even with no authored rules answer we must say *something*.
    return {
      verdict: "uncertain — the rules don't clearly settle this",
      reasoning:
        `No rules-reasoning answer was authored for this ${scenarioKind(scenario)} question. ` +
        `The most consistent reading should be worked out from ` +
        `riftbound-rules/version-2026-03-30/ — treat this as a placeholder.` +
        (scenario.whatsUnsupported ? `\nEngine can't model: ${scenario.whatsUnsupported}.` : ""),
      assumptions: scenario.assumptions ?? [],
      confidence: "low/guess",
      source: "rules-reasoning",
    };
  }
  const assumptions: string[] = [];
  if (scenario.assumptions) {
    assumptions.push(...scenario.assumptions);
  }
  if (ra.assumptions) {
    assumptions.push(...ra.assumptions);
  }
  if (scenario.whatsUnsupported) {
    assumptions.push(`Outside the engine's scope (${scenario.whatsUnsupported}) — this answer is rules-text reasoning, not an engine computation.`);
  }
  return {
    verdict: ra.verdict,
    reasoning: ra.reasoning,
    assumptions,
    confidence: ra.confidence,
    conditionalCases: ra.conditionalCases,
    cites: ra.cites,
    source: "rules-reasoning",
  };
}

// ===========================================================================
// Conditional answers — combine variant answers
// ===========================================================================

function looseConfidence(cs: Confidence[]): Confidence {
  if (cs.includes("low/guess")) {
    return "low/guess";
  }
  if (cs.includes("medium")) {
    return "medium";
  }
  return cs.length ? "high" : "medium";
}

export function conditionalAnswer(
  scenario: Scenario,
  variantAnswers: { label: string; answer: UnifiedAnswer }[],
): UnifiedAnswer {
  const cases = variantAnswers.map((v) => ({
    condition: v.label,
    outcome: `${v.answer.verdict}${v.answer.reasoning ? ` — ${firstLine(v.answer.reasoning)}` : ""}`,
  }));
  const allDistinct = new Set(variantAnswers.map((v) => v.answer.verdict.toLowerCase()));
  const verdict =
    allDistinct.size <= 1
      ? `${variantAnswers[0]?.answer.verdict ?? "see cases"} (same across all readings)`
      : "depends — see cases";
  const reasoning = variantAnswers
    .map((v) => `▸ If ${v.label}:\n${indent(v.answer.reasoning, 2)}`)
    .join("\n\n");
  const assumptions: string[] = [];
  if (scenario.assumptions) {
    assumptions.push(...scenario.assumptions);
  }
  // Dedupe variant assumptions.
  const seen = new Set(assumptions);
  for (const v of variantAnswers) {
    for (const a of v.answer.assumptions) {
      if (!seen.has(a)) {
        seen.add(a);
        assumptions.push(a);
      }
    }
  }
  const sources = new Set(variantAnswers.map((v) => v.answer.source));
  const source: UnifiedAnswer["source"] =
    sources.size === 1 ? [...sources][0]! : "engine+rules";
  return {
    verdict,
    reasoning,
    assumptions,
    confidence: looseConfidence(variantAnswers.map((v) => v.answer.confidence)),
    conditionalCases: cases,
    cites: variantAnswers.flatMap((v) => v.answer.cites ?? []),
    source,
  };
}

function firstLine(s: string): string {
  return s.split("\n")[0]!.trim();
}
function indent(s: string, n: number): string {
  const pad = " ".repeat(n);
  return s
    .split("\n")
    .map((l) => pad + l)
    .join("\n");
}

// ===========================================================================
// Top-level: Scenario -> UnifiedAnswer (always produces one)
// ===========================================================================

export function answerScenario(scenario: Scenario): UnifiedAnswer {
  // Variant set — run each, then combine into a conditional answer.
  if (scenario.variants && scenario.variants.length > 0) {
    const variantAnswers = scenario.variants.map((v) => ({
      label: v.label,
      answer: answerScenario(v.scenario),
    }));
    return conditionalAnswer(scenario, variantAnswers);
  }

  const kind = scenarioKind(scenario);
  if (kind === "engine-scenario" || kind === "rules-demo") {
    try {
      // runScenario auto-expands a `rules-demo` into a concrete engine-scenario.
      const run = runScenario(scenario);
      return engineAnswer(run);
    } catch (err) {
      // Engine couldn't build/run — degrade to a rules-reasoning answer if one
      // was authored, else a low-confidence stub. NEVER throw out of here.
      const fallback = rulesReasoningAnswer(scenario);
      fallback.assumptions.unshift(
        `Engine run failed (${err instanceof Error ? err.message : String(err)}); fell back to rules-text reasoning.`,
      );
      if (fallback.confidence === "high") {
        fallback.confidence = "medium";
      }
      return fallback;
    }
  }
  // rules-question / out-of-engine-scope -> Track B.
  return rulesReasoningAnswer(scenario);
}

// ===========================================================================
// Render a UnifiedAnswer to clean text
// ===========================================================================

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "HIGH",
  medium: "MEDIUM",
  "low/guess": "LOW / GUESS",
};

export function renderUnifiedAnswer(scenario: Scenario, ans: UnifiedAnswer): string {
  const lines: string[] = [];
  lines.push(`Q: ${scenario.questionText}`);
  if (scenario.question && scenario.question !== scenario.questionText) {
    lines.push(`(Asking: ${scenario.question})`);
  }
  lines.push("");
  // Verdict.
  const isDepends = ans.verdict.toLowerCase().startsWith("depends") || (ans.conditionalCases && ans.conditionalCases.length > 1);
  lines.push(`${isDepends ? "It depends ⚖️" : "Answer"}: ${ans.verdict}`);
  lines.push(`Confidence: ${CONFIDENCE_LABEL[ans.confidence]}  ·  Source: ${ans.source}`);
  lines.push("");

  // Conditional cases up front (the headline for "depends" answers).
  if (ans.conditionalCases && ans.conditionalCases.length) {
    lines.push("It depends — case by case:");
    for (const c of ans.conditionalCases) {
      lines.push(`  ▸ ${c.condition}  →  ${c.outcome}`);
    }
    lines.push("");
  }

  // Reasoning.
  lines.push("Reasoning:");
  for (const l of ans.reasoning.split("\n")) {
    lines.push(`  ${l}`);
  }
  lines.push("");

  // Cites.
  if (ans.cites && ans.cites.length) {
    lines.push(`Rule cites: ${ans.cites.join(", ")}`);
    lines.push("");
  }

  // Assumptions — loud.
  if (ans.assumptions.length) {
    lines.push("⚠️ Assumed / caveats:");
    for (const a of ans.assumptions) {
      lines.push(`  • ${a}`);
    }
    lines.push("");
  }

  if (ans.confidence === "low/guess") {
    lines.push("(This is a best-effort guess — the rules don't cleanly settle it. Verify against official sources.)");
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

/** Convenience: Scenario -> rendered always-answer text. */
export function renderScenarioAnswer(scenario: Scenario): string {
  return renderUnifiedAnswer(scenario, answerScenario(scenario));
}

// ===========================================================================
// Backward-compat: the old Track-A-only renderer (Scenario already run).
// ===========================================================================

export function renderAnswer(run: RunResult): string {
  return renderUnifiedAnswer(run.built.scenario, engineAnswer(run));
}
