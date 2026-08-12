/**
 * Ruling 58a78eb451f503f8 — (no specific card) leaving a held battlefield and walking a second unit in.
 *
 * Q: My unit HELD bf1 (scoring at the start of my turn), then I moved it to base and moved a
 *    different ready unit from base to that battlefield. Does that cause a new showdown?
 * A: Yes. The moment the last unit left, the battlefield became empty and control lapsed, so the
 *    second unit is moving to a battlefield you do NOT control — it applies Contested and a
 *    (non-combat) showdown opens, which you then win back. But you already scored bf1 this turn from
 *    the Hold, so the re-take gives no second point and fires no Conquer effects.
 * Rules: 323.6 (control lapses in the Cleanup), 445 (Contested), 344.2 (showdown staged),
 *        465/471.2.c (one score per battlefield per player per turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** P1 enters their turn holding bf1 with Alpha; Bravo waits in base. */
async function heldBoard(): Promise<Game> {
  const game = await scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Alpha" }, "alpha")
    .unit(P1, "base", { might: 3, name: "Bravo" }, "bravo")
    .unit(P2, "base", { might: 3, name: "Thug" }, "thug")
    .build();
  await game.advanceTurn(); // P2 ends; P1's turn starts and bf1 is HELD
  expect(game.turnPlayer()).toBe(P1);
  expect(game.p1.points()).toBe(1);
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  return game;
}

describe("Ruling 58a78eb451f503f8 — re-entering a battlefield you emptied opens a NEW showdown but scores nothing", () => {
  test("moving Alpha home empties bf1 and control lapses", async () => {
    const game = await heldBoard();
    await game.p1.move("alpha", "base");
    await game.settle();
    expect(game.locationOf("alpha")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBeFalsy();
    expect(game.p1.units("bf1")).toEqual([]);
  });

  test("Bravo then walks in: Contested is applied and a non-combat showdown opens", async () => {
    const game = await heldBoard();
    await game.p1.move("alpha", "base");
    await game.settle();
    await game.p1.move("bravo", "bf1");
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    const showdown = (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).at(-1);
    expect(showdown).toBeDefined();
    expect(showdown?.isCombatShowdown).toBe(false); // nobody else is there
    expect(showdown?.battlefieldId).toBe("bf1");
  });

  test("closing it hands bf1 back to P1 — with no extra point, because the Hold already scored it this turn", async () => {
    const game = await heldBoard();
    await game.p1.move("alpha", "base");
    await game.settle();
    await game.p1.move("bravo", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.locationOf("bravo")).toBe("bf1");
    expect(game.p1.points()).toBe(1); // still just the Hold
    expect(game.violations()).toEqual([]);
  });
});
