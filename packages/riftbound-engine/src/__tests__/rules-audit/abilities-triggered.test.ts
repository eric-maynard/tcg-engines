/**
 * Rules Audit: Triggered Abilities (rule 583 + sub-rules)
 *
 * Rule 583 defines Triggered Abilities as repeatable effects that fire when
 * a Condition is met ("When you conquer here", "At the start of your turn",
 * "When a friendly unit dies", etc.). A matched trigger goes onto the Chain
 * as if it were an activated ability (rule 583.x).
 *
 * The engine currently fires triggers IMMEDIATELY via `fireTriggers` rather
 * than queueing them onto the chain, so tests here observe side effects
 * (damage counters, cards moved, flags set) as proof the trigger executed.
 *
 * Wave 2B rule index maps 13 rules to this file. Key rules covered:
 *   - 583: Trigger definition & firing
 *   - 583.1-x: Trigger wording variants ("When", "At", self vs friendly vs
 *     any vs enemy scoping)
 *   - Battlefield hold/conquer triggers (the Wave 1 bug regression test)
 *   - Self-triggers vs `on: "friendly-units"` triggers
 *   - Optional triggers (engine currently always fires; mark todo)
 *   - Multiple simultaneous triggers (controller-order; mark todo)
 *   - Triggers on legendZone / championZone cards
 */

import { describe, expect, it } from "bun:test";
import { orderTriggers } from "../../abilities/trigger-runner";
import {
  P1,
  P2,
  createBattlefield,
  createCard,
  createMinimalGameState,
  fireTrigger,
  getCardMeta,
} from "./helpers";

// A simple triggered ability that damages itself by 1 on a start-of-turn
// Event. The effect `{ type: "damage", amount: 1, target: { type: "self" } }`
// Is executed immediately by the trigger runner; the damage counter lands on
// The ability source card.
const SELF_DAMAGE_TRIGGER = (event: string, on?: string) => ({
  effect: { amount: 1, target: { type: "self" }, type: "damage" },
  on,
  trigger: { event, on },
  type: "triggered" as const,
});

// -----------------------------------------------------------------------------
// Rule 583: A triggered ability fires when its condition is met.
// -----------------------------------------------------------------------------

describe("Rule 583: A triggered ability fires when its condition is met", () => {
  it("a 'start-of-turn' trigger on a base unit fires when start-of-turn event is raised", () => {
    const engine = createMinimalGameState({ phase: "beginning" });
    createCard(engine, "hero", {
      abilities: [SELF_DAMAGE_TRIGGER("start-of-turn")],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "base",
    });

    const fired = fireTrigger(engine, { playerId: P1, type: "start-of-turn" });
    expect(fired).toBe(1);

    // Side effect: self-damage landed on the trigger source.
    expect(getCardMeta(engine, "hero")?.damage ?? 0).toBe(1);
  });

  it("a trigger does NOT fire when the event type does not match", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "hero", {
      abilities: [SELF_DAMAGE_TRIGGER("start-of-turn")],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "base",
    });

    // Fire an unrelated event.
    const fired = fireTrigger(engine, { playerId: P1, type: "end-of-turn" });
    expect(fired).toBe(0);
    expect(getCardMeta(engine, "hero")?.damage ?? 0).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// Rule 583.1: "When" and "At" are the trigger words.
// -----------------------------------------------------------------------------

describe("Rule 583.1: 'When' and 'At' trigger words map to event-based trigger abilities", () => {
  it("'when I die' fires a die event scoped to self (play-self variant)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "martyr", {
      abilities: [
        {
          effect: { amount: 1, target: { type: "self" }, type: "damage" },
          trigger: { event: "play-self", on: "self" },
          type: "triggered",
        },
      ],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });

    const fired = fireTrigger(engine, {
      cardId: "martyr",
      playerId: P1,
      type: "play-self",
    });
    expect(fired).toBe(1);
    expect(getCardMeta(engine, "martyr")?.damage ?? 0).toBe(1);
  });
});

