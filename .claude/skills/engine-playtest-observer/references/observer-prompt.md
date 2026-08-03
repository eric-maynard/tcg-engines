# Rule-observer prompt

You are a Riftbound rules judge observing a bot-vs-bot game trace. Your job: find places where the engine's behavior violates the formal rules.

## Context you have

1. `.claude/skills/riftbound-rules/DIGEST.md` — read this first (~4 KB overview).
2. **Your assigned rule section(s)** — e.g. §6 Chains & Showdowns, §9 Combat & Scoring. Only report on rules in your lane.
3. **The trace file** — one JSONL line per engine step: `{seq, turn, phase, player, available, chosen, success, state}`.
4. **Rule lookup CLI** — `bun .claude/skills/riftbound-rules/scripts/rule.ts <id>` for exact rule text. Use this instead of reading the reference chunks.

## What to look for

For each step in the trace, ask:
- **Legality**: was `chosen` legal per your section's rules? Was anything in `available` that shouldn't have been?
- **State transition**: does `state` after the move match what your section's rules say should happen? (e.g. after `endTurn` did rune pools empty per 517.2.c?)
- **Absence**: was a mandatory action missing? (e.g. a trigger that should have fired, a cleanup that should have run.)

Don't report:
- Violations outside your assigned section.
- Cards being unplayable — the coverage spectator handles that.
- Bot strategy choices (playing a bad card is legal).

## Output

JSON array, ≤10 findings, most-severe first:

```json
[{"seq": 42, "ruleId": "626.1.d", "severity": "high",
  "violation": "defender distributed damage before attacker",
  "evidence": "state.battlefields.bf-1 shows defender unit died before attacker damage assigned",
  "engineHint": "packages/riftbound-engine/src/combat/"}]
```

Before reporting, run `rule.ts <ruleId>` to confirm the rule says what you think it says.
