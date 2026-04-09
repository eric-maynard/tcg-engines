/**
 * Trigger Matcher Tests
 */

import { describe, expect, test } from "bun:test";
import type { GameEvent } from "../abilities/game-events";
import type { CardWithAbilities, TriggerableAbility } from "../abilities/trigger-matcher";
import { findMatchingTriggers } from "../abilities/trigger-matcher";

function makeAbility(event: string, on = "self"): TriggerableAbility {
  return {
    effect: { amount: 1, type: "draw" },
    trigger: { event, on },
    type: "triggered",
  };
}

function makeCard(
  id: string,
  abilities: TriggerableAbility[],
  zone = "base",
  owner = "p1",
): CardWithAbilities {
  return { abilities, id, owner, zone };
}

describe("Trigger Matcher", () => {
  test("matches play-self trigger on the played card", () => {
    const card = makeCard("card-1", [makeAbility("play-self")]);
    const event: GameEvent = { cardId: "card-1", playerId: "p1", type: "play-self" };

    const matches = findMatchingTriggers(event, [card]);
    expect(matches).toHaveLength(1);
    expect(matches[0].cardId).toBe("card-1");
  });

  test("does NOT match play-self on a different card", () => {
    const card = makeCard("card-2", [makeAbility("play-self")]);
    const event: GameEvent = { cardId: "card-1", playerId: "p1", type: "play-self" };

    const matches = findMatchingTriggers(event, [card]);
    expect(matches).toHaveLength(0);
  });

  test("matches attack trigger", () => {
    const card = makeCard("unit-1", [makeAbility("attack")], "battlefield-bf-1");
    const event: GameEvent = { battlefieldId: "bf-1", cardId: "unit-1", type: "attack" };

    const matches = findMatchingTriggers(event, [card]);
    expect(matches).toHaveLength(1);
  });

  test("matches conquer trigger on card owner", () => {
    const card = makeCard("unit-1", [makeAbility("conquer")], "battlefield-bf-1");
    const event: GameEvent = { battlefieldId: "bf-1", playerId: "p1", type: "conquer" };

    const matches = findMatchingTriggers(event, [card]);
    expect(matches).toHaveLength(1);
  });

  test("matches hold trigger", () => {
    const card = makeCard("unit-1", [makeAbility("hold")], "battlefield-bf-1");
    const event: GameEvent = { battlefieldId: "bf-1", playerId: "p1", type: "hold" };

    const matches = findMatchingTriggers(event, [card]);
    expect(matches).toHaveLength(1);
  });

  test("matches die trigger for friendly units", () => {
    const observer = makeCard("observer", [makeAbility("die", "friendly-units")], "base");
    const event: GameEvent = { cardId: "dead-unit", owner: "p1", type: "die" };

    const matches = findMatchingTriggers(event, [observer]);
    expect(matches).toHaveLength(1);
  });

  test("ignores cards not on the board", () => {
    const card = makeCard("card-1", [makeAbility("play-self")], "hand");
    const event: GameEvent = { cardId: "card-1", playerId: "p1", type: "play-self" };

    const matches = findMatchingTriggers(event, [card]);
    expect(matches).toHaveLength(0);
  });

  test("ignores non-triggered abilities", () => {
    const card = makeCard(
      "card-1",
      [
        {
          effect: { type: "draw" },
          trigger: { event: "attack" },
          type: "triggered",
        } as TriggerableAbility,
      ],
      "base",
    );
    const event: GameEvent = { cardId: "card-1", playerId: "p1", type: "play-self" };

    const matches = findMatchingTriggers(event, [card]);
    expect(matches).toHaveLength(0); // Wrong event type
  });

  test("multiple cards can match the same event", () => {
    const card1 = makeCard("unit-1", [makeAbility("conquer")], "battlefield-bf-1");
    const card2 = makeCard("unit-2", [makeAbility("conquer")], "battlefield-bf-1");
    const event: GameEvent = { battlefieldId: "bf-1", playerId: "p1", type: "conquer" };

    const matches = findMatchingTriggers(event, [card1, card2]);
    expect(matches).toHaveLength(2);
  });

  test("card with multiple triggers matches correct one", () => {
    const card = makeCard(
      "unit-1",
      [makeAbility("attack"), makeAbility("defend")],
      "battlefield-bf-1",
    );
    const event: GameEvent = { battlefieldId: "bf-1", cardId: "unit-1", type: "attack" };

    const matches = findMatchingTriggers(event, [card]);
    expect(matches).toHaveLength(1);
    expect(matches[0].ability.trigger.event).toBe("attack");
  });
});
