/**
 * Ruling 3e2fdb966dc400ee — Ride the Wind (OGN-173 → ogn-173-298) · Spell · Chaos · [2][chaos] · [Action]
 *   "Move a friendly unit and ready it."
 *
 * Q: A unit conquers battlefield A, goes back to base, then moves to and conquers battlefield B in the same
 *    turn — do I score points for both?
 * A: Yes. How you conquer never matters; the only limit is that a given battlefield scores at most once per
 *    turn. Conquering the SAME battlefield again in that turn scores nothing more.
 * Rules: 464.1 (Conquer scores unless that battlefield was already scored this turn), 184.4 (control on arrival
 *        at an empty/uncontrolled battlefield), 355.4 (chosen move destination).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn. bfA and bfB are empty and uncontrolled; Vi (3) is ready in P1's base with two Ride the Winds and [4][chaos][chaos]. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 2 } })
    .battlefield("bfA", { controller: null })
    .battlefield("bfB", { controller: null })
    .unit(P1, "base", { might: 3, name: "Vi" }, "vi")
    .hand(P1, RIDE_THE_WIND, "wind1")
    .hand(P1, RIDE_THE_WIND, "wind2");
}

/** Ride the Wind sends Vi home and readies her. */
async function windHome(game: Game, card: string): Promise<void> {
  await game.p1.cast(card, { targets: "vi" });
  await game.settle();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("base");
    await game.settle();
  }
  expect(game.locationOf("vi")).toBe("base");
  expect(game.state("vi").isReady).toBe(true);
}

describe("Ruling 3e2fdb966dc400ee — one unit can score two different battlefields in a turn", () => {
  test("conquering the empty bfA scores the first point", async () => {
    const game = await board().build();
    await game.p1.move("vi", "bfA");
    await game.settle();
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("ruling: Ride the Wind takes her home and readies her, then bfB is conquered too — 2 points", async () => {
    const game = await board().build();
    await game.p1.move("vi", "bfA");
    await game.settle();
    await windHome(game, "wind1");
    expect(game.gameState.battlefields.bfA?.controller ?? null).toBeNull(); // she left; bfA lapses
    expect(game.p1.points()).toBe(1); // leaving does not take the point back
    await game.p1.move("vi", "bfB");
    await game.settle();
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("ruling nuance: the limit is per BATTLEFIELD per turn — going back and conquering bfA again scores nothing", async () => {
    const game = await board().build();
    await game.p1.move("vi", "bfA");
    await game.settle();
    await windHome(game, "wind1");
    await game.p1.move("vi", "bfB");
    await game.settle();
    expect(game.p1.points()).toBe(2);
    await windHome(game, "wind2");
    await game.p1.move("vi", "bfA");
    await game.settle();
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2); // bfA was already scored this turn
    expect(game.violations()).toEqual([]);
  });

  test("the per-turn record is per BATTLEFIELD: both bfA and bfB end up on it, which is why both paid", async () => {
    const game = await board().build();
    await game.p1.move("vi", "bfA");
    await game.settle();
    expect(game.gameState.scoredThisTurn?.[P1] ?? []).toEqual(["bfA"]);
    await windHome(game, "wind1");
    await game.p1.move("vi", "bfB");
    await game.settle();
    expect((game.gameState.scoredThisTurn?.[P1] ?? []).toSorted()).toEqual(["bfA", "bfB"]);
    expect(game.p1.points()).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
