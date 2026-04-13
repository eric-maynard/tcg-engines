# Rule Categories for Test Organization

How to group the ~400 testable rules into test files so agents can work in parallel without conflicts.

## Organization Principle

**One test file per rules section**, matching the formal rules document's section numbering. Each agent owns exactly one section, so there's no merge conflict on test file content.

Agents also share `helpers.ts` — if two agents need a helper that doesn't exist, the earlier agent adds it and the later agent uses it. This is coordinated through Phase 2's ordering.

## File Layout

```
packages/riftbound-engine/src/__tests__/rules-audit/
├── helpers.ts                    # Shared test helpers (see helper-api.md)
├── helpers.test.ts               # Meta-tests for the helpers
├── fundamentals.test.ts          # Rules 100-152 (card types, zones, public/private info)
├── runes-and-pools.test.ts       # Rules 153-161 (runes, rune pool, energy/power)
├── playing-cards.test.ts         # Rules 554-563 (play process)
├── turn-structure.test.ts        # Rules 515-517 (phases, holds, rune pool empties)
├── abilities-static.test.ts      # Rules 567-568 (passive/static)
├── abilities-triggered.test.ts   # Rules 583-585 (triggered)
├── abilities-activated.test.ts   # Rules 576-582 (activated)
├── abilities-replacement.test.ts # Rules 571-575 (replacement/intercept)
├── chain.test.ts                 # Rules 532-544 (chain, priority, LIFO)
├── showdowns.test.ts             # Rules 545-553, 548.2 (showdowns, contested)
├── combat.test.ts                # Rules 620-629 (attack, damage, assignment)
├── movement.test.ts              # Rules 608-619 (move, recall)
├── scoring.test.ts               # Rules 630-632 (conquer, hold, final point)
├── win-conditions.test.ts        # Rules 640-660 (victory, tie, burn out)
├── keywords-simple.test.ts       # Rules 594, keyword-effects for Tank/Shield/Assault/etc.
├── keywords-complex.test.ts      # Hunt/Predict/Level/Ambush/Repeat/Hidden/Mighty
└── mode-specific.test.ts         # Rules 644, 661-665 (mode-specific rules)
```

## Priority Order

Not all rules are equally important. Prioritize:

1. **Foundational rules** (fundamentals, runes-and-pools, turn-structure) — these are touched by every test, so their correctness matters most.
2. **Frequently-used rules** (combat, scoring, showdowns) — these affect every game.
3. **Chain/priority rules** — affect how abilities and spells interact.
4. **Trigger rules** — govern whether abilities fire.
5. **Keyword rules** — each keyword's specific behavior.
6. **Mode-specific and edge cases** — niche but still need coverage.

## Wave Assignment for Parallel Execution

### Wave 1 (Foundations — 1 agent, runs first)
- `helpers.ts` and `helpers.test.ts`
- `fundamentals.test.ts`
- `runes-and-pools.test.ts`

**Why first:** Helpers must exist before other agents can write tests. Foundational rules are easy wins and catch basic bugs.

### Wave 2 (Main gameplay — 4 parallel agents)
- Agent A: `turn-structure.test.ts` + `movement.test.ts`
- Agent B: `chain.test.ts` + `abilities-triggered.test.ts`
- Agent C: `combat.test.ts` + `showdowns.test.ts`
- Agent D: `scoring.test.ts` + `win-conditions.test.ts`

**Why parallel:** These sections don't share helpers beyond what Wave 1 provides, and each owns its own test file.

### Wave 3 (Abilities and keywords — 3 parallel agents)
- Agent E: `abilities-static.test.ts` + `abilities-activated.test.ts`
- Agent F: `abilities-replacement.test.ts`
- Agent G: `keywords-simple.test.ts` + `keywords-complex.test.ts`

### Wave 4 (Edge cases — 1 agent)
- `playing-cards.test.ts` + `mode-specific.test.ts`

## Coverage Targets

| Section | Target Tests | Priority |
|---------|-------------|----------|
| Fundamentals | 15-25 | Foundation |
| Runes & Pools | 10-15 | Foundation |
| Turn Structure | 30-40 | High |
| Movement | 15-20 | High |
| Chain | 20-25 | High |
| Combat | 25-35 | High |
| Showdowns | 15-20 | High |
| Scoring | 15-20 | High |
| Triggered Abilities | 20-25 | Medium |
| Static Abilities | 15-20 | Medium |
| Activated Abilities | 15-20 | Medium |
| Replacement Effects | 10-15 | Medium |
| Simple Keywords | 20-30 | Medium |
| Complex Keywords | 15-25 | Medium |
| Win Conditions | 10-15 | Low |
| Playing Cards | 15-20 | Low |
| Mode-Specific | 8-12 | Low |
| **Total** | **~300-400** | |

## Splitting Rules Across Files

Some rules span sections. When in doubt:

- **Combat damage rules (626) → `combat.test.ts`** (damage is a combat concept, even though it references movement)
- **Hold scoring (515.2.b + 632.2.b) → `scoring.test.ts`** (scoring is the primary concern; phase timing is secondary)
- **Chain priority (539-540) → `chain.test.ts`** (chain is the primary concern)
- **Showdown sub-phases (548, 516.5) → `showdowns.test.ts`**

If a rule genuinely belongs in multiple sections, put the test in the section that has the most related rules.
