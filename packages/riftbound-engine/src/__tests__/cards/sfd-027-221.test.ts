/**
 * Dunebreaker — sfd-027-221 · Unit · Fury · 7 energy + 1 [fury] · 7 might
 *
 *   If you have two or fewer cards in your hand, I enter ready.
 *   When I hold, draw 2.
 *
 * Rules: 143.4 (units enter exhausted), 364.3.a / 369.3 ("If …, I enter ready" is a
 * conditional replacement checked as the unit enters — by then Dunebreaker itself has
 * left the hand), 469.2 / 383.4.d (Hold: keep control of a battlefield in your
 * Beginning Phase; hold effects trigger for units AT the held battlefield).
 * Across a turn start the turn player draws 1 in their draw phase.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-027-221";
const FILLER = "ogn-175-298";

function inHand(others: number) {
  const b = scenario().resources(P1, { energy: 7, power: { fury: 1 } }).hand(P1, CARD, "dune");
  for (let i = 0; i < others; i++) b.hand(P1, FILLER);
  return b;
}

describe("Dunebreaker (sfd-027-221)", () => {
  test("cost: 7 energy + 1 fury for a 7-might unit; unaffordable without the fury or with 6 energy", async () => {
    const game = await inHand(0).build();
    await game.p1.play("dune");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("dune")).toBe("base");
    expect(game.state("dune").might).toBe(7);
    expect((await scenario().resources(P1, { energy: 7 }).hand(P1, CARD, "dune").build()).p1.can("play", "dune")).toBe(false);
    expect((await scenario().resources(P1, { energy: 6, power: { fury: 1 } }).hand(P1, CARD, "dune").build()).p1.can("play", "dune")).toBe(false);
  });

  test("enters READY when you have two or fewer cards in hand (empty hand after playing it)", async () => {
    const game = await inHand(0).build();
    await game.p1.play("dune");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.state("dune").isReady).toBe(true);
  });

  test("enters ready with exactly two other cards left in hand", async () => {
    const game = await inHand(2).build();
    await game.p1.play("dune");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.state("dune").isReady).toBe(true);
  });

  test.failing("BUG: enters EXHAUSTED with three or more other cards in hand — the 'two or fewer' condition is ignored (rules 143.4, 364.3.a)", async () => {
    // Expected: 4 other cards in hand → condition false → normal exhausted entry. Actual: the
    // static enter-ready effect applies unconditionally, so Dunebreaker is ready.
    const game = await inHand(4).build();
    await game.p1.play("dune");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(4);
    expect(game.state("dune").isExhausted).toBe(true);
  });

  test("When I hold: at the start of your turn holding its battlefield, draw 2 (+1 draw phase = 3) and score the hold point", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "dune")
      .build();
    expect(game.p1.hand()).toHaveLength(0);
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dune", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(3);
  });

  test("no hold trigger when Dunebreaker sits in the base while another unit holds (only the draw-phase card)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "grunt")
      .unit(P1, "base", CARD, "dune")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("only YOUR hold: nothing is drawn during the opponent's Beginning Phase", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "dune")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.p1.points()).toBe(0);
  });
});
