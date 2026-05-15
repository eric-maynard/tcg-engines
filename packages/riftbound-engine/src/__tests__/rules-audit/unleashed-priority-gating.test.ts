/**
 * Rules Audit: Reaction-window Priority / Focus gating (Unleashed CR 2026-03-30)
 *
 * Covers rules 510 / 530 / 543.x / 342: once a Chain (or a Showdown) is
 * ongoing, only the player who currently holds **Priority** (on the chain) /
 * **Focus** (in a showdown) may add to the chain — by playing a Card or
 * activating an Ability. A Reaction-timed spell/ability is *not* free for any
 * relevant player to play whenever a Closed/Showdown state exists; it waits
 * for that player's window (Step 2: Execute, rule 338.1). Previously
 * `playSpell` / `activateAbility` accepted any Reaction play in a Closed state
 * regardless of who held Priority/Focus.
 *
 * Methodology: minimal state -> one input (a `playSpell`/`activateAbility`
 * move, or a `passChainPriority`) -> assert the move is rejected / accepted
 * exactly per the priority rules. Cites rule numbers.
 */

import { describe, expect, it } from "bun:test";
import { createInteractionState, getPriorityHolder } from "../../chain";
import type { TurnInteractionState } from "../../chain";
import {
  P1,
  P2,
  applyMove,
  checkMoveLegal,
  createCard,
  createMinimalGameState,
  passChainPriority,
  setInteractionStateForTest,
} from "./helpers";

// A 1-energy Reaction spell that draws a card.
const REACTION_DRAW = {
  abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" as const }],
  cardType: "spell" as const,
  energyCost: 1,
  timing: "reaction" as const,
};

// -----------------------------------------------------------------------------
// GetPriorityHolder helper (rules 510 / 530 / 543.x)
// -----------------------------------------------------------------------------

describe("getPriorityHolder (rules 510 / 543.x): who currently may act", () => {
  it("returns null in a Neutral Open state (no chain, no showdown)", () => {
    expect(getPriorityHolder(createInteractionState())).toBeNull();
  });

  it("returns the chain's active player while a chain is ongoing (rule 338.1.c.3)", () => {
    const interaction: TurnInteractionState = {
      chain: {
        active: true,
        activePlayer: P2,
        items: [{ cardId: "x", controller: P1, id: "chain-1", type: "spell" }],
        passedPlayers: [],
        relevantPlayers: [P1, P2],
        turnOrder: [P1, P2],
      },
      nextChainItemId: 2,
      showdownStack: [],
    };
    expect(getPriorityHolder(interaction)).toBe(P2);
  });

  it("returns '' (no one) once every relevant player has passed — chain resolving (rule 339.1)", () => {
    const interaction: TurnInteractionState = {
      chain: {
        active: true,
        activePlayer: "", // Everyone passed; chain about to resolve
        items: [{ cardId: "x", controller: P1, id: "chain-1", type: "spell" }],
        passedPlayers: [P1, P2],
        relevantPlayers: [P1, P2],
        turnOrder: [P1, P2],
      },
      nextChainItemId: 2,
      showdownStack: [],
    };
    expect(getPriorityHolder(interaction)).toBe("");
  });

  it("returns the active showdown's focus player when a showdown (no chain) is ongoing (rule 342)", () => {
    const interaction: TurnInteractionState = {
      chain: null,
      nextChainItemId: 1,
      showdownStack: [
        {
          active: true,
          battlefieldId: "bf-1",
          focusPlayer: P2,
          isCombatShowdown: false,
          passedPlayers: [],
          relevantPlayers: [P1, P2],
        },
      ],
    };
    expect(getPriorityHolder(interaction)).toBe(P2);
  });
});

// -----------------------------------------------------------------------------
// PlaySpell: a Reaction spell waits for the priority holder's window
// -----------------------------------------------------------------------------

