# Engine Rules Audit

Exhaustively audit the Riftbound engine against the formal rules by generating one targeted unit test per rule. This is the orchestrator for the `engine-rules-audit` skill — see `.claude/skills/engine-rules-audit/SKILL.md` for the full rationale.

**Use this instead of the visual monkey test when** you need deep rule compliance, not just "does a single goldfish game run without crashing."

## What This Produces

- A persistent test suite at `packages/riftbound-engine/src/__tests__/rules-audit/` with one test file per rules section, 300-400 tests total
- A compliance report at `/tmp/rules-audit-report.md` showing per-rule PASS/FAIL
- A failure list at `/tmp/rules-audit-failures.md` with engine bug citations (rule, expected, actual, file:line)

## Phases

### Phase 1: Rule Indexing

Launch ONE indexer agent:

**Description:** "Rules indexer - catalog every testable rule"

**Prompt:**

> You are a rules indexer for the Riftbound engine audit. Read every rules reference file and produce a structured list of testable rules.
>
> **Read these files:**
> - `/home/emaynard/tcg-engines/.claude/skills/riftbound-rules/references/01_20_Riftbound_Core_Rules_2025_06_02.md`
> - `/home/emaynard/tcg-engines/.claude/skills/riftbound-rules/references/21_40_Riftbound_Core_Rules_2025_06_02.md`
> - `/home/emaynard/tcg-engines/.claude/skills/riftbound-rules/references/41_60_Riftbound_Core_Rules_2025_06_02.md`
> - `/home/emaynard/tcg-engines/.claude/skills/riftbound-rules/references/61_65_Riftbound_Core_Rules_2025_06_02.md`
> - `/home/emaynard/tcg-engines/.claude/skills/riftbound-rules/references/riftbound-rules-video-guide.md`
>
> **Also read the rules primer:**
> `/home/emaynard/tcg-engines/.claude/skills/engine-rules-audit/references/rules-primer.md`
>
> For each rule, decide if it's **testable** (describes concrete behavior the engine either does or doesn't do) or **definitional** (defines a term, describes gameplay flavor, or overlaps entirely with another rule).
>
> Output to `/tmp/rule-index.json`:
> ```json
> {
>   "indexedAt": "2026-04-12T...",
>   "totals": { "totalRules": 412, "testable": 287, "definitional": 125 },
>   "rules": {
>     "515.4.d": {
>       "section": "Turn Structure",
>       "subsection": "Draw Phase",
>       "text": "As the Draw Phase ends, each player's Rune Pool empties.",
>       "testable": true,
>       "testType": "state-transition",
>       "complexity": "simple",
>       "relatedRules": ["159", "160.1", "517.2.c"],
>       "targetFile": "turn-structure.test.ts"
>     }
>   }
> }
> ```
>
> **testType** options: `state-transition`, `legality`, `trigger-firing`, `effect-semantics`, `invariant`
>
> **complexity** options: `simple` (one assertion), `medium` (setup + assertion), `complex` (multi-step state setup)
>
> **Assign each testable rule to one of these files** (see `.claude/skills/engine-rules-audit/references/rule-categories.md` for the full list): `fundamentals.test.ts`, `runes-and-pools.test.ts`, `turn-structure.test.ts`, `movement.test.ts`, `chain.test.ts`, `showdowns.test.ts`, `combat.test.ts`, `scoring.test.ts`, `win-conditions.test.ts`, `abilities-triggered.test.ts`, `abilities-static.test.ts`, `abilities-activated.test.ts`, `abilities-replacement.test.ts`, `keywords-simple.test.ts`, `keywords-complex.test.ts`, `playing-cards.test.ts`, `mode-specific.test.ts`
>
> Also produce a human-readable summary at `/tmp/rule-index-summary.md` showing total rules, per-section counts, and an estimate of total test count.

### Phase 2: Wave 1 — Foundations (1 agent)

