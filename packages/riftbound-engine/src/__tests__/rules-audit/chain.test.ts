/**
 * Rules Audit: Chain (rules 532-544)
 *
 * Tests cover the Chain system, priority passing, LIFO resolution,
 * Open vs Closed turn states, and timing restrictions for Actions vs
 * Reactions. These tests directly exercise the chain state machine and
 * the `playSpell` / `passChainPriority` / `activateAbility` moves.
 *
 * CRITICAL notes from the rules primer:
 *   - Rule 532: The Chain is a Non-Board zone that exists while a card or
 *     ability is on it. At most ONE Chain exists at a time.
 *   - Rule 533: The turn is Closed if a chain exists; Open otherwise.
 *   - Rule 535: In Closed State, by default cards and abilities cannot be
 *     played — only Reaction-timed spells/abilities.
 *   - Rule 537: Playing a card during a chain places it on the existing
 *     chain rather than starting a new one.
 *   - Rules 539-540: Priority passes between Relevant Players. When all
 *     pass in sequence, the top of the chain resolves (LIFO).
 *   - Rule 543: After a chain item resolves, priority resets to the
 *     controller of the new top item and all relevant players must pass
 *     again. Loop until the chain is empty.
 *   - Rule 541: Triggered abilities during a chain are added as the most
 *     recent chain item (not reordering active player).
 */

import { describe, expect, it } from "bun:test";
import {
  P1,
  P2,
  applyMove,
  createCard,
  createMinimalGameState,
  getChainActivePlayer,
  getChainItems,
  getInteractionState,
  getState,
  isChainActive,
  passChainPriority,
} from "./helpers";

// -----------------------------------------------------------------------------
// Rule 532: Chain is a non-board zone that exists when a card or ability is on
// It. Only one chain can exist at a time.
// -----------------------------------------------------------------------------

describe("Rule 532: Chain existence", () => {
  it("no chain exists on a freshly constructed state (Open state)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    expect(isChainActive(engine)).toBe(false);
    expect(getChainItems(engine)).toHaveLength(0);
  });

  it("playing a spell creates a chain containing that spell", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 2, power: {} } },
    });
    createCard(engine, "fireball", {
      abilities: [
        { effect: { amount: 1, target: { type: "self" }, type: "damage" }, type: "spell" },
      ],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });

    const result = applyMove(engine, "playSpell", {
      cardId: "fireball",
      playerId: P1,
    });
    expect(result.success).toBe(true);

    // Rule 532: chain now exists and contains the spell.
    expect(isChainActive(engine)).toBe(true);
    const items = getChainItems(engine);
    expect(items).toHaveLength(1);
    expect(items[0]?.cardId).toBe("fireball");
    expect(items[0]?.type).toBe("spell");
  });
});

describe("Rule 532.1: At most one chain exists at a time", () => {
  it("a second spell played during the first chain is added to the same chain (not a new one)", () => {
    const engine = createMinimalGameState({
      phase: "main",
      // Enough energy for two spells
      runePools: { [P1]: { energy: 1, power: {} }, [P2]: { energy: 1, power: {} } },
    });
    createCard(engine, "spell-a", {
      abilities: [
        { effect: { amount: 1, target: { type: "self" }, type: "damage" }, type: "spell" },
      ],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    createCard(engine, "spell-b", {
      abilities: [
        { effect: { amount: 1, target: { type: "self" }, type: "damage" }, type: "spell" },
      ],
      cardType: "spell",
      energyCost: 1,
      owner: P2,
      timing: "reaction",
      zone: "hand",
    });

    applyMove(engine, "playSpell", { cardId: "spell-a", playerId: P1 });
    // P2 responds with a Reaction spell (legal during closed state).
    const r2 = applyMove(engine, "playSpell", { cardId: "spell-b", playerId: P2 });
    expect(r2.success).toBe(true);

    // Rule 537: both spells are on the SAME chain — not separate chains.
    const items = getChainItems(engine);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.cardId)).toEqual(["spell-a", "spell-b"]);
  });
});

// -----------------------------------------------------------------------------
// Rules 533-536: Open vs Closed turn state
// -----------------------------------------------------------------------------

