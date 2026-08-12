/**
 * Ruling 84133550beb95aa1 — Convergent Mutation (OGN-108 → ogn-108-298) · Spell · Mind · [2][mind] · [Reaction]
 *   "Choose a friendly unit. This turn, increase its Might to the Might of another friendly unit."
 *   × Ravenbloom Student (OGN-103 → ogn-103-298) · 2 Might · "When you play a spell, give me +1 [Might] this turn."
 *
 * Q: Convergent Mutation raises a recruit to match Ravenbloom's Might. Does the recruit end on 2 or 3?
 * A: 2. A spell only counts as PLAYED once it has completely resolved, so the copy is taken from Ravenbloom's
 *    Might before its own "when you play a spell" trigger has given it +1. Only afterwards does Ravenbloom go to 3.
 * Rules: 419.4.a ("when you play a spell" triggers after the spell resolves), 477.3.b ("increase to" is one-way and
 *        reads the reference's Might at resolution), 383 (the trigger is a separate chain item).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const CONVERGENT_MUTATION = "ogn-108-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";

/** P1's turn with exactly [2][mind]; a 1-Might Recruit, the 2-Might Ravenbloom, and (optionally) a 6-Might body. */
function board(withGiant: boolean) {
  const b = scenario()
    .turn(2)
    .active(P1)
    .resources(P1, { energy: 2, power: { mind: 1 } })
    .unit(P1, "base", { might: 1, name: "Recruit" }, "recruit")
    .unit(P1, "base", RAVENBLOOM_STUDENT, "raven")
    .hand(P1, CONVERGENT_MUTATION, "cm");
  return withGiant ? b.unit(P1, "base", { might: 6, name: "Giant" }, "giant") : b;
}

/** Both seats pass priority once — resolves the top chain item. */
async function bothPass(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
}

describe("Ruling 84133550beb95aa1 — the copied Might is read before the spell counts as played", () => {
  test("nothing has triggered while Convergent Mutation is still on the chain — Ravenbloom is a plain 2", async () => {
    const game = await board(false).build();
    await game.p1.cast("cm", { targets: ["recruit", "raven"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cm"]);
    expect(game.state("raven").might).toBe(2);
    expect(game.state("recruit").might).toBe(1);
  });

  test("on resolution the Recruit becomes 2 — Ravenbloom's Might BEFORE its own +1", async () => {
    const game = await board(false).build();
    await game.p1.cast("cm", { targets: ["recruit", "raven"] });
    await bothPass(game);
    expect(game.state("recruit").might).toBe(2);
    expect(game.zoneOf("cm")).toBe("trash");
  });

  test("…and only then does Ravenbloom's 'when you play a spell' trigger take it to 3", async () => {
    const game = await board(false).build();
    await game.p1.cast("cm", { targets: ["recruit", "raven"] });
    await game.settle();
    expect(game.state("raven")).toMatchObject({ baseMight: 2, might: 3, mightModifier: 1 });
    expect(game.state("recruit").might).toBe(2); // "increase to" is one-way, it does not follow
    expect(game.violations()).toEqual([]);
  });

  test("nuance — pointed at a 6-Might unit instead, Ravenbloom rises to 6 and then its own trigger makes it 7", async () => {
    const game = await board(true).build();
    await game.p1.cast("cm", { targets: ["raven", "giant"] });
    await bothPass(game);
    expect(game.state("raven").might).toBe(6);
    await game.settle();
    expect(game.state("raven").might).toBe(7);
    expect(game.state("giant").might).toBe(6); // the reference is untouched
  });
});
