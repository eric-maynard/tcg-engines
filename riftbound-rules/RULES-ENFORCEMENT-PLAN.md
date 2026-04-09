# Riftbound Rules Enforcement Plan

## Problem Statement

The engine is a state manipulation framework. Cards can be moved, flags set, counters incremented — but nothing stops illegal plays. There is no game here yet: just a board you can push pieces around on.

This plan turns the tabletop simulator into a rules engine.

## Dependency Chain

```
Cards get abilities ──► Moves check conditions ──► Keywords wire in ──► Triggers fire ──► Combat resolves
       (A)                      (B)                     (C)                (D)               (E)
```

Each step depends on the one before it. No shortcuts.

---

## Step A: Attach Parsed Abilities to Cards

> Without this, keywords/triggers/statics are just text strings. Nothing downstream works.

### A.1: Run parser on all cards at build time
- Modify `generate-from-gallery.py` (or create a new `generate-abilities.ts` script)
- For each card definition file, call `parseAbilities(card.rulesText)` and write the result into the `abilities` field
- Cards that fail to parse keep `abilities: []` with a `// TODO: manual override` comment

### A.2: Create manual overrides for parser failures
- The parser handles 77% of cards. The remaining 23% need manual ability definitions.
- Create `packages/riftbound-cards/src/cards/overrides/` directory
- Each override file patches a specific card's abilities
- Priority: cards that appear in starter decks or are tournament-relevant

### A.3: Expose card definitions to the engine
- The engine currently has `unknown` as its `TCardDefinition` generic parameter
- Wire it to use the real card types from `@tcg/riftbound-types/cards`
- Register cards via `gameDefinition.cards` so the engine can look up card properties (cost, might, keywords, abilities) during move execution

### A.4: Tests
- [ ] Every card has either parsed abilities or a manual override
- [ ] `getAllCards()` returns cards where 90%+ have non-empty `abilities` arrays
- [ ] Cards are registered and queryable in the engine

---

## Step B: Move Conditions (Rules Validation)

> Currently every condition is `state.status !== "playing"`. Moves need to check real game rules.

### B.1: Card-in-zone validation
Every card play move must verify the card is where it should be:

| Move | Required zone |
|------|--------------|
| `playUnit` | hand |
| `playGear` | hand |
| `playSpell` | hand |
| `playFromChampionZone` | championZone |
| `standardMove` | base or battlefield (unit must exist there) |
| `discardCard` | hand |
| `recycleCard` | any player zone |

Implementation: `context.zones.getCardZone(cardId) === expectedZone`

### B.2: Resource cost validation
Before playing a card, check the player can afford it:

```typescript
condition: (state, context) => {
  const card = context.cards.getCardDefinition(cardId); // needs Step A.3
  const pool = state.runePools[playerId];
  if (card.energyCost && pool.energy < card.energyCost) return false;
  if (card.powerCost) {
    for (const domain of card.powerCost) {
      if ((pool.power[domain] ?? 0) < 1) return false;
    }
  }
  return true;
}
```

Auto-deduct cost in the reducer after validation passes.

### B.3: Phase/timing validation
| Move | Allowed timing |
|------|---------------|
| `playUnit`, `playGear` | Action phase, neutral open state |
| `playSpell` (Action) | Action phase or during showdown |
| `playSpell` (Reaction) | Any time (even during chain) |
| `standardMove` | Action phase, not during showdown or chain |
| `endTurn` | Action phase only |
| `channelRunes` | Channel phase (auto, but manual override possible) |

Implementation: Read `context.flow.currentPhase` and match against allowed phases.

### B.4: Exhaustion validation
- `standardMove`: all units in `unitIds` must NOT be exhausted
- `exhaustRune`: rune must NOT already be exhausted
- Activated abilities: card must NOT be exhausted (if cost includes exhaust)

### B.5: Ownership validation
- Players can only play their own cards
- Players can only move their own units
- Players can only activate abilities on cards they control

### B.6: Tests
- [ ] Playing a card not in hand fails
- [ ] Playing a card you can't afford fails
- [ ] Playing a card in the wrong phase fails
- [ ] Moving an exhausted unit fails
- [ ] Playing an opponent's card fails
- [ ] Each move has at least one positive and one negative test

