# Card Parser Remaining Work Plan (Wave 4)

## Status: Planning
## Date: 2026-04-11
## Predecessors:
- `.ai_memory/card-ability-parser-improvement-plan.md` (Waves 1-2)
- `.ai_memory/card-parser-remaining-plan.md` (Wave 3)

## Headline

**Waves 1-3 took the Riftbound parser from 0.4% -> 79.7% working.**
Wave 4 is firmly in diminishing-returns territory. There is *not* enough
parallelizable parser work left to justify a 4-agent fan-out — most of the
remaining 153 cards are either (a) blocked on engine primitives that take
hours to design correctly, or (b) genuine one-offs that should be hand-authored
or deferred.

This plan recommends a **focused 2-agent Wave 4** with a tight scope, plus a
formal "deferred / not worth fixing" list. Anything else should be parked
behind a feature flag and revisited only when the engine grows the relevant
primitives for other reasons.

---

## Current State (audit run 2026-04-11)

```
total cards:        769
with rules text:    755
working cleanly:    602   (79.7%)
broken:             153   (20.3%)
```

### Broken breakdown by status

| Status        | Count | Meaning                                                  |
|---------------|-------|----------------------------------------------------------|
| no-abilities  | 68    | Parser produced 0 abilities from non-empty rules text    |
| raw-effect    | 59    | All parsed abilities contain at least one `raw` node     |
| partial-raw   | 26    | Some abilities parsed; at least one `raw` node remains   |
| **total**     | **153** |                                                        |

### Broken breakdown by set / card type

| Set | Broken |
|-----|--------|
| UNL | 58     |
| OGN | 50     |
| SFD | 42     |
| OGS | 3      |

| Card type   | Broken |
|-------------|--------|
| unit        | 62     |
| gear        | 27     |
| spell       | 25     |
| battlefield | 25     |
| legend      | 11     |
| equipment   | 3      |

UNL is now the heaviest set because XP / Level / Hunt / Predict / Ambush
intersect a lot of its cards and Wave 3's Agent 3 only landed the parser
side of XP. SFD and UNL battlefields contribute disproportionately to the
"static aura with weird scoping" tail.

### Top primary tags

```
static:aura      22   eff:exhaust     12   eff:return-hand   6
cond:if          18   eff:kill        11   cond:while         5
seq:then         14   eff:move        11   repl:instead       4
eff:draw         14   eff:recycle      8   misc one-offs      ~10
                       kw:xp           8
```

(Tag totals across `tagFrequency` exceed 153 because most cards carry
multiple tags. Counts above are *primary tag* assignments — each card is in
exactly one bucket.)

---

## Why Wave 4 looks different from Wave 3

Wave 3 had a clean separation: four big pattern families (sequencing,
conditionals, XP/Hunt, manual overrides) that didn't touch each other and
weren't blocked on engine work. Wave 4's residual cards have three properties
that prevent that:

1. **Most categories now have 5-15 cards**, not 30-50. The fixed parser
   plumbing cost per category is high relative to the unblocked-card payoff.
2. **Engine work is on the critical path**. Replacement effects, X-cost,
   spend-buff costs, opponent-choose flows, and "next-time" replacement
   creators all need engine primitives to land first.
3. **Parser categories are heavily entangled**. A single SFD battlefield
   often needs `cond:while` *and* `seq:then` *and* a static-aura with a
   self-condition — split across four agents this becomes a merge nightmare.

The right move is a smaller wave with surgical scope.

---

## Classification of the 153 broken cards

Cards are bucketed by *first applicable* category in priority order.
Categories below are listed roughly in fix-cost-per-card order.

### Bucket 1 — Low-hanging parser fruit (~32 cards, 4-6 hours)

Cards that one or two regex additions can close. No engine work.

#### 1a. `[Exhaust]: <effect>` activated abilities on gear/legend (8 cards)

Wave 3's Agent 1 wrote the activated-ability scaffold but didn't finish the
exhaust-cost variants. These all match the same shape:
`[Exhaust]: <inner effect>` (occasionally with `[<keyword>] —` gating).

