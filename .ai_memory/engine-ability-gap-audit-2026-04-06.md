# Engine Ability Gap Audit (Post-Implementation)

**Date**: 2026-04-06
**Scope**: All 4 card sets (OGN, OGS, SFD, UNL) vs riftbound-engine
**Previous audit**: Identified XP system, cost system, and missing effects as top gaps
**Status**: XP, cost modification, restrictions, and keyword additions now merged to main

---

## Summary

| Metric | Count |
|--------|-------|
| Total cards | 769 |
| Total abilities | 1,192 |
| Keywords (always work) | 424 |
| Parsed with effects | 300 |
| **Empty stubs (unparsed)** | **468** |
| Non-keyword parse rate | **39.1%** |

| Card Status | Count |
|-------------|-------|
| Fully working | 338 (44%) |
| Partially working | 38 (5%) |
| **Not working** | **379 (50%)** |

### Per-Set Breakdown

| Set | Cards | Non-KW Parsed | Stubs | Parse Rate |
|-----|-------|---------------|-------|------------|
| OGN | 298 | 129 | 148 | 47% |
| OGS | 24 | 13 | 9 | 59% |
| SFD | 222 | 80 | 144 | 36% |
| UNL | 225 | 78 | 167 | 32% |

---

## Engine Support: What's Implemented

### Effect Types (46 in executor)
draw, damage, kill, buff, score, channel, ready, exhaust, stun, recall, discard, return-to-hand, modify-might, heal, grant-keyword, grant-keywords, add-resource, banish, counter, create-token, attach, detach, sequence, conditional, optional, choice, for-each, do-times, fight, play, look, reveal, prevent-damage, take-control, enter-ready, cost-reduction, cost-increase, additional-cost, gain-xp, spend-xp, predict, add-restriction, remove-restriction

### Keywords (18 defined)
Accelerate, Action, Ambush, Assault, Backline, Deathknell, Deflect, Ganking, Hidden, Hunt, Legion, Predict, Reaction, Shield, Tank, Temporary, Vision, Weaponmaster

### Static Conditions (25)
while-at-battlefield, while-mighty, while-buffed, while-damaged, while-ready, while-exhausted, while-alone, while-equipped, while-level, xp-gained-this-turn, event-this-turn, control-battlefield, attacking, defending, in-combat, paid-additional-cost, and, or, not, self, units, all-friendly, all-enemy, battlefield, gear

### Trigger Events (24 in EVENT_MAP)
play-self, play-card, play-spell, attack, defend, conquer, hold, die, move, take-damage, discard, draw, channel-rune, buff, start-of-turn, end-of-turn, become-mighty, heal, stun, grant-keyword, win-combat, choose, hide, gain-xp

---

## Gap 1: Missing Engine Effect Types (3 types, 31 parsed abilities)

These are effects the **parser successfully produces** but the engine **does not execute**.

### 1.1 `move` effect — 24 abilities across all sets

**What it does**: Move a unit to a specific location (usually base). Parser produces `{ type: "move", target: { type: "unit" }, to: "base" }`.

**Why it's missing**: The engine has `recall` (move to base) but not a general `move` effect that moves to an arbitrary zone. All 24 current uses move to "base", so they could be handled by aliasing `move` to `recall` in the executor, but a proper implementation should support `to: "battlefield-X"` too.

**Cards affected**: Charm, Fight or Flight, Ride the Wind, The Syren, Skyward Strike, Void Assault, and 18 more.

**Fix complexity**: Low — add `case "move"` that reads `effect.to` and calls `ctx.zones.moveCard()`.

### 1.2 `play-restriction` effect — 5 abilities

**What it does**: Constrains WHERE a card can be played. Parser produces `{ type: "play-restriction", allowedLocation: "an open battlefield" }`.

**Cards**: Deadbloom Predator, Sai Scout, Sneaky Deckhand, Miss Fortune, Dauntless Vanguard.

**Fix complexity**: Medium — needs integration with move validators in `cards.ts` to check placement restrictions.

### 1.3 `restriction` effect — 2 abilities

**What it does**: Imposes a game-wide rule. Parser produces `{ type: "restriction", restriction: "opponents can't gain points." }`.

**Cards**: Mageseeker Warden ("spells and abilities can't ready enemy units"), Tianna Crownguard ("opponents can't gain points").

**Fix complexity**: High — these are global restrictions that need a rules enforcement layer, not just card meta flags.

---

## Gap 2: Unparsed Abilities by Category (468 stubs)

These abilities have rules text that the parser recognizes but **cannot convert to structured effects**. They produce `{ type: "sequence", effects: [] }` stubs.

### Tier 1: High-volume patterns (parser improvement targets)

| Category | Count | Example | Root Cause |
|----------|-------|---------|------------|
| Complex conditionals | 65 | "If you've discarded this turn, I have..." | Parser can't handle "if X this turn" conditions |
| Uncategorized/multi-clause | 63 | "Give a unit", complex resource costs | Multi-step effects with inline costs |
| Cost reduction (self) | 34 | "I cost [2] less", "reduced by highest Might" | Parser can't handle cost self-modification |
| Additional cost mechanics | 28 | "As an additional cost, exhaust a unit" | No additional cost parsing pattern |
| Keyword grant (complex) | 26 | "Give a unit [Assault 3] this turn" | Parser can't handle "give X keyword Y" |

### Tier 2: Medium-volume patterns

