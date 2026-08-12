/**
 * Ruling 719c8ada539c1401 — Hidden Blade (OGN-213 → ogn-213-298) · Spell · Order · [2][order] · Action · [Hidden]
 *     "Kill a unit at a battlefield. Its controller draws 2."
 *   × Flash (OGS-011 → ogs-011-024) · [2] · Reaction — "Move up to 2 friendly units to base." (stands in for the
 *     legend ability in the question, which likewise saves the unit by sending it back to base)
 *
 * Q: If the targeted unit is sent back to base in response (so it is not killed), does its controller still draw 2?
 * A: Yes. The unit does not have to die for the draw to happen — it is still on the board when Hidden Blade
 *    resolves, so "its controller" is still readable and that player draws 2.
 * Rules: 359.3.e.5 (an instruction whose object is no longer legal does nothing — the REST of the resolution still
 *        happens), 191.1 (controller), 449 (an effect may move the unit out from under the kill).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const FLASH = "ogs-011-024";

/** P1's turn with exactly [2][order] and Hidden Blade; P2 holds bf1 with a 3-Might Runner and has Flash + [2]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Runner" }, "runner")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P2, FLASH, "flash");
}

describe("Ruling 719c8ada539c1401 — Hidden Blade's draw when the target is saved from the kill", () => {
  test("baseline: unanswered, Hidden Blade kills the Runner and its CONTROLLER (P2, not the caster) draws 2", async () => {
    const game = await board().build();
    const hand = game.p2.hand().length;
    const deck = game.p2.deck().length;
    await game.p1.cast("blade", { targets: "runner" });
    await game.settle();
    expect(game.zoneOf("runner")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(hand + 2);
    expect(game.p2.deck()).toHaveLength(deck - 2);
    expect(game.zoneOf("blade")).toBe("trash");
  });

  test("premise: P2 answers with Flash — the Runner is back in base before Hidden Blade resolves, so the kill finds nothing and the unit lives", async () => {
    const game = await board().build();
    await game.p1.cast("blade", { targets: "runner" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "flash")).toBe(true);
    await game.p2.cast("flash", { targets: "runner" });
    await game.settle();
    expect(game.locationOf("runner")).toBe("base");
    expect(game.zoneOf("runner")).toBe("base");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // Engine: the whole resolution is driven off the bound target; once that target stops matching
  // "a unit at a battlefield" BOTH instructions drop, so P2's deck is untouched (0 drawn instead of 2).
  test.failing("BUG: ruling 719c8ada539c1401 — the saved unit's controller must still draw 2; the engine draws 0 because the illegal kill target also cancels the draw", async () => {
    const game = await board().build();
    const deck = game.p2.deck().length;
    await game.p1.cast("blade", { targets: "runner" });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: "runner" });
    await game.settle();
    expect(game.zoneOf("runner")).toBe("base"); // it did not die …
    expect(game.p2.deck()).toHaveLength(deck - 2); // … and it still draws 2
  });
});
