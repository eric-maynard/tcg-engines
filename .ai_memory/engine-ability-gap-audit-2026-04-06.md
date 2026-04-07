# Engine Ability Gap Audit

**Date**: 2026-04-06
**Scope**: All 4 card sets (OGN, OGS, SFD, UNL) vs riftbound-engine implementation
**Total cards**: ~775 across sets | **Total parsed abilities**: 1,192 | **Unparsed abilities**: 484 (40.6%)

---

## Executive Summary

The engine has solid support for core mechanics (draw, damage, kill, buff, stun, recall, counter, tokens, combat) but is missing several systems required by existing card text. The Unleashed (UNL) set introduced three entirely new subsystems — **XP, Level, and Hunt** — that have zero engine support. Additionally, ~484 abilities across all sets parse to empty `{ type: "sequence", effects: [] }` stubs, meaning the parser recognized them but couldn't produce executable structures.

**Severity tiers:**

| Tier | Description | Count |
|------|-------------|-------|
| **P0 — New Subsystem** | Requires new state, new effects, new conditions | 3 systems |
| **P1 — Missing Effect Type** | Engine switch/case needed in effect-executor | 6 types |
| **P2 — Missing Condition/Mechanic** | Static ability evaluator or move validator gap | 5 mechanics |
| **P3 — Parser Gap** | Parser can't produce structured abilities for known patterns | 484 abilities |

---

## P0 — New Subsystems Required

### 1. XP System (43 cards, UNL-exclusive)

**What it is**: A per-player resource counter. Cards gain XP for the player via effects ("gain 2 XP"), and XP can be spent as costs ("Spend 3 XP"). XP persists across turns.

**What's missing**:
- `PlayerState.xp: number` — no field exists (only `id` and `victoryPoints`)
- `gain-xp` effect type in `effect-executor.ts` — not in the switch statement
- `spend-xp` effect/cost type — no mechanism to deduct XP
- `xp-this-turn` tracking — at least 1 card checks "If you've gained XP this turn"
- No game event for XP gain (needed for triggers like "when you gain XP")

**Card count by mechanic**:
- "gain N XP" effects: 29 cards
- "spend N XP" costs: 11 cards
- "gained XP this turn" conditions: 1 card
- Total unique cards using XP: 43

**Example cards**: Herald of Spring ("When you play me, gain 2 XP"), Safety Inspector ("You may spend 3 XP as an additional cost"), Stalking Wolf ("If you've gained XP this turn, I have +1 Might")

### 2. Level Conditions (14 cards, UNL-exclusive)

**What it is**: A static condition checking the player's XP total. `[Level 6]` means "While you have 6+ XP, get this effect." Levels are thresholds, not separate state — they're XP checks.

**What's missing**:
- No `while-level` or `while-xp-gte` condition type in `static-abilities.ts` `evaluateCondition()`
- Parser produces Level abilities as `type: "static"` but with empty effect sequences — the condition is not structured
- Level thresholds used: 3, 6, 11, 16

**Example cards**: Combat Experience ("[Level 6] Give it +3 Might this turn instead"), Atakhan ("[Level 3] I cost 2 less... [Level 6] I cost 4 less... [Level 11] I cost 6 less... [Level 16] I can't be chosen")

### 3. Hunt Keyword (12 cards, UNL-exclusive)

**What it is**: A triggered keyword — "When I conquer or hold, gain N XP." Hunt N is stackable.

**What's missing**:
- `KEYWORD_DEFINITIONS.Hunt` exists but has `ruleNumber: 0` and no implementation
- No trigger wiring — Hunt should fire on `conquer` and `hold` events for the card's controller
- No effect executor for Hunt (should call `gain-xp` with the Hunt value)
- Depends on XP system existing first

**Example cards**: Scorchclaw ("[Hunt 2]"), Gustwalker ("[Hunt 3]"), Wuju Apprentice ("[Hunt]")

---

## P1 — Missing Effect Types in Engine

These effects appear in card text and are parsed (or attempted) but have no `case` in `effect-executor.ts`:

### 4. Cost Reduction / Cost Modification (18 cards across OGN/SFD/UNL)

