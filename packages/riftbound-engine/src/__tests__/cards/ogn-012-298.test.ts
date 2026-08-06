/**
 * Noxus Hopeful — ogn-012-298 · Unit · Fury · 4 energy · 4 might
 *
 *   [Legion] — I cost [2] less. (Get the effect if you've played another card this turn.)
 *
 * Rule 812: Legion is active once a *different* card has been finalized by you this turn.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ogn-012-298";
const CHEAP = { cardType: "unit", energyCost: 1, might: 1, name: "Cheap Recruit" };

describe("Noxus Hopeful (ogn-012-298)", () => {
  test("base cost: 4 energy when no other card was played this turn", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "hopeful").build();
    expect(game.p1.can("play", "hopeful")).toBe(true);
    await game.p1.play("hopeful");
    await game.settle();
    expect(game.zoneOf("hopeful")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.state("hopeful").might).toBe(4);
  });

  test("not playable with only 3 energy and no other card played this turn", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "hopeful").build();
    expect(game.p1.can("play", "hopeful")).toBe(false);
    const r = await game.p1.try((p) => p.play("hopeful"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("hopeful")).toBe("hand");
  });

  test("Legion — after playing another card this turn Noxus Hopeful should cost 2 (rule 812 / 727.1)", async () => {
    // Expected: with cardsPlayedThisTurn[P1] = 1 the keyword cost-reduction makes the play legal at
    // 2 energy and charges 2. Actual: the {type:"keyword", keyword:"Legion", effect: cost-reduction}
    // ability is never consulted by the cost calculator, so the full 4 is required/charged.
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .hand(P1, CHEAP, "cheap")
      .hand(P1, CARD, "hopeful")
      .build();
    expect(game.p1.can("play", "hopeful")).toBe(false); // 3 < 4, Legion not yet active
    await game.p1.play("cheap");
    await game.settle();
    expect(game.zoneOf("cheap")).toBe("base");
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("play", "hopeful")).toBe(true);
    await game.p1.play("hopeful");
    await game.settle();
    expect(game.zoneOf("hopeful")).toBe("base");
    expect(game.p1.energy()).toBe(0);
  });

  test("Legion only counts cards played THIS turn (resets next turn)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .hand(P1, CHEAP, "cheap")
      .hand(P1, CARD, "hopeful")
      .build();
    await game.p1.play("cheap");
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBeGreaterThan(2);
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    // Fresh turn: give exactly 3 energy — not enough without Legion.
    await game.p1.do("addResources", { energy: 3 - game.p1.energy() });
    expect(game.p1.energy()).toBe(3);
    expect(game.p1.can("play", "hopeful")).toBe(false);
  });
});