// -----------------------------------------------------------------------------
// Rule 583 / trigger-matcher: battlefield self-triggers fire for CONTROLLER,
// Not for the deck owner of the battlefield card. (Wave 1 regression test.)
// -----------------------------------------------------------------------------

describe("Rule 583 (battlefield self-trigger): hold trigger fires for controller, not deck-owner", () => {
  it("battlefield owned by P2's deck, controlled by P1: hold trigger on the battlefield fires when P1 holds", () => {
    // Bf-1 is "owned" by P2 (placed there on game start) but P1 controls it.
    // Per trigger-matcher's battlefield self-trigger fix: the trigger fires
    // When `event.battlefieldId === card.id`, independent of card owner.
    const engine = createMinimalGameState({ phase: "beginning" });
    createBattlefield(engine, "bf-1", {
      abilities: [
        {
          effect: { amount: 1, target: { type: "self" }, type: "damage" },
          trigger: { event: "hold", on: "self" },
          type: "triggered",
        },
      ],
      controller: P1,
    });

    // Fire a hold event — P1 is the one holding.
    const fired = fireTrigger(engine, {
      battlefieldId: "bf-1",
      playerId: P1,
      type: "hold",
    });
    expect(fired).toBe(1);
    // Proof the trigger's effect executed (damage landed on the battlefield
    // Card itself — a battlefield taking damage is a test-only artifact,
    // But it confirms the trigger ran).
    expect(getCardMeta(engine, "bf-1")?.damage ?? 0).toBe(1);
  });

  it("battlefield self-trigger does NOT fire for a DIFFERENT battlefield id", () => {
    const engine = createMinimalGameState({ phase: "beginning" });
    createBattlefield(engine, "bf-1", {
      abilities: [
        {
          effect: { amount: 1, target: { type: "self" }, type: "damage" },
          trigger: { event: "hold", on: "self" },
          type: "triggered",
        },
      ],
      controller: P1,
    });
    createBattlefield(engine, "bf-2", { controller: P2 });

    // Fire a hold event for bf-2 — bf-1's self-trigger should NOT match.
    const fired = fireTrigger(engine, {
      battlefieldId: "bf-2",
      playerId: P2,
      type: "hold",
    });
    expect(fired).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// Rule 583 (scope): "friendly units", "enemy units", "any unit"
// -----------------------------------------------------------------------------

describe("Rule 583 (scope): 'friendly' triggers fire only for cards owned by the same player", () => {
  it("'friendly-units' die trigger fires when a friendly unit dies", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "watcher", {
      abilities: [
        {
          effect: { amount: 1, target: { type: "self" }, type: "damage" },
          trigger: { event: "die", on: "friendly-units" },
          type: "triggered",
        },
      ],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "base",
    });
    // A friendly unit dies.
    createCard(engine, "ally", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "base",
    });

    const fired = fireTrigger(engine, {
      cardId: "ally",
      owner: P1,
      type: "die",
    });
    expect(fired).toBe(1);
    expect(getCardMeta(engine, "watcher")?.damage ?? 0).toBe(1);
  });

  it("'friendly-units' die trigger does NOT fire when an enemy unit dies", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "watcher", {
      abilities: [
        {
          effect: { amount: 1, target: { type: "self" }, type: "damage" },
          trigger: { event: "die", on: "friendly-units" },
          type: "triggered",
        },
      ],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "base",
    });
    // An enemy unit dies.
    createCard(engine, "enemy", {
      cardType: "unit",
      might: 1,
      owner: P2,
      zone: "base",
    });

    const fired = fireTrigger(engine, {
      cardId: "enemy",
      owner: P2,
      type: "die",
    });
    expect(fired).toBe(0);
    expect(getCardMeta(engine, "watcher")?.damage ?? 0).toBe(0);
  });

  it("'friendly-other-units' excludes the trigger source itself", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "paladin", {
      abilities: [
        {
          effect: { amount: 1, target: { type: "self" }, type: "damage" },
          trigger: { event: "die", on: "friendly-other-units" },
          type: "triggered",
        },
      ],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "base",
    });

    // The paladin itself dies — its own trigger should NOT fire for itself.
    const fired = fireTrigger(engine, {
      cardId: "paladin",
      owner: P1,
      type: "die",
    });
    expect(fired).toBe(0);
  });

  it("'enemy-units' die trigger fires only when an enemy dies", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "vulture", {
      abilities: [
        {
          effect: { amount: 1, target: { type: "self" }, type: "damage" },
          trigger: { event: "die", on: "enemy-units" },
          type: "triggered",
        },
      ],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "base",
    });
    // Enemy dies.
    createCard(engine, "foe", {
      cardType: "unit",
      might: 1,
      owner: P2,
      zone: "base",
    });

    const fired = fireTrigger(engine, {
      cardId: "foe",
      owner: P2,
      type: "die",
    });
    expect(fired).toBe(1);
    expect(getCardMeta(engine, "vulture")?.damage ?? 0).toBe(1);
  });
});

