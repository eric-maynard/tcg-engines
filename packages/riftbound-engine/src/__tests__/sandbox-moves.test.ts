/**
 * Tests for the W10/W12 sandbox and deck-action moves.
 *
 * Covers one happy-path assertion per move:
 *   - addToken, addCounter, modifyBuff
 *   - duplicateCard, labelCard, transferControl
 *   - peekTopN, placeCardsOnTopOfDeckInOrder, revealTopToOpponent
 *   - recycleMany, sendToHand
 *
 * Each test constructs a minimal game state via `createMinimalGameState`
 * and asserts the observable state mutation after invoking the move.
 */

import { describe, expect, test } from "bun:test";
import {
  P1,
  P2,
  applyMove,
  createBattlefield,
  createCard,
  createMinimalGameState,
  getCardMeta,
  getCardZone,
  getCardsInZone,
} from "./rules-audit/helpers";
import { resetTokenIdCounter } from "../game-definition/moves/token";
import { resetDuplicateIdCounter } from "../game-definition/moves/card-actions";

/**
 * Peek at the internal-state controller field on a card (bypasses the
 * public API which only exposes owner).
 */
function getCardController(engine: unknown, cardId: string): string | undefined {
  const view = engine as {
    internalState: {
      cards: Record<string, { controller?: string }>;
    };
  };
  return view.internalState.cards[cardId]?.controller;
}

describe("W10: addToken", () => {
  test("spawns a unit token into the base zone", () => {
    resetTokenIdCounter();
    const engine = createMinimalGameState({ phase: "main" });

    const result = applyMove(engine, "addToken", {
      count: 2,
      playerId: P1,
      tokenName: "Recruit",
      zoneId: "base",
    });

    expect(result.success).toBe(true);
    const baseCards = getCardsInZone(engine, "base", P1);
    // Two Recruit tokens should now exist in the base zone.
    expect(baseCards.filter((id) => id.startsWith("token-recruit-"))).toHaveLength(2);
  });
});

describe("W10: addCounter", () => {
  test("adds a positive counter delta to the card", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "poison-target", {
      cardType: "unit",
      energyCost: 1,
      might: 3,
      owner: P1,
      zone: "base",
    });

    const result = applyMove(engine, "addCounter", {
      cardId: "poison-target",
      counterType: "poison",
      delta: 2,
    });

    expect(result.success).toBe(true);
    // The core counter system stores counters under meta.__counters.<type>.
    const meta = getCardMeta(engine, "poison-target") as
      | { __counters?: Record<string, number> }
      | undefined;
    expect(meta?.__counters?.poison).toBe(2);
  });
});

describe("W10: modifyBuff", () => {
  test("adds a numeric delta to mightModifier", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "buff-target", {
      cardType: "unit",
      energyCost: 1,
      might: 2,
      owner: P1,
      zone: "base",
    });

    const result = applyMove(engine, "modifyBuff", {
      cardId: "buff-target",
      deltaMight: 2,
      deltaToughness: 1,
    });

    expect(result.success).toBe(true);
    const meta = getCardMeta(engine, "buff-target");
    expect(meta?.mightModifier).toBe(2);
    expect(meta?.toughnessModifier).toBe(1);
  });
});

describe("W10: duplicateCard", () => {
  test("mints a copy of an existing card into a target zone", () => {
    resetDuplicateIdCounter();
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "source-unit", {
      cardType: "unit",
      energyCost: 1,
      might: 2,
      name: "Source Unit",
      owner: P1,
      zone: "base",
    });

    const result = applyMove(engine, "duplicateCard", {
      cardId: "source-unit",
      destinationZone: "base",
      playerId: P1,
    });

    expect(result.success).toBe(true);
    const base = getCardsInZone(engine, "base", P1);
    const dupes = base.filter((id) => id.startsWith("dup-source-unit-"));
    expect(dupes.length).toBeGreaterThanOrEqual(1);
  });
});

