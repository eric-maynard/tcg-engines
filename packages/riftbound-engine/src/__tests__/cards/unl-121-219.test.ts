/**
 * Bewitching Spirit — unl-121-219 · Unit · Chaos · 3 energy · 2 might
 *
 *   When you play me, choose a player. They discard 1.
 *
 * rule-id: unl-121-219-choose-player — the controller is prompted to pick
 * which player discards.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "unl-121-219";

describe("Bewitching Spirit (unl-121-219)", () => {
  test("playing it prompts the controller to choose a player", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .hand(P1, CARD, "spirit")
      .hand(P1, { might: 1 }, "mine")
      .hand(P2, { might: 1 }, "theirs")
      .build();

    await game.p1.play("spirit", { to: "base" });
    await game.settle();

    expect(game.gameState.pendingChoice?.type).toBe("choose-mode");
    expect(game.actingSeat()).toBe(P1);
  });

  test("choosing yourself makes you discard 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .hand(P1, CARD, "spirit")
      .hand(P1, { might: 1 }, "mine")
      .hand(P2, { might: 1 }, "theirs")
      .build();

    await game.p1.play("spirit", { to: "base" });
    await game.settle();
    await game.p1.chooseMode(1);
    await game.settle();

    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.zoneOf("theirs")).toBe("hand");
  });

  test("choosing the opponent makes them discard 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .hand(P1, CARD, "spirit")
      .hand(P1, { might: 1 }, "mine")
      .hand(P2, { might: 1 }, "theirs")
      .build();

    await game.p1.play("spirit", { to: "base" });
    await game.settle();
    await game.p1.chooseMode(0);
    await game.settle();

    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.zoneOf("mine")).toBe("hand");
  });
});