| Category | Count | Example | Root Cause |
|----------|-------|---------|------------|
| Control effects | 22 | "Gain control of a spell", "if you control a Poro" | No control-checking condition or take-control effect |
| Might modification (complex) | 22 | "Deal damage equal to my Might", "Might increased by cards in trash" | Dynamic amount expressions not fully parsed |
| XP gain/spend | 20 | "Gain 2 XP", "Spend 3 XP" | Parser doesn't produce gain-xp/spend-xp effects |
| Restrictions/prohibitions | 19 | "Can't play cards", "doesn't take damage" | No prohibition parsing pattern |
| Resource generation | 19 | "[Reaction] — [Add] [fury]", "[Add] [1][rainbow]" | Inline resource add not fully parsed |
| Buff (conditional) | 17 | "Buff another friendly unit", "Buff an exhausted unit" | Targeted buff with conditions not parsed |
| Play from non-hand zone | 17 | "Play me from your trash", "Play top card of deck" | No play-from-zone parsing |

### Tier 3: Lower-volume patterns

| Category | Count | Example |
|----------|-------|---------|
| Exhaust effects | 15 | "Enters exhausted", "channel 1 rune exhausted" |
| Pay-to-activate | 14 | "Pay [fury] to play me", "Pay [1] to return me" |
| Enter ready/exhausted | 14 | "Other units enter ready", conditional entry state |
| Draw (conditional) | 14 | "Discard hand, draw 4", "for each player that..." |
| Reveal effects | 13 | "Reveal hand, choose a card" |
| Kill/death (conditional) | 10 | "Each player kills one gear", "kill it next time it takes damage" |
| Movement effects | 9 | "Move an enemy unit to here", "may be moved with it" |
| Level threshold | 7 | "[Level 3] I have +1 Might and..." (parser produces stub) |
| Scoring conditionals | 7 | "Might increased by your points", "increase points needed to win" |
| Damage (conditional) | 7 | "Deals 1 bonus damage", "deal that much to all enemy units" |
| Token creation (complex) | 7 | "Play four 1 Might Recruit tokens" |
| Recycle effects | 5 | "Recycle 3 from trash", "look at top 3, put 1 in hand" |
| Stun (conditional) | 3 | "Stunned units have -8 Might" |
| Counter (complex) | 2 | "Counter spell that chooses a friendly unit" |
| Equipment mechanics | 2 | "Equipment give double Might bonus" |
| Copy/clone | 1 | "Play a copy of the token" |
| Discard (conditional) | 1 | "Choose a player. They discard 1" |
| Look/predict | 1 | "[Predict 2]" (Deathknell trigger) |

---

## Gap 3: Engine Stubs (implemented but non-functional)

These effects exist in the engine switch statement but don't fully work:

| Effect | Issue |
|--------|-------|
| `take-control` | No-op — comment says "needs controller tracking in core" |
| `look` | No-op — informational only, no UI integration |
| `reveal` | No-op — informational only |
| `predict` | No-op — needs UI for player choice |
| `conditional` | Improved but `controls-unit` only checks base zone, not battlefields |
| `choice` | Always picks first option — needs UI input |
| `optional` | Always auto-applies — needs UI opt-in/out |

---

## Recommended Next Steps

### Phase 1: Quick wins — add `move` effect (unblocks 24 parsed abilities)

Add `case "move"` to effect-executor. All 24 current uses move to "base" so this is nearly identical to `recall`. Implementation: 10 lines.

### Phase 2: Parser improvements (unblocks ~300 of 468 stubs)

The engine now supports more effect types than the parser produces. These parser patterns would have immediate impact:

| Parser Pattern | Stub Count | Engine Support |
|----------------|-----------|----------------|
| "give a unit [Keyword N]" → grant-keyword | 26 | Yes |
| "gain N XP" → gain-xp | 20 | Yes |
| "I cost [N] less" → cost-reduction (self) | 34 | Yes |
| "[Add] [rune]" → add-resource | 19 | Yes |
| "buff another/a friendly unit" → buff with target | 17 | Yes |
| "[Level N] I have..." → static with while-level condition | 7 | Yes |
| Complex conditional patterns | 65 | Partial |
| Additional cost patterns | 28 | Yes |
| "enters exhausted/ready" patterns | 14 | Yes |
| Play-from-zone patterns | 17 | Partial |

**Estimated unlock: ~247 abilities could become functional with parser-only work.**

### Phase 3: Engine additions needed for remaining gaps

| Feature | Abilities Blocked | Complexity |
|---------|------------------|------------|
| `play-restriction` effect | 5 | Medium |
| Global `restriction` enforcement | 2 + 19 prohibition stubs | High |
| Controller tracking (`take-control`) | 3 + 22 control stubs | High |
| Dynamic amount expressions (Might-based, trash-count-based) | 22 | Medium |
| "Next time X happens" deferred triggers | ~10 | High |
| Player choice UI integration (choice, optional, predict) | ~30 | High (UI) |
| Search deck effect | ~5 | Medium |
| Copy/clone cards at runtime | ~5 | High |

---

## Bottom Line

- **338 cards (44%) fully work** — all effects parsed and engine-supported
- **31 parsed abilities** need 3 engine effect types added (mainly `move`)
- **~247 stub abilities** could work with parser improvements alone (engine already supports them)
- **~220 stub abilities** need both parser AND engine work
- **Biggest ROI**: Parser improvements for grant-keyword, cost-reduction, gain-xp, add-resource, and buff patterns
