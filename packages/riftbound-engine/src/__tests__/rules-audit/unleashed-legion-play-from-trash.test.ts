/**
 * Rules Audit (Unleashed / CR 2026-03-30): Legion [>] play-from-trash
 * permission (rule 724 + rule 555).
 *
 * Some Unleashed cards — e.g. Undying Legion (`[Legion][>] You may play me
 * from your trash for [3][fury].`) — carry a Legion effect-keyword ability
 * shaped `{ type:"keyword", keyword:"Legion", effect:{ type:"play",
 * from:"trash", target:{ type:"unit", ... } } }`. The engine's `playUnit`
 * move must surface this as a legal play from the trash zone, but ONLY
 * when:
 *   - the player has played another card this turn (rule 724.1.c — Legion),
 *   - it is the player's own turn during the main phase (rule 554), and
 *   - the player can afford the printed cost.
 * Playing it moves the card from trash to base and counts toward the
 * Legion play counter (rule 555 — playing from trash is still "playing").
 *
 * Methodology: minimal state → one input → assert rules-correct output →
 * cite the rule number.
 */

import { describe, expect, it } from "bun:test";
import type { CardDefinitionLookup } from "../../operations/card-lookup";
import {
  P1,
  P2,
  applyMove,
  checkMoveLegal,
  createCard,
  createMinimalGameState,
  enumerateLegalMoves,
  getCardsInZone,
  getState,
  setCardsPlayedThisTurn,
} from "./helpers";

// Undying Legion's ability shape (rule 724 [Legion][>] play-from-trash).
const LEGION_PLAY_FROM_TRASH: CardDefinitionLookup["abilities"] = [
  {
    effect: {
      from: "trash",
      target: { controller: "friendly", type: "unit" },
      type: "play",
    },
    keyword: "Legion",
    type: "keyword",
  },
] as unknown as CardDefinitionLookup["abilities"];

function legalPlayUnitMoves(
  engine: ReturnType<typeof createMinimalGameState>,
  player: typeof P1,
): Record<string, unknown>[] {
  return enumerateLegalMoves(engine, player)
    .filter((m) => m.moveId === "playUnit")
    .map((m) => m.params ?? {});
}

describe("Rule 724/555: Legion [>] play-from-trash permission (Undying Legion)", () => {
  it("is illegal with zero prior plays this turn (Legion not satisfied)", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 3, power: { fury: 1 } } },
    });
    createCard(engine, "undying", {
      abilities: LEGION_PLAY_FROM_TRASH,
      cardType: "unit",
      domain: "fury",
      energyCost: 3,
      might: 3,
      owner: P1,
      powerCost: ["fury"],
      zone: "trash",
    });
    setCardsPlayedThisTurn(engine, P1, 0);

    expect(checkMoveLegal(engine, "playUnit", { cardId: "undying", location: "base", playerId: P1 })).toBe(
      false,
    );
    expect(legalPlayUnitMoves(engine, P1).some((p) => p.cardId === "undying")).toBe(false);
  });

  it("is legal (and enumerated) from trash once another card has been played this turn", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 3, power: { fury: 1 } } },
    });
    createCard(engine, "undying", {
      abilities: LEGION_PLAY_FROM_TRASH,
      cardType: "unit",
      domain: "fury",
      energyCost: 3,
      might: 3,
      owner: P1,
      powerCost: ["fury"],
      zone: "trash",
    });
    setCardsPlayedThisTurn(engine, P1, 1);

    expect(checkMoveLegal(engine, "playUnit", { cardId: "undying", location: "base", playerId: P1 })).toBe(
      true,
    );
    expect(legalPlayUnitMoves(engine, P1).some((p) => p.cardId === "undying")).toBe(true);
  });

  it("playing it from trash moves it to base, pays the cost, and counts as a play", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 3, power: { fury: 1 } } },
    });
    createCard(engine, "undying", {
      abilities: LEGION_PLAY_FROM_TRASH,
      cardType: "unit",
      domain: "fury",
      energyCost: 3,
      might: 3,
      owner: P1,
      powerCost: ["fury"],
      zone: "trash",
    });
    setCardsPlayedThisTurn(engine, P1, 1);

    const res = applyMove(engine, "playUnit", { cardId: "undying", location: "base", playerId: P1 });
    expect(res.success).toBe(true);

    expect(getCardsInZone(engine, "trash", P1)).not.toContain("undying");
    expect(getCardsInZone(engine, "base", P1)).toContain("undying");
    const state = getState(engine);
    expect(state.runePools[P1].energy).toBe(0);
    expect(state.runePools[P1].power.fury ?? 0).toBe(0);
    // Rule 555: playing from trash is still "playing a card" → Legion counter bumps.
    expect((state.cardsPlayedThisTurn ?? {})[P1]).toBe(2);
  });

  it("is illegal on the opponent's turn (rule 554 — own main phase only)", () => {
    const engine = createMinimalGameState({
      currentPlayer: P2,
      phase: "main",
      runePools: { [P1]: { energy: 3, power: { fury: 1 } } },
    });
    createCard(engine, "undying", {
      abilities: LEGION_PLAY_FROM_TRASH,
      cardType: "unit",
      domain: "fury",
      energyCost: 3,
      might: 3,
      owner: P1,
      powerCost: ["fury"],
      zone: "trash",
    });
    setCardsPlayedThisTurn(engine, P1, 1);

    expect(checkMoveLegal(engine, "playUnit", { cardId: "undying", location: "base", playerId: P1 })).toBe(
      false,
    );
  });

  it("is illegal when the player cannot afford the printed cost", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "undying", {
      abilities: LEGION_PLAY_FROM_TRASH,
      cardType: "unit",
      domain: "fury",
      energyCost: 3,
      might: 3,
      owner: P1,
      powerCost: ["fury"],
      zone: "trash",
    });
    setCardsPlayedThisTurn(engine, P1, 1);

    expect(checkMoveLegal(engine, "playUnit", { cardId: "undying", location: "base", playerId: P1 })).toBe(
      false,
    );
  });

  it("a plain (non-Legion-play-from-trash) unit in the trash is NOT enumerated/playable", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 5, power: {} } },
    });
    createCard(engine, "deadguy", {
      cardType: "unit",
      energyCost: 2,
      might: 2,
      owner: P1,
      zone: "trash",
    });
    setCardsPlayedThisTurn(engine, P1, 1);

    expect(checkMoveLegal(engine, "playUnit", { cardId: "deadguy", location: "base", playerId: P1 })).toBe(
      false,
    );
    expect(legalPlayUnitMoves(engine, P1).some((p) => p.cardId === "deadguy")).toBe(false);
  });
});
