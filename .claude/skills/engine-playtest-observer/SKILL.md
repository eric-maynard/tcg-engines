---
name: engine-playtest-observer
description: Play full Riftbound games via bots, then have rule-expert observer agents watch the traces for rules violations and a coverage spectator flag cards that were never playable / had wrong costs. Use to find engine bugs that static per-rule tests miss (interaction bugs, unplayable cards, cost errors).
---

# Engine Playtest Observer

Unlike `engine-rules-audit` (one synthetic test per rule), this skill **plays real games** and has independent observers judge the traces. It catches two classes of bug the static audit can't:

1. **Rules violations in emergent play** — e.g. a chain resolves in the wrong order only when a specific trigger stacks with a showdown.
2. **Absence bugs** — a card is never offered as playable, or is offered at the wrong cost. A rule-observer won't see an illegal play that never happened; the coverage spectator does.

## Workflow

### Phase 1 — Trace generation (script)

```bash
bun packages/riftbound-engine/src/testing/playtest/game-tracer.ts \
  --games 10 --max-turns 30 --out /tmp/playtest-traces
```

Plays N bot-vs-bot games with varied seeds and deck compositions. For each decision point emits one JSONL line:

```json
{"seq":42,"turn":3,"phase":"main","player":"p1",
 "available":[{"moveId":"playUnit","params":{"cardId":"OGN-101","cost":{"energy":3}}},…],
 "chosen":{"moveId":"playUnit","params":{"cardId":"OGN-101"},"success":true},
 "state":{"vp":{"p1":2,"p2":1},"runePools":{…},"hand":{"p1":["…"],…},"board":{…}}}
```

Output: `/tmp/playtest-traces/game-<seed>.jsonl` × N, plus `decks.json` listing every card id in the decks used.

### Phase 2 — Coverage spectator (script)

```bash
bun packages/riftbound-engine/src/testing/playtest/coverage-check.ts /tmp/playtest-traces
```

Mechanical scan across all traces:
- **never-playable**: card was in a deck, appeared in hand, but never in `available` as a play* move → engine gap or validator bug.
- **cost-mismatch**: `available[].params.cost` ≠ card's printed cost (accounting for cost-modification effects logged in state).
- **never-drawn**: card in deck never reached hand across all games → deck-builder or draw bug (or just variance; flag only if 0/N with N≥10).
- **move-failed**: `chosen.success=false` — engine rejected a move it enumerated as valid.

Output: `/tmp/playtest-traces/coverage.json`.

### Phase 3 — Rule observers (agents, parallel)

For each trace (or trace × rule-section), spawn an observer agent with:
- `.claude/skills/riftbound-rules/DIGEST.md` (~4 KB)
- The trace file
- `references/observer-prompt.md`
- Instruction to use `bun .claude/skills/riftbound-rules/scripts/rule.ts <id>` for any specific rule

Each observer returns `[{seq, ruleId, severity, violation, evidence}]`. Observers do **not** read the 172 KB reference chunks — digest + `rule.ts` only.

Assign each observer one or two rule sections (§5 turn structure, §6 chain, §9 combat, …) so it looks up only rules in its lane.

### Phase 4 — Merge & report

Aggregate coverage.json + all observer findings → `/tmp/playtest-report.md`:
- Absence bugs (from spectator) ranked by how many decks/games they blocked
- Rules violations (from observers) deduped by `ruleId`, with the first trace seq that triggered each
- For each finding: pointer into `packages/riftbound-engine/src/<dir>/` per the DIGEST section→dir map

## When to use vs. `engine-rules-audit`

| | engine-rules-audit | engine-playtest-observer |
|---|---|---|
| Input | one synthetic state per rule | full bot-played games |
| Catches | rule X is implemented wrong | rule X is violated in real play; card Y is unplayable |
| Misses | interaction bugs; absence bugs | rules never exercised by the bot's play pattern |
| Cost | cheap, deterministic | ~N games × K observers |

Run both. Audit first (fixes obvious per-rule bugs), then observer (finds what's left).

## References

- `references/observer-prompt.md` — the prompt each rule-observer agent gets
- `../riftbound-rules/DIGEST.md` — rules overview every observer loads
- `../riftbound-rules/scripts/rule.ts` — the lookup CLI
- `packages/riftbound-engine/src/testing/playtest/{game-tracer,coverage-check}.ts`