After Phase 1 completes, launch ONE agent to build the helpers + foundation tests:

**Description:** "Wave 1 - helpers + foundation tests"

**Prompt:**

> You are Wave 1 of the engine rules audit. Your job is to build the shared test helpers and the foundation test files (`fundamentals.test.ts`, `runes-and-pools.test.ts`). Wave 2 agents depend on your helpers, so finish first.
>
> **Read these first:**
> - `/home/emaynard/tcg-engines/.claude/skills/engine-rules-audit/SKILL.md`
> - `/home/emaynard/tcg-engines/.claude/skills/engine-rules-audit/references/rules-primer.md`
> - `/home/emaynard/tcg-engines/.claude/skills/engine-rules-audit/references/helper-api.md`
> - `/home/emaynard/tcg-engines/.claude/skills/engine-rules-audit/references/test-template.md`
> - `/tmp/rule-index.json` (from Phase 1)
>
> **Create these files at `packages/riftbound-engine/src/__tests__/rules-audit/`:**
>
> 1. `helpers.ts` — implements the API in `helper-api.md`. Re-use existing test utilities where possible.
> 2. `helpers.test.ts` — meta-tests verifying the helpers produce correct states.
> 3. `fundamentals.test.ts` — tests for rules 100-152 (card types, zones, public/private info).
> 4. `runes-and-pools.test.ts` — tests for rules 153-161 (runes, rune pool, energy/power).
>
> **Critical rules to cover in `runes-and-pools.test.ts`:**
> - Rule 159 (Rune Pool is conceptual, not a card zone)
> - Rule 160 (Rune Pool empties at end of draw phase AND end of turn)
> - Rule 160.1 (unspent Energy/Power are lost)
> - Rule 154.1.a (runes remain on board until Recycled)
> - Rule 594 (Recycle action)
>
> **Do NOT touch engine source code.** If a test reveals a bug, write the test as a failing test with a comment citing the rule. Do NOT fix the engine.
>
> **Run your tests and report:** `bun test packages/riftbound-engine/src/__tests__/rules-audit/`
>
> Report how many tests you wrote, how many pass, and list any failing tests with their rule citations.

### Phase 3: Wave 2 — Main Gameplay (4 parallel agents)

Launch these FOUR agents in parallel after Wave 1 completes:

#### Agent A: Turn structure + Movement

**Description:** "Wave 2A - turn structure + movement rules"
**Prompt:** Build `turn-structure.test.ts` and `movement.test.ts` using the helpers from Wave 1. Read `/tmp/rule-index.json` for rule assignments. Cover all rules tagged with `targetFile: "turn-structure.test.ts"` or `"movement.test.ts"`. Do NOT fix engine bugs — report failing tests. Run `bun test packages/riftbound-engine/src/__tests__/rules-audit/turn-structure.test.ts` and `movement.test.ts` at the end.

#### Agent B: Chain + Triggered abilities

**Description:** "Wave 2B - chain + triggered abilities rules"
**Prompt:** Build `chain.test.ts` and `abilities-triggered.test.ts`. Cover all rules with those target files. Same rules: don't fix engine, report failures.

#### Agent C: Combat + Showdowns

**Description:** "Wave 2C - combat + showdown rules"
**Prompt:** Build `combat.test.ts` and `showdowns.test.ts`. Critical rules: 626 (combat damage), 548.2 (showdown on empty battlefield), 516.5.b (non-combat showdown), 620-629 (attack phases).

#### Agent D: Scoring + Win conditions

**Description:** "Wave 2D - scoring + win condition rules"
**Prompt:** Build `scoring.test.ts` and `win-conditions.test.ts`. Critical rules: 630-632 (conquer/hold/final point), 640-660 (victory). Pay special attention to rule 632.1.b (final point restrictions).

### Phase 4: Wave 3 — Abilities & Keywords (3 parallel agents)

Launch these THREE agents in parallel after Wave 2 completes:

#### Agent E: Static + Activated abilities