**What it is**: Cards that reduce their own cost or other cards' costs. "This costs [2] less", "I cost [2][calm] less", "The next spell you play costs [5] less."

**What's missing**:
- No `cost-reduction` effect type
- No mechanism to apply temporary cost modifiers to cards in hand
- No way to track "next spell costs less" state
- `deductCost()` in `cards.ts` reads base cost from registry with no modifier layer

**Card count**: 18 cost-reduction + 1 cost-increase = 19 total

### 5. Search Effect (deck/zone searching)

**What it is**: "Search your deck for a card with..." — requires filtering, choosing, and shuffling.

**What's missing**:
- No `search` effect type in executor
- No player choice integration for search results
- No post-search shuffle trigger

### 6. Copy Effects (5 cards)

**What it is**: "Copy a spell", "Create a copy of a unit" — duplicating card instances.

**What's missing**:
- No `copy` effect type
- No mechanism to clone card definitions at runtime
- Cards: Svellsongur, Reflection, Zilean, Deceiver, Mirror Image

### 7. Predict Keyword (6 cards, UNL-exclusive)

**What it is**: "Look at the top N cards of your Main Deck. Recycle any number, put the rest back in any order."

**What's missing**:
- Not in `KEYWORD_DEFINITIONS`
- No effect type for "look + recycle + reorder" composite
- Parser recognizes it on 4/6 cards but can't produce executable effects for all
- Cards: Dramatic Visionary, Eclipse, Diana Lunari, Abandon, Scryer's Bloom, Forgotten Library

### 8. Repeat Mechanic (24 cards, SFD/UNL)

**What it is**: "[Repeat] [2] — You may pay the additional cost to repeat this spell's effect." Allows paying extra to duplicate the effect.

**What's missing**:
- Parser produces `repeat` structures on most cards
- Engine has `do-times` effect but no `repeat` cost integration
- No mechanism for "you may pay X to repeat" player choice during resolution
- Requires cost-payment integration mid-resolution

### 9. Ambush Keyword (12 cards)

**What it is**: "Can be played as a Reaction to a battlefield where you have units" — a unit with Reaction-like timing.

**What's missing**:
- `KEYWORD_DEFINITIONS.Ambush` exists but has `ruleNumber: 0`
- No validation logic in move validators to allow Ambush units as reactions
- No timing check integration (should bypass Action-only restriction)

---

## P2 — Missing Conditions & Mechanics

### 10. Additional Cost System (48 cards across all sets)

**What it is**: "As an additional cost, you may exhaust/discard/pay..." — optional or mandatory extra costs beyond the card's base energy cost.

**What's missing**:
- No additional cost tracking on card play
- No "if you paid the additional cost" condition evaluation
- Accelerate is implemented as a special case but generalized additional costs are not
- Affects 48 cards — the second-largest gap

### 11. "Enter Ready/Exhausted" Conditional (14 cards)

**What it is**: Static effects like "Other friendly units enter ready", "This enters exhausted", "If X, I enter ready."

**What's missing**:
- `enter-ready` effect exists in executor but is limited — no conditional entry state
- No hook in card-play flow to evaluate "should this card enter ready or exhausted" beyond Accelerate
- No mechanism for "other cards enter ready" aura

### 12. Restriction Effects (13 cards)

**What it is**: "Can't attack", "Can't be chosen by enemy spells", "Opponents can't play cards", "Hidden cards can't be revealed."

**What's missing**:
- No restriction/prohibition system
- No way to mark cards with "can't attack", "can't be targeted"
- `take-control` effect exists but is a no-op stub (comment: "needs controller tracking in core")

### 13. Play-From-Zone Effects (28 cards)

**What it is**: "Play me from your trash", "Play a unit from your deck", "Return a card from trash to hand."

**What's missing**:
- `play` effect exists but is minimal — just moves to base
- No integration with cost payment for cards played from non-hand zones
- No validation that the card is in the specified source zone
- `return-to-hand` works but `play-from-trash`/`play-from-deck` need cost+trigger integration

### 14. Conditional Effects (61 unparsed)

**What it is**: "If you control a Poro...", "If an opponent's score is within 3...", "If you've discarded this turn..."

