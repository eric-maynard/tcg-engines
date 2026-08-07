/**
 * Sumpworks Map — unl-085-219 · Gear · Mind · 2 energy · [Reaction]
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   [Temporary] (Kill this at the start of its controller's Beginning Phase, before scoring.)
 *   When an opponent scores, draw 1.
 *
 * rule 468 / 469 — "scores" = a Hold or a Conquer (both emit the `score` event
 * from the points pipeline); a point gained from a card effect is not a Score.
 * rule 383.4.d.2.c — a Score whose point is denied is still a Score.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "unl-085-219";

/** Static "Opponents can't gain points." (Tianna's clause without her condition). */
const DENY_POINTS = { effect: { restriction: "opponents can't gain points.", type: "restriction" }, type: "static" } as const;

describe("Sumpworks Map (unl-085-219)", () => {
  test("an opponent's Conquer is a Score → the Map's controller draws 1", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: null })
      .gear(P1, CARD, "map")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  test("an opponent's Hold at their Scoring Step is a Score → draw 1 (the Map is P1's, so P2's Beginning Phase does not kill it)", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Squatter" }, "squatter")
      .gear(P1, CARD, "map")
      .build();
    const hand0 = game.p1.hand().length;
    await game.advanceTurn(); // → P2's turn: P2 holds bf1
    expect(game.turnPlayer()).toBe(P2);
    await game.settle();
    expect(game.p2.points()).toBe(1);
    expect(game.zoneOf("map")).toBe("base");
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  test("your OWN conquer is not 'an opponent scores' — no draw", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .gear(P1, CARD, "map")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("scout", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  test("a point an opponent gains from a card EFFECT is not a Score (468) — no draw", async () => {
    const GAIN = {
      abilities: [{ effect: { amount: 1, type: "score" }, timing: "action", type: "spell" }],
      cardType: "spell",
      energyCost: 0,
      name: "Filler Laurels",
      timing: "action",
    };
    const game = await scenario().active(P2).gear(P1, CARD, "map").hand(P2, GAIN, "laurels").build();
    const hand0 = game.p1.hand().length;
    await game.p2.cast("laurels");
    await game.settle();
    expect(game.p2.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  test("383.4.d.2.c — an opponent's conquer whose POINT is denied is still a Score → draw 1", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: null })
      .gear(P1, CARD, "map")
      .unit(P1, "base", { abilities: [DENY_POINTS], might: 1, name: "Filler Denier" }, "denier")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(0); // denied
    expect(game.gameState.scoredThisTurn[P2]).toEqual(["bf1"]); // still Scored
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });
});