---

## Step C: Wire Keywords into Moves

> Keywords exist as helper functions. They need to be called at the right time.

### C.1: Combat keywords → combat moves
- `assignDamage` reducer: call `applyShield(damage, shieldValue)` before adding damage
- `assignDamage` condition: enforce `sortByTankPriority()` ordering — Tank units must receive lethal damage before non-Tank units
- `resolveCombat` reducer: use `calculateCombatMight()` to add Assault bonus when computing attacker total

### C.2: Movement keywords → movement moves
- `standardMove` condition: call `canMoveToLocation()` — reject battlefield→battlefield without Ganking
- `gankingMove` condition: verify unit actually has Ganking keyword (look up card definition from Step A)

### C.3: Play keywords → card play moves
- `playUnit` reducer: call `shouldEnterReady(paidAccelerate)` — if Accelerate was paid, don't set exhausted
- `playSpell` condition: call `canPlaySpellAtTiming()` — check Action vs Reaction timing
- `playUnit` condition: if card has Deflect, targeting it costs extra rainbow power

### C.4: State keywords → flow hooks
- `Temporary`: in the `beginning` phase `onBegin` hook, kill all units with Temporary keyword controlled by the turn player
- `Vision`: after playing a permanent with Vision, trigger look-at-top-of-deck effect

### C.5: Tests
- [ ] Shield reduces incoming damage
- [ ] Tank forces damage assignment order
- [ ] Assault adds Might when attacking
- [ ] Ganking allows battlefield→battlefield move
- [ ] Non-Ganking rejects battlefield→battlefield move
- [ ] Accelerate makes unit enter ready
- [ ] Temporary unit dies at start of next turn
- [ ] Action spells can't be played on opponent's turn
- [ ] Reaction spells can be played any time

---

## Step D: Triggered Abilities

> "When I attack, draw 1" needs to actually draw a card.

### D.1: Event system
Create an event bus that fires when game actions occur:

```typescript
type GameEvent =
  | { type: "unit-played"; cardId: CardId; playerId: PlayerId }
  | { type: "unit-attacked"; cardId: CardId; battlefieldId: string }
  | { type: "unit-defended"; cardId: CardId }
  | { type: "unit-died"; cardId: CardId; owner: PlayerId }
  | { type: "unit-moved"; cardId: CardId; from: ZoneId; to: ZoneId }
  | { type: "battlefield-conquered"; battlefieldId: string; playerId: PlayerId }
  | { type: "battlefield-held"; battlefieldId: string; playerId: PlayerId }
  | { type: "spell-played"; cardId: CardId; playerId: PlayerId }
  | { type: "card-discarded"; cardId: CardId; playerId: PlayerId }
  | { type: "damage-dealt"; targetId: CardId; amount: number; sourceId?: CardId };
```

### D.2: Trigger matching
After each game event, scan all cards in play for matching triggered abilities:
1. Get all cards on the board (base + battlefields)
2. For each card, check its `abilities` array for triggered abilities
3. Match trigger event type against the event that just occurred
4. Check trigger conditions (if any)
5. Execute the trigger's effect

### D.3: Effect execution engine
Create an effect executor that can resolve any `Effect` type:

```typescript
function executeEffect(effect: Effect, context: MoveContext): void {
  switch (effect.type) {
    case "draw": context.zones.drawCards({ count: effect.amount, ... }); break;
    case "damage": context.counters.addCounter(targetId, "damage", amount); break;
    case "kill": context.zones.moveCard({ cardId, targetZoneId: "trash" }); break;
    case "buff": context.counters.setFlag(cardId, "buffed", true); break;
    case "score": draft.players[playerId].victoryPoints += amount; break;
    // ... etc for all 30+ effect types
  }
}
```

### D.4: Deathknell keyword
- When a friendly unit dies, check all other friendly units for Deathknell
- Fire Deathknell effects

### D.5: Legion keyword
- After playing a card, check if the "played another card this turn" condition is met
- Fire Legion effects

### D.6: Vision keyword
- After playing a permanent with Vision, look at top card of deck, offer recycle choice