- `ogn-021-298 Sun Disc` — `[Exhaust]: [Legion] — The next unit you play this turn enters ready.`
- `ogn-032-298 Ravenborn Tome` — `[Exhaust]: The next spell you play this turn deals 1 Bonus Damage.`
- `ogn-181-298 Pack of Wonders` — `[Exhaust]: Return another friendly gear, unit, or facedown card to its owner's hand.`
- `unl-160-219 Ultrasoft Poro` — `[Exhaust]: Play two [1] [Might] Bird unit tokens with [Deflect].`
- `unl-138-219 The List` — `[Exhaust]: Give a unit with the named tag -2 [Might] this turn.`
- `unl-093-219 Dragonsoul Sage` — `[Reaction][>] [Exhaust]: [Add] [1].`
- `unl-197-219 Scorn of the Moon` — `[Reaction][>] [Exhaust]: [Add] [1]. Spend this Energy only during showdowns.`
- `sfd-019-221 Assembly Rig` — `[1][fury], Recycle a unit from your trash, [Exhaust]: Play a 3 [Might] Mech unit token to your base.`

**Note from Wave 3:** "next unit you play this turn enters ready" needs an
`enters-ready` replacement type — the engine has `replacement-effects.ts`
already; just add `"enters-ready"` to the `ReplacementEvent.type` union and
emit the matching ability shape from the parser. ~30 lines of engine work.
Same trick handles `Ravenborn Tome` ("next spell deals bonus damage").

#### 1b. Self-referential triggers without effect-side issues (8 cards)

These have one structural quirk the parser misses but the inner effect is
already handled.

