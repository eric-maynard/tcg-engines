/**
 * Ruling 9470e8a25ac3573f — re-conquering a battlefield you already scored this turn.
 *   Cards: Zaun Warrens (OGN-298 → ogn-298-298) battlefield "When you conquer here, discard 1, then draw 1."
 *   × inline filler units and a base-speed "Kill a friendly unit".
 *
 * Q: I held a point at a battlefield, then killed my own unit there. Can I conquer it again the same turn?
 * A: You can move back in and take control again, but you score no extra point and NO conquer abilities
 *    trigger — a battlefield scores at most once per turn per player, by either method.
 * Rules: 470 (once per battlefield per turn), 471.2 / 471.2.c (score abilities trigger only on a Score),
 *    315.2.b (Hold at the Scoring Step), 323.6 (control lapses when you have no unit there).
 */
import { describe, expect, test } from "bun:test";
import type { Game, InlineCardDef } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZAUN_WARRENS = "ogn-298-298";

const KILL_FRIENDLY: InlineCardDef = {
  abilities: [{ effect: { target: { controller: "friendly", type: "unit" }, type: "kill" }, type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  name: "Filler Sacrifice",
  rulesText: "Kill a friendly unit.",
  timing: "standard",
};

/** P2's turn 2. P1 controls the Warrens with a unit, holds a reserve in base and the sacrifice spell. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .resources(P1, { energy: 2 })
    .battlefield("warrens", { controller: P1, def: ZAUN_WARRENS, inert: false })
    .battlefield("bf2", { controller: null })
    .unit(P1, "warrens", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 3, name: "Reserve" }, "reserve")
    .hand(P1, KILL_FRIENDLY, "sac")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** P1's turn opens: the Warrens is HELD for a point (a Hold does not fire "when you conquer here"). */
async function heldThenEmptied(): Promise<Game> {
  const game = await board().build();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.p1.points()).toBe(1);
  expect(game.gameState.scoredThisTurn[P1] ?? []).toContain("warrens");
  const handAfterHold = game.p1.hand().length;
  await game.p1.cast("sac", { targets: "holder" });
  await game.settle();
  expect(game.zoneOf("holder")).toBe("trash");
  expect(game.p1.units("warrens")).toEqual([]);
  expect(game.p1.hand().length).toBe(handAfterHold - 1); // only the spell left the hand
  return game;
}

describe("Ruling 9470e8a25ac3573f — you may retake it, but it scores nothing a second time", () => {
  test("holding it scored 1 point and did NOT fire the 'when you conquer here' trigger", async () => {
    const game = await heldThenEmptied();
    expect(game.p1.points()).toBe(1);
  });

  test("killing my own unit there drops my control of the battlefield", async () => {
    const game = await heldThenEmptied();
    expect(game.gameState.battlefields.warrens?.controller ?? null).toBe(null);
  });

  test("the reserve may still move in — moving is never blocked by having scored", async () => {
    const game = await heldThenEmptied();
    await game.p1.move("reserve", "warrens");
    await game.settle();
    expect(game.locationOf("reserve")).toBe("warrens");
    expect(game.gameState.battlefields.warrens?.controller).toBe(P1);
  });

  test("…but it awards NO second point and fires NO conquer ability (no discard, no draw)", async () => {
    const game = await heldThenEmptied();
    const handBefore = game.p1.hand().length;
    const trashBefore = game.p1.trash().length;
    await game.p1.move("reserve", "warrens");
    await game.settle();
    expect(game.p1.points()).toBe(1); // still 1 (470)
    expect(game.p1.hand().length).toBe(handBefore); // Zaun Warrens' discard-then-draw never ran
    expect(game.p1.trash().length).toBe(trashBefore);
  });

  test("next turn the ledger is clear, so the same battlefield scores again", async () => {
    const game = await heldThenEmptied();
    await game.p1.move("reserve", "warrens");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    await game.advanceTurn(); // P2's turn
    await game.advanceTurn(); // back to P1: Hold the Warrens again
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
