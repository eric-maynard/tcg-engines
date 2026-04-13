# Rules Audit Test Helper API

The helpers file at `packages/riftbound-engine/src/__tests__/rules-audit/helpers.ts` provides a small domain-specific API for constructing game states and asserting behavior. These helpers exist because the real game definition is too heavy for per-rule tests.

## Design Goals

1. **Minimal state construction.** A test should build exactly what the rule needs — not a full deck, not a real legend, not a full battlefield row unless the rule needs them.
2. **Direct state manipulation.** Bypass move validation for setup. The goal is to test the rule, not the move's `canMake`.
3. **Readable assertions.** `getZone(state, "player-1", "base")` is clearer than chained optional accesses into nested state objects.
4. **Deterministic.** No RNG. Seeds are fixed if needed.

## API Surface

### State Construction

```typescript
createMinimalGameState(overrides?: Partial<StateShape>): RiftboundGameState
```

Creates a game state with:
- 2 players (`player-1`, `player-2`) with `victoryPoints: 0`, empty hands, empty decks
- Empty battlefield row
- `currentPlayer: "player-1"`, `turn: 1`, `phase: "main"`
- Empty rune pools (`energy: 0, power: {}`)
- Empty zones (base, runePool, trash, banishment, legendZone, championZone, hand)

Overrides are deep-merged. Examples:

```typescript
// Minimal state for a draw-phase test
const state = createMinimalGameState({
  phase: "draw",
  runePools: { "player-1": { energy: 3, power: { fury: 1 } } },
});

// State with a unit in base
const state = createMinimalGameState();
createCard(state, "lonely-poro", {
  zone: "base",
  owner: "player-1",
  cardType: "unit",
  might: 2,
});
```

### Card Creation

```typescript
createCard(
  state: RiftboundGameState,
  cardId: string,
  params: {
    zone: "base" | "hand" | "runePool" | "trash" | "banishment" | "legendZone" | "championZone" | `battlefield-${string}`;
    owner: PlayerId;
    cardType: "unit" | "gear" | "spell" | "rune" | "battlefield" | "legend" | "equipment";
    might?: number;           // units
    abilities?: Ability[];    // inline ability definitions for the test
    keywords?: string[];      // parsed keywords
    energyCost?: number;
    domain?: string[];
    meta?: Partial<RiftboundCardMeta>; // exhausted, damaged, etc.
  }
): void
```

Registers the card in the card definition registry AND places it in the zone. Tests don't need to touch the registry directly — helpers handle it.

```typescript
createBattlefield(
  state: RiftboundGameState,
  battlefieldId: string,
  params: {
    controller: PlayerId | null;
    contested?: boolean;
    abilities?: Ability[];
  }
): void
```

Creates a battlefield entry in `state.battlefields` AND registers it as a card in the battlefield row.

### State Transitions

```typescript
advancePhase(state: RiftboundGameState, targetPhase: TurnPhase): void
```

Runs all phase hooks from the current phase up to (and including the `onBegin` of) the target phase. Uses the real flow definition's hook functions, so `onEnd` and `onBegin` side effects fire correctly.

```typescript
applyMove(
  state: RiftboundGameState,
  moveName: string,
  params: Record<string, unknown>
): { success: boolean; error?: string }
```

Runs a move through the engine's reducer. **Does not call `canMake`** — tests should assert legality separately by calling `checkMoveLegal()`. This separation lets you test "the reducer does the right thing even if the condition is wrong" and "the condition rejects the move" independently.

```typescript
checkMoveLegal(
  state: RiftboundGameState,
  moveName: string,
  params: Record<string, unknown>
): boolean
```

Calls only the move's `canMake` check. Returns true/false.

```typescript
fireTrigger(
  state: RiftboundGameState,
  event: GameEvent
): void
```

Manually fires a game event and runs the trigger runner. Used for tests that assert "when X happens, trigger Y fires" without going through a real move that would emit the event.

### Zone Readers

```typescript
getZone(
  state: RiftboundGameState,
  player: PlayerId,
  zone: ZoneName
): CardId[]
```

Returns the list of card IDs in a zone for a player. Shorthand for navigating the state.

```typescript
getRunesOnBoard(
  state: RiftboundGameState,
  player: PlayerId
): CardId[]
```

Returns cards where `cardType === "rune"` AND zone is `"runePool"` (i.e., the physical rune cards on the board).

```typescript
getCardsInZone(
  state: RiftboundGameState,
  zone: ZoneName,
  player?: PlayerId
): CardId[]
```

General-purpose zone reader.

### Trigger Assertions

```typescript
assertTriggered(
  state: RiftboundGameState,
  sourceCardId: string,
  triggerType: TriggerType
): boolean
```

Checks if a specific card's triggered ability fired during the most recent state transition. Uses the trigger runner's internal log.

```typescript
getPendingTriggers(state: RiftboundGameState): TriggerInstance[]
```

Returns the list of triggers that have been queued but not yet resolved.

### Chain/Showdown State

```typescript
getInteractionState(state: RiftboundGameState): InteractionState | null
```

Returns the current interaction state (chain, showdown, pending-choice, etc.) or null if none active.

## Example Usage

Here's a complete test file showing the helpers in action:

```typescript
import { describe, expect, it } from "bun:test";
import {
  createMinimalGameState,
  createCard,
  createBattlefield,
  advancePhase,
  applyMove,
  getZone,
  getInteractionState,
} from "./helpers";

describe("Rule 548.2: Showdown on move to uncontrolled battlefield", () => {
  it("opens a showdown when a unit moves to an empty uncontrolled battlefield", () => {
    const state = createMinimalGameState({ phase: "main" });
    
    createCard(state, "poro", {
      zone: "base",
      owner: "player-1",
      cardType: "unit",
      might: 2,
    });
    
    createBattlefield(state, "bf-1", { controller: null, contested: false });

    // Move unit to battlefield
    const result = applyMove(state, "standardMove", {
      cardId: "poro",
      battlefieldId: "bf-1",
    });
    
    expect(result.success).toBe(true);
    
    // Rule 548.2: after the move, a showdown should be open at bf-1
    const interaction = getInteractionState(state);
    expect(interaction?.type).toBe("showdown");
    expect(interaction?.battlefieldId).toBe("bf-1");
  });
});
```

## Implementing the Helpers

If the helpers don't exist yet, Phase 2's first task is to create them at:

```
packages/riftbound-engine/src/__tests__/rules-audit/helpers.ts
```

The implementation should:
1. Re-use existing test utilities where possible (e.g., `@tcg/core/testing`)
2. Wrap raw state construction in small, readable functions
3. Export everything as named exports
4. Have its own unit tests (meta-tests) verifying the helpers behave correctly

**Do not modify the real game definition** to make helpers work. If a helper needs to bypass validation, it should call the lower-level state mutators directly (draft.players, draft.battlefields, etc.) — not modify the real move or flow definitions.