**Description:** "Wave 3E - static + activated ability rules"
**Prompt:** Build `abilities-static.test.ts` and `abilities-activated.test.ts`. Cover rule 567-568 (static/passive) and 576-582 (activated).

#### Agent F: Replacement effects

**Description:** "Wave 3F - replacement effect rules"
**Prompt:** Build `abilities-replacement.test.ts`. Cover rules 571-575. Critical: `"next"` duration (one-shot) vs `"turn"` duration (until end of turn).

#### Agent G: Keywords

**Description:** "Wave 3G - keyword rules (simple + complex)"
**Prompt:** Build `keywords-simple.test.ts` and `keywords-complex.test.ts`. Simple keywords: Tank, Shield, Assault, Deflect, Ganking, Temporary, Vision. Complex keywords: Hunt, Predict, Level, Ambush, Repeat, Hidden, Mighty, Deathknell.

### Phase 5: Wave 4 — Edge Cases (1 agent)

**Description:** "Wave 4 - playing cards + mode-specific"
**Prompt:** Build `playing-cards.test.ts` (rules 554-563) and `mode-specific.test.ts` (rules 644, 661-665 — Duel vs Match vs Skirmish differences).

### Phase 6: Compliance Report (1 agent)

**Description:** "Audit report compiler"

**Prompt:**

> You are the compliance report compiler for the engine rules audit. All test files are now written.
>
> **Run the full audit suite:**
> ```bash
> bun test packages/riftbound-engine/src/__tests__/rules-audit/ 2>&1 | tee /tmp/rules-audit-raw-output.txt
> ```
>
> **Parse the output** and for each `Rule <number>:` test, record:
> - Rule number
> - Test name
> - PASS / FAIL
> - If FAIL: the assertion error message
>
> **Cross-reference with `/tmp/rule-index.json`** to find rules that are testable but have no test yet (gap coverage).
>
> **Produce `/tmp/rules-audit-report.md`:**
>
> ```markdown
> # Riftbound Engine Rules Audit Report
>
> ## Summary
> - Rules indexed: N
> - Testable rules: N
> - Tests written: N
> - Tests passing: N (X%)
> - Tests failing: N (X%)
> - Rules not yet covered: N
>
> ## Coverage by Section
> | Section | Testable | Tested | Passing | Failing | Coverage |
> | ... |
>
> ## Failing Rules (Priority)
> ### CRITICAL (rules affecting game correctness)
> 1. Rule X.Y.Z: <one-line summary>
>    - Test: <test name>
>    - Expected: <from rule>
>    - Actual: <from failure>
>    - Rule file:line in rules reference
>    - Suspected engine file: <file:line if identifiable>
>
> ### HIGH
> ...
>
> ### MEDIUM
> ...
>
> ## Coverage Gaps
> Rules with no test:
> - Rule A.B.C (section, reason: <e.g. "no helper exists for X">)
> - ...
>
> ## Recommendations
> 1. Fix critical rule failures first (most impactful to gameplay)
> 2. Add tests for coverage gaps in next audit pass
> 3. Review any `it.todo(...)` entries for ambiguous rules
> ```
>
> **Produce `/tmp/rules-audit-failures.md`** with detailed failure info for engineers to fix each bug.
>
> Report the final numbers to the orchestrator.

## After the Audit

Review the compliance report. For each CRITICAL or HIGH failure:
1. Decide: engine bug or test bug?
2. If engine bug: file a fix PR citing the rule number
3. If test bug: fix the test and re-run

**Do NOT blindly fix failing tests** — a failing test might be catching a real rule violation. Verify each failure against the rules reference before "fixing" it.

## Integration with CI

Once the audit suite passes, add it to CI:

```bash
# In .github/workflows/ci.yml or similar
- run: bun test packages/riftbound-engine/src/__tests__/rules-audit/
```

This gates merges on rule compliance — any change that breaks a rule fails CI.
