---
name: riftbound-rules
description: Riftbound TCG rules reference for engine work. Loads a compact digest and provides a `rule.ts` CLI for on-demand lookup of specific numbered rules — use it instead of reading the full reference chunks.
---

# Riftbound Rules

**Read `DIGEST.md` first** (in this directory) — it's the ~4 KB overview: section map, turn phases/states, load-bearing definitions, and common traps.

## Looking up a specific rule

Never read `references/*_Riftbound_Core_Rules_*.md` directly (~43k tokens). Use the CLI, which reads the pre-built `rules-db.json` (1364 rules):

```bash
bun .claude/skills/riftbound-rules/scripts/rule.ts 626           # rule 626 and all 626.* sub-rules
bun .claude/skills/riftbound-rules/scripts/rule.ts 515.4.d       # one rule + its "See rule NNN" xrefs
bun .claude/skills/riftbound-rules/scripts/rule.ts 515.4.d --tree  # + xrefs-of-xrefs
bun .claude/skills/riftbound-rules/scripts/rule.ts --grep "rune pool"
bun .claude/skills/riftbound-rules/scripts/rule.ts --section 9   # all Combat & Scoring rules
bun .claude/skills/riftbound-rules/scripts/rule.ts --range 620-633
bun .claude/skills/riftbound-rules/scripts/rule.ts --list        # section map
```

Cite rule numbers in code, tests, and PR descriptions (e.g. `// Rule 626.1.d: attacker distributes first`).

## Rebuilding the DB

`rules-db.json` is generated from the reference chunks. If those change (new rules PDF), rebuild:

```bash
bun .claude/skills/riftbound-rules/scripts/build-rules-db.ts
```

## Fallback references

Only when the CLI + digest aren't enough:
- `indexes/by-topic/*.md` — grouped by player-facing question
- `indexes/by-section/*.md` — grouped by rule-number section
- `references/*_Riftbound_Core_Rules_*.md` — full text (last resort)
