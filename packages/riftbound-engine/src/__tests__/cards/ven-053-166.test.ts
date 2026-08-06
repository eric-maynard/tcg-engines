/**
 * Otterpus — ven-053-166 · Unit · Mind · 2 energy · 2 might
 *
 *   If a player would score 1 point from conquering or holding during their
 *   first or second turn, they draw 1 instead.
 *
 * Rule 571.4 — `replaces: "score"` replacement consulted on the hold/conquer
 * score paths.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const OTTERPUS = "ven-053-166";

describe("Otterpus (ven-053-166)", () => {
  test("holding on your second turn draws 1 instead of scoring", async () => {
    // Turn 2, P2 active → P1's next turn is P1's 2nd (turnsTaken 1 → 2).
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", OTTERPUS, "otter")
      .build();
    expect(game.p1.points()).toBe(0);
    const handBefore = game.p1.hand().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    // No point from holding bf1 …
    expect(game.p1.points()).toBe(0);
    // … but one extra card: hold-replacement draw + draw phase.
    expect(game.p1.hand().length).toBe(handBefore + 2);
  });

  test("from the third turn on, holding scores normally", async () => {
    // Turn 6, P2 active → P1 turnsTaken starts at 3, becomes 4 on their turn.
    const game = await scenario()
      .turn(6)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", OTTERPUS, "otter")
      .build();
    const handBefore = game.p1.hand().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand().length).toBe(handBefore + 1);
  });
});
