/**
 * Ruling eed2e837a64e98d6 — Convergent Mutation (OGN-108 → ogn-108-298)
 *   "[Reaction] Choose a friendly unit. This turn, increase its Might to the Might of another friendly unit."
 *   × Ravenbloom Student (ogn-103-298) · 2 Might "When you play a spell, give me +1 [Might] this turn."
 *
 * Q: With Convergent Mutation aimed at the Ravenbloom Student, does the Student copy the other unit's
 *    Might first and only then get its own +1?
 * A: Yes. The spell finishes resolving first — that is when it counts as played — and only then does
 *    the Student's "when you play a spell" trigger go on the chain and resolve. So the Might is set,
 *    then raised by 1.
 * Rules: 419.4.a (a card is played when its play completes with resolution), 383.2 (the trigger becomes
 *        a chain item afterwards), 340 (chain items resolve one at a time).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const CONVERGENT_MUTATION = "ogn-108-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";

/** P1: the 2-Might Student plus a 6-Might Colossus to copy from. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 1 } })
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .unit(P1, "base", { might: 6, name: "Colossus" }, "colossus")
    .hand(P1, CONVERGENT_MUTATION, "mutation");
}

describe("Ruling eed2e837a64e98d6 — Convergent Mutation resolves fully, then Ravenbloom Student's spell trigger adds its +1 on top", () => {
  test("baseline: the Student is a 2-Might unit and the Colossus a 6-Might one", async () => {
    const game = await board().build();
    expect(game.state("student").might).toBe(2);
    expect(game.state("colossus").might).toBe(6);
  });

  test("the moment Convergent Mutation finishes resolving the Student is at 6 and its own trigger is only now on the chain", async () => {
    const game = await board().build();
    await game.p1.cast("mutation", { targets: ["student", "colossus"] });
    expect(game.state("student").might).toBe(2); // nothing has resolved yet
    // Resolve just the spell.
    while (game.chain().some((c) => c.cardId === "mutation")) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("mutation")).toBe("trash");
    expect(game.state("student").might).toBe(6); // copied first
    expect(game.chain().map((c) => c.cardId)).toEqual(["student"]); // the +1 trigger, not yet resolved
  });

  test("after the trigger resolves the Student is at 7 — copy first, then +1", async () => {
    const game = await board().build();
    await game.p1.cast("mutation", { targets: ["student", "colossus"] });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("student").might).toBe(7);
    expect(game.state("colossus").might).toBe(6); // the source is untouched
    expect(game.violations()).toEqual([]);
  });

  test("both halves are 'this turn' — the Student is back to 2 next turn", async () => {
    const game = await board().build();
    await game.p1.cast("mutation", { targets: ["student", "colossus"] });
    await game.settle();
    expect(game.state("student").might).toBe(7);
    await game.advanceTurn();
    expect(game.state("student").might).toBe(2);
  });
});
