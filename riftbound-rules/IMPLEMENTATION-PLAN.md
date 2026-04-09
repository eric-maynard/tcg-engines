# Riftbound Engine Implementation Plan

## Current State (updated 2026-04-02)

- **riftbound-types**: Complete type system (abilities, cards, conditions, costs, effects, triggers, targeting DSL)
- **riftbound-engine**: FlowDefinition with setup/mainGame segments, 35+ moves with basic conditions, zones, trackers, win conditions. 33 tests passing.
- **riftbound-cards**: 769 card definitions with `rulesText` strings, champion tags (129 units), `isChampion` flags. 11 tests passing.
- **riftbound-rules/**: Full game rules sharded into 25 markdown reference files.

### Completed
- **Phase 1.1**: Champion tags extracted from card names (129 units with tags, 84 unique champion tags). ✅
- **Phase 3.1**: FlowDefinition implemented with setup + mainGame segments, 6 phases (awaken→beginning→channel→draw→action→ending). ✅
- **Phase 3.2**: Setup flow (place legends, champions, battlefields, decks, mulligan, transition). ✅
- **Phase 4**: Resource moves (channelRunes, exhaustRune, recycleRune, addResources, spendResources). ✅
- **Phase 5** (partial): Card play moves with basic conditions (playUnit, playGear, playSpell). ✅
- **Phase 6** (partial): Movement moves (standardMove, gankingMove, recallUnit, recallGear). ✅
- **Phase 7** (partial): Combat moves (contestBattlefield, assignAttacker/Defender, assignDamage, resolveCombat, conquerBattlefield). ✅
- **Phase 8** (partial): Scoring moves (scorePoint with victory detection). ✅

---

## Phase 1: Card Data Enrichment

> Goal: Complete the card data so every card has accurate tags, champion flags, and domain identity.

### 1.1 Extract tags from card names and rules text
The gallery API returned empty tags. Tags like "Jinx", "Annie", "Mech", "Dragon", "Poro", "Sand Soldier", "Sprite", "Recruit" need to be extracted. Two sources:
- Champion tags are embedded in card names (e.g., "Jinx, Rebel" → tag: "Jinx")
- Tribal tags appear in rules text (e.g., "Play a 3 Might Mech unit token" → creates Mech)

**Tasks:**
- [x] Write a script to parse champion tags from card names (pattern: "Name, Title" where Name is the champion tag)
- [x] Build a champion tag registry from legend cards (each legend has a champion tag)
- [x] Cross-reference unit cards with champion tags to set `isChampion: true` on champion units
- [ ] Extract tribal/species tags from rules text patterns ("Mech unit token", "Sprite unit token", etc.)
- [x] Regenerate card files with updated tags
- [x] Write tests verifying tag correctness

### 1.2 Detect Signature cards
Rules 103.2.d: "Your deck may only contain 3 total Signature cards that have the same Champion tag as your Champion Legend."

**Tasks:**
- [ ] Identify Signature cards from card data (may need additional data source or text patterns)
- [ ] Add `isSignature?: boolean` field to UnitCard type if not present
- [ ] Update card definitions

---

## Phase 2: Ability Text Parser

> Goal: Convert `rulesText` strings into structured `Ability[]` objects matching the riftbound-types system.

### 2.1 Keyword parser
Start with the simplest patterns: keywords that appear as standalone text.

**Keywords to parse (from rules 712-729):**
- [ ] Accelerate - `[Accelerate]` with optional cost
- [ ] Action - `[Action]` (spell timing)
- [ ] Assault N - `[Assault]` with numeric value
- [ ] Deathknell - `[Deathknell]` with effect
- [ ] Deflect - `[Deflect]` with cost
- [ ] Ganking - `[Ganking]`
- [ ] Hidden - `[Hidden]` with effect
- [ ] Legion N - `[Legion]` with numeric value
- [ ] Reaction - `[Reaction]` (spell timing)
- [ ] Shield N - `[Shield]` with numeric value
- [ ] Tank - `[Tank]`
- [ ] Temporary - `[Temporary]`
- [ ] Vision - `[Vision]`
- [ ] Weaponmaster - `[Weaponmaster]`
- [ ] Equip DOMAIN - `[Equip]` with domain cost
- [ ] Quick-Draw - `[Quick-Draw]`
- [ ] Repeat COST - `[Repeat]` with cost
- [ ] Unique - `[Unique]`

**Tasks:**
- [ ] Implement keyword regex patterns in `parser/parsers/keyword-parser.ts`
- [ ] Write tests for each keyword (test infrastructure already exists in `parser/__tests__/keywords/`)
- [ ] Handle reminder text stripping (text in parentheses after keywords)

### 2.2 Trigger parser
Parse trigger conditions like "When I attack", "When you play me", "At start of your Beginning Phase".

**Common triggers:**
- [ ] "When I attack" / "When I defend"
- [ ] "When you play me" / "When I'm played"
- [ ] "When I conquer" / "When I hold"
- [ ] "When I die" / "When a friendly unit dies"
- [ ] "At start of your Beginning Phase" / "At end of your turn"
- [ ] "When you draw" / "When you discard"
- [ ] "When a player plays a spell"
- [ ] "When you move" / "When a unit moves here"

**Tasks:**
- [ ] Implement trigger pattern matching in `parser/parsers/` 
- [ ] Map to TriggerEvent types from riftbound-types
- [ ] Write tests for each trigger pattern (test infrastructure exists in `parser/__tests__/triggers/`)

### 2.3 Effect parser
Parse effect instructions like "draw 1", "deal 3 damage", "buff me", "kill a unit".

**Common effects:**
- [ ] Draw N cards
- [ ] Deal N damage to target
- [ ] Buff / spend buffs
- [ ] Kill target
- [ ] Stun target
- [ ] Ready / exhaust target
- [ ] Move unit
- [ ] Recall unit/gear
- [ ] Return to hand
- [ ] Counter a spell
- [ ] Create token (Mech, Gold, Recruit, Sprite, Sand Soldier)
- [ ] Score N points
- [ ] Channel N runes
- [ ] Add energy/power
- [ ] Modify Might (+N/-N this turn)
- [ ] Grant keyword

**Tasks:**
- [ ] Implement effect parsing in `parser/parsers/effect-parser.ts`
- [ ] Handle compound effects ("draw 1, then discard 1")
- [ ] Handle conditional effects ("if you do, buff me")
- [ ] Handle target parsing ("a friendly unit", "an enemy unit here", "all units")
- [ ] Write tests for each effect (test infrastructure exists in `parser/__tests__/effects/`)

### 2.4 Cost parser
Parse ability costs like "[2], [Exhaust]:", "[1][fury], Recycle a unit from your trash, [Exhaust]:".

**Tasks:**
- [ ] Parse energy costs (numeric in brackets)
- [ ] Parse power costs (domain symbols)
- [ ] Parse exhaust cost
- [ ] Parse sacrifice/kill costs ("kill this", "kill a gear")
- [ ] Parse recycle costs
- [ ] Parse discard costs
- [ ] Write tests (test infrastructure exists in `parser/__tests__/parsers/cost-parser.test.ts`)

### 2.5 Static ability parser
Parse continuous effects like "Your units here can't be chosen", "Friendly units get +1 Might".

**Tasks:**
- [ ] Parse might modifiers ("+N Might", "-N Might")
- [ ] Parse keyword grants ("Your units have [Tank]")
- [ ] Parse restrictions ("can't be chosen", "can't attack")
- [ ] Parse cost reductions ("costs [1] less")
- [ ] Write tests (test infrastructure exists in `parser/__tests__/static/`)

### 2.6 Activated ability parser
Parse "Cost: Effect" patterns for activated abilities.

**Tasks:**
- [ ] Detect "cost : effect" separator pattern
- [ ] Combine cost parser (2.4) with effect parser (2.3)
- [ ] Handle timing restrictions
- [ ] Write tests (test infrastructure exists in `parser/__tests__/activated/`)

### 2.7 Integration: regenerate card files with parsed abilities
- [ ] Run parser over all 769 cards
- [ ] Track parse success/failure rates
- [ ] Add parsed `abilities` arrays to card definitions
- [ ] Identify cards that need manual overrides
- [ ] Target: 80%+ parse success rate before moving to Phase 3

---

## Phase 3: Turn Flow & Phase System

> Goal: Replace the manual phase tracking with the core framework's FlowDefinition.

### 3.1 Implement FlowDefinition
Map Riftbound turn structure (rules 500-518) to the core flow system.

**Riftbound turn phases (rule 514):**
1. **Beginning Phase** (Start of Turn)
   - Score at controlled battlefields (rule 515.2)
   - Ready all permanents (rule 515.4)
   - Empty rune pool (rule 515.5)
   - "Beginning Phase" triggers fire
2. **Channel Phase**
   - Channel runes from rune deck (rule 515.8)
   - Runes produce energy and power
3. **Draw Phase**
   - Draw 1 card (rule 515.12)
   - Empty rune pool after draw (rule 160)
4. **Action Phase**
   - Open state: play cards, activate abilities, move units (rule 516)
   - Showdowns occur when battlefields become contested
   - Chain resolution for spells/abilities
5. **End of Turn Phase**
   - "End of Turn" triggers fire (rule 517)
   - Clear damage from all units
   - Clean up temporary effects

**Tasks:**
- [ ] Define `riftboundFlow: FlowDefinition` with gameSegments for setup and main game
- [ ] Implement `onBegin` hooks for each phase (ready all, empty pool, draw, score)
- [ ] Implement `onEnd` hooks for cleanup (clear damage, remove temporary)
- [ ] Implement `endIf` predicates for auto-advancing phases
- [ ] Wire flow into game definition
- [ ] Write tests for phase transitions

### 3.2 Implement setup flow
Map rules 110-118 (setup process) to a setup game segment.

**Tasks:**
- [ ] Place legend → place champion → set aside battlefields → shuffle decks → draw 4 → mulligan
- [ ] First player determination
- [ ] Mulligan rules (choose up to 2, draw replacements, recycle set-aside)
- [ ] Wire into flow definition as `startingAGame` segment

---

## Phase 4: Resource System (Runes & Rune Pool)

> Goal: Implement the channeling and resource payment system.

### 4.1 Rune channeling
Rules 153-161: Runes produce energy and power.

**Tasks:**
- [ ] Channel phase: reveal top rune, place in base, add resources to pool
- [ ] Basic runes: add 1 energy + 1 domain power
- [ ] Track exhausted vs ready runes
- [ ] Rune pool empties at end of draw phase and end of action phase (rule 160)
- [ ] Write tests

### 4.2 Cost payment
Rules 130, 560-561: Energy cost + power cost.

**Tasks:**
- [ ] Validate energy cost against rune pool
- [ ] Validate power cost (domain-specific) against rune pool
- [ ] Deduct costs from pool on card play
- [ ] Handle "rainbow" power (any domain)
- [ ] Handle additional costs (Accelerate, Equip)
- [ ] Write tests

---

## Phase 5: Card Play & Chain Resolution

> Goal: Implement the process of playing cards and resolving the chain (spell stack).

### 5.1 Playing cards (rules 554-563)
**Tasks:**
- [ ] Implement `playCard` move with validation:
  - Card must be in hand (or champion zone)
  - Must be player's turn, action phase, open state
  - Must have sufficient resources
- [ ] Units: enter board exhausted at base, trigger "When you play me"
- [ ] Gear: enter board ready at base
- [ ] Spells: go on chain, resolve effects, then go to trash
  - Action spells: only during action phase or showdowns
  - Reaction spells: any time (even during chain resolution)
- [ ] Equipment: play to base, then equip via activated ability
- [ ] Write tests

### 5.2 Chain resolution (rules 532-544)
**Tasks:**
- [ ] Implement chain as a zone/stack
- [ ] Permanents resolve immediately (no priority, rule 538)
- [ ] Spells: define relevant players, pass priority, resolve LIFO
- [ ] Triggered abilities added to chain when triggered (rule 541)
- [ ] Priority passing between relevant players
- [ ] Write tests for chain ordering and resolution

### 5.3 Showdowns (rules 545-553)
**Tasks:**
- [ ] Showdown begins when battlefield becomes contested (rule 548)
- [ ] Focus player can: play spells, activate abilities, or pass
- [ ] Focus passes between relevant players
- [ ] When all pass, proceed to combat (if units from both sides present)
- [ ] Write tests

---

## Phase 6: Movement & Battlefield Control

> Goal: Implement unit movement, battlefield control, and conquering.

### 6.1 Standard move (rules 140, 608-615)
**Tasks:**
- [ ] Units move from base → battlefield or battlefield → base
- [ ] Exhausting is the cost of moving
- [ ] Multiple units can move simultaneously to same destination
- [ ] Cannot move to battlefield with units from 2 other players
- [ ] Moving to a battlefield with enemy units → contests it → triggers showdown
- [ ] Write tests

### 6.2 Ganking (rule 722)
**Tasks:**
- [ ] Units with Ganking can move battlefield → battlefield
- [ ] Same showdown trigger rules apply
- [ ] Write tests

### 6.3 Battlefield control
**Tasks:**
- [ ] Track which player controls each battlefield
- [ ] "Contested" status when opposing units present (rule 548)
- [ ] "Conquer" when gaining control after combat (rule 629-630)
- [ ] "Hold" when maintaining control at start of turn
- [ ] Write tests

---

## Phase 7: Combat System

> Goal: Implement the full combat resolution system.

### 7.1 Combat setup (rules 620-624)
**Tasks:**
- [ ] Combat occurs at contested battlefields after showdown
- [ ] Only between units controlled by exactly 2 players
- [ ] All units at battlefield are involved (attacker/defender roles)
- [ ] Maximum of 3 units per player in combat (rule 623.2)
- [ ] Write tests

### 7.2 Combat damage (rules 626)
**Tasks:**
- [ ] Calculate total might for each side
- [ ] Higher might side wins
- [ ] Winning side deals excess damage distributed among losers
- [ ] Damage assignment rules (Tank units take damage first)
- [ ] Shield reduces damage
- [ ] Assault deals bonus damage
- [ ] Units with damage >= might are killed
- [ ] Write tests

### 7.3 Combat resolution (rules 627-628)
**Tasks:**
- [ ] Winner's surviving units remain at battlefield
- [ ] Loser's surviving units are recalled to base
- [ ] Dead units go to trash
- [ ] Winner conquers the battlefield
- [ ] Cleanup: clear damage, remove combat roles
- [ ] Write tests

---

## Phase 8: Scoring & Win Conditions

> Goal: Implement the scoring system and victory conditions.

### 8.1 Scoring (rules 629-633)
**Tasks:**
- [ ] Score by conquering (gaining control of a battlefield)
- [ ] Score by holding (controlling at start of beginning phase)
- [ ] Only score once per battlefield per turn (rule 631)
- [ ] When scoring: channel 1 rune + gain 1 victory point (rule 632)
- [ ] Write tests

### 8.2 Victory conditions
**Tasks:**
- [ ] Victory score depends on mode (8 for 1v1 duel, rule 644)
- [ ] Game ends immediately when a player reaches victory score (rule 633)
- [ ] Concession handling (rule 649-651)
- [ ] Write tests

---

## Phase 9: Keyword Implementation

> Goal: Implement game effects for all keywords.

### 9.1 Combat keywords
- [ ] **Tank** (727): Must be assigned combat damage first
- [ ] **Assault N** (719): Deals N bonus damage in combat
- [ ] **Shield N** (726): Prevents N damage

### 9.2 Movement keywords
- [ ] **Ganking** (722): Can move battlefield to battlefield
- [ ] **Accelerate** (717): Pay additional cost to enter ready

### 9.3 Play keywords
- [ ] **Action** (718): Play on your turn or in showdowns
- [ ] **Reaction** (725): Play any time, even during chain resolution
- [ ] **Hidden** (723): Play facedown at a battlefield
- [ ] **Equip** (from gear cards): Attach to a unit

### 9.4 Trigger keywords
- [ ] **Deathknell** (720): Trigger when a friendly unit dies
- [ ] **Legion N** (724): Trigger when N+ friendly units at same location
- [ ] **Vision** (729): When played, look at top of deck, may recycle

### 9.5 State keywords
- [ ] **Temporary** (728): Kill this at start of controller's beginning phase
- [ ] **Unique** (from card text): Only one copy on board
- [ ] **Weaponmaster** (from card text): Combat bonus with equipment
- [ ] **Deflect** (721): Opponents must pay rainbow to choose with spell/ability

### 9.6 Write tests for each keyword

---

## Phase 10: Modes of Play

> Goal: Support different game modes beyond 1v1.

### 10.1 1v1 Duel (rule 644)
- [ ] 2 battlefields, victory score 8, first player skips draw on turn 1
- [ ] This is the default and should work after phases 1-9

### 10.2 1v1 Match (rule 645)
- [ ] Best of 3 duels with sideboard

### 10.3 FFA3 Skirmish (rule 646)
- [ ] 3 players, 3 battlefields, victory score 6

### 10.4 FFA4 War (rule 647)
- [ ] 4 players, 4 battlefields, victory score 5

### 10.5 2v2 Magma Chamber (rule 648)
- [ ] 2 teams of 2, shared battlefields, team victory score 12

---

## Phase 11: Deck Validation

> Goal: Enforce deck construction rules.

**Tasks (rules 101-103):**
- [ ] Main deck: at least 40 cards
- [ ] Max 3 copies of same named card
- [ ] Domain identity must match champion legend
- [ ] Max 3 signature cards matching champion tag
- [ ] Rune deck: exactly 12 runes matching domain identity
- [ ] 1 champion legend
- [ ] 1 chosen champion (must match legend's champion tag)
- [ ] Battlefields matching domain identity
- [ ] Write validation function and tests

---

## Phase 12: Player View & Information Hiding

> Goal: Implement proper information hiding for multiplayer.

**Tasks (rules 127):**
- [ ] Hand: private (only owner sees)
- [ ] Main deck: secret (no one sees order)
- [ ] Rune deck: secret (no one sees order)
- [ ] Trash: public
- [ ] Banishment: public
- [ ] Board: public
- [ ] Facedown cards (Hidden): private to controller
- [ ] Implement `playerView` function that filters state
- [ ] Write tests

---

## Priority Order

For a playable game, implement in this order:
1. **Phase 3** (Turn Flow) - foundation for everything
2. **Phase 4** (Resources) - needed to play cards
3. **Phase 5** (Card Play & Chain) - core gameplay
4. **Phase 6** (Movement & Battlefields) - core gameplay
5. **Phase 7** (Combat) - core gameplay
6. **Phase 8** (Scoring) - win condition
7. **Phase 9** (Keywords) - card variety
8. **Phase 2** (Parser) - can be done in parallel with 3-8
9. **Phase 1** (Card Data) - can be done in parallel
10. **Phase 11** (Deck Validation) - polish
11. **Phase 12** (Player View) - polish
12. **Phase 10** (Modes of Play) - expansion
