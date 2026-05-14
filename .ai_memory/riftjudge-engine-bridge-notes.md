# riftjudge-engine-bridge — notes

New skill at `.claude/skills/riftjudge-engine-bridge/` (SKILL.md + scripts/ +
examples/). 4-stage pipeline: NL Riftbound rules question → structured `Scenario`
(hand-authored by an LLM per SKILL.md; TS schema in `scripts/scenario-schema.ts`)
→ engine `GameState` + ordered engine moves (`scripts/build-scenario.ts`, reuses
the rules-audit `helpers.ts` — `createMinimalGameState`/`createCard`/
`createBattlefield`) → run via real engine moves (`modifyBuff`, `addBuff`,
`addDamage`, `killUnit`, `drawCard`, `resolveFullCombat`) capturing per-step
state + events → NL answer (`scripts/render-answer.ts`). Driver:
`bun .claude/skills/riftjudge-engine-bridge/scripts/run.ts <scenario.json|--demo>`.

**Robust:** combat math via `resolveFullCombat`, Might thresholds via the
engine's `computeEffectiveMight`, death/state-based checks, conquer/win outcomes,
card-name→definition lookup against `@tcg/riftbound-cards`.

**Stubbed / TODO:** Stage 1 (NL→Scenario) is fully human-in-the-loop — no parser.
`playSpell` doesn't run the real `playSpell` move or pay energy/power costs; it
applies the *resolved* effects you list + an optional precondition (e.g.
`targetMighty`). Primitive vocab is small: no movement/exhaust/keyword-grant/
replacement/chain modelling — approximate + note. Premise multi-buffs collapse to
the binary `buffed` flag.

Tested with the canonical "enemy plays Sacrifice on my 5-Might unit, I react with
Stupefy → 4 Might" question (demo): Stupefy (real OGN-095) resolves first (LIFO),
drops Might to 4, Sacrifice's "kill a Mighty unit" precondition fails → fizzles →
unit survives. (Real UNL-173 Sacrifice targets a *friendly* unit; the demo models
the asker's described interaction and flags this as a caveat.) `bun test` in
riftbound-engine: 1352 pass / 0 fail — unchanged. Build untouched (skill lives in
`.claude/`, not in any tsconfig/turbo scope).

---

## 2026-05-12 — "always answer" rewrite (two-track)

The bridge no longer punts on ~99.8% of questions. It's now a **two-track
answerer with explicit uncertainty** — every question produces a verdict +
confidence + assumptions, never "out of scope".

- **Schema** (`scripts/scenario-schema.ts`): added `kind`
  (`"engine-scenario"` | `"rules-question"` | `"out-of-engine-scope"`),
  `assumptions: string[]`, `variants: ScenarioVariant[]` (multiple concrete
  readings → conditional answer), `rulesAnswer` (LLM-authored: verdict /
  reasoning-with-rule-cites / `cites` / `confidence` "high"|"medium"|"low/guess"
  / `assumptions` / `conditionalCases`), `whatsUnsupported`, plus a
  `UnifiedAnswer` shape. `premise`/`actions` are now optional. `scenarioKind()`
  helper applies the backward-compat default (no `kind` + `premise` ⇒
  engine-scenario). Existing `examples/eval/p*.scenario.json` + `combat-math`
  still run unchanged.
- **Track A** (existing): `kind:"engine-scenario"` → build GameState, run engine,
  render. `build-scenario.ts` now emits a `death` event after *any* primitive
  that flips a unit to dead (not just addDamage/combat) — fixes the p0382
  "engine killed it but the answer text said 'nothing dies'" presentation bug.
  Dead units render as "DEAD" (their temp meta is wiped on trash).
- **Track B** (new): `rules-question` / `out-of-engine-scope` → the invoking LLM
  authors `rulesAnswer` by reasoning over `riftbound-rules/version-2026-03-30/`
  (navigate via the `riftbound-rules` skill indexes); the bridge just shapes +
  renders it. `answerScenario()` never throws — a failed engine run degrades to
  the authored `rulesAnswer` or a low-confidence stub.
- **Conditional**: `variants` → run each, stitch into "It depends — if A: …; if
  B: …".
- **Stage 4**: `render-answer.ts` rewritten — `answerScenario` /
  `renderUnifiedAnswer` / `renderScenarioAnswer` / `engineAnswer` /
  `rulesReasoningAnswer` / `conditionalAnswer`; old `renderAnswer(run)` kept.
  Output surfaces the verdict, `Confidence: … · Source: …`, "It depends" cases
  up front, reasoning, "Rule cites:", and "⚠️ Assumed / caveats:".
- **Driver**: `run.ts` auto-detects `kind`; `--suite` runs `demo-suite.ts` — 8
  hand-authored scenarios across every type. New `examples/always-answer/*.json`.
- **SKILL.md**: rewritten to document the two tracks, the kinds, the
  confidence/assumptions/conditionals model, and how an invoking LLM does Stage 1
  + Track B reasoning.

Build/test: bridge scripts run clean under `bun` (skill lives in `.claude/`,
outside any tsconfig/turbo scope — repo-wide `tsc` errors are all pre-existing in
`packages/riftbound-cards`, none in the bridge). `bun test` in `riftbound-engine`:
**1397 pass / 0 fail** — unchanged.

Still stubbed: Stage 1 + the `rulesAnswer` text are human-authored — next
iteration is a retrieval pass over the version-2026-03-30 docs to draft Track B
answers automatically (and to auto-classify `kind` / extract numbers for Track A).
