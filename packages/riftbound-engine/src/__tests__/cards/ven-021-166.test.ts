/**
 * Akali, Deadly Weapon — ven-021-166 · Champion Unit (Akali) · Fury · 3 energy · 3 Might
 *
 *   [Empower] [2][fury]
 *   When I move, you may deal 1 to a unit at a battlefield I moved to or from.
 *     If I'm [Empowered], deal 2 instead.
 *   [Empowered] I have +1 [Might].
 *
 * Rules: 827 ("… instead" while [Empowered] REPLACES the printed amount, it does not add to it),
 * 144 (a Standard Move fires the move trigger), 355.10 (the damage target is chosen when the
 * triggered ability resolves).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ven-021-166";

function board(empowered: boolean) {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .card("akali", {
      def: CARD,
      meta: empowered ? { empowered: true } : undefined,
      owner: P1,
      zone: "base",
    })
    .unit(P1, "bf1", { might: 5, name: "Target Dummy" }, "dummy");
}

describe("Akali, Deadly Weapon (ven-021-166)", () => {
  test("not [Empowered]: the move trigger deals 1", async () => {
    const game = await board(false).build();
    await game.p1.move("akali", "bf1");
    await game.settle();
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("dummy");
    }
    await game.settle();
    expect(game.state("dummy").damage).toBe(1);
  });

  test("[Empowered]: the move trigger deals 2 instead of 1 (rule 827)", async () => {
    const game = await board(true).build();
    expect(game.state("akali").isEmpowered).toBe(true);
    await game.p1.move("akali", "bf1");
    await game.settle();
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("dummy");
    }
    await game.settle();
    expect(game.state("dummy").damage).toBe(2);
  });
});

describe("Akali's move trigger asks who takes the damage (rule 355.10)", () => {
  function twoFoes(empowered: boolean) {
    return scenario()
      .battlefield("bf1", { controller: P1 })
      .card("akali", {
        def: CARD,
        meta: empowered ? { empowered: true } : undefined,
        owner: P1,
        zone: "base",
      })
      .unit(P2, "bf1", { might: 5 }, "big")
      .unit(P2, "bf1", { might: 3 }, "small");
  }

  test("the controller picks the damaged unit instead of the engine auto-picking", async () => {
    const game = await twoFoes(true).build();
    await game.p1.move("akali", "bf1");
    await game.settle();
    await game.p1.yes();
    expect(game.decision()?.kind).toBe("pick");
    await game.p1.pick("small");
    await game.settle();
    expect(game.state("small").damage).toBe(2);
    expect(game.state("big").damage ?? 0).toBe(0);
  });
});
