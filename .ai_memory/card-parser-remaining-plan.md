# Card Parser Remaining Work Plan (Wave 3)

## Status: Planning
## Date: 2026-04-11
## Predecessor: `.ai_memory/card-ability-parser-improvement-plan.md` (Waves 1-2)

## Summary

An audit of all 769 cards found 277 cards still in a broken state (see
`/tmp/remaining-audit.ts` and `/tmp/remaining-audit-report.json`). Of the 755
cards with rules text, 478 (63.3%) parse cleanly and 277 (36.7%) are still
broken in at least one ability slot.

> Note: The task brief estimated "~128 remaining" after Wave 2. The audit
> surfaced roughly twice that number because it flags any ability tree that
> contains *any* `{type:"raw"}` node, not just completely-unparsed cards. This
> is the stricter — and more useful — definition.

### Current state by failure mode

| Status        | Count | Meaning                                                 |
|---------------|-------|---------------------------------------------------------|
| no-abilities  | 114   | Parser produced 0 abilities from non-empty rules text   |
| raw-effect    | 101   | All parsed abilities contain at least one `raw` node    |
| partial-raw   | 62    | Some abilities parsed, at least one `raw` node remains  |
| **total**     | **277** |                                                       |

### Current state by set / card type

| Set   | Broken | | Card type   | Broken |
|-------|--------|-|-------------|--------|
| UNL   | 118    | | unit        | 140    |
| OGN   | 86     | | spell       | 45     |
| SFD   | 69     | | battlefield | 38     |
| OGS   | 4      | | gear        | 33     |
|       |        | | legend      | 17     |
|       |        | | equipment   | 4      |

UNL skews high because it introduces the XP/Hunt/Level system. SFD skews high
because of new "while / conditional" static abilities. OGN still has ~86 left
despite already being the most-worked set.

---

## Classification of the 277 broken cards

Cards are assigned a single primary category by first-match order against a
priority list. Counts are exclusive per card.

### A. Parser patterns that still need work (batchable — 171 cards)

These are fixable by extending the parser without any engine changes. Each
pattern unblocks multiple cards.

| #   | Pattern                                                 | Cards | Complexity |
|-----|---------------------------------------------------------|-------|------------|
| A1  | `cond:if` — conditional effects ("if X, do Y")          | 32    | Medium     |
| A2  | `static:aura` — "Units here have …", auras at location  | 26    | Medium     |
| A3  | `seq:then` — multi-step "Then …" chains                 | 17    | Medium     |
| A4  | `eff:draw` — conditional/per-X draw effects             | 14    | Easy       |
| A5  | `eff:exhaust` — activated `[Exhaust]:` abilities        | 13    | Easy       |
| A6  | `eff:kill` — kill-self-as-cost, conditional kill        | 12    | Easy       |
| A7  | `eff:move` — "can't move", "when I move" triggers       | 11    | Medium     |
| A8  | `cond:while` — "While I'm at a battlefield / buffed…"   | 8     | Medium     |
| A9  | `eff:recycle` — recycle-related triggers and effects    | 8     | Easy       |
| A10 | `eff:return-hand` — self/target return effects          | 6     | Easy       |
| A11 | `seq:if-you-do` — optional additional cost sequences    | 4     | Medium     |
| A12 | `repl:instead` — replacement / "instead" effects        | 4     | Hard       |
| A13 | `eff:stun` / `eff:channel` / `eff:score` (misc leaf)    | 9     | Easy       |
| A14 | misc leaves (banish, discard, reveal, copy, equip)      | 7     | Easy       |

**Sample rules text (for pattern hinting):**

*A1 `cond:if`:*
- `ogn-061-298 Poro Herder`: "When you play me, **if you control a Poro**, buff me and draw 1."
- `ogn-101-298 Mushroom Pouch`: "At the start of your Beginning Phase, **if you control a facedown card at a battlefield**, draw 1."
- `ogn-047-298 Find Your Center`: "**If an opponent's score is within 3 points of the Victory Score**, this costs [2] less. Draw 1 and channel 1 rune exhausted."

