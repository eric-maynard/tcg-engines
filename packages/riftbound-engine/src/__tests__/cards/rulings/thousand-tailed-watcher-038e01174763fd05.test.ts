/**
 * Ruling 038e01174763fd05 — Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · Unit · Mind · [7][mind] · 7 Might
 *     "[Accelerate] When you play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: A unit has damage marked on it and the Watcher drops its Might below that damage — does it die despite the
 *    "minimum of 1 Might" clause?
 * A: Yes. Damage is marked separately from Might. 8 Might with 6 damage → −3 → 5 Might; at the Cleanup after the effect,
 *    damage (6) ≥ Might (5) so it dies. "Minimum of 1" only floors the reduction; it is no protection from lethal damage.
 * Rules: 428 / 323 (Cleanup: a unit with damage ≥ its Might dies), 437 (damage is marked, does not lower Might),
 *        Watcher's floor applies to the Might change only.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WATCHER = "ogn-116-298";

/** P1's turn with exactly [7][mind]; Watcher in hand. P2 holds bf1 with the given enemy units. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 8, name: "Bruiser" }, "bruiser", { damage: 6 })
    .unit(P2, "bf1", { might: 8, name: "Scratched" }, "scratched", { damage: 4 })
    .unit(P2, "bf1", { might: 2, name: "Minnow" }, "minnow")
    .hand(P1, WATCHER, "ttw");
}

describe("Ruling 038e01174763fd05 — the Watcher's −3 can drop a damaged unit's Might under its marked damage: it dies", () => {
  test("premise: the Bruiser is an 8-Might unit carrying 6 damage (alive: 6 < 8); damage does not reduce its Might", async () => {
    const game = await board().build();
    expect(game.state("bruiser")).toMatchObject({ damage: 6, might: 8, zone: "battlefield-bf1" });
  });

  test("Watcher played → its trigger resolves: Bruiser 8 → 5 with 6 damage still marked ⇒ dies at the following Cleanup", async () => {
    const game = await board().build();
    await game.p1.play("ttw");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ttw", controller: P1, triggered: true })]);
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1"); // not before the trigger resolves
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.p2.trash()).toContain("bruiser");
    expect(game.violations()).toEqual([]);
  });

  test("same board, the other two show the boundaries: Scratched (8, 4 damage) → 5 Might with 4 damage survives; Minnow (2, undamaged) is floored at 1 Might and survives", async () => {
    const game = await board().build();
    await game.p1.play("ttw");
    await game.settle();
    expect(game.state("scratched")).toMatchObject({ damage: 4, might: 5, zone: "battlefield-bf1" });
    expect(game.state("minnow")).toMatchObject({ damage: 0, might: 1, zone: "battlefield-bf1" }); // "to a minimum of 1"
    expect(game.state("ttw")).toMatchObject({ might: 7, zone: "base" });
  });
});
