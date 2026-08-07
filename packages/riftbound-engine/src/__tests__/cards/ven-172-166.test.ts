/**
 * Draven, Showboat — ven-172-166 · Champion Unit · Fury · 5 energy + 1 [fury] · 3 Might
 *
 *   My Might is increased by your points.
 *
 * VEN reprint of ogn-028-298 — the static must work on this printing too.
 * Rules: 364 (static abilities apply continuously while on the board).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ven-172-166";

describe("Draven, Showboat (ven-172-166)", () => {
  function withPoints(own: number, opp: number) {
    return scenario().points(P1, own).points(P2, opp).resources(P1, { energy: 5, power: { fury: 1 } }).hand(P1, CARD, "draven");
  }

  test("with 0 points, Might is the printed 3", async () => {
    const game = await withPoints(0, 0).build();
    await game.p1.play("draven");
    await game.settle();
    expect(game.state("draven").baseMight).toBe(3);
    expect(game.state("draven").might).toBe(3);
  });

  test("Might = 3 + YOUR points (4 points → 7); the opponent's points are ignored", async () => {
    const game = await withPoints(4, 6).build();
    await game.p1.play("draven");
    await game.settle();
    expect(game.state("draven").might).toBe(7);
    const onlyOpp = await withPoints(0, 6).build();
    await onlyOpp.p1.play("draven");
    await onlyOpp.settle();
    expect(onlyOpp.state("draven").might).toBe(3);
  });
});