- `ogn-006-298 Flame Chompers` — `When you discard me, you may pay [fury] to play me.` (parser misses "play me" leaf because it's a self-reference inside a trash zone)
- `ogn-118-298 Wraith of Echoes` — `The first time a friendly unit dies each turn, draw 1.` (needs "first time per turn" trigger qualifier)
- `ogn-182-298 Scrapheap` — `When this is played, discarded, or killed, draw 1.` (multi-event trigger union)
- `ogn-188-298 Zaunite Bouncer` — `return another unit at a battlefield to its owner's hand` (return-hand parses; "another unit at a battlefield" target doesn't)
- `unl-156-219 Loyal Poro` — `[Deathknell][>] If I didn't die alone, draw 1.` (needs `[Deathknell]` modifier — flagged by Wave 3 Agent 2)
- `unl-085-219 Sumpworks Map` — `When an opponent scores, draw 1.` (opponent-score trigger missing)
- `unl-011-219 Fresh Beans` — `When you play a unit during a showdown` (showdown qualifier)
- `sfd-100-221 Yordle Explorer` — `When you play a card with Power cost [rainbow][rainbow] or more, draw 1.` (Power-cost predicate)

#### 1c. Static effects on battlefields (8 cards)

Battlefield-scoped statics that need a target type for "units here". Several
of these were skipped by Wave 3 Agent 2's `static:aura` work because the
condition "here" wasn't recognized.

- `unl-212-219 Frozen Fortress` — `At the start of each player's Beginning Phase, deal 1 to each unit here.`
- `unl-213-219 Gardens of Becoming` — `Units here have "[Exhaust]: Gain 1 XP."` (granted activated ability)
- `unl-214-219 Ripper's Bay` — `When a unit here is returned to a player's hand, that player may pay [1] to channel 1 rune exhausted.`
- `unl-218-219 Valley of Idols` — `When a player plays a unit here, they may pay [1] to [Buff] it.`
- `unl-210-219 Forbidding Waste` — `While a unit here is defending alone, it has -2 [Might].`
- `ogn-296-298 Void Gate` — `Spells and abilities deal 1 Bonus Damage to units here.` (location-scoped damage modifier)
- `ogn-292-298 The Dreaming Tree` — `When a player chooses a friendly unit here with a spell for the first time each turn, they draw 1.`
- `unl-057-219 Alpha Wildclaw` — `Your units here with less Might than me can't be chosen by enemy spells and abilities.` (target-prevention static)

#### 1d. Misc one-line parser misses (8 cards)

- `ogn-251-298 Loose Cannon` — `draw 1 if you have one or fewer cards in your hand` (hand-size condition)
- `ogs-023-024 Might of Demacia - Starter` — `if you have 4+ units at that battlefield` (count condition)
- `unl-015-219 Right of Conquest` — `Draw 1, then draw 1 for each battlefield you or allies control.` (per-battlefield count)
- `unl-103-219 Disposal Order` — choose-one with sub-options
- `unl-194-219 Shadow` — `If you play me to a battlefield, I enter ready.` (conditional play replacement)
- `unl-187-219 Piltover Enforcer` — `if you assigned 3 or more excess damage` (excess-damage condition)
- `sfd-187-221 Void Burrower`, `sfd-188-221 Void Rush` — "reveal top N, banish one, play it, recycle the rest" (a single template)
- `sfd-217-221 Seat of Power` — `draw 1 for each other battlefield you or allies control` (already partially supported)

**Bucket 1 total:** **~32 cards.** Estimated 4-6 hours of focused parser
work + the small `enters-ready` replacement-event addition.

---

### Bucket 2 — Replacement-effect heavy hitters (~12 cards, 6-10 hours)

The pattern: **"The next time X would Y, instead Z."** This appears in 4
spell archetypes plus 8 cards that pair it with conditional cost. The engine
already has `replacement-effects.ts` with `die`/`take-damage`/`move`/`draw`/
`discard`/`score` events.

The remaining work is in two pieces:

1. **Parser:** the `replacementMatch` regex on line 3912 of
   `parser/index.ts` already matches the shape but emits
   `{type: "raw"}` for the inner replacement effect — Wave 3 Agent 4 noted
   this as a punt. The fix is to recurse into `parseEffect` for the
   replacement body and to lift the surrounding sequence into the right
   ability shape.
2. **Engine:** add a `"next"` duration handler so single-fire replacements
   are removed after they trigger (the `MatchedReplacement.duration` field
   already exists; the executor needs to honor it).

Cards unblocked:

- `ogs-020-024 Highlander`
- `unl-175-219 Tactical Retreat`
- `ogn-023-298 Unlicensed Armory`
- `ogn-269-298 The Boss`
- `unl-206-219 Altar of Blood`
- `sfd-173-221 Soraka, Wanderer`
- `ogn-227-298 Symbol of the Solari` (combat-tie replacement)
- `ogn-254-298 Noxian Guillotine` (`Kill it the next time it takes damage this turn`)
- `ogn-221-298 Imperial Decree` (`When any unit takes damage this turn, kill it` — turn-scoped trigger replacement)
- `unl-049-219 Honeyfruit` (`[Level 6][>]` gates the second activated ability — needs Wave 3's level work *plus* this bucket)
- `unl-086-219 Zilean, Time Mage` (token-doubling replacement — needs `play-token` event type, may be deferred)
- `sfd-018-221 Void Hatchling` (`If you would reveal cards from a deck, look at the top card first` — reveal-replacement)

**Bucket 2 total:** **~12 cards.** Estimated 6-10 hours including engine
duration-handling.

---

### Bucket 3 — Static auras with self-condition or location scoping (~10 cards)

The remaining `static:aura` and `cond:while` cards that Wave 3 Agent 2 didn't
handle. All need new conditions in `static-parser.ts`:

- `sfd-146-221 Vex, Cheerless` — `While I'm in combat, friendly spells cost [1][rainbow] less to a minimum of [1]` (combat-state self-condition + spell-cost reduction)
- `sfd-201-221 Chem-Baroness` — `While your score is within 3 points of the Victory Score, your Gold [ADD] an additional [1]` (victory-score-margin condition)
- `sfd-213-221 Ornn's Forge` — `the first friendly non-token gear played each turn costs [1] less` (per-turn first-of-type cost reduction)
- `sfd-208-221 Forge of the Fluft` — `friendly legends have "[Exhaust]: Attach an Equipment you control to a unit you control."` (granted activated ability with target)
- `unl-150-219 Vex, Apathetic` — `When an opponent plays a unit while I'm at a battlefield` (location-self-condition)
- `unl-088-219 Gutter Palace` — `if you have exactly 4 cards in hand and exactly 4 units at battlefields, you win the game` (alt-win condition)
- `unl-079-219 Diana, Lunari` — showdown trigger with `[Predict]` (paired with Bucket 5)
- `unl-211-219 Forgotten Library` — `When you play a spell, if you spent [4] or more, [Predict].` (spell-cost predicate + Predict)
- `unl-209-219 Dusk Rose Lab` — `you may kill a unit you control here to draw 1` (sacrifice-cost on activated)
- `unl-215-219 Star Spring` — `The first time a player plays a non-token unit here each turn, they may move another unit they control here to its base.`

**Bucket 3 total:** **~10 cards.** Estimated 4-6 hours of parser work
spread across `condition-parser.ts` and `static-parser.ts`. No engine
changes — the existing static-recalculation framework handles all of these
once the conditions emit correctly.

---

### Bucket 4 — Compound sequences the splitter couldn't handle (~14 cards)

Wave 3 Agent 1 added `splitOnThen()`, but several `seq:then` cards have
nesting (`then play it`, `then recycle the rest`) where the inner verb
references state set up by an earlier verb. These fail because the parser
can't make `play it` resolve to "the card just banished".

- `ogn-025-298 Blind Fury`
- `ogn-102-298 Portal Rescue`
- `ogn-115-298 Promising Future`
- `ogn-153-298 Overt Operation`
- `ogn-160-298 Dazzling Aurora`
- `unl-184-219 Thrill of the Hunt`
- `sfd-053-221 Janna, Savior`
- `sfd-170-221 Rek'Sai, Swarm Queen`
- `sfd-188-221 Void Rush` (also in Bucket 1d — same template)
- `sfd-187-221 Void Burrower` (also in Bucket 1d)
- `unl-080-219 Hwei, Brooding Painter` (`do the following based on the discarded card's type` — type-switch sequence)
- `ogn-200-298 Twisted Fate, Gambler` (`Do one of the following based on its domain` — domain switch)
- `unl-052-219 Nami, Headstrong` (`if you paid the additional cost, [Stun] an enemy unit` — paid-cost conditional)
- `sfd-024-221 Rell, Magnetic` (`If you do, then do this: Attach it to me`)

The fix is **not** more parser regex — it's a `pendingValue` slot in
`SequenceEffect` that lets a later step reference "the thing the previous
step produced." This is real parser-IR work, ~6-10 hours of focused
refactoring. Most of these cards are spells or one-off legends, so the
gameplay payoff per card is moderate.

**Bucket 4 total:** **~14 cards.** Estimated 6-10 hours, with merge risk
against Bucket 1 because both touch `parser/index.ts`.

---

### Bucket 5 — UNL XP / Level / Hunt / Predict residue (~12 cards)

Wave 3 Agent 3 landed the engine primitives for XP and the `gain-xp` /
`spend-xp` parser shapes. What's left are the cards that pair these with
**activated-ability cost chains** (`Spend N XP, [Exhaust]:`) which Agent 3
deferred to Bucket 1's `[Exhaust]:` work, plus cards using `[Hunt]`,
`[Ambush]`, and `[Predict]` keywords that haven't been wired up.

- `unl-201-219 Voidreaver` — `Spend 1 XP, [Exhaust]: [Buff] a unit. Spend 2 XP, [Exhaust]: Move...` (paired XP-cost activated abilities)
- `unl-135-219 Insightful Investigator` — `You may pay 2 XP to choose a card from their hand`
- `unl-140-219 Conscription` — `You may spend 5 XP as an additional cost to play this`
- `unl-143-219 Kha'Zix, Mutating Horror` — `[Ambush] When I attack or defend, ... gain 2 XP`
- `unl-164-219 Safety Inspector` — `You may spend 3 XP as an additional cost to play me`
- `unl-178-219 Poppy, Defender of the Meek` — `You may spend 3 XP as an additional cost to play me. If you do, I cost [3] less. [Ambush] [Tank]`
- `unl-192-219 Alpha Strike` — `for each unit this kills, do this: Gain 1 XP` (per-kill XP via sequence)
- `unl-117-219 Arachnoid Horror` — `[Hunt 2]` (Hunt keyword)
- `unl-079-219 Diana, Lunari` — `[Predict]` chained
- `unl-211-219 Forgotten Library` — `[Predict]`
- `unl-049-219 Honeyfruit` — `[Level 6][>]` (level-gated activated)

The path to closing all of these is:

1. Add `[Hunt N]`, `[Ambush]`, `[Predict N]` to the keyword union.
2. Add `spend-xp-as-additional-cost` to the cost parser (it intersects
   Bucket 1a's activated-cost work).
3. Wire `[Level N][>]` as a static-condition gate on activated abilities.

Most of these are straight engine + parser work, ~8 hours total.

**Bucket 5 total:** **~12 cards.** Estimated 6-8 hours.

---

### Bucket 6 — Manual hand-authored cards (~25 cards)

Cards that match no repeating pattern. Each needs a hand-written ability
object. Wave 3 Agent 4 already cleared the easy half of Section C; what
remains is the harder tail. Approximate complexity 15-40 lines per card.

Highlights worth implementing:

- `ogn-037-298 Immortal Phoenix` — kill-with-spell trigger + recur from trash
- `ogn-113-298 Malzahar, Fanatic` — sacrifice-cost activated for energy
- `ogn-208-298 Cruel Patron` — additional kill-cost on play
- `ogn-212-298 Forge of the Future` — token + sacrifice-recycle
- `ogn-225-298 Solari Chief` — `if it is stunned, kill it. Otherwise, stun it`
- `ogn-237-298 King's Edict` — multiplayer choose-and-kill
- `ogn-244-298 Divine Judgment` — `Each player chooses 2 of each. Recycle the rest.` (multi-zone keep-N)
- `ogn-246-298 Viktor, Leader` — non-Recruit-dies trigger
- `ogn-291-298 The Candlelit Sanctum` — look-2 + recycle/reorder
- `ogn-295-298 Vilemaw's Lair` — `Units can't move from here to base` (move-prevention static)
- `sfd-014-221 Minotaur Reckoner` — `Units can't move to base.`
- `sfd-026-221 Rumble, Hotheaded` — recycle-to-recur with cost reduction
- `sfd-049-221 Aphelios, Exalted` — equip trigger choose-one
- `sfd-082-221 Ezreal, Dashing` — combat damage replacement (`I don't deal combat damage`)
- `sfd-112-221 Kato the Arm` — granted-keywords-and-might transfer
- `sfd-120-221 Sivir, Ambitious` — excess-damage payoff
- `sfd-138-221 Windsinger` — bounce on play with might filter
- `sfd-142-221 Jae Medarda` — `When you choose me with a spell, draw 1`
- `sfd-144-221 Spirit Wheel` — `When you choose a friendly unit, ...`
- `sfd-203-221 Battle Mistress` — `When you recycle a rune, ... When one or more enemy units die, ready me`
- `sfd-207-221 Emperor's Dais` — `if you do, play a Sand Soldier here`
- `sfd-215-221 Ravenbloom Conservatory` — reveal-and-keep
- `unl-045-219 Forgotten Signpost` — exhaust-target-cost activated movement
- `unl-054-219 Tricksy Tentacles` — multi-target group movement with might cap
- `unl-082-219 Lillia, Fae Fawn` — `[Accelerate]` keyword + token

Plus ~12 smaller manual one-offs.

**Bucket 6 total:** **~25 cards.** Estimated 8-12 hours of careful authoring,
parallelizable across multiple agents but conflict-prone (each agent touches
multiple card files).

---

### Bucket 7 — Permanently deferred (~12 cards)

These need engine primitives whose design cost is wildly out of proportion
to the gameplay impact. **Mark as `abilities: []` with a `// TODO(wave5):`
comment and move on.**

| Card | Reason |
|------|--------|
| `ogn-268-298 Bullet Time` | X-cost effect. Needs cost parser primitive. |
| `ogn-276-298 Aspirant's Climb` | Mutates victory score. Global rule mutation. |
| `ogn-278-298 Bandle Tree` | Mutates hidden-zone capacity. Global rule mutation. |
| `ogn-111-298 Heimerdinger, Inventor` | "Has all `[Exhaust]` abilities of all friendly legends, units, and gear." Meta-ability inheritance. |
| `ogn-156-298 Sabotage` | Choose-from-opponent-hand interactive flow. |
| `ogn-192-298 Mindsplitter` | Same — opponent-reveal + pick. |
| `unl-169-219 Ashe, Focused` | Same — banish-from-revealed-hand. |
| `sfd-090-221 The Zero Drive` | Tracks "units banished with this" — needs per-equipment exile zone. |
| `sfd-059-221 Svellsongur` | `copy that unit's text to this Equipment` — dynamic ability mirroring. |
| `unl-188-219 Hextech Gauntlets` | `Energy cost is reduced by the Might of the unit you choose` — interactive cost-reduction. |
| `sfd-209-221 Forgotten Monument` | `Players can't score here until their third turn` — turn-counted score gate. |
| `unl-163-219 Mageseeker Investigator` | `Opponents must pay [rainbow] for each unit beyond the first to move multiple units` — combinatoric move pricing. |

**Bucket 7 total:** **~12 cards.** Defer indefinitely.

---

## Bucket totals

| Bucket | Cards | Hours | Approach            |
|--------|-------|-------|---------------------|
| 1 — low-hanging parser fruit | 32 | 4-6   | parser + 30 LOC engine |
| 2 — replacement effects      | 12 | 6-10  | parser + engine duration |
| 3 — static / self-condition  | 10 | 4-6   | parser only |
| 4 — compound sequences       | 14 | 6-10  | parser IR refactor |
| 5 — XP / Level / Hunt residue | 12 | 6-8  | parser + engine |
| 6 — manual hand-authored     | 25 | 8-12  | per-card ability JSON |
| 7 — deferred                 | 12 | 0     | mark TODO |
| **active total**             | **105** | **34-52** | |
| **deferred**                 | 12 | 0 | |
| **uncovered tail**           | ~36 | — | absorbed across buckets via overlap |

Bucket counts overlap (a card may match Bucket 4 *and* Bucket 6). Net new
working cards from Wave 4 should be **~95-110** of the 153 broken.

---

## Wave 3 follow-ups flagged by individual agents

These are not new buckets — they are blockers on existing buckets.

1. **Agent 1: `enters-ready` replacement event missing.** Blocks
   `Sun Disc`, `Ravenborn Tome`, several "next unit/spell you play this
   turn..." cards. Fix: add `"enters-ready"` and `"deals-bonus-damage"` to
   the `ReplacementEvent.type` union in
   `riftbound-engine/src/abilities/replacement-effects.ts`. **In Bucket 1a.**
2. **Agent 2: `[Deathknell][>]` and other ability-zone modifiers** are
   parsed as raw text. Blocks `Loyal Poro` and a few other "death zone
   reaction" cards. Fix: extend the bracket-modifier scanner in
   `effect-keyword-parser.ts`. **In Bucket 1b.**
3. **Agent 3: `Spend N XP, [Exhaust]:` activated cost chains** were
   deferred until Agent 1's `[Exhaust]:` cost work landed. Now both pieces
   exist; the chain just needs to be wired. **In Bucket 5.**
4. **Agent 4: `Backline` keyword missing from the parser keyword union**
   even though the engine implements it
   (`riftbound-engine/src/keywords/keyword-effects.ts:60`). Add to the
   parser's keyword recognizer. ~5 lines, can be folded into any bucket.
5. **Agent 4: `AmountExpression` lacks an arithmetic multiplier.**
   `against-the-odds` currently emits `+1 per` instead of `+2 per`. The
   `AmountExpression` shape in the parser supports `{count:..., per: N}` —
   `N` is being defaulted to 1. The fix is in `parseGainXpEffect` /
   `parseBuffEffect` where the per-multiplier is constructed. ~5 line fix.
   Belongs in Bucket 1d.

---

## Wave 4 agent assignment

After comparing buckets, **Wave 4 should be 2 agents, not 4**. The split:

### Agent A — Parser cleanup (Buckets 1 + 3 + small fixes from #4 and #5 above)

**Target:** ~42 cards (32 from Bucket 1 + 10 from Bucket 3).

**Approach:** Pure parser work, plus the small `enters-ready` /
`deals-bonus-damage` replacement event addition in
`riftbound-engine/src/abilities/replacement-effects.ts`.

**Files touched:**
- `packages/riftbound-cards/src/parser/index.ts`
- `packages/riftbound-cards/src/parser/parsers/effect-parser.ts`
- `packages/riftbound-cards/src/parser/parsers/effect-keyword-parser.ts`
- `packages/riftbound-cards/src/parser/parsers/condition-parser.ts`
- `packages/riftbound-cards/src/parser/parsers/static-parser.ts`
- `packages/riftbound-engine/src/abilities/replacement-effects.ts` (small union extension only)

**Deliverables:**
1. New replacement events `enters-ready`, `deals-bonus-damage`.
2. `[Exhaust]: <effect>` activated-ability shape with optional
   `[<keyword>] —` gate.
3. Battlefield-scoped target type `units-here` (or extend existing
   `unit` target with `location: "here"` modifier).
4. Hand-size, battlefield-count, excess-damage, spell-cost-spent
   conditions in `condition-parser.ts`.
5. Self-condition recognizer for `while I'm at a battlefield`,
   `while I'm in combat`, `while I'm buffed`.
6. The 5-line `Backline` keyword fix and `per N` multiplier fix.

**Prereqs:** None.

### Agent B — Engine + sequence IR refactor (Buckets 2 + 4 + 5)

**Target:** ~38 cards (12 + 14 + 12).

**Approach:** This is the harder track — both parser refactor *and* engine
work. Should ship in two PRs:

**PR 1 (engine):**
1. Add `"next"` duration handling for replacement effects (remove after
   first match).
2. Add `gain-xp` / `spend-xp-additional-cost` to the cost parser layer.
3. Add `[Hunt N]`, `[Ambush]`, `[Predict N]` to the keyword effect map.
4. Add `[Level N]` static-condition gate that reads player XP.

**PR 2 (parser):**
1. Recurse `parseEffect` into the body of replacement-ability matches
   (currently emits raw).
2. Add a `pendingValue` slot to `SequenceEffect` so later steps can
   reference earlier steps' produced values (`then play it`).
3. Wire `Spend N XP,` and `Spend N XP as an additional cost to play this`
   into the activated/play-cost paths.

**Files touched:**
- `packages/riftbound-engine/src/abilities/replacement-effects.ts`
- `packages/riftbound-engine/src/abilities/effect-executor.ts`
- `packages/riftbound-engine/src/keywords/keyword-effects.ts`
- `packages/riftbound-engine/src/abilities/static-abilities.ts`
- `packages/riftbound-cards/src/parser/index.ts`
- `packages/riftbound-cards/src/parser/parsers/effect-parser.ts`

**Prereqs:** Should land *after* Agent A's parser PR to avoid merge
conflicts in `parser/index.ts` and `effect-parser.ts`.

### What's left after Agents A + B

- Bucket 6 (~25 manual hand-authored cards) — recommend **a follow-up
  lightweight pass** by a single agent (or a human) once Agents A + B land.
  Can be parallelized across multiple PRs without conflict because each
  card is its own file.
- Bucket 7 (~12 cards) — leave broken with TODO comments.

**Total Wave 4 unblock target:** 95-110 cards moving from broken to working.

---

## Projected end state

| Phase                 | Working | Rate  | Broken |
|-----------------------|---------|-------|--------|
| Start of project      | 3       | 0.4%  | 752    |
| After Wave 1          | 144     | 19%   | 611    |
| After Wave 2          | 149     | 20%   | 606    |
| After Wave 3          | 602     | 79.7% | 153    |
| **After Wave 4 (target)** | **697-712** | **92-94%** | **43-58** |
| Theoretical ceiling   | ~743    | ~98%  | ~12 (Bucket 7) |

The realistic ceiling is **~98%** of cards working — the 12 Bucket 7 cards
are not worth the engine work.

If Bucket 6 is also tackled, we land at **~95% (~717 / 755)**.

---

## Recommendation

1. **Run Wave 4 as 2 parallel agents (A + B)** with the scope above.
2. **Schedule Bucket 6 as a manual cleanup pass** (single agent) after
   Wave 4 lands. Don't try to parallelize manual override authoring across
   multiple agents — too much merge friction for too little speedup.
3. **Mark Bucket 7's 12 cards as deferred** with `abilities: []` and a
   `// TODO(wave5)` comment containing the gameplay impact and the engine
   primitive needed. This is a one-hour PR on its own.
4. **Stop after Wave 4.** At ~94% working, the parser is in good shape and
   further investment should be triggered by *gameplay needs* (a specific
   Bucket 7 card the playtesting community keeps asking for), not by
   parser-completion vanity.

---

## Audit artifacts

- `/tmp/remaining-audit-report.json` — refreshed 2026-04-11, 153 broken
  cards with full per-card data
- `packages/riftbound-cards/scripts/remaining-audit.ts` — re-run anytime
  with `bun run scripts/remaining-audit.ts`
- This plan: `/home/emaynard/tcg-engines/.ai_memory/card-parser-wave4-plan.md`