*A2 `static:aura`:*
- `ogn-079-298 Leona, Zealot`: "Stunned enemy units here have -8 [Might], to a minimum of 1 [Might]."
- `ogn-084-298 Eager Apprentice`: "While I'm at a battlefield, the Energy costs for spells you play is reduced by [1]."
- `sfd-088-221 Renata Glasc`: "Use my abilities only while I'm at a battlefield."

*A3 `seq:then`:*
- `ogn-025-298 Blind Fury`: "Choose one and banish it, **then play it**, ignoring its cost. **Then recycle** the rest."
- `ogn-123-298 Unchecked Power`: "Exhaust all friendly units, **then deal** 12 to ALL units at battlefields."
- `ogn-153-298 Overt Operation`: "you may spend its buff to ready it. **Then buff** all friendly units."

*A5 `eff:exhaust`:*
- `ogn-021-298 Sun Disc`: "[Exhaust]: [Legion] — The next unit you play this turn enters ready."
- `ogn-032-298 Ravenborn Tome`: "[Exhaust]: The next spell you play this turn deals 1 Bonus Damage."

### B. Special keyword mechanics (may need engine changes — 42 cards)

These categories are blocked on **new effect types or engine state** — they
are not just parser work.

| #   | Mechanic  | Cards | Engine work required |
|-----|-----------|-------|----------------------|
| B1  | `kw:xp`   | 20    | **New:** persistent XP counter on player, `gain-xp` effect, XP-threshold triggers |
| B2  | `kw:hidden` | 14  | Mostly complete (Hidden exists) — remaining are reactions *referencing* `[Hidden]` or interacting with facedown state |
| B3  | `kw:hunt` | 7     | **New:** Hunt keyword (attack-deck-top interaction) and Level thresholds |
| B4  | `kw:mighty` | 5   | **Partial:** trigger `becomes-mighty` already exists; remaining cards need reaction-style hookups |
| B5  | `kw:repeat` | 4   | **New:** `[Repeat N]` modifier that queues N copies of a spell effect |
| B6  | `kw:predict` | 3  | **New:** `[Predict]` — look at top of deck, optionally recycle |
| B7  | `kw:level` | 3    | **New:** Level-threshold static abilities gated by XP |
| B8  | `kw:ambush` | 2   | **New:** ambush-play-timing hook |

#### Mechanic briefs

**B1. XP / Levels (covers B1+B3+B7, ~30 cards).** Cards gain XP via triggers
("Gain 1 XP", "[Deathknell][>] Gain 1 XP"). Level thresholds
(`[Level 3][>]`, `[Level 6][>]`, `[Level 11][>]`) gate static or reactive
abilities. This is one mechanic family — the engine needs: (1) a per-card or
per-player XP counter, (2) a `gain-xp` effect type, (3) a condition evaluator
for `level >= N`, (4) parser recognition of `[Level N][>]` as a
conditional-block delimiter. Without these, the parser will keep leaving raw
effects because there is no target type to emit.

**B2. Hidden reactions (14 cards).** The `[Hidden]` keyword itself is already
implemented. Remaining cards aren't failing on `[Hidden]` — they're failing on
the *text surrounding it*. Example: `ogn-018-298 Noxus Saboteur` says
"Your opponents' [Hidden] cards can't be revealed here." That is a static
prohibition effect on opponent reveal action — it needs a new
`prevent-reveal` static effect, not new keyword work.

**B5. Repeat (4 cards).** `[Repeat N] — <cost> <effect>` means the player may
pay the cost up to N times and resolve the effect each time. Other cards
*grant* `[Repeat]` to the next spell played. The engine needs a modifier on
the chain item stack that re-queues resolution N times. Medium complexity.

**B6. Predict (3 cards).** "Look at the top card of your deck, then either
keep it on top or recycle it." This is a simple `look` + `recycle` sequence
with a choice — the effect executor already has `look` and `recycle`, so this
is mostly parser work plus a small `predict` helper effect.

**B8. Ambush (2 cards — `sfd-025-221 Rengar, Pouncing`, etc.).** Unit can be
played to a battlefield you're attacking. This is a play-restriction
modifier that the engine's `canPlay` check must honor. Small addition.

### C. Complex one-off cards (manual overrides — 48 cards)