describe("Rule 543.x / 338.1: Reaction spell only by the Priority holder during a chain", () => {
  it("the non-priority player cannot play a Reaction spell while the other holds Priority", () => {
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
    createCard(engine, "p2-reaction", { ...REACTION_DRAW, owner: P2, zone: "hand" });

    // P1 plays a spell. Per rule 338.1.c.3 P1 (controller of the newest item)
    // Holds Priority — P2 cannot act yet.
    applyMove(engine, "playSpell", { cardId: "p1-spell", playerId: P1 });
    expect(checkMoveLegal(engine, "playSpell", { cardId: "p2-reaction", playerId: P2 })).toBe(
      false,
    );

    // P1 passes Priority -> P2 holds Priority -> P2's Reaction is legal now.
    passChainPriority(engine, P1);
    expect(checkMoveLegal(engine, "playSpell", { cardId: "p2-reaction", playerId: P2 })).toBe(true);
  });

  it("the priority holder can chain an additional Reaction onto their own item (rule 338.1.a.5)", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 2, power: {} }, [P2]: { energy: 1, power: {} } },
    });
    createCard(engine, "p1-a", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    createCard(engine, "p1-b", { ...REACTION_DRAW, owner: P1, zone: "hand" });

    applyMove(engine, "playSpell", { cardId: "p1-a", playerId: P1 });
    // P1 still holds Priority after adding -> may add another item.
    const r = applyMove(engine, "playSpell", { cardId: "p1-b", playerId: P1 });
    expect(r.success).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// PlaySpell: a Reaction spell during a Showdown only by the Focus holder
// -----------------------------------------------------------------------------

describe("Rule 342 / 313.2: Reaction spell only by the Focus holder during a Showdown", () => {
  it("the non-focus player cannot play a Reaction spell while the other has Focus", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} }, [P2]: { energy: 1, power: {} } },
    });
    createCard(engine, "p2-reaction", { ...REACTION_DRAW, owner: P2, zone: "hand" });

    // A (non-combat) Showdown is ongoing at bf-1; P1 has Focus.
    setInteractionStateForTest(engine, {
      chain: null,
      nextChainItemId: 1,
      showdownStack: [
        {
          active: true,
          battlefieldId: "bf-1",
          focusPlayer: P1,
          isCombatShowdown: false,
          passedPlayers: [],
          relevantPlayers: [P1, P2],
        },
      ],
    });

    expect(checkMoveLegal(engine, "playSpell", { cardId: "p2-reaction", playerId: P2 })).toBe(
      false,
    );
  });

  it("the focus player CAN play a Reaction spell during the Showdown", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} }, [P2]: { energy: 1, power: {} } },
    });
    createCard(engine, "p1-reaction", { ...REACTION_DRAW, owner: P1, zone: "hand" });

    setInteractionStateForTest(engine, {
      chain: null,
      nextChainItemId: 1,
      showdownStack: [
        {
          active: true,
          battlefieldId: "bf-1",
          focusPlayer: P1,
          isCombatShowdown: false,
          passedPlayers: [],
          relevantPlayers: [P1, P2],
        },
      ],
    });

    expect(checkMoveLegal(engine, "playSpell", { cardId: "p1-reaction", playerId: P1 })).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// ActivateAbility: same gating
// -----------------------------------------------------------------------------

describe("Rule 543.x / 338.1.b: Reaction ability only by the Priority holder during a chain", () => {
  it("the non-priority player cannot activate a Reaction ability while the other holds Priority", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 2, power: {} }, [P2]: { energy: 2, power: {} } },
    });
    createCard(engine, "p1-spell", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    // P2 controls a unit on a battlefield with a Reaction-timed activated ability.
    createCard(engine, "p2-unit", {
      abilities: [
        {
          effect: { amount: 1, type: "draw" },
          keyword: "Reaction",
          timing: "reaction",
          type: "activated",
        },
      ],
      cardType: "unit",
      might: 2,
      owner: P2,
      zone: "battlefield-bf-1",
    });

    applyMove(engine, "playSpell", { cardId: "p1-spell", playerId: P1 });
    // P1 holds Priority; P2 cannot activate yet.
    expect(
      checkMoveLegal(engine, "activateAbility", {
        abilityIndex: 0,
        cardId: "p2-unit",
        playerId: P2,
      }),
    ).toBe(false);

    passChainPriority(engine, P1);
    // Now P2 holds Priority -> the Reaction ability is activatable.
    expect(
      checkMoveLegal(engine, "activateAbility", {
        abilityIndex: 0,
        cardId: "p2-unit",
        playerId: P2,
      }),
    ).toBe(true);
  });
});