### D.7: Tests
- [ ] "When you play me, draw 1" draws a card when unit is played
- [ ] "When I attack, deal 3" deals damage when unit attacks
- [ ] "When I conquer, you may kill a gear" triggers on conquer
- [ ] "When I hold, score 1 point" triggers at beginning phase
- [ ] Deathknell triggers when a friendly unit dies
- [ ] Legion triggers when condition met
- [ ] Triggers don't fire from wrong zone (trash, hand)

---

## Step E: Automated Combat Resolution

> Currently combat is fully manual. Need: showdown window, damage calculation, death checks, winner determination.

### E.1: Combat initiation
When a `standardMove` puts opposing units at the same battlefield:
1. Mark battlefield as contested
2. Enter showdown state
3. Give focus to the moving player

### E.2: Showdown window
During showdown, players with Focus can:
- Play Action or Reaction spells
- Activate abilities
- Pass focus

When all relevant players pass, proceed to combat damage.

### E.3: Combat damage calculation
```typescript
function calculateCombatResult(attackers: Unit[], defenders: Unit[]): CombatResult {
  const attackerTotal = sum(attackers.map(u => calculateCombatMight(u.might, u.assault, true)));
  const defenderTotal = sum(defenders.map(d => d.might));
  
  const winner = attackerTotal > defenderTotal ? "attacker" : 
                 defenderTotal > attackerTotal ? "defender" : "tie";
  
  // Distribute excess damage to losers (Tank priority)
  const excessDamage = Math.abs(attackerTotal - defenderTotal);
  // ... damage assignment with Tank/Shield
}
```

### E.4: Combat resolution
After damage calculation:
1. Kill units with damage >= might
2. Winner's units stay at battlefield
3. Loser's surviving units recalled to base
4. Winner conquers the battlefield
5. Clear combat state (damage, roles)
6. Fire "when I conquer" / "when I die" triggers

### E.5: Death state-based check
After any state change, check all units:
- If `damage >= might`, kill the unit (move to trash)
- This is a "cleanup" operation per rule 520

### E.6: Tests
- [ ] Moving to battlefield with enemy units triggers showdown
- [ ] Combat totals Might correctly (with Assault)
- [ ] Higher Might side wins
- [ ] Tank takes damage first
- [ ] Shield reduces damage
- [ ] Dead units go to trash
- [ ] Winner conquers battlefield
- [ ] Loser is recalled to base
- [ ] Tied combat: attacker recalled
- [ ] Triggers fire after combat (conquer, die)

---

## Step F: Integration & Game Modes

> After A-E, make game modes actually work.

### F.1: Wire game mode into setup
- `createInitialState` already accepts mode. Ensure `victoryScore` uses mode config.
- Validate player count against mode's `playerCount`.
- Set battlefield count from mode config.

### F.2: First player skip draw
- In `duel` and `match` modes, first player skips their first draw phase (rule 644.5)
- Add a tracker `isFirstTurn` and skip draw in the flow hook

### F.3: Player view
- Wire zone visibility configs into actual filtering
- Verify via test that opponent's hand contents are hidden

### F.4: Tests
- [ ] Duel mode: first player doesn't draw on turn 1
- [ ] FFA3: 3 players, 6 VP to win
- [ ] Opponent's hand is hidden in player view
- [ ] Can't start FFA3 with 2 players

---

## Priority Order

```
A (abilities on cards)     ← FOUNDATION, do first
  ↓
B (move conditions)        ← highest gameplay impact
  ↓
C (keywords wired in)      ← makes combat meaningful
  ↓
D (triggered abilities)    ← makes cards interesting
  ↓
E (combat resolution)      ← makes the game playable end-to-end
  ↓
F (modes & polish)         ← completeness
```

## Estimated Scope

| Step | Files to create/modify | New tests | Complexity |
|------|----------------------|-----------|------------|
| A | 3-5 files + regenerate 769 cards | ~15 | Medium |
| B | 8 move files + validators | ~40 | Medium |
| C | 8 move files + flow hooks | ~20 | Medium |
| D | 3 new files (events, trigger matcher, effect executor) | ~30 | High |
| E | 2-3 new files (combat resolver, showdown manager) | ~25 | High |
| F | 4-5 files | ~15 | Low |

Total: ~145 new tests, ~20 files modified/created.
