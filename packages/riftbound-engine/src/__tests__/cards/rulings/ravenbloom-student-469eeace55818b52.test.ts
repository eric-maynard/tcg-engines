/**
 * Ruling 469eeace55818b52 — Ravenbloom Student (OGN-103 → ogn-103-298) · Unit · Mind · 2 · 2 Might
 *   "When you play a spell, give me +1 [Might] this turn."
 *   × Convergent Mutation (OGN-108 → ogn-108-298) · [Reaction] · [2][mind]
 *     "Choose a friendly unit. This turn, increase its Might to the Might of another friendly unit."
 *
 * Q: When the Student is raised by Convergent Mutation, does it end up +1 higher than the copied amount?
 * A: Yes. Convergent Mutation resolves first (Student → the reference Might); the Student's "when you play a
 *    spell" ability triggers only after the spell has fully resolved, then adds +1 on top.
 * Rules: 359.2 / 359.3 (a spell is "played" once it resolves), 383 (triggered abilities go on the chain and
 *        resolve after), LIFO chain resolution.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RAVENBLOOM_STUDENT = "ogn-103-298";
const CONVERGENT_MUTATION = "ogn-108-298";

/** P1's turn: Student (2) and a vanilla 6-Might Big in base; Convergent Mutation in hand with exactly [2][mind]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .unit(P1, "base", { might: 6, name: "Big" }, "big")
    .hand(P1, CONVERGENT_MUTATION, "cm");
}

describe("Ruling 469eeace55818b52 — Convergent Mutation on Ravenbloom Student: copied Might, THEN +1", () => {
  test("cast with [Student, Big]: only the spell is on the chain while it is pending — the Student has not triggered yet and is still 2", async () => {
    const game = await board().build();
    const roles = game.p1.option("cast", "cm")?.fields.find((f) => f.name === "targets")?.roles ?? [];
    expect(roles).toHaveLength(2); // [unit whose Might increases, reference unit]
    await game.p1.cast("cm", { targets: ["student", "big"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cm"]);
    expect(game.state("student").might).toBe(2);
  });

  test("sequence: Convergent Mutation resolves first (Student 2 → 6 = Big's Might); only then does the Student's trigger go on the chain, and it resolves for +1 → 7", async () => {
    const game = await board().build();
    await game.p1.cast("cm", { targets: ["student", "big"] });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Convergent Mutation resolves
    expect(game.zoneOf("cm")).toBe("trash");
    expect(game.state("student").might).toBe(6);
    // Now — after the spell fully resolved — the Student's "when you play a spell" trigger is pending.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "student", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("student").might).toBe(7); // copied 6, plus 1
    expect(game.state("big").might).toBe(6); // the reference unit is unchanged
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("both effects are 'this turn': after the turn passes the Student is back to 2", async () => {
    const game = await board().build();
    await game.p1.cast("cm", { targets: ["student", "big"] });
    await game.settle();
    expect(game.state("student").might).toBe(7);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("student").might).toBe(2);
  });
});