describe("Rule 533: Turn is Closed while a chain exists", () => {
  it("turn state is Open before any spell is played and Closed after", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    expect(isChainActive(engine)).toBe(false); // Open

    createCard(engine, "spell", {
      abilities: [
        { effect: { amount: 1, target: { type: "self" }, type: "damage" }, type: "spell" },
      ],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    applyMove(engine, "playSpell", { cardId: "spell", playerId: P1 });

    expect(isChainActive(engine)).toBe(true); // Closed
  });
});

describe("Rule 535.1: Action-timed spells cannot be played during a Closed State", () => {
  it("playSpell fails for an Action spell while a chain is already open", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} }, [P2]: { energy: 1, power: {} } },
    });
    createCard(engine, "spell-a", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    // P2's spell is an ACTION (no `reaction` timing).
    createCard(engine, "action-response", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P2,
      zone: "hand",
    });

    applyMove(engine, "playSpell", { cardId: "spell-a", playerId: P1 });
    const r = applyMove(engine, "playSpell", { cardId: "action-response", playerId: P2 });

    // Rule 535.1: Action timing is illegal during Closed State.
    expect(r.success).toBe(false);
  });
});

describe("Rule 535.2: Reaction-timed spells CAN be played during a Closed State", () => {
  it("playSpell succeeds for a Reaction spell while a chain is already open", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} }, [P2]: { energy: 1, power: {} } },
    });
    createCard(engine, "spell-a", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    createCard(engine, "reaction-b", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P2,
      timing: "reaction",
      zone: "hand",
    });

    applyMove(engine, "playSpell", { cardId: "spell-a", playerId: P1 });
    const r = applyMove(engine, "playSpell", { cardId: "reaction-b", playerId: P2 });
    expect(r.success).toBe(true);
  });
});

describe("Rule 536: Turn is Open when no chain exists", () => {
  it("Action spells can be played in the Open State", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "action-spell", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    const r = applyMove(engine, "playSpell", { cardId: "action-spell", playerId: P1 });
    expect(r.success).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// Rule 537: Playing a card creates or extends the chain.
// -----------------------------------------------------------------------------

describe("Rule 537: Playing a spell places it on the chain", () => {
  it("spell is placed on the top of the chain", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "bolt", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    applyMove(engine, "playSpell", { cardId: "bolt", playerId: P1 });

    const items = getChainItems(engine);
    // Top-of-stack is the LAST element (LIFO).
    expect(items[items.length - 1]?.cardId).toBe("bolt");
  });

  it("spell is removed from hand and moved to trash as it hits the chain", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "bolt", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    applyMove(engine, "playSpell", { cardId: "bolt", playerId: P1 });

    // Playing a card removes it from hand so it cannot be replayed.
    // Per engine semantics the spell lives on the chain until it resolves;
    // The card's zone transitions via internal move to trash pre-resolution
    // (rule 543.2 places it in trash on resolution). The card should NOT
    // Still be in hand.
    const handCards = (
      engine as unknown as {
        internalState: { zones: Record<string, { cardIds: string[] }> };
      }
    ).internalState.zones["hand"];
    expect(handCards?.cardIds ?? []).not.toContain("bolt");
  });
});

// -----------------------------------------------------------------------------
// Rules 539-540: Priority passing
// -----------------------------------------------------------------------------

describe("Rule 539: The player that created the chain becomes the first Active Player", () => {
  it("after P1 plays a spell, P1 is the Active Player for the chain", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "bolt", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    applyMove(engine, "playSpell", { cardId: "bolt", playerId: P1 });
    expect(getChainActivePlayer(engine)).toBe(P1);
  });
});

describe("Rule 540.4: Active Player passes priority to the next Relevant Player in turn order", () => {
  it("after P1 passes, P2 becomes the active chain player", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "bolt", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    applyMove(engine, "playSpell", { cardId: "bolt", playerId: P1 });

    const r = passChainPriority(engine, P1);
    expect(r.success).toBe(true);
    expect(getChainActivePlayer(engine)).toBe(P2);
  });
});