Cards that don't match any repeating pattern. These need hand-written
ability objects, not parser work. Highlights:

- `ogn-011-298 Magma Wurm` — "Other friendly units enter ready." (static aura on play)
- `ogn-028-298 Draven, Showboat` — "My Might is increased by your points." (dynamic self-buff tied to player score)
- `ogn-034-298 Tryndamere, Barbarian` — conditional score on excess damage
- `ogn-117-298 Viktor, Innovator` — "When you play a card on an opponent's turn…"
- `ogn-111-298 Heimerdinger, Inventor` — "I have all [Exhaust] abilities of all friendly legends, units, and gear." (hard: meta-ability grant)
- `ogn-149-298 Carnivorous Snapvine` — "We deal damage equal to our Mights to each other." (mutual fight)
- `ogn-156-298 Sabotage` — "Choose an opponent. They reveal their hand. Choose a non-unit card from it, and recycle that card." (multi-step opponent choose)
- `ogn-177-298 Stealthy Pursuer` — "When a friendly unit moves from my location, I may be moved with it."
- `ogn-226-298 Spectral Matron` — conditional "play from trash costing no more than X"
- `ogn-268-298 Bullet Time` — "Pay any amount of [rainbow] to deal that much damage" (X-cost damage)
- `ogn-276-298 Aspirant's Climb` — "Increase the points needed to win the game by 1." (global rule mutation)
- `ogn-278-298 Bandle Tree` — "You may hide an additional card here." (hidden-zone capacity mutation)
- `ogs-001-024 Annie, Fiery` — "Your spells and abilities deal 1 Bonus Damage." (static damage modifier)
- `sfd-001-221 Against the Odds` — "+2 Might per enemy unit there" (per-X scaling buff)

