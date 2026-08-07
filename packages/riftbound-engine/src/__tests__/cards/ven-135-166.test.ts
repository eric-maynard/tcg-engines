/**
 * Kennen, Keeper of Balance — ven-135-166 · Unit (Champion) · Order · 3 energy · 2 might
 *
 *   [Hidden]
 *   When you play me or I attack, you may pay [2] to [Stun] a unit.
 *   While there's a stunned enemy unit here, I have +2 [Might].
 *
 * Rule 445.2 — "here" is the source's own location. The third clause is a
 * conditional self-might static, not an aura on stunned enemies.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const KENNEN = "ven-135-166";

describe("Kennen, Keeper of Balance (ven-135-166)", () => {
  test("gains +2 Might while a stunned enemy unit is at the same battlefield", async () => {
    const game = await scenario()
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", KENNEN, "kennen")
      .unit(P2, "bf1", { might: 3 }, "foe", { stunned: true })
      .build();
    expect(game.state("foe").isStunned).toBe(true);
    expect(game.state("kennen").might).toBe(4);
  });

  test("no bonus while the stunned enemy is elsewhere", async () => {
    const game = await scenario()
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", KENNEN, "kennen")
      .unit(P2, "bf2", { might: 3 }, "foe", { stunned: true })
      .build();
    expect(game.state("kennen").might).toBe(2);
  });

  test("no bonus from an unstunned enemy here, nor from a stunned friendly", async () => {
    const game = await scenario()
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", KENNEN, "kennen")
      .unit(P2, "bf1", { might: 3 }, "foe")
      .unit(P1, "bf1", { might: 1 }, "ally", { stunned: true })
      .build();
    expect(game.state("kennen").might).toBe(2);
  });
});
