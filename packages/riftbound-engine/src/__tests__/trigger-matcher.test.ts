/**
 * Trigger Matcher Tests
 */

import { describe, expect, test } from "bun:test";
import type { GameEvent } from "../abilities/game-events";
import type { CardWithAbilities, TriggerableAbility } from "../abilities/trigger-matcher";
import { findMatchingTriggers } from "../abilities/trigger-matcher";
import { evaluateTriggerCondition } from "../abilities/trigger-runner";
import type { RiftboundGameState } from "../types";

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

  // Regression: Bug A (card-playtest batch2) — Darius ogn-027-298
  // "When you play your second card in a turn" fired on EVERY play because
  // toTriggerableAbilities dropped trigger.restrictions and the matcher never
  // checked nth-time-each-turn.
  describe("trigger restrictions: nth-time-each-turn", () => {
    const darius: TriggerableAbility = {
      effect: { type: "raw" },
      trigger: {
        event: "play-card",
        on: "controller",
        restrictions: [{ count: 2, type: "nth-time-each-turn" }],
      },
      type: "triggered",
    };
    const card = makeCard("darius", [darius], "base", "p1");
    const event: GameEvent = { cardId: "x", cardType: "unit", playerId: "p1", type: "play-card" };

    test("does NOT fire on the first card play", () => {
      const matches = findMatchingTriggers(event, [card], { cardsPlayedThisTurn: { p1: 0 } });
      expect(matches).toHaveLength(0);
    });

    test("fires ONLY on the second card play", () => {
      const matches = findMatchingTriggers(event, [card], { cardsPlayedThisTurn: { p1: 1 } });
      expect(matches).toHaveLength(1);
    });

    test("does NOT fire on the third card play", () => {
      const matches = findMatchingTriggers(event, [card], { cardsPlayedThisTurn: { p1: 2 } });
      expect(matches).toHaveLength(0);
    });
  });

  // Regression: Bug B (card-playtest batch2) — Zaun Punk sfd-160-221
  // condition:{type:"paid-additional-cost"} was not handled in
  // evaluateTriggerCondition, so the payoff fired for free.
  describe("trigger condition: paid-additional-cost", () => {
    const state = {} as RiftboundGameState;

    test("blocks payoff when the play event did not pay the additional cost", () => {
      const event: GameEvent = {
        cardId: "zaun-punk",
        paidAdditionalCost: false,
        playerId: "p1",
        type: "play-self",
      };
      expect(
        evaluateTriggerCondition({ type: "paid-additional-cost" }, state, "p1", event),
      ).toBe(false);
    });

    test("blocks payoff when paidAdditionalCost is absent from the event", () => {
      const event: GameEvent = { cardId: "zaun-punk", playerId: "p1", type: "play-self" };
      expect(
        evaluateTriggerCondition({ type: "paid-additional-cost" }, state, "p1", event),
      ).toBe(false);
    });

    test("allows payoff when the play event paid the additional cost", () => {
      const event: GameEvent = {
        cardId: "zaun-punk",
        paidAdditionalCost: true,
        playerId: "p1",
        type: "play-self",
      };
      expect(
        evaluateTriggerCondition({ type: "paid-additional-cost" }, state, "p1", event),
      ).toBe(true);
    });
  });

  // rule-id: unl-133-219 (Blast Cone) — "When YOU move an ENEMY unit".
  describe("actor-scoped move trigger (unl-133-219)", () => {
    const blastCone = (): CardWithAbilities =>
      makeCard(
        "blast-cone",
        [
          {
            effect: { target: { type: "trigger-source" }, type: "stun" },
            optional: true,
            trigger: {
              event: "move",
              on: { actor: "controller", cardType: "unit", controller: "enemy" } as unknown as string,
            },
            type: "triggered",
          },
        ],
        "base",
        "p1",
      );

    test("fires when the controller moves an enemy unit", () => {
      const event: GameEvent = {
        cardId: "enemy-unit",
        from: "base",
        movedBy: "p1",
        owner: "p2",
        to: "battlefield-bf-1",
        type: "move",
      };
      expect(findMatchingTriggers(event, [blastCone()])).toHaveLength(1);
    });

    test("does not fire when the opponent moves their own unit", () => {
      const event: GameEvent = {
        cardId: "enemy-unit",
        from: "base",
        movedBy: "p2",
        owner: "p2",
        to: "battlefield-bf-1",
        type: "move",
      };
      expect(findMatchingTriggers(event, [blastCone()])).toHaveLength(0);
    });

    test("does not fire when the controller moves a friendly unit", () => {
      const event: GameEvent = {
        cardId: "own-unit",
        from: "base",
        movedBy: "p1",
        owner: "p1",
        to: "battlefield-bf-1",
        type: "move",
      };
      expect(findMatchingTriggers(event, [blastCone()])).toHaveLength(0);
    });

    test("does not fire when the mover is unknown", () => {
      const event: GameEvent = {
        cardId: "enemy-unit",
        from: "base",
        owner: "p2",
        to: "battlefield-bf-1",
        type: "move",
      };
      expect(findMatchingTriggers(event, [blastCone()])).toHaveLength(0);
    });
  });
});
