/**
 * Ol' Poro — ven-029-166 · Unit · Calm · 2 energy · 4 might
 *
 *   I can't be played on your first, second, or third turns.
 *
 * Rule 419.1 — a play restriction printed on the card itself. A player's first
 * turn is `turnsTaken === 1`, so the play becomes legal on their fourth turn.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const OL_PORO = "ven-029-166";

describe("Ol' Poro (ven-029-166)", () => {
  test("cannot be played on your first turn", async () => {
    const game = await scenario()
      .turn(1)
      .active(P1)
      .resources(P1, { energy: 6 })
      .hand(P1, OL_PORO, "poro")
      .build();
    expect(game.p1.can("play", "poro")).toBe(false);
    const attempt = await game.p1.try((p) => p.play("poro", { to: "base" }));
    expect(attempt.ok).toBe(false);
    expect(game.zoneOf("poro")).toBe("hand");
  });

  test("still cannot be played on your third turn", async () => {
    const game = await scenario()
      .turn(6)
      .active(P1)
      .resources(P1, { energy: 6 })
      .hand(P1, OL_PORO, "poro")
      .build();
    expect(game.p1.can("play", "poro")).toBe(false);
  });

  test("can be played from your fourth turn on", async () => {
    const game = await scenario()
      .turn(8)
      .active(P1)
      .resources(P1, { energy: 6 })
      .hand(P1, OL_PORO, "poro")
      .build();
    expect(game.p1.can("play", "poro")).toBe(true);
    await game.p1.play("poro", { to: "base" });
    expect(game.zoneOf("poro")).toBe("base");
  });
});