// -----------------------------------------------------------------------------
// Triggers on cards in legendZone and championZone
// -----------------------------------------------------------------------------

describe("Rule 583.x: Triggers on legend-zone cards fire (legends remain relevant on the board)", () => {
  it("a start-of-turn trigger on a legend in the legendZone fires", () => {
    const engine = createMinimalGameState({ phase: "beginning" });
    createCard(engine, "the-legend", {
      abilities: [SELF_DAMAGE_TRIGGER("start-of-turn")],
      cardType: "legend",
      might: 0,
      owner: P1,
      zone: "legendZone",
    });

    const fired = fireTrigger(engine, { playerId: P1, type: "start-of-turn" });
    expect(fired).toBe(1);
    expect(getCardMeta(engine, "the-legend")?.damage ?? 0).toBe(1);
  });

  it("Rule 585.1 / 585.2: a trigger on a champion in championZone does NOT fire (not yet played)", () => {
    // Clarification from the rules primer: a champion sitting in
    // ChampionZone has not yet been played — its triggered abilities do
    // NOT fire. The trigger runner intentionally skips scanning
    // ChampionZone.
    const engine = createMinimalGameState({ phase: "beginning" });
    createCard(engine, "champ-waiting", {
      abilities: [SELF_DAMAGE_TRIGGER("start-of-turn")],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "championZone",
    });
    const fired = fireTrigger(engine, { playerId: P1, type: "start-of-turn" });
    expect(fired).toBe(0);
    expect(getCardMeta(engine, "champ-waiting")?.damage ?? 0).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// Self-scoping: start/end-of-turn triggers only fire on the owner's turn
// -----------------------------------------------------------------------------

describe("Rule 583 (self-scoping): 'At the start of my turn' fires only on the card-owner's turn", () => {
  it("start-of-turn event with playerId=P2 does NOT fire a P1-owned card's start-of-turn self-trigger", () => {
    const engine = createMinimalGameState({ phase: "beginning" });
    createCard(engine, "p1-hero", {
      abilities: [SELF_DAMAGE_TRIGGER("start-of-turn")],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "base",
    });

    // Fire with playerId=P2 — P1's self-trigger shouldn't match because
    // The trigger matcher filters non-battlefield self-triggers by owner.
    const fired = fireTrigger(engine, { playerId: P2, type: "start-of-turn" });
    expect(fired).toBe(0);
    expect(getCardMeta(engine, "p1-hero")?.damage ?? 0).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// Rule 585: Simultaneous triggers resolve in controller-chosen order.
// -----------------------------------------------------------------------------

describe("Rule 585: Multiple triggers fire when their conditions are met simultaneously", () => {
  it("two separate cards each with a start-of-turn trigger both fire on one event", () => {
    const engine = createMinimalGameState({ phase: "beginning" });
    createCard(engine, "hero-a", {
      abilities: [SELF_DAMAGE_TRIGGER("start-of-turn")],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "base",
    });
    createCard(engine, "hero-b", {
      abilities: [SELF_DAMAGE_TRIGGER("start-of-turn")],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "base",
    });

    const fired = fireTrigger(engine, { playerId: P1, type: "start-of-turn" });
    expect(fired).toBe(2);
    expect(getCardMeta(engine, "hero-a")?.damage ?? 0).toBe(1);
    expect(getCardMeta(engine, "hero-b")?.damage ?? 0).toBe(1);
  });

  // Rule 585.1: Simultaneous triggers from the same controller fire in
  // Controller-chosen order. The engine's `orderTriggers` helper preserves
  // Insertion order within a single owner as the default/auto ordering.
  it("Rule 585.1: simultaneous same-player triggers preserve insertion order (default auto choice)", () => {
    const matches = [
      {
        ability: { effect: {}, trigger: { event: "start-of-turn" }, type: "triggered" } as never,
        cardId: "a",
        cardOwner: P1,
      },
      {
        ability: { effect: {}, trigger: { event: "start-of-turn" }, type: "triggered" } as never,
        cardId: "b",
        cardOwner: P1,
      },
      {
        ability: { effect: {}, trigger: { event: "start-of-turn" }, type: "triggered" } as never,
        cardId: "c",
        cardOwner: P1,
      },
    ];
    const ordered = orderTriggers(matches, P1, [P1, P2]);
    expect(ordered.map((m) => m.cardId)).toEqual(["a", "b", "c"]);
  });

  // Rule 585.2: When triggers belong to different controllers, the turn
  // Player's triggers fire first, then subsequent players in turn order.
  it("Rule 585.2: turn player's triggers are ordered before non-turn-player triggers", () => {
    const matches = [
      {
        ability: { effect: {}, trigger: { event: "start-of-turn" }, type: "triggered" } as never,
        cardId: "p2-card",
        cardOwner: P2,
      },
      {
        ability: { effect: {}, trigger: { event: "start-of-turn" }, type: "triggered" } as never,
        cardId: "p1-card-first",
        cardOwner: P1,
      },
      {
        ability: { effect: {}, trigger: { event: "start-of-turn" }, type: "triggered" } as never,
        cardId: "p1-card-second",
        cardOwner: P1,
      },
    ];
    // P1 is the turn player → P1's triggers fire first, then P2's.
    const ordered = orderTriggers(matches, P1, [P1, P2]);
    expect(ordered.map((m) => m.cardId)).toEqual([
      "p1-card-first",
      "p1-card-second",
      "p2-card",
    ]);

    // Swap turn player → P2's trigger should now be first.
    const orderedP2 = orderTriggers(matches, P2, [P1, P2]);
    expect(orderedP2.map((m) => m.cardId)).toEqual([
      "p2-card",
      "p1-card-first",
      "p1-card-second",
    ]);
  });
});

// -----------------------------------------------------------------------------
// Rule 583 (optional): "You may" triggers
// -----------------------------------------------------------------------------

describe("Rule 583 (optional triggers): 'You may' triggers still queue but are skippable", () => {
  // Deferred: engine has no 'optional trigger' flag — all triggers auto-fire.
  // Supporting optional triggers requires a new ability shape and a choose-
  // To-accept UI step.
  it.todo(
    "Rule 583.x: optional 'you may' triggers should be offered but skippable (engine gap: all triggers auto-fire)",
  );
});

// -----------------------------------------------------------------------------
// Rule 583 (information level): triggers outside the board depend on zone
// Visibility
// -----------------------------------------------------------------------------

describe("Rule 583.x: Triggered abilities on cards in the hand/deck/trash do not evaluate", () => {
  it("a trigger on a card in the trash does NOT fire", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "dead-hero", {
      abilities: [SELF_DAMAGE_TRIGGER("start-of-turn")],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "trash",
    });

    const fired = fireTrigger(engine, { playerId: P1, type: "start-of-turn" });
    expect(fired).toBe(0);
  });

  it("a trigger on a card in the hand does NOT fire", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "hand-unit", {
      abilities: [SELF_DAMAGE_TRIGGER("start-of-turn")],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "hand",
    });

    const fired = fireTrigger(engine, { playerId: P1, type: "start-of-turn" });
    expect(fired).toBe(0);
  });
});
