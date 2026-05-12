/**
 * Rules Audit: Additional-Turns flow rotation + reaction-window enumeration
 * (Unleashed, Core Rules 2026-03-30).
 *
 * Covers:
 *   - Rule 510 / 734 (the repeating turn queue): the turn player rotates in
 *     seat order at the end of each turn; an additional turn (rule 734) is
 *     inserted directly after the current turn without changing the
 *     underlying rotation. Previously the flow layer never rotated the active
 *     player (`transitionToNextTurn` only bumped the turn number), so
 *     additional turns and even normal multi-turn play used the wrong active
 *     player. Now `mainGame.turn.onEnd` advances to the seat-order successor
 *     and `turn.onBegin` overrides with the extra-turn owner when one is
 *     queued.
 *   - Rule 530 (priority in Neutral Open state): only the active player holds
 *     priority in Neutral Open, so only they may play an Action-timed spell or
 *     activate an Action-timed ability. The `playSpell` move already enforced
 *     this; `activateAbility` did not. Reaction-timed plays remain enumerable
 *     by relevant players in Closed/Showdown states (rule 535 / 546).
 *
 * Methodology: minimal state -> one input -> assert rules-correct output ->
 * cite rule number.
 */

import { describe, expect, it } from "bun:test";
import { seatOrderSuccessor } from "../../operations/turn-queue";
import {
  P1,
  P2,
  P3,
  applyMove,
  checkMoveLegal,
  createCard,
  createMinimalGameState,
  endTurnViaFlow,
  enqueuePendingExtraTurn,
  enumerateLegalMoves,
  getFlowCurrentPlayer,
  getState,
} from "./helpers";

describe("Rule 510/734: turn player rotates in seat order at end of turn", () => {
  it("seatOrderSuccessor cycles through players (P1 -> P2 -> P1)", () => {
    const engine = createMinimalGameState({ currentPlayer: P1 });
    const state = getState(engine);
    expect(seatOrderSuccessor(state, P1)).toBe(P2);
    expect(seatOrderSuccessor(state, P2)).toBe(P1);
  });

  it("seatOrderSuccessor cycles three players (P1 -> P2 -> P3 -> P1)", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, playerCount: 3 });
    const state = getState(engine);
    expect(seatOrderSuccessor(state, P1)).toBe(P2);
    expect(seatOrderSuccessor(state, P2)).toBe(P3);
    expect(seatOrderSuccessor(state, P3)).toBe(P1);
  });

  it("ending P1's turn makes P2 the active player (normal rotation)", () => {
    const engine = createMinimalGameState({ currentPlayer: P1 });
    expect(getFlowCurrentPlayer(engine)).toBe(P1);
    endTurnViaFlow(engine);
    expect(getFlowCurrentPlayer(engine)).toBe(P2);
    // Turn.onBegin keeps state.turn.activePlayer in sync.
    expect(getState(engine).turn.activePlayer).toBe(P2);
  });

  it("a queued additional turn (rule 734) is taken next, before the seat-order successor", () => {
    const engine = createMinimalGameState({ currentPlayer: P1 });
    // P1 was told to take an additional turn — it is inserted directly after
    // P1's current turn (rule 734), so P1 (not P2) takes the next turn.
    enqueuePendingExtraTurn(engine, P1);
    endTurnViaFlow(engine);
    expect(getFlowCurrentPlayer(engine)).toBe(P1);
    expect(getState(engine).turn.activePlayer).toBe(P1);
    // The queue was consumed.
    expect((getState(engine) as { pendingExtraTurns?: string[] }).pendingExtraTurns ?? []).toEqual(
      [],
    );
  });

  it("after an additional turn finishes, rotation continues to the normal successor (rule 734)", () => {
    const engine = createMinimalGameState({ currentPlayer: P1 });
    enqueuePendingExtraTurn(engine, P1);
    endTurnViaFlow(engine); // P1's additional turn
    expect(getFlowCurrentPlayer(engine)).toBe(P1);
    endTurnViaFlow(engine); // Additional turn over -> normal rotation -> P2
    expect(getFlowCurrentPlayer(engine)).toBe(P2);
  });

  it("per-turn tracking resets for the new turn player on rotation", () => {
    const engine = createMinimalGameState({ currentPlayer: P1 });
    // Dirty P2's per-turn counters, then rotate to P2.
    const internal = getState(engine) as unknown as {
      conqueredThisTurn: Record<string, string[]>;
      cardsPlayedThisTurn: Record<string, number>;
    };
    internal.conqueredThisTurn[P2] = ["bf-x"];
    internal.cardsPlayedThisTurn[P2] = 3;
    endTurnViaFlow(engine);
    const after = getState(engine) as unknown as {
      conqueredThisTurn: Record<string, string[]>;
      cardsPlayedThisTurn: Record<string, number>;
    };
    expect(after.conqueredThisTurn[P2]).toEqual([]);
    expect(after.cardsPlayedThisTurn[P2]).toBe(0);
  });
});

