# Riftbound Rules Primer (for engine audit tests)

**Read this before writing any rule audit test.** Many rule terms have precise definitions that differ from their colloquial meaning. Misinterpretation produces false-positive failures.

## Resource Model (rules 153-161)

- **Rune cards** accumulate on the board permanently. They do NOT return to the deck at end of turn.
- **Rune Pool** (rule 159) is a **conceptual Energy/Power reserve**, NOT the zone of physical rune cards. Rule 159.1: "The Rune Pool is a conceptual collection of a player's available Energy and Power."
- **"Rune Pool empties"** (rules 515.4.d, 517.2.c, 160) means **unspent Energy/Power reset to 0**. Rule 160.1: "Any unspent Energy or Power are lost." It does NOT mean rune cards return to the deck.
- **Rune cards stay on the board** (rule 154.1.a: "remaining on the Board until Recycled or otherwise removed").
- **Channel phase** (rule 515.3) moves 2 runes from rune deck → board each turn. First player channels 2 on turn 1; second player channels 3 on their first turn (rule 644.7 catch-up).
- **Recycle** (rule 594) is a specific game action where a card goes to the bottom of its deck. Rune Pool emptying is NOT recycling.

**Test pattern for "rune pool empties" rules:**
```typescript
it("Rule 515.4.d: energy counter resets, rune cards stay on board", () => {
  const state = createMinimalGameState({
    phase: "draw",
    runesOnBoard: 4,
    energyInPool: 3,
  });
  advancePhase(state, "main");
  expect(state.runePools["player-1"].energy).toBe(0);    // counter reset ✓
  expect(getRunesOnBoard(state, "player-1").length).toBe(4); // cards stay ✓
});
```

## Turn Structure (rules 515-517)

```
Awaken   (515.1) → Ready all cards, clear stun
Beginning(515.2) → Kill Temporary units, Hold scoring, triggers
Channel  (515.3) → Channel 2 runes from rune deck to board
Draw     (515.4) → Draw 1 card, Burn Out if deck empty, Rune Pool empties
Main     (516)   → Player actions: play cards, activate abilities, move, combat
Ending   (517)   → Clear damage, expire turn-scoped effects, Rune Pools empty again
```

## Scoring (rules 630-632)

- **Conquer** (630.1): Gain control of a battlefield you haven't scored this turn
- **Hold** (630.2): You control a battlefield during your Beginning Phase
- **Score** (632): Awards up to 1 VP per battlefield per turn
- **Final Point** (632.1.b): When 1 point from winning:
  - Hold: always scores (632.1.b.1)
  - Conquer: only scores if you conquered every battlefield this turn; otherwise draw a card (632.1.b.2)
- **Score triggers** (632.2): Conquer and Hold each fire battlefield abilities. At most once per battlefield per turn (632.2.c).

## Showdowns (rules 545-553, 548.2)

- **Rule 548.2**: If control of a battlefield is contested and it was uncontrolled when it became contested, a Showdown opens during Cleanup at end of that move.
- **Rule 516.5.b**: A Showdown occurs when units move to an empty battlefield (non-combat showdown).
- Showdowns are priority windows where both players can play Action/Reaction spells before conquer resolves.
- Against a Goldfish (auto-pass), showdowns resolve instantly — but they should still be entered for correctness.

**Test pattern for showdown rules:**
```typescript
it("Rule 548.2: showdown starts when unit moves to uncontrolled empty battlefield", () => {
  const state = createMinimalGameState({ phase: "main" });
  createCard(state, "unit-1", { zone: "base", owner: "player-1" });
  createBattlefield(state, "bf-1", { controller: null, contested: false });
  
  applyMove(state, "standardMove", { cardId: "unit-1", battlefieldId: "bf-1" });
  
  // Per rule 548.2: unit moved to uncontrolled battlefield → showdown opens
  expect(state.interactionState?.type).toBe("showdown");
  expect(state.interactionState?.battlefieldId).toBe("bf-1");
});
```

## Combat (rule 626)

- **Attacker distributes damage first** (626.1.d), then defender.
- Both sides deal their **full Might** as damage — NOT "winner deals excess."
- **Tank** units must be assigned lethal damage first (626.1.d.1).
- **Lethal damage** = damage equal to or exceeding the unit's Might (626.1.d.1.a).
- Damage must be assigned in full to one unit before moving to the next (626.1.d.2).
- Outcome: all defenders dead + attacker survives → conquer; otherwise → attacker recalled.

## Chain System (rules 532-544)

- LIFO spell stack with priority passing.
- Neutral Closed state → opponent can respond with Reaction → chain grows.
- When both pass → top item resolves → priority resets → repeat until empty.

## Triggered Abilities (rule 583)

- Fire when their condition is met (e.g., "When you hold here", "When you conquer").
- Check ALL cards on board including legend zone and champion zone.
- Optional triggers ("you may") must still be offered to the player.

## Zone Targeting Rules

When writing tests that verify target legality:

| Zone | On "the board"? | Can be targeted by "friendly unit" effects? |
|------|----------------|---------------------------------------------|
| Base | Yes | Yes |
| Battlefield zones | Yes | Yes |
| Champion zone | **No** — champions must be played first | **No** |
| Legend zone | **No** — legends cannot leave their zone | **No** for unit/permanent effects (YES for legend ability activation) |
| Hand, deck, trash, banishment | No | No (unless card explicitly says "from hand", "from trash", etc.) |

## Common Mistakes to Avoid in Test Authoring

1. **Conflating "Rune Pool" with the zone of rune cards** — always check rule 159 before writing rune-related tests
2. **Treating champion zone as "on the board"** — champions aren't targetable until played
3. **Assuming damage is simultaneous** — attacker distributes FIRST, then defender
4. **Forgetting "optional triggers still must fire"** — the player declining is a separate step from the trigger firing
5. **Asserting exact player turn counters on turn 1** — rule 644.7 gives the second player +1 rune on their first turn
6. **Testing "prevent X" without considering replacement effect duration** — `"next"` duration means one-shot; `"turn"` means for rest of turn

## Before Flagging a Rule Violation

1. Read the EXACT rule text from the reference files (not just the number)
2. Read all sub-rules (e.g., 515.4.d has context from 515.4.a-c)
3. Check defined terms (rule 159 defines "Rune Pool")
4. Ask: does my test match the GAME DESIGN intent or just my initial reading?
5. When in doubt, mark the test as `it.todo("UNCERTAIN: rule X is ambiguous")` instead of asserting a specific outcome
