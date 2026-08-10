/**
 * Ruling 1690b116b4f5c8f1 — Discipline (OGN-058 → ogn-058-298, Reaction, 2) "Give a unit +2 [Might] this turn. Draw 1."
 *   × Thousand-Tailed Watcher (ogn-116-298, 7 Might) "When you play me, give enemy units -3 [Might] this turn,
 *     to a minimum of 1 [Might]."
 *
 * Q: When the Watcher's "-N, to a minimum of 1" lands on a 1-Might unit, does that floor keep later buffs from
 *    raising it above 1?
 * A: No. The reduction is locked in when applied: on a 1-Might unit it is effectively -0 (the floor eats it), and
 *    that amount never changes afterwards. A later Discipline adds normally: 1 + 2 - 0 = 3.
 * Rules: 477.3 (arithmetic Might modifiers), 359.3 (an effect's values are determined when it is applied).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DISCIPLINE = "ogn-058-298";
const WATCHER = "ogn-116-298";

/**
 * P1's turn. P2: a 1-Might Page and a 5-Might Brute at P2's bf1. P1: Watcher + Discipline in hand with exactly
 * their costs (7 + [mind], then 2).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 9, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Page" }, "page")
    .unit(P2, "bf1", { might: 5, name: "Brute" }, "brute")
    .hand(P1, WATCHER, "watcher")
    .hand(P1, DISCIPLINE, "disc");
}

/** P1 plays the Watcher to base and lets its play trigger resolve. */
async function playWatcher(game: Game): Promise<void> {
  await game.p1.play("watcher", { to: "base" });
  await game.settle();
  expect(game.zoneOf("watcher")).toBe("base");
  expect(game.chain()).toEqual([]);
}

describe("Ruling 1690b116b4f5c8f1 — Watcher's floored reduction snapshots at -0 on a 1-Might unit; Discipline then makes it 3", () => {
  test("premise: the Watcher's -3 (min 1) leaves the 1-Might Page at 1 and drops the 5-Might Brute to 2", async () => {
    const game = await board().build();
    await playWatcher(game);
    expect(game.state("page").might).toBe(1);
    expect(game.state("brute").might).toBe(2);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 0 } });
  });

  test("Discipline on the reduced Page afterwards: 1 + 2 - 0 = 3 (the floor does not pin it at 1)", async () => {
    const game = await board().build();
    await playWatcher(game);
    const hand = game.p1.hand().length;
    await game.p1.cast("disc", { targets: "page" });
    await game.settle();
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1); // Draw 1
    expect(game.state("page").might).toBe(3);
    expect(game.state("brute").might).toBe(2); // untouched by Discipline; its own -3 snapshot is unchanged
    expect(game.violations()).toEqual([]);
  });

  test("both modifiers are 'this turn': next turn the Page is back to 1 and the Brute to 5", async () => {
    const game = await board().build();
    await playWatcher(game);
    await game.p1.cast("disc", { targets: "page" });
    await game.settle();
    await game.advanceTurn();
    expect(game.state("page").might).toBe(1);
    expect(game.state("brute").might).toBe(5);
  });
});
