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

  describe("battlefield triggers match by battlefieldId, not owner", () => {
    test("hold trigger fires for controller when controller differs from owner", () => {
      // Battlefield card owned by p2 (deck provider) but held by p1 (controller)
      const battlefieldCard = makeCard("bf-altar", [makeAbility("hold")], "battlefieldRow", "p2");
      const event: GameEvent = { battlefieldId: "bf-altar", playerId: "p1", type: "hold" };

      const matches = findMatchingTriggers(event, [battlefieldCard]);
      expect(matches).toHaveLength(1);
      expect(matches[0].cardId).toBe("bf-altar");
    });

    test("conquer trigger fires for controller when controller differs from owner", () => {
      // Battlefield card owned by p2 but conquered by p1
      const battlefieldCard = makeCard(
        "bf-fortress",
        [makeAbility("conquer")],
        "battlefieldRow",
        "p2",
      );
      const event: GameEvent = {
        battlefieldId: "bf-fortress",
        playerId: "p1",
        type: "conquer",
      };

      const matches = findMatchingTriggers(event, [battlefieldCard]);
      expect(matches).toHaveLength(1);
      expect(matches[0].cardId).toBe("bf-fortress");
    });

    test("hold trigger does not fire for a different battlefield", () => {
      const battlefieldCard = makeCard("bf-altar", [makeAbility("hold")], "battlefieldRow", "p2");
      const event: GameEvent = { battlefieldId: "bf-other", playerId: "p1", type: "hold" };

      const matches = findMatchingTriggers(event, [battlefieldCard]);
      expect(matches).toHaveLength(0);
    });

    test("conquer trigger does not fire for a different battlefield", () => {
      const battlefieldCard = makeCard(
        "bf-fortress",
        [makeAbility("conquer")],
        "battlefieldRow",
        "p2",
      );
      const event: GameEvent = { battlefieldId: "bf-other", playerId: "p1", type: "conquer" };

      const matches = findMatchingTriggers(event, [battlefieldCard]);
      expect(matches).toHaveLength(0);
    });

    test("hold trigger still fires when controller is the owner", () => {
      const battlefieldCard = makeCard("bf-altar", [makeAbility("hold")], "battlefieldRow", "p1");
      const event: GameEvent = { battlefieldId: "bf-altar", playerId: "p1", type: "hold" };

      const matches = findMatchingTriggers(event, [battlefieldCard]);
      expect(matches).toHaveLength(1);
    });
  });

  describe("non-battlefield player-scoped triggers still use owner", () => {
    test("start-of-turn trigger matches owner's turn", () => {
      const card = makeCard("unit-1", [makeAbility("start-of-turn")], "base", "p1");
      const event: GameEvent = { playerId: "p1", type: "start-of-turn" };

      const matches = findMatchingTriggers(event, [card]);
      expect(matches).toHaveLength(1);
    });

    test("start-of-turn trigger does not match opponent's turn", () => {
      const card = makeCard("unit-1", [makeAbility("start-of-turn")], "base", "p1");
      const event: GameEvent = { playerId: "p2", type: "start-of-turn" };

      const matches = findMatchingTriggers(event, [card]);
      expect(matches).toHaveLength(0);
    });

    test("draw trigger matches owner", () => {
      const card = makeCard("unit-1", [makeAbility("draw")], "base", "p1");
      const event: GameEvent = { playerId: "p1", type: "draw" };

      const matches = findMatchingTriggers(event, [card]);
      expect(matches).toHaveLength(1);
    });

    test("draw trigger does not match opponent", () => {
      const card = makeCard("unit-1", [makeAbility("draw")], "base", "p1");
      const event: GameEvent = { playerId: "p2", type: "draw" };

      const matches = findMatchingTriggers(event, [card]);
      expect(matches).toHaveLength(0);
    });
  });

  describe("become-mighty triggers (Wave 3 Agent 4)", () => {
    test("friendly-units become-mighty matches when owner is same", () => {
      const observer = makeCard(
        "observer",
        [makeAbility("become-mighty", "friendly-units")],
        "base",
        "p1",
      );
      const event: GameEvent = { cardId: "other-unit", owner: "p1", type: "become-mighty" };

      const matches = findMatchingTriggers(event, [observer]);
      expect(matches).toHaveLength(1);
    });

    test("friendly-units become-mighty does NOT match different owner", () => {
      const observer = makeCard(
        "observer",
        [makeAbility("become-mighty", "friendly-units")],
        "base",
        "p1",
      );
      const event: GameEvent = { cardId: "other-unit", owner: "p2", type: "become-mighty" };

      const matches = findMatchingTriggers(event, [observer]);
      expect(matches).toHaveLength(0);
    });

    test("friendly-other-units excludes self from become-mighty", () => {
      const observer = makeCard(
        "observer",
        [makeAbility("become-mighty", "friendly-other-units")],
        "base",
        "p1",
      );
      const selfEvent: GameEvent = { cardId: "observer", owner: "p1", type: "become-mighty" };

      expect(findMatchingTriggers(selfEvent, [observer])).toHaveLength(0);
    });

    test("self become-mighty still matches the card itself", () => {
      const card = makeCard("unit-1", [makeAbility("become-mighty", "self")], "base", "p1");
      const event: GameEvent = { cardId: "unit-1", owner: "p1", type: "become-mighty" };

      const matches = findMatchingTriggers(event, [card]);
      expect(matches).toHaveLength(1);
    });

    test("enemy-units become-mighty matches opposite owner", () => {
      const observer = makeCard(
        "observer",
        [makeAbility("become-mighty", "enemy-units")],
        "base",
        "p1",
      );
      const event: GameEvent = { cardId: "foe", owner: "p2", type: "become-mighty" };

      const matches = findMatchingTriggers(event, [observer]);
      expect(matches).toHaveLength(1);
    });
  });
});
