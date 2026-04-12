# Parser: Modify-Might and Buff Pattern Improvements

## Context

| Field | Value |
|-------|-------|
| **Date Started** | 2026-04-11 |
| **Branch** | `main` |
| **Related Issues** | Buff/modify-might parser gaps |
| **Author** | AI Agent (Claude) |

## Problem Statement

The Riftbound card parser failed to parse 48+ cards with buff/modify-might patterns, and 40+ cards had raw (unparsed) effects for buff/might text. Key issues:
- `[Exhaust]`, `[N]`, `[fury]` etc. bracket tokens not normalized to `:rb_X:` format before parsing
- 20+ missing trigger patterns (e.g., "When I attack or defend,", "When you play a unit,")
- Buff parser didn't handle state filters like "exhausted"
- No support for "Spend N XP:" activated ability cost pattern
- Static "I have +N :rb_might: while CONDITION" not parsed

## Implementation Log

### 2026-04-11

- [x] Expanded `normalizeTokens()` to convert `[Exhaust]`->`rb_exhaust:`, `[N]`->`rb_energy_N:`, `[fury]`->`rb_rune_fury:` etc.
- [x] Moved `normalizeTokens()` call to top of `parseAbilities()` so all parsing benefits from normalization
- [x] Added 20+ new trigger patterns to TRIGGER_PATTERNS array
- [x] Expanded buff parser regex to handle "an exhausted friendly unit" and similar state filters
- [x] Added "Spend N XP:" / "Spend my buff:" activated ability cost pattern
- [x] Added "I have +N :rb_might: while CONDITION" static parser pattern
- [x] Improved "If CONDITION, I have +N :rb_might: and [KEYWORD]" to fall back to custom condition and parse keywords
- [x] Added `Spend ` to `splitOnAbilityBoundaries` boundary pattern
- [x] Fixed `splitOnAbilityBoundaries` to handle `.\s?:rb_` for newline splits
- [x] Wrote 23 tests in `modify-might.test.ts` -- all passing
- [x] Result: 513 -> 636 cards with abilities (+123 cards, 24% improvement)
- [x] Pre-existing test failures reduced from 44 to 13 (no new regressions)

## Status

- [x] Memory Bank created
- [x] Implementation complete
- [x] Tests passing (new tests: 23/23, no new failures)
