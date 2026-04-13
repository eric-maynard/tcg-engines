# Rule Audit Test Template

Every rule audit test file follows this structure.

## File Location

```
packages/riftbound-engine/src/__tests__/rules-audit/<section>.test.ts
```

Sections:
- `turn-structure.test.ts` — Rules 515-517
- `runes-and-pools.test.ts` — Rules 153-161, 594
- `playing-cards.test.ts` — Rules 554-563
- `abilities.test.ts` — Rules 564-590 (static, triggered, activated, replacement)
- `chain.test.ts` — Rules 532-544
- `combat.test.ts` — Rules 620-629
- `showdowns.test.ts` — Rules 545-553, 548.2, 516.5
- `movement.test.ts` — Rules 608-619
- `scoring.test.ts` — Rules 630-632
- `win-conditions.test.ts` — Rules 640-660
- `keywords.test.ts` — Each keyword's rules
- `zones-and-targeting.test.ts` — Rules 100-152

## Test File Template

```typescript
/**
 * Rules Audit: <Section Name>
 *
 * Each test targets one formal rule and verifies the engine implements it
 * correctly. Tests do NOT rely on the engine's own move legality checks —
 * they construct state directly and assert outcomes from first principles.
 *
 * Rule citations reference `.claude/skills/riftbound-rules/references/*.md`.
 */

import { describe, expect, it } from "bun:test";
import {
  createMinimalGameState,
  createCard,
  createBattlefield,
  advancePhase,
  applyMove,
  getZone,
  getRunesOnBoard,
  assertTriggered,
} from "./helpers";

describe("Rule 515.4.d: Rune Pool empties at end of Draw Phase", () => {
  it("resets energy counter to 0", () => {
    const state = createMinimalGameState({
      turn: 1,
      phase: "draw",
      runePools: { "player-1": { energy: 3, power: {} } },
    });
    advancePhase(state, "main");
    expect(state.runePools["player-1"].energy).toBe(0);
  });

  it("resets power counters to empty object", () => {
    const state = createMinimalGameState({
      turn: 1,
      phase: "draw",
      runePools: { "player-1": { energy: 0, power: { fury: 2, calm: 1 } } },
    });
    advancePhase(state, "main");
    expect(state.runePools["player-1"].power).toEqual({});
  });

  it("does NOT move rune cards off the board (rule 159 defines 'Rune Pool' as conceptual)", () => {
    const state = createMinimalGameState({ phase: "draw" });
    createCard(state, "rune-1", { zone: "runePool", owner: "player-1", cardType: "rune" });
    createCard(state, "rune-2", { zone: "runePool", owner: "player-1", cardType: "rune" });
    advancePhase(state, "main");
    expect(getRunesOnBoard(state, "player-1")).toHaveLength(2);
  });
});

describe("Rule 515.3.b.4: Second player channels one extra rune on their first turn (644.7)", () => {
  it("player-2 channels 3 runes on turn 2 (their first turn)", () => {
    const state = createMinimalGameState({ turn: 1, currentPlayer: "player-1" });
    advancePhase(state, "ending"); // end player-1's turn
    advancePhase(state, "channel"); // player-2's channel phase
    expect(getRunesOnBoard(state, "player-2")).toHaveLength(3);
  });

  it("player-2 channels 2 runes on subsequent turns", () => {
    const state = createMinimalGameState({ turn: 3, currentPlayer: "player-2" });
    advancePhase(state, "channel");
    expect(getRunesOnBoard(state, "player-2")).toHaveLength(5); // 3 from turn 2 + 2 from turn 4
  });
});
```

## Naming Convention

**Every `describe` block starts with `"Rule <number>:"`** so grep and test filters work:

```bash
# Run all tests for rule 515
bun test packages/riftbound-engine/src/__tests__/rules-audit -t "Rule 515"

# Run a specific rule
bun test -t "Rule 548.2"
```

## What Each Test Must Do

1. **Construct minimal state.** Only include what the rule needs. Don't use real decks — create cards inline.
2. **Trigger the specific condition the rule describes.** If the rule says "at end of draw phase", call `advancePhase(state, "main")` to run `draw.onEnd`.
3. **Assert from first principles.** Don't ask the engine "is this legal?" — check the actual game state directly.
4. **Cite the rule in a comment** if the assertion is non-obvious.
5. **Keep tests independent.** Each test creates its own state. No shared setup except via helpers.

## What NOT to Do

- ❌ Use the real `riftboundDefinition` with real decks — too much state, slow, obscures the rule
- ❌ Rely on the engine's `availableMoves` list — the whole point is to NOT trust the engine
- ❌ Test multiple rules in one `it()` block — one rule per test
- ❌ Use `expect(someCard.abilities.length).toBeGreaterThan(0)` — that's a card parser test, not a rules test
- ❌ Skip a rule as "too hard" — write `it.todo("Rule X.Y.Z: reason why this is hard")` so it stays on the radar

## Handling Complex Rules

Some rules span multiple behaviors. Split them:

```typescript
describe("Rule 626: Combat damage", () => {
  describe("626.1.d: Attacker distributes damage first, then defender", () => {
    it("attacker distributes before defender, even though both deal full damage", () => {
      // ...
    });
  });

  describe("626.1.d.1: Tank units must be assigned lethal damage first", () => {
    it("assigns lethal to Tank before non-Tank defenders", () => {
      // ...
    });

    it("falls back to non-Tank if Tank already dead", () => {
      // ...
    });
  });
});
```

## Ambiguous Rules

If a rule is ambiguous and you can't decide the expected outcome, write a `it.todo` with the ambiguity:

```typescript
it.todo(
  "Rule 540.2: Does passing priority 'count' if the player has no legal actions? " +
  "Observed engine behavior differs from video guide [45:12]. Needs human review."
);
```

Do NOT make up an answer. The compliance report will flag unresolved ambiguities.