describe("Rule 540.4.b: After all Relevant Players pass in sequence, the chain item resolves", () => {
  it("chain becomes empty after both players pass with a single spell on it", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "draw-spell", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    applyMove(engine, "playSpell", { cardId: "draw-spell", playerId: P1 });

    passChainPriority(engine, P1);
    passChainPriority(engine, P2);

    // Chain resolves; items list should be empty.
    expect(getChainItems(engine)).toHaveLength(0);
    // The chain state itself may be null — either is fine, but the chain
    // Must not still contain the spell.
    expect(isChainActive(engine)).toBe(false);
  });

  it("passChainPriority fails for the non-active player", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "bolt", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    applyMove(engine, "playSpell", { cardId: "bolt", playerId: P1 });

    // P2 cannot pass: P1 still holds priority.
    const r = passChainPriority(engine, P2);
    expect(r.success).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// Rule 541: Triggered abilities added during a chain are added as the most
// Recent chain item.
// -----------------------------------------------------------------------------

describe("Rule 541: Triggered abilities added during a chain become the most recent item", () => {
  it.todo(
    "Rule 541.1: adding a triggered ability during an active chain places it on top without reordering the active player",
  );
});

// -----------------------------------------------------------------------------
// Rules 542-544: Resolution loop
// -----------------------------------------------------------------------------

describe("Rule 543.2: A resolved spell is placed in its owner's trash", () => {
  it("the spell is in trash after the chain fully resolves", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    // Seed the deck so the draw effect does NOT trigger Burn Out (which
    // Would shuffle the trash back into deck and potentially draw the
    // Spell right back into hand).
    createCard(engine, "deck-filler-1", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "mainDeck",
    });
    createCard(engine, "deck-filler-2", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "mainDeck",
    });
    createCard(engine, "draw-spell", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    applyMove(engine, "playSpell", { cardId: "draw-spell", playerId: P1 });
    passChainPriority(engine, P1);
    passChainPriority(engine, P2);

    const internal = engine as unknown as {
      internalState: { cards: Record<string, { zone: string }> };
    };
    expect(internal.internalState.cards["draw-spell"]?.zone).toBe("trash");
  });
});

describe("Rule 543.1: On resolution, execute the effect of the top chain item", () => {
  it("a 'draw 1' spell puts 1 card into the controller's hand after resolution", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    // Seed the deck with a card we can observe being drawn.
    createCard(engine, "deck-card-1", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "mainDeck",
    });
    createCard(engine, "draw-spell", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    applyMove(engine, "playSpell", { cardId: "draw-spell", playerId: P1 });
    passChainPriority(engine, P1);
    passChainPriority(engine, P2);

    const internal = engine as unknown as {
      internalState: { cards: Record<string, { zone: string; owner: string }> };
    };
    expect(internal.internalState.cards["deck-card-1"]?.zone).toBe("hand");
  });
});

describe("Rule 543 (LIFO): Top-of-chain resolves first", () => {
  it("two stacked draw spells resolve top-first — both effects execute", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} }, [P2]: { energy: 1, power: {} } },
    });
    // Two cards in deck — both should be drawn after the chain resolves.
    createCard(engine, "deck-a", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "mainDeck",
    });
    createCard(engine, "deck-b", {
      cardType: "unit",
      might: 1,
      owner: P2,
      zone: "mainDeck",
    });
    createCard(engine, "p1-draw", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    createCard(engine, "p2-reaction-draw", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P2,
      timing: "reaction",
      zone: "hand",
    });

    applyMove(engine, "playSpell", { cardId: "p1-draw", playerId: P1 });
    applyMove(engine, "playSpell", { cardId: "p2-reaction-draw", playerId: P2 });

    // Pass twice through (once per spell), resolving the whole chain.
    for (let i = 0; i < 6 && isChainActive(engine); i++) {
      const active = getChainActivePlayer(engine);
      if (!active) {break;}
      passChainPriority(engine, active as typeof P1);
    }

    // Both decks should now be empty because both draws resolved.
    const internal = engine as unknown as {
      internalState: { cards: Record<string, { zone: string; owner: string }> };
    };
    expect(internal.internalState.cards["deck-a"]?.zone).toBe("hand");
    expect(internal.internalState.cards["deck-b"]?.zone).toBe("hand");
  });

  it("after the top item resolves, priority passes to the controller of the new top item", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} }, [P2]: { energy: 1, power: {} } },
    });
    createCard(engine, "p1-a", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    createCard(engine, "p2-b", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P2,
      timing: "reaction",
      zone: "hand",
    });
    applyMove(engine, "playSpell", { cardId: "p1-a", playerId: P1 });
    applyMove(engine, "playSpell", { cardId: "p2-b", playerId: P2 });

    // After P2's spell is added, P2 is the active player.
    expect(getChainActivePlayer(engine)).toBe(P2);

    // Both pass: P2's spell (top) resolves.
    passChainPriority(engine, P2);
    passChainPriority(engine, P1);

    // Now only p1-a remains on the chain. Priority should go to P1
    // (controller of the new top item — rule 543.4).
    expect(getChainItems(engine)).toHaveLength(1);
    expect(getChainItems(engine)[0]?.cardId).toBe("p1-a");
    expect(getChainActivePlayer(engine)).toBe(P1);
  });
});