Complexity estimates for overrides: most are 10-30 lines of hand-authored
ability JSON. A handful (Heimerdinger, Bandle Tree, Aspirant's Climb) require
new engine primitives and should be deferred until a Wave 4.

### D. Multi-effect / compound cards (subset of A3 `seq:then` — 17 cards)

All fit under the `seq:then` pattern work in Section A. Key samples:

- `ogn-102-298 Portal Rescue` — "Banish a friendly unit, then its owner plays it to their base."
- `ogn-115-298 Promising Future` — "Each player looks at the top 5 cards, banishes one, then recycles the rest."
- `ogn-153-298 Overt Operation` — "For each friendly unit, you may spend its buff to ready it. Then buff all friendly units."

The parser already knows about `sequence` effects; the gap is that it doesn't
split on "Then" mid-sentence. A `splitOnThen()` preprocessor in `parseEffect`
would unlock all 17 in one pass. **Easy.**

### E. Static / conditional continuous abilities (26 cards — Section A2)

The `static-parser.ts` file exists (880 lines) but doesn't cover:

- **Location-bound auras**: "Units here have +1 Might" / "Enemy units here have -2 Might"
- **Self-conditioned auras**: "While I'm at a battlefield, X"
- **Self-buff-conditioned**: "While I'm buffed, I have +1 Might"
- **Score-threshold statics**: "If an opponent's score is within 3 points…"
- **Combat-state statics**: "While I'm in combat, X"

The static-parser currently handles "Your units have +N Might" style global
auras but trips on location-scoped and self-conditioned ones. Medium-complexity
parser work; no engine changes needed because
`packages/riftbound-engine/src/abilities/static-abilities.ts` already
implements recalculate-from-scratch.

### Cards NOT worth fixing right now

Recommend deferring (leave broken, mark as `abilities: []` with a TODO):

1. **Global rule mutations** (2 cards): `ogn-276-298 Aspirant's Climb`
   (changes victory score), `ogn-278-298 Bandle Tree` (changes hidden-zone
   capacity). These need first-class engine support that is disproportionate
   to their gameplay impact.
2. **Meta-ability grants** (1 card): `ogn-111-298 Heimerdinger, Inventor` —
   inheriting all exhaust abilities of other cards. Needs a dynamic ability
   composition system.
3. **Free-form choose-from-opponent-hand** (2 cards): `ogn-156-298 Sabotage`,
   `ogn-025-298 Blind Fury` — need a proper opponent-reveal + pick UI flow.
4. **X-cost effects** (1 card): `ogn-268-298 Bullet Time` — needs an X-cost
   primitive in the cost parser.

Total deferred: **~6 cards**. Everything else is in scope.

---

## Wave 3 plan — 4 parallel agents

Wave 3 targets the parser + engine work that will close the majority of the
277 broken cards. Work is split so each agent owns an independent slice with
minimal merge conflict risk.

### Agent 1 — Sequencing + Core leaves (target: ~55 cards)

**Scope:** A3 `seq:then` + A5 `eff:exhaust` + A11 `seq:if-you-do` + A13 +
A14 (misc leaves: stun, channel, score, banish, discard, reveal, copy,
equip).

**Approach:** Parser-only, all easy-medium.
1. Add `splitOnThen()` preprocessor in `effect-parser.ts` that splits an
   effect string on sentence-level `, then ` / `. Then ` / ` Then ` tokens
   and wraps results in `{type:"sequence", effects:[…]}`.
2. Add `parseIfYouDo()` that recognizes "X. If you do, Y" and wraps as
   conditional on X's resolution.
3. Extend activated-ability pattern to accept `[Exhaust]:` and
   `[Exhaust]: [Legion] —` (keyword-gated activated abilities).
4. Fill in leaf parsers for stun, channel-rune-exhausted, score-points,
   banish-self, discard, reveal, copy, equip that currently emit raw.

**Cards unblocked:** 17 + 13 + 4 + 9 + 7 = **~50 cards**.

**Prereqs:** None.

**Files touched:** `parser/parsers/effect-parser.ts`,
`parser/parsers/effect-keyword-parser.ts`, `parser/index.ts`.

### Agent 2 — Conditionals + Static auras (target: ~66 cards)

**Scope:** A1 `cond:if` (32) + A2 `static:aura` (26) + A8 `cond:while` (8).

**Approach:** Parser-only, medium.
1. Extend `condition-parser.ts` to recognize:
   - `if you control a <type>` → `{type:"control-count", cardType, min:1}`
   - `if you control a facedown card at a battlefield` → `{type:"controls-facedown"}`
   - `if an opponent's score is within N points of the Victory Score` → new condition type
   - `if I'm at a battlefield` / `while I'm at a battlefield` → location-based
   - `while I'm buffed` → self-state condition
2. Extend `static-parser.ts` to recognize location-scoped auras:
   - `Units here have +N [Might]`
   - `Stunned enemy units here have -N [Might]`
   - `Enemy units here have …`
3. Wire these into the existing static-ability framework (no engine changes
   — `static-abilities.ts` already supports grant-keyword / modify-might).

**Cards unblocked:** 32 + 26 + 8 = **~60 cards** (some overlap with Agent 1).

**Prereqs:** None.

**Files touched:** `parser/parsers/condition-parser.ts`,
`parser/parsers/static-parser.ts`, `parser/index.ts`.

### Agent 3 — XP / Hunt / Level / Predict mechanic family (target: ~32 cards)

**Scope:** B1 `kw:xp` (20) + B3 `kw:hunt` (7) + B6 `kw:predict` (3) +
B7 `kw:level` (3). This agent owns the UNL "champion progression" axis.

**Approach:** Engine-first, then parser.
1. **Engine:** Add `xp: number` to `RiftboundPlayerState` (or per-card meta
   if a card-scoped XP is needed). Start at 0, persists across turns.
2. **Engine:** Add `GainXpEffect` (`{ type: "gain-xp", amount: number }`)
   to `effect-executor.ts`. Add `xp-threshold` event fired when a player
   crosses Level 3 / 6 / 11.
3. **Engine:** Add `level-condition` to `static-abilities.ts` so
   `[Level N][>]` abilities activate once XP threshold is reached.
4. **Engine:** Add `PredictEffect` that wraps `look` + optional `recycle`.
5. **Engine:** Add Hunt keyword — the gameplay rule is "this unit attacks
   the top card of the defender's deck"; check Riftbound rules reference
   before implementing.
6. **Parser:** Recognize `[Level N][>]`, `[Hunt N]`, `[Predict N]`,
   `Gain N XP`, `Spend N XP,` (as an activated cost).

**Cards unblocked:** **~32 cards** (plus some `other` cards that reference
Level/XP indirectly).

**Prereqs:** **Engine changes must land before parser changes.** This agent
should open a steering PR with just the engine work first.

**Files touched:** `riftbound-engine/src/types/game-state.ts`,
`riftbound-engine/src/abilities/effect-executor.ts`,
`riftbound-engine/src/abilities/static-abilities.ts`,
`riftbound-engine/src/keywords/keyword-effects.ts`,
`riftbound-cards/src/parser/parsers/effect-keyword-parser.ts`,
`riftbound-cards/src/parser/parsers/static-parser.ts`.

### Agent 4 — Manual overrides + misc keyword reactions (target: ~48 cards)

**Scope:** Section C (48 `other` cards) **minus** the 6 deferred cards = 42
cards. Plus B4 `kw:mighty` (5), B5 `kw:repeat` (4), B8 `kw:ambush` (2),
B2 `kw:hidden` edge-cases (14).

**Approach:** A mix of manual hand-authored ability objects (for the Section
C cards) and one small parser extension each for the keyword categories.

1. **Manual overrides** (~42 cards): for each card in Section C, hand-write
   the `abilities: Ability[]` array directly in the card file (following the
   `tideturner.ts` pattern). Keep the card's `rulesText` intact so the
   parser can be retried later without conflict. Group by card file, not by
   commit — this minimizes merge noise.
2. **`[Mighty]` reactions** (5 cards): extend the trigger-matcher to emit
   `becomes-mighty` events to opponents' cards as well. Parser work is
   minimal.
3. **`[Repeat N]`** (4 cards): add `RepeatEffect` to the engine that queues
   N copies of an inner effect, and parser recognition of `[Repeat N] —`.
4. **`[Ambush]`** (2 cards): add a play-restriction flag `canPlayToAttacked`
   to unit card meta and a single check in `move validation`.
5. **`[Hidden]` reactions** (14 cards): most of these need a
   `prevent-reveal` static effect and a `play-card-with-hidden` target
   selector.

**Cards unblocked:** 42 + 5 + 4 + 2 + 14 = **~67 cards**.

**Prereqs:** None for the overrides. The keyword work touches the engine
but is localized to its keyword.

**Files touched:** Individual card files under
`riftbound-cards/src/cards/*`, plus `riftbound-engine/src/abilities/*` for
the keyword effects.

---

## Coverage math

| Agent | Target | Approach | Engine changes |
|-------|--------|----------|----------------|
| 1     | ~55    | parser   | no             |
| 2     | ~66    | parser   | no             |
| 3     | ~32    | both     | **yes**        |
| 4     | ~67    | manual + parser | localized per keyword |
| **sum**|**~220**| — | — |

There is overlap between categories (a card tagged `cond:if` may also match
`seq:then`), so expected net closures are **180-200 cards**.

### Projected end-of-Wave-3 state

- Before Wave 3: 478 / 755 working (63.3%)
- After Wave 3 (target): ~660-680 / 755 working (87-90%)
- Deferred (never fixing): 6 cards
- Remaining for a hypothetical Wave 4: ~70 cards of truly one-off complexity

## Execution order

1. **Agent 3 posts steering PR first** — its engine changes are a
   prerequisite for Wave 4 and unblock the UNL progression cards.
2. **Agents 1, 2, 4 can run in parallel** immediately.
3. **Integration phase:** after all four PRs land, re-run
   `bun run scripts/remaining-audit.ts` and produce a Wave 4 plan for the
   residual cards (should be ~70 cards, mostly unique one-offs).

## Appendix — audit artifacts

- `/tmp/remaining-audit.ts` — audit script (also copied to
  `packages/riftbound-cards/scripts/remaining-audit.ts` so it can import
  workspace modules directly via `bun run`)
- `/tmp/remaining-audit-report.json` — full per-card data including
  `id`, `name`, `setId`, `cardType`, `rulesText`, `status`,
  `abilityCount`, `rawEffectCount`, `rawEffectTexts`, and `tags`
- Re-run anytime with:
  `cd packages/riftbound-cards && bun run scripts/remaining-audit.ts`