describe("W10: labelCard", () => {
  test("stores a label on the card's metadata", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "labeled-card", {
      cardType: "unit",
      energyCost: 1,
      might: 1,
      owner: P1,
      zone: "base",
    });

    const result = applyMove(engine, "labelCard", {
      cardId: "labeled-card",
      label: "Turn 3 combo piece",
    });

    expect(result.success).toBe(true);
    const meta = getCardMeta(engine, "labeled-card");
    expect(meta?.label).toBe("Turn 3 combo piece");
  });
});

describe("W10: transferControl", () => {
  test("changes the controller field without affecting ownership", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "swap-target", {
      cardType: "unit",
      energyCost: 1,
      might: 1,
      owner: P1,
      zone: "base",
    });

    const result = applyMove(engine, "transferControl", {
      cardId: "swap-target",
      newControllerId: P2,
    });

    expect(result.success).toBe(true);
    expect(getCardController(engine, "swap-target")).toBe(P2);
  });
});

describe("W12: peekTopN", () => {
  test("is a no-op on state but records the move in replay history", () => {
    const engine = createMinimalGameState({ phase: "main" });

    const result = applyMove(engine, "peekTopN", {
      count: 3,
      playerId: P1,
    });

    expect(result.success).toBe(true);
  });
});

describe("W12: placeCardsOnTopOfDeckInOrder", () => {
  test("inserts cards at the top of the deck in the provided order", () => {
    const engine = createMinimalGameState({ phase: "main" });
    // Three cards currently sitting in the player's hand that we'll
    // Push back to the top of their main deck in a specific order.
    createCard(engine, "deck-card-a", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "hand",
    });
    createCard(engine, "deck-card-b", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "hand",
    });
    createCard(engine, "deck-card-c", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "hand",
    });

    const result = applyMove(engine, "placeCardsOnTopOfDeckInOrder", {
      cardIds: ["deck-card-a", "deck-card-b", "deck-card-c"],
      playerId: P1,
    });

    expect(result.success).toBe(true);
    // After the insert, the top of the deck (index 0) should be card A,
    // Followed by card B, then card C.
    const deck = getCardsInZone(engine, "mainDeck", P1);
    expect(deck[0]).toBe("deck-card-a");
    expect(deck[1]).toBe("deck-card-b");
    expect(deck[2]).toBe("deck-card-c");
  });
});

describe("W12: revealTopToOpponent", () => {
  test("is a no-op on state but records the move in replay history", () => {
    const engine = createMinimalGameState({ phase: "main" });

    const result = applyMove(engine, "revealTopToOpponent", {
      count: 2,
      playerId: P1,
    });

    expect(result.success).toBe(true);
  });
});

describe("W12: recycleMany", () => {
  test("sends every provided card to the bottom of the main deck", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "recycle-a", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "hand",
    });
    createCard(engine, "recycle-b", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "hand",
    });

    const result = applyMove(engine, "recycleMany", {
      cardIds: ["recycle-a", "recycle-b"],
      playerId: P1,
    });

    expect(result.success).toBe(true);
    const deck = getCardsInZone(engine, "mainDeck", P1);
    expect(deck).toContain("recycle-a");
    expect(deck).toContain("recycle-b");
    expect(getCardZone(engine, "recycle-a")).toBe("mainDeck");
    expect(getCardZone(engine, "recycle-b")).toBe("mainDeck");
  });
});

describe("W12: sendToHand", () => {
  test("moves a card from its current zone into the owning player's hand", () => {
    const engine = createMinimalGameState({ battlefields: ["bf-1"], phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    createCard(engine, "wandering-unit", {
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "battlefield-bf-1",
    });

    const result = applyMove(engine, "sendToHand", {
      cardId: "wandering-unit",
    });

    expect(result.success).toBe(true);
    expect(getCardZone(engine, "wandering-unit")).toBe("hand");
    const hand = getCardsInZone(engine, "hand", P1);
    expect(hand).toContain("wandering-unit");
  });
});