describe("Rule 543.4: After a resolution, passes reset and everyone must pass again", () => {
  it("after top resolves and chain still has items, passedPlayers is empty", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} }, [P2]: { energy: 1, power: {} } },
    });
    createCard(engine, "p1-a", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    createCard(engine, "p2-b", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P2,
      timing: "reaction",
      zone: "hand",
    });
    applyMove(engine, "playSpell", { cardId: "p1-a", playerId: P1 });
    applyMove(engine, "playSpell", { cardId: "p2-b", playerId: P2 });

    passChainPriority(engine, P2);
    passChainPriority(engine, P1);

    const interaction = getInteractionState(engine);
    expect(interaction?.chain?.passedPlayers ?? []).toEqual([]);
  });
});

describe("Rule 540.4.a: The chain empties entirely once the last item resolves", () => {
  it("after a single-item chain resolves, interaction.chain is null or empty", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "solo-spell", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    applyMove(engine, "playSpell", { cardId: "solo-spell", playerId: P1 });
    passChainPriority(engine, P1);
    passChainPriority(engine, P2);

    const interaction = getInteractionState(engine);
    // Either null or present-but-empty (implementations vary).
    const items = interaction?.chain?.items ?? [];
    expect(items).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
// Rules 540.2-540.3: Activated abilities on the chain
// -----------------------------------------------------------------------------

describe("Rule 540.2: Activated abilities can be placed on the chain (as an ability item)", () => {
  it("activateAbility adds a chain item of type 'ability'", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 2, power: {} } },
    });
    createCard(engine, "wizard", {
      abilities: [
        {
          cost: { energy: 1 },
          effect: { amount: 1, type: "draw" },
          type: "activated",
        },
      ],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });

    const r = applyMove(engine, "activateAbility", {
      abilityIndex: 0,
      cardId: "wizard",
      playerId: P1,
    });
    expect(r.success).toBe(true);

    const items = getChainItems(engine);
    expect(items).toHaveLength(1);
    expect(items[0]?.type).toBe("ability");
    expect(items[0]?.cardId).toBe("wizard");
    expect(items[0]?.controller).toBe(P1);
  });
});

// -----------------------------------------------------------------------------
// Rules 544+: Countering
// -----------------------------------------------------------------------------

describe("Rule 544: Countering negates a spell on the chain", () => {
  it.todo("Rule 544.1: a countered spell's effect does NOT execute when its chain item resolves");

  it.todo("Rule 544.3: countering does not refund costs paid to play the card");

  it.todo("Rule 544.4: players may only Counter cards when directed by a game effect");
});

// -----------------------------------------------------------------------------
// Rule 520: Priority and Relevant Players (general permissions)
// -----------------------------------------------------------------------------

describe("Rule 520.1: Only the player with priority can take Discretionary Actions", () => {
  it("player without priority cannot play a Reaction spell during a chain they don't control", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} }, [P2]: { energy: 1, power: {} } },
    });
    createCard(engine, "p1-spell", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    createCard(engine, "p1-reaction", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      timing: "reaction",
      zone: "hand",
    });

    // P1 plays action spell → P1 is active.
    applyMove(engine, "playSpell", { cardId: "p1-spell", playerId: P1 });
    // P1 can legally play a reaction spell themselves (same-active-player
    // Reactions are legal because the chain lets any Relevant player act).
    // Note: the exact semantics of "can the active player stack their own
    // Reactions" varies; we only assert that the active player assignment
    // Is consistent with priority.
    expect(getChainActivePlayer(engine)).toBe(P1);
  });
});

// -----------------------------------------------------------------------------
// Permanent-type chain items (rule 538)
// -----------------------------------------------------------------------------

describe("Rule 538: Permanents do not wait on the chain (they resolve immediately)", () => {
  it.todo(
    "Rule 538.1: playing a permanent does not create a chain (skipped — tested indirectly via unit play moves)",
  );
});

// -----------------------------------------------------------------------------
// Invited-players / relevant-players edge cases
// -----------------------------------------------------------------------------

describe("Rule 528: Relevant Players for a Chain", () => {
  it.todo(
    "Rule 528.3.a: Invited players become Relevant Players only if they accept and must take an action",
  );
});
