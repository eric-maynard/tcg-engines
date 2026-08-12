/**
 * Ruling e2cf0a5b3acdf088 — Convergent Mutation (OGN-108 → ogn-108-298) · [Reaction] · Mind · [2][mind]
 *     "Choose a friendly unit. This turn, increase its Might to the Might of another friendly unit."
 *
 * Q: Does Convergent Mutation's effect last until end of turn, or is it permanent?
 * A: Until end of turn — the card was errata'd from a permanent effect. The chosen unit is back to its
 *    own Might once the turn ends.
 * Rules: 477.3.b ("increase to" is one-way, the reference unit is untouched), 317.2 (Expiration Step
 *        removes "this turn" modifiers at the end of the turn).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CONVERGENT_MUTATION = "ogn-108-298";

/** P1's turn. Runt (2 Might) and Titan (6 Might) in P1's base, Convergent Mutation in hand with [2][mind]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 1 } })
    .unit(P1, "base", { might: 2, name: "Runt" }, "runt")
    .unit(P1, "base", { might: 6, name: "Titan" }, "titan")
    .hand(P1, CONVERGENT_MUTATION, "mutation");
}

describe("Ruling e2cf0a5b3acdf088 — Convergent Mutation lasts only until end of turn", () => {
  test("on resolution the Runt is raised to the Titan's 6 Might; the Titan itself is untouched", async () => {
    const game = await board().build();
    await game.p1.cast("mutation", { targets: ["runt", "titan"] });
    await game.settle();
    expect(game.state("runt").might).toBe(6);
    expect(game.state("runt").baseMight).toBe(2); // printed Might is unchanged — this is a modifier
    expect(game.state("titan").might).toBe(6);
    expect(game.zoneOf("mutation")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("ruling: the increase expires with the turn — the Runt is 2 Might again on the opponent's turn", async () => {
    const game = await board().build();
    await game.p1.cast("mutation", { targets: ["runt", "titan"] });
    await game.settle();
    expect(game.state("runt").might).toBe(6);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("runt").might).toBe(2);
    expect(game.state("titan").might).toBe(6);
  });

  test("it is not permanent across two turn changes either — the Runt stays 2 when P1's next turn comes round", async () => {
    const game = await board().build();
    await game.p1.cast("mutation", { targets: ["runt", "titan"] });
    await game.settle();
    await game.advanceTurn(); // → P2's turn
    await game.advanceToTurnOf(P1); // → back round to P1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("runt").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