**What's missing**:
- `conditional` effect exists in executor but always executes "then" branch
- Comment: "condition evaluation requires static ability layer"
- No turn-scoped event tracking ("have you discarded this turn?", "have you played a spell?")

---

## P3 — Parser Gaps (484 unparsed abilities)

Abilities that parse to empty `{ type: "sequence", effects: [] }` stubs, categorized:

| Category | Count | Example |
|----------|-------|---------|
| Other/complex | 146 | Multi-clause effects, unique mechanics |
| Conditional logic | 61 | "If X, then Y" patterns |
| Might-related | 41 | "+N Might" in non-standard contexts |
| Cost reduction | 34 | "costs N less" |
| Additional costs | 28 | "as an additional cost" |
| XP-related | 20 | "gain N XP", "spend N XP" |
| Control effects | 19 | battlefield/unit control interactions |
| Resource generation | 18 | "[Add] [rune]" in non-standard contexts |
| Draw (conditional) | 18 | "if X, draw N" |
| Reveal effects | 16 | "reveal hand", "reveal top card" |
| Play-from-zone | 15 | "play from trash/deck" |
| Enter ready/exhausted | 14 | "enters ready/exhausted" conditions |
| Grant-keyword | 13 | keyword grants in complex contexts |
| Restrictions | 13 | "can't attack", "can't be chosen" |
| Pay-cost patterns | 11 | "pay X to Y" activated abilities |
| Level checks | 7 | Level N threshold effects |
| Scoring | 7 | conditional scoring |
| Copy | 3 | card/spell copying |

---

## Engine Support Matrix

### Fully Implemented Effects (34 cases in executor)
draw, damage, kill, buff, score, channel, ready, exhaust, stun, recall, discard, return-to-hand, modify-might, heal, grant-keyword, grant-keywords, add-resource, banish, counter, create-token, attach, detach, sequence, conditional (stub), optional (auto-apply), choice (first-option), for-each, do-times, fight, play, look (no-op), reveal (no-op), prevent-damage, take-control (no-op), enter-ready

### Fully Implemented Keywords (17 defined)
Accelerate, Action, Ambush (definition only), Assault, Backline, Deathknell, Deflect, Ganking, Hidden, Hunt (definition only), Legion, Reaction, Shield, Tank, Temporary, Vision, Weaponmaster

### Implemented Trigger Events (23)
play-self, attack, defend, conquer, hold, die, move, take-damage, play-spell, discard, draw, channel-rune, buff, start-of-turn, end-of-turn, become-mighty, heal, stun, grant-keyword, play-card, win-combat, choose, hide

### Implemented Static Conditions (13)
while-at-battlefield, while-mighty, while-buffed, while-damaged, while-ready, while-exhausted, while-alone, while-equipped, control-battlefield, attacking, defending, in-combat, and/or/not combinators

---

## Recommended Implementation Priority

### Phase 1: XP Subsystem (blocks 43 UNL cards)
1. Add `xp: number` to `PlayerState`
2. Add `gain-xp` effect to executor
3. Add `spend-xp` effect/cost mechanism
4. Add `while-level` condition to static-abilities (`xp >= threshold`)
5. Wire Hunt keyword to conquer/hold triggers → gain-xp
6. Add Predict keyword implementation
7. Add `xp-gained-this-turn` tracking + condition

### Phase 2: Cost System Overhaul (blocks ~67 cards)
1. Cost modification layer in `deductCost()`
2. Additional cost framework (beyond Accelerate)
3. "If you paid the additional cost" condition tracking
4. Repeat mechanic (pay-to-repeat during resolution)

### Phase 3: Missing Effects (blocks ~46 cards)
1. Search effect (deck filtering + player choice + shuffle)
2. Copy effect (card instance cloning)
3. Restriction system ("can't attack", "can't be targeted")
4. Conditional effect evaluation (replace always-then stub)
5. Turn-scoped event tracking ("discarded this turn", "played spell this turn")

### Phase 4: Parser Improvements (unblocks 484 abilities)
1. XP/Level/Hunt pattern recognition
2. Cost reduction/increase patterns
3. Complex conditional patterns
4. Play-from-zone patterns
5. Resource generation patterns