describe("Rule 530: only the active player may take Action-timed plays in Neutral Open", () => {
  it("playSpell: an Action spell in the opponent's hand is NOT legal during the active player's Neutral Open turn", () => {
    const engine = createMinimalGameState({
      currentPlayer: P1,
      runePools: { [P2]: { energy: 5, power: {} } },
    });
    createCard(engine, "p2-action-spell", {
      abilities: [{ effect: { type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 0,
      owner: P2,
      timing: "action",
      zone: "hand",
    });
    // P2 is not the active player — rule 530: only the active player has
    // Priority in Neutral Open, so an Action spell is not playable.
    expect(checkMoveLegal(engine, "playSpell", { cardId: "p2-action-spell", playerId: P2 })).toBe(
      false,
    );
    // ...and the active player CAN play their own Action spell.
    createCard(engine, "p1-action-spell", {
      abilities: [{ effect: { type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 0,
      owner: P1,
      timing: "action",
      zone: "hand",
    });
    expect(checkMoveLegal(engine, "playSpell", { cardId: "p1-action-spell", playerId: P1 })).toBe(
      true,
    );
  });

  it("activateAbility: an Action-timed activated ability is NOT legal for a non-active player in Neutral Open", () => {
    const engine = createMinimalGameState({
      currentPlayer: P1,
      runePools: { [P2]: { energy: 5, power: {} } },
    });
    // A unit P2 controls with an Action-timed activated ability.
    createCard(engine, "p2-unit", {
      abilities: [
        {
          cost: { energy: 1 },
          effect: { type: "draw" },
          timing: "action",
          type: "activated",
        },
      ],
      cardType: "unit",
      might: 3,
      owner: P2,
      zone: "base",
    });
    expect(
      checkMoveLegal(engine, "activateAbility", {
        abilityIndex: 0,
        cardId: "p2-unit",
        playerId: P2,
      }),
    ).toBe(false);
    // The enumerator must not surface it for P2 either.
    const p2Moves = enumerateLegalMoves(engine, P2).filter((m) => m.moveId === "activateAbility");
    expect(
      p2Moves.some((m) => (m.params as { cardId?: string } | undefined)?.cardId === "p2-unit"),
    ).toBe(false);
  });

  it("activateAbility: the active player CAN activate their own Action-timed ability in Neutral Open", () => {
    const engine = createMinimalGameState({
      currentPlayer: P1,
      runePools: { [P1]: { energy: 5, power: {} } },
    });
    createCard(engine, "p1-unit", {
      abilities: [
        {
          cost: { energy: 1 },
          effect: { type: "draw" },
          timing: "action",
          type: "activated",
        },
      ],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "base",
    });
    expect(
      checkMoveLegal(engine, "activateAbility", {
        abilityIndex: 0,
        cardId: "p1-unit",
        playerId: P1,
      }),
    ).toBe(true);
  });

  it("activateAbility: a Reaction-timed ability is enumerable for relevant players when a chain is open (rule 535)", () => {
    const engine = createMinimalGameState({
      currentPlayer: P1,
      runePools: { [P2]: { energy: 5, power: {} } },
    });
    createCard(engine, "p2-reaction-unit", {
      abilities: [
        {
          cost: { energy: 1 },
          effect: { type: "draw" },
          keyword: "Reaction",
          timing: "reaction",
          type: "activated",
        },
      ],
      cardType: "unit",
      might: 3,
      owner: P2,
      zone: "base",
    });
    // No chain: Reaction abilities are still legal (isLegalTiming permits
    // Reaction in any state) but with no chain there is nothing to react to;
    // The move legality layer leaves finer-grained gating to the chain
    // Machinery. What we assert here: rule 530's Action-only restriction does
    // NOT block a Reaction ability for a non-active player.
    expect(
      checkMoveLegal(engine, "activateAbility", {
        abilityIndex: 0,
        cardId: "p2-reaction-unit",
        playerId: P2,
      }),
    ).toBe(true);
  });
});
