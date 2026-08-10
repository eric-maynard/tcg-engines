/**
 * Ruling f1b573beb02d81b3 — Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · Unit · Mind · [7]+[mind] · 7 Might
 *     "[Accelerate] … When you play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might]."
 *   × Ruin Runner (SFD-105 → sfd-105-221) · Unit · Body · [6] · 5 Might
 *     "I can't be chosen by enemy spells and abilities."
 *
 * Q: Does the Watcher's play effect give Ruin Runner -3?
 * A: Yes. The Watcher does not choose/target — it affects all enemy units — so Ruin Runner's "can't be
 *    chosen" protection is irrelevant. Ruin Runner goes 5 → 2 (min 1). Only units on the board when the
 *    trigger resolves are affected.
 * Rules: 355.6/758 (untargetable only matters for choosing), 359.2 (one-shot on resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WATCHER = "ogn-116-298";
const RUIN_RUNNER = "sfd-105-221";

/** P1's turn with exactly [7]+[mind]. P2: Ruin Runner at bf1, a 1-Might Minnow in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", RUIN_RUNNER, "runner")
    .unit(P2, "base", { might: 1, name: "Minnow" }, "minnow")
    .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
    .hand(P1, WATCHER, "watcher");
}

async function watcherResolved(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("watcher");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "watcher", controller: P1, triggered: true })]);
  // Nobody is asked to choose anything for the Watcher's effect — it does not target.
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.settle();
  expect(game.chain()).toEqual([]);
  return game;
}

describe("Ruling f1b573beb02d81b3 — Watcher's untargeted -3 hits Ruin Runner despite 'can't be chosen'", () => {
  test("Ruin Runner carries its 'can't be chosen by enemy spells and abilities' protection (Untargetable) and starts at 5", async () => {
    const game = await board().build();
    expect(game.state("runner").keywords).toContain("Untargetable");
    expect(game.state("runner").might).toBe(5);
  });

  test("Watcher resolves: Ruin Runner 5 → 2; the 1-Might Minnow stays at 1 (minimum); P1's own Ally untouched", async () => {
    const game = await watcherResolved();
    expect(game.zoneOf("watcher")).toBe("base");
    expect(game.state("runner")).toMatchObject({ might: 2, mightModifier: -3, zone: "battlefield-bf1" });
    expect(game.state("minnow").might).toBe(1);
    expect(game.state("ally").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("this turn only: next turn Ruin Runner is back to 5", async () => {
    const game = await watcherResolved();
    await game.advanceTurn();
    expect(game.state("runner").might).toBe(5);
  });
});
